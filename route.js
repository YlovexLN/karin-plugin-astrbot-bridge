// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import * as karinModule from 'node-karin'
import { PluginDir } from './dir.js'

/**
 * 构建标记：每次改完代码都换一次，配合日志里的 `[astrbot-bridge] action=… build=…`
 * 一眼看出容器里跑的是不是刚写进去的那份（Karin 不热更插件代码，最容易误判）
 */
export const BRIDGE_BUILD = '2026-11-13T15:40Z-drop-selfupdate'

/**
 * node-karin 各版本的导出集合不一致（1.18 就没有 cache），
 * 这里按名字取，缺谁补谁，避免整个插件 import 阶段直接崩掉
 */
const karin = karinModule.default || karinModule

/** 本插件目录（file:///app/plugins/karin-plugin-astrbot-bridge/route.js → /app/plugins/karin-plugin-astrbot-bridge） */
const pluginRoot = () => {
  /** 路径常量统一放在 dir.js，这里只兜底（dir.js 用 import.meta.url，正常不会失败） */
  try { return PluginDir } catch { return path.dirname(fileURLToPath(import.meta.url)) }
}
/** 让 update 之类的接口能反查到本插件目录；导入阶段只读一次，不会热更 */
if (!process.env.__ASTRBOT_BRIDGE_DIR) process.env.__ASTRBOT_BRIDGE_DIR = pluginRoot()
const logger = karinModule.logger || { info: console.log, warn: console.warn, error: console.error, debug: () => {} }
/** 事件类缓存：karin 的 FriendMessage 等类只需找到一次 */
let eventClasses = null
const config = karinModule.config || karin?.config || {}
/**
 * 指令表（Karin 运行时全局单例）
 *
 * node-karin 的 dist/index.mjs 第 7 行就是 `import { S as cache } from './internal-*.mjs'`，
 * 所以包入口本身已经把这份 cache 导出出来了，**不需要**再去 import 内部模块。
 * 之前用 `import(path.join(dir,'../../node_modules/node-karin/dist/internal-*.mjs'))` 扫描是错的：
 * 自己拼出来的 file:// URL 和主进程用的模块 URL 不是同一个，ESM 会给出**另一份实例**，
 * 那份实例里的 cache 是空的（只有本插件自己注册的那一条），于是「没有匹配指令」。
 * 直接用 karinModule.cache 拿到的才是运行时真表。
 */
const resolveCache = () => {
  const candidates = [karinModule.cache, karin && karin.cache]
  for (const value of candidates) {
    if (value && typeof value === 'object' && Array.isArray(value.command)) return value
  }
  return null
}
const emptyCache = () => ({ index: {}, accept: [], command: [], task: [], button: [], handler: {}, missing: new Map(), watcher: new Map(), count: {}, static: [] })
const cache = resolveCache() || emptyCache()
logger.info(`[astrbot-bridge] cache 就位 command=${(cache.command || []).length} accept=${(cache.accept || []).length} keys=${Object.keys(cache).join('|')}`)
if (!(cache.command || []).length) {
  logger.warn(`[astrbot-bridge] cache.command 为空：karinModule 的键 = ${Object.keys(karinModule).slice(0, 40).join(',')}`)
}
const contactFriend = karinModule.contactFriend || karin?.contactFriend
const contactGroup = karinModule.contactGroup || karin?.contactGroup
const senderFriend = karinModule.senderFriend || karin?.senderFriend
const senderGroup = karinModule.senderGroup || karin?.senderGroup
/**
 * 插件清单：优先用 node-karin 导出的 getPlugins（1.18 有）；
 * 没有就退化为读插件目录，先试 cache.dir.pluginsDir，再试本插件上一级（plugins/）
 */
const getPlugins = karinModule.getPlugins || karin?.getPlugins || (async () => {
  const walk = async (dir, depth = 0) => {
    let names = []
    try { names = await fs.promises.readdir(dir) } catch { return [] }
    const list = []
    for (const name of names) {
      if (!name || name.startsWith('.')) continue
      const full = path.join(dir, name)
      const isDir = await fs.promises.stat(full).then((st) => st.isDirectory()).catch(() => false)
      if (!isDir) continue
      if (!depth) { list.push(...await walk(full, 1)); continue }
      list.push({ name, dir: full, type: 'local', apps: [] })
      if (!depth) continue
    }
    return list
  }
  const roots = [cache?.dir?.pluginsDir, path.resolve(pluginRoot(), '..')].filter(Boolean)
  for (const root of roots) {
    const list = await walk(root)
    if (list.length) return list
  }
  return []
})

/**
 * Karin 的错误日志持有器不在导出链上，按相对路径尝试引入
 * 失败时 readLogs 只用 HTTP /logs/file，功能降级但不报错
 */
const loadErrorLogs = async () => {
  const candidates = [
    'node-karin/lib/core/error.js',
    'node-karin/lib/core/errorLog.js',
    'node-karin/lib/utils/error.js',
  ]
  for (const spec of candidates) {
    try {
      const mod = await import(spec)
      const holder = mod.errorLogs || mod.default
      if (holder && typeof holder.get === 'function') return holder
    } catch {
      /* 换下一个候选 */
    }
  }
  return null
}

/**
 * 不经过 OneBot：直接调用 cache.command 里的插件函数。
 * 插件拿到的只是一个「最小事件对象」，没有任何 OneBot 事件字段。
 */

/** 内部工具不在 node-karin 导出链上，按相对路径尝试引入 */
const INTERNAL = [
  'node-karin/lib/event/handler/other/handler.js',
  'node-karin/lib/event/handler/other/permission.js',
  'node-karin/lib/hooks/eventCall.js',
]
let internals = null
const loadInternals = async () => {
  if (internals) return internals
  logger.info('[astrbot-bridge] 首次加载内部工具（initMsg / Permission / eventCallEmit）')
  const [handler, permission, eventCall] = await Promise.all(
    INTERNAL.map(async (spec) => {
      try {
        return await import(spec)
      } catch {
        return null
      }
    })
  )
  internals = {
    initMsg: handler?.initMsg,
    initRole: handler?.initRole,
    initAlias: handler?.initAlias,
    Permission: permission?.Permission,
    eventCallEmit: eventCall?.eventCallEmit,
  }
  return internals
}

/**
 * 把 WebUI 页面写回浏览器
 *
 * 为什么走 action 而不是另起一个静态路由：Karin 1.18 的 node-karin 不导出 `app`/`router` 时
 * 插件挂不了自己的 express 路由，但 `/astrbot/:action` 这个框架路由在所有版本上都能用。
 * 所以页面就当成一个「返回 HTML 的 action」，不依赖任何额外挂载能力。
 * @param {any} res
 * @returns {boolean} 是否已经写回
 */
const WEB_DIST = () => path.join(pluginRoot(), 'web-dist')

/** 静态资源类型：只放前端产物会用到的那几种 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

/**
 * 把令牌拼进页面里的资源地址
 *
 * <script src> / <link href> 带不了 Authorization 头，而 Karin 的 /api/v1 守卫
 * 对 GET 只认 query 令牌（实测裸请求 401「缺少authorization」，带 ?token= 才 200），
 * 所以 index.html 里每一条 /api/v1/astrbot/assets/... 都要补上 ?token=。
 * @param {string} html
 * @param {string} token
 */
const injectAssetToken = (html, token) => {
  if (!token) return html
  return html.replace(/(["'])(\/api\/v1\/astrbot\/assets\/[^"'?]+)\1/g, (all, quote, url) =>
    quote + url + '?token=' + encodeURIComponent(token) + quote)
}

/**
 * 前端静态资源：GET /api/v1/astrbot/assets/<文件名>
 * 只从 web-dist 里取，且挡掉 ../ 这类越界路径。
 * @param {any} req
 * @param {any} res
 * @returns {boolean} 是否已经写回
 */
const sendAsset = (req, res) => {
  const raw = String((req && (req.originalUrl || req.url)) || '')
  const at = raw.indexOf('/assets/')
  const rel = at < 0 ? '' : decodeURIComponent(raw.slice(at + '/assets/'.length).split('?')[0])
  const send = (code, type, body) => {
    try {
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'no-cache')
    } catch { /* 有的 res 是只读壳子 */ }
    if (typeof res.end === 'function') { res.statusCode = code; res.end(body); return true }
    if (typeof res.send === 'function') { res.status(code).send(body); return true }
    return false
  }
  if (!rel || rel.includes('..') || rel.includes('\\')) return send(404, 'text/plain; charset=utf-8', 'not found')
  const file = path.join(WEB_DIST(), rel)
  if (!file.startsWith(WEB_DIST()) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(404, 'text/plain; charset=utf-8', 'not found')
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  return send(200, type, fs.readFileSync(file))
}

const sendWebUI = (res) => {
  const file = path.join(WEB_DIST(), 'index.html')
  const head = (type) => {
    try {
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'no-cache')
    } catch { /* 有的 res 是只读壳子 */ }
  }
  try {
    const html = fs.readFileSync(file, 'utf8')
    head('text/html; charset=utf-8')
    if (typeof res.end === 'function') {
      res.statusCode = 200
      res.end(injectAssetToken(html, bridgeToken()))
      return true
    }
    if (typeof res.send === 'function') {
      res.send(injectAssetToken(html, bridgeToken()))
      return true
    }
  } catch (error) {
    logger.warn('[astrbot-bridge] 读取 web-dist/index.html 失败:', error)
  }
  head('text/html; charset=utf-8')
  const tip = '<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px">'
    + '<h3>WebUI 页面读不到</h3>'
    + '<p>插件目录里没有 <code>web-dist/index.html</code>。用带 web-dist 的安装包重装一次（WebUI → 插件管理 → 上传 zip），再重启 Karin。</p>'
    + '</body>'
  if (typeof res.end === 'function') { res.statusCode = 200; res.end(tip); return true }
  if (typeof res.send === 'function') { res.send(tip); return true }
  return false
}

/**
 * 所有路由共用的处理体：JSON 进、JSON 出，异常也回 JSON
 * @param {any} req
 * @param {any} res
 */
const actionFromUrl = (req) => {
  const url = String((req && (req.originalUrl || req.url)) || '')
  const at = url.indexOf('/astrbot')
  if (at < 0) return ''
  return url.slice(at + '/astrbot'.length).split('?')[0].replace(/^\/+/, '').split('/')[0]
}

export const astrbotBridgeHandler = async (req, res) => {
  const started = Date.now()
  try {
    /**
     * action 依次取：路由参数 → 请求体里的 action → URL 里 /astrbot 之后的第一段
     * （Karin 1.18 的插件 router 是带 baseUrl 挂载的，req.params 里拿不到 :action）
     */
    const action = String((req.params && req.params.action) || (req.body && req.body.action) || actionFromUrl(req))
    /** 跑的是哪一份代码：改代码后对不上就是没重启/没写进去 */
    logger.info('[astrbot-bridge] action=' + action + ' build=' + BRIDGE_BUILD)
    /**
     * WebUI 页面：GET /api/v1/astrbot/page
     * Karin 的插件配置页用 iframe 加载它（见 web.config.js 的 page.url）。
     * 页面里没有任何密钥，只是静态 HTML；它自己去调 /api/v1/astrbot/* 时才需要令牌。
     */
    if (action === 'page') return sendWebUI(res)
    /** 前端静态资源：web-dist 里的 js/css，页面里的 <script>/<link> 直接取 */
    if (action === 'assets') return sendAsset(req, res)
    /** GET /api/v1/astrbot/ping 不需要 token：方便在浏览器/curl 里确认路由到底挂没挂上 */
    if (action === 'ping' && !bridgeToken()) {
      res.status(200).json({ success: true, tokenConfigured: false, ...ping() })
      return
    }
    if (!bridgeToken()) {
      res.status(500).json({
        success: false,
        message: 'astrbot-bridge 没拿到令牌：请确认 Karin 的 .env 里有 HTTP_AUTH_KEY（WebUI 登录令牌），重启 Karin 后重试',
      })
      return
    }
    if (!authorized(req)) {
      res.status(401).json({ success: false, message: 'unauthorized' })
      return
    }
    /** Karin 1.18 的函数路由：处理完直接写回 res，结果同时在 handler 的返回值里 */
    const result = await dispatch(action, req.body || {})
    res.status(200).json({ success: true, took: Date.now() - started, ...result })
  } catch (error) {
    logger.error('[astrbot-bridge]', error)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: String((error && error.message) || error) })
    }
  }
}

/**
 * 框架级路由：不依赖插件 router.use 的挂载（有的 node-karin 版本不会把插件 router
 * 挂到 /api/v1 下）。直接声明 /astrbot/:action，交给 node-karin 自己的路由注册。
 * @type {import('node-karin').RouterHandler}
 */
