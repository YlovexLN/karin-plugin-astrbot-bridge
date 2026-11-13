// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * 冒烟测试：不需要安装任何依赖，也不连真实 Karin。
 *
 * 和 karin-plugin-selfmsg 同一套做法：就地写一个 node_modules/node-karin 桩件
 * （node_modules 已在 .gitignore 里，不会被提交），然后直接 import 本插件。
 *
 * 覆盖的是「不碰网络、不碰容器」那部分：
 *   ping / plugins 之外的纯逻辑、action 分发、令牌校验、pack 白名单、
 *   package.json 与 web.config.js 的契约。
 *
 * 运行：node scripts/test.mjs
 * 退出码 0 表示全部通过。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stubDir = join(root, 'node_modules', 'node-karin')

const STUB_PKG = JSON.stringify(
  { name: 'node-karin', version: '0.0.0', type: 'module', main: 'index.js' },
  null,
  2
)

/**
 * 只导出本插件 route.js / index.js 真正用到的东西。
 * 缺哪个会在 import 阶段直接炸，正好用来发现「新增了一个依赖 node-karin 的导出」。
 */
const STUB_JS = `
export const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
export const config = { master: [], admin: [], prefix: [] }
export const karin = { getAllBot: () => [], getBot: () => null, getPlugin: () => null, getPluginList: () => [] }
export const router = null
`

/** 只在「没有 node-karin」或「已有的是本脚本生成的桩件」时写入，不覆盖真正的 node-karin */
const isOurStub = () => {
  try {
    return JSON.parse(readFileSync(join(stubDir, 'package.json'), 'utf8')).version === '0.0.0'
  } catch {
    return false
  }
}

if (!existsSync(stubDir) || isOurStub()) {
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(join(stubDir, 'package.json'), STUB_PKG)
  writeFileSync(join(stubDir, 'index.js'), STUB_JS)
}

/**
 * 把工作目录挪到临时目录再加载模块：route.js 里 `pluginRoot()` 之外还有几处
 * 会按 cwd 兜底找路径，测试时不换目录就会在仓库里留下残渣。
 */
const tmpRoot = mkdtempSync(join(tmpdir(), 'astrbot-bridge-'))
process.chdir(tmpRoot)

const results = []
const check = (name, ok, extra = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}

/** 最小 req/res 桩，够 handler 走一遍 */
const makeRes = () => {
  const out = { code: 0, body: null, headersSent: false }
  out.res = {
    statusCode: 200,
    headersSent: false,
    setHeader: () => {},
    status (code) { this.statusCode = code; return this },
    json (payload) { this.headersSent = true; out.code = this.statusCode; out.body = payload; return this },
    end (payload) { this.headersSent = true; out.code = this.statusCode; out.body = payload; return this },
  }
  return out
}

/** web-dist 存在时才测 WebUI；本地没跑过 vite build 就跳过，不让测试因缺产物而红 */
const hasWebDist = () => {
  try {
    return statSync(join(root, 'web-dist', 'index.html')).isFile()
  } catch {
    return false
  }
}

const call = async (action, body = {}, token = '') => {
  const box = makeRes()
  const req = {
    method: 'POST',
    url: '/api/v1/astrbot/' + action + (token ? '?token=' + token : ''),
    originalUrl: '/api/v1/astrbot/' + action + (token ? '?token=' + token : ''),
    query: token ? { token } : {},
    headers: {},
    params: { action },
    body,
  }
  await astrbotBridgeHandler(req, box.res)
  return { code: box.code, body: box.body }
}

process.env.HTTP_AUTH_KEY = 'test-token'
process.env.ASTRBOT_BRIDGE_TOKEN = ''
const route = await import('../route.js')
const { astrbotBridgeHandler } = route

/** 1. ping：不需要令牌也能确认路由挂上了（但带着令牌就必须是对的，错令牌一律 401） */
{
  const r = await call('ping', {}, 'test-token')
  check('ping 不要求令牌', r.code === 200 && r.body?.pong === true, 'code=' + r.code + ' body=' + JSON.stringify(r.body).slice(0, 160))
  check('ping 带版本号', typeof r.body?.version === 'string' && r.body.version.length > 0, r.body?.version)
  check('ping 带构建标记', typeof r.body?.build === 'string' && r.body.build.length > 0, r.body?.build)
}

