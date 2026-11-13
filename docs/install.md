# 安装

四种方式，任选其一。**装完都要重启 Karin。**

Karin 的插件加载器直接跑 `.js` 源码，**不需要编译**：`package.json` 没有 build 与 dependencies。
包里带面板产物 `web-dist/`（构建产物），不带 `web/` 源码 —— 装插件的人不需要 npm。

## 方式一：从 npmjs.com 安装（推荐）

公开包，不需要 token。包内已带 `web-dist/`，装完不用构建。

```bash
cd <Karin 根目录>          # 不是 plugins/ 目录
pnpm add karin-plugin-astrbot-bridge
# 或
npm i karin-plugin-astrbot-bridge
```

> **必须装在 Karin 安装根**：npm 类型插件的目录是 `path.join(process.cwd(), "node_modules", <包名>)`，
> Karin 只扫根目录 `package.json` 的 `dependencies` / `devDependencies` 里列出的包。
> 本包声明了 `karin.apps`，所以会被当成插件加载（少了这个字段 Karin 只认它是个普通依赖）。

> npm 上现在最新是 `0.0.2`（正式版），上面两条命令拿到的就是它。要固定版本写全：
> `pnpm add karin-plugin-astrbot-bridge@0.0.2`。

## 方式二：从 GitHub 仓库安装

不用等 npm 发布、不需要任何 token：

```bash
cd <Karin 根目录>
pnpm add github:YlovexLN/karin-plugin-astrbot-bridge
# 或 npm i github:YlovexLN/karin-plugin-astrbot-bridge
```

⚠️ 这条路拿到的是**源码**，`web-dist/` 在 `.gitignore` 里不在仓库中 —— 面板会显示「未构建」提示页。
要面板就用方式一，或自己 `npm install && npm run build:web`（见方式四）。
锁定版本：`pnpm add github:YlovexLN/karin-plugin-astrbot-bridge#v0.0.2`。

## 方式三：从 GitHub Packages 安装

同一个版本也发在 GitHub 的 npm 源上，包名带 scope：`@ylovexln/karin-plugin-astrbot-bridge`。

**GitHub Packages 不支持匿名下载，即使包是公开的。** 先准备 token（勾 `read:packages`），
在 Karin 根目录的 `.npmrc` 写两行：

```ini
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<你的 token>
```

```bash
cd <Karin 根目录>
pnpm add @ylovexln/karin-plugin-astrbot-bridge
```

## 方式四：直接放目录 / 上传 zip

**放目录**（最省事，适合开发）：把仓库（或 `dist/karin-plugin-astrbot-bridge/`）整个拷到
`<Karin 根目录>/plugins/karin-plugin-astrbot-bridge/`。必须**整个目录**，只放 `index.js` 会因为缺
`route.js` / `dir.js` / `web.config.js` 而加载失败。

**上传 zip**：

```bash
npm install              # 只为了构建面板，第一次才需要（约 11 个前端依赖）
npm run build:web        # web/ → web-dist/，产物约 1 MB
npm run pack             # 产出 dist/karin-plugin-astrbot-bridge-v0.0.2.zip
```

Karin WebUI → 插件管理 → 安装插件 → 选这个 zip。

> `web-dist/` 与 `dist/` 都在 `.gitignore` 里，**克隆下来没有**，所以这一步不能省。

## 装完确认

重启 Karin（插件代码**不热更**，HMR 只盯 `karin-plugin-example`）：

```bash
curl -X POST http://<karin 主机>:7777/api/v1/restart \
  -H "Authorization: Bearer <HTTP_AUTH_KEY>" -d "{}"
```

然后自检：

```bash
curl -X POST http://<karin 主机>:7777/api/v1/astrbot/ping \
  -H "Authorization: Bearer <HTTP_AUTH_KEY>" -H "Content-Type: application/json" -d "{}"
```

返回 `{"success":true,"pong":true,...}` 就成了。没有令牌会 401，这是故意的。

**令牌不用单独配置**：直接用 Karin `.env` 里那串 `HTTP_AUTH_KEY`（= WebUI 登录令牌）。
所以本插件在 WebUI 里**没有任何配置项**，只有一个只读的用法说明。

插件列表里出现 **astrbot-bridge**，卡片上多了五个标签页：概览 / 插件 / 指令 / 试跑 / 关于（就是 `web.config.js` 注册的 iframe 面板）。

## 卸载

按安装方式对应处理，然后重启 Karin：

```bash
# 方式一 / 二（npmjs 或 GitHub 仓库）
cd <Karin 根目录> && pnpm remove karin-plugin-astrbot-bridge

# 方式三（GitHub Packages，包名带 scope）
cd <Karin 根目录> && pnpm remove @ylovexln/karin-plugin-astrbot-bridge

# 方式四（目录）
rm -rf <Karin 根目录>/plugins/karin-plugin-astrbot-bridge
```

本插件不改框架源码、不写数据库，删完即彻底还原。

## 配套的 AstrBot 侧

另一个仓库 `astrbot-plugin-karin-ctl` 在 AstrBot 里调这些接口，它的 `karin_token` 填同一个 `HTTP_AUTH_KEY`。
