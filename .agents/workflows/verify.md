# 改完怎么验

## 1. 语法与清单
```bash
node --check index.js && node --check route.js && node --check web.config.js
node scripts/test.mjs    # 27 项断言，桩件自动写 node_modules/node-karin
node scripts/pack.mjs    # 看字节数与文件数
```
`dist/` 要同时出现 zip 与同名解压副本；zip 应有 12 项，含 `LICENSE` 与 `web-dist/`，不含 `web/` 与 `docs/`。

## 2. 部署后
```bash
T=<HTTP_AUTH_KEY>
curl -s -X POST http://<Karin 主机>:7777/api/v1/astrbot/ping -H "Authorization: Bearer $T" -d '{}'
curl -s -X POST http://<Karin 主机>:7777/api/v1/astrbot/commands -H "Authorization: Bearer $T" -d '{}' | head -c 400
```
- `ping` 要 `pong:true`（`build` 字段确认跑的是哪份代码）
- `commands` 要 `total` > 0（刚启动可能为 0，等几秒重试）
- 改了面板：`page` 与 `assets/*` 都要 200；样式改动 grep 构建后的 `style-*.css` 确认类名存在

## 3. 端到端（AstrBot 侧）
在 AstrBot 里问「karin 装了哪些插件」。失败时先看 Karin 日志里有没有 `[astrbot-bridge]` 行（每条 `action=… build=…` 都带这个前缀）。
