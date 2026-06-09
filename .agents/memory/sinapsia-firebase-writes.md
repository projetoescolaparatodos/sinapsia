---
name: Sinapsia Firebase write optimization
description: How to reduce Firebase writes from ~1/s to only on actual content changes
---

**Rule:** The tldraw store listener fires on ALL changes (camera pan, zoom, selection, cursor position, instance state). Filter by `CONTENT_TYPES = new Set(['shape', 'asset', 'page', 'bookmark'])` before triggering Firebase write. Also use debounce 1500ms (not 400ms).

**Why:** Without the filter, simply scrolling the canvas triggers a Firebase write every ~400ms. A board with 70 shapes uses ~80KB per write — this burns through Firebase free tier fast.

**How to apply:** Check `allChanged.some(r => CONTENT_TYPES.has(r?.typeName))` before calling `setSaveState('saving')` and `debouncedWrite()`.
