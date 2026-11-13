import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { hasToken } from './api/bridge'
import { panelTokenEventName } from './auth/panelToken'
import { TokenPanel } from './components/TokenPanel'
import { ThemeProvider } from './hooks/useTheme'
import { PanelLayout } from './layouts/PanelLayout'
import { AboutPage } from './pages/About'
import { CommandsPage } from './pages/Commands'
import { InvokePage } from './pages/Invoke'
import { OverviewPage } from './pages/Overview'
import { PluginsPage } from './pages/Plugins'

/**
 * 路由走 hash（#/overview），因为面板挂在 /api/v1/astrbot/page 这个 action 上，
 * 而 /api/v1/astrbot/assets/* 已经被静态资源占着，history 路由会和它打架。
 */
const path = (key: string) => `/${key}`

const AppRoutes = () => (
  <Routes>
    <Route element={<PanelLayout />}>
      <Route path={path('overview')} element={<OverviewPage />} />
      <Route path={path('plugins')} element={<PluginsPage />} />
      <Route path={path('commands')} element={<CommandsPage />} />
      <Route path={path('invoke')} element={<InvokePage />} />
      <Route path={path('about')} element={<AboutPage />} />
      {/** Karin 配置页的 iframe 指向老地址，落到概览 */}
      <Route path={path('config')} element={<Navigate replace to={path('overview')} />} />
      <Route path={path('karin-config')} element={<Navigate replace to={path('overview')} />} />
    </Route>
    <Route path="*" element={<Navigate replace to={path('overview')} />} />
  </Routes>
)

const App = () => {
  const [authenticated, setAuthenticated] = useState(() => hasToken())

  useEffect(() => {
    const sync = () => setAuthenticated(hasToken())
    window.addEventListener(panelTokenEventName, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(panelTokenEventName, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return (
    <ThemeProvider>
      {authenticated ? <AppRoutes /> : <TokenPanel onDone={() => setAuthenticated(true)} />}
    </ThemeProvider>
  )
}

export default App

/** 根组件 */
export const Root = () => (
  <HashRouter>
    <App />
  </HashRouter>
)
