import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { deleteMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * POST /api/messages/[id]/delete
 * body: { conversationId: string }
 * Soft-delete: cria versão __DELETED__. Versão antiga preservada.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { conversationId } = body as { conversationId?: string }
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId obrigatório' }, { status: 400 })
  }
  const result = await deleteMessage(user.id, conversationId, id)
  return NextResponse.json(result)
}
