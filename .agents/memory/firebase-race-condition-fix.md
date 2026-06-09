---
name: Firebase race condition with tldraw init
description: tldraw fires store events during initialization that can overwrite Firebase data before the initial load completes
---

## Rule
Block all Firebase writes until the initial `get()` from Firebase completes (use `initializedRef.current` flag). In the store listener, return early if `!initializedRef.current`.

**Why:** When tldraw mounts, it replays persisted IndexedDB state and fires store change events. If Firebase writes are enabled before the initial remote load, these events can overwrite the 64-shape board with an empty local state from a fresh tab.

**How to apply:**
- Set `initializedRef.current = false` on mount.
- Set `initializedRef.current = true` in the `.finally()` of the initial Firebase `get()` call.
- Check `if (!initializedRef.current) return` at the top of the debounced write callback.
