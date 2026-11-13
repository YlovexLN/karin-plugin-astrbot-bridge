import { useCallback, useEffect, useRef, useState } from 'react'

interface LoaderState<T> {
  data: T | null
  error: string
  loading: boolean
}

/**
 * 极简数据加载：进页面拉一次，之后手动 reload。
 * loader 放在 ref 里，避免调用方每次渲染传新函数导致死循环。
 */
export const useLoader = <T,>(loader: () => Promise<T>) => {
  const [state, setState] = useState<LoaderState<T>>({ data: null, error: '', loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const data = await loaderRef.current()
      setState({ data, error: '', loading: false })
    } catch (error) {
      setState({ data: null, error: (error as Error).message || '请求失败', loading: false })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}
