import { db } from './db'
import { saveBackup } from './backup'
import { generateAssistantReply } from './ai'
import ZAI from 'z-ai-web-dev-sdk'
import { randomUUID } from 'crypto'

/**
 * Modelo de árvore — estilo DeepSeek/ChatGPT.
 *
 * INVARIANTES:
 * - Cada mensagem tem um parentMessageId (null se for a primeira da conversa).
 * - Edições NUNCA sobrescrevem. Criam um novo nó irmão (mesmo parentMessageId).
 * - Cada conversa tem um activeLeafId — o nó visível no fim da thread ativa.
 * - A thread visível é sempre o caminho da raiz até o activeLeafId.
 * - Alternar entre versões = mudar o activeLeafId (não cria nem apaga nada).
 * - Apagar mensagem = soft delete (isDeleted=true); permanece na árvore.
 */

/**
 * Retorna a thread ativa = caminho da raiz até o activeLeafId da conversa.
 * Em ordem cronológica (raiz primeiro).
 */
export async function getActiveThread(conversationId: string) {
  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')
  if (!conv.activeLeafId) return []

  const allMessages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  })
  const byId = new Map(allMessages.map((m) => [m.id, m]))

  const thread: typeof allMessages = []
  let cur = byId.get(conv.activeLeafId)
  while (cur) {
    thread.unshift(cur)
    cur = cur.parentMessageId ? byId.get(cur.parentMessageId) : undefined
  }
  return thread
}

/**
 * Constrói o histórico para enviar à IA, com sistema de MEMÓRIA INTELIGENTE:
 *
 * 1. Pega a thread ativa completa.
 * 2. Se a thread tiver mais que MAX_RECENT_MESSAGES mensagens:
 *    - As mensagens antigas (antes das últimas MAX_RECENT_MESSAGES) viram um RESUMO
 *    - O resumo é gerado pela própria IA UMA VEZ e cached no banco (tabela ConversationSummary)
 *    - O resumo é regerado quando novas mensagens são adicionadas e o resumo atual
 *      cobre menos que 80% das mensagens antigas.
 * 3. Envia pra IA: [resumo (se houver)] + [últimas MAX_RECENT_MESSAGES mensagens completas]
 *
 * Isso resolve o problema de memória: a IA lembra dos personagens e eventos antigos
 * (via resumo) sem consumir tokens demais (só lê últimas mensagens completas).
 */
const MAX_RECENT_MESSAGES = 50 // últimas mensagens enviadas completas (Nemotron tem 1M contexto)
const MAX_CHARS_PER_MESSAGE = 10000 // truncar mensagens muito longas
const MAX_SUMMARY_LENGTH = 2500 // limite do resumo