export const astrbotHandler = {
  name: 'astrbot-bridge',
  desc: '供外部 Agent 调用：插件清单 / 指令索引 / 直接调用插件函数',
  handler: (req, res) => astrbotBridgeHandler(req, res),
}

export default astrbotHandler

/**
 * 只读读一段文件：`{ path, from, lines }`，或 `{ path, pattern }` 只看命中行号
 * 白名单目录：插件目录、/app/plugins、/app/node_modules —— 出了这三处一律拒绝。
 */
const READ_ROOTS = ['/app/plugins', '/app/node_modules', '/app/config', '/app/data']
/** Karin 的安装根目录：配置与数据都在它下面（容器里通常不是 /app） */
const KARIN_ROOT = (() => {
  const dir = path.resolve(process.cwd())
  return dir === path.parse(dir).root ? '' : dir
})()
const readFileSlice = (body) => {
  const raw = String(body.path || '').trim()
  if (!raw) throw new Error('缺少 path')
  const abs = path.resolve(raw)
  const roots = READ_ROOTS.concat([pluginRoot(), KARIN_ROOT].filter(Boolean))
  if (!roots.some((root) => abs === root || abs.startsWith(root + path.sep))) {
    throw new Error('只允许读插件目录 / node_modules / config / data / Karin 根目录：' + abs)
  }
  if (!fs.existsSync(abs)) throw new Error('文件不存在：' + abs)
  const stat = fs.statSync(abs)
  if (stat.isDirectory()) {
    const names = fs.readdirSync(abs, { withFileTypes: true })
      .slice(0, 300)
      .map((d) => d.name + (d.isDirectory() ? '/' : ''))
    return { path: abs, dir: true, count: names.length, entries: names }
  }
  if (!stat.isFile()) throw new Error('不是普通文件：' + abs)
  if (stat.size > 8 * 1024 * 1024) throw new Error('文件太大（>8MB）：' + stat.size)
  const text = fs.readFileSync(abs, 'utf8')
  const all = text.split(/\r?\n/)
  /** 只看命中行：找「某个属性是在哪儿被读的」比翻文件快得多 */
  const pattern = String(body.pattern || '').trim()
  if (pattern) {
    const re = new RegExp(pattern)
    const hits = []
    for (let i = 0; i < all.length; i++) if (re.test(all[i])) hits.push({ line: i + 1, text: all[i].slice(0, 400) })
    return { path: abs, bytes: stat.size, totalLines: all.length, pattern, hits: hits.slice(0, 60), hitTotal: hits.length }
  }
  const from = Math.max(1, Number(body.from || 1))
  const count = Math.min(400, Math.max(1, Number(body.lines || 60)))
  return { path: abs, bytes: stat.size, totalLines: all.length, from, lines: all.slice(from - 1, from - 1 + count) }
}

/**
 * 改容器里的文件（配置 / 第三方源码）。只做「就地改写 + 自动备份」，不新建文件。
 * `{ path, content }` → `{ path, bytes, backup }`；.json 会先 JSON.parse 校验。
 * 白名单与 readfile 一致，扩展名只放 .json/.js/.mjs/.cjs/.txt/.md。
 */
const writeFileSafe = (body) => {
  const raw = String(body.path || '').trim()
  if (!raw) throw new Error('缺少 path')
  const abs = path.resolve(raw)
  const roots = READ_ROOTS.concat([pluginRoot(), KARIN_ROOT].filter(Boolean))
  if (!roots.some((root) => abs === root || abs.startsWith(root + path.sep))) {
    throw new Error('只允许写插件目录 / node_modules / config / data / Karin 根目录：' + abs)
  }
  /** 硬约束：不改 Karin 的 node_modules（镜像更新会覆盖，且不是我们的东西） */
  if (abs === '/app/node_modules' || abs.startsWith('/app/node_modules' + path.sep)) {
    throw new Error('拒绝写 node_modules（那是镜像里的东西）：' + abs)
  }
  const ext = path.extname(abs).toLowerCase()
  if (!['.json', '.js', '.mjs', '.cjs', '.txt', '.md'].includes(ext)) {
    throw new Error('只允许写 .json / .js / .mjs / .cjs / .txt / .md：' + abs)
  }
  if (!fs.existsSync(abs)) throw new Error('文件不存在（本 action 不新建）：' + abs)
  const stat = fs.statSync(abs)
  if (!stat.isFile()) throw new Error('不是普通文件：' + abs)
  if (stat.size > 8 * 1024 * 1024) throw new Error('文件太大（>8MB）：' + stat.size)
  const content = typeof body.content === 'string' ? body.content : ''
  if (!content) throw new Error('缺少 content')
  if (ext === '.json') JSON.parse(content)
  const before = fs.readFileSync(abs, 'utf8')
  if (before === content) return { path: abs, bytes: content.length, changed: false }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = abs + '.bak-' + stamp
  fs.copyFileSync(abs, backup)
  fs.writeFileSync(abs, content, 'utf8')
  return { path: abs, bytes: content.length, beforeBytes: before.length, changed: true, backup }
}

/**
 * 在 Karin 容器里发一个 GET 请求：排查「是网络/风控还是代码」时用。
 * `{ url, headers }` → `{ status, headers, body }`（body 截断到 4000 字符）
 */
