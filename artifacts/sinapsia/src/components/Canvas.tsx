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
import { Check, Copy, Eye, Home, Moon, PenLine, Save, Share2, Sun, X } from 'lucide-react'
import { db, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp } from '@/lib/firebase'
import type { SinapUser } from '@/lib/auth'
import { useDarkMode } from '@/hooks/useDarkMode'

// ── Session identity (stable per browser tab) ────────────────────────────────
const MY_SESSION = Math.random().toString(36).slice(2, 10)
const CURSOR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#ae3ec9', '#f08c00', '#0ca678']
const MY_COLOR = CURSOR_COLORS[parseInt(MY_SESSION.slice(0, 2), 36) % CURSOR_COLORS.length]

// ── Cloudinary upload ─────────────────────────────────────────────────────────
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'di3lqsxxc'
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'sinapisa'

async function uploadToCloudinary(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  console.log('[Sinapsia] uploadToCloudinary starting', { cloudName: CLOUD_NAME, preset: UPLOAD_PRESET, fileName: file.name, size: file.size, type: file.type })
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  )
  const data = await res.json()
  if (!res.ok) {
    console.error('[Sinapsia] uploadToCloudinary failed', { status: res.status, error: data?.error?.message ?? data })
    throw new Error(data?.error?.message ?? `Upload falhou (${res.status})`)
  }
  console.log('[Sinapsia] uploadToCloudinary succeeded', { url: data.secure_url })
  return data.secure_url as string
}

const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    const src = await uploadToCloudinary(file)
    return { src }
  },
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

// Record types that represent actual canvas content (shapes, pages, assets).
// Changes to camera, selection, instance state, etc. are ignored for auto-save
// to avoid burning Firebase writes on every cursor move or scroll.
const CONTENT_TYPES = new Set(['shape', 'asset', 'page', 'bookmark'])

// How long (ms) after the last local edit before remote snapshots can be applied.
const LOCAL_GUARD_MS = 2000

