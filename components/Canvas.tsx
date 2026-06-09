'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Editor,
  getSnapshot,
  loadSnapshot,
  type TLEditorSnapshot,
  Tldraw,
  throttle,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

interface CanvasProps {
  boardId: string
  readOnly?: boolean
}

export default function Canvas({ boardId, readOnly = false }: CanvasProps) {
  const editorRef = useRef<Editor | null>(null)
  const isApplyingRemoteUpdate = useRef(false)
  const throttledSaveRef = useRef<((editor: Editor) => void) | null>(null)
  const [syncLabel, setSyncLabel] = useState(
    isSupabaseConfigured ? 'Conectando' : 'Local'
  )

  const loadBoard = useCallback(
    async (editor: Editor) => {
      if (!supabase) return

      const { data, error } = await supabase
        .from('boards')
        .select('document_state')
        .eq('id', boardId)
        .maybeSingle()

      if (error) {
        setSyncLabel('Local')
        return
      }

      if (!data?.document_state) {
        setSyncLabel('Online')
        return
      }

      try {
        isApplyingRemoteUpdate.current = true
        loadSnapshot(editor.store, data.document_state as Partial<TLEditorSnapshot>)
        setSyncLabel('Online')
      } catch {
        setSyncLabel('Local')
      } finally {
        isApplyingRemoteUpdate.current = false
      }
    },
    [boardId]
  )

  const saveBoard = useCallback(
    async (editor: Editor) => {
      if (!supabase || isApplyingRemoteUpdate.current || readOnly) return

      const snapshot = getSnapshot(editor.store)
      const { error } = await supabase
        .from('boards')
        .upsert({ id: boardId, document_state: snapshot })

      setSyncLabel(error ? 'Local' : 'Online')
    },
    [boardId, readOnly]
  )

  useEffect(() => {
    throttledSaveRef.current = throttle(saveBoard, 1500)

    return () => {
      throttledSaveRef.current = null
    }
  }, [saveBoard])

  useEffect(() => {
    const client = supabase
    if (!client) return

    const channel = client
      .channel(`board:${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boards',
          filter: `id=eq.${boardId}`,
        },
        (payload) => {
          const editor = editorRef.current
          if (!editor || !('document_state' in payload.new)) return

          try {
            isApplyingRemoteUpdate.current = true
            loadSnapshot(
              editor.store,
              payload.new.document_state as Partial<TLEditorSnapshot>
            )
            setSyncLabel('Online')
          } catch {
            setSyncLabel('Local')
          } finally {
            isApplyingRemoteUpdate.current = false
          }
        }
      )
      .subscribe((status) => {
        setSyncLabel(status === 'SUBSCRIBED' ? 'Online' : 'Conectando')
      })

    return () => {
      client.removeChannel(channel)
    }
  }, [boardId])

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      loadBoard(editor)

      if (readOnly) {
        editor.updateInstanceState({ isReadonly: true })
        return
      }

      editor.store.listen(() => throttledSaveRef.current?.(editor), {
        source: 'user',
        scope: 'document',
      })
    },
    [loadBoard, readOnly]
  )

  return (
    <div className="fixed inset-0">
      <Tldraw
        autoFocus
        onMount={handleMount}
        persistenceKey={`sinapsia-${boardId}`}
      />

      <div className="pointer-events-none fixed bottom-3 right-3 z-40 rounded-lg border border-black/10 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-neutral-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-950/80 dark:text-neutral-200">
        {readOnly ? 'Somente leitura' : syncLabel}
      </div>
    </div>
  )
}
