import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmail, verifyPassword, createSession, sessionCookieOptions } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, password } = body as { email?: string; password?: string }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
  }
  const user = await findUserByEmail(email)
  if (!user) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }
  const { sessionToken, expires } = await createSession(user.id)
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  })
  res.cookies.set('tl_session', sessionToken, sessionCookieOptions(expires))
  return res
}
