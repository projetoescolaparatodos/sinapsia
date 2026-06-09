import { useEffect, useState } from 'react'

function getInitial(): boolean {
  try {
    const stored = localStorage.getItem('sinapsia-theme')
    if (stored) return stored === 'dark'
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(getInitial)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try { localStorage.setItem('sinapsia-theme', isDark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [isDark])

  const toggle = () => setIsDark((v) => !v)

  return { isDark, toggle }
}
