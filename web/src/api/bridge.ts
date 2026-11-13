import type {
  BridgeEnvelope,
  CommandsResult,
  PingResult,
  PluginsResult,
  StatusResult
} from '../types'

/** 与 web.config.js 的 page.url、vite 的 base 前缀保持一致 */
export const API_BASE = '/api/v1/astrbot'

const TOKEN_KEY = 'astrbot-bridge-token'

/** 令牌来源优先级：iframe URL 的 ?token= → localStorage */
const urlToken = () => {
  try {
    return new URLSearchParams(window.location.search).get('token') || ''
  } catch {
    return ''
  }
}

export const getToken = (): string => urlToken() || localStorage.getItem(TOKEN_KEY) || ''

export const setToken = (token: string) => {
  const next = token.trim()
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

export const hasToken = (): boolean => Boolean(getToken())

/**
 * 调一个 action。
 * Karin 的 /api/v1 守卫对 POST 只认 Authorization 头，对 GET 才认 query 令牌，
 * 所以这里统一走 POST + Bearer。
 */
export const call = async <T>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
  const token = getToken()
  const response = await fetch(`${API_BASE}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })

  const text = await response.text()
  if (response.status === 401) throw new Error('令牌不对：请填 Karin 的 HTTP_AUTH_KEY（WebUI 登录用的那一串）')

  let payload: (BridgeEnvelope<T> & Record<string, unknown>) | null = null
  try {
    payload = JSON.parse(text) as BridgeEnvelope<T> & Record<string, unknown>
  } catch {
    throw new Error(`返回的不是 JSON（HTTP ${response.status}）：${text.slice(0, 200)}`)
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `请求失败（HTTP ${response.status}）`)
  }

  return payload as unknown as T
}

export const ping = () => call<PingResult>('ping')
export const status = () => call<StatusResult>('status')
export const plugins = (force = false) => call<PluginsResult>('plugins', { force })
export const commands = (
  body: { plugin?: string; keyword?: string; limit?: number; force?: boolean; detail?: boolean } = {}
) => call<CommandsResult>('commands', body)
export const invoke = (body: Record<string, unknown>) => call<Record<string, unknown>>('call', body)
