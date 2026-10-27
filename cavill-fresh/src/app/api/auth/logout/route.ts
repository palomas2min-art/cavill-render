import { NextResponse } from 'next/server'
import { logoutCurrent } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST() {
  await logoutCurrent()
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('tl_session')
  return res
}