const fetchText = async (body) => {
  const url = String(body.url || '').trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('只接受 http(s) URL')
  const headers = Object.assign({}, body.headers || {})
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(30000, Number(body.timeout || 15000)))
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    const text = await res.text()
    return { url, status: res.status, headers: Object.fromEntries(res.headers), bytes: text.length, body: text.slice(0, 4000) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 临时排查：用 kkk 自带的 amagi 客户端（同一份代码）直接取一次视频流，
 * 看响应里到底有没有 \`dash\`。\`{ avid, cid, cookie?, ua? }\`
 */
const amagiProbe = async (body) => {
  const file = path.resolve('node_modules/karin-plugin-kkk/lib/core_chunk/default.js')
  const mod = await import(pathToFileURL(file).href)
  const Client = mod.t
  const client = Client({
    cookies: { bilibili: String(body.cookie || '') },
    request: { timeout: 30000, headers: { 'User-Agent': String(body.ua || 'Mozilla/5.0') } },
    debug: false
  })
  const res = await client.bilibili.fetcher.fetchVideoStreamUrl({ avid: Number(body.avid), cid: Number(body.cid) })
  const inner = res && res.data && res.data.data
  return {
    topKeys: Object.keys(res || {}),
    dataKeys: Object.keys((res && res.data) || {}),
    innerKeys: Object.keys(inner || {}),
    hasDash: !!(inner && inner.dash),
    sample: JSON.stringify(res).slice(0, 1200)
  }
}

const dispatch = async (action, body) => {
  switch (action) {
    case 'ping': return ping()
    case 'plugins': return pluginList(body)
    case 'commands': return await commandList(body)
    case 'search': return searchCommands(body)
    case 'status': return status()
    case 'call': return callPlugin(body)
    case 'share': return shareLink(body)
    /** 方案 B：把文本作为 Bot 消息发进会话，让 kkk 这类插件的「自动解析」去出卡片 */
    case 'send': return sendText(body)
    case 'logs': return readLogs(body)
    /** 调试用（0.0.1 临时）：返回构建时间与探测结果，确认容器里跑的是哪一份代码 */
    case 'probe': return await probeRuntime(body)
    /** 导出体检：`POST /api/v1/astrbot/resolve` */
    case 'resolve': return await resolveReport(body)
    /** 只读看容器里的文件：排查第三方插件报错时，光有堆栈没有源码等于盲猜 */
    case 'readfile': return readFileSlice(body)
    /** 改容器里的文件（配置 / 第三方源码），自动备份 */
    case 'writefile': return writeFileSafe(body)
    case 'fetchtext': return await fetchText(body)
    case 'amagitest': return await amagiProbe(body)
    default: throw new Error(`未知 action: '${action}'（可用：ping / page / assets / plugins / commands / search / status / call / share / send / logs / probe / resolve / readfile / writefile / fetchtext / amagitest）`)
  }
}

/**
 * token 取三处，按优先级：config.astrbotBridge.token → .env 的 ASTRBOT_BRIDGE_TOKEN
 * → 本插件自己的配置（插件配置里填的值存在 config.<插件名> 下，键名即包名）
 */
export const bridgeRouter = karinModule.router || karin?.router || null

/**
 * 令牌：**不单独配置**，直接用 Karin 自己的（.env 里那一串）
 * 优先级：HTTP_AUTH_KEY（Karin WebUI 的登录令牌，也是 HTTP 接口用的 secret）
 *      → ASTRBOT_BRIDGE_TOKEN（可选，只想给 bridge 单独一个备用令牌时才写）
 *      → app config 里的 astrbotBridge.token（应急，正常不需要）
 */
export const bridgeToken = () =>
  process.env.HTTP_AUTH_KEY ||
  /** 空串要当没写：Karin 控制台清空后 .env 里会留一行 ASTRBOT_BRIDGE_TOKEN= */
  process.env.ASTRBOT_BRIDGE_TOKEN ||
  config?.astrbotBridge?.token ||
  ''

const authorized = (req) => {
  /** 大小写不敏感：部分客户端会把 Bearer 写成 bearer */
  const header = String(req.headers?.authorization || '').replace(/^bearer\s+/i, '')
  const token = header || req.query?.token
  const expect = bridgeToken()
  return Boolean(expect) && expect === token
}

/**
 * 外部 Agent 能借用的「链接解析类插件」白名单键
 * 子串放行：BV 号、b23.tv 短链、bilibili.com 任意路径
 */
const LINK_USE_CASES = {
  bilibili: {
    label: 'B站视频/动态/番剧解析',
    plugins: ['karin-plugin-kkk'],
    /** kkk/tools.js 里 B站 指令的真实方法名，Karin 按这个名字派发 */
    methods: ['bilibiliAPP'],
    /**
     * 真正用来出卡片的是 kkk 的「引用解析」指令 prefix（正则 /^#?(解析|kkk解析|弹幕解析)/）：
     * 它会按链接自己分派到 handleBilibili / handleDouyin，成品（视频卡片）由 kkk 自己 e.reply 出来。
     * 直接调 bilibiliAPP 也能解析，但它走的是「收到链接就回一张消息」的老路径，卡片样式由 config 决定；
     * prefix 才是用户在群里常用的那条。
     */
    command: 'prefix',
    /**
     * 首选路径：直接调 kkk tools.ts 导出的业务函数
     * handleBilibili 被 wrapWithErrorHandler 包过，只要求一条像样的 e，不碰指令注册表
     */
    handlers: ['handleBilibili'],
    /** 指令对象所在的文件：npm 包在 lib/apps，git 插件在 apps，两边都试 */
    file: 'tools.js',
    accept: (text) => /https?:\/\/[^\s"'<>]*(?:bilibili\.com|b23\.tv|bili2233\.cn)|\bBV[1-9a-zA-Z]{10}\b|\bav\d+\b/i.test(text),
  },
  douyin: {
    label: '抖音视频/图集解析',
    plugins: ['karin-plugin-kkk'],
    methods: ['douyinAPP'],
    command: 'prefix',
    handlers: ['handleDouyin'],
    file: 'tools.js',
    /** 与 kkk 的 reg.douyin 同源：分享文案里常带中文，所以只认链接本体 */
    accept: (text) => /https?:\/\/[^\s"'<>]*(?:douyin\.com|iesdouyin\.com)|\bv\.douyin\.com\b/i.test(text),
  },
}

/**
 * 没显式给 useCase 时，按链接自己判断该用哪条解析链
 * 顺序：先看自己带的链接，再看文本里出现的域名
 * @param {string} text
 * @returns {string} 命中的用例名，认不出返回 ''
 */
const inferUseCase = (text) => {
  const raw = String(text || '')
  for (const [name, spec] of Object.entries(LINK_USE_CASES)) {
    if (spec.accept(raw)) return name
  }
  return ''
}

/**
 * Karin 官方路由：已加载指令表
 *
 * 为什么不用进程内的 karin.cache：在插件进程里拿到的这份 cache 是**空的**
 * （command=0，日志 `cache 就位 command=0`），Karin 自己的注册表写进了另一份实例。
 * 而 Karin 把真表通过 HTTP 暴露出来了：
 *   POST /api/v1/plugin/loaded/command  （node-karin dist/router-*.mjs: GET_LOADED_COMMAND_PLUGIN_CACHE_LIST_ROUTER = '/plugin/loaded/command'）
 * 返回 { code, data: [{ name: 插件名, files: [{ fileName, command: [{ pluginName, method }] }] }] }
 * 注意：这个接口**不给正则**，只有「插件名 / 文件名 / 指令名 / 方法名」。
 */
const fetchLoadedCommands = async (force = false) => {
  const hit = loadedCommands
  if (!force && hit.value && Date.now() - hit.at < 15_000) return hit.value
  const token = bridgeToken()
  /**
   * config.port 在 Karin 里不是数字，而是一个函数（() => Number(process.env.HTTP_PORT) || 7777），
   * 直接拼进 URL 会得到 `127.0.0.1:() => Number(...)`。这里统一摊平成数字。
   */
  const portOf = (value) => {
    const raw = typeof value === 'function' ? (() => { try { return value() } catch { return '' } })() : value
    const number = Number(raw)
    return Number.isFinite(number) && number > 0 ? number : 7777
  }
  const base = String(config.httpUrl || config.url || '').replace(/\/+$/, '') || `http://127.0.0.1:${portOf(config.port)}`
  try {
    const response = await fetch(base + '/api/v1/plugin/loaded/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: '{}',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const json = await response.json()
    const rows = []
    for (const plugin of (json && json.data) || []) {
      for (const file of (plugin.files || [])) {
        for (const command of (file.command || [])) {
          rows.push({
            plugin: plugin.name,
            file: file.fileName || '',
            label: command.pluginName || '',
            method: command.method || '',
          })
        }
      }
    }
    hit.value = rows
    hit.at = Date.now()
    logger.info(`[astrbot-bridge] 指令表已就绪（来自 Karin 路由）: ${rows.length} 条`)
    return rows
  } catch (error) {
    logger.warn('[astrbot-bridge] 读取 Karin 指令路由失败:', String((error && error.message) || error))
    return hit.value || []
  }
}
const loadedCommands = { value: null, at: 0 }

/**
 * 给没有正则的指令行排序：用户真正会说的指令（帮助、解析…）排在调试/登录指令前面
 * 没有正则就没法判断优先级，只能按名字猜个大概
 */
const COMMAND_RANK = [/解析/, /视频/, /搜索|查询/, /帮助|菜单|版本/, /统计/, /列表/, /设置/, /推送/, /登录|ck/i]
const rankOf = (row) => {
  const text = `${row.label} ${row.method} ${row.file}`
  const index = COMMAND_RANK.findIndex((reg) => reg.test(text))
  return index === -1 ? COMMAND_RANK.length : index
}

/** 已安装插件清单 */
const pluginList = async (body = {}) => {
  const list = (await getPlugins('all', true, Boolean(body.force))) || []
  return {
    total: list.length,
    plugins: list.map((item) => ({
      name: item.name,
      type: item.type,
      dir: item.dir,
      version: readVersion(item.dir),
      description: readPkg(item.dir).description || '',
      enabled: Boolean(item.apps && item.apps.length),
      apps: (item.apps || []).length,
    })),
    runtime: {
      bots: getAllBots().map(describeBot),
      /** 指令数以 Karin 的 /api/v1/plugin/loaded/command 为准（进程内 cache 是空表） */
      command: (await fetchLoadedCommands()).length,
      accept: (cache.accept || []).length,
      task: (cache.task || []).length,
      button: (cache.button || []).length,
    },
  }
}

/** 指令索引 */
const commandList = async (body = {}) => {
  const { plugin = '', keyword = '', includeTrigger = false } = body
  const offset = Math.max(Number(body.offset) || 0, 0)
  const limit = body.limit === undefined ? Infinity : Math.min(Math.max(Number(body.limit) || 0, 1), 500)
  /**
   * 启发式：命令大多以 ^ 开头并可选带 # 前缀；纯内容匹配（如 B 站链接）通常不是以 ^ 开头的命令
   * 旧写法只要正则里出现 ? 就算触发，把 ^#?转发状态$ 这类普通命令误排除了
   */
  const isTrigger = (reg) => Boolean(reg && reg.source && !reg.source.startsWith('^'))

  /** 指令表来自 Karin 的 /api/v1/plugin/loaded/command（进程内 cache 是空的，见 fetchLoadedCommands 注释） */
  const rows = await fetchLoadedCommands(Boolean(body.force))
  const commands = rows
    .filter((row) => !plugin || row.plugin === plugin || row.label === plugin)
    .filter((row) => !keyword || `${row.label} ${row.method} ${row.file} ${row.plugin}`.toLowerCase().includes(keyword.toLowerCase()))
    .filter((row) => includeTrigger || true)
    .map((row) => ({
      plugin: row.plugin,
      method: row.method,
      label: row.label,
      type: 'regular',
      file: row.file,
      /** Karin 路由不返回正则，命令文本用指令名代替 */
      command: row.label,
      pattern: '',
      /** 没有正则就分不出「自动触发」和「手动指令」，一律当作指令 */
      trigger: false,
      event: '',
      priority: rankOf(row),
    }))
    .sort((a, b) => a.plugin.localeCompare(b.plugin) || a.priority - b.priority || a.label.localeCompare(b.label))

  const accepts = (cache.accept || [])
    .filter((item) => !plugin || item.pkg.name === plugin)
    .map((item) => ({ plugin: item.pkg.name, method: methodOf(item), event: item.event, priority: item.priority }))

  const page = limit === Infinity ? commands : commands.slice(offset, offset + limit)

  /**
   * detail：顺手把触发正则 / 权限补上（面板要显示「怎么才会被触发」）
   * AstrBot 工具不走这条路——一次 26 行要 import 一遍插件模块，没必要拖慢对话侧。
   */
  if (body.detail) {
    await Promise.all(page.map(async (item) => {
      const info = await describeCommandRow(item, Boolean(body.force))
      item.pattern = info.pattern
      item.flags = info.flags
      item.trigger = Boolean(info.pattern) && !info.manual
      item.permission = info.permission
      item.event = info.event
      if (info.error) item.note = info.error
    }))
  }

  return {
    total: commands.length,
    returned: page.length,
    offset,
    hasMore: limit !== Infinity && offset + page.length < commands.length,
    commands: page,
    accepts,
  }
}

/** 指令集合，按需重建：热重载或缓存失效后自动重算，最多 10 秒一次 */
const commandIndex = async () => {
  const now = Date.now()
  if (commandIndex.value && now - commandIndex.at < 10_000) return commandIndex.value
  const { commands, accepts } = await commandList({})
  /** 命令文本是 Karin 路由给的指令名（没有正则），能直接当关键词用 */
  /** 每个插件可选用的字段名（配置项、指令里的样本值），供模糊检索 */
  const fields = new Map()
  await Promise.all([...new Set(commands.map((item) => item.plugin))].map(async (name) => {
    fields.set(name, await pluginFields(name))
  }))
  const value = {
    commands: commands.map((item) => ({
      ...item,
      haystack: [item.plugin, item.method, item.command, item.sample, ...(fields.get(item.plugin) || [])]
        .join(' ').toLowerCase(),
    })),
    accepts,
  }
  commandIndex.value = value
  commandIndex.at = now
  return value
}
commandIndex.value = null
commandIndex.at = 0

/**
 * 猜一个插件的检索关键词：README 里的反引号片段、web.config 里的配置项名、包名去掉前缀
 * 全部读失败就只用包名，不影响主流程
 */
const pluginFields = async (name) => {
  const words = inferFromName(name)
  let all = []
  try { all = (await getPlugins('all', true, false)) || [] } catch { all = [] }
  const plugin = all.find((item) => item.name === name)
  if (!plugin || !plugin.dir) return words
  /** README：反引号包起来的多半是命令或配置键 */
  for (const file of ['README.md', 'readme.md', 'Readme.md']) {
    const file_path = path.join(plugin.dir, file)
    if (!fs.existsSync(file_path)) continue
    try {
      const text = fs.readFileSync(file_path, 'utf8').slice(0, 20000)
      /** 反引号里的多半是命令或配置键，超过 20 字的是句子，丢掉 */
      for (const hit of text.matchAll(/`([^`\n]{1,20})`/g)) words.push(hit[1])
      for (const hit of text.matchAll(/^\s*#{2,4}\s+([^#\n]{2,24})$/gm)) words.push(hit[1].trim())
    } catch { /* 读不到就算了 */ }
    break
  }
  /** web.config 的组件名 = 配置项键名，往往就是功能关键词 */
  const pkg = readPkg(plugin.dir)
  const webFile = pkg && pkg.karin && pkg.karin.web
  if (webFile) {
    try {
      const mod = await import(pathToFileURL(path.join(plugin.dir, webFile)).href)
      const target = mod.default || mod
      const comps = (target && target.components && target.components()) || []
      for (const comp of comps) {
        for (const item of (comp && comp.config) || []) {
          if (!item) continue
          if (item.component) words.push(item.component)
          if (item.title) words.push(item.title)
          if (typeof item.description === 'string') words.push(item.description.slice(0, 20))
        }
      }
    } catch { /* web.config 读不到或格式不同，跳过 */ }
  }
  return [...new Set(words.filter((w) => w && w.length <= 40))].slice(0, 80)
}

/** 包名兜底：karin-plugin-selfmsg → selfmsg；kkk → kkk */
const inferFromName = (name) => String(name || '')
  .toLowerCase()
  .replace(/^@[^/]+\//, '')
  .replace(/^karin-plugin-/, '')
  .split(/[-_./]/)
  .filter((word) => word && word.length > 1)

/**
 * 模糊检索指令：不要求用户记住插件名，按关键词命中插件名、方法名、指令或插件字段
 * @param {{ keyword?: string, limit?: number, plugin?: string }} input
 */
const searchCommands = async (input = {}) => {
  const keyword = String(input.keyword || '').toLowerCase().trim()
  /** 用户问「都装了啥」时不该得到空结果 */
  if (/^(全部|所有|所有插件|都装了什么|有哪些指令|指令列表|list)$/.test(keyword)) return await commandList({ limit: input.limit || 40 })
  const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50)
  const { commands, accepts } = await commandIndex()
  if (!keyword) return { keyword, total: 0, returned: 0, commands: [], hint: 'keyword 为空' }

  const terms = keyword.split(/\s+/).filter(Boolean)
  /**
   * 用户报的往往是 #转发状态 这种带前缀的写法，而 reg.source 是 ^#?转发状态$
   * 比较前统一剥掉前缀与可选前导符，两边才是同一形态
   */
  const norm = (value) => String(value || '')
    .toLowerCase()
    .replace(/\\/g, '')
    .replace(/^[#\/!.]+/, '')
    .trim()
  const scored = []
  for (const item of commands) {
    if (input.plugin && item.plugin !== input.plugin) continue
    let score = 0
    const command = norm(item.command)
    const sample = norm(item.sample)
    for (const term of terms.map(norm).filter(Boolean)) {
      /** 用户多半记的是去掉可选前导符后的写法，命中即满分 */
      if (item.command.toLowerCase().includes(term) || command === term) score += 6
      else if (command.includes(term)) score += 5
      else if (sample.includes(term)) score += 4
      else if (item.plugin.toLowerCase().includes(term)) score += 3
      else if (item.method.toLowerCase().includes(term)) score += 2
      else if (item.haystack.includes(term)) score += 1
    }
    if (score > 0) scored.push({ score, item })
  }
  scored.sort((a, b) => b.score - a.score || a.item.command.localeCompare(b.item.command))
  const page = scored.slice(0, limit).map(({ item, score }) => ({
    plugin: item.plugin,
    method: item.method,
    command: item.command,
    permission: item.permission,
    sample: item.sample,
    score,
  }))

  /** 同时命中的插件：提示它还有多少条指令，以及是否有只能监听的 accept */
  const hitPlugins = [...new Set(page.map((item) => item.plugin))]
  const pluginHints = hitPlugins.map((name) => ({
    plugin: name,
    commands: commands.filter((item) => item.plugin === name).length,
    accepts: accepts.filter((item) => item.plugin === name).length,
  }))

  return { keyword, total: scored.length, returned: page.length, commands: page, plugins: pluginHints }
}

/** 连通性自检：只证明 token 与路由都对，不触碰插件、不产生副作用 */
const ping = () => ({
  pong: true,
  version: '0.0.1',
  build: BRIDGE_BUILD,
  dir: pluginRoot(),
  time: new Date().toISOString(),
})

/** node-karin 各版本的 config 形状不同（master 可能是数组，也可能是 { value }），统一摊平 */
const asList = (value) => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) && 'value' in value ? value.value : value
  if (Array.isArray(raw)) return raw.map(String)
  if (raw === undefined || raw === null || raw === '') return []
  return [String(raw)]
}

const status = () => ({
  bots: getAllBots().map(describeBot),
  master: asList(config.master),
  admin: asList(config.admin),
  prefix: config.prefix || [],
  mode: 'direct',
})

/**
 * 指令项的可调用名
 * Karin 注册指令时 file = createFile(app, type, method, name)：
 *   file.method 才是导出函数名（.js 里类插件的 `async 方法名()`）
 *   file.name 只是给人看的标签（旧版本取过这个字段，会拼出 'kkk-视频功能-B站' 这种不存在的方法名）
 */
const methodOf = (item) => String(
  (item && (item.method || (item.file && (item.file.method || item.file.name)))) || ''
)

/**
 * 直接调用某个插件函数，不构造 OneBot 事件、不经过事件工厂
 * @param {{ plugin?: string, method?: string, text?: string, scene?: 'friend'|'group', target?: string, userId?: string, ignorePermission?: boolean, timeout?: number }} input
 */
const callPlugin = async (input = {}) => {
  const text = String(input.text || '').trim()

  /**
   * 指令来源：Karin 的 /api/v1/plugin/loaded/command
   * 进程内 cache 在插件进程里是空表（command=0），不能再用它当数据源
   */
  const rows = (await fetchLoadedCommands()).filter((row) => {
    if (input.plugin && row.plugin !== input.plugin) return false
    /** 路由行只有 { plugin, file, label, method }，methodOf() 是给 cache 条目用的，这里直接用 row.method */
    if (input.method && row.method !== input.method && row.label !== input.method) return false
    return true
  })
  /** 只给 plugin 时可能有几十条指令，允许调用方带上 method 精确点名；没点名就要求它补充 */
  if (!rows.length) {
    throw new Error(input.plugin
      ? `插件 '${input.plugin}' 没有这条指令${input.method ? ' / 方法 ' + input.method : ''}`
      : '需要提供 plugin（+ method）或 text')
  }
  if (rows.length > 1) {
    return {
      ambiguous: true,
      candidates: rows.map((row) => ({ plugin: row.plugin, method: row.method, label: row.label })),
    }
  }

  const plugin = rows[0]
  /** 调用方点名了导出名（如 kkk 的 prefix）：用它代替路由里的 method，也只读它 */
  if (input.exportName) plugin.method = String(input.exportName)
  const scene = input.scene === 'group' ? 'group' : 'friend'
  const selfBot = pickBot(input.selfId) || getAllBots()[0]
  const selfId = selfBot ? String(selfBot.selfId) : 'console'
  const userId = String(input.userId || asList(config.master)[0] || selfId)
  const target = String(input.target || userId)
  const contact = scene === 'group' ? contactGroup(target) : contactFriend(target)
  const sender = scene === 'group'
    ? senderGroup(userId, 'member', 'AstrBot', 'unknown')
    : senderFriend(userId, 'AstrBot', 'unknown', 0)

  const outbox = []
  const mock = createEventMock({ selfId, userId, scene, contact, sender, text, outbox, bot: selfBot, deliver: input.deliver === true })
  const deny = { permission: 'denied', ok: false }

  const mod = await loadInternals()
  if (mod.initMsg) {
    mod.initMsg(mock)
  } else {
    mock.msg = text
    mock.rawMessage = text
  }
  if (mod.initRole && mod.initAlias) {
    mod.initRole(mock, { master: asList(config.master), admin: asList(config.admin) })
    mod.initAlias(mock, config.prefix || [])
  } else {
    /** 内部工具拿不到时，按 master 配置自己判定 */
    mock.isMaster = asList(config.master).some((m) => m === userId || m === `${selfId}@${userId}`)
    mock.isAdmin = mock.isMaster || asList(config.admin).some((m) => m === userId)
    mock.alias = ''
  }

  if (!input.ignorePermission && mod.Permission) {
    const ok = scene === 'group' ? mod.Permission.groups(mock, plugin) : mod.Permission.private(mock, plugin)
    if (!ok) {
      return {
        ...deny,
        plugin: plugin.plugin,
        method: methodOf(plugin),
        need: '指令自身的权限配置',
        authFailMsg: '',
        reply: outbox,
      }
    }
  }

  if (mod.eventCallEmit) {
    const pass = await (scene === 'group'
      ? mod.eventCallEmit.group(mock, plugin)
      : mod.eventCallEmit.friend(mock, plugin))
    if (!pass) return { ok: false, blocked: 'hook', plugin: plugin.plugin, method: methodOf(plugin), reply: outbox }
  }

  const timeout = Math.min(Math.max(Number(input.timeout) || 15000, 100), 120000)
  let next = false
  const callNext = () => { next = true }

  try {
    const run = invokeCommand(plugin, { mock, text, deliver: input.deliver === true, callNext, args: input.args })
    await withTimeout(run, timeout)
  } catch (error) {
    logger.error(`[astrbot-bridge] 调用 ${plugin.plugin}/${methodOf(plugin)} 失败:`, error)
    return {
      ok: false,
      plugin: plugin.plugin,
      method: methodOf(plugin),
      error: String((error && error.message) || error),
      errorName: (error && error.name) || 'Error',
      stack: trimStack(error && error.stack),
      reply: outbox,
    }
  }

  return {
    ok: true,
    plugin: plugin.plugin,
    method: methodOf(plugin),
    command: plugin.label,
    next,
    reply: outbox,
  }
}

/**
 * 按「插件名 / 文件名 / 方法名」把这个插件注册的那条指令对象拿回来
 *
 * 为什么不用 `new Owner()[method]`：
 * kkk 这类插件的 apps 文件（lib/apps/tools.js）导出的**不是类**，而是
 *   `export { bilibiliAPP }` ← `var bilibili = karin.command(reg.bilibili, handleBilibili, { name: 'kkk-视频功能-B站' })`
 * 也就是 karin 的**命令对象**。命令对象由 Karin 在加载插件时创建，它自己也记了自己
 * （`sym` 指向的文件、方法名、调用表都在里面），我们这边再 import 一次只能拿到同一个命令对象，
 * 拿不到它的「容器」——所以旧实现按 `prototype[method]` 找类必然失败。
 *
 * 复用同一个命令对象还有两个好处：
 * - 指令的权限、别名、正则、黑白名单配置都是它自己带的状态
 * - 各插件自带的「错误处理器 / 表情回应」包在外层函数里，直接调用它才能走到
 */
const commandObjectOf = async (row) => {
  const mod = await loadPluginModule(row)
  const names = [row.method, sectionNameOf(row.method)].filter(Boolean)
  let importError = ''
  if (!mod) {
    /**
     * loadPluginModule 成功时返回模块，失败时返回 null（内部已经把错误吞掉记日志）。
     * 「方法明明是导出的却找不到」这种情况，多数是 import 本身炸了，得把原因带出去。
     */
    try { await importPluginModule(row.plugin, row.file) } catch (error) { importError = String((error && error.message) || error) }
  }
  /** 先按方法名找具名导出（tools.js 是 `export { bilibiliAPP }` 这种） */
  for (const name of names) {
    const value = mod && mod[name]
    const pick = asCommand(value)
    if (pick) return { fn: pick.fn, owner: pick.owner, exportName: name, via: 'export' }
  }
  /** Karin 的指令是 `{ type, event, fnc, reg, ... }` 这样的描述对象，真正能调的是 `.fnc` */
  for (const name of names) {
    const value = mod && mod[name]
    if (value && typeof value === 'object' && typeof value.fnc === 'function') {
      return { fn: value.fnc, owner: value, exportName: name, via: 'fnc' }
    }
  }
  /** 再翻 default / 其它导出里挂着的命令对象（有些插件写成 `export default { xxx }`） */
  const pools = [mod && mod.default, mod].filter(Boolean)
  for (const pool of pools) {
    if (typeof pool !== 'object') continue
    for (const name of names) {
      const value = pool[name]
      const pick = asCommand(value)
      if (pick) return { fn: pick.fn, owner: pick.owner, exportName: name, via: 'default' }
      if (value && typeof value === 'object' && typeof value.fnc === 'function') {
        return { fn: value.fnc, owner: value, exportName: name, via: 'fnc-default' }
      }
    }
  }
  /**
   * 3. 按导出名反查：同一个模块实例里，kkk 是 `var bilibiliAPP = Config.bilibili.switch && bilibili`，
   *    会先于 karin.command(...) 的赋值执行，快照里是 false；但模块活下来以后就是那个命令对象。
   *    这里重新读一次，能等到它就说明插件自己把开关打开了。
   */
  const again = Object.entries(mod || {})
  for (const [name, value] of again) {
    if (!names.includes(name)) continue
    const pick = asCommand(value)
    if (pick) return { fn: pick.fn, owner: pick.owner, exportName: name, via: 'reexport' }
  }
  if (!mod) throw new Error(`${row.plugin}/${row.file || 'apps'} 加载失败：${importError || '模块为空'}`)
  return null
}

/**
 * 全局兜底：Karin 的运行时里，每一条被注册的指令都是一个 `(e, next) => ...` 函数，
 * 它们迟早会出现在某个能被扫到的对象上（全局标记、插件模块、框架导出）。
 * 这一步很脏但很稳：只要调用能成功，比"报没有导出"有用得多。
 */
const findCommandEverywhere = async (row) => {
  const want = String(row.label || '')
  const wantMethod = String(row.method || '')
  const roots = []
  for (const key of Object.keys(globalThis)) {
    if (/karin|plugin|cmd|command/i.test(key)) roots.push([key, globalThis[key]])
  }
  try { roots.push(['karin', karinModule]) } catch { /* 没有 */ }
  try { const mod = await loadPluginModule(row); roots.push(['module', mod]) } catch { /* 没有 */ }
  const seen = new Set()
  const limit = 20000
  for (const [label, root] of roots) {
    if (!root || typeof root !== 'object') continue
    if (seen.has(root)) continue
    seen.add(root)
    let keys = []
    try { keys = Object.keys(root) } catch { continue }
    for (const key of keys.slice(0, limit)) {
      let value
      try { value = root[key] } catch { continue }
      if (typeof value !== 'function') continue
      const hitName = String(value.name || '')
      if ((wantMethod && hitName === wantMethod) || (want && (value.__name === want || value.name === want))) {
        return { fn: value, exportName: `${label}.${key}`, via: 'scan' }
      }
    }
  }
  return null
}

/**
 * 把一个导出统一成「能调的函数 + 可选的指令描述对象」
 * - 函数：本身就是命令处理函数
 * - `{ fnc }`：Karin 的指令描述对象，真正能调的是 `.fnc`
 * 别的（false / 数字 / 无 fnc 的对象）都不算
 */
const asCommand = (value) => {
  if (typeof value === 'function') return { fn: value, owner: null }
  if (value && typeof value === 'object') {
    /** Karin 的指令描述对象：真正能调的是 `.fnc` */
    if (typeof value.fnc === 'function') return { fn: value.fnc, owner: value }
    /** 已经是归一化结果 `{ fn, owner }` 时原样返回，保证这个函数可以反复套（幂等） */
    if (typeof value.fn === 'function') return { fn: value.fn, owner: value.owner || null }
    /** 有些插件把命令对象再包一层 data */
    if (value.data && typeof value.data.fnc === 'function') return { fn: value.data.fnc, owner: value.data }
  }
  return null
}

/**
 * 指令行的「触发规则」——Karin 的指令表路由不给，只能回到命令对象上拿
 *
 * /api/v1/plugin/loaded/command 只吐 `{ pluginName, method }` 和文件名，正则不在里面。
 * 正则挂在 Karin 创建的那个命令对象上（`owner.reg`），要拿到它得按 method 把模块 import 回来。
 * Karin 启动时已经 import 过同一批文件，ESM 缓存命中后实测 1~3 ms（冷启动才几秒），
 * 所以结果按 `plugin|file|method` 缓存，`force` 时重读。
 */
const describeCache = new Map()

const describeCommandRow = async (row, force = false) => {
  const key = `${row.plugin}|${row.file}|${row.method}`
  const cached = describeCache.get(key)
  if (cached && !force) return cached
  const info = { pattern: '', flags: '', manual: true, permission: '', event: '', error: '' }
  try {
    const picked = await commandObjectOf(row)
    const owner = picked && picked.owner
    if (!owner) throw new Error('这条指令是函数导出，没有正则')
    const reg = owner.reg
    if (reg instanceof RegExp) {
      info.pattern = reg.source
      info.flags = reg.flags
    } else if (reg) {
      info.pattern = String(reg)
    }
    /** 以 ^ 开头的是「命令」（要打出来才触发），其余是「内容触发」（消息里出现就触发） */
    info.manual = !info.pattern || info.pattern.startsWith('^')
    info.permission = typeof owner.permission === 'string' ? owner.permission : ''
    info.event = typeof owner.event === 'string' ? owner.event : ''
  } catch (error) {
    info.error = String((error && error.message) || error)
  }
  describeCache.set(key, info)
  return info
}

/**
 * 导出名 → 实际导出名
 * kkk 的 lib/apps/tools.js 把 `bilibiliAPP` 原样导出，但有的插件会导出
 * `xxxApp` / `xxxAPP` 之类的变体，这里留一个宽松兜底，找不到再报错。
 */
const sectionNameOf = (name) => {
  const raw = String(name || '')
  if (!raw) return ''
  return raw
}

/** 按插件目录把 apps 下的那个文件 import 回来（Karin 加载的是同一个文件，ESM 模块缓存里是同一个实例） */
const loadPluginModule = async (row) =>
  importPluginModule(row.plugin, row.file)

/**
 * 按「插件名 + apps 文件名」import 插件模块
 * 子路径要优先，因为 kkk 这类插件的目录在 `/app/node_modules/karin-plugin-kkk`（npm 包），
 * 根目录下没有源码，只有 `package.json` + `lib/`。
 */
const importPluginModule = async (pluginName, fileName) => {
  const list = (await getPlugins('all', true, false)) || []
  const wanted = String(pluginName || '').trim()
  const plugin = list.find((item) => item.name === wanted) ||
    list.find((item) => String(item.name || '').replace(/^@[^/]+\//, '') === wanted)
  if (!plugin || !plugin.dir) {
    throw new Error(`插件目录不存在: ${wanted}（已加载：${list.map((item) => item.name).join(', ') || '无'}）`)
  }
  const roots = [path.join(plugin.dir, 'apps'), plugin.dir]
  const dirs = []
  try { dirs.push(...(await fs.promises.readdir(path.join(plugin.dir, 'apps')).then((n) => n.map((x) => path.join(plugin.dir, 'apps', x))))) } catch { /* 没有 apps 目录 */ }
  try { dirs.push(...(await fs.promises.readdir(path.join(plugin.dir, 'lib', 'apps')).then((n) => n.map((x) => path.join(plugin.dir, 'lib', 'apps', x))))) } catch { /* 没有 lib/apps 目录 */ }
  const candidates = []
  if (fileName) {
    /** 先试 apps/ 与 lib/apps/，最后才是插件根目录（npm 装的插件根目录可能没有这些文件） */
    for (const sub of ['apps', path.join('lib', 'apps'), '']) {
      candidates.push(path.join(plugin.dir, sub, fileName))
    }
    candidates.push(path.join(plugin.dir, 'lib', 'apps', path.basename(fileName)))
  }
  for (const dir of roots) {
    /** 保留旧覆盖范围：文件直接躺在插件根目录时也能找到 */
    if (fileName) candidates.push(path.join(dir, fileName))
  }
  /** 没给文件名时（找跨文件的导出）直接扫 apps / lib/apps / 根目录下的 js 文件 */
  if (!fileName) {
    for (const sub of ['apps', path.join('lib', 'apps')]) {
      const dir = path.join(plugin.dir, sub)
      try {
        const names = await fs.promises.readdir(dir)
        for (const name of names) if (/\.(m?[jt]s|cjs)$/.test(name)) candidates.push(path.join(dir, name))
      } catch { /* 目录不存在 */ }
    }
  }
  candidates.push(...dirs)
  const seen = new Set()
  const errors = []
  for (const file of candidates) {
    if (seen.has(file) || !fs.existsSync(file) || !/\.(m?[jt]s|cjs)$/.test(file)) continue
    seen.add(file)
    try {
      return await import(pathToFileURL(file).href)
    } catch (error) {
      errors.push(`${path.basename(file)}: ${String((error && error.message) || error)}`)
    }
  }
  throw new Error(`没能加载 ${pluginName}/${fileName || 'apps'}：${errors.slice(0, 2).join('；') || '文件不存在'}`)
}

/**
 * 执行一条指令行
 *
 * 命令对象的标准签名为 `(e, next, ...)=>r`，Karin 派发时会把「事件」和「是否放行下一条」传进去。
 * 我们这边不伪造整条 OneBot 事件链，只把 mock 事件交给它——kkk 的 bilibiliAPP 只读 `e.msg` 与 `e.reply`。
 */
const invokeCommand = async (row, { mock, text, deliver, callNext, args }) => {
  /**
   * commandObjectOf / findCommandEverywhere 返回的**已经是** `{ fn, owner }` 归一化结果，
   * 这里不能再套一次 asCommand：asCommand 只认「函数」和「带 .fnc 的指令对象」，
   * 对 `{ fn }` 会返回 null，于是永远落到 findCommandEverywhere，最后误报「没有导出可调用的指令对象」。
   * （2026-11-10 实测：karin-plugin-kkk/bilibiliAPP 就是这样被误判的）
   */
  const hit = (await commandObjectOf(row)) || (await findCommandEverywhere(row))
  if (!hit) {
    const hint = await disabledReasonOf(row)
    throw new Error(`${row.plugin}/${row.method} 在 ${row.file || 'apps'} 里没有导出可调用的指令对象${hint ? '（' + hint + '）' : ''}`)
  }
  /** 指令描述对象自带 `reg`/`permission`，调用时把 mock 交给 `.fnc` */
  const body = String(text ?? (args ? args.join(' ') : '')).trim()
  if (body) {
    mock.msg = body
    mock.rawMessage = body
    mock.elements = [{ type: 'text', text: body }]
  }
  /** 指令描述对象上的元信息（reg / permission）交给插件自己判断，这里只补它常读的字段 */
  if (hit.owner) {
    mock.command = hit.owner
    if (!mock.msg && hit.owner.label) mock.msg = String(hit.owner.label)
  }
  if (deliver && typeof mock.reply !== 'function') logger.warn('[astrbot-bridge] 事件对象没有 reply，插件可能发不出消息')
  /** 命令对象收到的第二参是「交给下一条」；有的实现是 sync 有的是 async，统一 await */
  return await hit.fn(mock, callNext, args || [])
}

/** 指令导出是 false 时给一句人能看懂的原因（kkk 的开关插件全走 `Config.xxx.switch && cmd`） */
const disabledReasonOf = async (row) => {
  try {
    const mod = await loadPluginModule(row)
    const raw = mod && row.method ? mod[row.method] : undefined
    if (raw === false || raw === 0 || raw === null) return '插件里这条指令是关闭状态，去插件配置里打开对应开关'
    return ''
  } catch {
    return ''
  }
}

/**
 * 把一段文本当作「机器人自己发的消息」投递到会话里
 *
 * 为什么需要它（用户 m03725 选的方案 B）：
 * 直接调 kkk 的指令对象要摸 Karin 内部结构，一改版就崩；而 kkk 的**自动解析**只要「消息里有链接」就会出卡片。
 * 所以这里不碰任何插件，只用 Karin 自己的发送接口把链接发进会话——剩下的交给 kkk 自己。
 *
 * 返回的是投递结果，不是卡片本身。
 * @param {{ text?: string, url?: string, scene?: 'friend'|'group', target?: string, selfId?: string }} input
 */
const sendText = async (input = {}) => {
  const text = String(input.text || input.url || '').trim()
  if (!text) return { ok: false, error: '缺少 text（要发送的内容）' }
  const scene = input.scene === 'group' ? 'group' : 'friend'
  const target = String(input.target || '').trim()
  if (!target) return { ok: false, error: scene === 'group' ? '缺少 target（要发到哪个群号）' : '缺少 target（要发给哪个 QQ）' }

  const bot = pickBot(input.selfId) || getAllBots()[0]
  if (!bot) return { ok: false, error: 'Karin 里没有在线 Bot（先确认 QQ 已登录）' }
  const contact = scene === 'group' ? contactGroup(target) : contactFriend(target)
  if (!contact) return { ok: false, error: '拿不到联系人对象，可能是 Bot 未连接' }
  /** Karin 1.18 没有 contact.sendMsg，主动消息统一走模块级 sendMsg(selfId, contact, elements) */
  const sendMsgFn = karinModule.sendMsg || karin?.sendMsg
  if (typeof sendMsgFn !== 'function') return { ok: false, error: 'node-karin 没有导出 sendMsg，无法主动发消息' }
  try {
    const ret = await sendMsgFn(botSelfId(bot), contact, [String(text)])
    return {
      ok: true,
      scene,
      target,
      selfId: botSelfId(bot),
      bytes: text.length,
      /** Karin 的发送接口返回的 message_id 之类，原样给调用方 */
      result: ret && typeof ret === 'object' ? ret : String(ret ?? ''),
      note: '已作为 Bot 消息发进会话；装了 kkk 这类链接自动解析插件时，卡片会紧接着出现',
    }
  } catch (error) {
    logger.error('[astrbot-bridge] 发送失败:', error)
    return { ok: false, scene, target, error: String((error && error.message) || error) }
  }
}

/**
 * 把一条链接交给「解析类插件」处理，让它的成品直接发到 QQ
 *
 * 与 call 的区别：
 * - call 是通用调试入口，任意指令都能调，回复默认只回给 AstrBot
 * - share 只允许白名单内的用例（B站 / 抖音），且强制 deliver，
 *   因为它存在的目的就是让 QQ 里看到卡片，AstrBot 不需要拿回内容
 * - 所有失败统一成一句人话，不抛异常：这是会被人直接说出口的操作
 * - useCase 留空时按链接自动判断；给了 useCase 就只在那个用例里找指令
 * @param {{ useCase?: string, url?: string, text?: string, scene?: 'friend'|'group', target?: string }} input
 */
const shareLink = async (input = {}) => {
  const text = String(input.text || input.url || '').trim()
  if (!text) return { ok: false, error: '缺少 text（要分享的链接）' }

  /** useCase 留空时按链接自己判断，省得调用方还得先分辨这是 B站还是抖音 */
  const asked = String(input.useCase || '').toLowerCase()
  const useCase = asked || inferUseCase(text)
  const spec = LINK_USE_CASES[useCase]
  if (!spec) {
    const hint = asked ? '' : `这段内容里没有找到能解析的链接（支持：${Object.keys(LINK_USE_CASES).join(' / ')}）`
    return {
      ok: false,
      error: asked
        ? `不支持的 useCase: '${asked}'（可用：${Object.keys(LINK_USE_CASES).join(' / ')}）`
        : hint || '无法判断该用哪条解析链',
      useCases: Object.keys(LINK_USE_CASES),
      text,
    }
  }
  if (!spec.accept(text)) {
    return {
      ok: false,
      error: `text 里没有找到${spec.label}能识别的链接（可用：${Object.keys(LINK_USE_CASES).join(' / ')}）`,
      useCase,
      text,
    }
  }

  const scene = input.scene === 'group' ? 'group' : 'friend'
  const target = String(input.target || '').trim()
  if (!target) {
    return {
      ok: false,
      error: scene === 'group' ? '缺少 target（要发到哪个群号）' : '缺少 target（要发给哪个 QQ）',
    }
  }

  /**
   * 首选：直接调插件的业务函数（合成一条消息事件喂进去）
   *
   * 这条路不经过指令注册表，所以不会遇到「导出里那条是 false / 替身」的问题；
   * 关卡只剩插件自己认不认这条链接、以及它自己的开关。
   */
  const handlerReport = []
  for (const exportName of spec.handlers || []) {
    for (const plugin of spec.plugins) {
      const started = Date.now()
      let resolved
      try {
        resolved = await callHandler({ plugin, file: spec.file, exportName }, {
          scene,
          target,
          userId: String(input.userId || '').trim(),
          selfId: String(input.selfId || '').trim(),
          text,
        })
      } catch (error) {
        handlerReport.push({ plugin, exportName, phase: 'resolve', error: String((error && error.message) || error) })
        logger.warn('[astrbot-bridge] 业务函数没找到: ' + JSON.stringify(handlerReport[handlerReport.length - 1]))
        continue
      }
      const { built, fn, via } = resolved
      try {
        logger.info('[astrbot-bridge] share 走业务函数: ' + JSON.stringify({ plugin, exportName, via, scene, target: built.target, selfId: built.selfId }))
        const result = await withTimeout(Promise.resolve().then(() => fn(built.event, () => {})), Number(input.timeout) || 90000)
        return {
          ok: true,
          via: 'handler',
          useCase,
          scene,
          target: built.target,
          plugin,
          exportName,
          /** 实际调的是哪个导出、怎么找到的 */
          resolvedFrom: via,
          took: Date.now() - started,
          /** 已经整条丢给插件了，卡片由插件自己 e.reply 出去 */
          result: result === undefined ? null : clip(JSON.stringify(result), 500),
          note: '已交给插件按链接解析，卡片由插件自己发到上面这个会话',
        }
      } catch (error) {
        handlerReport.push({ plugin, exportName, phase: 'run', error: String((error && error.message) || error) })
        logger.warn('[astrbot-bridge] 业务函数报错: ' + JSON.stringify(handlerReport[handlerReport.length - 1]))
      }
    }
  }

  /**
   * 业务函数找到了、也跑了，但它自己抛错：**不再退回指令兜底**。
   *
   * 指令兜底会把同一条链接再喂给插件一遍，kkk 的命令处理器出错时还会自己 e.reply
   * 一张「歇菜」错误卡到会话里——用户看到的噪音就是这张卡（2026-11-10 真机）。
   * 只把错误如实回给调用方，让 AstrBot 那边写日志。
   */
  const ranHandlers = handlerReport.filter((row) => row.phase === 'run')
  if (ranHandlers.length) {
    return {
      ok: false,
      error: `解析插件处理这条链接时出错：${ranHandlers[ranHandlers.length - 1].error}`,
      note: '业务函数已报错，没有再走指令兜底（否则插件会再发一张错误卡片）',
      useCase,
      scene,
      target,
      text,
      attempts: ranHandlers,
    }
  }

  /**
   * 挑哪条指令：用白名单里写死的 method，不去猜
   *
   * Karin 的指令路由只返回 { pluginName, method }，没有正则，
   * 所以没法像以前那样「按链接正则挑」，改成在 LINK_USE_CASES 里直接指定方法名。
   * kkk 的 tools.js 里：B站 => bilibiliAPP，抖音 => douyinAPP，都只吃一条链接。
   */
  const rows = await fetchLoadedCommands()
  const owned = rows.filter((row) => spec.plugins.includes(row.plugin))
  if (!owned.length) {
    return {
      ok: false,
      error: `没找到解析插件（${spec.plugins.join(' / ')}）的指令：检查插件是否安装并已加载`,
      useCase, scene, target,
    }
  }
  /**
   * 优先用 spec.command（kkk 的「引用解析」prefix，按链接分派到具体平台），
   * 没有这条时才退回 spec.methods 里写死的平台指令。
   */
  const chosen = (spec.command && owned.find((row) => row.method === spec.command)) ||
    owned.find((row) => (spec.methods || []).includes(row.method))
  logger.info('[astrbot-bridge] share 选指令: ' + JSON.stringify({ owned: owned.length, chosen: chosen && { method: chosen.method, file: chosen.file, label: chosen.label } }))
  if (!chosen) {
    return {
      ok: false,
      error: `${spec.plugins.join(' / ')} 里没有 ${spec.label} 的指令（期望方法：${[spec.command, ...(spec.methods || [])].filter(Boolean).join(' / ')}）`,
      useCase,
      text,
      candidates: owned.map((row) => ({ plugin: row.plugin, method: row.method, label: row.label })),
    }
  }
  /**
   * prefix 的正则是 /^#?(解析|kkk解析|弹幕解析)/，直接喂链接匹配不上，
   * 所以带上「解析」前缀；handlePrefix 自己会把前缀剥掉再按链接分派。
   */
  const callText = spec.command && chosen.method === spec.command ? '解析 ' + text : text

  const result = await callPlugin({
    plugin: chosen.plugin,
    method: chosen.method,
    text: callText,
    scene,
    target,
    userId: String(input.userId || '').trim() || undefined,
    deliver: true,
    ignorePermission: true,
    timeout: Number(input.timeout) || 90000,
  })

  if (result && result.ok) {
    return {
      ok: true,
      useCase,
      scene,
      target,
      plugin: chosen.plugin,
      method: chosen.method,
      /** 插件在渲染期间回复的提示（多为「正在解析...」），正文卡片不走这里 */
      notices: (result.reply || []).map((line) => clip(line, 200)).slice(0, 5),
      note: 'kkk 已经按链接解析，卡片会由 kkk 自己发到上面这个会话；这里拿不到卡片内容',
    }
  }
  return {
    ok: false,
    useCase,
    scene,
    target,
    plugin: chosen.plugin,
    method: chosen.method,
    error: (result && (result.error || result.blocked || (result.permission ? 'permission denied' : ''))) || '调用失败',
    reply: (result && result.reply) || [],
    /** 业务函数那条路是怎么失败的，排查时比「调用失败」有用 */
    handlerReport,
  }
}

/**
 * 只读诊断：插件模块里的导出此刻长什么样
 *
 * 为什么单独做一条：导出里到底是 function / 指令对象 / false（kkk 的 `Config.xxx.switch && bilibili`），
 * 光看日志猜不出，而 INFO 日志又只进控制台。这里把结论直接塞进 HTTP 响应。
 * @param {{ plugin?: string, file?: string, names?: string[] }} input
 */
const resolveReport = async (input = {}) => {
  const pluginName = String(input.plugin || 'karin-plugin-kkk').trim()
  const fileName = String(input.file || '').trim() || undefined
  const mod = await importPluginModule(pluginName, fileName)
  const names = Array.isArray(input.names) && input.names.length
    ? input.names.map(String)
    : Object.keys(mod || {})
  const seen = new Set()
  const rows = []
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    const value = mod && mod[name]
    const callable = resolveCallable(mod, name)
    rows.push({
      name,
      type: typeof value,
      value: typeof value === 'boolean' || value === null ? value : undefined,
      ctor: value && typeof value === 'object' ? (value.constructor && value.constructor.name) || '' : '',
      keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 16) : null,
      fncType: value && typeof value === 'object' ? typeof value.fnc : null,
      fncName: value && typeof value === 'object' && typeof value.fnc === 'function' ? String(value.fnc.name || '') : '',
      callable: callable ? { via: callable.via, target: callable.target, fnName: String(callable.fn.name || '') } : null,
    })
  }
  return {
    ok: true,
    plugin: pluginName,
    file: fileName || '(未指定，已扫 apps / lib/apps / 根目录)',
    exportCount: mod ? Object.keys(mod).length : 0,
    exports: mod ? Object.keys(mod).join(',') : '',
    rows,
  }
}

/**
 * 读取 Karin 运行时报错
 * @param {{ lines?: number, since?: string, onlyError?: boolean }} input
 */
const readLogs = async (input = {}) => {
  const lines = Math.min(Math.max(Number(input.lines) || 80, 5), 500)
  const onlyError = input.onlyError !== false

  /** 1. 进程内的结构化错误：带堆栈、带来源 */
  const holder = await loadErrorLogs()
  let errors = []
  if (holder) {
    try {
      const raw = holder.get()
      errors = (Array.isArray(raw) ? raw : [raw]).filter(Boolean)
    } catch (error) {
      logger.warn('[astrbot-bridge] 读取 errorLogs 失败:', error)
    }
  }
  const latest = errors.slice(-20).map((item) => ({
    time: item.time || item.createTime || '',
    type: item.type || '',
    message: clip(item.message || item.msg || String(item), 600),
    stack: clip(trimStack(item.stack || item.error && item.error.stack), 1200),
  }))

  /** 2. 文本日志：优先用 Karin 自带 /logs/file，失败再读本地目录 */
  let text = ''
  let source = ''
  const day = String(input.since || '').match(/^\d{4}-\d{2}-\d{2}$/) ? String(input.since) : ''
  try {
    const file = day || await latestLogDate()
    if (file) {
      text = await remoteLogFile(file)
      source = 'logs/file:' + file
    }
  } catch (error) {
    logger.warn('[astrbot-bridge] 读取 Karin 日志文件失败，降级为本地读取:', String((error && error.message) || error))
  }
  if (!text) {
    const local = await localLogFile(day)
    text = local.text
    source = local.source
  }

  const body = selectLines(text, lines, onlyError)
  return {
    source,
    errorCount: errors.length,
    errors: latest,
    log: body,
  }
}

/** 用 Karin 自己的 HTTP 接口取当天日志，避开私有路径依赖 */
const remoteLogFile = async (day) => {
  const port = process.env.HTTP_PORT
  if (!port) return ''
  const url = `http://127.0.0.1:${port}/api/v1/logs/file?file=${day}&token=${encodeURIComponent(bridgeToken())}`
  const res = await fetch(url)
  if (!res.ok) return ''
  const json = await res.json()
  return typeof json?.data === 'string' ? json.data : ''
}

/** 猜当天日期：用 Karin 日志文件列表接口，取最后一个 */
const latestLogDate = async () => {
  const port = process.env.HTTP_PORT
  if (!port) return ''
  const url = `http://127.0.0.1:${port}/api/v1/logs/list?token=${encodeURIComponent(bridgeToken())}`
  const res = await fetch(url)
  if (!res.ok) return ''
  const json = await res.json()
  const list = Array.isArray(json?.data) ? json.data : []
  return list
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item)))
    .sort()
    .pop() || ''
}

