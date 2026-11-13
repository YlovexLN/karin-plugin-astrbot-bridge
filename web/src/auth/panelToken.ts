import { getToken, hasToken, setToken } from '../api/bridge'

/** 令牌变更事件：让 App 与令牌页同步 */
export const panelTokenEventName = 'astrbot-bridge-token-changed'

export { getToken, hasToken }

export const saveToken = (token: string) => {
  setToken(token)
  window.dispatchEvent(new Event(panelTokenEventName))
}

export const clearToken = () => {
  setToken('')
  window.dispatchEvent(new Event(panelTokenEventName))
}