async function buildHistoryForAI(
  conversationId: string,
  beforeMessageId?: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const thread = await getActiveThread(conversationId)
  const fullHistory: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of thread) {
    if (beforeMessageId && m.id === beforeMessageId) break
    if (m.isDeleted) continue
    if (m.role === 'system') continue
    let content = m.content
    if (content.length > MAX_CHARS_PER_MESSAGE) {
      content = content.substring(0, MAX_CHARS_PER_MESSAGE) + ' [...]'
    }
    fullHistory.push({ role: m.role as 'user' | 'assistant', content })
  }

  // Busca resumo fixo (definido manualmente pelo usuário, nunca regerado)
  const fixedSummary = await db.conversationFixedSummary.findUnique({
    where: { conversationId },
  })

  // Se tem poucas mensagens e não tem resumo fixo, manda tudo
  if (fullHistory.length <= MAX_RECENT_MESSAGES && !fixedSummary) {
    return fullHistory
  }

  // Tem mais mensagens que o limite ou tem resumo fixo — monta histórico completo
  const recentMessages = fullHistory.slice(-MAX_RECENT_MESSAGES)
  const oldMessages = fullHistory.length > MAX_RECENT_MESSAGES
    ? fullHistory.slice(0, -MAX_RECENT_MESSAGES)
    : []

  // Tenta buscar resumo dinâmico existente (só se tiver mensagens antigas)
  let dynamicSummary: string | null = null
  if (oldMessages.length > 0) {
    dynamicSummary = await getOrCreateSummary(conversationId, oldMessages)
  }

  // Monta histórico final:
  // 1. [resumo fixo] (se existir) — definido pelo usuário, NUNCA muda, é o cânone absoluto
  // 2. [resumo dinâmico] (se existir) — gerado automaticamente
  // 3. [últimas mensagens recentes]
  const history: { role: 'user' | 'assistant'; content: string }[] = []

  if (fixedSummary && fixedSummary.content.trim()) {
    history.push({
      role: 'user',
      content: '[RESUMO FIXO DA HISTÓRIA — definido pela criadora. Use como base absoluta, NUNCA contradiga, é o cânone definitivo]:\n' + fixedSummary.content,
    })
    history.push({
      role: 'assistant',
      content: 'Entendido. Tenho o resumo fixo da história em mente como cânone absoluto. Pode continuar.',
    })
  }

  // Só usa resumo dinâmico se NÃO tem resumo fixo (evita conflito de informações)
  // O resumo fixo é o cânone definitivo escrito pela criadora — não precisa de outro resumo
  if (dynamicSummary && !fixedSummary) {
    history.push({
      role: 'user',
      content: '[RESUMO DINÂMICO DA HISTÓRIA ATÉ AQUI — use como complemento ao resumo fixo]:\n' + dynamicSummary + '\n\n---\n[A partir daqui, mensagens recentes:]',
    })
    history.push({
      role: 'assistant',
      content: 'Entendido. Tenho o contexto completo. Pode continuar.',
    })
  }

  // Busca capítulos relevantes (RAG) com base na última mensagem do usuário
  // Pega a última mensagem do usuário nas recentMessages pra usar como query
  const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === 'user')
  if (lastUserMsg) {
    const relevantChapters = await getRelevantChapters(conversationId, lastUserMsg.content)
    if (relevantChapters.length > 0) {
      const chaptersText = relevantChapters
        .map((c, i) => `[CAPÍTULO ${i + 1}: ${c.title}]\n${c.content}`)
        .join('\n\n---\n\n')
      history.unshift({
        role: 'user',
        content: '[CAPÍTULOS RELEVANTES DA HISTÓRIA — leia e use como contexto absoluto, é o cânone]:\n\n' + chaptersText,
      })
      history.unshift({
        role: 'assistant',
        content: 'Entendido. Tenho os capítulos relevantes em mente como cânone absoluto. Pode continuar.',
      })
    }
  }

  history.push(...recentMessages)
  return history
}

/**
 * Busca os capítulos mais relevantes pra uma mensagem do usuário.
 * Usa um algoritmo simples de similaridade por palavras-chave + contagem de palavras.
 * Retorna os top N capítulos mais relevantes (default 5).
 *
 * Como funciona:
 * 1. Pega a mensagem do usuário e extrai as palavras importantes (ignora stopwords)
 * 2. Pra cada capítulo, conta quantas dessas palavras aparecem no conteúdo + keywords
 * 3. Retorna os capítulos com maior pontuação
 */
async function getRelevantChapters(
  conversationId: string,
  userMessage: string,
  maxChapters: number = 5
): Promise<{ id: string; title: string; content: string; keywords: string }[]> {
  const chapters = await db.chapter.findMany({
    where: { conversationId },
    orderBy: { order: 'asc' },
  })

  // Retorna TODOS os capítulos — a criadora quer que a IA lembre de tudo
  // O Nemotron tem 1 milhão de tokens de contexto, cabe tudo
  return chapters
}

/**
 * Busca resumo existente da conversa ou cria um novo.
 * O resumo é cached no banco (ConversationSummary) e regerado quando novas mensagens
 * antigas aparecem (ou seja, quando o resumo atual não cobre todas as mensagens antigas).
 */
