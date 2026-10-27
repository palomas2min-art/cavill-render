import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'
import { renameConversation, deleteConversation, sendUserMessage } from '@/lib/messages'

export const runtime = 'nodejs'

/**
 * GET /api/conversations/[id]
 * Retorna a árvore completa (com thread ativa e siblings para UX).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  const conv = await db.conversation.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!conv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // Construir thread ativa + siblings info
  const byId = new Map(conv.messages.map((m) => [m.id, m]))
  const activeThread: string[] = []
  let cur = conv.activeLeafId ? byId.get(conv.activeLeafId) : undefined
  while (cur) {
    activeThread.unshift(cur.id)
    cur = cur.parentMessageId ? byId.get(cur.parentMessageId) : undefined
  }
  const activeThreadSet = new Set(activeThread)

  const siblingsByParent = new Map<string | null, typeof conv.messages>()
  for (const m of conv.messages) {
    const k = m.parentMessageId ?? null
    if (!siblingsByParent.has(k)) siblingsByParent.set(k, [])
    siblingsByParent.get(k)!.push(m)
  }

  const allNodes = conv.messages.map((m) => {
    const siblings = siblingsByParent.get(m.parentMessageId ?? null) ?? []
    const sorted = [...siblings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      parentMessageId: m.parentMessageId,
      isDeleted: m.isDeleted,
      createdAt: m.createdAt,
      generation: m.generation,
      siblings: sorted.map((s) => ({
        id: s.id,
        content: s.content,
        createdAt: s.createdAt,
        isActive: activeThreadSet.has(s.id),
        isDeleted: s.isDeleted,
      })),
      siblingCount: sorted.length,
      indexAmongSiblings: sorted.findIndex((s) => s.id === m.id) + 1,
      isActive: activeThreadSet.has(m.id),
    }
  })

  const threadNodes = activeThread
    .map((id) => allNodes.find((n) => n.id === id))
    .filter(Boolean) as typeof allNodes

  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      activeLeafId: conv.activeLeafId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      thread: threadNodes,
      allNodes,
    },
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { title } = body as { title?: string }
  if (!title) return NextResponse.json({ error: 'title obrigatório' }, { status: 400 })
  const updated = await renameConversation(user.id, id, title)
  return NextResponse.json({ conversation: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  await deleteConversation(user.id, id)
  return NextResponse.json({ ok: true })
}
