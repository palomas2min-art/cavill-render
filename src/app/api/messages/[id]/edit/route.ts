import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'
import { editMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * PATCH /api/messages/[id]/edit
 * body: { conversationId: string, content: string }
 * Cria nova versão da mensagem. Não apaga versão anterior.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { conversationId, content } = body as { conversationId?: string; content?: string }
  if (!conversationId || !content) {
    return NextResponse.json({ error: 'conversationId e content obrigatórios' }, { status: 400 })
  }
  const result = await editMessage(user.id, conversationId, id, content)
  return NextResponse.json(result)
}
