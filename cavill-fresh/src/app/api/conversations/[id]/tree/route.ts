import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getConversationTree } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * GET /api/conversations/[id]/tree
 * Retorna a árvore completa da conversa com a thread ativa destacada
 * e siblings de cada nó (para a UI renderizar as setas ‹ 1/2 ›).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const tree = await getConversationTree(id, user.id)
    return NextResponse.json(tree)
  } catch (err: any) {
    if (err.message === 'CONVERSATION_NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
