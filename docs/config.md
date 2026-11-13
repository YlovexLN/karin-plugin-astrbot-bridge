# 配置

**本插件没有可填的配置项。** WebUI 的插件详情页里只有一段只读的用法说明。

## 为什么不用配

令牌直接复用 Karin 自己的：

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | `.env` 的 `HTTP_AUTH_KEY` | Karin WebUI 登录令牌，也是 HTTP 接口的 secret |
| 2 | `.env` 的 `ASTRBOT_BRIDGE_TOKEN` | 可选，只想给 bridge 单独一个备用令牌时才写 |
| 3 | `@karinjs/karin-plugin-astrbot-bridge/config` 里的 `astrbotBridge.token` | 应急，正常不需要 |

空串当没写：Karin 控制台里把某项清空后，`.env` 里会留一行 `ASTRBOT_BRIDGE_TOKEN=`，
所以判断用的是 `||` 而不是 `??`。

**改完 `.env` 必须重启 Karin**——环境变量在进程启动时读一次。

## 端口

插件不新开端口，跟着 Karin 的 `HTTP_PORT`（默认 7777）走，路径统一在 `/api/v1/astrbot/<action>` 下。

## 没有令牌会怎样

- 启动日志：`[astrbot-bridge] 没拿到令牌：请确认 Karin 的 .env 里有 HTTP_AUTH_KEY…`
- 请求：`500 {"success":false,"message":"astrbot-bridge 没拿到令牌…"}`
- 例外：`ping` 在没有令牌时也回 200（`tokenConfigured:false`），方便确认路由挂没挂上

## WebUI 面板

Karin 的插件配置页用 iframe 加载 `/api/v1/astrbot/page`（页面走同源，不需要跨域配置）。
iframe 里发不出 `Authorization` 头，所以 `web.config.js` 在服务端把令牌拼进 `page.url`，
页面再从 `location.search` 取出来填进输入框。
面板读不到 `web-dist/index.html` 时会显示一段提示，重新装一次带 `web-dist` 的包即可。
