# decisions.md — 决策记录（ADR）

编号是引用锚点，不要重排。被取代的条目保留一行结论 + 指向新编号。

## ADR-1 不用 OneBot、不用 WebSocket
用户 m00236：不借助 OneBot。Karin 自己就是 QQ 客户端，外部 Agent 只需 HTTP 就能看见/驱动它。
做法：插件在 Karin 的 Express 路由上挂 `/api/v1/astrbot/*`。

## ADR-2 不依赖 karin-plugin-selfmsg
用户 m00105。它会把 bot 自己发出的消息再当普通消息分发一遍（日志 `已接管 bot xxx（来源: BOT_CONNECT），message_sent 将被当作普通消息分发`），
既是噪声源又是我们控制不了的第三方插件。

## ADR-3 令牌直接用 Karin 的 HTTP_AUTH_KEY
用户 m01639：插件侧不设配置项。`HTTP_AUTH_KEY` 就是 WebUI 登录令牌，复用它 = 零配置。
否决：自建 `ASTRBOT_BRIDGE_TOKEN`（多一处配置、多一处不同步）。

## ADR-4 配置页只放只读说明 —— 已被 ADR-12 取代
留作参考的坑：`web.config.js` 必须 `export default` 一个带 `info.version` 的对象——Karin 1.18 的 `getWebConfig$1`
**无条件**读 `result.info.version`，缺了就 `TypeError: Cannot read properties of undefined (reading 'version')`（配置页 500 的真因，与 token 无关）。

## ADR-5 指令表走 Karin 官方路由
读 `karinModule.cache` 是空表；自己 `import()` `node_modules/node-karin/dist/*.mjs` 再翻 cache 也是空（ESM 给的是另一份模块实例）。
改用 `/api/v1/plugin/loaded/command`，稳定拿到 26 条。代价：**不含正则**，`search` 只能匹配名字。

## ADR-6 call 调命令对象本身
kkk 的 apps 文件导出的是 `karin.command(reg, handler, {name})` 的返回值（函数），不是类。
按 `new Owner()[method]` 找必然失败（报「没找到 … 里定义了方法 bilibiliAPP 的容器」）。改为取具名导出直接 `fn(e, next)`。

## ADR-7 引用解析路线否决
kkk 的 `handlePrefix` 第一步是 `e.msg = await Common.getReplyMessage(e)`，要求事件带真实引用消息，
由 AstrBot 侧伪造引用太脆。改为直接调 `bilibiliAPP`：它只读 `e.msg` 里的链接。

## ADR-8 自更新用 unpack —— 已被 ADR-18 取代
Karin 1.18 没有任何 HTTP 写插件文件的通道，当时让插件自己从开发机拉 zip 解包（`unpack`/`update`，含 `scripts/manifest.mjs --serve`）。
留作参考的坑只有一条：这条通道要额外挂端口、要维护 sha256 清单，维护成本明显高于收益——见 ADR-18。

## ADR-9 投递对象 = 消息所在的会话
用户 m01050：「群聊的请求 回复不应该是私发给提出来的哪个人 而是发到群里 私聊就是发给私聊」。
否决：发给提问者（会把群里的请求变成私聊回复）。

## ADR-10 不替用户改第三方插件的配置
用户 m05825：「不需要你解析视频啊 就按我kkk插件配置好的来」。
排查 kkk 崩溃时把 `bilibili.videoQuality` 从 127 临时改成 64 验证过（64 能过，80/127 崩在 `main.js:32731` 的
`playUrlData.data.data.dash.video`，因为 B站 playurl 对这套账号只回 `durl`），**但结论不是去改它**。
做法：配置保持用户原值 127；这是 kkk 缺可选链的上游 bug，不在插件里绕过、不写 `node_modules`。
否决：降画质到 64（越权改用户配置）、给 main.js 打补丁（违反硬约束 2）。

## ADR-12 面板改成 React 应用（2026-11-10）
用户 m06662：「算了直接用这个skills」。手写的单文件 `webui.html` 视觉上过不去（m06634「这边优化一下」）。
做法：只搬前端（React 19 + HeroUI 3 + Tailwind 4 + Vite 8），**不搬 skill 的后端 `src/web/*`**——
它依赖 Karin 导出 `app`/`router`/`authMiddleware`，而 node-karin 部分版本不导出这些。静态资源改由 `assets` action 分发。
否决：(1) 继续手改单文件 HTML（改一处样式要动整份，深浅色还得手工维护两套 token）；
(2) 照搬 skill 的 Express 挂载（部分 Karin 版本直接崩）；
(3) history 路由 `/api/v1/astrbot/assets/<page>`（与静态资源同前缀，刷新即 404）→ 改 HashRouter。
代价：多出 `web/` 源码与构建步骤，`web-dist/` 必须跟源码一起提交，否则线上还是旧面板。

## ADR-13 颜色工具类必须先在 `@theme` 里映射（2026-11-10）
现象：改完样式选中标签没有底色，computed 是 `bg: rgba(0,0,0,0)`。
原因：HeroUI 3 只往 `:root` 写 `--accent`/`--surface`/`--border`，**没注册成 Tailwind color token**，
所以 `bg-primary`/`text-primary`/`bg-content1`/`text-default-400` 在构建产物里根本不存在——构建不报错、控制台不报错，只有截图能看出来（61 处引用全中）。
做法：`web/src/index.css` 加 `@theme`，映射 `--color-primary: var(--accent)`、`--color-content1: var(--surface)`、
`--color-content2: var(--default-soft)`、`--color-default-100~700`（`color-mix(in oklab, var(--foreground) N%, transparent)`）；组件一字未改，深浅色仍由 `.dark` 切换。
否决：把 61 处换成 `bg-[var(--accent)]`（又长又散）、组件里写死色值（深浅色要维护两套）。
教训：改完样式先 grep 构建后的 `style-*.css` 确认类名存在，再截图确认 computed 值。

