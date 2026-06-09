import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  type Editor,
  type TLEditorSnapshot,
  type TLAssetStore,
  getSnapshot,
  loadSnapshot,
  Tldraw,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { useLocation } from 'wouter'
import { Check, Copy, Eye, Home, PenLine, Save, Share2, X } from 'lucide-react'
import { db, ref, set, get, onValue, off, onDisconnect, serverTimestamp } from '@/lib/firebase'
import type { SinapUser } from '@/lib/auth'

// ── Session identity (stable per browser tab) ────────────────────────────────
const MY_SESSION = Math.random().toString(36).slice(2, 10)
const CURSOR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#ae3ec9', '#f08c00', '#0ca678']
const MY_COLOR = CURSOR_COLORS[parseInt(MY_SESSION.slice(0, 2), 36) % CURSOR_COLORS.length]

// ── Cloudinary upload ─────────────────────────────────────────────────────────
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'di3lqsxxc'
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'sinapsia_unsigned'

async function uploadToCloudinary(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) throw new Error(`Upload falhou (${res.status})`)
  const data = await res.json()
  return data.secure_url as string
}

const assetStore: TLAssetStore = {
  async upload(_asset, file) { return uploadToCloudinary(file) },
  resolve(asset) { return asset.props.src ?? null },
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...args: Parameters<T>) => {
    clearTimeout(t); t = setTimeout(() => fn(...args), ms)
  }) as T
}
function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let last = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now(); if (now - last >= ms) { last = now; fn(...args) }
  }) as T
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CursorData { x: number; y: number; color: string; ts: number; name?: string }
interface CanvasProps {
  boardId: string
  readOnly?: boolean
  user?: SinapUser | null
  onSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>
}

