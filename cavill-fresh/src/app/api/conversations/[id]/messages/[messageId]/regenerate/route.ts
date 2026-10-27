import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { regenerateAssistantMessage } from '@/lib/messages'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutos — tempo pra IA gerar resposta completa sem cortar

/**
 * POST /api/conversations/[id]/messages/[messageId]/regenerate
 * Cria nova resposta da IA (irmã da atual). Original preservado.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id, messageId } = await ctx.params
  try {
    const result = await regenerateAssistantMessage(user.id, id, messageId)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
