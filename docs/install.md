# 安装

四种方式任选其一，**装完都要重启 Karin**（插件不热更，HMR 只盯 `karin-plugin-example`）。Karin 直接跑 `.js` 源码，不需要编译；包里带面板产物 `web-dist/`、不带 `web/` 源码，**装插件的人不需要 npm**。

## 一、npmjs.com（推荐）

```bash
cd <Karin 根目录>          # 不是 plugins/ 目录
pnpm add karin-plugin-astrbot-bridge    # 或 npm i karin-plugin-astrbot-bridge
```

> **必须装在 Karin 安装根**：npm 类插件的目录是 `path.join(process.cwd(), "node_modules", <包名>)`，Karin 只扫根 `package.json` 的 `dependencies` / `devDependencies`。本包声明了 `karin.apps`，所以会被当插件加载（少了这个字段只当普通依赖）。
>
> 现最新是 `0.0.2`，上面两条命令拿到的就是它；要固定写 `@0.0.2`。

## 二、从 GitHub 仓库装

```bash
cd <Karin 根目录>
pnpm add github:YlovexLN/karin-plugin-astrbot-bridge    # 可加 #v0.0.2 锁版本
```

⚠️ 拿到的是**源码**，`web-dist/` 在 `.gitignore` 里不在仓库中 —— 面板会显示「未构建」提示页。要面板就用方式一，或自己 `npm install && npm run build:web`（见方式四）。

## 三、从 GitHub Packages 装

同一版本也发在 GitHub 的 npm 源上，包名带 scope：`@ylovexln/karin-plugin-astrbot-bridge`。**它不支持匿名下载**，先准备带 `read:packages` 的 token，在 Karin 根目录的 `.npmrc` 写两行：

```ini
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<你的 token>
```

然后 `cd <Karin 根目录> && pnpm add @ylovexln/karin-plugin-astrbot-bridge`。

## 四、放目录 / 上传 zip

把仓库（或 `dist/karin-plugin-astrbot-bridge/`）整个拷到 `<Karin 根目录>/plugins/karin-plugin-astrbot-bridge/`，必须**整个目录**（只放 `index.js` 会因缺 `route.js` / `dir.js` / `web.config.js` 加载失败）。

要 zip 就先构建再打包：

```bash
npm install              # 只为了构建面板，第一次才需要（约 11 个前端依赖）
npm run build:web        # web/ → web-dist/，产物约 1 MB
npm run pack             # 产出 dist/karin-plugin-astrbot-bridge-v0.0.2.zip
```

然后 Karin WebUI → 插件管理 → 安装插件 → 选这个 zip。`web-dist/` 与 `dist/` 都在 `.gitignore` 里，克隆下来没有，这一步不能省。

## 装完确认

```bash
curl -X POST http://<karin 主机>:7777/api/v1/restart -H "Authorization: Bearer <HTTP_AUTH_KEY>" -d "{}"
curl -s "http://<karin 主机>:7777/api/v1/astrbot/ping?token=<HTTP_AUTH_KEY>"
# {"success":true,"pong":true,...}  没有令牌会 401，这是故意的
```

**令牌不用单独配置**：直接用 Karin `.env` 里那串 `HTTP_AUTH_KEY`（= WebUI 登录令牌），所以本插件在 WebUI 里**没有任何配置项**。插件列表里出现 **astrbot-bridge**，卡片上是五个标签页：概览 / 插件 / 指令 / 试跑 / 关于。

## 卸载

```bash
cd <Karin 根目录> && pnpm remove karin-plugin-astrbot-bridge            # 一、二
cd <Karin 根目录> && pnpm remove @ylovexln/karin-plugin-astrbot-bridge   # 三
rm -rf <Karin 根目录>/plugins/karin-plugin-astrbot-bridge                # 四
```

然后重启 Karin。本插件不改框架源码、不写数据库，删完即彻底还原。

## 配套的 AstrBot 侧

AstrBot 侧的 `astrbot-plugin-karin-ctl` 调这些接口，它的 `karin_token` 填同一个 `HTTP_AUTH_KEY`。
