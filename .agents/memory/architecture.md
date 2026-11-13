# architecture.md — 结构与时序

## 请求路径

```
AstrBot (astrbot-plugin-karin-ctl/main.py)
  └─ POST http://<karin>:7777/api/v1/astrbot/<action>   Authorization: Bearer <HTTP_AUTH_KEY>
     └─ Karin 主路由 /api/v1 + /astrbot
        └─ index.js  KARIN_PLUGIN_INIT → router.use('/astrbot', handler)
           └─ route.js  dispatch → 各 action
```

## action 解析（Karin 1.18 的坑）
插件 router 挂载时带 baseUrl，`req.params.action` 拿不到。三级兜底：
`req.params.action || req.body.action || actionFromUrl(req)`，
`actionFromUrl` = `req.originalUrl` 中 `/astrbot` 之后的第一段。

`astrbotBridgeHandler` 里是 `dispatch(action, req.body || {})` —— **GET 只认 `?token=`**，其余 query 参数一律被忽略。

## 指令表来源
不要读进程内 cache（永远是空表）。改用：
```
POST http://127.0.0.1:${port}/api/v1/plugin/loaded/command   (带 Karin accessToken)
  → { code:200, data:[{ name:'karin-plugin-kkk', files:[{ fileName:'tools.js',
        command:[{ pluginName:'kkk-视频功能-B站', method:'bilibiliAPP' }] }] }] }
```
- 常量来自 `node-karin/dist/router-zPSN9-tY.mjs:117` 的 `GET_LOADED_COMMAND_PLUGIN_CACHE_LIST_ROUTER`，
  BASE_ROUTER = `/api/v1`；处理函数 `getLoadedCommandPluginCacheList` 在 `app-COhATIHu.mjs:4127`。
- 端口要从 `config.port` 摊平——它是函数 `() => Number(process.env.HTTP_PORT) || 7777`，
  直接拼进 URL 会得到 `127.0.0.1:() => Number(...)` 并报 `Failed to parse URL`。
- 该路由**不含正则**，所以 `search` 拿不到触发词。
- 正则只在 Karin 创建的命令对象上（`owner.reg`）。`commands` 传 `detail: true` 时走 `describeCommandRow`：
  `commandObjectOf(row)` → 读 `owner.reg`/`permission`/`event`，按 `plugin|file|method` 缓存进 `describeCache`（`force` 才重读）。
  实测 26 条 38 ms（ESM 缓存命中），冷启动约 4 s。`^` 开头是「命令」，其余是「内容触发」。

## invokeCommand 时序
```
row → loadPluginModule(plugin.dir, file) → 具名导出 fn
mock = { msg: text, rawMessage: text, elements: [], isPrivate, sender:{ userId, role }, reply(...) }
if (!deliver) mock.reply 只收集
await fn(mock, next)      // karin 命令对象签名 (e, next)
```
kkk 的 `handleBilibili`（`lib/core_chunk/main.js:43129`）只读 `e.msg` 里的链接/BV 号，再 puppeteer 出图并发送，
所以 `share` 必须 `deliver: true` 图才会到会话。

## 场景（scene/target）
```
显式 scene+target 优先
只有 target → 按当前消息判断是不是本群号，是 group 否则 friend
都没给     → 群聊 (group, group_id) / 私聊 (friend, sender_id)
```
用户 m01050：投递目标 = 消息所在的会话，不是提问的人。

## 面板（web/ → web-dist/）
```
GET /api/v1/astrbot/page?token=<HTTP_AUTH_KEY>
  └─ sendWebUI → 读 web-dist/index.html，injectAssetToken 给每条 /api/v1/astrbot/assets/... 补 ?token=
GET /api/v1/astrbot/assets/<web-dist 相对路径>?token=...
  └─ sendAsset → 按扩展名给 content-type，拒 '..'
```
- `page`/`assets` 在 token 校验之前：页面本身不含密钥，资源只是 js/css。
- 前端路由是 hash（`#/overview`、`#/plugins`…），因为 `/assets/*` 已被静态资源占用。
- 布局见 ADR-15：`PanelLayout` = `div.min-h-screen.bg-background` → `div.mx-auto.w-full.max-w-7xl.px-4.py-6` →
  一行 `flex items-center gap-3`（左 `Tabs`：`selectedKey` 来自 `useLocation`、`onSelectionChange` 走 `navigate`；
  右 `ThemeToggle` + 登出）→ `div.mt-6` 里 `<Outlet/>`。`Tabs.List` 必须带
  `w-fit min-w-max *:w-fit *:min-w-fit *:flex-none *:shrink-0 *:whitespace-nowrap`。
- 颜色：HeroUI 只给 CSS 变量，`web/src/index.css` 的 `@theme` 映射成 Tailwind 键
  （`primary`/`primary-foreground`/`content1`/`content2`/`surface`/`muted`/`default-100~700`/`warning`），组件只用工具类。
- 页面里的接口调用一律 `POST` + `Authorization: Bearer`（Karin 守卫对 POST 只认头，对 GET 才认 query 令牌——
  iframe 带不了头，所以只有 HTML 与静态资源走 query）。
- 构建：`npm run build:web`（`web/vite.config.mjs`：`base='/api/v1/astrbot/assets/'`、`outDir=web-dist`、
  `cssCodeSplit:false` + `inlineDynamicImports:true` → 单 js 单 css，避免 chunk 的相对 import 拿不到 `?token=`）。
