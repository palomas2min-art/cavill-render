import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { restoreVersion } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * POST /api/messages/[id]/restore
 * body: { conversationId: string, versionId: string }
 * Restaura versão anterior criando NOVA versão com o conteúdo antigo.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { conversationId, versionId } = body as { conversationId?: string; versionId?: string }
  if (!conversationId || !versionId) {
    return NextResponse.json({ error: 'conversationId e versionId obrigatórios' }, { status: 400 })
  }
  const result = await restoreVersion(user.id, conversationId, id, versionId)
  return NextResponse.json(result)
}
