import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const MAX_CHAPTER_CONTENT = 25000
const MAX_CHAPTER_TITLE = 200

/**
 * PATCH /api/conversations/[id]/chapters/[chapterId]
 * body: { title?, content?, keywords? }
 * Atualiza um capítulo existente.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; chapterId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id, chapterId } = await ctx.params

  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const existing = await db.chapter.findFirst({
    where: { id: chapterId, conversationId: id },
  })
  if (!existing) return NextResponse.json({ error: 'CHAPTER_NOT_FOUND' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { title, content, keywords } = body as {
    title?: string
    content?: string
    keywords?: string
  }

  const data: any = {}
  if (title !== undefined) {
    if (!title.trim()) return NextResponse.json({ error: 'title não pode ser vazio' }, { status: 400 })
    if (title.length > MAX_CHAPTER_TITLE) {
      return NextResponse.json({ error: `Título muito longo. Máximo: ${MAX_CHAPTER_TITLE}.` }, { status: 400 })
    }
    data.title = title.trim()
  }
  if (content !== undefined) {
    if (!content.trim()) return NextResponse.json({ error: 'content não pode ser vazio' }, { status: 400 })
    if (content.length > MAX_CHAPTER_CONTENT) {
      return NextResponse.json(
        { error: `Conteúdo muito longo. Máximo: ${MAX_CHAPTER_CONTENT} (você enviou ${content.length}).` },
        { status: 400 }
      )
    }
    data.content = content
  }
  if (keywords !== undefined) {
    data.keywords = keywords.trim()
  }

  const updated = await db.chapter.update({
    where: { id: chapterId },
    data,
  })

  return NextResponse.json({ chapter: updated })
}

/**
 * DELETE /api/conversations/[id]/chapters/[chapterId]
 * Remove um capítulo.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; chapterId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id, chapterId } = await ctx.params

  const conv = await db.conversation.findFirst({ where: { id, userId: user.id } })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  await db.chapter.deleteMany({ where: { id: chapterId, conversationId: id } })

  return NextResponse.json({ ok: true })
}
