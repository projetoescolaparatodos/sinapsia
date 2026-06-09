import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { ArrowRight, Check, Clock, LogOut, Network, Pencil, Plus } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { db, ref, set, onValue, off, serverTimestamp } from '@/lib/firebase'
import { getStoredUser, clearStoredUser } from '@/lib/auth'
import type { SinapUser } from '@/lib/auth'
import AuthModal from '@/components/AuthModal'

interface BoardEntry {
  id: string
  title: string
  createdAt: number
}

export default function HomePage() {
  const [, navigate] = useLocation()
  const [user, setUser] = useState<SinapUser | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [boards, setBoards] = useState<BoardEntry[]>([])
  const [boardInput, setBoardInput] = useState('')
  const [inputError, setInputError] = useState(false)
  const [creating, setCreating] = useState(false)

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = getStoredUser()
    if (stored) setUser(stored)
    else setShowAuth(true)
  }, [])

  useEffect(() => {
    if (!user || !db) return
    const boardsRef = ref(db, `userBoards/${user.phone}`)
    onValue(boardsRef, (snap) => {
      const data = snap.val() as Record<string, { title: string; createdAt: number }> | null
      const list: BoardEntry[] = Object.entries(data || {})
        .map(([id, b]) => ({ id, title: b.title, createdAt: b.createdAt }))
        .sort((a, b) => b.createdAt - a.createdAt)
      setBoards(list)
    })
    return () => off(boardsRef)
  }, [user])

  useEffect(() => {
    if (editingId) renameInputRef.current?.focus()
  }, [editingId])

  const handleAuthSuccess = (u: SinapUser) => {
    setUser(u)
    setShowAuth(false)
  }

  const createNewBoard = async () => {
    setCreating(true)
    const id = uuidv4()
    const now = Date.now()
    const title = `Mapa de ${new Date(now).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`

    if (db) {
      try {
        await set(ref(db, `boards/${id}`), {
          document_state: null,
          created_by: user?.phone ?? null,
          created_by_name: user?.name ?? null,
          created_at: serverTimestamp(),
        })
        if (user) {
          await set(ref(db, `userBoards/${user.phone}/${id}`), {
            title,
            createdAt: now,
          })
        }
      } catch { /* continues in local mode */ }
    }

    navigate(`/b/${id}`)
  }

  const openBoard = () => {
    const value = boardInput.trim()
    if (!value) { setInputError(true); return }
    setInputError(false)

    let boardId = value
    try {
      const parsed = new URL(value)
      const match = parsed.pathname.match(/\/b\/([^/?#]+)/)
      if (match) boardId = match[1] + (parsed.search || '')
    } catch { /* raw ID */ }

    navigate(`/b/${boardId}`)
  }

  const logout = () => {
    clearStoredUser()
    setUser(null)
    setBoards([])
    setShowAuth(true)
  }

  // ── Rename logic ──────────────────────────────────────────────────────────
  const startRename = (board: BoardEntry, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(board.id)
    setEditingTitle(board.title)
  }

  const commitRename = async () => {
    if (!editingId || !user || !db) { setEditingId(null); return }
    const trimmed = editingTitle.trim()
    if (!trimmed) { setEditingId(null); return }
    setSavingTitle(true)
    try {
      await set(ref(db, `userBoards/${user.phone}/${editingId}/title`), trimmed)
    } catch { /* ok */ }
    setSavingTitle(false)
    setEditingId(null)
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  return (
    <>
      {showAuth && <AuthModal onSuccess={handleAuthSuccess} />}

      <main className="min-h-screen bg-[#f7f8fa] text-neutral-950">
        <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8">

          {/* ── Header ── */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-950 text-white">
                <Network size={20} />
              </div>
              <span className="text-base font-semibold">Sinapsia</span>
            </div>

            {user && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-600">
                  Olá, <strong className="text-neutral-900">{user.name}</strong>
                </span>
                <button
                  onClick={logout}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800"
                >
                  <LogOut size={14} />
                  Sair
                </button>
              </div>
            )}
          </header>

          {/* ── Title + actions ── */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Meus mapas</h1>
              <p className="mt-1 text-sm text-neutral-500">Clique duas vezes no título de um mapa para renomear.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={boardInput}
                  onChange={(e) => { setBoardInput(e.target.value); setInputError(false) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') openBoard() }}
                  placeholder="Colar link ou ID"
                  className={`h-10 w-44 rounded-lg border px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 ${
                    inputError ? 'border-red-400 bg-red-50' : 'border-neutral-300 bg-white'
                  }`}
                />
                <button
                  onClick={openBoard}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:border-neutral-400"
                >
                  <ArrowRight size={16} />
                  Abrir
                </button>
              </div>

              <button
                onClick={createNewBoard}
                disabled={creating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                <Plus size={18} />
                {creating ? 'Criando…' : 'Novo mapa'}
              </button>
            </div>
          </div>

          {/* ── Boards grid ── */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {boards.map((board) => (
              <div
                key={board.id}
                className="group relative flex flex-col items-start rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-400 hover:shadow-md"
              >
                {/* Canvas preview icon */}
                <div
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 transition group-hover:bg-neutral-200"
                  onClick={() => navigate(`/b/${board.id}`)}
                >
                  <Network size={20} />
                </div>

                {/* Title — double-click to rename */}
                <div className="mt-3 w-full">
                  {editingId === board.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={renameInputRef}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') cancelRename()
                        }}
                        className="w-full rounded border border-neutral-300 px-1.5 py-0.5 text-sm font-semibold text-neutral-900 outline-none focus:border-neutral-950"
                        disabled={savingTitle}
                        maxLength={48}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {savingTitle && <Check size={13} className="shrink-0 text-emerald-500" />}
                    </div>
                  ) : (
                    <p
                      className="cursor-pointer text-sm font-semibold leading-snug text-neutral-900"
                      onClick={() => navigate(`/b/${board.id}`)}
                      onDoubleClick={(e) => startRename(board, e)}
                      title="Clique duas vezes para renomear"
                    >
                      {board.title}
                    </p>
                  )}
                </div>

                {/* Date + rename icon */}
                <div className="mt-0.5 flex w-full items-center justify-between">
                  <p
                    className="flex cursor-pointer items-center gap-1 text-xs text-neutral-400"
                    onClick={() => navigate(`/b/${board.id}`)}
                  >
                    <Clock size={11} />
                    {new Date(board.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                  {editingId !== board.id && (
                    <button
                      onClick={(e) => startRename(board, e)}
                      className="invisible flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 group-hover:visible"
                      title="Renomear"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* New board card */}
            <button
              onClick={createNewBoard}
              disabled={creating}
              className="flex flex-col items-start rounded-xl border-2 border-dashed border-neutral-300 p-4 text-left transition hover:border-neutral-400 hover:bg-white disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
                <Plus size={20} />
              </div>
              <p className="mt-3 text-sm font-semibold text-neutral-500">
                {creating ? 'Criando…' : 'Novo mapa'}
              </p>
            </button>
          </div>

          {boards.length === 0 && !creating && user && (
            <p className="mt-16 text-center text-sm text-neutral-400">
              Nenhum mapa ainda — clique em{' '}
              <strong className="text-neutral-600">Novo mapa</strong> para começar.
            </p>
          )}
        </div>
      </main>
    </>
  )
}
