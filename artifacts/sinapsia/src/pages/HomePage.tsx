import { useState } from 'react'
import { useLocation } from 'wouter'
import { ArrowRight, ExternalLink, Network, PenLine, Share2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { isFirebaseConfigured, db, ref, set, serverTimestamp } from '@/lib/firebase'

export default function HomePage() {
  const [, navigate] = useLocation()
  const [loading, setLoading] = useState(false)
  const [boardInput, setBoardInput] = useState('')

  const createNewBoard = async () => {
    setLoading(true)
    const id = uuidv4()

    if (db) {
      try {
        await set(ref(db, `boards/${id}`), {
          document_state: null,
          updated_at: serverTimestamp(),
        })
      } catch {
        // Continua mesmo sem Firebase — modo local
      }
    }

    navigate(`/b/${id}`)
  }

  const openBoard = () => {
    const value = boardInput.trim()
    if (!value) return

    try {
      const parsed = new URL(value)
      const pathId = parsed.pathname.split('/b/')[1]?.split('/')[0]
      navigate(pathId ? `/b/${pathId}${parsed.search}` : `/b/${value}`)
    } catch {
      navigate(`/b/${value}`)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-neutral-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SinapsiaMark />
            <div>
              <p className="text-base font-semibold">Sinapsia</p>
              <p className="text-xs text-neutral-500">Mapas conceituais</p>
            </div>
          </div>

          <span className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm">
            {isFirebaseConfigured ? 'Multiplayer ativo' : 'Modo local'}
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_420px]">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-semibold leading-[1.04] sm:text-6xl">
              Sinapsia
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-600">
              Uma tela infinita para pensar, desenhar, conectar ideias e
              compartilhar mapas por link, sem cadastro.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={createNewBoard}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Network size={18} />
                {loading ? 'Criando mapa…' : 'Criar novo mapa'}
              </button>
              <a
                href="#abrir"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 shadow-sm transition hover:border-neutral-400"
              >
                <ExternalLink size={18} />
                Abrir link existente
              </a>
            </div>
          </div>

          <div id="abrir" className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-semibold text-neutral-900" htmlFor="board-link">
              Abrir mapa
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="board-link"
                value={boardInput}
                onChange={(e) => setBoardInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') openBoard() }}
                placeholder="Cole um link ou ID"
                className="h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
              />
              <button
                onClick={openBoard}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0f766e] text-white transition hover:bg-[#115e59]"
                aria-label="Abrir mapa"
              >
                <ArrowRight size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <Feature icon={<PenLine size={18} />} title="Desenho touch">
                Caneta, dedo, texto, setas, formas e cores no canvas.
              </Feature>
              <Feature icon={<Share2 size={18} />} title="Links de acesso">
                Gere links para editar ou apenas visualizar.
              </Feature>
              <Feature icon={<ExternalLink size={18} />} title="Mídias leves">
                Arraste imagens e GIFs ou cole URLs diretamente no canvas.
              </Feature>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function Feature({ icon, title, children }: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span className="text-[#0f766e]">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-sm leading-6 text-neutral-500">{children}</p>
    </div>
  )
}

function SinapsiaMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-950 text-white">
      <Network size={20} />
    </div>
  )
}
