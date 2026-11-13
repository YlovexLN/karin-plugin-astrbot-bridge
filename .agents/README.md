# .agents

维护者视角的文档。入口是仓库根目录的 [`AGENTS.md`](../AGENTS.md)。

| 目录 | 放什么 | 文件 |
| --- | --- | --- |
| `rules/` | 不变量、作用域与清理 | [invariants.md](./rules/invariants.md) · [workspace.md](./rules/workspace.md) |
| `memory/` | 架构与数据流、决策记录 | [architecture.md](./memory/architecture.md) · [decisions.md](./memory/decisions.md) |
| `workflows/` | 多步骤流程 | [verify.md](./workflows/verify.md) |
| `commands/` | 可复用命令 | [common.md](./commands/common.md) |
| `skills/` | 可复用的操作说明 | [troubleshooting.md](./skills/troubleshooting.md) · [writing-style.md](./skills/writing-style.md) |

暂未使用：`prompts/`（本地自用，不入库）、`tools/`（无 MCP 集成）。

面向上层使用者的文档在仓库根目录 [`docs/`](../docs/)（install / config / publish），
入口 [`README.md`](../README.md)；本目录只放**维护者**视角的东西。
