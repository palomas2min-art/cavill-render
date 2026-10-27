import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/messages/[id]/versions?conversationId=...
 * Lista todas as versões preservadas da mensagem.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId obrigatório' }, { status: 400 })
  }
  const msg = await db.message.findFirst({
    where: { id, conversationId },
    include: {
      versions: { orderBy: { versionNum: 'asc' } },
      conversation: { select: { userId: true } },
    },
  })
  if (!msg || msg.conversation.userId !== user.id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  return NextResponse.json({
    messageId: msg.id,
    currentVersionId: msg.currentVersionId,
    versions: msg.versions.map((v) => ({
      id: v.id,
      versionNum: v.versionNum,
      content: v.content,
      createdAt: v.createdAt,
      isCurrent: v.id === msg.currentVersionId,
    })),
  })
}