async function getOrCreateSummary(
  conversationId: string,
  oldMessages: { role: 'user' | 'assistant'; content: string }[]
): Promise<string | null> {
  if (oldMessages.length === 0) return null

  // Busca resumo existente
  const existing = await db.conversationSummary.findUnique({
    where: { conversationId },
  })

  // Conta quantas mensagens antigas existem
  const oldMessagesCount = oldMessages.length

  // Se tem resumo e ele cobre pelo menos 80% das mensagens antigas, usa ele
  if (existing && existing.coveredMessagesCount >= Math.floor(oldMessagesCount * 0.8)) {
    return existing.summary
  }

  // Precisa gerar (ou regerar) o resumo
  // Pega o resumo anterior + novas mensagens antigas pra incluir no resumo novo
  const previousSummary = existing?.summary || ''
  const newMessagesToSummarize = existing
    ? oldMessages.slice(existing.coveredMessagesCount)
    : oldMessages

  if (newMessagesToSummarize.length === 0 && previousSummary) {
    return previousSummary
  }

  // Gera resumo novo
  const newSummary = await generateConversationSummary(
    previousSummary,
    newMessagesToSummarize
  )

  if (!newSummary) return previousSummary

  // Salva/atualiza no banco
  await db.conversationSummary.upsert({
    where: { conversationId },
    create: {
      conversationId,
      summary: newSummary,
      coveredMessagesCount: oldMessagesCount,
    },
    update: {
      summary: newSummary,
      coveredMessagesCount: oldMessagesCount,
      updatedAt: new Date(),
    },
  })

  return newSummary
}

/**
 * Pede pra IA gerar um resumo da história.
 * Inclui o resumo anterior (se houver) + novas mensagens a serem resumidas.
 */
async function generateConversationSummary(
  previousSummary: string,
  newMessages: { role: 'user' | 'assistant'; content: string }[]
): Promise<string | null> {
  // Constrói as mensagens pra IA resumir
  const messages = []

  const systemPrompt = `Você é uma assistente que resume histórias de ficção. Sua tarefa é manter um resumo atualizado da história, preservando TODOS os elementos importantes:

- Personagens (nome, idade, aparência, personalidade, motivação)
- Relações entre personagens (quem ama quem, quem é inimigo de quem, quem traiu quem)
- Eventos importantes (o que aconteceu, em ordem)
- Cenários (onde aconteceu, onde os personagens estão agora)
- Arcos de personagem (mudanças importantes)
- Temas (romance proibido, conflito moral, etc)
- Detalhes sensoriais importantes (cheiros, objetos, marcas)
- Frases ou falas marcantes que podem ser referenciadas depois

REGRAS:
- Seja CONCISO mas COMPLETO. Não perca informações importantes.
- Use marcadores (•) pra organizar.
- Máximo ${MAX_SUMMARY_LENGTH} caracteres.
- Escreva em português.
- Se já existe um resumo anterior, integre as novas informações nele.
- NUNCA invente informações que não estão nas mensagens.`

  messages.push({ role: 'system', content: systemPrompt })

  let userContent = ''
  if (previousSummary) {
    userContent += 'RESUMO ATUAL DA HISTÓRIA (atualize com as novas mensagens abaixo):\n\n' + previousSummary + '\n\n---\nNOVAS MENSAGENS PARA INTEGRAR AO RESUMO:\n\n'
  } else {
    userContent += 'MENSAGENS DA CONVERSA PARA RESUMIR:\n\n'
  }

  for (const m of newMessages) {
    const role = m.role === 'user' ? 'USUÁRIO' : 'LIV'
    // Trunca cada mensagem pra não estourar contexto
    const truncated = m.content.length > 2000
      ? m.content.substring(0, 2000) + ' [...]'
      : m.content
    userContent += `[${role}]: ${truncated}

`
  }

  userContent += '\nGere o resumo atualizado (máximo ' + MAX_SUMMARY_LENGTH + ' caracteres). Mantenha TODOS os elementos importantes do resumo anterior (se houver) e adicione os novos.'

  messages.push({ role: 'user', content: userContent })

  // Chama IA
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages,
    })
    const summary = completion?.choices?.[0]?.message?.content
    if (!summary) return null
    // Trunca se passar do limite
    return summary.length > MAX_SUMMARY_LENGTH
      ? summary.substring(0, MAX_SUMMARY_LENGTH)
      : summary
  } catch (err) {
    console.error('Erro ao gerar resumo:', err)
    return null
  }
}

/**
 * Envia mensagem do usuário:
 * 1. Cria nó user cujo pai é o activeLeafId atual (ou null se conversa vazia)
 * 2. Gera resposta da IA com o histórico até ali
 * 3. Cria nó assistant cujo pai é o nó user
 * 4. Atualiza activeLeafId para o nó assistant
 */