## ADR-14 → 15 布局三轮迭代：最终 = kkk 的顶部标签页（无侧边栏）
- ADR-14（侧边栏版，已废）：m06931 先要横向导航，m07055 又说「不够像啊 去看一下kkk的ui是怎么做的吧 做到一模一样」→ 改成 260px 侧边栏 + `header h-16`。
- ADR-15（最终）：m07282「为什么还是这种侧边栏 … 抄就完事了 之前那个ui skills肯定是不好的」。
  新建 `web/src/layouts/PanelLayout.tsx`（顶部 HeroUI `Tabs` + `Tabs.Separator`/`Tabs.Indicator`，右侧深浅色 + 登出），
  删 `DesktopLayout`/`MobileLayout`/`utils/device.ts`/`webui.html`。
- 结论：**用户要的是「和 kkk 面板一样」这个观感，不是某种导航形态**；面板本身嵌在 Karin 插件卡片里，外面已有一层导航，所以不再做侧边栏。
- 坑：`Tabs.List` 只写 `w-fit min-w-max` 不够——HeroUI 给 `tabs__list` 的 `min-width:100%` 仍在，标签被拉成等宽 164px；
  必须补 `*:w-fit *:min-w-fit *:flex-none *:shrink-0 *:whitespace-nowrap`（实测 49px/项、整条 358px）。
- 否决：保留侧边栏只调样式；用 CSS 覆盖 `tabs__list`（改不动构建产物，换组件就失效）。

## ADR-16 去掉日志页；指令页显示触发正则与权限（2026-11-10）
用户 m07495：「日志页面可以不要 指令的中文显示不够具体」。
**日志页**：删 `pages/Logs.tsx`、`nav.ts` 的 logs 项、路由、`api/bridge.ts` 的 `logs()`、`types.ts` 的 `LogsResult`。
`logs` **action 保留**——给 AstrBot 的 `karin_logs` 工具排障用，只是面板不展示。
**指令详情**：正则其实挂在 Karin 的命令对象上（`owner.reg`），于是 `commands` 加 `detail: true`：
按 `plugin|file|method` 把模块 import 回来读 `reg`（→ `pattern`/`flags`）、`permission`、`event`，存进 `describeCache`，`force` 才重读。
实测 26 条 **38 ms**（ESM 缓存命中；冷启动约 4 s，只影响第一次）。面板按「内容触发 / 命令」两档展示：`^…` 要打出来，其余消息里出现即触发。
否决：面板自己 import 插件模块（前端拿不到 Node 对象）；给 AstrBot 的 `karin_commands` 也接 detail（对话侧不需要）；
用正则自动生成中文描述（规则千奇百怪，生成句比正则更难懂）。

## ADR-17 清掉死代码，把 serve.mjs 并进 manifest.mjs（2026-11-11）
用户 m07793：「清理无用代码以及缓存和文件」。原则：**只删没人调用的，对外 API 一个不动**。
- `route.js` 删 `callAppPlugin`/`resolveCommand`/`isCallable`（全仓 grep 各只命中声明处），110696 → 107371 B。
- `serve.mjs` 并进 `manifest.mjs --serve`（原先两个服务抢同一个端口各发一半）。**这一整套已在 ADR-18 里随自更新一起删掉。**
- 面板删没人 import 的 `FieldGrid`/`ReadonlyField`/`SwitchField`/`NumberField`/`TagField`/`MiniTag`（连带相关 import）。
  它们早被 tree-shaking 掉，**JS 哈希不变（`index-DU3ZfmGT.js` 556308 B），只有 CSS 变小**——这类清理的正确验收是看 CSS 哈希。
- 其它：devDependencies 删 `gsap`；`vite.config.mjs` 删模板残留的 `/api/v1/astrbot/v1` proxy 和指向已不存在文件的注释；
  AstrBot 侧 `main.py` 删未使用的 `DEFAULT_KARIN_URL`（默认值在 `_conf_schema.json`）。
- 体积：bridge 264355 → 263494 B / 9 文件，ctl 21287 → 21250 B / 7 文件。
- **没删的**：`web/` 源码（发布包外但要构建）、`pack.mjs`、`.agents/`、
  `probe`/`resolve`/`readfile`/`writefile`/`fetchtext`/`amagitest`——文档化接口，删了 troubleshooting 里的命令就失效。

## ADR-18 彻底移除自更新（2026-11-13）
用户 m08365：「不需要自更新」。
- `route.js` 删 `selfUpdate` / `unpackUpdate` / `readZip`（原 2200–2355 行）、`case 'update'`/`case 'unpack'`、
  `zlib`/`crypto`/`createRequire` import；action 从 19 个降到 **17 个**（含 `page`/`assets`）。107371 → 99633 B。
- 删 `scripts/manifest.mjs` 与 `manifest`/`serve` 两个 npm 脚本；面板删 `pages/Update.tsx`，五页：概览/插件/指令/试跑/关于。
- 更新方式回归最朴素的一条：`npm run pack` → WebUI 上传 zip（或覆盖插件目录）→ 重启 Karin。
- **代价（记着）**：改代码后每次都要人手动上传 + 重启；换来的是不再挂端口、不再维护 sha256 清单、少一个能被远端写入的入口。
- 遗留：`web-dist/` 仍是移除 `Update.tsx` 之前的构建，面板要重新 `npm run build:web` 才不含旧页（构建需 Linux）。
