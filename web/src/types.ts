/** 与 bridge 的 /api/v1/astrbot/* 返回结构对齐 */

/** 统一响应外壳（route.js 的 astrbotBridgeHandler 负责套上） */
export interface BridgeEnvelope<T> {
  success: boolean
  took?: number
  message?: string
  data?: T
}

export interface PingResult {
  pong: boolean
  version: string
  build: string
  dir: string
  time: string
}

export interface BotInfo {
  selfId: string
  name: string
  uin: string
  standard: string
  protocol: string
}

export interface PluginRow {
  name: string
  type: string
  dir: string
  version: string
  description: string
  enabled: boolean
  apps: number
}

export interface PluginsResult {
  total: number
  plugins: PluginRow[]
  runtime: {
    bots: BotInfo[]
    command: number
    accept: number
    task: number
    button: number
  }
}

export interface CommandRow {
  plugin: string
  method: string
  label: string
  type: string
  file: string
  command: string
  pattern: string
  /** 正则修饰符（detail 时才有） */
  flags?: string
  /** 内容触发（消息里出现即触发）；false 表示要打命令才触发 */
  trigger: boolean
  event: string
  priority: number
  /** 权限要求，如 master / admin / all（detail 时才有） */
  permission?: string
  /** 读不到触发规则时的原因（detail 时才有） */
  note?: string
}

export interface CommandsResult {
  total: number
  returned: number
  offset: number
  hasMore: boolean
  commands: CommandRow[]
}

export interface StatusResult {
  bots: BotInfo[]
  master: string[]
  admin: string[]
  prefix: string[]
  mode: string
}

/** 导航页面标识 */
export type PageKey = 'overview' | 'plugins' | 'commands' | 'invoke' | 'about'
