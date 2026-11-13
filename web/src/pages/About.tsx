import { Card, Description } from '@heroui/react'
import { ExternalLink, Link2, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useEffect } from 'react'

import { ASTRBOT_DOC, KARIN_REPO, KKK_REPO } from '../references'
import { PageHead } from '../components/ui'

const features = [
  { icon: Zap, title: '给 Agent 用的接口', description: '查插件、查指令、直接执行指令、读日志，全部走一个前缀。' },
  { icon: ShieldCheck, title: '令牌复用', description: '不单独存密钥，直接用 Karin 的 HTTP_AUTH_KEY。' },
  { icon: Sparkles, title: '面板外壳', description: '照 kkk 面板抄：顶部一排药丸标签，没有侧边栏。' }
]

const links = [
  { href: KKK_REPO, name: 'ikenxuan/karin-plugin-kkk', description: '指令注入与卡片投递的对接对象，也是独立面板的视觉参考。' },
  { href: KARIN_REPO, name: 'KarinJS/Karin', description: '宿主框架，本插件的路由与指令表都来自它。' },
  { href: ASTRBOT_DOC, name: 'AstrBot 文档', description: '对面那个 Agent 的插件与接口文档。' }
]

/** 关于页 */
export const AboutPage = () => {
  useEffect(() => {
    const previous = document.title
    document.title = '关于 · AstrBot 桥'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="flex flex-col">
      <PageHead title="关于" description="这个插件是什么、接口在哪、参考了谁" />
      <Card className="mb-4">
        <Card.Header className="p-6 pb-2">
          <Card.Title className="text-lg font-semibold">这个插件做什么</Card.Title>
          <Description>给 AstrBot / 其它 Agent 用的 HTTP 接口：查插件、查指令、直接执行指令、读日志</Description>
        </Card.Header>
        <Card.Content className="grid gap-4 p-6 pt-3 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="rounded-xl border border-default-200 p-4">
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <p className="font-semibold">{feature.title}</p>
                <p className="mt-1 text-xs text-muted">{feature.description}</p>
              </div>
            )
          })}
        </Card.Content>
      </Card>

      <Card className="mb-4">
        <Card.Header className="p-6 pb-2">
          <Card.Title className="text-base">接口与数据</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-2 p-6 pt-3 text-sm text-muted">
          <p>
            接口前缀：<code className="rounded bg-content2 px-1.5 py-0.5 text-xs">/api/v1/astrbot/&lt;action&gt;</code>
          </p>
          <p>
            前端产物：<code className="rounded bg-content2 px-1.5 py-0.5 text-xs">web-dist/</code>（由 <code className="bg-content2 px-1.5 py-0.5 text-xs">npm run build:web</code> 生成）
          </p>
          <p>改完前端或后端都要重启 Karin，桥不热更新。</p>
        </Card.Content>
      </Card>

      <Card className="mb-4">
        <Card.Header className="p-6 pb-2">
          <Card.Title className="text-base">参考与鸣谢</Card.Title>
          <Description>感谢以下开源项目。</Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3 p-6 pt-3">
          {links.map((link) => (
            <a
              key={link.href}
              className="group flex items-start gap-3 rounded-xl border border-default-200 p-4 transition-colors hover:border-primary/40 hover:bg-content2"
              href={link.href}
              rel="noreferrer noopener"
              target="_blank"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Link2 className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{link.name}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted transition-colors group-hover:text-primary" aria-hidden="true" />
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{link.description}</p>
              </div>
            </a>
          ))}
        </Card.Content>
      </Card>
    </div>
  )
}
