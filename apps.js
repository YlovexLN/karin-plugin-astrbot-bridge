// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * apps 入口：Karin 对 npm 类型插件只加载 package.json 里 `karin.apps` 列出的文件。
 *
 * 本插件靠 index.js 导出的 KARIN_PLUGIN_INIT 挂路由，不需要额外注册任何指令，
 * 所以这里只把挂载动作再转一次——KARIN_PLUGIN_INIT 已经跑过，重复调用是幂等的
 * （index.js 里用模块级标记挡第二次）。
 */
export { KARIN_PLUGIN_INIT } from './index.js'
