import { Button } from '@heroui/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { plugins } from '../api/bridge'
import { DataTable, EmptyRow, ErrorBar, PageHead, Panel, TextInput } from '../components/ui'
import { useLoader } from '../hooks/useLoader'

/** 插件清单：能装了什么、哪个开着、各自有多少条指令入口 */
export const PluginsPage = () => {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const query = useLoader(() => plugins())
  const rows = (query.data?.plugins || []).filter((item) => {
    if (!keyword.trim()) return true
    const needle = keyword.trim().toLowerCase()
    return `${item.name} ${item.description} ${item.type}`.toLowerCase().includes(needle)
  })

  return (
    <div className="flex flex-col">
      <PageHead
        title="插件"
        description={`共 ${query.data?.total ?? 0} 个，指令 ${query.data?.runtime?.command ?? 0} 条`}
        refreshing={query.loading}
        onRefresh={() => void query.reload()}
      />
      {query.error ? <ErrorBar message={query.error} /> : null}

      <Panel>
        <div className="max-w-sm">
          <TextInput label="过滤" value={keyword} onChange={setKeyword} placeholder="插件名 / 描述 / 类型" />
        </div>
      </Panel>

      <Panel>
        <DataTable head={['插件', '版本', '类型', '指令入口', '状态', '']}>
          {rows.length ? (
            rows.map((item) => (
              <tr key={item.name}>
                <td className="max-w-[280px] px-3 py-2">
                  <p className="truncate font-medium" title={item.name}>
                    {item.name}
                  </p>
                  {item.description ? (
                    <p className="truncate text-xs text-muted" title={item.description}>
                      {item.description}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{item.version || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">{item.type || '—'}</td>
                <td className="px-3 py-2">{item.apps}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                      item.enabled ? 'border-success/20 bg-success/10 text-success' : 'border-default-200 bg-content2 text-muted'
                    }`}
                  >
                    {item.enabled ? '已加载' : '未加载'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onPress={() => navigate(`/commands?plugin=${encodeURIComponent(item.name)}`)}>
                    看指令 →
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <EmptyRow colSpan={6} text={keyword ? '没有匹配的插件' : 'Karin 里还没有插件'} />
          )}
        </DataTable>
      </Panel>
    </div>
  )
}
