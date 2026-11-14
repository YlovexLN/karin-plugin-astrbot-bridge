# ADR（bridge）

编号是引用锚点，不要重排。被取代的条目只留一行结论 + 指向新编号。

## ADR-1 不用 OneBot、不用 WebSocket
用户 m00236 要求不借助 OneBot。Karin 自己就是 QQ 客户端，外部 Agent 有 HTTP 就够了：在 Karin 的 Express 路由上挂 `/api/v1/astrbot/*`。

## ADR-2 不依赖 karin-plugin-selfmsg
用户 m00105。它会把 bot 自己发出的消息再分发一遍（日志 `已接管 bot xxx（来源: BOT_CONNECT），message_sent 将被当作普通消息分发`），既是噪声源又不可控。

## ADR-3 令牌直接用 Karin 的 HTTP_AUTH_KEY
用户 m01639：插件侧不设配置项，复用 WebUI 登录令牌 = 零配置。否决自建 `ASTRBOT_BRIDGE_TOKEN`（多一处会不同步的配置）。

## ADR-4 配置页只放只读说明 —— 已被 ADR-12 取代
留作参考的坑：`web.config.js` 必须 `export default` 一个带 `info.version` 的对象，Karin 1.18 的 `getWebConfig$1` 无条件读它，缺了就 `TypeError: Cannot read properties of undefined`（配置页 500 的真因，与 token 无关）。

## ADR-5 指令表走 Karin 官方路由
`karinModule.cache` 是空表，自己 `import()` `node_modules/node-karin/dist/*.mjs` 再翻 cache 也是空（ESM 给的是另一份模块实例）。改用 `/api/v1/plugin/loaded/command`。代价：**不含正则**，`search` 只能匹配名字。

## ADR-6 call 调命令对象本身
kkk 导出的 `bilibiliAPP` 是 `karin.command(reg, handler, {name})` 的返回值（函数），不是类；`new Owner()[method]` 必然失败。改为取具名导出直接 `fn(e, next)`。

## ADR-7 引用解析路线否决
kkk 的 `handlePrefix` 第一步就 `e.msg = await Common.getReplyMessage(e)`，要求事件带真实引用消息，由 AstrBot 伪造太脆。改调 `bilibiliAPP`——它只读 `e.msg` 里的链接。

## ADR-8 自更新用 unpack —— 已被 ADR-18 取代

## ADR-9 投递对象 = 消息所在的会话
用户 m01050：「群聊的请求 回复不应该是私发给提出来的哪个人 而是发到群里 私聊就是发给私聊」。否决「发给提问者」。

## ADR-10 不替用户改第三方插件的配置
用户 m05825：「不需要你解析视频啊 就按我kkk插件配置好的来」。排查 kkk 崩溃时把 `bilibili.videoQuality` 从 127 临时改 64 验证过（64 能过，80/127 崩在 `main.js:32731` 的 `playUrlData.data.data.dash.video`，B站 playurl 对这套账号只回 `durl`），但**结论不是去改它**：配置保持 127，不绕过、不写 `node_modules`。

## ADR-12 面板改成 React 应用（2026-11-10）
用户 m06662「算了直接用这个skills」，手写单文件 `webui.html` 视觉过不去。做法：只搬前端（React 19 + HeroUI 3 + Tailwind 4 + Vite 8），**不搬 skill 的 Express 挂载**（它依赖 Karin 导出 `app`/`router`/`authMiddleware`，部分版本没有），静态资源改由 `assets` action 分发。否决：继续手改 HTML / 照搬 Express 挂载 / history 路由（与 `/assets/*` 冲突）。代价：多出 `web/` 与构建步骤。

## ADR-13 颜色工具类必须先在 `@theme` 里映射（2026-11-10）
HeroUI 3 只往 `:root` 写 `--accent`/`--surface`/`--border`，没注册成 Tailwind color token，`bg-primary`/`bg-content1` 等在构建产物里根本不存在——不报错、只有截图能看出来。修法：`web/src/index.css` 的 `@theme` 映射 `--color-primary: var(--accent)` 等，组件一字不改。教训：改完样式先 grep 构建后的 `style-*.css` 确认类名存在。

## ADR-14 → 15 布局最终 = kkk 的顶部标签页（无侧边栏）
ADR-14（260px 侧边栏）已废。ADR-15 是 m07282「为什么还是这种侧边栏 … 抄就完事了」的结论：新建 `web/src/layouts/PanelLayout.tsx`（顶部 `Tabs` + 右侧深浅色/登出），删掉 `DesktopLayout`/`MobileLayout`/`device.ts`/`webui.html`。用户要的是「和 kkk 面板一样」的观感，不是某种导航形态。坑：`Tabs.List` 光写 `w-fit min-w-max` 不够，HeroUI 的 `min-width:100%` 还在，必须补 `*:w-fit *:min-w-fit *:flex-none *:shrink-0 *:whitespace-nowrap`。

## ADR-16 去掉日志页；指令页显示触发正则与权限（2026-11-10）
用户 m07495：「日志页面可以不要 指令的中文显示不够具体」。删 `pages/Logs.tsx`，但 **`logs` action 保留**——给 AstrBot 的 `karin_logs` 排障用。正则挂在命令对象的 `owner.reg` 上，于是 `commands` 加 `detail: true` 把它读出来，按 `plugin|file|method` 缓存进 `describeCache`（实测 26 条 38 ms，冷启动约 4 s）。面板分「内容触发 / 命令」两档。

## ADR-17 清掉死代码，把 serve.mjs 并进 manifest.mjs（2026-11-11）
用户 m07793「清理无用代码以及缓存和文件」，原则是**只删没人调用的，对外 API 一个不动**。删 `callAppPlugin`/`resolveCommand`/`isCallable` 与面板里 tree-shaken 的 `FieldGrid`/`SwitchField` 等。这类清理的正确验收是看 **CSS** 哈希（JS 哈希不变）。**没删的**：`web/`、`pack.mjs`、`.agents/`、`probe`/`resolve`/`readfile`/`writefile`/`fetchtext`/`amagitest`（文档化接口，删了排障命令就失效）。

## ADR-18 彻底移除自更新（2026-11-13）
用户 m08365「不需要自更新」。删 `selfUpdate`/`unpackUpdate`/`readZip`、`case `update``/unpack 与 `scripts/manifest.mjs`；action 从 19 降到 **17**（含 `page`/`assets`），面板五页。更新回归：`npm run pack` → WebUI 上传 zip → 重启 Karin。
**代价（记着）**：每次改代码都要人手动上传 + 重启；换来不再挂端口、不再维护 sha256 清单、少一个能被远端写入的入口。
