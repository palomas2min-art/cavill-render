/**
 * Migração: lê o snapshot JSON e reinsere no novo schema (árvore).
 *
 * Estratégia para cada conversa:
 * - Mensagens ordenadas por createdAt
 * - Cada mensagem aponta para a anterior como parentMessageId (árvore linear)
 * - activeLeafId da conversa = última mensagem (não-deletada) daquela sequência
 * - Mensagens com isDeleted=true são criadas com isDeleted=true
 *
 * Sessões de usuário são recriadas para manter o usuário logado.
 * Backups são reimportados para não perder histórico Markdown.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const db = new PrismaClient()

type Snapshot = {
  users: any[]
  sessions: any[]
  conversations: any[]
  messages: {
    id: string
    conversationId: string
    role: string
    content: string
    isDeleted: boolean
    createdAt: string
    updatedAt: string
  }[]
  backups: any[]
}

async function main() {
  const snap: Snapshot = JSON.parse(
    readFileSync('/home/z/my-project/scripts/migration-backup.json', 'utf-8')
  )

  console.log('[import] Recriando usuários...')
  for (const u of snap.users) {
    await db.user.create({
      data: {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: u.passwordHash,
        createdAt: new Date(u.createdAt),
        updatedAt: new Date(u.updatedAt),
      },
    })
  }

  console.log('[import] Recriando sessões...')
  for (const s of snap.sessions) {
    try {
      await db.session.create({
        data: {
          id: s.id,
          sessionToken: s.sessionToken,
          userId: s.userId,
          expires: new Date(s.expires),
        },
      })
    } catch (e) {
      console.log('[import] Sessão não pôde ser recriada:', (e as Error).message)
    }
  }

  console.log('[import] Recriando conversas (sem activeLeafId ainda)...')
  for (const c of snap.conversations) {
    await db.conversation.create({
      data: {
        id: c.id,
        title: c.title,
        userId: c.userId,
        lastActiveAt: new Date(c.lastActiveAt),
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        activeLeafId: null,
      },
    })
  }

  console.log('[import] Recriando mensagens como árvore linear...')
  // Agrupar por conversa, ordenar por createdAt, encadear
  const byConv: Record<string, Snapshot['messages']> = {}
  for (const m of snap.messages) {
    if (!byConv[m.conversationId]) byConv[m.conversationId] = []
    byConv[m.conversationId].push(m)
  }
  for (const cid of Object.keys(byConv)) {
    const list = byConv[cid].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    let prevId: string | null = null
    let lastId: string | null = null
    for (const m of list) {
      await db.message.create({
        data: {
          id: m.id,
          conversationId: cid,
          role: m.role,
          content: m.content,
          parentMessageId: prevId,
          generation: m.role === 'user' ? 'user' : 'regen',
          isDeleted: m.isDeleted,
          createdAt: new Date(m.createdAt),
          updatedAt: new Date(m.updatedAt),
        },
      })
      prevId = m.id
      if (!m.isDeleted) lastId = m.id
    }
    // Seta o activeLeafId da conversa para a última mensagem não-deletada
    if (lastId) {
      await db.conversation.update({ where: { id: cid }, data: { activeLeafId: lastId } })
    }
  }

  console.log('[import] Recriando backups (últimos 50)...')
  for (const b of snap.backups) {
    try {
      await db.backupEntry.create({
        data: {
          id: b.id,
          userId: b.userId,
          conversationId: b.conversationId,
          action: b.action,
          markdown: b.markdown,
          createdAt: new Date(b.createdAt),
        },
      })
    } catch (e) {
      // skip
    }
  }

  console.log('[import] Migração concluída com sucesso!')
  await db.$disconnect()
}

main().catch((e) => {
  console.error('[import] Erro:', e)
  process.exit(1)
})
