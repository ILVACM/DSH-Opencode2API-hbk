import { createElement as h, useState } from 'react'
import type { WebModelRow, WebModelsPayload } from './status-paths.ts'

export function formatContext(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '-'
  if (n >= 1000000) return String(Math.round((n / 1000000) * 100) / 100) + 'M'
  if (n >= 1000) return String(Math.round(n / 1000)) + 'K'
  return String(n)
}

export function ModelsTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const payload: WebModelsPayload | null = props.payload ?? null
  const models: WebModelRow[] = payload?.models ?? []
  const fromScope = scope?.getSnapshot?.().value
  const committedHidden: string[] | undefined = fromScope && Array.isArray(fromScope.hiddenModels) ? fromScope.hiddenModels : undefined
  const fromPayload = models.filter((m) => m.hidden).map((m) => m.id)
  const [local, setLocal] = useState<string[] | undefined>(undefined)
  const hidden = local ?? committedHidden ?? fromPayload
  const hiddenSet = new Set(hidden)
  const allSelected = models.length > 0 && models.every((m) => !hiddenSet.has(m.id))
  const write = async (next: string[]): Promise<void> => {
    setLocal(next)
    try { await scope?.set?.('hiddenModels', next) } catch { /* observe on reopen */ }
  }
  const toggle = (id: string, on: boolean): void => {
    const s = new Set(hiddenSet)
    if (on) s.delete(id)
    else s.add(id)
    void write([...s])
  }
  const toggleAll = (): void => {
    void write(allSelected ? models.map((m) => m.id) : [])
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('p', { className: 'olp-hint' }, t('models.hint')),
    h('div', { className: 'olp-toolbar' },
      h('button', { className: 'olp-btn', onClick: toggleAll, disabled: models.length === 0 },
        allSelected ? t('models.selectNone') : t('models.selectAll')),
      h('button', { className: 'olp-btn', onClick: props.onRefresh, disabled: props.refreshing === true },
        props.refreshing === true ? t('models.loading') : t('models.refresh')),
    ),
    h('div', { className: 'olp-row olp-row-head' },
      h('span', null, ''),
      h('span', null, t('models.col.model')),
      h('span', null, t('models.col.context')),
    ),
    props.loading === true && models.length === 0 ? h('p', { className: 'olp-hint' }, t('models.loading')) : null,
    props.loading !== true && models.length === 0 ? h('p', { className: 'olp-hint' }, t('models.none')) : null,
    ...models.map((m) => h('div', { key: m.id, className: 'olp-row' },
      h('span', { className: 'olp-check' },
        h('input', { type: 'checkbox', checked: !hiddenSet.has(m.id), onChange: (e: any) => toggle(m.id, e.target.checked) })),
      h('span', { className: 'olp-model-name', title: m.id }, m.name),
      h('span', null, formatContext(m.contextWindow)),
    )),
  )
}
