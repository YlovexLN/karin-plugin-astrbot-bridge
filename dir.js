// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 插件自身的路径常量。 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根目录（package.json 所在目录） */
export const PluginDir = dirname(fileURLToPath(import.meta.url))

/**
 * 包名 / 配置目录名，与 package.json 的 `name`、仓库目录名一致。
 *
 * 配置路径为 `@karinjs/karin-plugin-astrbot-bridge/config`。
 */
export const PluginName = 'karin-plugin-astrbot-bridge'

/** WebUI 打包产物目录（vite build 输出，随插件一起分发） */
export const WebDistDir = join(PluginDir, 'web-dist')
