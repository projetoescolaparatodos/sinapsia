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
  type TLRecord,
  getSnapshot,
  loadSnapshot,
  Tldraw,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { useLocation } from 'wouter'
import { Check, Copy, Eye, Home, PenLine, Save, Share2, X } from 'lucide-react'
import { db, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp } from '@/lib/firebase'
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
  console.log('[Sinapsia] uploadToCloudinary starting', { cloudName: CLOUD_NAME, preset: UPLOAD_PRESET, fileName: file.name, size: file.size })
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) throw new Error(`Upload falhou (${res.status})`)
  const data = await res.json()
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

// How long (ms) a locally-touched shape is protected from remote overwrites.
// While a user is drawing, their shapes are protected. Once they commit and
// 2s passes, remote changes can update those shapes normally.
const LOCAL_GUARD_MS = 2000

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

// ── Canvas overlay (portal into document.body, outside tldraw) ───────────────
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
      <div className="fixed right-2 top-2 z-[9000] flex items-center gap-1.5">
        <span
          className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur"
          style={{ color: dot }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
          {readOnly ? 'Somente leitura' : sync}
        </span>

        {user && !readOnly && (
          <span className="hidden items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur sm:flex">
            <span className="inline-block h-2 w-2 rounded-full border border-white shadow-sm" style={{ backgroundColor: MY_COLOR }} />
            {user.name}
          </span>
        )}

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

        {readOnly && (
          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur">
            <Eye size={15} />
            Visualização
          </span>
        )}

        {!readOnly && (
          <button
            onClick={() => setShowShare((v) => !v)}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-800 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <Share2 size={15} />
            Compartilhar
          </button>
        )}

        <button
          onClick={() => navigate('/')}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-neutral-950"
        >
          <Home size={15} />
          Início
        </button>
      </div>

      {showShare && (
        <>
          <div className="fixed inset-0 z-[9001] cursor-default" onClick={() => setShowShare(false)} />
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
  const isApplyingRemoteRef = useRef(false)
  // Blocks writes until the initial Firebase load completes (prevents
  // tldraw's own store init events from overwriting saved data)
  const initializedRef = useRef(false)
  // Tracks shape/record IDs recently modified by THIS user.
  // Remote updates skip these records for LOCAL_GUARD_MS to preserve
  // in-progress work during collaborative editing.
  const localTouchedRef = useRef<Map<string, number>>(new Map())

  const [editorReady, setEditorReady] = useState(false)
  const writeToFirebaseRef = useRef<((snap: TLEditorSnapshot) => Promise<void>) | null>(null)
  const throttledCursorRef = useRef<((x: number, y: number) => void) | null>(null)
  const userNameRef = useRef<string>(user?.name || 'Anônimo')
  const [sync, setSync] = useState<string>(db ? 'Conectando' : 'Local')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [otherCursors, setOtherCursors] = useState<Record<string, CursorData>>({})
  const [, setTick] = useState(0)

  useEffect(() => { userNameRef.current = user?.name || 'Anônimo' }, [user])

  // Periodically evict old entries from localTouchedRef so it doesn't grow unbounded
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

  // ── Shape-level merge (replaces full loadSnapshot for real-time updates) ──
  //
  // Instead of blindly replacing the entire canvas with a remote snapshot,
  // we apply a surgical per-record merge:
  //   • Records the local user recently touched are kept as-is (LOCAL_GUARD_MS)
  //   • All other records are updated to match the remote version
  //   • Shapes deleted remotely are removed locally (unless locally guarded)
  //
  // This means two people can draw simultaneously without erasing each other.
  const applyRemoteMerge = useCallback((editor: Editor, remoteSnap: Partial<TLEditorSnapshot>) => {
    const remoteStore = remoteSnap.document?.store as Record<string, TLRecord> | undefined
    if (!remoteStore) { setSync('Online'); return }

    const now = Date.now()
    const localSnap = getSnapshot(editor.store)
    const localStore = localSnap.document?.store as Record<string, TLRecord> | undefined ?? {}

    try {
      isApplyingRemoteRef.current = true

      const toUpsert: TLRecord[] = []
      const toRemove: string[] = []

      // Update/add all remote records, skipping locally-touched ones
      for (const record of Object.values(remoteStore)) {
        const id = (record as any).id as string
        const touchedAt = localTouchedRef.current.get(id)
        if (touchedAt && now - touchedAt < LOCAL_GUARD_MS) {
          continue // protect in-progress local edits
        }
        toUpsert.push(record)
      }

      // Remove records that exist locally but were deleted from remote
      // (only shapes — never remove page/document/asset records this way)
      for (const [id, record] of Object.entries(localStore)) {
        if ((record as any).typeName !== 'shape') continue
        if (remoteStore[id]) continue // still exists in remote, handled above
        const touchedAt = localTouchedRef.current.get(id)
        if (touchedAt && now - touchedAt < LOCAL_GUARD_MS) continue // locally created, keep
        toRemove.push(id)
      }

      const shapesMerged = toUpsert.filter((r: any) => r.typeName === 'shape').length
      const shapesRemoved = toRemove.length

      if (toUpsert.length > 0) editor.store.put(toUpsert)
      if (toRemove.length > 0) editor.store.remove(toRemove as any[])

      console.log('[Sinapsia] applyRemoteMerge OK', { boardId, shapesMerged, shapesRemoved, totalUpserted: toUpsert.length })
      setSync('Online')
    } catch (err) {
      console.error('[Sinapsia] applyRemoteMerge failed, falling back to loadSnapshot:', err)
      try { loadSnapshot(editor.store, remoteSnap) } catch (_) {}
      setSync('Online')
    } finally {
      isApplyingRemoteRef.current = false
    }
  }, [boardId])

  // Full snapshot replace — only used for the INITIAL load (no local edits yet)
  const applyRemoteSnapshot = useCallback((editor: Editor, snap: Partial<TLEditorSnapshot>) => {
    const shapeCount = countShapes(snap)
    console.log('[Sinapsia] applyRemoteSnapshot (initial load)', { boardId, shapeCount })
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

  // ── Write to Firebase ─────────────────────────────────────────────────────
  const writeToFirebase = useCallback(async (snap: TLEditorSnapshot) => {
    if (!db || readOnly) {
      setSaveState('idle')
      console.log('[Sinapsia] writeToFirebase skipped', { boardId, readOnly, dbConnected: Boolean(db) })
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
    if (!editorRef.current || !db || readOnly || saveState === 'saving') {
      console.log('[Sinapsia] handleManualSave skipped', { boardId, editorReady: Boolean(editorRef.current), dbConnected: Boolean(db), readOnly, saveState })
      return
    }
    console.log('[Sinapsia] handleManualSave starting', { boardId, session: MY_SESSION })
    setSaveState('saving')
    try {
      const snap = getSnapshot(editorRef.current.store)
      const shapeCount = countShapes(snap)
      await update(ref(db, `boards/${boardId}`), {
        document_state: serializeSnap(snap),
        last_saved_by: MY_SESSION,
        updated_at: serverTimestamp(),
      })
      console.log('[Sinapsia] handleManualSave succeeded', { boardId, shapeCount })
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
      console.log('[Sinapsia] Firebase initial load starting', { boardId })
      get(ref(db, `boards/${boardId}`))
        .then(async (fbSnap) => {
          const data = fbSnap.val()
          const remote = deserializeSnap(data?.document_state)
          const remoteShapeCount = countShapes(remote)
          const local = getSnapshot(editor.store)
          const localShapeCount = countShapes(local)

          console.log('[Sinapsia] Firebase initial load result', {
            boardId, hasRemote: Boolean(remote), remoteShapeCount,
            localShapeCount, lastSavedBy: data?.last_saved_by, updatedAt: data?.updated_at,
          })

          if (!remote || remoteShapeCount === 0) {
            console.log('[Sinapsia] Firebase initial load: no remote content', { boardId })
            setSync('Online')
          } else if (!readOnly && localShapeCount > remoteShapeCount) {
            console.log('[Sinapsia] Firebase initial load: local is newer, pushing', { boardId, localShapeCount, remoteShapeCount })
            await writeToFirebaseRef.current?.(local)
          } else {
            console.log('[Sinapsia] Firebase initial load: applying remote', { boardId, remoteShapeCount })
            applyRemoteSnapshot(editor, remote)
          }
        })
        .catch((err) => {
          console.error('[Sinapsia] Firebase initial load failed:', err)
          setSync('Local')
        })
        .finally(() => {
          console.log('[Sinapsia] Firebase initial load complete — writes unblocked', { boardId })
          initializedRef.current = true
        })
    } else {
      initializedRef.current = true
    }

    if (!readOnly) {
      const debouncedWrite = debounce(() => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        if (!initializedRef.current) {
          console.log('[Sinapsia] debouncedWrite blocked — not yet initialized', { boardId })
          return
        }
        writeToFirebaseRef.current?.(getSnapshot(currentEditor.store))
      }, 400)

      editor.store.listen((change) => {
        if (isApplyingRemoteRef.current) return
        if (!initializedRef.current) return

        // Track which records the local user just modified so the merge can
        // protect them from being overwritten by incoming remote snapshots
        const now = Date.now()
        for (const record of Object.values(change.changes.added ?? {})) {
          const id = (record as any)?.id
          if (id) localTouchedRef.current.set(id, now)
        }
        for (const entry of Object.values(change.changes.updated ?? {})) {
          const to = Array.isArray(entry) ? entry[1] : entry
          const id = (to as any)?.id
          if (id) localTouchedRef.current.set(id, now)
        }

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

    editor.store.listen(() => setTick((n) => n + 1), { source: 'all' })

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
      // Skip updates we ourselves wrote — we already have the latest
      if (!readOnly && data.last_saved_by === MY_SESSION) { setSync('Online'); return }

      const parsed = deserializeSnap(data.document_state)
      if (!parsed) { setSync('Online'); return }

      const shapeCount = countShapes(parsed)
      console.log('[Sinapsia] onValue: received remote update, merging', { boardId, shapeCount, from: data.last_saved_by })
      // Use shape-level merge (not full replace) so in-progress local work is preserved
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
        autoFocus
        onMount={handleMount}
        assets={assetStore}
        persistenceKey={`sinapsia-${boardId}`}
      />

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