/** 兜底：按 Karin 默认目录结构找 logger.YYYY-MM-DD.log */
const localLogFile = async (day) => {
  const target = day || new Date().toLocaleDateString('sv-SE')
  const roots = [
    path.join(process.cwd(), 'logs'),
    path.join(process.cwd(), 'data', 'logs'),
    path.join(process.cwd(), '..', 'logs'),
  ]
  for (const root of roots) {
    const file = path.join(root, `logger.${target}.log`)
    try {
      if (fs.existsSync(file)) {
        return { text: fs.readFileSync(file, 'utf8'), source: 'file:' + file }
      }
    } catch {
      /* 继续找 */
    }
  }
  return { text: '', source: 'none' }
}

/** 取尾部若干行；onlyError 时优先挑含 error/失败/异常 的行 */
const selectLines = (text, lines, onlyError) => {
  const all = String(text || '').split('\n').filter(Boolean)
  if (!onlyError) return clip(all.slice(-lines).join('\n'), 12000)
  const hits = all.filter((line) => /\[ERROR\]|\[FATAL\]|Error:|失败|异常|Unhandled|uncaught/i.test(line))
  const picked = hits.slice(-lines)
  return clip(picked.length ? picked.join('\n') : all.slice(-lines).join('\n'), 12000)
}