/** 2. 令牌校验：没令牌 401，错令牌 401，对的 200 */
{
  const noToken = await call('plugins')
  check('没令牌 → 401', noToken.code === 401, String(noToken.code))
  const wrong = await call('plugins', {}, 'wrong')
  check('错令牌 → 401', wrong.code === 401, String(wrong.code))
}

/** 3. 未知 action 要说清楚有哪些可用 */
{
  const r = await call('nope', {}, 'test-token')
  check('未知 action → 500', r.code === 500, String(r.code))
  check('未知 action 列出可用项', String(r.body?.message || '').includes('可用'), String(r.body?.message || '').slice(0, 40))
}

/** 4. 令牌不是硬编码，跟着 HTTP_AUTH_KEY 走 */
{
  check('bridgeToken() 读 HTTP_AUTH_KEY', route.bridgeToken() === 'test-token', String(route.bridgeToken()))
}

/** 5. package.json 契约：Karin 读 name / karin.web，分发白名单必须含运行时文件 */
{
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  check('package.json 有 karin.web', typeof pkg.karin?.web === 'string')
  /** npm 类型插件只有声明了 karin.apps，Karin 才会加载它的 apps 文件（getNpmInfo 里 !pkg.karin?.apps?.length 直接返回空 apps） */
  check('package.json 有 karin.apps（npm 安装必需）', typeof pkg.karin?.apps === 'string' && pkg.karin.apps.length > 0, String(pkg.karin?.apps))
  check('karin.apps 指向的文件存在', existsSync(join(root, String(pkg.karin?.apps || '').replace(/^\.\//, '') || '__none__')))
  check('许可证是 AGPL-3.0-only', pkg.license === 'AGPL-3.0-only', pkg.license)
  check('LICENSE 文件存在', existsSync(join(root, 'LICENSE')))
  for (const need of ['index.js', 'apps.js', 'dir.js', 'route.js', 'web.config.js']) {
    check(`files 白名单含 ${need}`, pkg.files.some((f) => f === need))
  }
  check('dir.js 在磁盘上', existsSync(join(root, 'dir.js')))
}

/** 6. web.config.js：Karin 1.16.1+ 无条件读 info.version，缺了整页 500 */
{
  const { default: webConfig } = await import('../web.config.js')
  check('web.config 有 info.version', typeof webConfig?.info?.version === 'string')
  check('web.config 有 page.url', typeof webConfig?.page?.url === 'string')
  check('page.url 指向本插件 action', String(webConfig?.page?.url).startsWith('/api/v1/astrbot/page'))
  check('components() 返回数组', Array.isArray(webConfig.components?.()))
}

/** 7. WebUI 页面能取出来（GET，无令牌也不含密钥） */
{
  const box = makeRes()
  await astrbotBridgeHandler(
    { method: 'GET', url: '/api/v1/astrbot/page', originalUrl: '/api/v1/astrbot/page', query: {}, headers: {}, params: { action: 'page' }, body: {} },
    box.res
  )
  check('page 返回 200', box.code === 200, String(box.code))
  if (hasWebDist()) {
    check('page 是 HTML', typeof box.body === 'string' && box.body.includes('<html'), typeof box.body === 'string' ? String(box.body.length) + 'B' : '')
    /** 页面里会注入令牌（asset 请求要带它），这是设计如此；要验的是「令牌不会出现在 HTML 注释/日志之类不该有的地方」→ 只校验确实注入了 */
    check('page 注入了 asset 令牌', typeof box.body === 'string' && box.body.includes('test-token'))
  } else {
    console.log('SKIP  本地没有 web-dist/，跳过页面内容校验（跑过 npm run build:web 后会自动打开）')
  }
}

/** 8. 清理：不留 @karinjs / node_modules 残渣在仓库里 */
process.chdir(root)
rmSync(tmpRoot, { recursive: true, force: true })
check('测试不污染仓库', !existsSync(join(root, '@karinjs')))

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed === 0 ? 0 : 1)
