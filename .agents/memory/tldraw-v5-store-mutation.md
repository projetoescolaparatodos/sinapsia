---
name: tldraw v5 store mutation
description: Direct store.put()/remove() calls in tldraw v5 cause "AtomMap: key [object Object] not found" errors; only loadSnapshot is safe for external data
---

## Rule
Never call `editor.store.put()` or `editor.store.remove()` directly from outside tldraw event handlers when merging remote data. These cause `AtomMap: key [object Object] not found` runtime errors in tldraw v5.

**Why:** tldraw v5 uses a reactive atom registry internally. Directly mutating the store bypasses the expected transaction paths and corrupts internal atom state, especially for non-shape records (pages, camera, instance).

**How to apply:**
- Use `loadSnapshot(editor.store, snap)` (from 'tldraw') for any remote data merge — it's the only safe path.
- To protect in-progress drawing from remote overwrites: queue the remote snapshot in a ref and apply it via a timer once the user pauses (idle-flush pattern), rather than calling store.put() for a partial merge.
- Wrap loadSnapshot calls with `isApplyingRemoteRef.current = true/false` so the store listener doesn't write the received state back to Firebase.
