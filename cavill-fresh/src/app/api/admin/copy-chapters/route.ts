import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * POST /api/admin/copy-chapters
 * Body: {
 *   token: SENHA,
 *   sourceConversationId: string,  // de onde copiar
 *   targetUserId: string,          // pra qual usuário criar a nova conversa
 *   newTitle: string               // nome da nova conversa
 * }
 *
 * Cria uma NOVA conversa e copia TODOS os capítulos + resumo fixo da origem.
 * NÃO copia mensagens (a nova conversa começa vazia, só com os capítulos).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { token, sourceConversationId, targetUserId, newTitle } = body as {
    token?: string
    sourceConversationId?: string
    targetUserId?: string
    newTitle?: string
  }

  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cavill-admin-2026'
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  if (!sourceConversationId || !targetUserId || !newTitle) {
    return NextResponse.json(
      { error: 'sourceConversationId, targetUserId e newTitle são obrigatórios' },
      { status: 400 }
    )
  }

  // Verifica usuário destino
  const user = await db.user.findUnique({ where: { id: targetUserId } })
  if (!user) {
    return NextResponse.json({ error: 'USER_NOT_FOUND', targetUserId }, { status: 404 })
  }

  // Busca conversa origem com TUDO
  const source = await db.conversation.findUnique({
    where: { id: sourceConversationId },
    include: {
      chapters: { orderBy: { order: 'asc' } },
      fixedSummary: true,
    },
  })

  if (!source) {
    return NextResponse.json({ error: 'SOURCE_NOT_FOUND' }, { status: 404 })
  }

  console.log(`[admin-copy] Copiando conversa "${source.title}" -> "${newTitle}"`)
  console.log(`[admin-copy] Capítulos: ${source.chapters.length} | Resumo fixo: ${source.fixedSummary ? source.fixedSummary.content.length + ' chars' : 'nenhum'}`)

  // Cria nova conversa
  const newConv = await db.conversation.create({
    data: {
      title: newTitle,
      userId: targetUserId,
    },
  })

  // Copia capítulos
  const chaptersCreated = []
  for (const ch of source.chapters) {
    const newCh = await db.chapter.create({
      data: {
        conversationId: newConv.id,
        title: ch.title,
        content: ch.content,
        keywords: ch.keywords,
        order: ch.order,
      },
    })
    chaptersCreated.push({ id: newCh.id, title: newCh.title, order: newCh.order })
  }

  // Copia resumo fixo
  let fixedSummaryCopied = false
  if (source.fixedSummary && source.fixedSummary.content.trim()) {
    await db.conversationFixedSummary.create({
      data: {
        conversationId: newConv.id,
        content: source.fixedSummary.content,
      },
    })
    fixedSummaryCopied = true
  }

  return NextResponse.json({
    success: true,
    newConversationId: newConv.id,
    newConversationTitle: newConv.title,
    copiedChapters: chaptersCreated.length,
    chapters: chaptersCreated,
    fixedSummaryCopied,
    sourceConversationTitle: source.title,
  })
}

/**
 * GET /api/admin/copy-chapters?token=SENHA
 * Lista usuários (pra saber qual userId usar na cópia)
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cavill-admin-2026'

  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      _count: { select: { conversations: true } },
    },
  })

  return NextResponse.json({ users })
}
