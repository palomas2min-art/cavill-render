'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, MessageSquare, Trash2, Pencil, Check, X, Download, LogOut, Menu, BookOpen } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { api, type ConversationSummary } from '@/lib/api-client'
import { toast } from 'sonner'

type Props = {
  userId: string
  userEmail: string
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onLogout: () => void
  // mobile
  open: boolean
  onClose: () => void
}

export function Sidebar({
  userId,
  userEmail,
  activeId,
  onSelect,
  onNew,
  onLogout,
  open,
  onClose,
}: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  async function load() {
    setLoading(true)
    try {
      const { conversations } = await api.listConversations()
      setConversations(conversations)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar conversas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Expõe refresh para o parent via window event
  useEffect(() => {
    function handler() {
      load()
    }
    window.addEventListener('tl:refresh-conversations', handler)
    return () => window.removeEventListener('tl:refresh-conversations', handler)
  }, [])

  function startRename(c: ConversationSummary) {
    setEditingId(c.id)
    setEditTitle(c.title)
  }

  async function commitRename(id: string) {
    if (!editTitle.trim()) {
      setEditingId(null)
      return
    }
    try {
      await api.renameConversation(id, editTitle.trim())
      await load()
      toast.success('Renomeada')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao renomear')
    } finally {
      setEditingId(null)
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteConversation(id)
      if (activeId === id) onNew()
      await load()
      toast.success('Conversa apagada (backup Markdown preservado)')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao apagar')
    }
  }

  function handleSelect(id: string) {
    onSelect(id)
    onClose()
  }

  function handleNew() {
    onNew()
    onClose()
  }

  return (
    <>
      {/* Backdrop no mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed md:relative z-40 md:z-auto top-0 left-0 h-full w-72 max-w-[85vw] shrink-0 border-r border-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold shrink-0">
                  L
                </div>
                <div className="min-w-0">
                  <div className="font-serif font-semibold leading-tight truncate">Tela Literária</div>
                  <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-3">
            <Button onClick={handleNew} className="w-full" variant="default">
              <Plus className="h-4 w-4 mr-2" />
              Nova conversa
            </Button>
          </div>

          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1 pb-2">
              {loading ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  <BookOpen className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  Nenhuma conversa ainda.
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-2 cursor-pointer transition-colors ${
                      activeId === c.id
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/60'
                    }`}
                    onClick={() => editingId === c.id ? undefined : handleSelect(c.id)}
                  >
                    {editingId === c.id ? (
                      <>
                        <Input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(c.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="h-7 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => { e.stopPropagation(); commitRename(c.id) }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                        <div className="flex-1 min-w-0 text-sm truncate">{c.title}</div>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); startRename(c) }}
                            title="Renomear"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 hover:text-destructive"
                                onClick={(e) => e.stopPropagation()}
                                title="Apagar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apagar conversa?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  A conversa e suas mensagens serão removidas do app.
                                  O backup em Markdown completo até o último evento continua disponível em /api/backup.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Não</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => remove(c.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Apagar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-sidebar-border space-y-1">
            <a
              href={api.backupFileURL()}
              download
              className="flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-sidebar-accent/60 transition-colors"
            >
              <Download className="h-4 w-4 opacity-70" />
              Baixar backup Markdown
            </a>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-sidebar-accent/60 transition-colors"
            >
              <LogOut className="h-4 w-4 opacity-70" />
              Sair
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export function MobileTopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-background sticky top-0 z-20">
      <Button variant="ghost" size="icon" onClick={onOpenSidebar} aria-label="Abrir conversas">
        <Menu className="h-5 w-5" />
      </Button>
      <div className="font-serif font-semibold">Tela Literária</div>
    </div>
  )
}
