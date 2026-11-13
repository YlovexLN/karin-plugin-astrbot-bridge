# 可复用命令

## 语法检查
```bash
node --check index.js && node --check route.js && node --check web.config.js && echo OK
```

## 依赖纯净度
```bash
node -e "const p=require('./package.json');if(Object.keys(p.dependencies||{}).length)process.exit(1);'-- check ok'"
```

## 结构总览 / action 一致性
```bash
grep -n '^const \|^export \|^let ' route.js
grep -n "case '" route.js
```
**预期**：15 个 `case` 分支（ping/plugins/commands/search/status/call/share/send/logs/probe/resolve/readfile/writefile/fetchtext/amagitest）；
`page`/`assets` 在 `astrbotBridgeHandler` 里先处理，合计**十七个 action**——与 README 接口表、
`dispatch` 默认错误文案里的列表、AstrBot 侧工具数一一对应。

## 硬编码 token 扫描
```bash
grep -rn "Bearer [A-Za-z0-9]\{8,\}" --include='*.js' --include='*.md' .
```
**预期**：只出现在文档占位符里。

## 写文件点
```bash
grep -rn "writeFileSync\|mkdirSync\|unlinkSync\|rmSync\|renameSync" --include='*.js' .
```
**预期**：只有 `route.js` 的 `writeFileSafe`（`writefile` action）与 `scripts/pack.mjs`，且路径必须落在插件目录内。

## 临时文件清理自检
```bash
find . -maxdepth 2 \( -name '_*' -o -name '*.tmp' -o -name '*.bak' -o -name '*.orig' \) -print
```

## 打包与发布
```bash
npm run pack       # = node scripts/pack.mjs
# 产物：dist/karin-plugin-astrbot-bridge-v0.0.2-beta.1.zip + dist/karin-plugin-astrbot-bridge/（解压副本）
```
版本号改了三处一起改：`package.json` 的 `version`、`scripts/pack.mjs` 的 `ZIP_NAME`、这里与 README/INSTALL 里的包名。

## 线上探活（<Karin 主机>:7777，令牌 = HTTP_AUTH_KEY）
```bash
T=<HTTP_AUTH_KEY>
curl -s -X POST http://<Karin 主机>:7777/api/v1/astrbot/commands -H "Authorization: Bearer $T" -d '{}' | head -c 300
```
