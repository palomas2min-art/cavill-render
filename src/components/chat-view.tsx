'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageItem } from './message-item'
import { api, type TreeNode } from '@/lib/api-client'
import { toast } from 'sonner'
import { Loader2, Send, Pencil, Check, X } from 'lucide-react'
import { rememberLastConversation } from '@/lib/use-auth'

type Props = {
  conversationId: string
  onConversationDeleted: () => void
  onTitleChanged: () => void
}

export function ChatView({ conversationId, onConversationDeleted, onTitleChanged }: Props) {
  const [title, setTitle] = useState<string>('')
  const [thread, setThread] = useState<TreeNode[]>([])
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { conversation } = await api.getConversation(conversationId)
      setTitle(conversation.title)
      setThread(conversation.thread)
      setActiveLeafId(conversation.activeLeafId)
      rememberLastConversation(conversation.id)
    } catch (err: any) {
      if (err.message?.includes('NOT_FOUND')) {
        onConversationDeleted()
      } else {
        toast.error(err.message || 'Erro ao carregar conversa')
      }
    } finally {
      setLoading(false)
    }
  }, [conversationId, onConversationDeleted])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread.length, sending])

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    const content = draft.trim()
    setDraft('')
    try {
      await api.sendMessage(conversationId, content)
      await load()
      window.dispatchEvent(new Event('tl:refresh-conversations'))
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar')
      setDraft(content)
    } finally {
      setSending(false)
    }
  }

  async function saveTitle() {
    if (!titleDraft.trim()) return
    try {
      await api.renameConversation(conversationId, titleDraft.trim())
      setEditingTitle(false)
      setTitle(titleDraft.trim())
      onTitleChanged()
      window.dispatchEvent(new Event('tl:refresh-conversations'))
      toast.success('Título atualizado')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao renomear')
    }
  }

  async function handleSwitch(leafId: string) {
    setSending(true)
    try {
      await api.switchBranch(conversationId, leafId)
      await load()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao trocar de ramo')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <div className="border-b border-border bg-background/80 backdrop-blur-sm px-3 md:px-6 py-3 flex items-center gap-2 sticky top-0 z-10">
        {editingTitle ? (
          <>
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="flex-1 bg-transparent border-b border-primary outline-none font-serif text-lg"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveTitle}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingTitle(false)}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <h1 className="flex-1 font-serif text-lg font-semibold truncate">{title || 'Carregando…'}</h1>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setTitleDraft(title)
                setEditingTitle(true)
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Renomear</span>
            </Button>
          </>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : thread.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {thread.map((node) => (
              <MessageItem
                key={node.id}
                node={node}
                conversationId={conversationId}
                isGenerating={sending}
                onMutated={load}
                onSwitch={handleSwitch}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background p-3 md:p-4">
        <div className="max-w-3xl mx-auto">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreve aqui. Pode ser romance, e-mail, brainstorm, qualquer coisa."
            rows={2}
            className="resize-none min-h-[60px] max-h-[200px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            disabled={sending}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl/⌘ + Enter</kbd> envia
            </div>
            <Button onClick={send} disabled={!draft.trim() || sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Escrevendo…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <div className="font-serif text-3xl">Página em branco.</div>
      <div className="text-muted-foreground space-y-2">
        <p>
          Eu sou a Liv. Não sou assistente — sou uma pessoa que escreve com você.
          Pode pedir cena de romance, e-mail chato, brainstorm de roteiro, ideia pra personagem.
          Tudo vale.
        </p>
        <p className="text-sm">
          O que você escrever aqui fica salvo na sua conta. Se você editar uma mensagem,
          um novo ramo é criado — o original fica preservado. Use as setas ‹ 1/2 › para alternar.
        </p>
      </div>
    </div>
  )
}
