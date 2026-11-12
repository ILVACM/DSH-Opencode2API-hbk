import { createElement as h, useState } from 'react'
import { TOOL_ACTIONS } from './status-paths.ts'

export function ToolsTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const committed = scope?.getSnapshot?.().value ?? {}
  const committedMode = committed.toolMode === true
  const committedAllow: string[] = Array.isArray(committed.toolAllowlist) ? committed.toolAllowlist : []
  const committedMax = typeof committed.toolMaxPerTurn === 'number' ? committed.toolMaxPerTurn : 20
  const [mode, setMode] = useState<boolean | undefined>(undefined)
  const [allow, setAllow] = useState<string[] | undefined>(undefined)
  const [max, setMax] = useState<number | undefined>(undefined)
  const modeShown = mode ?? committedMode
  const allowShown = allow ?? committedAllow
  const maxShown = max ?? committedMax
  const allowAll = allowShown.includes('*')
  const writeMode = async (next: boolean): Promise<void> => {
    setMode(next)
    try { await scope?.set?.('toolMode', next) } catch { /* observe on reopen */ }
  }
  const writeAllow = async (next: string[]): Promise<void> => {
    setAllow(next)
    try { await scope?.set?.('toolAllowlist', next) } catch { /* observe on reopen */ }
  }
  const writeMax = async (next: number): Promise<void> => {
    const n = Math.max(1, Math.min(1000, Math.trunc(next) || 20))
    setMax(n)
    try { await scope?.set?.('toolMaxPerTurn', n) } catch { /* observe on reopen */ }
  }
  const toggleAllowAll = (on: boolean): void => { void writeAllow(on ? ['*'] : []) }
  const toggleAction = (action: string, on: boolean): void => {
    if (allowAll) return
    const set = new Set(allowShown)
    if (on) set.add(action)
    else set.delete(action)
    void writeAllow([...set])
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('p', { className: 'olp-hint' }, t('tools.hint')),
    h('label', { className: 'olp-toggle' },
      h('input', { type: 'checkbox', checked: modeShown, onChange: (e: any) => void writeMode(e.target.checked) }),
      t('tools.global')),
    h('label', { className: 'olp-toggle' + (modeShown ? '' : ' olp-disabled') },
      h('input', { type: 'checkbox', checked: allowAll, disabled: !modeShown, onChange: (e: any) => toggleAllowAll(e.target.checked) }),
      t('tools.allowAll')),
    h('p', { className: 'olp-hint' }, t('tools.allowAllHint')),
    ...TOOL_ACTIONS.map((a) => h('label', { key: a, className: 'olp-toggle' + (modeShown && !allowAll ? '' : ' olp-disabled') },
      h('input', { type: 'checkbox', checked: allowAll ? true : allowShown.includes(a), disabled: !modeShown || allowAll, onChange: (e: any) => toggleAction(a, e.target.checked) }),
      t('tools.action.' + a),
    )),
    h('label', { className: 'olp-toggle' },
      t('tools.maxPerTurn'),
      h('input', { type: 'number', min: 1, max: 1000, value: maxShown, disabled: !modeShown, onChange: (e: any) => void writeMax(Number(e.target.value)), style: { width: '80px' } })),
    h('p', { className: 'olp-hint' }, t('tools.maxPerTurnHint')),
    h('p', { className: 'olp-hint' }, t('tools.saveHint')),
  )
}