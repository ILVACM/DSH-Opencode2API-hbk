import { check, record } from './lib.mjs'

export async function run(runtime) {
  await runtime.catalog.refresh()
  const snap = runtime.catalog.snapshot()
  const free = runtime.catalog.free()
  check('h1 free models exist', free.length > 0, 'no free models')
  for (const e of snap.entries) {
    check('h1 entry is free', e.free === true, e.id)
  }
  const visibleAll = runtime.catalog.visible([])
  check('h1 visible(all) == free', JSON.stringify(visibleAll.map((e) => e.id).sort()) === JSON.stringify(free.map((e) => e.id).sort()), 'visible mismatch')
  const hideOne = free.length > 0 ? [free[0].id] : []
  const visibleHidden = runtime.catalog.visible(hideOne)
  check('h1 hidden excluded', visibleHidden.length === free.length - hideOne.length, JSON.stringify({ free: free.length, visible: visibleHidden.length, hideOne }))
  const models = await runtime.adapter.listModels('opencode-local')
  const selIds = visibleAll.map((e) => e.id).sort()
  const modelIds = models.map((m) => m.id).sort()
  check('h1 listModels == visible', JSON.stringify(selIds) === JSON.stringify(modelIds), JSON.stringify({ selIds, modelIds }))
  record('h1-free-filter', { total: snap.entries.length, free: free.length, visible: visibleAll.length, hideOne, visibleAfterHide: visibleHidden.length, selIds })
}
