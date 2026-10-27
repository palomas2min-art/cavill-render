import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { editMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * POST /api/conversations/[id]/messages/[messageId]/edit
 * body: { content: string }
 * Cria um novo ramo: novo nó user (irmão do original) + nova resposta da IA.
 * O original e seus descendentes NÃO são tocados.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id, messageId } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { content } = body as { content?: string }
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'content obrigatório' }, { status: 400 })
  }
  try {
    const result = await editMessage(user.id, id, messageId, content.trim())
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
