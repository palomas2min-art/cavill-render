import bcrypt from 'bcryptjs'
import { db } from './db'
import { randomBytes } from 'crypto'

const SALT_ROUNDS = 10
// 90 dias — bem mais longo para o usuário não ser deslogado por inatividade
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 90
// Renovar a sessão (slide expiration) se faltar menos que isso para expirar
const SESSION_RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 30 // 30 dias

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createUser(email: string, password: string, name?: string) {
  const passwordHash = await hashPassword(password)
  return db.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name?.trim() || null,
    },
  })
}

export async function findUserByEmail(email: string) {
  return db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })
}

export async function createSession(userId: string) {
  const sessionToken = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DURATION_MS)
  await db.session.create({
    data: { sessionToken, userId, expires },
  })
  return { sessionToken, expires }
}

/**
 * Busca sessão. Se estiver perto de expirar (mas ainda válida), renova automaticamente
 * (slide expiration) — o usuário não é deslogado por inatividade enquanto usa o site.
 */
export async function getSession(sessionToken: string | undefined | null) {
  if (!sessionToken) return null
  const session = await db.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  })
  if (!session) return null
  if (session.expires.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  // Renova se faltar menos que o threshold para expirar
  const msToExpire = session.expires.getTime() - Date.now()
  if (msToExpire < SESSION_RENEW_THRESHOLD_MS) {
    const newExpires = new Date(Date.now() + SESSION_DURATION_MS)
    try {
      await db.session.update({
        where: { id: session.id },
        data: { expires: newExpires },
      })
      return { ...session, expires: newExpires }
    } catch {
      // ignore
    }
  }
  return session
}

export async function destroySession(sessionToken: string) {
  try {
    await db.session.delete({ where: { sessionToken } })
  } catch {
    // ignore
  }
}

const SESSION_COOKIE = 'tl_session'

/**
 * Opções do cookie — usa expires E maxAge para máxima persistência.
 * Cookie sobrevive a fechar/abrir navegador, reiniciar computador, etc.
 * Só expira quando a sessão no banco expira (90 dias sem uso).
 */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    expires,
    maxAge: Math.floor((expires.getTime() - Date.now()) / 1000),
    secure: process.env.NODE_ENV === 'production',
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
