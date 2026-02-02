import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'

type ThemeValue = 'light' | 'dark'

const STORAGE_KEY = 'pensjon-deployment-audit-theme'

interface ThemeContextType {
  theme: ThemeValue
  setTheme: (theme: ThemeValue) => void
  toggleTheme: () => void
  isLoaded: boolean
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeValue>('light')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeValue | null
    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored)
    }
    setIsLoaded(true)
  }, [])

  const setTheme = useCallback((newTheme: ThemeValue) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }, [theme, setTheme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isLoaded }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
