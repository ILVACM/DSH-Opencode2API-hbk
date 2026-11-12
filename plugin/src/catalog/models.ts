import fs from 'node:fs'
import path from 'node:path'
import type { CatalogEntry, CatalogSnapshot, ServeModelInfo } from '../types.ts'
import { listModels, toModelRef } from '../serve/client.ts'
import type { ServeManager } from '../serve/manager.ts'

const DEFAULT_CTX = 262144
const DEFAULT_MAX = 32768

export interface CatalogOptions {
  cachePath: string
}

function isFree(m: ServeModelInfo): boolean {
  const cost = Array.isArray(m.cost) ? m.cost : []
  return cost.length > 0 && cost.every((c) =>
    Number(c.input) === 0 && Number(c.output) === 0 && Number(c.cache?.read) === 0 && Number(c.cache?.write) === 0)
}

function toEntry(m: ServeModelInfo): CatalogEntry {
  const modalities = Array.isArray(m.capabilities?.input) && m.capabilities.input.length > 0 ? m.capabilities.input : ['text']
  const variants = Array.isArray(m.variants)
    ? m.variants.map((v) => (typeof v?.id === 'string' ? v.id : '')).filter((id) => id.length > 0)
    : []
  return {
    id: m.id,
    name: m.name ?? m.id,
    providerID: m.providerID,
    modelRef: toModelRef(m),
    contextWindow: typeof m.limit?.context === 'number' && m.limit.context > 0 ? m.limit.context : DEFAULT_CTX,
    maxOutput: typeof m.limit?.output === 'number' && m.limit.output > 0 ? m.limit.output : DEFAULT_MAX,
    inputModalities: modalities,
    variants,
    free: isFree(m),
  }
}

export class ModelCatalog {
  private mgr: ServeManager
  private opts: CatalogOptions
  private entries: CatalogEntry[] = []
  private updatedAt = 0
  private refreshing: Promise<void> | null = null

  constructor(mgr: ServeManager, opts: CatalogOptions) {
    this.mgr = mgr
    this.opts = opts
  }

  loadCache(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.opts.cachePath, 'utf8')) as CatalogSnapshot
      if (raw && Array.isArray(raw.entries)) {
        this.entries = raw.entries.map((e) => ({ ...e, variants: Array.isArray(e.variants) ? e.variants : [] }))
        this.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
      }
    } catch { /* no cache */ }
  }

  saveCache(): void {
    try {
      fs.mkdirSync(path.dirname(this.opts.cachePath), { recursive: true })
      const snap: CatalogSnapshot = { updatedAt: this.updatedAt, entries: this.entries }
      fs.writeFileSync(this.opts.cachePath, JSON.stringify(snap, null, 2))
    } catch { /* ignore */ }
  }

  snapshot(): CatalogSnapshot {
    return { updatedAt: this.updatedAt, entries: this.entries.map((e) => ({ ...e })) }
  }

  entry(id: string): CatalogEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  free(): CatalogEntry[] {
    return this.entries.filter((e) => e.free)
  }

  visible(hidden: string[]): CatalogEntry[] {
    const blocked = new Set(hidden)
    return this.entries.filter((e) => e.free && !blocked.has(e.id))
  }

  async refresh(): Promise<void> {
    if (this.refreshing) await this.refreshing
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = null })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    const ep = await this.mgr.ensureReady()
    const all = await listModels(ep)
    if (all.length === 0) return
    const next: CatalogEntry[] = []
    for (const m of all) {
      if (m.enabled === false) continue
      next.push(toEntry(m))
    }
    this.entries = next
    this.updatedAt = Date.now()
    this.saveCache()
  }
}
