# 发布（维护者）

**本仓库不发布 npm 包。**

它和姊妹仓库 [`astrbot-plugin-karin-ctl`](../../astrbot-plugin-karin-ctl/) 是一对，
只通过 zip 分发（Karin WebUI 上传安装或手动覆盖插件目录）。

## 发一个版本

```bash
npm run build:web   # 改过 web/ 才需要；产物进 web-dist/
npm run pack        # dist/karin-plugin-astrbot-bridge-v<版本>.zip + 同名解压副本
```

版本号三处要一起改：`package.json` 的 `version`、`web.config.js` 的 `info.version`、
`route.js` 里 `ping()` 返回的 `version`。

## 为什么不做 npm

| 原因 | 说明 |
| --- | --- |
| 体积 | `web-dist/` 近 1 MB 的 React 产物，npm 用户不需要源码级分发 |
| 形态 | Karin 的插件市场按 GitHub 仓库走，不是 npm |
| 配套 | 真正要做的是「和 AstrBot 侧插件配着升级」，zip 重装比 npm 版本对齐更直接 |

如果以后真要发布，参照 [`karin-plugin-selfmsg`](../../karin-plugin-selfmsg/) 的
`.github/workflows/releases.yml` 与 `docs/publish.md`——但那份工作流依赖双源（npmjs + GitHub Packages）与
Trusted Publishing，本仓库要发得先决定包名与 scope。
