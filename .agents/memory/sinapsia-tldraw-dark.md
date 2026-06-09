---
name: Sinapsia tldraw v5 dark mode
description: How to toggle dark mode in tldraw v5 dynamically (not just on mount)
---

The `darkMode={true}` prop on `<Tldraw>` only sets the initial value on mount. Changing it after mount does NOT update the editor's color scheme.

**Rule:** Add a `useEffect` that calls `editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })` when `isDark` changes and `editorReady` is true.

**Why:** tldraw v5 stores color scheme in user preferences (a reactive signal), not in the component prop. The prop is just an initializer.

**How to apply:** Always pair `darkMode={isDark}` on `<Tldraw>` with a `useEffect([isDark, editorReady])` that calls `editorRef.current.user.updateUserPreferences(...)`.