/** 只保留前 8 层栈，避免把整段路径灌进模型上下文 */
const trimStack = (stack) => {
  if (!stack) return ''
  return String(stack).split('\n').slice(0, 8).join('\n')
}

/** 截断长文本，保留头尾 */
const clip = (text, max = 4000) => {
  const value = String(text == null ? '' : text)
  return value.length <= max ? value : value.slice(0, max) + `\n...[省略 ${value.length - max} 字]`
}

/**
 * 最小事件对象：只提供插件常用字段，不含任何 OneBot 事件结构
 */
const createEventMock = ({ selfId, userId, scene, contact, sender, text, outbox, bot, deliver = false }) => {
  const event = {
    event: 'message',
    subEvent: scene,
    eventId: 'astrbot-bridge:' + Date.now(),
    selfId,
    userId,
    sender,
    contact,
    groupId: scene === 'group' ? contact.peer : '',
    msg: text,
    rawMessage: text,
    alias: '',
    elements: [{ type: 'text', text }],
    messageId: 'astrbot-bridge',
    messageSeq: 0,
    isMaster: false,
    isAdmin: false,
    isFriend: scene === 'friend',
    isGroup: scene === 'group',
    isPrivate: scene === 'friend',
    isGuild: false,
    isDirect: false,
    store: new Map(),
    bot: bot || { selfId, logger: () => {}, sendMsg: async () => ({ messageId: '' }) },
    reply: async (elements, options) => {
      outbox.push(await toText(elements))
      if (options && options.recallMsg) void options
      /** deliver 为真时真的发出去（用于 AstrBot 主动通知主人），否则只回给 AstrBot */
      if (deliver) {
        try {
          await sendThroughBot(mock.bot, contact, deliveredElements(elements))
        } catch (error) {
          logger.warn('[astrbot-bridge] deliver 发送失败:', error)
        }
      }
      return { messageId: 'astrbot-bridge-' + outbox.length, time: 0, messageTime: 0, rawData: {} }
    },
  }
  return event
}

