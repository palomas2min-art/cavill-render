import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { sendUserMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * POST /api/conversations/[id]/messages
 * body: { content: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { content } = body as { content?: string }
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'content obrigatório' }, { status: 400 })
  }
  try {
    const result = await sendUserMessage(user.id, id, content.trim())
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
