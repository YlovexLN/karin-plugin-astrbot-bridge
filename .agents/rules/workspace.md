# workspace.md — 文件与发布纪律（约束 8–11 的细节）

配套 [`AGENTS.md`](../../AGENTS.md)。

## 8. 不越界
只**读** Karin 插件目录与日志目录；只**写**本插件自己的目录（`process.env.__ASTRBOT_BRIDGE_DIR || pluginRoot()`）；
一次性产物（解包出来的 `x/`、比对脚本）用完即删。

## 9. 发布
不自行 `git init/commit/push`、不擅自部署——用户自己决定何时替换。版本号改动要用户点头，当前统一 **0.0.1**。
打包只用 `npm run pack`（Node 标准库，不需要 Python），`dist/` 下必须同时有 zip 与同名解压副本（用户 m00757）。
**没有自更新通道**：更新插件只能 WebUI 上传 zip 或手动覆盖插件目录，然后重启 Karin（用户 m08365）。

## 10. 文件类 action 的白名单
读任意文本（>8MB 拒）；写只放 `.json/.js/.mjs/.cjs/.txt/.md`，**不新建文件**、**不碰 `/app/node_modules`**，
改前拷 `.bak-<ISO 时间戳>`，`.json` 先 `JSON.parse` 校验。

## 11. 面板
`web-dist/` 是纯静态产物，装插件的人不需要 npm。路径前缀三处一致：vite `base`、`sendAsset`、`web.config.js` 的 `page.url`。

## 环境备忘
HMR 只盯 `karin-plugin-example`，改完必须真重启 Karin；构建必须在 Linux 容器里做（HeroUI 原生依赖在 Windows 装不上）。
其余（Karin 1.18 无 HTTP 写插件通道、两套令牌）见 [`AGENTS.md`](../../AGENTS.md) 的「别踩的坑」。
