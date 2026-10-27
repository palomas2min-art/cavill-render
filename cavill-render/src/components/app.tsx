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
    api.setLastConversation(null).catch(() => {})
  }, [])

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    rememberLastConversation(id)
    api.setLastConversation(id).catch(() => {})
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
          <h2 className="font-serif text-3xl">Bem-vindo ao Cavill.</h2>
          <p className="text-muted-foreground">
            Sem estrutura, sem formulário. É só você e o Cavill. Pode jogar a primeira frase solta.
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3 bg-card text-left">
          <h3 className="font-serif text-lg font-semibold">📋 Como usar (tour rápido)</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>1. Escreva direto no chat</strong> — Pode pedir cena de romance, e-mail, brainstorm, ideia pra personagem. Tudo vale. Sem filtro, sem censura.</p>
            <p><strong>2. 📚 Capítulos</strong> — Clique no botão "Capítulos" no topo. Cada capítulo é uma parte da sua história que o Cavill SEMPRE vai ler antes de responder. Adicione personagens, eventos, detalhes físicos — ele vai lembrar de tudo.</p>
            <p><strong>3. 📖 Resumo fixo</strong> — Clique em "Resumo fixo" no topo. Cole um resumo da sua história (até 20.000 caracteres). Ele vai usar como cânone absoluto — nunca vai contradizer.</p>
            <p><strong>4. ✏️ Editar mensagem</strong> — Clique em "Editar" em qualquer mensagem sua. Um novo ramo é criado — o original fica preservado. Use as setas ‹ 1/2 › para alternar entre versões.</p>
            <p><strong>5. 🔄 Regenerar</strong> — Não gostou da resposta? Clique em "Regenerar". Ele cria uma nova resposta (a original fica preservada como versão alternativa).</p>
            <p><strong>6. 📋 Copiar</strong> — Clique em "Copiar" em qualquer mensagem pra copiar o texto.</p>
            <p><strong>7. 💾 Backup Markdown</strong> — Clique em "Baixar backup Markdown" na barra lateral pra baixar TODA sua história em formato texto.</p>
            <p><strong>8. 📱 Mobile</strong> — No celular, clique no menu (☰) no topo pra ver suas conversas.</p>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 p-4 space-y-2 bg-primary/5 text-left">
          <h3 className="font-serif text-lg font-semibold">🔒 Suas histórias são suas</h3>
          <p className="text-sm text-muted-foreground">
            Tudo que você escreve fica salvo na SUA conta. Ninguém mais tem acesso.
            Cada conversa é isolada. Cada capítulo é seu. Você pode apagar quando quiser.
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
