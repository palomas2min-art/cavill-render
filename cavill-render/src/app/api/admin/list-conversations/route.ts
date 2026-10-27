import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/admin/list-conversations?token=SENHA
 * Lista TODAS as conversas com seus capítulos, resumo fixo e mensagens.
 * Endpoint temporário para administração — protegido por senha.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cavill-admin-2026'

  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const conversations = await db.conversation.findMany({
    include: {
      _count: { select: { messages: true, chapters: true } },
      fixedSummary: true,
      chapters: { select: { id: true, title: true, order: true, content: true }, orderBy: { order: 'asc' } },
    },
    orderBy: { lastActiveAt: 'desc' },
  })

  const result = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    lastActiveAt: c.lastActiveAt,
    createdAt: c.createdAt,
    messagesCount: c._count.messages,
    chaptersCount: c._count.chapters,
    hasFixedSummary: !!c.fixedSummary,
    fixedSummaryLength: c.fixedSummary?.content?.length || 0,
    chapters: c.chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      order: ch.order,
      contentLength: ch.content.length,
      preview: ch.content.substring(0, 100) + (ch.content.length > 100 ? '...' : ''),
    })),
  }))

  return NextResponse.json({ total: result.length, conversations: result })
}
