# AGENTS.md

Karin 插件，给外部 Agent（AstrBot 等）提供 HTTP 桥：`POST /api/v1/astrbot/<action>`。定位、接口表、安装见 [README](./README.md) 与 [INSTALL](./INSTALL.md)；本文只写维护本仓库要知道的规矩。

## 目录
| 位置 | 内容 |
| --- | --- |
| `index.js` | 入口，`KARIN_PLUGIN_INIT` 里 `router.use("/astrbot", handler)`（`mounted` 标记保证幂等） |
| `apps.js` | 只做 `export { KARIN_PLUGIN_INIT } from "./index.js"`——npm 类插件要靠 `karin.apps` 才会被加载 |
| `dir.js` | 路径常量 `PluginDir` / `PluginName` / `WebDistDir` |
| `route.js` | 各 action 的实现，单文件无内部依赖。handler 先处理 `page`/`assets`，其余 15 个 `case` 走 `dispatch`，合计十七个 |
| `web.config.js` | 插件卡片：`info` / `page`（iframe 指向 `/api/v1/astrbot/page`）/ `components` / `save()` |
| `web/` → `web-dist/` | React 面板源码与构建产物 |
| `scripts/pack.mjs`、`scripts/test.mjs` | 打 zip + 解压副本到 `dist/`；冒烟测试 27 项（桩件 `node_modules/node-karin`） |
| `docs/`、`.agents/` | 使用者文档（install / config / publish）；维护者文档，入口 [`.agents/README.md`](./.agents/README.md) |

## 硬约束
1. **零依赖**：运行时只有 `node-karin` 与 Node 内置模块；容器里没有 `npm install` 的机会。
2. **不改 `node_modules`**：镜像更新会覆盖它。要框架能力就 import 或读 `dist/*.mjs` 常量。
3. **令牌只认 Karin 的 `HTTP_AUTH_KEY`**，不引入自己的配置项；取不到要报错，不能静默放行。
4. **`call` 按具名导出取命令对象**，不按 `prototype[method]` 找类；导出为 `false` 时回「这条指令是关闭状态」。
5. **默认不往 QQ 发消息**：`call` 截流 `e.reply` 进结果，只有 `deliver: true` 才真投递。`share`/`send` 是例外（用户明确要卡片进会话）。
6. **指令表带 15 s TTL 且要能自愈**：不要自己 import `node_modules/node-karin/dist/*.mjs` 造缓存（会拿到另一份空模块实例）。
7. **降级吞异常**：日志、`web.config`、README 扫描一律 try/catch，拿不到就少字段——一次 500 会让 AstrBot 整条链路报错。
8. **只写自己的目录**（`__ASTRBOT_BRIDGE_DIR || pluginRoot()`），一次性产物用完即删。
9. **发布由用户决定**：不自行 `git init/commit/push`、不擅自部署；版本号改动要用户点头，当前 **0.0.2**。
10. **打包只用 `npm run pack`**（Node 标准库）；`dist/` 必须同时有 zip 与同名解压副本。双源发布由 `v*` tag 触发 `releases.yml`：npmjs 用无 scope 名 + Trusted Publishing（要 `id-token: write`），GitHub Packages 用 `@ylovexln/` + `GITHUB_TOKEN`（**绝不能给 id-token**），两个 job 必须分开。`files` 白名单必须含 `web-dist`，`karin.apps` 必须声明。
11. **面板不引运行时依赖**：`web-dist/` 是纯静态产物。
12. **路径前缀三处一致**：`web/vite.config.mjs` 的 `base`、`sendAsset` 截 `/assets/` 之后的部分、`web.config.js` 的 `page.url`。
13. **`page` 不许硬编码令牌**：响应时把令牌拼进 `?token=`；读不到 `web-dist/` 就回一页提示，不抛 500。

细节：1–7 见 [`.agents/rules/invariants.md`](./.agents/rules/invariants.md)，8–13 见 [`.agents/rules/workspace.md`](./.agents/rules/workspace.md)。

## 影响面
- **AstrBot 侧** `astrbot-plugin-karin-ctl/main.py` 按 action 名调这些接口：**改名或改返回结构就是破坏性变更**。
- 面板与 `route.js` 的契约是 `/api/v1/astrbot/<action>` 的 JSON 形状，改字段要同步 `web/src`。
- 已知环境：Karin **1.18**、node-karin 导出符号随版本变（别假设有 `app`/`router`）、插件跑在容器里。

## 构建与部署
面板构建必须在 **Linux**（HeroUI 原生依赖在 Windows 装不上）：把 `web/` 同步到装好前端依赖的目录 → `tsc -p web/tsconfig.json` → `vite build` → 产物 `web-dist/` 拷回插件目录 → 重启 Karin。验证见 [`.agents/workflows/verify.md`](./.agents/workflows/verify.md)，排障见 [`.agents/skills/troubleshooting.md`](./.agents/skills/troubleshooting.md)。

## 提交前自检
- `node --check index.js && node --check apps.js && node --check route.js && node --check web.config.js`
- `npm run pack`：zip 与解压副本都在，字节数合理
- 改了 action：README 接口表、`dispatch` 默认错误里的 action 列表、AstrBot 侧工具数三处同步
- 没有新增 `dependencies`，没有硬编码令牌，没有残留 `_*` / `*.tmp` / `*.bak`

## 别踩的坑
- **GET 只认 `?token=`**：`dispatch(action, req.body || {})` 不看 query，`?limit=` / `?detail=` 全被忽略，要 POST JSON。
- **Karin 1.18 没有 HTTP 写插件的通道**：`/api/v1/plugin/install` 只吃 JSON，multipart 一律 500，`/plugin/upload` 系全 404。更新只能 WebUI 上传 zip 或手动覆盖目录，改完重启。
- **两套令牌**：Karin 自己的 `/api/v1/*` 用 accessToken（`POST /api/v1/login {authorization: sha256(HTTP_AUTH_KEY)}` 换），本插件路由用 `Bearer <HTTP_AUTH_KEY>`。
- **`config.port` 是函数**（`() => Number(process.env.HTTP_PORT) || 7777`），直接拼进 URL 会 `Failed to parse URL`。
- **插件 router 带 baseUrl**，`req.params.action` 是空的，靠 `actionFromUrl(req)` 兜底。
- **面板样式静默失效**：HeroUI 只写 CSS 变量不注册 Tailwind token，先用 `@theme` 映射，并在构建产物里确认类名存在。
- **`web-dist/` 缺失不是错误**：`page` 回提示页、冒烟测试自动 SKIP 页面断言。
