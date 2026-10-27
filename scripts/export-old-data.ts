/**
 * Migração do modelo antigo (Message + MessageVersion) para o novo (árvore).
 * Lê o SQLite diretamente via better-sqlite3 (porque o Prisma Client
 * já foi regenerado com o novo schema e não consegue mais ver MessageVersion).
 */
import Database from 'better-sqlite3'
import { writeFileSync } from 'fs'

const DB_PATH = '/home/z/my-project/db/custom.db'

type Snapshot = {
  users: any[]
  sessions: any[]
  conversations: any[]
  messages: {
    id: string
    conversationId: string
    role: string
    content: string
    isDeleted: boolean
    createdAt: string
    updatedAt: string
  }[]
  backups: {
    id: string
    userId: string
    conversationId: string | null
    action: string
    markdown: string
    createdAt: string
  }[]
}

function main() {
  console.log('[migration] Lendo banco SQLite em', DB_PATH)
  const db = new Database(DB_PATH, { readonly: true })

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  console.log('[migration] Tabelas:', tables.map((t) => t.name).join(', '))

  const users = db.prepare('SELECT * FROM User').all()
  const sessions = db.prepare('SELECT * FROM Session').all()
  const conversations = db.prepare('SELECT * FROM Conversation').all()

  // Mensagens: pegar todas, com a versão atual
  const msgs = db.prepare('SELECT * FROM Message ORDER BY createdAt ASC').all() as any[]
  console.log(`[migration] ${msgs.length} mensagens encontradas`)

  const messages: Snapshot['messages'] = []
  for (const m of msgs) {
    if (!m.currentVersionId) continue
    const cv = db.prepare('SELECT * FROM MessageVersion WHERE id = ?').get(m.currentVersionId) as any
    if (!cv) continue
    const isDeleted = cv.content === '__DELETED__'
    messages.push({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: isDeleted ? '' : cv.content,
      isDeleted,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })
  }
  console.log(`[migration] ${messages.length} mensagens com versão atual`)

  const backups = db.prepare('SELECT * FROM BackupEntry ORDER BY createdAt DESC LIMIT 50').all() as any[]

  const snap: Snapshot = { users, sessions, conversations, messages, backups }
  writeFileSync('/home/z/my-project/scripts/migration-backup.json', JSON.stringify(snap, null, 2))
  console.log(`[migration] Snapshot salvo: ${snap.users.length} users, ${snap.conversations.length} conversas, ${snap.messages.length} mensagens, ${snap.backups.length} backups`)

  db.close()
}

main()
