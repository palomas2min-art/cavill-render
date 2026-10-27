import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { switchBranch } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * POST /api/conversations/[id]/switch
 * body: { leafId: string }
 * Alterna o ramo ativo da conversa para aquele cuja folha é `leafId`.
 * Não cria nem apaga nada.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { leafId } = body as { leafId?: string }
  if (!leafId) return NextResponse.json({ error: 'leafId obrigatório' }, { status: 400 })
  try {
    await switchBranch(user.id, id, leafId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
