# invariants.md — 硬约束 1–7 的细节

配套 [`AGENTS.md`](../../AGENTS.md)。

## 1. 零依赖
运行时只有 `node-karin` 与 Node 内置模块（`fs`/`path`/`crypto`/`zlib`/`url`/`http`）。
容器里没有 `npm install` 的机会，也不能新增 `dependencies`（`devDependencies` 只剩 `web/` 构建要用的那些）。

## 2. 不动 `node_modules`
镜像更新会覆盖它。要框架能力就**读**（`import('node-karin')`、读 `dist/router-*.mjs` 的常量），不改写、不 patch。

## 3. 令牌
```
bridgeToken() = process.env.HTTP_AUTH_KEY
             || process.env.ASTRBOT_BRIDGE_TOKEN
             || config?.astrbotBridge?.token
             || ''
```
- 有值：`Authorization: Bearer <token>` 必须一致，否则 401。
- 空值：回「请确认 Karin 的 .env 里有 HTTP_AUTH_KEY」，**不能静默放行**。
- 例外：`ping`/`page`/`assets` 在 token 校验之前（探活与页面本身不含密钥）。

## 4. `call` 的调用模型
```
row = { plugin, file, label, method }        // 来自 /api/v1/plugin/loaded/command
mod = await import(path.join(plugin.dir, 'apps', file))   // 或 lib/apps/<basename>
fn  = mod[method] ?? mod.default?.[method]
await fn(mock, next)                          // karin 命令对象签名 (e, next)
```
- 不能按 `prototype[method]` 找类——kkk 导出的 `bilibiliAPP` 是 `karin.command(...)` 返回的函数。
- 导出为 `false`（如 `bilibiliAPP = Config.bilibili.switch && bilibili`）时回「这条指令是关闭状态」。
- `asCommand()` 必须幂等：接受 函数 / `{fnc}` / `{fn,owner}` / `{data:{fnc}}`。
  （曾因它只认前两种而把 `{fn,owner}` 判成 null，掉进兜底扫描，误报「没有导出可调用的指令对象」。）

## 5. 不往 QQ 发东西
`call` 默认把 `e.reply` 截流进结果数组，只有 `deliver: true` 才真投递。
`share`/`send` 是唯一设计上发消息的 action（用户明确要卡片进当前会话）。

## 6. 指令表缓存
`fetchLoadedCommands()` 带 15s TTL；Karin 重启后插件加载是异步的，失败要能自愈（下次请求重试）。
**别再自己 `import()` `node_modules/node-karin/dist/*.mjs` 造缓存**——ESM 会给另一份空模块实例（踩过）。

## 7. 降级吞异常
`errorLogs`、`web.config` 的 import、README 扫描都要 try/catch，拿不到就少字段。一次 500 会让 AstrBot 侧整条链路报错。
