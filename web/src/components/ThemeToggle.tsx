import { Button, Tooltip } from '@heroui/react'
import { Moon, Sun } from 'lucide-react'

import { useThemeContext } from '../hooks/useTheme'

/** 深浅色切换：写入 Karin 主 Web 共用的 theme key */
export const ThemeToggle = () => {
  const { isDark, toggleTheme } = useThemeContext()

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger aria-label="切换主题">
        <Button isIconOnly variant="secondary" onPress={toggleTheme}>
          {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        {isDark ? '切换浅色' : '切换深色'}
      </Tooltip.Content>
    </Tooltip>
  )
}
