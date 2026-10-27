import { NextResponse } from 'next/server'
import { getCurrentUserWithSession } from '@/lib/session'
import { sessionCookieOptions } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const { user, sessionToken, renewedExpires } = await getCurrentUserWithSession()
  const res = NextResponse.json({ user })
  // Se a sessão foi renovada, atualiza o cookie com novo expires
  if (user && sessionToken && renewedExpires) {
    res.cookies.set('tl_session', sessionToken, sessionCookieOptions(renewedExpires))
  }
  return res
}