/**
 * ── 合成消息事件：让 AstrBot 像用户一样「发一条消息」给插件 ──────────────
 *
 * 为什么不用 createEventMock：那个 mock 只喂给指令对象的 fnc，字段是手搓的普通对象，
 * 缺 karin 事件类自己的 getter（isPrivate / userId / reply 的行为）。
 * 插件的业务函数（kkk 的 handleBilibili 等）会把 e 当真正的 Message 用，
 * 所以这里直接实例化 karin 自己的 FriendMessage / GroupMessage —— 行为与真事件一致。
 *
 * 唯一的「假」处：rawEvent 为空、msg 系列字段由我们回填（真事件里由 karin 的消息解析写入）。
 * 反过来这也是优点：没有 rawEvent 就取不到引用消息，插件只会按「这条消息的文本」处理。
 */
const EVENT_CLASS_NAMES = [
  ['FriendMessage', 'contactFriend', 'senderFriend'],
  ['GroupMessage', 'contactGroup', 'senderGroup'],
]

/**
 * 找 karin 的事件类与 contact/sender 工厂
 * 1.18 的 dist 里有这些导出，但打包器可能改名，所以额外按名字扫一遍 karin 命名空间
 */
const loadEventClasses = () => {
  if (eventClasses) return eventClasses
  const pools = [karinModule, karin, karin && karin.events].filter(Boolean)
  const pick = (name) => {
    for (const pool of pools) {
      const value = pool && pool[name]
      if (typeof value === 'function') return value
    }
    return null
  }
  const found = {}
  for (const group of EVENT_CLASS_NAMES) {
    for (const name of group) {
      const fn = pick(name)
      if (fn) found[name] = fn
    }
  }
  eventClasses = found
  logger.info('[astrbot-bridge] 事件类可用性: ' + JSON.stringify(Object.keys(found)))
  return found
}