// ── ShareRow helper ───────────────────────────────────────────────────────────
function ShareRow({
  icon, label, description, onCopy, copied,
}: {
  icon: React.ReactNode; label: string; description: string
  onCopy: () => void; copied: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 py-3 first:border-t-0">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 text-[#0f766e]">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</p>
          <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">{description}</p>
        </div>
      </div>
      <button
        onClick={onCopy}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-neutral-950 dark:bg-neutral-100 px-3 text-xs font-semibold text-white dark:text-neutral-950 transition hover:bg-neutral-800 dark:hover:bg-white"
      >
        <Copy size={14} />
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}

// ── Canvas overlay (portal into document.body, outside tldraw) ───────────────
interface OverlayProps {
  boardId: string
  readOnly: boolean
  sync: string
  user: SinapUser | null
  saveState: 'idle' | 'saving' | 'saved'
  onManualSave: () => void
  isDark: boolean
  onThemeToggle: () => void
}

function CanvasOverlay({ boardId, readOnly, sync, user, saveState, onManualSave, isDark, onThemeToggle }: OverlayProps) {
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

  const btnCls = 'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white/90 dark:bg-neutral-900/90 px-2 sm:px-3 text-xs font-semibold text-neutral-700 dark:text-neutral-300 shadow-sm backdrop-blur transition hover:bg-white dark:hover:bg-neutral-800'

  return createPortal(
    <>
      <div className="fixed right-2 top-2 z-[9000] flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
        {/* Sync status */}
        <span
          className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-white/90 dark:bg-neutral-900/90 px-2 sm:px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur"
          style={{ color: dot }}
        >
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
          <span className="hidden sm:inline">{readOnly ? 'Somente leitura' : sync}</span>
        </span>

        {/* User chip — sm+ only */}
        {user && !readOnly && (
          <span className="hidden lg:flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-white/90 dark:bg-neutral-900/90 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300 shadow-sm backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full border border-white shadow-sm" style={{ backgroundColor: MY_COLOR }} />
            {user.name}
          </span>
        )}

        {/* Save */}
        {!readOnly && (
          <button
            onClick={onManualSave}
            disabled={saveState === 'saving'}
            className={`${btnCls} disabled:opacity-60 ${saveState === 'saved' ? '!text-emerald-600' : ''}`}
          >
            {saveState === 'saved' ? <Check size={14} /> : <Save size={14} />}
            <span className="hidden sm:inline">{saveLabel}</span>
          </button>
        )}

        {/* Read-only badge */}
        {readOnly && (
          <span className={btnCls}>
            <Eye size={15} />
            <span className="hidden sm:inline">Visualização</span>
          </span>
        )}

        {/* Share */}
        {!readOnly && (
          <button onClick={() => setShowShare((v) => !v)} className={btnCls}>
            <Share2 size={15} />
            <span className="hidden sm:inline">Compartilhar</span>
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className={btnCls}
          title={isDark ? 'Mudar para claro' : 'Mudar para escuro'}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Home */}
        <button onClick={() => navigate('/')} className={btnCls}>
          <Home size={15} />
          <span className="hidden sm:inline">Início</span>
        </button>
      </div>

      {showShare && (
        <>
          <div className="fixed inset-0 z-[9001] cursor-default" onClick={() => setShowShare(false)} />
          <div className="fixed right-2 top-[52px] z-[9002] w-80 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Links do mapa</p>
              <button
                onClick={() => setShowShare(false)}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
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
  const { isDark, toggle: toggleTheme } = useDarkMode()

  const editorRef = useRef<Editor | null>(null)
  const isApplyingRemoteRef = useRef(false)
  const initializedRef = useRef(false)
  const localTouchedRef = useRef<Map<string, number>>(new Map())
  const pendingRemoteSnapRef = useRef<Partial<TLEditorSnapshot> | null>(null)

  const [editorReady, setEditorReady] = useState(false)

  // Sync dark mode into tldraw's editor preferences reactively
  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })
  }, [isDark, editorReady])

  const writeToFirebaseRef = useRef<((snap: TLEditorSnapshot) => Promise<void>) | null>(null)
  const throttledCursorRef = useRef<((x: number, y: number) => void) | null>(null)
  const userNameRef = useRef<string>(user?.name || 'Anônimo')
  const [sync, setSync] = useState<string>(db ? 'Conectando' : 'Local')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [otherCursors, setOtherCursors] = useState<Record<string, CursorData>>({})
  const [, setTick] = useState(0)

  useEffect(() => { userNameRef.current = user?.name || 'Anônimo' }, [user])

  // Evict stale localTouched entries periodically
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - LOCAL_GUARD_MS * 5
      for (const [id, ts] of localTouchedRef.current) {
        if (ts < cutoff) localTouchedRef.current.delete(id)
      }
    }, 5_000)
    return () => clearInterval(timer)
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const serializeSnap = (snap: TLEditorSnapshot): string => JSON.stringify(snap)

  const deserializeSnap = (raw: unknown): Partial<TLEditorSnapshot> | null => {
    if (!raw) return null
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : (raw as Partial<TLEditorSnapshot>)
    } catch { return null }
  }

  const countShapes = (snap: Partial<TLEditorSnapshot> | null): number => {
    const records = snap?.document?.store
    if (!records) return 0
    return Object.values(records).filter((r: any) => r?.typeName === 'shape').length
  }

  // ── Full snapshot replace (safe) ──────────────────────────────────────────
  const applyRemoteSnapshot = useCallback((editor: Editor, snap: Partial<TLEditorSnapshot>) => {
    const shapeCount = countShapes(snap)
    console.log('[Sinapsia] applyRemoteSnapshot', { boardId, shapeCount })
    try {
      isApplyingRemoteRef.current = true
      loadSnapshot(editor.store, snap)
      setSync('Online')
      console.log('[Sinapsia] applyRemoteSnapshot OK', { boardId, shapeCount })
    } catch (err) {
      console.error('[Sinapsia] applyRemoteSnapshot failed:', err)
      setSync('Local')
    } finally {
      isApplyingRemoteRef.current = false
    }
  }, [boardId])

  // ── Deferred remote merge ─────────────────────────────────────────────────
  // When user is drawing → queue; idle-flush timer applies it once they pause.
  // Avoids calling editor.store.put() directly (causes AtomMap errors in tldraw v5).
  const applyRemoteMerge = useCallback((editor: Editor, remoteSnap: Partial<TLEditorSnapshot>) => {
    const now = Date.now()
    const isDrawing = [...localTouchedRef.current.values()].some(ts => now - ts < LOCAL_GUARD_MS)

    if (isDrawing) {
      pendingRemoteSnapRef.current = remoteSnap
      console.log('[Sinapsia] applyRemoteMerge: deferred — user is drawing', { boardId })
      return
    }

    console.log('[Sinapsia] applyRemoteMerge: user idle — applying', { boardId, shapeCount: countShapes(remoteSnap) })
    applyRemoteSnapshot(editor, remoteSnap)
  }, [boardId, applyRemoteSnapshot])

  // ── Idle-flush timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady) return
    const timer = setInterval(() => {
      if (!pendingRemoteSnapRef.current || !editorRef.current) return
      const now = Date.now()
      const isDrawing = [...localTouchedRef.current.values()].some(ts => now - ts < LOCAL_GUARD_MS)
      if (isDrawing) return
      const snap = pendingRemoteSnapRef.current
      pendingRemoteSnapRef.current = null
      console.log('[Sinapsia] idle-flush: applying deferred snapshot', { boardId, shapeCount: countShapes(snap) })
      applyRemoteSnapshot(editorRef.current!, snap)
    }, 500)
    return () => clearInterval(timer)
  }, [applyRemoteSnapshot, boardId, editorReady])

  // ── Write to Firebase ─────────────────────────────────────────────────────
  const writeToFirebase = useCallback(async (snap: TLEditorSnapshot) => {
    if (!db || readOnly) {
      setSaveState('idle')
      return
    }
    const serialized = serializeSnap(snap)
    const shapeCount = countShapes(snap)
    try {
      console.log('[Sinapsia] writeToFirebase starting', { boardId, shapeCount, snapshotSize: serialized.length, session: MY_SESSION })
      await update(ref(db, `boards/${boardId}`), {
        document_state: serialized,
        last_saved_by: MY_SESSION,
        updated_at: serverTimestamp(),
      })
      console.log('[Sinapsia] writeToFirebase succeeded', { boardId, shapeCount })
      setSync('Online')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1200)
    } catch (err) {
      console.error('[Sinapsia] writeToFirebase failed:', err)
      setSync('Local')
      setSaveState('idle')
    }
  }, [boardId, readOnly])

  useEffect(() => { writeToFirebaseRef.current = writeToFirebase }, [writeToFirebase])

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleManualSave = useCallback(async () => {
    if (!editorRef.current || !db || readOnly || saveState === 'saving') return
    setSaveState('saving')
    try {
      const snap = getSnapshot(editorRef.current.store)
      await update(ref(db, `boards/${boardId}`), {
        document_state: serializeSnap(snap),
        last_saved_by: MY_SESSION,
        updated_at: serverTimestamp(),
      })
      setSync('Online')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2200)
    } catch (err) {
      console.error('[Sinapsia] handleManualSave failed:', err)
      setSync('Local')
      setSaveState('idle')
    }
  }, [boardId, readOnly, saveState])

  // ── Mount ─────────────────────────────────────────────────────────────────
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    console.log('[Sinapsia] handleMount', { boardId, readOnly, session: MY_SESSION, dbConnected: Boolean(db) })

    if (readOnly) editor.updateInstanceState({ isReadonly: true })

    if (db) {
      get(ref(db, `boards/${boardId}`))
        .then(async (fbSnap) => {
          const data = fbSnap.val()
          const remote = deserializeSnap(data?.document_state)
          const remoteShapeCount = countShapes(remote)
          const local = getSnapshot(editor.store)
          const localShapeCount = countShapes(local)

          console.log('[Sinapsia] Firebase initial load result', {
            boardId, hasRemote: Boolean(remote), remoteShapeCount, localShapeCount,
            lastSavedBy: data?.last_saved_by, updatedAt: data?.updated_at,
          })

          if (!remote || remoteShapeCount === 0) {
            setSync('Online')
          } else if (!readOnly && localShapeCount > remoteShapeCount) {
            await writeToFirebaseRef.current?.(local)
          } else {
            applyRemoteSnapshot(editor, remote)
          }
        })
        .catch((err) => {
          console.error('[Sinapsia] Firebase initial load failed:', err)
          setSync('Local')
        })
        .finally(() => {
          initializedRef.current = true
        })
    } else {
      initializedRef.current = true
    }

    if (!readOnly) {
      // Debounce at 1.5s — only fires on actual content changes (shapes/assets/pages),
      // not on camera pan, zoom, cursor moves, or selection changes.
      const debouncedWrite = debounce(() => {
        const currentEditor = editorRef.current
        if (!currentEditor || !initializedRef.current) return
        writeToFirebaseRef.current?.(getSnapshot(currentEditor.store))
      }, 1500)

      editor.store.listen((change) => {
        if (isApplyingRemoteRef.current) return
        if (!initializedRef.current) return

        // Collect all changed records
        const allChanged = [
          ...Object.values(change.changes.added ?? {}),
          ...Object.values(change.changes.updated ?? {}).map((e: any) => Array.isArray(e) ? e[1] : e),
          ...Object.values(change.changes.removed ?? {}),
        ]

        // Track shape touches for collaborative merge protection
        const now = Date.now()
        for (const r of allChanged) {
          const id = (r as any)?.id
          if (id && (r as any)?.typeName === 'shape') localTouchedRef.current.set(id, now)
        }

        // Only write to Firebase when shapes, pages, or assets actually changed.
        // Camera, selection, instance state changes are ignored.
        const hasContentChange = allChanged.some((r: any) => CONTENT_TYPES.has(r?.typeName))
        if (!hasContentChange) return

        setSaveState('saving')
        debouncedWrite()
      }, { source: 'all' })
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

    setEditorReady(true)
  }, [applyRemoteSnapshot, boardId, readOnly])

  // ── Real-time board sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || !db || !editorRef.current) return
    const boardRef = ref(db, `boards/${boardId}`)

    console.log('[Sinapsia] onValue subscription starting', { boardId, session: MY_SESSION })

    onValue(boardRef, (snapshot) => {
      const data = snapshot.val()
      if (!data?.document_state) { setSync('Online'); return }
      if (!readOnly && data.last_saved_by === MY_SESSION) { setSync('Online'); return }
      const parsed = deserializeSnap(data.document_state)
      if (!parsed) { setSync('Online'); return }
      console.log('[Sinapsia] onValue: remote update received', { boardId, shapeCount: countShapes(parsed), from: data.last_saved_by })
      applyRemoteMerge(editorRef.current!, parsed)
    }, (err) => { console.error('[Sinapsia] onValue error:', err); setSync('Local') })

    return () => {
      console.log('[Sinapsia] onValue subscription cleanup', { boardId })
      off(boardRef)
    }
  }, [applyRemoteMerge, editorReady, boardId, readOnly])

  // ── Cursor disconnect cleanup ─────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || !db || readOnly) return
    const cursorRef = ref(db, `cursors/${boardId}/${MY_SESSION}`)
    onDisconnect(cursorRef).remove()
    return () => { set(cursorRef, null).catch(() => {}) }
  }, [editorReady, boardId, readOnly])

  // ── Other cursors subscription ────────────────────────────────────────────
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

  // ── Cursor screen-space overlays ──────────────────────────────────────────
  const editor = editorRef.current
  const cursorElements = editor
    ? Object.entries(otherCursors).map(([id, c]) => {
        const pt = editor.pageToScreen({ x: c.x, y: c.y })
        return (
          <div key={id} className="pointer-events-none fixed z-[8999]" style={{ left: pt.x - 2, top: pt.y - 2 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M4 2L4 17L8 13L11 20L13.5 19L10.5 12L16 12L4 2Z" fill={c.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            {c.name && (
              <div className="absolute left-5 top-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow" style={{ backgroundColor: c.color }}>
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
        key={`tldraw-${boardId}`}
        onMount={handleMount}
        assets={assetStore}
        darkMode={isDark}
      />

      <CanvasOverlay
        boardId={boardId}
        readOnly={readOnly}
        sync={sync}
        user={user}
        saveState={saveState}
        onManualSave={handleManualSave}
        isDark={isDark}
        onThemeToggle={toggleTheme}
      />

      {cursorElements}
    </div>
  )
}
