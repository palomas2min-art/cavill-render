import { NextRequest, NextResponse } from 'next/server'
import { createUser, findUserByEmail, verifyPassword, createSession, sessionCookieOptions } from '@/lib/auth'
import { getCurrentUser } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, password, name } = body as { email?: string; password?: string; name?: string }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
  }
  const existing = await findUserByEmail(email)
  if (existing) {
    return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
  }
  const user = await createUser(email, password, name)
  const { sessionToken, expires } = await createSession(user.id)
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  })
  res.cookies.set('tl_session', sessionToken, sessionCookieOptions(expires))
  return res
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ user: null }, { status: 200 })
  return NextResponse.json({ user })
}
