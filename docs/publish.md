# 发布（维护者）

推 `v*` 开头的 tag 即发布到 **GitHub Packages**。工作流：[`releases.yml`](../.github/workflows/releases.yml)。

```bash
# 1. 先把 package.json 的 version 改成新版本并提交
# 2. 打 tag 推送
git tag v0.0.2 && git push origin v0.0.2
```

## 只发 GitHub Packages

包名带 scope：`@ylovexln/karin-plugin-astrbot-bridge`（GitHub Packages 强制 `@owner/` 前缀）。
仓库里的 `package.json` 保持无 scope，CI 发布前用 `npm pkg set name=...` 临时改。

## 安装这个包

GitHub Packages 需要认证，用户侧要先配 `.npmrc`：

```
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<有 read:packages 权限的 PAT>
```

```bash
npm i @ylovexln/karin-plugin-astrbot-bridge
```

包是公开的（仓库 public 时匿名也能拉），但**私有仓库必须先认证**。只想装插件的人，用 zip 更省事。

## 权限只有一个组合

`contents: read` + `packages: write`，**绝对不能加 `id-token: write`**。

npm 11 只要检测到 OIDC 能力，就对任何 registry 先尝试 token exchange。GitHub Packages 没有
`POST /-/npm/v1/oidc/token/exchange`（404），npm 随后直接报 `ENEEDAUTH`，**不会回退到 `NODE_AUTH_TOKEN`**。
selfmsg 因为有 npmjs 那个 job 才必须把它拆成两个 job；本仓库只有一个源，不拆。

## 包内容

由 `package.json` 的 `files` 决定，与 `scripts/pack.mjs` 的 zip 白名单是同一份集合：

```
index.js  dir.js  route.js  web.config.js  web-dist/  LICENSE  README.md  INSTALL.md
```

**`web-dist/` 必须进包** —— 面板产物不随 `npm install` 构建，缺了插件卡片就是个 574 字节的提示页
（"找不到 web-dist"）。它在 git 里被忽略，CI 检出时不存在，所以工作流会先 `npm ci && npm run build:web`
（失败即中止）再打包。

## CI 步骤

1. 校验 tag 与 `package.json` 的 version 一致
2. `npm run build:web`（面板产物）+ `node scripts/test.mjs`（22 项冒烟）
3. 查 GitHub Packages 上该版本是否已存在（对不存在的包返回 401，按未发布处理）→ 已存在就跳过（**重跑同一 tag 不会红**）
4. `npm pkg delete devDependencies scripts` 剥离开发字段
5. 推导 dist-tag 并 `npm publish`

## dist-tag

| 版本 | dist-tag |
| --- | --- |
| `0.0.2` | `latest` |
| `0.0.2-beta.1` | `beta` |
| `0.0.2-rc.1` | `rc` |

规则：取预发布标识的第一段。预发布**必须**显式给 `--tag`，否则 npm 直接拒绝。

## 首次发布（只做一次）

GitHub Packages 用仓库自带的 `GITHUB_TOKEN`，**不需要 Trusted Publisher、不需要 NPM_TOKEN**：

1. 工作流已显式声明 `permissions: packages: write`，不用改仓库的默认权限
2. 打 tag 即可：`git tag v0.0.2 && git push origin v0.0.2`
3. 首次成功后到仓库 Packages 页面确认包的可见性（默认继承仓库）

## 版本号三处要一起改

`package.json` 的 `version`、`web.config.js` 的 `info.version`、`route.js` 里 `ping()` 返回的 `version`。

## 打本地 zip（另一条分发路径）

```bash
npm run pack
```

产出 `dist/karin-plugin-astrbot-bridge-v<版本>.zip` 与同名展开目录，给 Karin WebUI 上传安装用。
