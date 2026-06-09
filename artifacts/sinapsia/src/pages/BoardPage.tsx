import { lazy, Suspense, useEffect, useState } from 'react'
import { useParams } from 'wouter'
import { getStoredUser } from '@/lib/auth'
import type { SinapUser } from '@/lib/auth'
import AuthModal from '@/components/AuthModal'

const Canvas = lazy(() => import('@/components/Canvas'))

export default function BoardPage() {
  const params = useParams<{ id: string }>()
  const boardId = params.id as string

  const searchParams = new URLSearchParams(window.location.search)
  const readOnly = searchParams.get('mode') === 'view'

  const [user, setUser] = useState<SinapUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    const stored = getStoredUser()
    if (stored) {
      setUser(stored)
    } else if (!readOnly) {
      // Edit links require login so the user has an identity on the canvas
      setShowAuth(true)
    }
    setAuthChecked(true)
  }, [readOnly])

  const handleAuthSuccess = (u: SinapUser) => {
    setUser(u)
    setShowAuth(false)
  }

  if (!authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-sm text-neutral-500">Carregando…</div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Login gate for edit links — shown over the canvas loading state */}
      {showAuth && (
        <AuthModal
          onSuccess={handleAuthSuccess}
          subtitle={`Entre para editar o mapa`}
        />
      )}

      <Suspense
        fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-white">
            <div className="text-sm text-neutral-500">Carregando canvas…</div>
          </div>
        }
      >
        {/* Render canvas immediately so it loads in the background;
            it's fully interactive only after auth is resolved */}
        <Canvas boardId={boardId} readOnly={readOnly || showAuth} user={user} />
      </Suspense>
    </div>
  )
}
