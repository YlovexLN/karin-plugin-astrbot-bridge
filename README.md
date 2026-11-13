# karin-plugin-astrbot-bridge

给外部 Agent（AstrBot 等）用的 HTTP 桥：**不用 OneBot、不自建 WebSocket、不动别人的消息分发**，
只把 Karin 里「装了哪些插件、有哪些指令、能不能执行、结果是什么」摊成 JSON 接口。

- 版本 0.0.1 · 端口跟 Karin 的 HTTP 口（默认 7777）· 前缀 `/api/v1/astrbot/`
- 安装：`npm i karin-plugin-astrbot-bridge`（npmjs 官包，无需认证），或打 zip 上传 → 重启 Karin
  详见 [INSTALL.md](./INSTALL.md)
- 令牌**不用单独配置**，直接认 Karin 的 `HTTP_AUTH_KEY`（WebUI 登录令牌）
- 十七个 action。业务接口一律 `POST /api/v1/astrbot/<action>` + `Authorization: Bearer <HTTP_AUTH_KEY>`
  （body 里写 `{"action":"..."}` 也行，URL 段优先）；只有 `page`/`assets` 是 `GET` + `?token=`——iframe 发不出请求头

## 接口

| action | 作用 | 主要参数 |
| --- | --- | --- |
| `ping` | 探活；未配令牌时也回 200，用来确认路由挂没挂 | — |
| `page` | 返回面板 HTML（插件配置页 iframe 加载它） | — |
| `assets` | 分发面板静态资源（`web-dist/` 下的 js/css） | 路径即文件名 |
| `plugins` | 已装插件：名称/类型/目录/版本/是否启用/指令数 | `force` |
| `commands` | 指令索引（转写 Karin 的 `/api/v1/plugin/loaded/command`）；`detail` 补触发正则与权限 | `plugin` `keyword` `offset` `limit` `detail` `force` |
| `search` | 按关键词找指令 | `keyword` `limit` |
| `status` | 运行时概览：Bot、指令数、任务数 | — |
| `call` | 执行任意一条已加载指令 | `plugin` `method` `text` `scene` `target` `deliver` |
| `share` | 把链接交给解析类插件（B站/抖音 → kkk）并直发卡片 | `url` `useCase` `scene` `target` |
| `send` | 以 Bot 身份发一段文本进会话，让插件自己解析出卡片 | `text` `scene` `target` |
| `logs` | 读 Karin 报错 | `lines` `since` `onlyError` |
| `probe` | 运行时体检：构建标记、缓存、node-karin 导出 | — |
| `resolve` | 导出体检：某插件模块导出了什么、能不能调 | `plugin` `method` `file` |
| `readfile` | 只读看容器内文件（第三方插件报错时没源码等于盲猜） | `path` `from` `lines` / `pattern` |
| `writefile` | 就地改写容器内文件，自动备份 `.bak-<时间戳>` | `path` `content` |
| `fetchtext` | 从容器里发一次 GET，区分网络问题还是代码问题 | `url` `headers` `timeout` |
| `amagitest` | 用 kkk 自带 amagi 客户端取一次视频流，看有没有 `dash` | `avid` `cid` `cookie` `ua` |

`scene` / `target` 缺省时按**消息所在的会话**投递（群聊发群、私聊发私聊），不是发给提问的人。

## WebUI

插件卡片上的配置页是同源 iframe，地址 `GET /api/v1/astrbot/page`，内容是一个 React 单页应用。

- 五页：概览 / 插件 / 指令 / 试跑 / 关于。**没有日志页**——日志是给 Agent 排障用的（`logs` action），
  面板上放个只能翻几十行的文本框只占地方。
- 布局照 kkk 面板：无侧边栏，顶部一排药丸标签 + 内容区，窄屏标签横向滚动。
- 前端源码在 `web/`（React 19 + HeroUI 3 + Tailwind 4 + Vite 8），产物在 `web-dist/`（单 js 单 css，不拆包）。
  **装插件的人只需要 `web-dist/`，不需要 npm、不需要构建。**
