'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'

type Props = {
  onAuthed: (user: { id: string; email: string; name: string | null }) => void
}

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast.error('Preencha email e senha')
      return
    }
    setSubmitting(true)
    try {
      const { user } =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password, name.trim() || undefined)
      onAuthed(user)
      toast.success(mode === 'login' ? 'Entrou' : 'Conta criada')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao autenticar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary/40">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif text-2xl font-bold">
            L
          </div>
          <CardTitle className="font-serif text-2xl">Cavill</CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Entre para voltar às suas conversas.'
              : 'Crie sua conta. Suas conversas ficam salvas no seu email.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome (opcional)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como devo te chamar?"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={4}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {mode === 'login' ? (
                <>
                  Não tem conta?{' '}
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => setMode('register')}
                  >
                    Criar agora
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{' '}
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => setMode('login')}
                  >
                    Entrar
                  </button>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
