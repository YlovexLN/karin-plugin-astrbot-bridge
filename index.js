import { logger } from 'node-karin'
import { astrbotHandler, bridgeRouter, bridgeToken } from './route.js'

/**
 * 挂载方式（谁生效算谁的，handler 是同一个）：
 * 1. 插件 router 可用时挂到 /api/v1/astrbot/*
 * 2. 框架路由：直接声明 /astrbot/:action，由 node-karin 自己注册
 * node-karin 不同版本的导出差别很大（1.18 连 router / cache 都不导出），所以两条都留兜底
 */

/** 传进来的不一定是 Express 的 res，缺 status/json 时补最小实现 */
const safeRes = (res) => {
  if (res && typeof res.status === 'function' && typeof res.json === 'function') return res
  const out = (code, payload) => {
    const body = JSON.stringify(payload)
    if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (typeof res.writeHead === 'function') res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
    else res.statusCode = code
    if (typeof res.end === 'function') res.end(body)
  }
  return {
    headersSent: false,
    statusCode: 200,
    status (code) { this.statusCode = code; return this },
    json (payload) { this.headersSent = true; out(this.statusCode, payload) },
    setHeader (...args) { return res.setHeader?.(...args) },
  }
}

/** 无论 Karin 怎么处理后缀（剥掉 /astrbot/ 前缀、或原样保留），都从 URL 里补出 action */
const dispatchByUrl = (req) => {
  const url = String(req.originalUrl || req.url || '')
  const at = url.indexOf('/astrbot')
  if (at < 0) return ''
  return url.slice(at + '/astrbot'.length).split('?')[0].replace(/^\/+/, '').split('/')[0]
}

/**
 * 官方规范（1.9.10+）：加载 main 入口 → 执行它导出的 KARIN_PLUGIN_INIT → 再加载 apps。
 * 挂载放到这里执行，时机与规范一致；早先放在模块顶层也能用，这里按规范改。
 */
export const KARIN_PLUGIN_INIT = async () => {
  if (bridgeRouter && typeof bridgeRouter.use === 'function') {
    bridgeRouter.use('/astrbot', async (req, res, next) => {
      const wrapped = {
        body: req.body || {},
        query: req.query || {},
        params: { ...(req.params || {}) },
      }
      if (!wrapped.params.action) wrapped.params.action = dispatchByUrl(req)
      const resp = safeRes(res)
      try {
        return await astrbotHandler.handler(req, resp, wrapped, next)
      } catch (error) {
        logger.error('[astrbot-bridge] 未捕获异常', error)
        if (!resp.headersSent) {
          resp.status(500).json({ success: false, message: String((error && error.message) || error) })
        }
      }
    })
    logger.info('[astrbot-bridge] 已挂载 /api/v1/astrbot/*')
  } else {
    logger.warn('[astrbot-bridge] 当前 node-karin 没有导出 router，只声明框架路由 /astrbot/:action')
  }

  /** 失败原因写进日志：WebUI 里看不到本插件的配置页，只能靠 Karin 控制台定位 */
  if (!bridgeToken()) {
    logger.warn('[astrbot-bridge] 没拿到令牌：请确认 Karin 的 .env 里有 HTTP_AUTH_KEY（WebUI 登录令牌），重启 Karin 后生效。本插件不需要单独配置')
  }
}

/** 框架路由挂载：handler 自己声明 /astrbot/:action */
export const handler = astrbotHandler
