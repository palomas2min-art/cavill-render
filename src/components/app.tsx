'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth, recallLastConversation, rememberLastConversation } from '@/lib/use-auth'
import { api } from '@/lib/api-client'
import { AuthScreen } from './auth-screen'
import { Sidebar, MobileTopBar } from './sidebar'
import { ChatView } from './chat-view'
import { Loader2 } from 'lucide-react'

export function App() {
  const { user, loading, setUser, refresh } = useAuth()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [booted, setBooted] = useState(false)

  // Pedido #8: ao montar, restaurar a última conversa ativa
  useEffect(() => {
    if (!user) return
    const remembered = recallLastConversation()
    if (remembered) {
      // Verifica se ainda existe
      api.getConversation(remembered).then(() => {
        setActiveId(remembered)
        setBooted(true)
      }).catch(() => {
        rememberLastConversation(null)
        // Tenta última conversa pelo backend
        api.lastActiveConversation().then(({ lastActiveConversation }) => {
          setActiveId(lastActiveConversation?.id ?? null)
          setBooted(true)
        }).catch(() => setBooted(true))
      })
    } else {
      api.lastActiveConversation().then(({ lastActiveConversation }) => {
        setActiveId(lastActiveConversation?.id ?? null)
        setBooted(true)
      }).catch(() => setBooted(true))
    }
  }, [user])

  const handleNew = useCallback(() => {
    setActiveId(null)
    rememberLastConversation(null)
  }, [])

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    rememberLastConversation(id)
  }, [])

  const handleLogout = useCallback(async () => {
    await api.logout()
    setUser(null)
    setActiveId(null)
    rememberLastConversation(null)
    refresh()
  }, [setUser, refresh])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onAuthed={(u) => setUser(u)} />
  }

  return (
    <div className="h-screen flex flex-col">
      <MobileTopBar onOpenSidebar={() => setSidebarOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          userId={user.id}
          userEmail={user.email}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onLogout={handleLogout}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 flex flex-col">
          {booted ? (
            activeId ? (
              <ChatView
                key={activeId}
                conversationId={activeId}
                onConversationDeleted={handleNew}
                onTitleChanged={() => {}}
              />
            ) : (
              <NewConversation onCreated={handleSelect} />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function NewConversation({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [creating, setCreating] = useState(false)

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const { conversation } = await api.createConversation(
        title.trim() || 'Nova conversa',
        firstMessage.trim() || undefined
      )
      window.dispatchEvent(new Event('tl:refresh-conversations'))
      onCreated(conversation.id)
    } catch (err: any) {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        <div className="text-center space-y-2">
          <h2 className="font-serif text-3xl">Começa uma conversa nova.</h2>
          <p className="text-muted-foreground">
            Sem estrutura, sem formulário. É só você e a Liv. Pode jogar a primeira frase solta.
          </p>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (opcional — fica à esquerda)"
          className="w-full bg-transparent border-b border-border py-2 px-1 font-serif text-lg outline-none focus:border-primary"
        />
        <textarea
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value)}
          placeholder="Primeira mensagem…"
          rows={6}
          className="w-full bg-card border border-border rounded-md p-3 outline-none focus:border-primary resize-y"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              create()
            }
          }}
        />
        <div className="flex justify-end">
          <button
            onClick={create}
            disabled={creating}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Criando…' : 'Começar'}
          </button>
        </div>
      </div>
    </div>
  )
}
