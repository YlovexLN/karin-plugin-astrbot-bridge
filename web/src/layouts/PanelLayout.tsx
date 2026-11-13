import { Button, Tabs, Tooltip } from '@heroui/react'
import { LogOut } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

/** 照抄 kkk 面板的 Tabs.List 类名：HeroUI 默认给 tabs__list 加了 min-width:100%，会把标签拉成等宽；
 *  子项必须显式 w-fit / flex-none，否则每个 tab 会撑满整条。 */
const TABS_LIST_CLASS =
  'w-fit min-w-max *:w-fit *:min-w-fit *:flex-none *:shrink-0 *:whitespace-nowrap'

import { clearToken } from '../auth/panelToken'
import { ThemeToggle } from '../components/ThemeToggle'
import { activeOf, navItems } from '../nav'

/**
 * 外壳照 kkk 面板：**没有侧边栏**，只有顶部一排药丸标签 + 内容区。
 * 标签用的是 HeroUI 的 `Tabs`（kkk 用的是同一个组件），
 * 所以灰底圆角容器、白色选中块、标签之间的竖分隔线都由 @heroui/styles 提供，这里不写任何颜色。
 */
export const PanelLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const current = activeOf(location.pathname)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Tabs
              className="w-full"
              selectedKey={current.key}
              onSelectionChange={(key) => navigate(`/${String(key)}`)}
            >
              <Tabs.ListContainer>
                {/** 标签按内容宽度排布；HeroUI 默认给 tabs__list 加了 min-width:100%，会把 7 个标签拉成等宽 */}
                <Tabs.List aria-label="面板导航" className={TABS_LIST_CLASS}>
                  {navItems.map((item, index) => (
                    <Tabs.Tab key={item.key} id={item.key} className="shrink-0">
                      {index > 0 ? <Tabs.Separator /> : null}
                      <span className="whitespace-nowrap">{item.label}</span>
                      {item.key === current.key ? <Tabs.Indicator /> : null}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Tooltip delay={0}>
              <Tooltip.Trigger aria-label="登出">
                <Button isIconOnly variant="ghost" onPress={() => clearToken()}>
                  <LogOut className="size-4" aria-hidden="true" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content showArrow placement="bottom">
                <Tooltip.Arrow />
                清除令牌
              </Tooltip.Content>
            </Tooltip>
          </div>
        </div>
        <div className="mt-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
