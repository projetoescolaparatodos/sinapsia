'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { Copy, Eye, Home, Network, PenLine, Share2, X } from 'lucide-react'

const Canvas = dynamic(() => import('@/components/Canvas'), { ssr: false })

export default function BoardPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const boardId = params.id as string
  const readOnly = searchParams.get('mode') === 'view'

  const [copied, setCopied] = useState<'edit' | 'view' | null>(null)
  const [showShare, setShowShare] = useState(false)

  const copyLink = async (type: 'edit' | 'view') => {
    const origin = window.location.origin
    const editLink = `${origin}/b/${boardId}`
    const viewLink = `${origin}/b/${boardId}?mode=view`
    const link = type === 'edit' ? editLink : viewLink
    await navigator.clipboard.writeText(link)
    setCopied(type)
    setTimeout(() => setCopied(null), 1600)
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <Canvas boardId={boardId} readOnly={readOnly} />

      <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
        {readOnly && (
          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur">
            <Eye size={15} />
            Visualizacao
          </span>
        )}

        {!readOnly && (
          <div className="relative">
            <button
              onClick={() => setShowShare((value) => !value)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-800 shadow-sm backdrop-blur transition hover:bg-white"
            >
              <Share2 size={15} />
              Compartilhar
            </button>

            {showShare && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-neutral-200 bg-white p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-neutral-900">Links do mapa</p>
                  <button
                    onClick={() => setShowShare(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                    aria-label="Fechar compartilhamento"
                    title="Fechar"
                  >
                    <X size={15} />
                  </button>
                </div>

                <ShareRow
                  icon={<PenLine size={16} />}
                  label="Edicao"
                  description="Qualquer pessoa com o link pode editar."
                  onCopy={() => copyLink('edit')}
                  copied={copied === 'edit'}
                />
                <ShareRow
                  icon={<Eye size={16} />}
                  label="Visualizacao"
                  description="Abre o mapa em modo somente leitura."
                  onCopy={() => copyLink('view')}
                  copied={copied === 'view'}
                />
              </div>
            )}
          </div>
        )}

        <Link
          href="/"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-neutral-950"
          title="Pagina inicial"
        >
          <Home size={15} />
          Sinapsia
        </Link>
      </div>

      <div className="fixed left-3 top-3 z-40 hidden items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur sm:flex">
        <Network size={15} />
        {boardId.slice(0, 8)}
      </div>

      {showShare && (
        <button
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setShowShare(false)}
          aria-label="Fechar compartilhamento"
        />
      )}
    </div>
  )
}

function ShareRow({
  icon,
  label,
  description,
  onCopy,
  copied,
}: {
  icon: React.ReactNode
  label: string
  description: string
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-100 py-3 first:border-t-0">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 text-[#0f766e]">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">{label}</p>
          <p className="text-xs leading-5 text-neutral-500">{description}</p>
        </div>
      </div>
      <button
        onClick={onCopy}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800"
      >
        <Copy size={14} />
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}