export async function sendUserMessage(userId: string, conversationId: string, content: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')

  const parentId = conv.activeLeafId // pode ser null

  // 1. Cria nó do usuário
  const userMsg = await db.message.create({
    data: {
      conversationId,
      role: 'user',
      content,
      parentMessageId: parentId,
      generation: 'user',
    },
  })

  // 1.5 Atualiza activeLeafId para o userMsg ANTES de gerar a resposta,
  // para que buildHistoryForAI inclua a nova mensagem do usuário.
  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: userMsg.id },
  })

  // 2. Gera resposta
  const history = await buildHistoryForAI(conversationId)
  let assistantContent: string
  try {
    assistantContent = await generateAssistantReply(history)
  } catch (err) {
    const errMsg = (err as Error).message || ''
    if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
      assistantContent = `_A Z.ai me bloqueou por rate limit (você mandou mensagens rápido demais). Espera uns 30 segundos e manda de novo, ou regenera esta resposta. Detalhe técnico: ${errMsg}_`
    } else if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503')) {
      assistantContent = `_A Z.ai deu uma tropeçada (erro de servidor). Tenta de novo em alguns segundos. Detalhe: ${errMsg}_`
    } else {
      assistantContent = `_Deu erro aqui. Tenta regenerar a resposta. Detalhe: ${errMsg}_`
    }
  }

  // 3. Cria nó assistant (filho do userMsg)
  const assistantMsg = await db.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: assistantContent,
      parentMessageId: userMsg.id,
      generation: 'regen',
    },
  })

  // 4. Atualiza activeLeafId
  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: assistantMsg.id, lastActiveAt: new Date() },
  })

  await saveBackup(userId, 'send', conversationId)

  return {
    userMessage: { id: userMsg.id },
    assistantMessage: { id: assistantMsg.id, content: assistantContent },
  }
}

/**
 * Edita uma mensagem do usuário criando um novo nó IRMÃO (mesmo parentMessageId).
 *
 * Passos:
 * 1. Acha a mensagem original. Deve ser do usuário. Não pode ser isDeleted.
 * 2. Cria novo nó user com o NOVO conteúdo, mesmo parentMessageId do original.
 * 3. Gera nova resposta da IA com histórico até o pai + o novo conteúdo.
 * 4. Cria novo nó assistant filho do novo user.
 * 5. Atualiza activeLeafId para o novo assistant.
 *
 * Importante: o nó original e seus descendentes NÃO são tocados.
 * Continuam acessíveis via alternância de ramo.
 */
export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  newContent: string
) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')

  const original = await db.message.findFirst({
    where: { id: messageId, conversationId },
  })
  if (!original) throw new Error('MESSAGE_NOT_FOUND')
  if (original.role !== 'user') throw new Error('ONLY_USER_MESSAGES_CAN_BE_EDITED')
  if (original.isDeleted) throw new Error('CANNOT_EDIT_DELETED_MESSAGE')

  const parentId = original.parentMessageId // pai da original = pai do novo irmão

  // 1. Cria novo nó user (irmão do original)
  const newUserMsg = await db.message.create({
    data: {
      conversationId,
      role: 'user',
      content: newContent,
      parentMessageId: parentId,
      generation: 'edit',
    },
  })

  // 2. Atualiza activeLeafId temporariamente para o novo userMsg,
  // para que buildHistoryForAI use o novo ramo.
  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: newUserMsg.id },
  })

  // 3. Gera resposta
  const history = await buildHistoryForAI(conversationId)
  let assistantContent: string
  try {
    assistantContent = await generateAssistantReply(history)
  } catch (err) {
    const errMsg = (err as Error).message || ''
    if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
      assistantContent = `_A Z.ai me bloqueou por rate limit (você mandou mensagens rápido demais). Espera uns 30 segundos e manda de novo, ou regenera esta resposta. Detalhe técnico: ${errMsg}_`
    } else if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503')) {
      assistantContent = `_A Z.ai deu uma tropeçada (erro de servidor). Tenta de novo em alguns segundos. Detalhe: ${errMsg}_`
    } else {
      assistantContent = `_Deu erro aqui. Tenta regenerar a resposta. Detalhe: ${errMsg}_`
    }
  }

  // 4. Cria nó assistant filho do novo userMsg
  const newAssistantMsg = await db.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: assistantContent,
      parentMessageId: newUserMsg.id,
      generation: 'regen',
    },
  })

  // 5. Atualiza activeLeafId
  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: newAssistantMsg.id, lastActiveAt: new Date() },
  })

  await saveBackup(userId, 'edit', conversationId)

  return {
    newUserMessage: { id: newUserMsg.id },
    newAssistantMessage: { id: newAssistantMsg.id, content: assistantContent },
  }
}

