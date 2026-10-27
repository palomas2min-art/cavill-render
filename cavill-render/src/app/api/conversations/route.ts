import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'
import { ensureConversation, sendUserMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * GET /api/conversations — lista conversas do usuário (apenas metadados)
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const conversations = await db.conversation.findMany({
    where: { userId: user.id },
    orderBy: { lastActiveAt: 'desc' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      lastActiveAt: true,
      _count: { select: { messages: true } },
    },
  })
  return NextResponse.json({ conversations })
}

/**
 * POST /api/conversations
 * body: { title?, message? }
 *  - Se message for fornecido, cria conversa + envia primeira mensagem + gera resposta
 *  - Caso contrário, apenas cria conversa vazia
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { title, message } = body as { title?: string; message?: string }

  const conv = await db.conversation.create({
    data: { userId: user.id, title: title?.trim() || 'Nova conversa' },
  })

  let firstExchange = null
  if (message && message.trim()) {
    firstExchange = await sendUserMessage(user.id, conv.id, message.trim())
  }

  return NextResponse.json({ conversation: conv, firstExchange })
}
