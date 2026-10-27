import { db } from './db'

/**
 * Gera um snapshot completo em Markdown de TODAS as conversas do usuário,
 * incluindo todos os ramos da árvore de cada conversa.
 * Roda a cada mutação (send / edit / delete / switch / rename).
 */
export async function generateUserMarkdownBackup(userId: string): Promise<string> {
  const conversations = await db.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  const lines: string[] = []
  const now = new Date()
  lines.push(`# Tela Literária — Backup completo`)
  lines.push('')
  lines.push(`- **Usuário:** ${userId}`)
  lines.push(`- **Gerado em:** ${now.toISOString()}`)
  lines.push(`- **Total de conversas:** ${conversations.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const conv of conversations) {
    lines.push(`## ${conv.title}`)
    lines.push('')
    lines.push(`- ID: \`${conv.id}\``)
    lines.push(`- Criada em: ${conv.createdAt.toISOString()}`)
    lines.push(`- Atualizada em: ${conv.updatedAt.toISOString()}`)
    lines.push(`- Ramo ativo (leaf): \`${conv.activeLeafId ?? '—'}\``)
    lines.push('')

    if (conv.messages.length === 0) {
      lines.push('_Sem mensagens._')
      lines.push('')
      continue
    }

    // Agrupar por pai para mostrar árvore
    const byParent = new Map<string | null, typeof conv.messages>()
    for (const m of conv.messages) {
      const k = m.parentMessageId ?? null
      if (!byParent.has(k)) byParent.set(k, [])
      byParent.get(k)!.push(m)
    }

    // Thread ativa (caminho da raiz até activeLeafId)
    const byId = new Map(conv.messages.map((m) => [m.id, m]))
    const activeThread = new Set<string>()
    let cur = conv.activeLeafId ? byId.get(conv.activeLeafId) : undefined
    while (cur) {
      activeThread.add(cur.id)
      cur = cur.parentMessageId ? byId.get(cur.parentMessageId) : undefined
    }

    // Renderiza a árvore recursivamente a partir das raízes
    const roots = byParent.get(null) ?? []
    let depth = 0
    function render(messages: typeof conv.messages, d: number) {
      for (const m of messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        const indent = '  '.repeat(d)
        const roleLabel = m.role === 'user' ? 'Usuário' : m.role === 'assistant' ? 'IA' : 'Sistema'
        const activeMark = activeThread.has(m.id) ? ' *(ativo)*' : ''
        const deletedMark = m.isDeleted ? ' *(removida)*' : ''
        lines.push(`${indent}- **[${roleLabel}]** \`${m.id}\`${activeMark}${deletedMark}`)
        lines.push(`${indent}  - Criada em: ${m.createdAt.toISOString()}`)
        if (m.parentMessageId) lines.push(`${indent}  - Pai: \`${m.parentMessageId}\``)
        lines.push(`${indent}  - Geração: ${m.generation}`)
        lines.push(`${indent}  - Conteúdo:`)
        lines.push(`${indent}    \`\`\`markdown`)
        for (const ln of (m.content || '(vazio)').split('\n')) {
          lines.push(`${indent}    ${ln}`)
        }
        lines.push(`${indent}    \`\`\``)
        const children = byParent.get(m.id) ?? []
        if (children.length > 0) {
          lines.push(`${indent}  - Filhos:`)
          render(children, d + 1)
        }
      }
    }
    render(roots, depth)

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

export async function saveBackup(
  userId: string,
  action: string,
  conversationId: string | null,
  markdown?: string
) {
  const md = markdown ?? (await generateUserMarkdownBackup(userId))
  return db.backupEntry.create({
    data: { userId, conversationId, action, markdown: md },
  })
}

export async function getLatestBackupMarkdown(userId: string): Promise<string | null> {
  const last = await db.backupEntry.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return last?.markdown ?? null
}

export async function listBackups(userId: string, limit = 50) {
  return db.backupEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, action: true, conversationId: true, createdAt: true },
  })
}
