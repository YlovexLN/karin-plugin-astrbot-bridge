# 可复用命令

**语法检查**：`node --check index.js && node --check route.js && node --check web.config.js && echo OK`

**依赖纯净度**：`node -e "const p=require('./package.json');if(Object.keys(p.dependencies||{}).length)process.exit(1);'-- ok'"`

**action 一致性**：`grep -n "case '" route.js` —— 预期 15 个 `case`（ping/plugins/commands/search/status/call/share/send/logs/probe/resolve/readfile/writefile/fetchtext/amagitest）；`page`/`assets` 在 `astrbotBridgeHandler` 里先处理，合计**十七个**，与 README 接口表、`dispatch` 默认错误文案、AstrBot 侧工具数对应。

**硬编码 token**：`grep -rn "Bearer [A-Za-z0-9]\{8,\}" --include='*.js' --include='*.md' .` —— 应只命中文档占位符。

**写文件点**：`grep -rn "writeFileSync\|mkdirSync\|unlinkSync\|rmSync\|renameSync" --include='*.js' .` —— 只应有 `route.js` 的 `writeFileSafe` 与 `scripts/pack.mjs`，路径必须落在插件目录内。

**临时文件**：`find . -maxdepth 2 \( -name '_*' -o -name '*.tmp' -o -name '*.bak' -o -name '*.orig' \) -print`

**打包**：`npm run pack` → `dist/karin-plugin-astrbot-bridge-v0.0.2.zip` + 同名解压副本。版本号要三处一起改：`package.json` 的 `version`、`scripts/pack.mjs` 的 `ZIP_NAME`、README/INSTALL 里的包名。

**线上探活**：`curl -s -X POST http://<Karin 主机>:7777/api/v1/astrbot/commands -H "Authorization: Bearer $T" -d '{}' | head -c 300`
