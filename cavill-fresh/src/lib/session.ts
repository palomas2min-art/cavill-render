import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, getSession, destroySession, sessionCookieOptions } from './auth'
import { db } from './db'

export type CurrentUser = {
  id: string
  email: string
  name: string | null
}

/**
 * Retorna o usuário atual com base no cookie de sessão.
 * Se a sessão foi renovada (slide expiration), retorna também o novo expires
 * para o chamador atualizar o cookie na resposta.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = await getSession(token)
  if (!session) return null
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  }
}

/**
 * Versão que retorna também info de renovação do cookie.
 * Útil para endpoints que retornam JSON — eles podem setar o cookie atualizado.
 */
export async function getCurrentUserWithSession(): Promise<{
  user: CurrentUser | null
  sessionToken: string | null
  renewedExpires: Date | null
}> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = await getSession(token)
  if (!session) return { user: null, sessionToken: null, renewedExpires: null }
  // Se a sessão foi renovada (slide expiration), marca para atualizar cookie
  const renewedRecently =
    session.expires.getTime() > Date.now() + 1000 * 60 * 60 * 24 * 89
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    sessionToken: token ?? null,
    renewedExpires: renewedRecently ? session.expires : null,
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

export async function logoutCurrent() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) await destroySession(token)
}

// Garantia: conversa pertence ao usuário
export async function getOwnedConversation(conversationId: string, userId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, userId },
  })
}
