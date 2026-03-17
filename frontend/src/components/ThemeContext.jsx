import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ theme: 'system', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('lm-theme') || 'system' }
    catch { return 'system' }
  })

  const setTheme = (t) => {
    setThemeState(t)
    try { localStorage.setItem('lm-theme', t) } catch {}
  }

  useEffect(() => {
    const root = document.documentElement
    const applyDark  = () => root.classList.add('dark')
    const applyLight = () => root.classList.remove('dark')

    if (theme === 'dark') {
      applyDark()
      return
    }
    if (theme === 'light') {
      applyLight()
      return
    }

    // 'system' — follow OS preference and listen for changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.matches ? applyDark() : applyLight()

    const handler = (e) => e.matches ? applyDark() : applyLight()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)