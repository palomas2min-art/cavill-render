'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Markdown } from './markdown'
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
import { Pencil, Trash2, Check, ChevronLeft, ChevronRight, User, Bot, Ban, Copy, RefreshCw } from 'lucide-react'
import { api, type TreeNode } from '@/lib/api-client'
import { toast } from 'sonner'

type Props = {
  node: TreeNode
  conversationId: string
  isGenerating: boolean
  onMutated: () => void
  onSwitch: (leafId: string) => void
}

export function MessageItem({ node, conversationId, isGenerating, onMutated, onSwitch }: Props) {
  const isUser = node.role === 'user'
  const isDeleted = node.isDeleted
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // siblings ativos (não-deletados) para mostrar nas setas
  const visibleSiblings = node.siblings.filter((s) => !s.isDeleted)
  const currentSiblingIdx = visibleSiblings.findIndex((s) => s.id === node.id)
  const hasSiblings = visibleSiblings.length > 1

  function startEdit() {
    setDraft(node.content)
    setEditing(true)
  }

  async function saveEdit() {
    if (!draft.trim()) {
      toast.error('Mensagem vazia')
      return
    }
    setSaving(true)
    try {
      await api.editMessage(conversationId, node.id, draft.trim())
      toast.success('Novo ramo criado. Original preservado.')
      setEditing(false)
      onMutated()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao editar')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    setSaving(true)
    try {
      await api.deleteMessage(conversationId, node.id)
      toast.success('Removida do chat — nó preservado na árvore.')
      onMutated()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover')
    } finally {
      setSaving(false)
    }
  }

  async function copyContent() {
    const text = node.content
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback para contexto não-seguro (http) ou navegador sem Clipboard API
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('Texto copiado')
    } catch (err: any) {
      toast.error(err.message || 'Não consegui copiar')
    }
  }

  async function regenerate() {
    setSaving(true)
    try {
      await api.regenerateMessage(conversationId, node.id)
      toast.success('Resposta regenerada. Original preservado.')
      onMutated()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao regenerar')
    } finally {
      setSaving(false)
    }
  }

  async function goPrevSibling() {
    if (currentSiblingIdx > 0) {
      const prev = visibleSiblings[currentSiblingIdx - 1]
      // Acha a folha correspondente a este sibling — ou seja, o último descendente deste ramo
      onSwitch(prev.id) // o backend calcula a leaf; aqui mandamos o sibling id como "novo leaf" e ele ajusta
    }
  }

  async function goNextSibling() {
    if (currentSiblingIdx < visibleSiblings.length - 1) {
      const next = visibleSiblings[currentSiblingIdx + 1]
      onSwitch(next.id)
    }
  }

  // Editar só pode em mensagem do usuário, não deletada, e não durante geração
  const canEdit = isUser && !isDeleted && !isGenerating

  return (
    <div className={`group flex gap-3 px-3 md:px-6 py-4 ${isUser ? 'bg-primary/5 border-l-2 border-primary/30' : 'bg-muted/40'}`}>
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary/10 text-primary' : 'bg-accent/15 text-accent-foreground'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Header: nome + setas de versão */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{isUser ? 'Você' : 'Cavill'}</span>

          {hasSiblings && (
            <div className="flex items-center gap-0.5 bg-muted rounded-full px-1 py-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 rounded-full"
                onClick={goPrevSibling}
                disabled={currentSiblingIdx === 0}
                title="Versão anterior"
                aria-label="Versão anterior"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-[10px] font-mono px-1 tabular-nums">
                {currentSiblingIdx + 1}/{visibleSiblings.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 rounded-full"
                onClick={goNextSibling}
                disabled={currentSiblingIdx === visibleSiblings.length - 1}
                title="Próxima versão"
                aria-label="Próxima versão"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Conteúdo */}
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
              className="resize-y"
              autoFocus
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Criar novo ramo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
              <span className="ml-auto">A versão original ficará preservada.</span>
            </div>
          </div>
        ) : isDeleted ? (
          <div className="text-xs italic text-muted-foreground flex items-center gap-1">
            <Ban className="h-3 w-3" />
            mensagem removida do chat
          </div>
        ) : (
          <Markdown content={node.content} />
        )}

        {/* Ações */}
        {!editing && !isDeleted && (
          <div className="flex items-center gap-0.5 pt-1.5 -ml-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={copyContent}
              title="Copiar texto"
              aria-label="Copiar texto"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline ml-1">Copiar</span>
            </Button>

            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={startEdit}
                title="Editar (cria novo ramo)"
                aria-label="Editar — cria novo ramo"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1">Editar</span>
              </Button>
            )}
            {!isUser && !isGenerating && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={regenerate}
                disabled={saving}
                title="Regenerar resposta (cria nova versão)"
                aria-label="Regenerar resposta"
              >
                <RefreshCw className={"h-3.5 w-3.5 " + (saving ? "animate-spin" : "")} />
                <span className="hidden sm:inline ml-1">{saving ? 'Gerando…' : 'Regenerar'}</span>
              </Button>
            )}
            {isGenerating && (
              <span className="text-[10px] text-muted-foreground italic px-2 py-1">
                aguardando IA terminar…
              </span>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  title="Remover do chat"
                  aria-label="Remover do chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline ml-1">Remover</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover esta mensagem do chat?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A mensagem some da thread ativa, mas o nó permanece na árvore
                    (visível no backup Markdown).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={doDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  )
}
