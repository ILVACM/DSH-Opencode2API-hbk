import { createElement as h, useEffect, useState } from 'react'
import { CONTEXT_PATH } from './status-paths.ts'

/**
 * Pick the id of the session currently held by the main view.
 * @param state - the client session-list snapshot state (`{ byId, phase, ... }`).
 * @returns the main-view session id, or undefined when none is retained.
 */
export function selectMainSessionId(state: any): string | undefined {
  try {
    const byId = state?.byId
    if (byId === null || typeof byId !== 'object') return undefined
    for (const value of Object.values(byId) as any[]) {
      if (value && typeof value.id === 'string' && (value.retainedBy?.mainView ?? 0) > 0) return value.id
    }
    return undefined
  } catch { return undefined }
}

export function CompactionTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const useSessions = props.useSessions as any
  const sessionId = useSessions(selectMainSessionId)
  const [context, setContext] = useState<any>(null)

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
