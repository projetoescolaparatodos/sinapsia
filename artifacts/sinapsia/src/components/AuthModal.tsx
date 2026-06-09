import { useState } from 'react'
import { Network } from 'lucide-react'
import { cleanPhone, saveUser, lookupUserName } from '@/lib/auth'
import type { SinapUser } from '@/lib/auth'

interface AuthModalProps {
  onSuccess: (user: SinapUser) => void
}

export default function AuthModal({ onSuccess }: AuthModalProps) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [returning, setReturning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const clean = cleanPhone(phone)

  const handlePhoneBlur = async () => {
    if (clean.length < 10) return
    setChecking(true)
    const found = await lookupUserName(clean)
    setChecking(false)
    if (found) {
      setName(found)
      setReturning(true)
    } else {
      setReturning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (clean.length < 10) {
      setError('Insira um número de telefone válido (mínimo 10 dígitos).')
      return
    }
    if (!name.trim()) {
      setError('Insira seu apelido para aparecer no canvas.')
      return
    }

    setLoading(true)
    try {
      const user: SinapUser = { phone: clean, name: name.trim() }
      await saveUser(user)
      onSuccess(user)
    } catch {
      setError('Erro ao entrar. Verifique sua conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-950 text-white">
            <Network size={24} />
          </div>
          <h1 className="mt-3 text-xl font-bold text-neutral-900">
            {returning ? `Bem-vindo de volta!` : 'Entrar no Sinapsia'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {returning
              ? `Confirme seu apelido e entre.`
              : 'Sem senha. Sem verificação. Só você e seu mapa.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-700" htmlFor="auth-phone">
              Número de telefone
            </label>
            <input
              id="auth-phone"
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setReturning(false) }}
              onBlur={handlePhoneBlur}
              placeholder="(11) 99999-9999"
              className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
              autoFocus
              disabled={loading}
            />
            {checking && (
              <p className="mt-1 text-xs text-neutral-400">Verificando…</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-700" htmlFor="auth-name">
              Seu apelido no canvas
            </label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Ana, Carlos…"
              className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
              maxLength={24}
              disabled={loading}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Aparece no cursor quando você edita junto com outras pessoas.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || checking}
            className="mt-1 h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? 'Entrando…'
              : returning
              ? `Entrar como ${name || '…'}`
              : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