// ── ShareRow helper ───────────────────────────────────────────────────────────
function ShareRow({
  icon, label, description, onCopy, copied,
}: {
  icon: React.ReactNode; label: string; description: string
  onCopy: () => void; copied: boolean
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
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800"
      >
        <Copy size={14} />
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}

// ── Canvas overlay (rendered via portal INTO document.body, outside tldraw) ──
// This guarantees click events reach our handlers — tldraw cannot intercept them.
interface OverlayProps {
  boardId: string
  readOnly: boolean
  sync: string
  user: SinapUser | null
  saveState: 'idle' | 'saving' | 'saved'
  onManualSave: () => void
}

function CanvasOverlay({ boardId, readOnly, sync, user, saveState, onManualSave }: OverlayProps) {
  const [, navigate] = useLocation()
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState<'edit' | 'view' | null>(null)

  const copyLink = async (type: 'edit' | 'view') => {
    const link = type === 'edit'
      ? `${window.location.origin}/b/${boardId}`
      : `${window.location.origin}/b/${boardId}?mode=view`
    await navigator.clipboard.writeText(link)
    setCopied(type)
    setTimeout(() => setCopied(null), 1600)
  }

  const dot = sync === 'Online' ? '#0ca678' : sync === 'Local' ? '#868e96' : '#adb5bd'

  const saveLabel =
    saveState === 'saving' ? 'Salvando…' :
    saveState === 'saved'  ? 'Salvo!' : 'Salvar'

  return createPortal(
    <>
      {/* ── Main controls bar ── */}
      <div className="fixed right-2 top-2 z-[9000] flex items-center gap-1.5">
        {/* Sync indicator */}
        <span
          className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur"
          style={{ color: dot }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
          {readOnly ? 'Somente leitura' : sync}
        </span>

        {/* User name badge */}
        {user && !readOnly && (
          <span className="hidden items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur sm:flex">
            <span
              className="inline-block h-2 w-2 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: MY_COLOR }}
            />
            {user.name}
          </span>
        )}

        {/* Manual save button */}
        {!readOnly && (
          <button
            onClick={onManualSave}
            disabled={saveState === 'saving'}
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60 ${
              saveState === 'saved' ? 'text-emerald-600' : 'text-neutral-700'
            }`}
          >
            {saveState === 'saved' ? <Check size={14} /> : <Save size={14} />}
            {saveLabel}
          </button>
        )}

        {/* View-only badge */}
        {readOnly && (
          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur">
            <Eye size={15} />
            Visualização
          </span>
        )}

        {/* Share button */}
        {!readOnly && (
          <button
            onClick={() => setShowShare((v) => !v)}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-800 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <Share2 size={15} />
            Compartilhar
          </button>
        )}

        {/* Home / Início */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-neutral-950"
        >
          <Home size={15} />
          Início
        </button>
      </div>

      {/* ── Share dropdown (portal-level, no stacking-context issues) ── */}
      {showShare && (
        <>
          <div
            className="fixed inset-0 z-[9001] cursor-default"
            onClick={() => setShowShare(false)}
          />
          <div className="fixed right-2 top-[52px] z-[9002] w-80 rounded-xl border border-neutral-200 bg-white p-3 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">Links do mapa</p>
              <button
                onClick={() => setShowShare(false)}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X size={15} />
              </button>
            </div>
            <ShareRow
              icon={<PenLine size={16} />}
              label="Edição"
              description="Qualquer pessoa com o link pode editar."
              onCopy={() => copyLink('edit')}
              copied={copied === 'edit'}
            />
            <ShareRow
              icon={<Eye size={16} />}
              label="Visualização"
              description="Abre o mapa em modo somente leitura."
              onCopy={() => copyLink('view')}
              copied={copied === 'view'}
            />
          </div>
        </>
      )}
    </>,
    document.body
  )
}

// ── Canvas component ──────────────────────────────────────────────────────────
export default function Canvas({ boardId, readOnly = false, user = null }: CanvasProps) {
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const debouncedSaveRef = useRef<((snap: TLEditorSnapshot) => void) | null>(null)
  const throttledCursorRef = useRef<((x: number, y: number) => void) | null>(null)
  const userNameRef = useRef<string>(user?.name || 'Anônimo')
  const lastLocalEditRef = useRef<number>(0)
  const [sync, setSync] = useState<string>(db ? 'Conectando' : 'Local')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [otherCursors, setOtherCursors] = useState<Record<string, CursorData>>({})
  const [, setTick] = useState(0)

  useEffect(() => {
    userNameRef.current = user?.name || 'Anônimo'
  }, [user])

  // ── Save to Firebase ─────────────────────────────────────────────────────
  const saveToFirebase = useCallback(async (snap: TLEditorSnapshot) => {
    if (!db || readOnly) return
    try {
      await set(ref(db, `boards/${boardId}`), {
        document_state: snap,
        last_saved_by: MY_SESSION,
        updated_at: serverTimestamp(),
      })
      setSync('Online')
    } catch { setSync('Local') }
  }, [boardId, readOnly])

  useEffect(() => {
    debouncedSaveRef.current = debounce(saveToFirebase, 300)
    return () => { debouncedSaveRef.current = null }
  }, [saveToFirebase])

  // ── Manual save ──────────────────────────────────────────────────────────
  const handleManualSave = useCallback(async () => {
    if (!editorRef.current || !db || readOnly || saveState === 'saving') return
    setSaveState('saving')
    try {
      const snap = getSnapshot(editorRef.current.store)
      await set(ref(db, `boards/${boardId}`), {
        document_state: snap,
        last_saved_by: MY_SESSION,
        updated_at: serverTimestamp(),
      })
      setSync('Online')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2200)
    } catch {
      setSync('Local')
      setSaveState('idle')
    }
  }, [boardId, readOnly, saveState])

  // ── Mount ────────────────────────────────────────────────────────────────
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    if (readOnly) {
      editor.updateInstanceState({ isReadonly: true })
      if (db) {
        get(ref(db, `boards/${boardId}`))
          .then((snap) => {
            const data = snap.val()
            if (data?.document_state) {
              try { loadSnapshot(editor.store, data.document_state as Partial<TLEditorSnapshot>) } catch { /* ok */ }
            }
            setSync('Online')
          })
          .catch(() => setSync('Local'))
      }
    }

    if (!readOnly) {
      editor.store.listen(() => {
        lastLocalEditRef.current = Date.now()
        const snap = getSnapshot(editor.store)
        debouncedSaveRef.current?.(snap)
      }, { source: 'user', scope: 'document' })
    }

    throttledCursorRef.current = throttle((x: number, y: number) => {
      if (!db || readOnly) return
      set(ref(db, `cursors/${boardId}/${MY_SESSION}`), {
        x, y, color: MY_COLOR, ts: Date.now(), name: userNameRef.current,
      }).catch(() => {})
    }, 50)

    editor.store.listen(() => {
      const pt = editor.inputs.currentPagePoint
      if (pt) throttledCursorRef.current?.(pt.x, pt.y)
    }, { source: 'user' })

    editor.store.listen(() => setTick((n) => n + 1), { source: 'all' })

    setEditorReady(true)
  }, [boardId, readOnly])

  // ── Real-time board sync ─────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || !db || !editorRef.current) return
    const boardRef = ref(db, `boards/${boardId}`)

    onValue(boardRef, (snapshot) => {
      const data = snapshot.val()
      if (!data?.document_state) { setSync('Online'); return }
      if (!readOnly && data.last_saved_by === MY_SESSION) { setSync('Online'); return }
      if (!readOnly && Date.now() - lastLocalEditRef.current < 1500) { setSync('Online'); return }
      try {
        loadSnapshot(editorRef.current!.store, data.document_state as Partial<TLEditorSnapshot>)
        setSync('Online')
      } catch { setSync('Local') }
    }, () => setSync('Local'))

    return () => off(boardRef)
  }, [editorReady, boardId, readOnly])

  // ── Cursor disconnect cleanup ────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || !db || readOnly) return
    const cursorRef = ref(db, `cursors/${boardId}/${MY_SESSION}`)
    onDisconnect(cursorRef).remove()
    return () => { set(cursorRef, null).catch(() => {}) }
  }, [editorReady, boardId, readOnly])

  // ── Other cursors subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!db) return
    const cursorsRef = ref(db, `cursors/${boardId}`)
    onValue(cursorsRef, (snapshot) => {
      const all = snapshot.val() as Record<string, CursorData> | null
      if (!all) { setOtherCursors({}); return }
      const others: Record<string, CursorData> = {}
      const now = Date.now()
      for (const [id, c] of Object.entries(all)) {
        if (id !== MY_SESSION && now - c.ts < 8000) others[id] = c
      }
      setOtherCursors(others)
    })
    return () => off(ref(db!, `cursors/${boardId}`))
  }, [boardId])

  // ── Cursor screen-space overlays ─────────────────────────────────────────
  const editor = editorRef.current
  const cursorElements = editor
    ? Object.entries(otherCursors).map(([id, c]) => {
        const pt = editor.pageToScreen({ x: c.x, y: c.y })
        return (
          <div
            key={id}
            className="pointer-events-none fixed z-[8999]"
            style={{ left: pt.x - 2, top: pt.y - 2 }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M4 2L4 17L8 13L11 20L13.5 19L10.5 12L16 12L4 2Z"
                fill={c.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {c.name && (
              <div
                className="absolute left-5 top-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                style={{ backgroundColor: c.color }}
              >
                {c.name}
              </div>
            )}
          </div>
        )
      })
    : []

  return (
    <div className="fixed inset-0">
      <Tldraw
        autoFocus
        onMount={handleMount}
        assets={assetStore}
        persistenceKey={`sinapsia-${boardId}`}
      />

      {/* Overlay via portal — completely outside tldraw's DOM tree */}
      <CanvasOverlay
        boardId={boardId}
        readOnly={readOnly}
        sync={sync}
        user={user}
        saveState={saveState}
        onManualSave={handleManualSave}
      />

      {cursorElements}
    </div>
  )
}
