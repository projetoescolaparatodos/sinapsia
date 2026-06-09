import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Editor,
  type TLEditorSnapshot,
  type TLAssetStore,
  getSnapshot,
  loadSnapshot,
  Tldraw,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { db, ref, set, onValue, off, serverTimestamp } from '@/lib/firebase'

interface CanvasProps {
  boardId: string
  readOnly?: boolean
}

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
  async upload(_asset, file) {
    return await uploadToCloudinary(file)
  },
  resolve(asset) {
    return asset.props.src ?? null
  },
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as T
}

type SyncState = 'Conectando' | 'Online' | 'Local' | 'Somente leitura'

export default function Canvas({ boardId, readOnly = false }: CanvasProps) {
  const editorRef = useRef<Editor | null>(null)
  const isApplyingRemote = useRef(false)
  const debouncedSave = useRef<((snap: TLEditorSnapshot) => void) | null>(null)
  const [sync, setSync] = useState<SyncState>(
    readOnly ? 'Somente leitura' : db ? 'Conectando' : 'Local'
  )

  // ── Save to Firebase ─────────────────────────────────────────────────────
  const saveToFirebase = useCallback(
    async (snap: TLEditorSnapshot) => {
      if (!db || isApplyingRemote.current || readOnly) return
      try {
        await set(ref(db, `boards/${boardId}`), {
          document_state: snap,
          updated_at: serverTimestamp(),
        })
        setSync('Online')
      } catch {
        setSync('Local')
      }
    },
    [boardId, readOnly]
  )

  useEffect(() => {
    debouncedSave.current = debounce(saveToFirebase, 300)
    return () => { debouncedSave.current = null }
  }, [saveToFirebase])

  // ── Load + subscribe to Firebase ─────────────────────────────────────────
  const subscribe = useCallback(
    (editor: Editor) => {
      if (!db) return

      const boardRef = ref(db, `boards/${boardId}/document_state`)

      onValue(
        boardRef,
        (snapshot) => {
          const data = snapshot.val()
          if (data && !isApplyingRemote.current) {
            try {
              isApplyingRemote.current = true
              loadSnapshot(editor.store, data as Partial<TLEditorSnapshot>)
            } finally {
              isApplyingRemote.current = false
            }
          }
          setSync('Online')
        },
        () => {
          // Firebase unreachable (DB not enabled or bad URL) — silent fallback
          setSync('Local')
        }
      )

      return () => {
        off(boardRef)
      }
    },
    [boardId]
  )

  // ── Mount ─────────────────────────────────────────────────────────────────
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor

      if (readOnly) {
        editor.updateInstanceState({ isReadonly: true })
        setSync('Somente leitura')
        subscribe(editor)
        return
      }

      const unsub = subscribe(editor)

      editor.store.listen(
        () => {
          const snap = getSnapshot(editor.store)
          debouncedSave.current?.(snap)
        },
        { source: 'user', scope: 'document' }
      )

      return () => unsub?.()
    },
    [subscribe, readOnly]
  )

  const syncColor =
    sync === 'Online' ? 'text-emerald-600'
    : sync === 'Local' ? 'text-neutral-500'
    : sync === 'Somente leitura' ? 'text-amber-600'
    : 'text-neutral-400'

  return (
    <div className="fixed inset-0">
      <Tldraw
        autoFocus
        onMount={handleMount}
        assets={assetStore}
        persistenceKey={`sinapsia-${boardId}`}
      />

      <div
        className={`pointer-events-none fixed bottom-3 right-3 z-50 rounded-lg border border-black/10 bg-white/90 px-2.5 py-1.5 text-xs font-semibold shadow-sm backdrop-blur ${syncColor}`}
      >
        {sync}
      </div>
    </div>
  )
}
