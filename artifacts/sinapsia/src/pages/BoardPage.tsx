import { lazy, Suspense, useEffect, useState } from 'react'
import { useParams } from 'wouter'
import { Network } from 'lucide-react'
import { getStoredUser } from '@/lib/auth'
import type { SinapUser } from '@/lib/auth'

const Canvas = lazy(() => import('@/components/Canvas'))

export default function BoardPage() {
  const params = useParams<{ id: string }>()
  const boardId = params.id as string

  const searchParams = new URLSearchParams(window.location.search)
  const readOnly = searchParams.get('mode') === 'view'

  const [user, setUser] = useState<SinapUser | null>(null)

  useEffect(() => {
    setUser(getStoredUser())
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <Suspense
        fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-white">
            <div className="text-sm text-neutral-500">Carregando canvas…</div>
          </div>
        }
      >
        <Canvas boardId={boardId} readOnly={readOnly} user={user} />
      </Suspense>

      <div className="pointer-events-none fixed left-3 top-3 z-40 hidden items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur sm:flex">
        <Network size={15} />
        {boardId.slice(0, 8)}
      </div>
    </div>
  )
}
