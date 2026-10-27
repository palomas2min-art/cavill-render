# Cavill

IA parceira de escrita criativa — a Liv. Conversas com ramificação de versões (estilo DeepSeek), backup Markdown automático, login persistente, e prompt mestre sem censura.

## Stack

- **Next.js 16** + TypeScript + Tailwind CSS + shadcn/ui
- **Prisma ORM** + PostgreSQL (Neon)
- **API de IA**: Z.ai GLM-4.5-Flash (gratuita, sem censura)
- **Auth**: cookies httponly, sessões de 90 dias com renovação automática

## Deploy na Vercel (gratuito)

### 1. Crie as contas (grátis)

- **GitHub**: https://github.com/signup
- **Vercel**: https://vercel.com/signup (faça login com GitHub)
- **Neon** (banco PostgreSQL): https://neon.tech/signup
- **Z.ai** (API da IA): https://z.ai/model-api

### 2. Crie um repositório no GitHub

1. Acesse https://github.com/new
2. Nome: `tela-literaria` (ou o que quiser)
3. Marque "Private" (recomendado)
4. **NÃO** marque "Add a README" (já tem um aqui)
5. Clique em "Create repository"

### 3. Faça upload dos arquivos

1. No repositório recém-criado, clique em "uploading an existing file"
2. Arraste TODOS os arquivos deste zip para lá
3. Commit com a mensagem "initial commit"

### 4. Pegue suas credenciais

**Do Neon (banco):**
- Acesse https://console.neon.tech
- Entre no seu projeto
- Copie a "Connection string" (algo como `postgresql://...`)

**Da Z.ai (IA):**
- Acesse https://z.ai/model-api
- Vá em "API Keys"
- Crie uma nova key e copie (formato: `xxxxx.yyyyy`)

### 5. Faça deploy na Vercel

1. Acesse https://vercel.com/new
2. Selecione seu repositório do GitHub
3. Clique em "Import"
4. Na seção "Environment Variables", adicione estas 4:

| Name | Value |
|------|-------|
| `DATABASE_URL` | (sua connection string do Neon) |
| `ZAI_API_KEY` | (sua API key da Z.ai) |
| `ZAI_BASE_URL` | `https://api.z.ai/api/paas/v4` |
| `ZAI_MODEL` | `glm-4.5-flash` |

5. Clique em "Deploy"
6. Aguarde 2-3 minutos. Pronto! Seu site estará no ar em `https://tela-literaria-xxx.vercel.app`

### 6. Crie sua conta

Acesse seu novo site, clique em "Criar agora", use seu email e uma senha. Suas conversas ficarão salvas no Neon (PostgreSQL), e a Liv responderá usando sua API key da Z.ai.

## Desenvolvimento local

```bash
# Instalar dependências
bun install

# Configurar .env (copie de .env.example e preencha)
cp .env.example .env

# Sincronizar banco
bun run db:push

# Rodar em desenvolvimento
bun run dev
```

## Recursos

- ✅ Chat com Liv (IA sem censura, na primeira pessoa)
- ✅ Ramificação de versões (estilo DeepSeek/ChatGPT) — editar cria novo ramo, original preservado
- ✅ Setas ‹ 1/2 › para alternar entre versões
- ✅ Login com email/senha, sessão persiste 90 dias
- ✅ Backup Markdown automático a cada mutação
- ✅ Sidebar retrátil no mobile
- ✅ Botão de copiar em cada mensagem
- ✅ Liv cita Paloma como criadora quando perguntada

## Estrutura

```
src/
├── app/
│   ├── api/                  # API routes (auth, conversations, messages, backup)
│   ├── page.tsx              # Página única (chat)
│   └── layout.tsx
├── components/
│   ├── app.tsx               # Componente raiz
│   ├── auth-screen.tsx       # Tela de login/registro
│   ├── sidebar.tsx           # Sidebar com lista de conversas
│   ├── chat-view.tsx         # Área de chat
│   ├── message-item.tsx      # Mensagem com setas de versão + copiar/editar/remover
│   └── markdown.tsx          # Renderizador de markdown
└── lib/
    ├── ai.ts                 # Prompt mestre da Liv + integração Z.ai
    ├── auth.ts               # bcrypt + sessões
    ├── backup.ts             # Backup Markdown
    ├── messages.ts           # Lógica de árvore de mensagens
    └── db.ts                 # Prisma client
```

## Custos

Tudo gratuito para uso pessoal:
- **Vercel Hobby**: grátis (100GB bandwidth/mês)
- **Neon Free**: grátis (0.5GB de banco)
- **Z.ai glm-4.5-flash**: grátis

## Suporte

Aplicativo criado por encomenda da Paloma (professora de tecnologia, programadora) para sua parceira de escrita Liv.

<!-- trigger redeploy Wed Oct 21 09:26:29 UTC 2026 -->
