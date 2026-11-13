# workspace.md — 文件与发布纪律（约束 8–13 的细节）

配套 [`AGENTS.md`](../../AGENTS.md)。

## 8. 不越界
只**读** Karin 插件目录与日志目录；只**写**本插件自己的目录（`process.env.__ASTRBOT_BRIDGE_DIR || pluginRoot()`）；
一次性产物（解包出来的 `x/`、比对脚本）用完即删。

## 9–10. 发布与打包
不自行 `git init/commit/push`、不擅自部署——用户自己决定何时替换。版本号改动要用户点头，当前统一 **0.0.2-beta.1**。
打包只用 `npm run pack`（Node 标准库，不需要 Python），`dist/` 下必须同时有 zip 与同名解压副本（用户 m00757）。
**没有自更新通道**：更新插件只能 WebUI 上传 zip 或手动覆盖插件目录，然后重启 Karin（用户 m08365）。

npm 双源发布由 `v*` tag 触发 `releases.yml`，两个 job 必须分开：
npmjs 用无 scope 名 + Trusted Publishing（要 `id-token: write`）；GitHub Packages 用 `@ylovexln/` 前缀 + `GITHUB_TOKEN`
（**绝不能给 id-token**，npm 会走 OIDC 直接 ENEEDAUTH）。细节见 [`docs/publish.md`](../../docs/publish.md)。

## 11. 面板不引运行时依赖
`web-dist/` 是纯静态产物，装插件的人不需要 npm；`package.json` 的 `files` 白名单必须含 `web-dist`，否则装上去面板是空壳。

## 12. 路径前缀三处一致
`web/vite.config.mjs` 的 `base`、`sendAsset` 截 `/assets/` 之后的部分、`web.config.js` 的 `page.url`——改一处不改另两处就是一片 404。

## 13. 面板令牌
`page` 读 `web-dist/index.html`，在**响应时**把令牌拼进 `?token=`，不写进任何文件；读不到 `web-dist/` 就回一页提示，不抛 500。
iframe 发不出 `Authorization`，所以页面拿到令牌后自己发的请求一律 `POST` + `Bearer` 头。

## 附：文件类 action 的白名单
不属于编号约束，行为边界写在 README 的「文件类 action 的边界」：读任意文本（>8MB 拒）；
写只放 `.json/.js/.mjs/.cjs/.txt/.md`，**不新建文件**、**不碰 `/app/node_modules`**，改前拷 `.bak-<ISO 时间戳>`，
`.json` 先 `JSON.parse` 校验再落盘。

## 环境备忘
HMR 只盯 `karin-plugin-example`，改完必须真重启 Karin；构建必须在 Linux 容器里做（HeroUI 原生依赖在 Windows 装不上）。
其余（Karin 1.18 无 HTTP 写插件通道、两套令牌）见 [`AGENTS.md`](../../AGENTS.md) 的「别踩的坑」。
