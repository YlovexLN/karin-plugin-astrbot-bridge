# 架构与时序

```
AstrBot (astrbot-plugin-karin-ctl/main.py) → POST http://<karin>:7777/api/v1/astrbot/<action>  Bearer <HTTP_AUTH_KEY>
  → Karin 主路由 /api/v1 + /astrbot → index.js 的 KARIN_PLUGIN_INIT → router.use("/astrbot", handler)
  → route.js 的 dispatch → 各 action
```

## action 解析（Karin 1.18 的坑）
插件 router 挂载时带 baseUrl，`req.params.action` 拿不到，三级兜底：`req.params.action || req.body.action || actionFromUrl(req)`，后者取 `req.originalUrl` 里 `/astrbot` 之后的第一段。handler 里是 `dispatch(action, req.body || {})` —— **GET 只认 `?token=`**，其余 query 全被忽略。

## 指令表来源
别读进程内 cache（永远是空表），改打 `POST http://127.0.0.1:${port}/api/v1/plugin/loaded/command`（带 Karin accessToken），得到 `{code:200, data:[{name, files:[{fileName, command:[{pluginName, method}]}]}]}`。
- 常量来自 `node-karin/dist/router-zPSN9-tY.mjs:117` 的 `GET_LOADED_COMMAND_PLUGIN_CACHE_LIST_ROUTER`，BASE_ROUTER = `/api/v1`。
- 端口要从 `config.port` 摊平——它是函数 `() => Number(process.env.HTTP_PORT) || 7777`，直接拼进 URL 会 `Failed to parse URL`。
- 该路由**不含正则**；正则只在命令对象的 `owner.reg` 上，`commands` 传 `detail: true` 时走 `describeCommandRow` 读出来，按 `plugin|file|method` 缓存进 `describeCache`（`force` 才重读）。实测 26 条 38 ms，冷启动约 4 s。`^` 开头是「命令」，其余是「内容触发」。

## invokeCommand 时序
```
row → loadPluginModule(plugin.dir, file) → 具名导出 fn
mock = { msg: text, rawMessage: text, elements: [], isPrivate, sender:{userId, role}, reply(...) }
if (!deliver) mock.reply 只收集
await fn(mock, next)      // karin 命令对象签名 (e, next)
```
kkk 的 `handleBilibili`（`lib/core_chunk/main.js:43129`）只读 `e.msg` 里的链接/BV 号，再 puppeteer 出图并发送——所以 `share` 必须 `deliver: true` 图才会到会话。

## 面板（web/ → web-dist/）
```
GET /api/v1/astrbot/page?token=<HTTP_AUTH_KEY>  → sendWebUI：读 web-dist/index.html，injectAssetToken 给 assets 链接补 ?token=
GET /api/v1/astrbot/assets/<相对路径>?token=...   → sendAsset：按扩展名定 content-type，拒 ".."
```
- `page`/`assets` 在 token 校验之前：页面本身不含密钥，资源只是 js/css。前端路由走 hash（`#/overview`…），因为 `/assets/*` 已被占用。
- 布局见 ADR-15：`PanelLayout` = 顶部 `Tabs`（`selectedKey` 来自 `useLocation`、`onSelectionChange` 走 `navigate`）+ 右侧 `ThemeToggle`/登出 + `div.mt-6` 里的 `<Outlet/>`。
- 颜色：HeroUI 只给 CSS 变量，`web/src/index.css` 的 `@theme` 映射成 Tailwind 键（`primary`/`content1`/`surface`/`default-100~700` 等），组件只用工具类。
- 页面里的接口调用一律 `POST` + `Authorization: Bearer`——Karin 守卫对 POST 只认头，只有 HTML 与静态资源走 query。
- 构建：`npm run build:web`（`base="/api/v1/astrbot/assets/"`、`outDir=web-dist`、`cssCodeSplit:false` + `inlineDynamicImports:true` → 单 js 单 css，避免 chunk 相对 import 拿不到 `?token=`）。
