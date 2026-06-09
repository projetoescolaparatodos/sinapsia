import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Network } from 'lucide-react'
import { cleanPhone, lookupUserName, saveUser, storeUserLocal } from '@/lib/auth'
import type { SinapUser } from '@/lib/auth'

interface AuthModalProps {
  onSuccess: (user: SinapUser) => void
  subtitle?: string
}

type Step = 'phone' | 'name'

export default function AuthModal({ onSuccess, subtitle }: AuthModalProps) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const clean = cleanPhone(phone)

  useEffect(() => {
    if (step === 'phone') phoneRef.current?.focus()
    if (step === 'name')  nameRef.current?.focus()
  }, [step])

  // Step 1: check phone
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (clean.length < 10) {
      setError('Insira um número válido (DDD + número, mínimo 10 dígitos).')
      return
    }

    console.log('[Sinapsia] AuthModal handlePhoneSubmit', { phone: clean })
    setLoading(true)
    try {
      const existingName = await lookupUserName(clean)
      console.log('[Sinapsia] AuthModal handlePhoneSubmit lookup result', { phone: clean, existingName })
      if (existingName) {
        // Returning user — log in immediately, no name step needed
        const user: SinapUser = { phone: clean, name: existingName }
        storeUserLocal(user)
        onSuccess(user)
      } else {
        // New user — ask for name
        setStep('name')
      }
    } catch (err) {
      console.error('[Sinapsia] AuthModal handlePhoneSubmit failed', err)
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: create account
  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    console.log('[Sinapsia] AuthModal handleNameSubmit', { phone: clean, name })

    if (!name.trim()) {
      setError('Escolha um apelido para aparecer no canvas.')
      return
    }
    if (name.trim().length < 2) {
      setError('O apelido precisa ter pelo menos 2 caracteres.')
      return
    }

    setLoading(true)
    try {
      const user: SinapUser = { phone: clean, name: name.trim() }
      await saveUser(user)
      console.log('[Sinapsia] AuthModal created user', user)
      onSuccess(user)
    } catch (err) {
      console.error('[Sinapsia] AuthModal handleNameSubmit failed', err)
      setError('Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const formatPhoneDisplay = (digits: string) => {
    if (digits.length <= 2) return digits
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">

        {/* Logo + heading */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-950 text-white">
            <Network size={24} />
          </div>

          {step === 'phone' ? (
            <>
              <h1 className="mt-3 text-xl font-bold text-neutral-900">Entrar no Sinapsia</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {subtitle ?? 'Sem senha. Só o número de telefone.'}
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-xl font-bold text-neutral-900">Primeira vez por aqui?</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Escolha um apelido — ele aparece no cursor durante edições colaborativas.
              </p>
            </>
          )}
        </div>

        {/* Step 1 — Phone */}
        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-700" htmlFor="auth-phone">
                Número de telefone
              </label>
              <input
                ref={phoneRef}
                id="auth-phone"
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePhoneSubmit(e as unknown as React.FormEvent) } }}
                placeholder="(11) 99999-9999"
                className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
                disabled={loading}
                autoComplete="tel"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || clean.length < 10}
              className="mt-1 h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Verificando…' : 'Continuar'}
            </button>
          </form>
        )}

        {/* Step 2 — Name (new user) */}
        {step === 'name' && (
          <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
            {/* Phone summary */}
            <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
              <span className="text-sm text-neutral-600">{formatPhoneDisplay(clean)}</span>
              <button
                type="button"
                onClick={() => { setStep('phone'); setError('') }}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
              >
                <ArrowLeft size={13} />
                Alterar
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-700" htmlFor="auth-name">
                Seu apelido no canvas
              </label>
              <input
                ref={nameRef}
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                placeholder="Ex: Ana, Carlos, Equipe…"
                className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
                maxLength={24}
                disabled={loading}
                autoComplete="nickname"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="mt-1 h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Criando conta…' : 'Criar conta e entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
