'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, type UserDto } from './api-client'

type AuthState = {
  user: UserDto
  loading: boolean
  refresh: () => Promise<void>
  setUser: (u: UserDto) => void
}

let cachedUser: UserDto = null
let inflight: Promise<void> | null = null

export function useAuth(): AuthState {
  const [user, setUserState] = useState<UserDto>(cachedUser)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const { user: u } = await api.me()
        cachedUser = u
        setUserState(u)
      } catch {
        cachedUser = null
        setUserState(null)
      } finally {
        setLoading(false)
        inflight = null
      }
    })()
    return inflight
  }, [])

  const setUser = useCallback((u: UserDto) => {
    cachedUser = u
    setUserState(u)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { user, loading, refresh, setUser }
}

// Helper para guardar última conversa ativa (pedido #8)
const LAST_CONV_KEY = 'tela-literaria:lastConversationId'

export function rememberLastConversation(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) {
    localStorage.setItem(LAST_CONV_KEY, id)
  } else {
    localStorage.removeItem(LAST_CONV_KEY)
  }
}

export function recallLastConversation(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(LAST_CONV_KEY)
}

export function clearLastConversation() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(LAST_CONV_KEY)
}
