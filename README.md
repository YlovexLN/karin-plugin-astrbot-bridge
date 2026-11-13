![karin-plugin-astrbot-bridge](https://socialify.git.ci/YlovexLN/karin-plugin-astrbot-bridge/image?language=1&owner=1&name=1&stargazers=1&theme=Light)

把 Karin 里「装了哪些插件、有哪些指令、能不能执行、结果是什么」摊成 JSON 接口，给外部 Agent（AstrBot 等）直接调用。**不用 OneBot、不自建 WebSocket、不动别人的消息分发。**

[![npm version](https://img.shields.io/npm/v/karin-plugin-astrbot-bridge.svg?style=flat-square)](https://www.npmjs.com/package/karin-plugin-astrbot-bridge)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![Karin](https://img.shields.io/badge/karin-%3E%3D1.8.0-4F8EF7.svg?style=flat-square)](https://github.com/KarinJS/Karin)
[![check](https://img.shields.io/github/actions/workflow/status/YlovexLN/karin-plugin-astrbot-bridge/check.yml?branch=main&style=flat-square&label=check)](https://github.com/YlovexLN/karin-plugin-astrbot-bridge/actions/workflows/check.yml)

[GitHub](https://github.com/YlovexLN/karin-plugin-astrbot-bridge) · [问题反馈](https://github.com/YlovexLN/karin-plugin-astrbot-bridge/issues) · npm `karin-plugin-astrbot-bridge` · AGPL-3.0

## 解决什么问题

Karin 的插件、指令、执行结果都在进程内存里，外部程序只能靠 OneBot 事件旁听，既拿不到清单也触发不了指令。
本插件在 Karin 的 HTTP 服务上挂一个前缀 `/api/v1/astrbot/`，用 Karin 自己的 `HTTP_AUTH_KEY` 鉴权，
把「看」和「做」都摊成接口 —— 外部 Agent 因此能自己发现有哪些能力，再决定调用哪一个。

- 十七个 action：业务接口一律 `POST /api/v1/astrbot/<action>` + `Authorization: Bearer <HTTP_AUTH_KEY>`
  （body 里写 `{"action":"..."}` 也行，URL 段优先）；只有 `page` / `assets` 是 `GET` + `?token=` —— iframe 发不出请求头
- 端口跟 Karin 的 HTTP 口（默认 7777），**不额外开端口**
- 令牌**不用单独配置**，直接认 Karin `.env` 里的 `HTTP_AUTH_KEY`（= WebUI 登录令牌）
- WebUI 里**没有配置项**，只有一个只读用法说明和一个 iframe 面板

## 安装

```bash
cd <Karin 根目录>          # 不是 plugins/ 目录
pnpm add karin-plugin-astrbot-bridge
```

装完重启 Karin。另有 GitHub 仓库直装、GitHub Packages、上传 zip 三条路，卸载与自检 → [安装文档](./INSTALL.md)。

> 必须装在 **Karin 安装根**（有 `package.json`、`node_modules`、`plugins/` 的那层）。
> 包内已带面板产物 `web-dist/`，**装插件的人不需要 npm 构建**。

装完自检（`<HTTP_AUTH_KEY>` 就是 Karin `.env` 里那个）：

```bash
curl -s 'http://<Karin 主机>:7777/api/v1/astrbot/ping?token=<HTTP_AUTH_KEY>'
# {"success":true,"pong":true,"version":"0.0.2","build":"...","dir":"/app/plugins/..."}
```

`401` 是令牌没对上；`404` 是路由没挂上（没装成或没重启）。令牌还没配时 `ping` 不用带 token，回 `tokenConfigured:false`。

## 接口

| action | 作用 | 主要参数 |
| --- | --- | --- |
| `ping` | 探活；用来确认路由挂没挂 | — |
| `page` | 返回面板 HTML（插件配置页 iframe 加载它） | — |
| `assets` | 分发面板静态资源（`web-dist/` 下的 js/css） | 路径即文件名 |
| `plugins` | 已装插件：名称/类型/目录/版本/是否启用/指令数 | `force` |
| `commands` | 指令索引（转写 Karin 的 `/api/v1/plugin/loaded/command`）；`detail` 补触发正则与权限（要 import 插件模块，慢，只给面板用） | `plugin` `keyword` `offset` `limit` `detail` `includeTrigger` `force` |
| `search` | 按关键词找指令 | `keyword` `limit` |
| `status` | 运行时概览：Bot、指令数、任务数 | — |
| `call` | 执行任意一条已加载指令 | `plugin` `method` `text` `scene` `target` `deliver` |
| `share` | 把链接交给解析类插件（B站/抖音 → kkk）并直发卡片 | `text`（链接；`url` 同义） `useCase` `scene` `target` |
| `send` | 以 Bot 身份发一段文本进会话，让插件自己解析出卡片 | `text` `scene` `target` |
| `logs` | 读 Karin 报错 | `lines` `since` `onlyError` |
| `probe` | 运行时体检：构建标记、缓存、node-karin 导出 | — |
| `resolve` | 导出体检：某插件模块导出了什么、能不能调 | `plugin` `method` `file` |
| `readfile` | 只读看容器内文件（第三方插件报错时没源码等于盲猜） | `path` `from` `lines` / `pattern` |
| `writefile` | 就地改写容器内文件，自动备份 `.bak-<时间戳>` | `path` `content` |
| `fetchtext` | 从容器里发一次 GET，区分网络问题还是代码问题 | `url` `headers` `timeout` |
| `amagitest` | 用 kkk 自带 amagi 客户端取一次视频流，看有没有 `dash` | `avid` `cid` `cookie` `ua` |

`scene` / `target` 缺省时按**消息所在的会话**投递（群聊发群、私聊发私聊），不是发给提问的人。

`readfile` / `writefile` / `fetchtext` / `amagitest` 是**排障口子**：查第三方插件报错、确认容器里网路通不通。
自己调没问题，但别把这几个接到 LLM 的工具列表里 —— 写文件、任意发 HTTP 这类能力不该由模型自由支配。

## 返回约定

- 成功：`{"success":true,"took":<毫秒>,...}`，后面的字段由 action 决定
- 失败：`{"success":false,"message":"..."}`，配合 HTTP 状态（`401` 令牌不对、`500` 内部错误或令牌没配上）
- **业务失败不算请求失败**：`share` 找不到解析器、kkk 跑崩，都是 `success:true` + `ok:false` + `error`/`attempts`，HTTP 仍是 200
- 指令表有 15 秒缓存，`force:true` 跳过它（`plugins`/`commands` 支持）

## WebUI

插件卡片上的配置页是同源 iframe（`GET /api/v1/astrbot/page`），一个 React 单页应用。

- 五页：概览 / 插件 / 指令 / 试跑 / 关于。**没有日志页** —— 日志是给 Agent 排障用的（`logs` action），
  面板上放个只能翻几十行的文本框只占地方。
- **布局参照 kkk（karin-plugin-kkk）的面板**：无侧边栏，顶部一排药丸标签 + 内容区，窄屏标签横向滚动。
- 前端源码在 `web/`（React 19 + HeroUI 3 + Tailwind 4 + Vite 8），产物在 `web-dist/`（单 js 单 css，不拆包）。
- 路由走 hash（`#/plugins`）：`/api/v1/astrbot/assets/*` 已被静态资源占着，history 路由会打架。
- 令牌：iframe 发不出 `Authorization` 头，所以 `web.config.js` 在服务端把令牌拼进 `page.url` 的 `?token=`，
  页面从 `location.search` 取回存 localStorage；页面自己发的请求一律 **POST + Bearer 头**。
  直接用浏览器打开 `/api/v1/astrbot/page` 时页面会先要一个令牌，贴一次就存进 localStorage（键名 `astrbot-bridge-token`，想换就删这条再刷新）。
- 「指令」页带 `detail: true`：Karin 的指令表路由不给正则，要按 method 把模块 import 回来读命令对象的
  `reg` / `permission`（ESM 缓存命中后 26 条 30~40 ms），页面据此标出「内容触发 / 命令」两档。
- 「试跑」默认只把插件回复收进 `reply`，勾「真的发出去」才投到 QQ。

改面板：

```bash
npm install          # 只装前端依赖，不影响插件运行
npm run dev:web      # vite dev，5176 端口，/api/v1 代理到 localhost:7777
npm run typecheck:web
npm run build:web    # 产出 web-dist/
```

## call 怎么执行一条指令

Karin 的指令对象是插件加载时 `karin.command(正则, 处理函数, { name })` 创建的。
`call` 按「插件目录 + 文件」把**同一个模块** import 回来，取 `method` 对应的**具名导出**（就是那个命令对象），
再用最小事件对象调它 —— 插件看到的是自己熟悉的 `e.msg` / `e.reply`，不会收到伪造的 OneBot 事件。

## 文件类 action 的边界

`readfile` / `writefile` 只认这几个根：插件目录、`/app/plugins`、`/app/node_modules`、`/app/config`、
`/app/data`、Karin 安装根（`path.resolve(process.cwd())`）。
读任意文本（>8MB 拒）；写只放 `.json` `.js` `.mjs` `.cjs` `.txt` `.md`，**不新建文件**、**不碰 `/app/node_modules`**，
改前拷 `.bak-<ISO 时间戳>`，`.json` 先 `JSON.parse` 校验再落盘。
定位代码用 `pattern`（正则，只回命中行号）比整文件搬运快得多。

## 改完代码怎么更新

**没有自更新功能**（不提供 `update` / `unpack`），也不用起任何额外端口。

```bash
npm run pack     # 产出 dist/karin-plugin-astrbot-bridge-v0.0.2.zip 与解压副本
```

然后 WebUI → 插件管理 → 上传/安装，再重启 Karin —— 插件代码不热更，HMR 只盯 `karin-plugin-example`。
装了 npm 包的话，也可以 `pnpm add karin-plugin-astrbot-bridge@<新版本>` 后重启。

## 已知坑

**kkk 解析 B站 报 `Cannot read properties of undefined (reading 'video')`**
kkk 在 `bilibili.videoQuality > 64` 且有登录态时走 `dash` 分支，而 B站 playurl 对部分账号/网络只回 `durl` 形状，
那行没有可选链 → 崩。这是 kkk 的 bug，bridge **不替用户改它的配置、不写 `node_modules`**，只如实回 `ok:false` + 原始 stack。

**业务函数报错不再退回指令兜底**
`share` 原先「业务函数失败 → 退回引用解析指令」，等于把同一条链接再喂一遍，而 kkk 出错时会自己
`e.reply` 一张「歇菜」错误卡到会话里 —— 用户莫名收到红图就是这么来的。现在只有「业务函数压根找不到」才走兜底，
**找到了但跑崩直接 `ok:false`、不发任何卡片**。返回里 `attempts` 的 `phase`（`resolve` / `run`）可区分两者。

## 开发

```bash
node scripts/test.mjs   # 冒烟测试 27 项，零依赖（自带 node-karin 桩件）
npm run pack            # 打包，只用 Node 标准库：不装依赖、不需要 Python
```

架构、约束、排障、决策记录见 [`AGENTS.md`](./AGENTS.md) 与 [`.agents/`](./.agents/)；
发布流程（双源、OIDC、dist-tag）见 [发布文档](./docs/publish.md)。

## 卸载

先看怎么装的，对应操作后重启 Karin：

```bash
# npm / GitHub 源安装
cd <Karin 根目录> && pnpm remove karin-plugin-astrbot-bridge

# GitHub Packages 安装（包名带 scope）
cd <Karin 根目录> && pnpm remove @ylovexln/karin-plugin-astrbot-bridge

# 目录安装
rm -rf <Karin 根目录>/plugins/karin-plugin-astrbot-bridge
```

本插件不写数据库、不改框架源码，删完即还原。

## 作者

YlovexLN · [GitHub](https://github.com/YlovexLN) · [ylovexln@foxmail.com](mailto:ylovexln@foxmail.com)

出问题请到 [Issues](https://github.com/YlovexLN/karin-plugin-astrbot-bridge/issues) 提，附上 Karin 版本、
`/api/v1/astrbot/probe` 的返回、以及复现步骤。

## 致谢

- 代码与文档由 **DeepSeek Harness** 配合 **DeepSeek-V4.1-Flash** 模型编写；需求、部署与实测由作者完成。
- WebUI 的布局与交互参照 [karin-plugin-kkk](https://github.com/ikenxuan/karin-plugin-kkk) 的面板。
- 具体要暴露哪些能力（插件清单、指令、链接卡片、日志）来自 [AstrBot](https://github.com/AstrBotDevs/AstrBot) 侧的实际需求。

## License

[GNU Affero General Public License v3.0](./LICENSE)（`AGPL-3.0-only`）

自己部署使用无需公开任何代码；修改后分发、或修改后对外提供服务时才需要开源。
