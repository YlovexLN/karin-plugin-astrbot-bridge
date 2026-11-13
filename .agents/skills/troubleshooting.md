# 排障

## 现象速查

| 现象 | 先查哪里 |
| --- | --- |
| 404 `Cannot POST /api/v1/astrbot/ping` | 插件没加载：Karin 启动日志有没有 `[astrbot-bridge] 已挂载 /api/v1/astrbot/`；语法错会让加载失败但进程不退 |
| 200 但 `{"success":false,"message":"未知 action: ''"}` | 1.18 的插件 router 带 baseUrl，`req.params.action` 是空的——看 `actionFromUrl(req)` 是否还在 |
| 500「没拿到令牌」 | Karin 的 `.env` 里 `HTTP_AUTH_KEY` 为空；本插件不读自己的配置 |
| 401 | 头里的 `Bearer` 与 `HTTP_AUTH_KEY` 不一致（与 Karin 中间件的 401 靠返回体区分，见下） |
| `plugins` 返回 0 | `getPlugins('all', true, force)` 失败，先看 `status` |
| `commands` total 为 0 | ① Karin 刚启动指令没加载完（等几秒）；② `fetchLoadedCommands` 打到了错端口（`config.port` 是函数，要摊平） |
| `commands` 少了某条 | 该指令被插件自己关掉了（导出为 `false`），或路由里 `method` 为空 |
| `commands` 传了 `?detail=true` 没效果 | GET 只认 `?token=`，其余参数要 POST JSON |
| `call` 报「没找到 … 里定义了方法 X 的容器」 | 老逻辑残留：要按**具名导出**取命令对象，不能按 `prototype[method]` 找类 |
| `call` 报「这条指令是关闭状态」 | 插件里对应开关是 false（如 kkk 的 `Config.bilibili.switch`） |
| `call` 一直超时 | 插件在做 puppeteer 截图/网络请求；调大 AstrBot 侧 `timeout` |
| `call` 报 `hit.fn is not a function` | `asCommand` 不幂等（把 `{fn,owner}` 当成了非命令对象），见 `rules/invariants.md` §4 |
| `logs` 说「进程内没有捕获到未处理错误」 | 走了兜底层，看返回的 `mode` |
| `share` 说「没找到解析插件的指令」 | `karin-plugin-kkk` 没装或没加载，用 `plugins` 确认 |
| `share` 成功但会话里没卡片 | kkk 侧解析失败（风控、Cookie 过期），用 `logs` 看 `[ERROR]` 行 |
| 会话里莫名收到「歇菜」错误卡 | `share` 退回了指令兜底——业务函数找到但报错时不该再喂一遍 |
| 改了代码但行为没变 | 插件不热更：WebUI 上传新 zip（或覆盖插件目录）后重启 Karin；用 `ping` 的 `build` 字段确认跑的是哪份 |
| 配置页 500 | Karin 1.18 的 `getWebConfig` 读 `info.version` 崩，`web.config.js` 必须带 `info.version` |
| 面板样式没生效、控制台又不报错 | HeroUI 变量没在 `@theme` 里映射，类名在构建产物里不存在（ADR-13） |

## 404：插件没加载
`package.json` 的 `main` 是 `index.js`、`type` 是 `module`、名字以 `karin-plugin-` 开头；
`import { router } from 'node-karin'` 能解析（插件必须在 `<karin 根>/plugins/` 下）；
挂载写在 `export const KARIN_PLUGIN_INIT` 里——官方顺序是 main 入口 → 执行 INIT → 再加载 apps。

## 401：分清是哪层拦的
- **Karin 中间件**：`{ code: 401, message: "鉴权失败: token错误" }`
- **本插件**：`{ success: false, message: "没拿到令牌…" / "token 不正确" }`

## call 拿不到想要的结果
1. **导出形状**：`node -e "import('./apps/xxx.js').then(m=>console.log(Object.keys(m)))"`，或用 `resolve` action。
2. **参数**：插件读 `e.msg`，我们把它设成 `text`，必须是**完整正文**（含链接）。
3. **事件依赖**：读 `e.rawEvent`/`e.post_type`/`e.bot.sendMsg` 的插件跑不通，**不是本插件的 bug**。
4. **异步**：插件 `return` 之后还在跑（puppeteer 出图），`deliver: true` 才看得到最终效果。
5. **超时**：AstrBot 侧 `timeout` 默认 60 s，出图慢就调大。

## 日志读不到
`readLogs` 的 `mode` 说明走到第几层：`errorLogs` → `remote`（`/api/v1/log?name=YYYY-MM-DD`）→ `local`（`logs/logger.YYYY-MM-DD.log`）。

## Karin 自身接口（排查用）
```bash
# 换 accessToken
curl -s -X POST http://<Karin 主机>:7777/api/v1/login -H 'Content-Type: application/json' -d '{"authorization":"<sha256(HTTP_AUTH_KEY)>"}'
# 指令表（本插件 commands 就是它的转写）
curl -s -X POST http://<Karin 主机>:7777/api/v1/plugin/loaded/command -H "Authorization: Bearer <accessToken>" -d '{}'
```
