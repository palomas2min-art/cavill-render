import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/preferences
 * Retorna a última conversa acessada pelo usuário (do banco, não localStorage).
 * Garante que ao atualizar a página, você volte pra mesma conversa que estava.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  // Pega usuário completo do banco (com lastConversationId)
  const fullUser = await db.user.findUnique({ where: { id: user.id } })
  const lastConvId = fullUser?.lastConversationId

  if (lastConvId) {
    // Verifica se a conversa ainda existe e pertence ao usuário
    const conv = await db.conversation.findFirst({
      where: { id: lastConvId, userId: user.id },
      select: { id: true, title: true },
    })
    if (conv) {
      return NextResponse.json({ lastActiveConversation: conv })
    }
  }

  // Fallback: conversa mais recentemente ativa
  const last = await db.conversation.findFirst({
    where: { userId: user.id },
    orderBy: { lastActiveAt: 'desc' },
    select: { id: true, title: true },
  })
  return NextResponse.json({ lastActiveConversation: last })
}

/**
 * POST /api/preferences
 * body: { lastConversationId: string | null }
 * Salva qual foi a última conversa acessada pelo usuário.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { lastConversationId } = body as { lastConversationId?: string | null }

  await db.user.update({
    where: { id: user.id },
    data: { lastConversationId: lastConversationId ?? null },
  })

  return NextResponse.json({ ok: true })
}
