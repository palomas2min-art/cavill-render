import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const MAX_CHAPTER_CONTENT = 25000 // 25K chars por capitulo (cabe uma parte inteira de 800-1500 palavras)
const MAX_CHAPTER_TITLE = 200

/**
 * GET /api/conversations/[id]/chapters
 * Lista todos os capítulos da conversa (em ordem).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const chapters = await db.chapter.findMany({
    where: { conversationId: id },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      content: true,
      keywords: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ chapters })
}

/**
 * POST /api/conversations/[id]/chapters
 * body: { title, content, keywords? }
 * Cria um novo capítulo.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { title, content, keywords } = body as {
    title?: string
    content?: string
    keywords?: string
  }

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'title obrigatório' }, { status: 400 })
  }
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'content obrigatório' }, { status: 400 })
  }
  if (title.length > MAX_CHAPTER_TITLE) {
    return NextResponse.json(
      { error: `Título muito longo. Máximo: ${MAX_CHAPTER_TITLE} caracteres.` },
      { status: 400 }
    )
  }
  if (content.length > MAX_CHAPTER_CONTENT) {
    return NextResponse.json(
      { error: `Conteúdo muito longo. Máximo: ${MAX_CHAPTER_CONTENT} caracteres (você enviou ${content.length}).` },
      { status: 400 }
    )
  }

  // Pega o próximo order
  const lastChapter = await db.chapter.findFirst({
    where: { conversationId: id },
    orderBy: { order: 'desc' },
  })
  const nextOrder = (lastChapter?.order ?? 0) + 1

  const chapter = await db.chapter.create({
    data: {
      conversationId: id,
      title: title.trim(),
      content,
      keywords: keywords?.trim() || '',
      order: nextOrder,
    },
  })

  return NextResponse.json({ chapter })
}
