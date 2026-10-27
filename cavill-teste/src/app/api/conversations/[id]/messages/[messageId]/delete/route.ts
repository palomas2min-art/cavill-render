import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { deleteMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * POST /api/conversations/[id]/messages/[messageId]/delete
 * Soft-delete: marca isDeleted=true. Nó permanece na árvore.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id, messageId } = await ctx.params
  try {
    await deleteMessage(user.id, id, messageId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
