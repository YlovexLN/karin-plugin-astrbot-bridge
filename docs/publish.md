# 发布（维护者）

推 `v*` tag 即同时发布两处。工作流：[`releases.yml`](../.github/workflows/releases.yml)。

```bash
# 1. 改 package.json 的 version 并提交；2. 打 tag
git tag v0.0.2 && git push origin v0.0.2
```

| 源 | 包名 | 认证 |
| --- | --- | --- |
| [npmjs.com](https://www.npmjs.com/package/karin-plugin-astrbot-bridge) | `karin-plugin-astrbot-bridge`（无 scope） | Trusted Publishing（OIDC，无需令牌） |
| GitHub Packages | `@ylovexln/karin-plugin-astrbot-bridge` | 仓库自带的 `GITHUB_TOKEN` |

仓库里的 `package.json` 保持无 scope；GitHub Packages 那个 job 发布前用 `npm pkg set name="@ylovexln/karin-plugin-astrbot-bridge"` 临时改。

## 为什么拆成两个 job

| job | 权限 | 原因 |
| --- | --- | --- |
| `npmjs` | `contents: read` + **`id-token: write`** | OIDC 换发布凭据，provenance 自动生成 |
| `github-packages` | `contents: read` + `packages: write`，**没有 id-token** | npm 11 只要检测到 OIDC 就对任何 registry 先试 token exchange；GitHub Packages 没有 `POST /-/npm/v1/oidc/token/exchange`（404），npm 报 `ENEEDAUTH` 且**不回退 `NODE_AUTH_TOKEN`**——带上 `id-token: write` 必挂 |

## 包内容

由 `package.json` 的 `files` 决定（与 `scripts/pack.mjs` 的 zip 白名单同一份）：`index.js` `apps.js` `dir.js` `route.js` `web.config.js` `web-dist/` `LICENSE` `README.md` `INSTALL.md`。

**`web-dist/` 必须进包**：面板产物不随 `npm install` 构建，缺了插件卡片就是个 574 字节的提示页。它在 git 里被忽略，CI 检出时不存在，所以两个 job 都先 `npm ci --no-audit --no-fund && npm run build:web`（失败即中止）。

## CI 步骤（两个 job 各走一遍）

1. 校验 tag 与 `package.json` 的 version 一致
2. `npm ci` + `npm run build:web`
3. `node scripts/test.mjs`（仅 npmjs job，27 项冒烟）
4. 查版本是否已存在 → 存在就跳过（**重跑同一 tag 不会红**）：npmjs 用 `GET https://registry.npmjs.org/karin-plugin-astrbot-bridge/<版本>`，404 = 未发布；GitHub Packages 对不存在的包返回 **401**（不是 404），同样按未发布处理
5. `npm pkg delete devDependencies scripts` 剥离开发字段
6. 推导 dist-tag 并 `npm publish`

## dist-tag

**latest 永远指向最后发布的版本，beta 也算。** `0.0.2` → `latest`；`0.0.2-beta.1` → `latest` + `beta`；`0.0.2-rc.1` → `latest` + `next`。即 `npm publish --tag latest` 后，若版本带预发布后缀再 `npm dist-tag add <包>@<版本> beta|next`。这是刻意取舍——包只给自己用，`npm i` 拿到的就是最后发出来的东西；预发布版本**必须**显式给 `--tag`，否则 npm 拒绝。

## 首次发布（各做一次）

**npmjs**：工作流不带 `NODE_AUTH_TOKEN`，只靠 OIDC。必须在 npm 的 Settings → Trusted Publisher → GitHub Actions 登记：Organization/user `YlovexLN`、Repository `karin-plugin-astrbot-bridge`、Workflow filename `releases.yml`、Environment 留空。包不存在时可用「GitHub Actions trusted publisher」入口在发布前先建包。**没登记就会在发布那步 404 / ENEEDAUTH。**

**GitHub Packages**：用仓库自带 `GITHUB_TOKEN`，不需要 Trusted Publisher 或 `NPM_TOKEN`（工作流已声明 `permissions: packages: write`）。首次成功后到 Packages 页面确认可见性（默认继承仓库）。

## 版本号三处一起改

`package.json` 的 `version`、`web.config.js` 的 `info.version`、`route.js` 里 `ping()` 返回的 `version`。

## 打本地 zip

`npm run pack` → `dist/karin-plugin-astrbot-bridge-v<版本>.zip` 与同名展开目录，给 Karin WebUI 上传安装用。

## 安装

一般用户 `npm i karin-plugin-astrbot-bridge`（无 scope、无认证）。要走 GitHub Packages 才需 scope 与认证：

```
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<有 read:packages 权限的 PAT>
```
