# 发布（维护者）

推 `v*` 开头的 tag 即同时发布到两处：

| 源 | 包名 | 认证 |
| --- | --- | --- |
| [npmjs.com](https://www.npmjs.com/package/karin-plugin-astrbot-bridge) | `karin-plugin-astrbot-bridge`（无 scope） | Trusted Publishing（OIDC，无需令牌） |
| GitHub Packages | `@ylovexln/karin-plugin-astrbot-bridge` | 仓库自带的 `GITHUB_TOKEN` |

工作流：[`releases.yml`](../.github/workflows/releases.yml)

```bash
# 1. 先把 package.json 的 version 改成新版本并提交
# 2. 打 tag 推送
git tag v0.0.2 && git push origin v0.0.2
```

两个源的包名不同：仓库里的 `package.json` 保持无 scope，GitHub Packages 那个 job 在发布前用
`npm pkg set name="@ylovexln/karin-plugin-astrbot-bridge"` 临时改。

## 为什么拆成两个 job

权限必须隔离，不能合并：

| job | 权限 | 原因 |
| --- | --- | --- |
| `npmjs` | `contents: read` + **`id-token: write`** | OIDC 换取发布凭据，provenance 自动生成 |
| `github-packages` | `contents: read` + `packages: write`，**没有 id-token** | 见下 |

npm 11 只要检测到 OIDC 能力，就对**任何** registry 先尝试 token exchange。GitHub Packages 没有
`POST /-/npm/v1/oidc/token/exchange`（404），npm 随后直接报 `ENEEDAUTH`，**不会回退到 `NODE_AUTH_TOKEN`**。
所以 GitHub Packages 那个 job 一旦带上 `id-token: write` 就必挂。

## 安装

一般用户直接 `npm i karin-plugin-astrbot-bridge`（npmjs，无 scope、无认证）：

```bash
npm i karin-plugin-astrbot-bridge
```

要走 GitHub Packages 才需要 scope 和认证：

```
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<有 read:packages 权限的 PAT>
```

## 包内容

由 `package.json` 的 `files` 决定，与 `scripts/pack.mjs` 的 zip 白名单是同一份集合：

```
index.js  apps.js  dir.js  route.js  web.config.js  web-dist/  LICENSE  README.md  INSTALL.md
```

**`web-dist/` 必须进包** —— 面板产物不随 `npm install` 构建，缺了插件卡片就是个 574 字节的提示页
（"找不到 web-dist"）。它在 git 里被忽略，CI 检出时不存在，所以两个 job 都会先
`npm ci --no-audit --no-fund && npm run build:web`（失败即中止）。

## CI 步骤（两个 job 各走一遍构建）

1. 校验 tag 与 `package.json` 的 version 一致
2. `npm ci` + `npm run build:web`（面板产物）
3. `node scripts/test.mjs`（仅 npmjs job；27 项冒烟）
4. 查该版本是否已存在于目标源 → 已存在就跳过（**重跑同一 tag 不会红**）
   - npmjs：`GET https://registry.npmjs.org/karin-plugin-astrbot-bridge/<版本>`，404 = 未发布
   - GitHub Packages：对不存在的包返回 **401**（不是 404），同样按未发布处理
5. `npm pkg delete devDependencies scripts` 剥离开发字段
6. 推导 dist-tag 并 `npm publish`

## dist-tag

**latest 永远指向最后发布的那个版本，beta 也算。**

| 版本 | 主 tag | 额外别名 |
| --- | --- | --- |
| `0.0.2` | `latest` | — |
| `0.0.2-beta.1` | `latest` | `beta` |
| `0.0.2-rc.1` | `latest` | `next` |

规则：`npm publish --tag latest` 之后，若版本带预发布后缀，再
`npm dist-tag add <包>@<版本> beta|next` 补一个通道别名。

这是本项目的取舍——包只给自己用，所以不区分「装稳定的还是装最新的」，
`npm i karin-plugin-astrbot-bridge` 拿到的就是最后发出来的东西。
预发布版本**必须**显式给 `--tag`，否则 npm 直接拒绝。

## 首次发布（各做一次）

### npmjs：绑定 Trusted Publisher（不绑定就发不出去）

工作流不带 `NODE_AUTH_TOKEN`，只靠 OIDC。npm 侧必须在
**Settings → Trusted Publisher → GitHub Actions** 里登记：

| 字段 | 值 |
| --- | --- |
| Organization or user | `YlovexLN` |
| Repository | `karin-plugin-astrbot-bridge` |
| Workflow filename | `releases.yml` |
| Environment（可空） | 留空 |

包不存在时可以直接用「GitHub Actions trusted publisher」建包入口登记（npm 允许在发布前先建）。
**没登记就会在「发布」那步 404 / ENEEDAUTH。**

### GitHub Packages

用仓库自带的 `GITHUB_TOKEN`，**不需要 Trusted Publisher、不需要 NPM_TOKEN**：工作流已显式声明
`permissions: packages: write`。首次成功后到仓库 Packages 页面确认包的可见性（默认继承仓库）。

## 版本号三处要一起改

`package.json` 的 `version`、`web.config.js` 的 `info.version`、`route.js` 里 `ping()` 返回的 `version`。

## 打本地 zip（另一条分发路径）

```bash
npm run pack
```

产出 `dist/karin-plugin-astrbot-bridge-v<版本>.zip` 与同名展开目录，给 Karin WebUI 上传安装用。
