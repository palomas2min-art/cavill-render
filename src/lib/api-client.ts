/**
 * Cliente HTTP simples. Todas as rotas são relativas.
 */

export type UserDto = { id: string; email: string; name: string | null } | null

export type ConversationSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastActiveAt: string
  _count: { messages: number }
}

export type SiblingInfo = {
  id: string
  content: string
  createdAt: string
  isActive: boolean
  isDeleted: boolean
}

export type TreeNode = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parentMessageId: string | null
  isDeleted: boolean
  createdAt: string
  generation: string
  siblings: SiblingInfo[]
  siblingCount: number
  indexAmongSiblings: number
  isActive: boolean
}

export type ConversationTree = {
  id: string
  title: string
  activeLeafId: string | null
  createdAt: string
  updatedAt: string
  thread: TreeNode[]
  allNodes: TreeNode[]
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j.error || msg
    } catch {}
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  me: () => jfetch<{ user: UserDto }>('/api/auth/me'),
  register: (email: string, password: string, name?: string) =>
    jfetch<{ user: NonNullable<UserDto> }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    jfetch<{ user: NonNullable<UserDto> }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => jfetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  listConversations: () =>
    jfetch<{ conversations: ConversationSummary[] }>('/api/conversations'),
  getConversation: (id: string) =>
    jfetch<{ conversation: ConversationTree }>(`/api/conversations/${id}`),
  createConversation: (title?: string, message?: string) =>
    jfetch<{ conversation: ConversationSummary; firstExchange?: any }>(
      '/api/conversations',
      { method: 'POST', body: JSON.stringify({ title, message }) }
    ),
  renameConversation: (id: string, title: string) =>
    jfetch<{ conversation: ConversationSummary }>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteConversation: (id: string) =>
    jfetch<{ ok: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),

  sendMessage: (conversationId: string, content: string) =>
    jfetch<{ userMessage: { id: string }; assistantMessage: { id: string; content: string } }>(
      `/api/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) }
    ),

  editMessage: (conversationId: string, messageId: string, content: string) =>
    jfetch<{ newUserMessage: { id: string }; newAssistantMessage: { id: string; content: string } }>(
      `/api/conversations/${conversationId}/messages/${messageId}/edit`,
      { method: 'POST', body: JSON.stringify({ content }) }
    ),
  deleteMessage: (conversationId: string, messageId: string) =>
    jfetch<{ ok: boolean }>(`/api/conversations/${conversationId}/messages/${messageId}/delete`, {
      method: 'POST',
    }),
  switchBranch: (conversationId: string, leafId: string) =>
    jfetch<{ ok: boolean }>(`/api/conversations/${conversationId}/switch`, {
      method: 'POST',
      body: JSON.stringify({ leafId }),
    }),

  latestBackup: () => jfetch<{ markdown: string | null }>('/api/backup'),
  backupFileURL: () => '/api/backup?format=md',
  listBackups: () => jfetch<{ items: any[] }>('/api/backup?list=true'),

  lastActiveConversation: () =>
    jfetch<{ lastActiveConversation: { id: string; title: string } | null }>('/api/preferences'),
}
