import { Button } from '@heroui/react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { ping, plugins, status } from '../api/bridge'
import { DataTable, EmptyRow, ErrorBar, PageHead, Panel, StatCard } from '../components/ui'
import { useLoader } from '../hooks/useLoader'

/** 概览：一眼看清桥是否通、跑的是哪份代码、Karin 里有什么 */
export const OverviewPage = () => {
  const navigate = useNavigate()
  const pingQuery = useLoader(ping)
  const statusQuery = useLoader(status)
  const pluginsQuery = useLoader(() => plugins())

  const error = pingQuery.error || statusQuery.error || pluginsQuery.error
  const refreshing = pingQuery.loading || statusQuery.loading || pluginsQuery.loading

  const reload = () => {
    void pingQuery.reload()
    void statusQuery.reload()
    void pluginsQuery.reload()
  }

  const bots = useMemo(() => statusQuery.data?.bots || pluginsQuery.data?.runtime?.bots || [], [statusQuery.data, pluginsQuery.data])
  const enabled = useMemo(() => (pluginsQuery.data?.plugins || []).filter((item) => item.enabled).length, [pluginsQuery.data])

  return (
    <div className="flex flex-col">
      <PageHead
        title="概览"
        description="桥的连通性、Karin 运行时与插件概况"
        refreshing={refreshing}
        onRefresh={reload}
      />
      {error ? <ErrorBar message={error} /> : null}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="插件版本"
          value={pingQuery.data?.version || '—'}
          hint={pingQuery.data?.pong ? '桥已连通' : '等待 ping'}
        />
        <StatCard label="已装插件" value={pluginsQuery.data?.total ?? '—'} hint={`启用 ${enabled} 个`} />
        <StatCard label="指令总数" value={pluginsQuery.data?.runtime?.command ?? '—'} hint="来自 Karin 指令路由表" />
        <StatCard label="在线 Bot" value={bots.length || '—'} hint={bots.map((bot) => bot.name || bot.selfId).join('、') || '暂无'} />
      </div>

      <Panel title="构建标记" extra={<span className="text-xs text-muted">改完代码对不上就是没重启</span>}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 text-sm md:grid-cols-2">
          <p className="min-w-0 break-all">
            <span className="text-muted">build：</span>
            <code className="rounded bg-content2 px-1.5 py-0.5">{pingQuery.data?.build || '—'}</code>
          </p>
          <p className="min-w-0 break-all">
            <span className="text-muted">目录：</span>
            <code className="rounded bg-content2 px-1.5 py-0.5">{pingQuery.data?.dir || '—'}</code>
          </p>
          <p>
            <span className="text-muted">服务器时间：</span>
            {pingQuery.data?.time ? new Date(pingQuery.data.time).toLocaleString() : '—'}
          </p>
          <p>
            <span className="text-muted">主人 / 管理：</span>
            {(statusQuery.data?.master || []).join('、') || '—'} / {(statusQuery.data?.admin || []).join('、') || '—'}
          </p>
        </div>
      </Panel>

      <Panel
        title="在线 Bot"
        extra={
          <Button size="sm" variant="ghost" onPress={() => navigate('/plugins')}>
            去看插件 →
          </Button>
        }
      >
        <DataTable head={['账号', '名称', '适配器', '协议', 'selfId']}>
          {bots.length ? (
            bots.map((bot) => (
              <tr key={`${bot.selfId}-${bot.uin}`}>
                <td className="px-3 py-2 font-medium">{bot.uin || bot.selfId}</td>
                <td className="px-3 py-2">{bot.name || '—'}</td>
                <td className="px-3 py-2">{bot.standard || '—'}</td>
                <td className="px-3 py-2">{bot.protocol || '—'}</td>
                <td className="px-3 py-2 text-muted">{bot.selfId}</td>
              </tr>
            ))
          ) : (
            <EmptyRow colSpan={5} text="还没有 Bot 上线" />
          )}
        </DataTable>
      </Panel>
    </div>
  )
}
