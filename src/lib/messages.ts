import { db } from './db'
import { saveBackup } from './backup'
import { generateAssistantReply } from './ai'
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
 * Constrói o histórico (para enviar à IA) a partir da thread ativa,
 * até (exclusive) uma mensagem específica — ou até o fim se beforeMessageId não for passado.
 */
async function buildHistoryForAI(
  conversationId: string,
  beforeMessageId?: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const thread = await getActiveThread(conversationId)
  const history: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of thread) {
    if (beforeMessageId && m.id === beforeMessageId) break
    if (m.isDeleted) continue
    if (m.role === 'system') continue
    history.push({ role: m.role as 'user' | 'assistant', content: m.content })
  }
  return history
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
    assistantContent = `(erro ao gerar resposta: ${(err as Error).message})`
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
    assistantContent = `(erro ao gerar resposta: ${(err as Error).message})`
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