/**
 * 造一条合成消息事件
 * @param {{ scene?: string, target?: string, userId?: string, selfId?: string, text?: string }} input
 */
const buildSyntheticMessage = (input = {}) => {
  const classes = loadEventClasses()
  const scene = input.scene === 'group' ? 'group' : 'friend'
  const target = String(input.target || '').trim()
  if (!target) throw new Error(`缺少 target（要发到哪个${scene === 'group' ? '群号' : ' QQ'}）`)

  const bot = pickBot(input.selfId)
  if (!bot) throw new Error('没有可用的 Bot 实例（Karin 里没有已连接的账号）')
  /** LLOneBot 登录后 bot.selfId 可能为空，账号 id 挂在 adapter.account 上，逐层兜底 */
  const selfId = String(input.selfId || '') || botSelfId(bot)
  const userId = String(input.userId || '').trim() || selfId
  const text = String(input.text || '')

  const Ctor = scene === 'group' ? classes.GroupMessage : classes.FriendMessage
  const makeContact = scene === 'group' ? classes.contactGroup : classes.contactFriend
  const makeSender = scene === 'group' ? classes.senderGroup : classes.senderFriend
  if (!Ctor || !makeContact || !makeSender) {
    throw new Error(`karin 里没有 ${scene} 的事件类（缺 ${[!Ctor && (scene === 'group' ? 'GroupMessage' : 'FriendMessage'), !makeContact && 'contact*', !makeSender && 'sender*'].filter(Boolean).join(' / ')}）`)
  }

  const stamp = Date.now()
  const contact = makeContact(target, '')
  const sender = scene === 'group' ? makeSender(userId, 'member', 'AstrBot') : makeSender(userId, 'AstrBot')
  /**
   * srcReply 必须是「真能发出去」的函数
   *
   * karin 的 BaseEvent.reply 只做三件事：补 at / 补引用、打日志、调 this.#srcReply(message)，自己不发送。
   * 之前传 null，于是插件每次 e.reply(...) 都会抛 TypeError（被 wrapWithErrorHandler 吞掉），
   * 表现就是「接口成功、耗时几秒、但什么也没收到」——插件其实把活干完了，只是最后一脚没人踢。
   */
  const srcReply = async (elements) => {
    /**
     * 入口日志：插件每调一次 e.reply 都会到这里。
     * 如果日志里「截图完成」之后没有这一行，说明插件根本没走到 reply（或走的是别的发送通道）；
     * 有这一行但没有「已发出」，就是发送环节失败——两种情况要分开定位。
     */
    const list = Array.isArray(elements) ? elements : [elements]
    const shape = list.map((el) => (el && typeof el === 'object' ? String(el.type || el.app || '?') : typeof el))
    /** 图片元素长什么样：file 是 base64:// 还是 http URL，决定能不能直接交给 OneBot */
    const first = list[0]
    const probe = first && typeof first === 'object'
      ? { type: first.type, fileHead: String((first.file || (first.data && first.data.file) || '')).slice(0, 60), keys: Object.keys(first).slice(0, 8) }
      : null
    logger.info('[astrbot-bridge] srcReply 进入: ' + JSON.stringify({ scene, target, count: list.length, shape, probe }))
    const sent = await sendThroughBot(bot, contact, deliveredElements(elements))
    if (!sent || !sent.ok) {
      logger.error('[astrbot-bridge] srcReply 发送失败: ' + JSON.stringify({ scene, target, attempts: (sent && sent.attempts) || [] }))
      throw new Error('发送失败：' + String((sent && sent.attempts && sent.attempts.join(' | ')) || '没有可用的发送接口'))
    }
    const inner = sent.result || {}
    logger.info('[astrbot-bridge] 合成事件回复已发出: ' + JSON.stringify({ via: sent.via, scene, target, elements: (elements || []).length }))
    return {
      messageId: String(inner.messageId || inner.message_id || ''),
      time: 0,
      messageTime: 0,
      rawData: inner,
    }
  }
  const event = new Ctor({
    eventId: 'astrbot-bridge:' + stamp,
    rawEvent: null,
    time: Math.floor(stamp / 1000),
    contact,
    sender,
    srcReply,
    bot,
    messageId: 'astrbot-bridge:' + stamp,
    messageSeq: 0,
    elements: [{ type: 'text', text }],
  })
  /** 这三个字段在真事件里由 karin 的消息解析写入；合成事件没人写，这里补上 */
  event.msg = text
  event.alias = text
  event.rawMessage = text
  return { event, bot, contact, selfId, userId, scene, target }
}

/**
 * 直接调用插件导出的「业务函数」（不是指令对象）
 *
 * 为什么值得单独一条路：kkk 的 handleBilibili / handleDouyin 是 wrapWithErrorHandler 包过的纯业务函数，
 * 不依赖指令注册表（reg/priority/permission 全用不上），只要给它一条像样的 e 就能出卡片。
 * 而走指令对象要跨过 Karin 的注册表快照，前面已经踩过坑（导出里那条是 false 或替身）。
 *
 * @param {{ plugin: string, file?: string, exportName: string }} where
 * @param {{ scene?: string, target?: string, userId?: string, selfId?: string, text?: string, timeout?: number }} input
 */
/**
 * 从一个模块里取「可调用的处理函数」
 *
 * kkk 的实际形状（打包后的 lib/apps/tools.js 只有 3 行）：
 *   import { a as bilibiliAPP, l as prefix, ... } from '../core_chunk/main.js'
 *   export { bilibiliAPP, prefix, ... }
 * 也就是**只导出指令对象，不导出 handleBilibili 这类业务函数**（它在 bundle 里是私有 var）。
 * 好在指令对象自己就包着那个函数：karin.command(reg, handleBilibili, ...) 返回的 { fnc: handleBilibili }。
 *
 * 所以按「导出名 / 指令对象 / .fnc / 模块内同名导出」四级去找，任何一级命中都能调。
 * @param {any} mod 模块命名空间
 * @param {string} exportName 期望的导出名（如 handleBilibili）
 * @returns {{ fn: Function, via: string, target: string } | null}
 */
const resolveCallable = (mod, exportName) => {
  if (!mod) return null
  const describe = (value) => {
    if (typeof value === 'function') return { fn: value, kind: 'function' }
    if (value && typeof value === 'object') {
      if (typeof value.fnc === 'function') return { fn: value.fnc, kind: 'fnc' }
      /** 有些插件把函数挂在 data/fnc 之下，再兜一层 */
      const nested = value.data && typeof value.data.fnc === 'function' ? value.data.fnc : null
      if (nested) return { fn: nested, kind: 'data.fnc' }
    }
    return null
  }
  /** 1. 直接是那个导出 */
  const direct = describe(mod[exportName])
  if (direct) return { fn: direct.fn, via: direct.kind, target: exportName }
  /**
   * 2. 期望名是业务函数、模块只导出指令对象时：把名字映射到指令对象
   * handleBilibili → bilibiliAPP / bilibili，handleDouyin → douyinAPP / douyin …
   */
  const base = exportName.replace(/^handle/, '')
  const guesses = [base + 'APP', base, base[0] && (base[0].toLowerCase() + base.slice(1)) + 'APP', base[0] && (base[0].toLowerCase() + base.slice(1))].filter(Boolean)
  for (const name of guesses) {
    const hit = describe(mod[name])
    if (hit) return { fn: hit.fn, via: 'alias:' + hit.kind, target: name }
  }
  /** 3. 全模块扫一遍：谁的 fnc 名字（或函数名）与期望名吻合就取它 */
  for (const [name, value] of Object.entries(mod)) {
    const hit = describe(value)
    if (!hit) continue
    const fnName = String(hit.fn.name || '')
    if (fnName && fnName === exportName) return { fn: hit.fn, via: 'scan:' + hit.kind, target: name }
  }
  return null
}

/** 无指定文件名时的候选顺序：npm 包先 lib/apps，git 插件先 apps */
const MODULE_CANDIDATES = ['tools.js', 'lib/apps/tools.js', 'apps/tools.js']

const callHandler = async (where, input = {}) => {
  /**
   * npm 装的插件把指令对象放在 lib/apps/<file>，没给文件名时按「入口 → 指令目录」的顺序逐个试，
   * 因为入口 lib/index.js 只 import 一遍主包、不导出任何东西（导出为空 ≠ 文件加载失败）。
   */
  const tried = []
  if (where.file) {
    tried.push(where.file)
  } else {
    tried.push(...MODULE_CANDIDATES)
  }
  let mod = null
  const errors = []
  for (const file of tried) {
    try {
      mod = await importPluginModule(where.plugin, file)
      if (mod && Object.keys(mod).length) break
    } catch (error) {
      errors.push(String((error && error.message) || error))
      mod = null
    }
  }
  const pick = mod ? resolveCallable(mod, where.exportName) : null
  if (!pick) {
    const keys = mod ? Object.keys(mod).join(',') : '(模块为空)'
    const why = errors.length ? `加载失败：${errors.slice(0, 2).join('；')}` : `现有导出：${keys || '无'}`
    throw new Error(`${where.plugin}/${where.file || tried.join(' → ')} 里找不到可调用的 ${where.exportName}（${why}）`)
  }
  const built = buildSyntheticMessage(input)
  return { built, fn: pick.fn, via: pick.via, target: pick.target }
}

/** 把元素归一成 bot.sendMsg 接受的形式 */
const deliveredElements = (elements) => (Array.isArray(elements) ? elements : [{ type: 'text', text: String(elements) }])

/**
 * 用 Bot 自己的原生接口把消息发出去
 *
 * 为什么要它：kkk 这类插件在事件里调 `e.reply(segment.image(...))` 出卡片，
 * 只有把这条回复真的交给 Bot，QQ 里才看得到卡片；以前只把文本塞进 outbox，卡片就丢了。
 * 发不出去不算致命：退回到 node-karin 的模块级 sendMsg，最后才放弃。
 */
const sendThroughBot = async (bot, contact, elements) => {
  const native = bot && bot.__bridgeSend
  const scene = contact && contact.scene === 'group' ? 'group' : 'friend'
  const peer = String((contact && contact.peer) || '')
  const attempts = []
  if (native) {
    /** 按优先级把每个候选接口都试一遍，参数形状按方法名区分 */
    const order = [native.name, ...(native.methods || [])].filter((name, i, arr) => name && arr.indexOf(name) === i)
    for (const name of order) {
      const fn = bot[name]
      if (typeof fn !== 'function') continue
      const argv = /^(sendFriendMsg|sendPrivateMsg|sendGroupMsg|sendGroup)$/.test(name) ? [peer, elements] : [contact, elements]
      try {
        const ret = await fn.apply(bot, argv)
        return { ok: true, via: 'bot.' + name, result: ret }
      } catch (error) {
        attempts.push('bot.' + name + ': ' + String((error && error.message) || error))
      }
    }
  }
  const fallback = karinModule.sendMsg || karin?.sendMsg
  if (typeof fallback === 'function') {
    try {
      const ret = await fallback(botSelfId(bot), contact, elements)
      /**
       * 模块级 sendMsg 会把 base64:// 图片转成 Karin 自己的 console URL，
       * 那个地址要鉴权，外部（LLOneBot 拉图）拿到的是 403 —— 发出去也等于没发。
       * 所以这一条只认同回执、且不含图片的情况。
       */
      const hasImage = Array.isArray(elements) && elements.some((el) => el && el.type === 'image')
      if (hasImage) {
        attempts.push('karin.sendMsg: 图片会被转成需要鉴权的内部 URL，外部拉不到，已跳过')
        return { ok: false, via: 'karin.sendMsg', attempts }
      }
      return { ok: true, via: 'karin.sendMsg', result: ret }
    } catch (error) {
      attempts.push('karin.sendMsg: ' + String((error && error.message) || error))
    }
  }
  logger.warn('[astrbot-bridge] 用 Bot 接口发送失败:', attempts.join(' | ') || '没有可用接口')
  return { ok: false, attempts }
}

const withTimeout = (promise, ms) => {
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('插件执行超时 ' + ms + 'ms')), ms)
  })
  return Promise.race([Promise.resolve(promise), guard]).finally(() => clearTimeout(timer))
}

