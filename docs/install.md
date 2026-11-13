# 安装说明

Karin 的插件加载器直接跑 `.js` 源码，**不需要编译**：`package.json` 没有 build 与 dependencies。
zip 里带面板产物 `web-dist/`（构建产物），不带 `web/` 源码——装插件的人不需要 npm。

## 首次安装（三步）

### 1. 打出安装包

```bash
npm install              # 只为了构建面板，第一次才需要（约 11 个前端依赖）
npm run build:web        # web/ → web-dist/，产物约 1 MB
npm run pack             # 产出 dist/karin-plugin-astrbot-bridge-v0.0.2-beta.1.zip
```

> `web-dist/` 与 `dist/` 都在 `.gitignore` 里，**克隆下来没有**，所以这一步不能省。
> 不改面板的话，第二次以后只有 `npm run pack` 必需。

### 2. 在 Karin WebUI 里上传

插件管理 → 安装插件 → 选 `dist/karin-plugin-astrbot-bridge-v0.0.2-beta.1.zip` → 确认。

安装成功后插件列表里会出现 **astrbot-bridge**，卡片上多了三个标签页：概览 / 插件 / 指令（就是 `web.config.js` 注册的那个 iframe 面板）。

### 3. 重启 Karin

插件代码**不热更**（HMR 只盯 `karin-plugin-example`），WebUI 里点重启，或：

```bash
curl -X POST http://<karin 主机>:7777/api/v1/restart \
  -H 'Authorization: Bearer <HTTP_AUTH_KEY>' -d '{}'
```

### 4. 自检

```bash
curl -X POST http://<karin 主机>:7777/api/v1/astrbot/ping \
  -H "Authorization: Bearer <HTTP_AUTH_KEY>" -H "Content-Type: application/json" -d '{}'
```

返回 `{"success":true,"pong":true,...}` 就成了。没有令牌会 401，这是故意的。

**令牌不用单独配置**：直接用 Karin `.env` 里那串 `HTTP_AUTH_KEY`（= WebUI 登录令牌）。
所以本插件在 WebUI 里**没有任何配置项**，只有一个只读的用法说明。

## 其他安装方式

**手动拷目录**：把 `dist/karin-plugin-astrbot-bridge/` 整个拷到 `karin/plugins/karin-plugin-astrbot-bridge/`，再重启。

**npm（推荐，不用上传文件）**：

```bash
cd <Karin 安装根>          # 就是有 package.json、node_modules、plugins/ 的那一层
npm i karin-plugin-astrbot-bridge
```

然后重启 Karin。包内已带 `web-dist/`，不用构建、不用 npm run anything。

> 现在 npm 上最新的是 beta（`0.0.2-beta.1`），`latest` 也指向它。想固定在某个版本就写全：
> `npm i karin-plugin-astrbot-bridge@0.0.2-beta.1`。

> **必须装在 Karin 安装根**，不能装进 `plugins/`：npm 类型插件的目录是
> `path.join(process.cwd(), 'node_modules', <包名>)`，Karin 只扫根目录 `package.json` 的
> `dependencies`/`devDependencies` 里列出的包。
>
> 本包声明了 `karin.apps`，所以会被当成 npm 插件加载（少了这个字段 Karin 只认它是个普通依赖）。
>
> 想从 GitHub Packages 装（包名带 scope）：`@ylovexln/karin-plugin-astrbot-bridge`，
> 需要 `.npmrc` 里配 `//npm.pkg.github.com/:_authToken=<有 read:packages 的 PAT>`。

## 改完代码怎么更新

**没有自更新通道**，也不用开任何端口。

1. `npm run pack` 产出新 zip
2. Karin WebUI → 插件管理 → 上传/安装这个 zip
3. 重启 Karin

手动装：把 `dist/karin-plugin-astrbot-bridge/` 整个覆盖到插件目录，再重启。

## 配套的 AstrBot 侧

另一个仓库 `astrbot-plugin-karin-ctl` 在 AstrBot 里调这些接口，它的 `karin_token` 填同一个 `HTTP_AUTH_KEY`。
