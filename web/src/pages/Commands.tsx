import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { commands } from '../api/bridge'
import { DataTable, EmptyRow, ErrorBar, PageHead, Panel, TextInput } from '../components/ui'
import { useLoader } from '../hooks/useLoader'

/** Karin 的权限枚举（命令对象上的 permission）→ 中文 */
const PERMISSION: Record<string, string> = {
  master: '主人',
  admin: '管理员',
  all: '所有人'
}

/** 触发规则：命令要打出来，内容触发是消息里出现就自动跑（如 B 站链接） */
const TriggerCell = ({ pattern, flags, trigger, note }: { pattern: string; flags?: string; trigger: boolean; note?: string }) => {
  if (!pattern) {
    return (
      <span className="text-xs text-muted" title={note || ''}>
        {note ? '读不到触发规则' : '手动'}
      </span>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted">{trigger ? '内容触发' : '命令'}</span>
      <code
        className="line-clamp-2 max-w-[30rem] font-mono text-xs break-all"
        title={`/${pattern}/${flags || ''}`}
      >
        {pattern}
        {flags ? `/${flags}` : ''}
      </code>
    </div>
  )
}

/** 指令表：按插件与关键字查，看触发规则，行内可以直接去试跑 */
export const CommandsPage = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const plugin = params.get('plugin') || ''
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState({ plugin, keyword: '' })

  useEffect(() => {
    setApplied({ plugin, keyword: '' })
  }, [plugin])

  /** detail: true 会顺手把每条指令的正则、权限补上（面板才要，对话侧的工具不要） */
  const query = useLoader(() =>
    commands({
      plugin: applied.plugin || undefined,
      keyword: applied.keyword || undefined,
      detail: true,
      force: true
    })
  )

  const run = () => {
    setApplied({ plugin, keyword })
  }

  return (
    <div className="flex flex-col">
      <PageHead
        title="指令"
        description={`${applied.plugin || '全部插件'} · 共 ${query.data?.total ?? 0} 条`}
        refreshing={query.loading}
        onRefresh={() => void query.reload()}
      >
        {plugin ? (
          <Button variant="secondary" onPress={() => setParams({})}>
            取消插件过滤
          </Button>
        ) : null}
      </PageHead>
      {query.error ? <ErrorBar message={query.error} /> : null}

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <TextInput label="关键字" value={keyword} onChange={setKeyword} placeholder="指令名 / 方法名 / 文件名" />
          </div>
          <Button variant="primary" onPress={run}>
            查询
          </Button>
        </div>
      </Panel>

      <Panel>
        <DataTable head={['指令', '触发', '权限', '插件 / 文件', '']}>
          {query.data?.commands?.length ? (
            query.data.commands.map((item) => (
              <tr key={`${item.plugin}-${item.method}-${item.label}`}>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium whitespace-nowrap">{item.label || item.command || item.method}</span>
                    <span className="font-mono text-xs text-muted">{item.method}</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <TriggerCell
                    pattern={item.pattern}
                    flags={item.flags}
                    trigger={item.trigger}
                    note={item.note}
                  />
                </td>
                <td className="w-20 px-3 py-2 align-top whitespace-nowrap text-muted">
                  {(item.permission && PERMISSION[item.permission]) || item.permission || '—'}
                </td>
                <td className="px-3 py-2 align-top text-muted">
                  <div className="flex flex-col gap-1">
                    <span className="whitespace-nowrap">{item.plugin}</span>
                    <span className="font-mono text-xs">{item.file}</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      navigate(
                        `/invoke?plugin=${encodeURIComponent(item.plugin)}&method=${encodeURIComponent(item.method)}`
                      )
                    }
                  >
                    试跑 →
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <EmptyRow colSpan={5} text={query.loading ? '加载中…' : '没有匹配的指令'} />
          )}
        </DataTable>
      </Panel>
    </div>
  )
}
