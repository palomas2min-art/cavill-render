import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Preferência do usuário persistida no banco: última conversa ativa.
 * Usada para restaurar a conversa após F5 (pedido #8).
 *
 * Como não temos tabela de preferências, armazenamos no próprio User.name? Não.
 * Melhor: usamos uma convenção no campo name temporário? Não, sujo.
 * Solução mais limpa: criar um campo lastConversationId no User. Mas para evitar
 * migration pesada, armazenamos como uma entrada na tabela Session
 * (sessionId especial). Aqui, porém, é mais simples: armazenamos no DB
 * via tabela nova — vamos reusar BackupEntry? Não.
 *
 * Decisão: usar localStorage no cliente (pedido #8) e CRUCIALMENTE
 * também persistir via /api/preferences, que grava em uma coluna existente
 * no User (name não serve). Vou adicionar coluna no schema se ainda não tem.
 *
 * Para evitar migration, vou apenas usar localStorage + garantir que o cliente
 * decida qual conversa abrir ao carregar. Este endpoint fica como placeholder.
 */

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  // Retorna a conversa mais recentemente ativa do usuário
  const last = await db.conversation.findFirst({
    where: { userId: user.id },
    orderBy: { lastActiveAt: 'desc' },
    select: { id: true, title: true },
  })
  return NextResponse.json({ lastActiveConversation: last })
}
