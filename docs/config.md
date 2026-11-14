# 配置

**本插件没有可填的配置项。** WebUI 插件详情页里只有一段只读说明。

## 令牌
| 优先级 | 来源 |
| --- | --- |
| 1 | `.env` 的 `HTTP_AUTH_KEY`（WebUI 登录令牌，也是 HTTP 接口的 secret） |
| 2 | `.env` 的 `ASTRBOT_BRIDGE_TOKEN`（可选，只想单独给 bridge 一个令牌时才写） |
| 3 | 配置里的 `astrbotBridge.token`（应急） |

空串当没写：控制台清空某项后 `.env` 会留一行 `ASTRBOT_BRIDGE_TOKEN=`，所以判断用 `||` 而不是 `??`。**改完 `.env` 必须重启 Karin**——环境变量只在进程启动时读一次。

## 端口与路径
不新开端口，跟着 Karin 的 `HTTP_PORT`（默认 7777）走，路径统一在 `/api/v1/astrbot/<action>` 下。

## 没有令牌会怎样
- 启动日志：`[astrbot-bridge] 没拿到令牌：请确认 Karin 的 .env 里有 HTTP_AUTH_KEY…`
- 请求：`500 {"success":false,"message":"astrbot-bridge 没拿到令牌…"}`
- 例外：`ping` 无令牌也回 200（`tokenConfigured:false`），方便确认路由挂没挂上

## WebUI 面板
插件配置页用 iframe 加载 `/api/v1/astrbot/page`（同源，不需要跨域配置）。iframe 发不出 `Authorization` 头，所以 `web.config.js` 在服务端把令牌拼进 `page.url`，页面从 `location.search` 取回。读不到 `web-dist/index.html` 时会显示提示，重装一次带 `web-dist` 的包即可。
