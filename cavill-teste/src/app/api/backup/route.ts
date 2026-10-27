import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { getLatestBackupMarkdown, listBackups } from '@/lib/backup'

export const runtime = 'nodejs'

/**
 * GET /api/backup
 *   ?format=md  -> retorna o markdown do último backup
 *   ?list=true  -> lista metadados dos últimos backups
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const format = req.nextUrl.searchParams.get('format')
  const list = req.nextUrl.searchParams.get('list')

  if (list === 'true') {
    const items = await listBackups(user.id)
    return NextResponse.json({ items })
  }

  const md = await getLatestBackupMarkdown(user.id)
  if (format === 'md') {
    return new NextResponse(md ?? '', {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tela-literaria-backup.md"',
      },
    })
  }
  return NextResponse.json({ markdown: md })
}
