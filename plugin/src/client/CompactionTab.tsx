import { createElement as h, useEffect, useState } from 'react'
import { CATALOG_PATH, CONTEXT_PATH, COMPACT_PATH, COMPACTION_PATH } from './status-paths.ts'
import type { WebCatalogPayload, WebCompactionPayload } from './status-paths.ts'

function currentSessionId(sessions: any): string | undefined {
  try {
    const byId = sessions?.list?.getSnapshot?.()?.byId
    if (byId === null || typeof byId !== 'object') return undefined
    for (const value of Object.values(byId) as any[]) {
      if (value && typeof value.id === 'string' && (value.retainedBy?.mainView ?? 0) > 0) return value.id
    }
    return undefined
  } catch { return undefined }
}

function pairOf(provider: string, model: string): string {
  return provider + '\u0000' + model
}

export function CompactionTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const sessions = props.sessions
  const sessionId = currentSessionId(sessions)
  const [catalog, setCatalog] = useState<WebCatalogPayload | null>(null)
  const [context, setContext] = useState<any>(null)
  const [provider, setProvider] = useState('deepseek-official')
  const [model, setModel] = useState('deepseek-flash')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(CATALOG_PATH, { credentials: 'same-origin' })
        const body = await r.json() as WebCatalogPayload
        if (!cancelled) setCatalog(body)
      } catch { /* keep previous catalog */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(COMPACTION_PATH, { credentials: 'same-origin' })
        const body = await r.json() as WebCompactionPayload
        if (cancelled) return
        if (typeof body.provider === 'string' && body.provider.length > 0) setProvider(body.provider)
        if (typeof body.model === 'string' && body.model.length > 0) setModel(body.model)
      } catch { /* keep defaults */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (sessionId === undefined) { setContext(null); return }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const r = await fetch(CONTEXT_PATH + '?sessionId=' + encodeURIComponent(sessionId), { credentials: 'same-origin' })
        const body = await r.json()
        if (!cancelled) setContext(body)
      } catch { /* keep previous reading */ }
    }
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [sessionId])

  const choose = async (value: string): Promise<void> => {
    const at = value.indexOf('\u0000')
    if (at < 0) return
    const nextProvider = value.slice(0, at)
    const nextModel = value.slice(at + 1)
    const previousProvider = provider
    const previousModel = model
    setProvider(nextProvider)
    setModel(nextModel)
    setError('')
    setSaving(true)
    try {
      const r = await fetch(COMPACTION_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: nextProvider, model: nextModel }),
      })
      const body = await r.json() as WebCompactionPayload
      if (r.ok !== true || typeof body.error === 'string') {
        setProvider(previousProvider)
        setModel(previousModel)
        setError(typeof body.error === 'string' ? body.error : 'save failed')
      }
    } catch (e: any) {
      setProvider(previousProvider)
      setModel(previousModel)
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const compact = async (): Promise<void> => {
    if (sessionId === undefined) { setError(t('compaction.noSession')); return }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const r = await fetch(COMPACT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const body = await r.json() as { ok?: boolean; text?: string; error?: string }
      if (body.ok === true) setMessage(body.text ?? '')
      else setError(body.text !== undefined && body.text.length > 0 ? body.text : (body.error ?? 'failed'))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const groups = Array.isArray(catalog?.groups) ? catalog!.groups! : []
  const live = pairOf(provider, model)
  const known = groups.some((g) => g.models.some((m) => pairOf(g.id, m.id) === live))
  const rows: Array<[string, string]> = []
  const pressure = context?.pressure
  if (pressure?.pressureTokens !== undefined) rows.push([t('compaction.used'), String(pressure.pressureTokens)])
  if (pressure?.projectedTokens !== undefined) rows.push([t('compaction.projected'), String(pressure.projectedTokens)])
  if (pressure?.contextWindow !== undefined) rows.push([t('compaction.window'), String(pressure.contextWindow)])
  if (context?.percent !== undefined) rows.push([t('compaction.percent'), String(context.percent) + '%'])
  const breakdown = context?.breakdown
  if (breakdown !== undefined && breakdown !== null) {
    rows.push([t('compaction.breakdown'), [breakdown.systemTokens, breakdown.toolsTokens, breakdown.messageTokens].join(' / ')])
  }
  const usage = context?.usage
  if (usage !== undefined && usage !== null) {
    rows.push([t('compaction.usage'), [usage.uncachedInputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].join(' / ')])
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('p', { className: 'olp-hint' }, t('compaction.hint')),
    h('div', { className: 'olp-section' },
      h('button', { className: 'olp-btn', onClick: () => { void compact() }, disabled: busy === true },
        busy === true ? t('compaction.buttonBusy') : t('compaction.button')),
      message.length > 0 ? h('p', { className: 'olp-ok' }, message) : null,
      error.length > 0 ? h('p', { className: 'olp-error' }, error) : null,
    ),
    h('div', { className: 'olp-section' },
      h('p', { className: 'olp-section-title' }, t('compaction.model')),
      h('select', {
        className: 'olp-select',
        value: live,
        disabled: saving === true,
        onChange: (e: any) => { void choose(e.target.value) },
      },
        ...groups.map((g) => h('optgroup', { key: g.id, label: g.name },
          ...g.models.map((m) => h('option', { key: pairOf(g.id, m.id), value: pairOf(g.id, m.id) }, m.name))),
        ),
        known ? null : h('option', { value: live }, provider + ' / ' + model),
      ),
      h('p', { className: 'olp-model-hint' }, t('compaction.modelHint')),
    ),
    h('div', { className: 'olp-section' },
      h('p', { className: 'olp-section-title' }, t('compaction.status')),
      rows.length === 0
        ? h('p', { className: 'olp-hint' }, t('compaction.empty'))
        : h('div', { className: 'olp-kv' },
            ...rows.flatMap(([key, value]) => [
              h('span', { key: key + ':k', className: 'olp-kv-key' }, key),
              h('span', { key: key + ':v', className: 'olp-kv-val' }, value),
            ]),
          ),
    ),
  )
}
