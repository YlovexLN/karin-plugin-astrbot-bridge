import { Info, LayoutDashboard, Package, Play, Terminal } from 'lucide-react'

import type { PageKey } from './types'

export interface NavItem {
  key: PageKey
  label: string
  to: string
  icon: typeof LayoutDashboard
  /** 悬停提示（标签上只显示 label） */
  hint: string
}

/** 导航顺序即使用频率：先看状态，再查插件与指令，试跑随后 */
export const navItems: NavItem[] = [
  { key: 'overview', label: '概览', to: '/overview', icon: LayoutDashboard, hint: '连通性、运行时与插件概况' },
  { key: 'plugins', label: '插件', to: '/plugins', icon: Package, hint: '已装插件与它们的指令入口' },
  { key: 'commands', label: '指令', to: '/commands', icon: Terminal, hint: '按插件与关键字查指令，看触发规则' },
  { key: 'invoke', label: '试跑', to: '/invoke', icon: Play, hint: '把一条指令真的跑一遍' },
  { key: 'about', label: '关于', to: '/about', icon: Info, hint: '接口、产物与鸣谢' }
]

/** 从 pathname 反查当前页 */
export const activeOf = (pathname: string): NavItem => {
  const hit = navItems.find((item) => pathname.endsWith(`/${item.key}`))
  return hit || navItems[0]
}
