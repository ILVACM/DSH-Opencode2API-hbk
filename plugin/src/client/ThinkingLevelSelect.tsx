import { createElement as h, useEffect, useState } from 'react'
import { MODELS_PATH } from './status-paths.ts'
import type { WebModelsPayload } from './status-paths.ts'

interface ModelSelectionLike {
  lastUsed?: { provider?: unknown; model?: unknown; id?: unknown } | null
  next?: { provider?: unknown; model?: unknown; id?: unknown } | null
}

export function ThinkingLevelSelect(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const useProjection = props.useProjection
  const [variants, setVariants] = useState<string[]>([])
  const [local, setLocal] = useState<string | undefined>(undefined)
  const projection = typeof useProjection === 'function'
    ? (useProjection('modelSelection') as ModelSelectionLike | undefined)
    : undefined
  const cur = projection?.next ?? projection?.lastUsed
  const provider = typeof cur?.provider === 'string' ? cur.provider : ''
  const modelId = typeof cur?.model === 'string' ? cur.model : typeof cur?.id === 'string' ? cur.id : ''
  useEffect(() => {
    if (provider !== 'opencode-local' || modelId.length === 0) {
      setVariants([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(MODELS_PATH, { credentials: 'same-origin' })
        const body = await r.json() as WebModelsPayload
        const row = (body.models ?? []).find((m) => m.id === modelId)
        if (!cancelled) setVariants(Array.isArray(row?.variants) ? row.variants : [])
      } catch {
        if (!cancelled) setVariants([])
      }
    })()
    return () => { cancelled = true }
  }, [provider, modelId])
  const committed = scope?.getSnapshot?.().value ?? {}
  const current = typeof committed.thinkingVariant === 'string' && committed.thinkingVariant.length > 0 ? committed.thinkingVariant : 'default'
  const shown = local ?? current
  const opts = ['default', ...variants.filter((v) => v !== 'default')]
  const write = async (v: string): Promise<void> => {
    setLocal(v)
    try { await scope?.set?.('thinkingVariant', v === 'default' ? '' : v) } catch { /* observe on reopen */ }
  }
  if (provider !== 'opencode-local') return null
  return h('label', { className: 'olp-thinking', title: t('thinking.hint'), style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' } },
    h('span', null, t('thinking.label')),
    h('select', { value: shown, onChange: (e: any) => void write(e.target.value), style: { fontSize: '12px' } },
      ...opts.map((o) => h('option', { key: o, value: o }, o === 'default' ? t('thinking.default') : o))),
  )
}