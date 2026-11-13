import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { ServeManager, defaultManagerConfig } from '../../plugin/src/serve/manager.ts'
import { ModelCatalog } from '../../plugin/src/catalog/models.ts'
import { LocalAdapter } from '../../plugin/src/adapter/local-adapter.ts'
import { UserActivity } from '../../plugin/src/priority.ts'

export const H = path.dirname(fileURLToPath(import.meta.url))
export const RAW = path.join(H, '..', '..', 'temp', 'impl-harness-results')
export const BUDGET = { used: 0, cap: 12 }

export function makeRuntime() {
  const activity = new UserActivity()
  const policy = { mode: 'off', allow: [], allowAll: false, maxPerTurn: 20 }
  const manager = new ServeManager(defaultManagerConfig({ opencodePath: '', portBase: 4096, dataDir: path.join(H, '..', '..', 'temp', 'impl-harness-data') }))
  const catalog = new ModelCatalog(manager, { cachePath: path.join(H, '..', '..', 'temp', 'impl-harness-data', 'catalog.json') })
  const adapter = new LocalAdapter({ providerId: 'opencode-local', modelWhitelist: [], titlePrefix: 'dsh-h-', toolPolicy: () => policy, thinkingVariant: () => '', hiddenModels: () => [], activity }, manager, catalog)
  return { manager, catalog, adapter, policy, activity }
}

export function spend() {
  BUDGET.used += 1
  if (BUDGET.used > BUDGET.cap) throw new Error('budget exceeded ' + BUDGET.used)
}

export function record(name, data) {
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(path.join(RAW, name + '.json'), JSON.stringify(data, null, 2))
  console.log(name, JSON.stringify(data).slice(0, 400))
}

export function check(name, ok, detail) {
  if (!ok) throw new Error('check failed: ' + name + ' — ' + detail)
}

export async function collectStream(gen) {
  const chunks = []
  for await (const c of gen) chunks.push(c)
  const finish = chunks.find((c) => c.type === 'finish')?.reason ?? null
  const usage = chunks.find((c) => c.type === 'usage')?.usage ?? null
  const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
  const toolBlocks = chunks.filter((c) => c.type === 'block-start' && c.blockType === 'tool-call').length
  const endsWithFinish = chunks.length > 0 && chunks[chunks.length - 1].type === 'finish'
  return { chunks, finish, usage, text, toolBlocks, endsWithFinish }
}

export function firstModel(runtime) {
  const sel = runtime.catalog.visible([])
  return sel.length > 0 ? sel[0].id : ''
}
