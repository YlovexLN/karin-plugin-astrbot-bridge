// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * Karin WebUI 声明
 *
 * Karin 1.16.1+ 的读取流程（dist/app-*.mjs 的 getWebConfig$1）会无条件读 `result.info.version`，
 * 所以这里必须用 export default 导出一个带 info 的对象，否则 /api/v1/plugin/config/get 直接 TypeError，
 * 插件卡片上就是「配置加载失败 500」。
 *
 * page.url 指向本插件自己的 action `/api/v1/astrbot/page`：
 * Karin 的插件配置页会用 iframe 加载它，页面同源、可直接调 /api/v1/astrbot/*。
 * 走 action 而不是另挂静态路由，是因为 node-karin 在部分版本不导出 `app`/`router`，
 * 而 `/astrbot/:action` 这个框架路由在所有版本上都在。
 *
 * 本插件没有需要填的配置：令牌直接用 Karin 自己的 .env（HTTP_AUTH_KEY）。
 * 所以下面的 components 只有一条只读说明，save 不写任何文件。
 *
 * iframe 里发不出 Authorization 头，而 Karin 的 /api/v1 守卫会拦掉裸请求
 * （实测 `GET /api/v1/astrbot/page` → 401 缺少authorization，
 * 但 `GET ...?token=<HTTP_AUTH_KEY>` → 200，守卫对 GET 认 query 令牌），
 * 所以这里在服务端把令牌拼进 page.url；页面再从 location.search 里取回来填进输入框。
 */
const token = process.env.HTTP_AUTH_KEY || process.env.ASTRBOT_BRIDGE_TOKEN || ''

export default {
  info: {
    id: 'karin-plugin-astrbot-bridge',
    name: 'AstrBot 桥',
    version: '0.0.2-beta.1',
    description: '给 AstrBot / 其它 Agent 用的 HTTP 接口：查插件、查指令与触发规则、直接执行指令',
    icon: { name: 'hub', color: '#2563eb' },
    author: [{ name: 'astrbot' }],
  },
  /** WebUI 页面：同源 iframe，页面自己带令牌输入框 */
  page: {
    url: '/api/v1/astrbot/page' + (token ? '?token=' + encodeURIComponent(token) : ''),
    title: 'AstrBot 桥',
    description: '查看已装插件与指令（含触发规则）、试跑指令、自更新。首次打开需要填一次 Karin 的 HTTP_AUTH_KEY。',
  },
  /** 配置页里的只读说明（没有可填项） */
  components: () => [
    {
      componentType: 'input',
      key: 'usage',
      label: '用法（无需配置）',
      description: [
        '令牌不在这里填：直接复用 Karin 的 HTTP_AUTH_KEY（WebUI 登录用的那一串）。',
        '接口：POST /api/v1/astrbot/<action>，请求头 Authorization: Bearer <HTTP_AUTH_KEY>。',
        'action：ping / page / plugins / commands / search / status / call / share / send / logs / update / unpack / probe / resolve。',
        'AstrBot 侧插件填同一地址和同一个令牌即可。',
      ].join(''),
      isRequired: false,
      isReadOnly: true,
    },
  ],
  /** 没有可保存的内容 */
  save: async () => true,
}