/**
 * "Apaga" uma mensagem = soft delete (isDeleted=true).
 * Não remove o nó nem seus descendentes. Só marca.
 * Se for mensagem do usuário, não regeneramos nada — o usuário só some do chat.
 */
export async function deleteMessage(userId: string, conversationId: string, messageId: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')
  const msg = await db.message.findFirst({ where: { id: messageId, conversationId } })
  if (!msg) throw new Error('MESSAGE_NOT_FOUND')

  await db.message.update({
    where: { id: messageId },
    data: { isDeleted: true, updatedAt: new Date() },
  })

  await saveBackup(userId, 'delete', conversationId)
  return { ok: true }
}

/**
 * Alterna para um ramo: muda o activeLeafId da conversa.
 * Não cria nem apaga nada. É só uma troca de visualização.
 *
 * Recebe o ID de qualquer nó da conversa. Se o nó tem filhos, descemos
 * pelo "filho preferido" (o último ativo, ou o último criado) até achar
 * a folha. Se não tem filhos, o próprio nó é a folha.
 *
 * Isso permite que o frontend clique num sibling do meio da thread
 * e o backend calcule qual é a folha correspondente àquele ramo.
 */
export async function switchBranch(userId: string, conversationId: string, nodeId: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')

  const node = await db.message.findFirst({
    where: { id: nodeId, conversationId },
  })
  if (!node) throw new Error('MESSAGE_NOT_FOUND')

  // Acha a folha: desce pela árvore pegando o último filho (ou o filho ativo, se houver)
  const allMessages = await db.message.findMany({ where: { conversationId } })
  const childrenByParent = new Map<string, typeof allMessages>()
  for (const m of allMessages) {
    if (!m.parentMessageId) continue
    if (!childrenByParent.has(m.parentMessageId)) childrenByParent.set(m.parentMessageId, [])
    childrenByParent.get(m.parentMessageId!)!.push(m)
  }

  let leaf = node
  while (true) {
    const children = (childrenByParent.get(leaf.id) ?? [])
      .filter((c) => !c.isDeleted)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // último primeiro
    if (children.length === 0) break
    leaf = children[0]
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: leaf.id, lastActiveAt: new Date() },
  })

  await saveBackup(userId, 'switch', conversationId)
  return { ok: true, activeLeafId: leaf.id }
}

/**
 * Retorna a árvore completa da conversa — todas as mensagens com seus parentMessageId.
 * O frontend usa isso para renderizar a thread ativa + setas de versão.
 *
 * Inclui siblings de cada nó (irmãos com mesmo parentMessageId) para a UI
 * saber quantas "versões" existem naquela posição e qual é a ativa.
 */
