import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const MAX_FIXED_SUMMARY_LENGTH = 20000

/**
 * GET /api/conversations/[id]/fixed-summary
 * Retorna o resumo fixo da conversa (ou null se não tiver).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  // Verifica que a conversa pertence ao usuário
  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const fixed = await db.conversationFixedSummary.findUnique({
    where: { conversationId: id },
  })

  return NextResponse.json({
    content: fixed?.content ?? null,
    updatedAt: fixed?.updatedAt ?? null,
  })
}

/**
 * PUT /api/conversations/[id]/fixed-summary
 * body: { content: string }
 * Cria ou atualiza o resumo fixo da conversa.
 * Limite: 20.000 caracteres.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  // Verifica que a conversa pertence ao usuário
  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { content } = body as { content?: string }

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content obrigatório' }, { status: 400 })
  }

  if (content.length > MAX_FIXED_SUMMARY_LENGTH) {
    return NextResponse.json(
      { error: `Resumo fixo muito longo. Máximo: ${MAX_FIXED_SUMMARY_LENGTH} caracteres (você enviou ${content.length}).` },
      { status: 400 }
    )
  }

  // Se o conteúdo for vazio, deleta o resumo fixo (pra limpar)
  if (!content.trim()) {
    await db.conversationFixedSummary.deleteMany({ where: { conversationId: id } })
    return NextResponse.json({ ok: true, content: null })
  }

  const upserted = await db.conversationFixedSummary.upsert({
    where: { conversationId: id },
    create: { conversationId: id, content },
    update: { content, updatedAt: new Date() },
  })

  return NextResponse.json({ ok: true, content: upserted.content, updatedAt: upserted.updatedAt })
}

/**
 * DELETE /api/conversations/[id]/fixed-summary
 * Remove o resumo fixo da conversa.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  await db.conversationFixedSummary.deleteMany({ where: { conversationId: id } })

  return NextResponse.json({ ok: true })
}
