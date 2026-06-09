---
name: Firebase + tldraw snapshot save bugs
description: Three silent failure modes when persisting tldraw v5 snapshots to Firebase Realtime Database
---

## Rule

When saving tldraw v5 snapshots to Firebase Realtime Database, three things must be true:

1. **No `scope:'document'` filter on store.listen** — tldraw v5 may not honour this scope for all change types; the listener silently never fires. Use `{ source: 'user' }` only.

2. **Store snapshot as JSON string, not nested object** — tldraw record IDs (`shape:uuid`, `page:uuid`) contain colons which can cause silent write failures when used as Firebase nested object keys. Use `JSON.stringify(snapshot)` and `JSON.parse()` on read.

3. **Create the debounced write INSIDE the onMount callback** — setting a `debouncedSaveRef` via `useEffect` races against tldraw's own `onMount` effect; the ref is null when the first store change fires. Creating `debounce(writeFn, 400)` inline inside `handleMount` avoids this entirely.

**Why:** All three bugs produce zero console errors — data just silently never reaches Firebase. Very hard to debug without knowing to look.

**How to apply:** Any time the tldraw editor store listener is wired to Firebase saves.

Additional: use `update()` not `set()` to preserve board metadata (created_at, created_by) fields already on the node.
