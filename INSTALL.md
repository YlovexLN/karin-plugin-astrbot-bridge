# 安装说明

包在本目录 `dist/` 下（zip 与解压副本各一份），**不需要编译**——Karin 的插件加载器直接跑 `.js` 源码，
`package.json` 里没有 build 与 dependencies。

## 首次安装

**方式一：GitHub Packages**

包名带 scope，先让 npm 认识这个源（`_authToken` 用有 `read:packages` 权限的 PAT；仓库 public 时可省）：

```
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<你的 PAT>
```

```bash
npm i @ylovexln/karin-plugin-astrbot-bridge
```
装到 Karin 的插件目录（或全局 node_modules）后重启 Karin。包内已带面板产物 `web-dist/`，不用构建。

**方式二：zip**

1. Karin WebUI → 插件管理 → 安装插件 → 上传 `dist/karin-plugin-astrbot-bridge-v0.0.1.zip`
2. 重启 Karin
3. 自检：
   ```bash
   curl -X POST http://<karin>:7777/api/v1/astrbot/ping \
     -H "Authorization: Bearer <Karin 的 HTTP_AUTH_KEY>" -H "Content-Type: application/json" -d '{}'
   ```
   返回 `{"success":true,"pong":true,...}` 就成了。

**令牌不用单独配置**：直接用 Karin 的 `.env` 里那串 `HTTP_AUTH_KEY`（= WebUI 登录令牌），
所以本插件在 WebUI 里**没有任何配置项**，只有一个只读的用法说明。

手动装：把 `dist/karin-plugin-astrbot-bridge/` 整个拷到 `karin/plugins/karin-plugin-astrbot-bridge/` 再重启。

## 改完代码怎么更新

**没有自更新通道**，也不用开任何端口。

1. `npm run pack` 产出 `dist/karin-plugin-astrbot-bridge-v0.0.1.zip`
2. Karin WebUI → 插件管理 → 上传/安装这个 zip
3. 重启 Karin（插件代码不热更）

手动装：把 `dist/karin-plugin-astrbot-bridge/` 整个覆盖到 `karin/plugins/karin-plugin-astrbot-bridge/`，再重启。

## 配套的 AstrBot 侧
另一个仓库 `astrbot-plugin-karin-ctl`（`dist/astrbot-plugin-karin-ctl-v0.0.1.zip`）在 AstrBot 里调这些接口，
它的 `karin_token` 填同一个 `HTTP_AUTH_KEY`。

## 重新打包
```bash
npm run build:web # web/ → web-dist/，改过 web/ 就必须跑；首次需要 npm install
npm run pack      # node scripts/pack.mjs，产出 zip + 解压副本
```
打包只用 Node 标准库（不装依赖、不需要 Python），只有 `build:web` 需要前端依赖。
zip 里带 `web-dist/`（构建产物），不带 `web/` 源码——装插件的人不需要 npm。仓库里已有一份现成的 `web-dist/`，不改面板就不用重新构建。
