import { Button, Card, Description, Input, Label, TextField } from '@heroui/react'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { saveToken } from '../auth/panelToken'

/**
 * 没有令牌时的入口页。
 * iframe 由 web.config.js 拼好了 ?token=，正常情况看不到这一页；
 * 只有直接打开页面（或令牌被清掉）时才需要手填。
 */
export const TokenPanel = ({ onDone }: { onDone: () => void }) => {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const token = value.trim()
    if (!token) {
      setError('先填 Karin 的 HTTP_AUTH_KEY')
      return
    }
    saveToken(token)
    onDone()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Card.Header className="p-6 pb-2">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <Card.Title className="text-lg">AstrBot 桥</Card.Title>
          <Description>填一次 Karin 的 HTTP_AUTH_KEY（就是登录 Karin WebUI 用的那串），令牌只存在本机浏览器里。</Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3 p-6 pt-3">
          <TextField fullWidth isInvalid={Boolean(error)} value={value} onChange={(next) => { setValue(next); setError('') }}>
            <Label className="font-semibold">令牌</Label>
            <Input variant="secondary" placeholder="HTTP_AUTH_KEY" type="password" onKeyDown={(event) => { if (event.key === 'Enter') submit() }} />
          </TextField>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <Button variant="primary" onPress={submit}>
            进入面板
          </Button>
        </Card.Content>
      </Card>
    </div>
  )
}
