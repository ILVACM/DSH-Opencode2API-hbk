import { Component, createElement as h, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { MODELS_PATH, MODELS_REFRESH_PATH } from './status-paths.ts'
import type { WebModelsPayload } from './status-paths.ts'
import { ModelsTab } from './ModelsTab.tsx'
import { ToolsTab } from './ToolsTab.tsx'

class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean; message?: string }> {
  state: { failed: boolean; message?: string } = { failed: false }
  static getDerivedStateFromError(error: unknown): { failed: boolean; message?: string } {
    if (error instanceof Error && error.name === 'SlotAssemblyError') throw error
    return { failed: true, message: error instanceof Error ? error.message : String(error) }
  }
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    try { console.error('[opencode-local] card render failed:', error, info.componentStack) } catch { /* ignore */ }
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return h('div', { className: 'olp-crash' }, 'opencode-local card crashed: ' + (this.state.message ?? 'unknown'))
  }
}

function CardBody(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const [panel, setPanel] = useState<'models' | 'tools'>('models')
  const [payload, setPayload] = useState<WebModelsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const load = async (): Promise<void> => {
    if (mounted.current) setLoading(true)
    try {
      const r = await fetch(MODELS_PATH, { credentials: 'same-origin' })
      const body = await r.json() as WebModelsPayload
      if (mounted.current) { setPayload(body); setError(undefined) }
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? String(e))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }
  const refresh = async (): Promise<void> => {
    if (mounted.current) setRefreshing(true)
    try {
      const r = await fetch(MODELS_REFRESH_PATH, { method: 'POST', credentials: 'same-origin' })
      const body = await r.json() as WebModelsPayload
      if (mounted.current) { setPayload(body); setError(undefined) }
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? String(e))
    } finally {
      if (mounted.current) setRefreshing(false)
    }
  }
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => clearInterval(timer)
  }, [])
  const tabBtn = (id: 'models' | 'tools', label: string) =>
    h('button', { key: id, role: 'tab', className: 'olp-tab' + (panel === id ? ' olp-tab-active' : ''), onClick: () => setPanel(id) }, label)
  return h('div', { className: 'olp-card' },
    h('div', { className: 'olp-tabs', role: 'tablist' }, tabBtn('models', t('tab.models')), tabBtn('tools', t('tab.tools'))),
    error ? h('p', { className: 'olp-error' }, error) : null,
    panel === 'models'
      ? h(ModelsTab, { t, scope, payload, loading, refreshing, onRefresh: refresh })
      : h(ToolsTab, { t, scope }),
  )
}

export function OpencodeLocalCard(props: any) {
  return h(CardBoundary, null, h(CardBody, props))
}