- 路由走 hash（`#/plugins`）：`/api/v1/astrbot/assets/*` 已被静态资源占着，history 路由会打架。
- 令牌：iframe 发不出 `Authorization` 头，所以 `web.config.js` 在服务端把令牌拼进 `page.url` 的 `?token=`，
  页面从 `location.search` 取回存 localStorage；页面自己发的请求一律 **POST + Bearer 头**。
- 「指令」页带 `detail: true`：Karin 的指令表路由不给正则，要按 method 把模块 import 回来读命令对象的
  `reg`/`permission`（ESM 缓存命中后 26 条 30~40 ms），页面据此标出「内容触发 / 命令」两档。
- 「试跑」默认只把插件回复收进 `reply`，勾「真的发出去」才投到 QQ。

改面板：

```bash
npm install          # 只装前端依赖，不影响插件运行
npm run dev:web      # vite dev，5176 端口，/api/v1 代理到 localhost:7777
npm run typecheck:web
npm run build:web    # 产出 web-dist/
```

开发机没有可用 node 时可以借 Karin 主机上的 node 构建，见 `AGENTS.md` 的部署一节。

## call 怎么执行一条指令

Karin 的指令对象是插件加载时 `karin.command(正则, 处理函数, { name })` 创建的。
`call` 按「插件目录 + 文件」把**同一个模块** import 回来，取 `method` 对应的**具名导出**（就是那个命令对象），
再用最小事件对象调它——插件看到的是自己熟悉的 `e.msg`/`e.reply`，不会收到伪造的 OneBot 事件。

## 改完代码怎么更新

本插件**没有自更新功能**（不提供 `update` / `unpack`），也不用起任何额外端口。
更新就一条路：重装插件包 + 重启 Karin。

```bash
npm run pack     # 产出 dist/karin-plugin-astrbot-bridge-v0.0.1.zip 与解压副本
```

然后把 zip 上传到 Karin（WebUI → 插件管理 → 上传/安装），再重启 Karin——
插件代码不会热更，HMR 只盯 `karin-plugin-example`。

只想改文件而不重装：直接在 Karin 主机上替换插件目录里的 `.js`，同样要重启。
## 文件类 action 的边界

`readfile`/`writefile` 只认这几个根：插件目录、`/app/plugins`、`/app/node_modules`、`/app/config`、
`/app/data`、Karin 安装根（`path.resolve(process.cwd())`）。
读任意文本（>8MB 拒）；写只放 `.json/.js/.mjs/.cjs/.txt/.md`，**不新建文件**、**不碰 `/app/node_modules`**，
改前拷 `.bak-<ISO 时间戳>`，`.json` 先 `JSON.parse` 校验再落盘。
定位代码用 `pattern`（正则，只回命中行号）比整文件搬运快得多。

## 已知坑

**kkk 解析 B站 报 `Cannot read properties of undefined (reading 'video')`**
kkk 在 `bilibili.videoQuality > 64` 且有登录态时走 `dash` 分支（`main.js:32731`），而 B站 playurl 对部分账号/网络
只回 `durl` 形状，那行没有可选链 → 崩。这是 kkk 的 bug，bridge **不替用户改它的配置、不写 `node_modules`**，
只如实回 `ok:false` + 原始 stack。

**业务函数报错不再退回指令兜底**（2026-11-10）
`share` 原先「业务函数失败 → 退回引用解析指令」，等于把同一条链接再喂一遍，而 kkk 出错时会自己
`e.reply` 一张「歇菜」错误卡到会话里——用户莫名收到红图就是这么来的。现在只有「业务函数压根找不到」才走兜底，
**找到了但跑崩直接 `ok:false`、不发任何卡片**。返回里 `attempts` 的 `phase`（`resolve`/`run`）可区分两者。

## 打包

`npm run pack` 产出 `dist/karin-plugin-astrbot-bridge-v0.0.1.zip` 与同内容解压副本 `dist/karin-plugin-astrbot-bridge/`。
只用 Node 标准库：不装依赖、不需要 Python。
