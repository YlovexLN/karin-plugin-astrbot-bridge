import { Button, Card, Description, Input, Label, TextField } from '@heroui/react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * 页面标题块：对齐 kkk 面板的 renderPageHeader ——
 * 左列 h2 text-2xl font-bold + mt-3 说明，右列留给本页动作按钮（kkk 那里放的是保存/重置）。
 */
export const PageHead = ({
  title,
  description,
  onRefresh,
  refreshing,
  children
}: {
  title: string
  description?: string
  onRefresh?: () => void
  refreshing?: boolean
  children?: ReactNode
}) => (
  <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-8">
    <div className="min-w-0">
      <h2 className="text-2xl font-bold">{title}</h2>
      {description ? <p className="mt-3">{description}</p> : null}
    </div>
    <div className="flex shrink-0 items-center justify-end gap-3">
      {children}
      {onRefresh ? (
        <Button isDisabled={refreshing} variant="secondary" onPress={onRefresh}>
          {refreshing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
          刷新
        </Button>
      ) : null}
    </div>
  </div>
)

/** 指标卡：概览页顶部那一排 */
export const StatCard = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <Card>
    <Card.Content className="flex flex-col gap-1 p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className="truncate text-2xl font-bold" title={typeof value === 'string' ? value : undefined}>
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-xs text-muted">{hint}</p> : null}
    </Card.Content>
  </Card>
)

/** 错误提示：iframe 里没有 alert，统一用这条 */
export const ErrorBar = ({ message }: { message: string }) => (
  <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span className="min-w-0 break-words">{message}</span>
  </div>
)

/** 单行文本输入 */
export const TextInput = ({
  label,
  value,
  onChange,
  placeholder,
  help,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  help?: string
  type?: 'text' | 'password'
}) => (
  <TextField fullWidth value={value} onChange={onChange}>
    <Label className="font-semibold">{label}</Label>
    <Input variant="secondary" placeholder={placeholder || label} type={type} />
    {help ? <Description>{help}</Description> : null}
  </TextField>
)

/** 结果 JSON 展示 */
export const JsonBlock = ({ value }: { value: unknown }) => (
  <pre className="max-h-96 overflow-auto rounded-xl border border-default-200 bg-content2 p-4 text-xs leading-relaxed">
    {JSON.stringify(value, null, 2)}
  </pre>
)

/** 表格：放在卡片里，不再自己套边框 */
export const DataTable = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="text-xs text-muted">
        <tr className="border-b border-default-200">
          {head.map((item, index) => (
            <th key={item || index} className="whitespace-nowrap px-4 py-3 font-medium">
              {item}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-default-100">{children}</tbody>
    </table>
  </div>
)

/** 空表占位 */
export const EmptyRow = ({ colSpan, text }: { colSpan: number; text: string }) => (
  <tr>
    <td className="px-4 py-8 text-center text-sm text-muted" colSpan={colSpan}>
      {text}
    </td>
  </tr>
)

/** 通用分区卡片：Card.Header p-2 + Card.Content p-6，与 kkk 的 renderSubSection 一致 */
export const Panel = ({ title, extra, children }: { title?: string; extra?: ReactNode; children: ReactNode }) => (
  <Card className="mb-4">
    {title ? (
      <Card.Header className="p-2">
        <div className="flex w-full items-center justify-between gap-3">
          <Card.Title className="text-lg font-semibold">{title}</Card.Title>
          {extra ? <div className="flex flex-wrap items-center gap-3">{extra}</div> : null}
        </div>
      </Card.Header>
    ) : null}
    <Card.Content className="flex flex-col gap-5 p-6">{children}</Card.Content>
  </Card>
)