export async function getConversationTree(conversationId: string, userId: string) {
  const conv = await db.conversation.findFirst({
    where: { id: conversationId, userId },
  })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')

  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  })

  // Map id -> message
  const byId = new Map(messages.map((m) => [m.id, m]))

  // Thread ativa: caminho da raiz até activeLeafId
  const activeThread: string[] = []
  let cur = conv.activeLeafId ? byId.get(conv.activeLeafId) : undefined
  while (cur) {
    activeThread.unshift(cur.id)
    cur = cur.parentMessageId ? byId.get(cur.parentMessageId) : undefined
  }
  const activeThreadSet = new Set(activeThread)

  // Para cada mensagem, calcula siblings (mesmo parentMessageId) e qual é o índice do ativo
  // Agrupar por parentMessageId
  const siblingsByParent = new Map<string | null, typeof messages>()
  for (const m of messages) {
    const key = m.parentMessageId ?? null
    if (!siblingsByParent.has(key)) siblingsByParent.set(key, [])
    siblingsByParent.get(key)!.push(m)
  }

  // Para cada nó, retorna info útil para a UI
  const nodes = messages.map((m) => {
    const siblings = siblingsByParent.get(m.parentMessageId ?? null) ?? []
    // Quantos irmãos (incluindo ele mesmo) — quantas "versões" existem nesta posição
    const siblingCount = siblings.length
    // Qual o índice deste nó entre os irmãos (1-indexed, por createdAt)
    const sortedSiblings = [...siblings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const indexAmongSiblings = sortedSiblings.findIndex((s) => s.id === m.id) + 1
    // Este nó é o "ativo" nesta posição? (está na thread ativa)
    const isActive = activeThreadSet.has(m.id)
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      parentMessageId: m.parentMessageId,
      isDeleted: m.isDeleted,
      createdAt: m.createdAt,
      generation: m.generation,
      siblings: sortedSiblings.map((s) => ({
        id: s.id,
        content: s.content,
        createdAt: s.createdAt,
        isActive: activeThreadSet.has(s.id),
        isDeleted: s.isDeleted,
      })),
      siblingCount,
      indexAmongSiblings,
      isActive,
    }
  })

  // Retorna só a thread ativa (em ordem), mas cada nó traz info sobre siblings
  const threadNodes = activeThread
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean) as typeof nodes

  return {
    conversationId,
    activeLeafId: conv.activeLeafId,
    thread: threadNodes,
    allNodes: nodes,
  }
}

/**
 * Regenera a resposta da IA a uma mensagem do usuário.
 * Cria um novo nó assistant IRMÃO do assistant atual (mesmo pai = a mensagem do usuário).
 * Não apaga o assistant anterior — ele fica como ramo alternativo.
 *
 * Use case: o usuário mandou msg, IA respondeu, mas ele não gostou. Clica em "Regenerar"
 * e a IA cria uma nova resposta no mesmo ponto. Pode alternar entre as respostas com as setas.
 */
export async function regenerateAssistantMessage(
  userId: string,
  conversationId: string,
  assistantMessageId: string
) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')

  const oldAssistant = await db.message.findFirst({
    where: { id: assistantMessageId, conversationId, role: 'assistant' },
  })
  if (!oldAssistant) throw new Error('MESSAGE_NOT_FOUND')
  if (!oldAssistant.parentMessageId) throw new Error('ASSISTANT_HAS_NO_PARENT')

  const parentId = oldAssistant.parentMessageId // é a mensagem do usuário

  // Temporariamente seta o activeLeafId para o pai (a msg do usuário)
  // para que buildHistoryForAI inclua só até o pai, sem o assistant antigo
  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: parentId },
  })

  // Gera nova resposta
  const history = await buildHistoryForAI(conversationId)
  let newContent: string
  try {
    newContent = await generateAssistantReply(history)
  } catch (err) {
    // Restaura o activeLeafId anterior em caso de erro
    await db.conversation.update({
      where: { id: conversationId },
      data: { activeLeafId: oldAssistant.id },
    })
    throw new Error(`Erro ao regenerar: ${(err as Error).message}`)
  }

  // Cria novo nó assistant irmão do antigo
  const newAssistant = await db.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: newContent,
      parentMessageId: parentId,
      generation: 'regen',
    },
  })

  // Atualiza activeLeafId para o novo assistant
  await db.conversation.update({
    where: { id: conversationId },
    data: { activeLeafId: newAssistant.id, lastActiveAt: new Date() },
  })

  await saveBackup(userId, 'regenerate', conversationId)

  return {
    newAssistantMessage: { id: newAssistant.id, content: newContent },
  }
}

export async function renameConversation(userId: string, conversationId: string, newTitle: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')
  const updated = await db.conversation.update({
    where: { id: conversationId },
    data: { title: newTitle.trim() || conv.title, updatedAt: new Date() },
  })
  await saveBackup(userId, 'rename', conversationId)
  return updated
}

export async function deleteConversation(userId: string, conversationId: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')
  await saveBackup(userId, 'delete-conversation', conversationId)
  await db.conversation.delete({ where: { id: conversationId } })
  return { ok: true }
}
