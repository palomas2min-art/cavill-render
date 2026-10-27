'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageItem } from './message-item'
import { api, type TreeNode, type Chapter } from '@/lib/api-client'
import { toast } from 'sonner'
import { Loader2, Send, Pencil, Check, X, ArrowDown, BookText, Library, Plus, Trash2, Edit3 } from 'lucide-react'
import { rememberLastConversation } from '@/lib/use-auth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

type Props = {
  conversationId: string
  onConversationDeleted: () => void
  onTitleChanged: () => void
}

export function ChatView({ conversationId, onConversationDeleted, onTitleChanged }: Props) {
  const [title, setTitle] = useState<string>('')
  const [thread, setThread] = useState<TreeNode[]>([])
  const [threadTruncated, setThreadTruncated] = useState(false)
  const [threadTotalCount, setThreadTotalCount] = useState(0)
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [justLoaded, setJustLoaded] = useState(false)
  // Estado do resumo fixo
  const [fixedSummaryOpen, setFixedSummaryOpen] = useState(false)
  const [fixedSummaryDraft, setFixedSummaryDraft] = useState('')
  const [fixedSummaryExists, setFixedSummaryExists] = useState(false)
  const [savingFixedSummary, setSavingFixedSummary] = useState(false)
  // Estado dos capítulos
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chaptersCount, setChaptersCount] = useState(0)
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterContent, setChapterContent] = useState('')
  const [chapterKeywords, setChapterKeywords] = useState('')
  const [savingChapter, setSavingChapter] = useState(false)
  const [showChapterForm, setShowChapterForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { conversation } = await api.getConversation(conversationId)
      setTitle(conversation.title)
      setThread(conversation.thread)
      setActiveLeafId(conversation.activeLeafId)
      setThreadTruncated(!!(conversation as any).threadTruncated)
      setThreadTotalCount((conversation as any).threadTotalCount ?? conversation.thread.length)
      rememberLastConversation(conversation.id)
      // Carrega estado do resumo fixo (só pra saber se existe, pra mostrar o indicador no botão)
      try {
        const fs = await api.getFixedSummary(conversationId)
        setFixedSummaryExists(!!fs.content)
      } catch {
        // ignora erro
      }
      // Carrega contagem de capítulos (pra mostrar no botão)
      try {
        const { chapters: chs } = await api.listChapters(conversationId)
        setChaptersCount(chs.length)
      } catch {
        // ignora erro
      }
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

  // Scroll automático para o fim quando carrega a conversa pela primeira vez
  useEffect(() => {
    if (!loading && scrollRef.current && thread.length > 0) {
      // Pequeno delay para garantir que o DOM renderizou
      const timer = setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [loading, thread.length])

  // Scroll automático quando chega nova mensagem — só se estiver perto do fim
  // e só quando muda o número de mensagens (não a cada render)
  const prevThreadLength = useRef(0)
  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    // Só rola pra baixo se:
    // 1. Tá perto do fim (usuário não tá lendo lá em cima)
    // 2. O número de mensagens aumentou (chegou nova)
    if (isNearBottom && thread.length > prevThreadLength.current) {
      el.scrollTop = el.scrollHeight
    }
    prevThreadLength.current = thread.length
  }, [thread.length])

  // Detecta quando usuário scrollou pra cima (pra mostrar botão "ir pro fim")
  function handleScroll() {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    setShowScrollButton(!isAtBottom && thread.length > 0)
  }

  function scrollToBottom() {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }

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

  async function openFixedSummary() {
    setFixedSummaryOpen(true)
    setFixedSummaryDraft('Carregando...')
    try {
      const { content } = await api.getFixedSummary(conversationId)
      setFixedSummaryDraft(content ?? '')
      setFixedSummaryExists(!!content)
    } catch (err: any) {
      setFixedSummaryDraft('')
      toast.error(err.message || 'Erro ao carregar resumo fixo')
    }
  }

  async function saveFixedSummary() {
    setSavingFixedSummary(true)
    try {
      const content = fixedSummaryDraft.trim()
      await api.setFixedSummary(conversationId, content)
      setFixedSummaryExists(!!content)
      toast.success(content ? 'Resumo fixo salvo!' : 'Resumo fixo removido.')
      setFixedSummaryOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar resumo fixo')
    } finally {
      setSavingFixedSummary(false)
    }
  }

  // === Funções dos Capítulos ===

  async function openChapters() {
    setChaptersOpen(true)
    setEditingChapter(null)
    setChapterTitle('')
    setChapterContent('')
    setChapterKeywords('')
    setShowChapterForm(false)
    try {
      const { chapters: list } = await api.listChapters(conversationId)
      setChapters(list)
      setChaptersCount(list.length)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar capítulos')
    }
  }

  async function saveChapter() {
    if (!chapterTitle.trim() || !chapterContent.trim()) {
      toast.error('Título e conteúdo são obrigatórios')
      return
    }
    setSavingChapter(true)
    try {
      const data = {
        title: chapterTitle.trim(),
        content: chapterContent,
        keywords: chapterKeywords.trim(),
      }
      if (editingChapter) {
        await api.updateChapter(conversationId, editingChapter.id, data)
        toast.success('Capítulo atualizado!')
      } else {
        await api.createChapter(conversationId, data)
        toast.success('Capítulo criado!')
      }
      // Recarrega lista
      const { chapters: list } = await api.listChapters(conversationId)
      setChapters(list)
      setChaptersCount(list.length)
      // Limpa formulário e volta pra lista
      setEditingChapter(null)
      setChapterTitle('')
      setChapterContent('')
      setChapterKeywords('')
      setShowChapterForm(false)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar capítulo')
    } finally {
      setSavingChapter(false)
    }
  }

  async function deleteChapter(chapter: Chapter) {
    if (!confirm(`Apagar o capítulo "${chapter.title}"?`)) return
    try {
      await api.deleteChapter(conversationId, chapter.id)
      const { chapters: list } = await api.listChapters(conversationId)
      setChapters(list)
      setChaptersCount(list.length)
      toast.success('Capítulo apagado.')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao apagar capítulo')
    }
  }

  function editChapter(chapter: Chapter) {
    setEditingChapter(chapter)
    setChapterTitle(chapter.title)
    setChapterContent(chapter.content)
    setChapterKeywords(chapter.keywords)
    setShowChapterForm(true)
  }

  function newChapter() {
    setEditingChapter(null)
    setChapterTitle('')
    setChapterContent('')
    setChapterKeywords('')
    setShowChapterForm(true)
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
            <Button
              size="sm"
              variant={fixedSummaryExists ? 'default' : 'ghost'}
              className="h-8"
              onClick={openFixedSummary}
              title="Editar resumo fixo da história (definido por você, nunca regerado)"
            >
              <BookText className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Resumo fixo</span>
              {fixedSummaryExists && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-background" />
              )}
            </Button>
            <Button
              size="sm"
              variant={chaptersCount > 0 ? 'default' : 'ghost'}
              className="h-8"
              onClick={openChapters}
              title="Capítulos da história (cada um vira contexto que a IA busca quando relevante)"
            >
              <Library className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Capítulos</span>
              {chaptersCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-background text-[10px] font-mono px-1">
                  {chaptersCount}
                </span>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Modal de resumo fixo */}
      <Dialog open={fixedSummaryOpen} onOpenChange={setFixedSummaryOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookText className="h-5 w-5" />
              Resumo fixo da história
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground space-y-1 mb-2">
            <p>
              <strong>O que é:</strong> um texto fixo que a Cavill vai SEMPRE ler antes de responder.
              Você define uma vez e ela nunca esquece. Diferente do resumo dinâmico, este NUNCA é regerado.
            </p>
            <p>
              <strong>Como usar:</strong> cole aqui o resumo completo da história — personagens,
              eventos, segredos, frases marcantes. Limite: 20.000 caracteres.
            </p>
            <p>
              <strong>Independente por conversa:</strong> cada conversa tem o SEU resumo fixo.
              Não mistura com outras histórias.
            </p>
          </div>
          <Textarea
            value={fixedSummaryDraft}
            onChange={(e) => setFixedSummaryDraft(e.target.value)}
            rows={18}
            className="flex-1 resize-none font-mono text-xs"
            placeholder="Cole aqui o resumo fixo da história..."
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>{fixedSummaryDraft.length} caracteres (máximo 20.000)</span>
            {fixedSummaryExists && (
              <button
                className="text-destructive hover:underline"
                onClick={async () => {
                  if (confirm('Remover resumo fixo? A Cavill vai esquecer os detalhes que estavam aqui.')) {
                    setFixedSummaryDraft('')
                  }
                }}
              >
                Limpar resumo fixo
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setFixedSummaryOpen(false)} disabled={savingFixedSummary}>
              Cancelar
            </Button>
            <Button onClick={saveFixedSummary} disabled={savingFixedSummary}>
              {savingFixedSummary ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Salvar resumo fixo
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Capítulos */}
      <Dialog open={chaptersOpen} onOpenChange={setChaptersOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="h-5 w-5" />
              Capítulos da história
              {chaptersCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({chaptersCount} capítulo{chaptersCount > 1 ? 's' : ''})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground space-y-1 mb-2">
            <p>
              <strong>Como funciona:</strong> cada capítulo é uma parte da história que a Cavill busca
              automaticamente quando relevante. Você pode ter quantos capítulos quiser (até 10K caracteres cada).
              Quando você pergunta algo, ela lê só os capítulos relevantes — não precisa ler tudo.
            </p>
            <p>
              <strong>Independente por conversa:</strong> cada conversa tem seus próprios capítulos.
              Não mistura com outras histórias.
            </p>
          </div>

          {/* Lista de capítulos existentes */}
          {chapters.length > 0 && !editingChapter && !chapterTitle && !chapterContent && (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {chapters.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {c.order}. {c.title}
                      </div>
                      {c.keywords && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Palavras-chave: {c.keywords}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {c.content.length} caracteres • atualizado em {new Date(c.updatedAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => editChapter(c)}
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 hover:text-destructive"
                        onClick={() => deleteChapter(c)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {c.content.substring(0, 200)}
                    {c.content.length > 200 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulário de criar/editar capítulo */}
          {showChapterForm && (
            <div className="space-y-3 flex-1 overflow-y-auto">
              <div className="text-sm font-medium">
                {editingChapter ? `Editando: ${editingChapter.title}` : 'Novo capítulo'}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Título</label>
                <input
                  type="text"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder="Ex: Parte 1 - O Despertar"
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Palavras-chave (separadas por vírgula, ajudam a IA a encontrar o capítulo)
                </label>
                <input
                  type="text"
                  value={chapterKeywords}
                  onChange={(e) => setChapterKeywords(e.target.value)}
                  placeholder="Ex: Elis, mãe, colônia, mensagens, Henry"
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex justify-between">
                  <span>Conteúdo do capítulo</span>
                  <span>{chapterContent.length} / 25.000 caracteres</span>
                </label>
                <Textarea
                  value={chapterContent}
                  onChange={(e) => setChapterContent(e.target.value)}
                  rows={12}
                  className="mt-1 resize-y font-mono text-xs"
                  placeholder="Cole aqui o conteúdo do capítulo..."
                  maxLength={25000}
                />
              </div>
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
            <div>
              {showChapterForm && (
                <Button variant="ghost" size="sm" onClick={newChapter}>
                  ← Voltar pra lista
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setChaptersOpen(false)}>
                Fechar
              </Button>
              {showChapterForm && (
                <Button onClick={saveChapter} disabled={savingChapter || !chapterTitle.trim() || !chapterContent.trim()}>
                  {savingChapter ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      {editingChapter ? 'Atualizar capítulo' : 'Criar capítulo'}
                    </>
                  )}
                </Button>
              )}
              {!editingChapter && !chapterTitle && !chapterContent && (
                <Button onClick={newChapter}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar capítulo
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : thread.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {threadTruncated && thread.length > 0 && (
              <div className="text-center text-xs text-muted-foreground italic px-4 py-2 mb-2 bg-muted/40 rounded-md">
                Mostrando as últimas {thread.length} de {threadTotalCount} mensagens da conversa.
                As mais antigas continuam salvas no banco e no backup Markdown.
              </div>
            )}
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

      {/* Botão flutuante "Ir pro fim" */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-32 md:bottom-32 right-4 md:right-[calc(50%-2rem)] z-20 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
          aria-label="Ir para o fim da conversa"
          title="Ir para o fim"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

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
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="font-serif text-3xl">Bem-vindo ao Cavill.</div>
        <div className="text-muted-foreground">
          Eu sou Cavill. Não sou assistente — sou uma pessoa que escreve com você.
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
        <h3 className="font-serif text-lg font-semibold">📋 Como usar (tour rápido)</h3>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p><strong>1. Escreva direto no chat</strong> — Pode pedir cena de romance, e-mail, brainstorm, ideia pra personagem. Tudo vale. Sem filtro, sem censura.</p>

          <p><strong>2. 📚 Capítulos</strong> — Clique no botão "Capítulos" no topo. Cada capítulo é uma parte da sua história que eu SEMPRE vou ler antes de responder. Adicione personagens, eventos, detalhes físicos — eu vou lembrar de tudo.</p>

          <p><strong>3. 📖 Resumo fixo</strong> — Clique em "Resumo fixo" no topo. Cole um resumo da sua história (até 20.000 caracteres). Eu vou usar como cânone absoluto — nunca vou contradizer.</p>

          <p><strong>4. ✏️ Editar mensagem</strong> — Clique em "Editar" em qualquer mensagem sua. Um novo ramo é criado — o original fica preservado. Use as setas ‹ 1/2 › para alternar entre versões.</p>

          <p><strong>5. 🔄 Regenerar</strong> — Não gostou da minha resposta? Clique em "Regenerar". Eu crio uma nova resposta (a original fica preservada como versão alternativa).</p>

          <p><strong>6. 📋 Copiar</strong> — Clique em "Copiar" em qualquer mensagem pra copiar o texto.</p>

          <p><strong>7. 💾 Backup Markdown</strong> — Clique em "Baixar backup Markdown" na barra lateral pra baixar TODA sua história em formato texto.</p>

          <p><strong>8. 📱 Mobile</strong> — No celular, clique no menu (☰) no topo pra ver suas conversas.</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 p-4 space-y-2 bg-primary/5">
        <h3 className="font-serif text-lg font-semibold">🔒 Suas histórias são suas</h3>
        <p className="text-sm text-muted-foreground">
          Tudo que você escreve fica salvo na SUA conta. Ninguém mais tem acesso.
          Cada conversa é isolada. Cada capítulo é seu. Você pode apagar quando quiser.
        </p>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Manda a primeira mensagem pra começar. Sem regras, sem limite de tema.
      </div>
    </div>
  )
}