const toText = async (elements) => {
  if (typeof elements === 'string') return elements
  if (!Array.isArray(elements)) return String(elements)
  return elements.map((el) => {
    if (typeof el === 'string') return el
    if (!el) return ''
    if (el.type === 'text') return el.text || (el.data && el.data.text) || ''
    if (el.type === 'image') return '[图片]'
    if (el.type === 'at') return `@${el.targetId || (el.data && el.data.qq) || ''}`
    return `[${el.type}]`
  }).join('')
}

/**
 * 把 karin.command / karin.regex 的正则源码还原成「人看的指令」
 * - `^#?转发状态$` -> `转发状态`
 * - `^#?(?:点歌|点播)\s*(.+)$` -> `点歌|点播 <参数>`
 */
const bare = (source = '') => {
  let text = String(source)
  text = text.replace(/^\^/, '').replace(/(?<!\\)\$$/, '')
  text = text.replace(/^\(\?:#\?\)\?/, '').replace(/^\(\?:\?#\?\)/, '').replace(/^#\?/, '')
  text = text.replace(/\(\?:\?\.\*\)|\(\?:\?\.\+\)|\(\.\*\)|\(\.\+\)|\(\[\^?[^\]]*\]\+\)|\(\\S\+\)/g, ' <参数>')
  text = text.split('(?:').join('')
  if ((text.match(/\)/g) || []).length > (text.match(/\(/g) || []).length) text = text.replace(/\)/, '')
  /** 非捕获组拆完后残留的元字符：命令行里不会出现，去掉 */
  text = text.replace(/[()|]/g, '')
  text = text.replace(/\\s\*/g, ' ').replace(/\\s\+/g, ' ').replace(/\\s/g, ' ')
  text = text.replace(/\\(.)/g, '$1')
  return text.replace(/\s{2,}/g, ' ').trim()
}

/**
 * 从正则反推一段能被它匹配的文本
 * 逐个字符展开：字面量照抄、分组取第一个分支、.+ 之类给个占位值
 */
const sampleOf = (reg) => {
  if (!reg || !reg.source) return ''
  const out = []
  const src = reg.source
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '^' || ch === '$') { i += 1; continue }
    if (ch === '\\') {
      const next = src[i + 1]
      if (next === 's' || next === 'S') { out.push(' '); i += next === 's' ? 2 : 4; continue }
      if (next === 'd' || next === 'w') { out.push('1'); i += 2; continue }
      out.push(next || '')
      i += 2
      continue
    }
    if (ch === '(') {
      /** 取第一个候选分支的内容，跳过 ?: 等修饰 */
      let j = i + 1
      if (src.startsWith('?:', j)) j += 2
      if (src.startsWith('#?', j)) j += 2
      let depth = 1
      let buf = ''
      while (j < src.length && depth > 0) {
        if (src[j] === '(') depth += 1
        if (src[j] === ')') { depth -= 1; if (!depth) break }
        if (depth === 1 && src[j] === '|') { buf = buf.split('|')[0]; while (j < src.length && src[j] !== ')') j += 1; continue }
        buf += src[j]
        j += 1
      }
      /** 分组内部的 .+ 之类的占位符换成实值，否则样例不可用 */
      out.push(String(sampleOf(new RegExp('^' + buf + '$')) || '1').replace(/\.\+/g, '内容').replace(/\.\*/g, ''))
      i = src[j] === ')' ? j + 1 : j
      /** 吃掉 . + * 和 ? */
      while (i < src.length && (src[i] === '.' || src[i] === '+' || src[i] === '*' || src[i] === '?')) i += 1
      continue
    }
    if (ch === '[') {
      const end = src.indexOf(']', i)
      const cls = src.slice(i, end + 1)
      out.push(/\d/.test(cls) ? '1' : 'a')
      i = end + 1
      while (i < src.length && (src[i] === '+' || src[i] === '*' || src[i] === '?')) i += 1
      continue
    }
    if (ch === '.' || ch === '+' || ch === '*' || ch === '?') { i += 1; continue }
    out.push(ch)
    i += 1
  }
  const cleaned = (value) => String(value)
    .replace(/\s{2,}/g, ' ')
    .trim()
    /** 去掉开头可选的 # 之类前缀字符：Karin 收消息时会剥掉 */
    .replace(/^#[?\s]*/, '')
  const text = cleaned(out.join(''))
  if (reg.test(text)) return text
  /** 再试一次去掉可选前缀后的形式 */
  const noPrefix = cleaned(text.replace(/^[#\/!.]*/, ''))
  return reg.test(noPrefix) ? noPrefix : bare(reg.source).replace(/ <参数>/g, ' 1')
}

/**
 * 运行时探测（临时调试入口）
 *
 * 目的只有一个：弄清楚容器里到底跑的是哪份代码、kkk 的命令对象长什么样。
 * 返回的都是摘要（键名、类型），不写文件。
 * @param {{ module?: string, file?: string }} input
 */
const probeRuntime = async (input = {}) => {
  const target = process.env.__ASTRBOT_BRIDGE_DIR || pluginRoot()
  const routeFile = path.join(target, 'route.js')
  const info = {
    build: BRIDGE_BUILD,
    dir: target,
    routeMtime: fs.existsSync(routeFile) ? fs.statSync(routeFile).mtime.toISOString() : '',
    routeBytes: fs.existsSync(routeFile) ? fs.statSync(routeFile).size : 0,
    hasFindEverywhere: typeof findCommandEverywhere === 'function',
    karinExports: Object.keys(karinModule || {}).slice(0, 60),
    module: null,
  }
  const name = String(input.module || '').trim()
  if (name) {
    try {
      const list = (await getPlugins('all', true, false)) || []
      const plugin = list.find((item) => item.name === name)
      info.pluginFound = Boolean(plugin)
      if (plugin && plugin.dir) {
        info.pluginDir = plugin.dir
        const files = []
        for (const sub of ['apps', path.join('lib', 'apps')]) {
          const dir = path.join(plugin.dir, sub)
          if (!fs.existsSync(dir)) continue
          for (const file of await fs.promises.readdir(dir)) files.push({ sub, file })
        }
        info.module = {}
        for (const item of files) {
          if (input.file && item.file !== input.file) continue
          const full = path.join(plugin.dir, item.sub, item.file)
          try {
            const mod = await import(pathToFileURL(full).href)
            info.module[item.sub + '/' + item.file] = Object.entries(mod).map(([key, value]) => ({
              key,
              type: typeof value,
              name: typeof value === 'function' ? String(value.name || '').slice(0, 40) : '',
              keys: value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).slice(0, 12) : undefined,
            }))
          } catch (error) {
            info.module[item.sub + '/' + item.file] = 'import 失败: ' + String((error && error.message) || error)
          }
        }
      }
      info.globals = Object.keys(globalThis).filter((key) => /kkk|karin|cache|command/i.test(key)).slice(0, 40)
      info.bots = getAllBots().map((bot) => {
        const selfId = botSelfId(bot)
        let viaGetBot = null
        try { viaGetBot = Boolean(karinModule.getBot && karinModule.getBot(selfId)) } catch (error) { viaGetBot = 'error: ' + String((error && error.message) || error) }
        const native = (bot && bot.__bridgeSend) || {}
        return {
          selfId,
          standard: (bot.adapter && bot.adapter.standard) || '',
          protocol: (bot.adapter && bot.adapter.protocol) || '',
          adapterName: (bot.adapter && (bot.adapter.name || bot.adapter.id)) || '',
          getBot: viaGetBot,
          ctor: (bot.constructor && bot.constructor.name) || '',
          sendMethods: native.methods || [],
          sendKeys: Object.keys(bot).filter((key) => /send|reply|push|msg/i.test(key)).slice(0, 20),
        }
      })
      /** 顺带把「指令行 → 能调的函数」这条链走一遍，不用等真调用 */
      try {
        const rows = await fetchLoadedCommands(true)
        const wanted = String(input.method || '').trim()
        if (wanted) {
          /** 点名某条指令时，把每一步的返回都摊开，看清是「没导出」还是「读出来是空」 */
          const row = { plugin: name, method: wanted, file: String(input.file || 'tools.js'), label: '' }
          try {
            const mod = await loadPluginModule(row)
            const value = mod && mod[wanted]
            info.trace = {
              moduleLoaded: Boolean(mod),
              moduleKeys: mod ? Object.keys(mod) : [],
              valueType: typeof value,
              valueKeys: value && typeof value === 'object' ? Object.keys(value) : [],
              hasFnc: Boolean(value && typeof value.fnc === 'function'),
              asCommand: Boolean(asCommand(value)),
            }
          } catch (error) {
            info.trace = 'loadPluginModule 抛错: ' + String((error && error.message) || error)
          }
          const hit = await commandObjectOf(row).catch((error) => ({ error: String((error && error.message) || error) }))
          info.traceHit = hit
        }
        info.sample = []
        for (const row of rows.filter((item) => item.plugin === name).slice(0, 4)) {
          const hit = await commandObjectOf(row)
          info.sample.push({ method: row.method, via: hit ? hit.via : null, exportName: hit ? hit.exportName : null, fnName: hit ? String(hit.fn.name || '') : '' })
        }
      } catch (error) {
        info.sampleError = String((error && error.message) || error)
      }
    } catch (error) {
      info.error = String((error && error.message) || error)
    }
  }
  return info
}


/** 1.18 的 Bot 实例把 QQ 号藏在 adapter.account 里，selfId 常常是空的（见 probe 输出） */
const botSelfId = (bot) => String(
  (bot && (bot.selfId || bot.uin))
  || (bot && bot.adapter && bot.adapter.account && (bot.adapter.account.selfId || bot.adapter.account.uin))
  || (bot && bot.account && (bot.account.selfId || bot.account.uin))
  || '',
).replace(/^\s+|\s+$/g, '')

const describeBot = (bot) => ({
  selfId: botSelfId(bot),
  name: (bot.account && bot.account.name) || '',
  uin: (bot.account && bot.account.uin) || '',
  standard: (bot.adapter && bot.adapter.standard) || '',
  protocol: (bot.adapter && bot.adapter.protocol) || '',
})

const getAllBots = () => {
  /** node-karin 1.18 的导出名是 getAllBot / getAllBotList，没有 getBotAll */
  const read = [karinModule.getAllBotList, karinModule.getAllBot, karin.getAllBotList, karin.getAllBot, karin.getBotAll]
    .find((fn) => typeof fn === 'function')
  try {
    const raw = read ? read() : []
    /**
     * getAllBot 给的是 Bot 类实例数组；getAllBotList 给的是 `[{ index, bot }]`，
     * 形状不定，统一摊平成「带 selfId 的对象」列表。
     */
    const list = Array.isArray(raw) ? raw : Object.values(raw || {})
    return list.map((item) => (item && item.bot ? item.bot : item)).filter((item) => item && typeof item === 'object')
      /** 每台 Bot 都自带原生发送接口；插件的 e.reply 真正「按 Bot 身份发出去」就靠它 */
      .map((bot) => {
        const standard = String((bot.adapter && bot.adapter.standard) || '')
        const names = standard === 'onebot'
          ? ['sendMsg', 'sendFriendMsg', 'sendGroupMsg', 'sendPrivateMsg', 'send']
          : ['sendMsg', 'send', 'sendFriendMsg', 'sendGroupMsg']
        /**
         * 登记「所有」能发的接口，而不只是第一个：
         * 第一个方法签名不对（比如需要 peer 而不是 contact）时，还能换下一个再试，
         * 不会一路掉到 karin.sendMsg 那条 URL 化的路径上。
         */
        const methods = names.filter((name) => typeof bot[name] === 'function')
        if (methods.length) {
          const first = methods[0]
          return Object.assign({}, bot, { __bridgeSend: { name: first, fn: bot[first], methods } })
        }
        return bot
      })
  } catch (error) {
    logger.warn('[astrbot-bridge] 获取 Bot 列表失败:', error)
    return []
  }
}

/**
 * 挑一个 Bot
 * 优先级：显式 selfId → 第一个 onebot 协议的真 QQ → 第一个非 console
 * （Karin 默认带一个 selfId 叫 "console" 的假 Bot，用它发消息只会落在控制台）
 */
const pickBot = (selfId) => {
  const bots = getAllBots()
  if (!bots.length) return null
  if (selfId) return bots.find((bot) => botSelfId(bot) === String(selfId)) || null
  const real = bots.find((bot) => botSelfId(bot) !== 'console' && bot.adapter && bot.adapter.standard === 'onebot')
  return real || bots.find((bot) => botSelfId(bot) !== 'console') || bots[0]
}

const readPkg = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return {}
  }
}

const readVersion = (dir) => String(readPkg(dir).version || '0.0.0')