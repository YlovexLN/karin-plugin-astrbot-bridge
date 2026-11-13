import { Button, Switch } from '@heroui/react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { invoke } from '../api/bridge'
import { SelectField, TextFieldInput } from '../components/fields'
import { ErrorBar, JsonBlock, PageHead, Panel } from '../components/ui'

/** 试跑：把一条指令真的注入 Karin 的分发器跑一遍，结果原样回显 */
export const InvokePage = () => {
  const [params] = useSearchParams()
  const [plugin, setPlugin] = useState(params.get('plugin') || '')
  const [method, setMethod] = useState(params.get('method') || '')
  const [text, setText] = useState('')
  const [scene, setScene] = useState('friend')
  const [target, setTarget] = useState('')
  const [deliver, setDeliver] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<unknown>(null)

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const payload = await invoke({
        plugin: plugin.trim() || undefined,
        method: method.trim() || undefined,
        text,
        scene,
        target: target.trim() || undefined,
        deliver
      })
      setResult(payload)
    } catch (exception) {
      setError((exception as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col">
      <PageHead title="试跑" description="直接调 Karin 插件里的指令函数；deliver 打开才会真的发消息" />
      {error ? <ErrorBar message={error} /> : null}

      <Panel title="指令">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
          <TextFieldInput label="插件" value={plugin} onChange={setPlugin} placeholder="karin-plugin-kkk" />
          <TextFieldInput label="方法 / 指令名" value={method} onChange={setMethod} placeholder="bilibiliAPP" />
        </div>
        <TextFieldInput label="文本" value={text} onChange={setText} placeholder="https://www.bilibili.com/video/BV..." />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="会话类型"
            value={scene}
            onChange={setScene}
            options={[
              { label: '私聊', value: 'friend' },
              { label: '群聊', value: 'group' }
            ]}
          />
          <TextFieldInput label="目标" value={target} onChange={setTarget} placeholder="QQ 号或群号，留空用主人" />
        </div>
        <Switch isSelected={deliver} onChange={setDeliver}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <span className="font-semibold">真的发出去</span>
          </Switch.Content>
        </Switch>
        <div className="flex items-center gap-2">
          <Button isDisabled={running} variant="primary" onPress={() => void run()}>
            {running ? '跑着呢…' : '执行'}
          </Button>
          <span className="text-xs text-muted">指令要独占一条消息，别把链接夹在正文里</span>
        </div>
      </Panel>

      {result ? (
        <Panel title="结果">
          <JsonBlock value={result} />
        </Panel>
      ) : null}
    </div>
  )
}
