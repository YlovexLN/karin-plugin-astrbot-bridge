import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const themeStorageKey = 'theme'
const themeChangedEventName = 'AstrBot 桥-theme-changed'
const karinThemeMessageType = 'karin-theme-change'

const ThemeProps = {
  light: 'light',
  dark: 'dark',
  system: 'system',
  inverse: 'inverse'
} as const

type StoredTheme = typeof ThemeProps.system | typeof ThemeProps.inverse
type AppliedTheme = typeof ThemeProps.light | typeof ThemeProps.dark

interface KarinThemeMessage {
  type: typeof karinThemeMessageType
  theme?: StoredTheme
  appliedTheme?: AppliedTheme
}

const isStoredTheme = (value: string | null): value is StoredTheme =>
  value === ThemeProps.system || value === ThemeProps.inverse

const isAppliedTheme = (value: unknown): value is AppliedTheme =>
  value === ThemeProps.light || value === ThemeProps.dark

const isKarinThemeMessage = (value: unknown): value is KarinThemeMessage => {
  if (!value || typeof value !== 'object') return false
  return (value as Partial<KarinThemeMessage>).type === karinThemeMessageType
}

const readStoredTheme = (): StoredTheme => {
  const rawValue = localStorage.getItem(themeStorageKey)
  if (isStoredTheme(rawValue)) return rawValue

  try {
    const parsedValue = JSON.parse(rawValue ?? '')
    if (isStoredTheme(parsedValue)) return parsedValue
  } catch {
    // Karin 主 Web 会把 theme 写成普通字符串，这里兼容空值和非 JSON 值
  }

  localStorage.setItem(themeStorageKey, ThemeProps.system)
  return ThemeProps.system
}

const getSystemTheme = (): AppliedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeProps.dark : ThemeProps.light

const getInverseSystemTheme = (): AppliedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeProps.light : ThemeProps.dark

const getAppliedTheme = (theme: StoredTheme): AppliedTheme =>
  theme === ThemeProps.system ? getSystemTheme() : getInverseSystemTheme()

const applyResolvedThemeClass = (appliedTheme: AppliedTheme) => {
  document.documentElement.classList.remove(ThemeProps.light, ThemeProps.dark)
  document.documentElement.classList.add(appliedTheme)
  document.documentElement.dataset.theme = appliedTheme
  return appliedTheme
}

export const useTheme = () => {
  const [theme, setThemeState] = useState<StoredTheme>(() => readStoredTheme())
  const [appliedTheme, setAppliedTheme] = useState<AppliedTheme>(() => getAppliedTheme(theme))
  const isKarinUpdateRef = useRef(false)

  const setTheme = useCallback((nextTheme: StoredTheme) => {
    localStorage.setItem(themeStorageKey, nextTheme)
    setThemeState(nextTheme)
    setAppliedTheme(applyResolvedThemeClass(getAppliedTheme(nextTheme)))
    window.dispatchEvent(new CustomEvent(themeChangedEventName, { detail: nextTheme }))
  }, [])

  const setSystemTheme = useCallback(() => setTheme(ThemeProps.system), [setTheme])
  const setInverseTheme = useCallback(() => setTheme(ThemeProps.inverse), [setTheme])
  const toggleTheme = useCallback(() => {
    setTheme(theme === ThemeProps.system ? ThemeProps.inverse : ThemeProps.system)
  }, [setTheme, theme])

  useEffect(() => {
    if (isKarinUpdateRef.current) {
      isKarinUpdateRef.current = false
    } else {
      setAppliedTheme(applyResolvedThemeClass(getAppliedTheme(theme)))
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleSystemThemeChange = () => {
      setAppliedTheme(applyResolvedThemeClass(getAppliedTheme(theme)))
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== themeStorageKey) return
      // iframe 内忽略 storage 事件，主题由 Karin 的 postMessage 推送，避免循环
      if (window.self !== window.top) return
      const nextTheme = readStoredTheme()
      setThemeState(nextTheme)
      setAppliedTheme(applyResolvedThemeClass(getAppliedTheme(nextTheme)))
    }

    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<StoredTheme>).detail
      if (!isStoredTheme(nextTheme)) return
      setThemeState(nextTheme)
      setAppliedTheme(applyResolvedThemeClass(getAppliedTheme(nextTheme)))
    }

    const handleKarinThemeMessage = (event: MessageEvent<unknown>) => {
      if (!isKarinThemeMessage(event.data)) return

      const messageTheme = event.data.theme
      const nextTheme: StoredTheme = isStoredTheme(messageTheme ?? null)
        ? (messageTheme as StoredTheme)
        : readStoredTheme()
      const nextAppliedTheme = isAppliedTheme(event.data.appliedTheme)
        ? event.data.appliedTheme
        : getAppliedTheme(nextTheme)

      isKarinUpdateRef.current = true
      localStorage.setItem(themeStorageKey, nextTheme)
      setThemeState(nextTheme)
      setAppliedTheme(applyResolvedThemeClass(nextAppliedTheme))
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(themeChangedEventName, handleThemeChange)
    window.addEventListener('message', handleKarinThemeMessage)

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(themeChangedEventName, handleThemeChange)
      window.removeEventListener('message', handleKarinThemeMessage)
    }
  }, [theme])

  return useMemo(
    () => ({
      theme,
      appliedTheme,
      isDark: appliedTheme === ThemeProps.dark,
      isSystem: theme === ThemeProps.system,
      setSystemTheme,
      setInverseTheme,
      toggleTheme
    }),
    [appliedTheme, setInverseTheme, setSystemTheme, theme, toggleTheme]
  )
}

type ThemeContextValue = ReturnType<typeof useTheme>

const ThemeContext = createContext<ThemeContextValue | null>(null)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const value = useTheme()
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useThemeContext = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useThemeContext 必须在 ThemeProvider 内使用')
  return context
}
