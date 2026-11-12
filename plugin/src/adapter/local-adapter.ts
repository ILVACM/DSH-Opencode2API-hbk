import type { ServeManager } from '../serve/manager.ts'
import type { ModelCatalog } from '../catalog/models.ts'
import type { UserActivity } from '../priority.ts'
import { runTurn } from './turn.ts'
import type {
  AdapterDiagnostics,
  CatalogEntry,
  HarnessChunk,
  HarnessGenerateOptions,
  ModelRef,
  ResolvedModelInfo,
  ToolPolicy,
} from '../types.ts'

export interface AdapterConfig {
  providerId: string
  modelWhitelist: string[]
  titlePrefix: string
  firstEventMs?: number
  idleMs?: number
  toolPolicy: () => ToolPolicy
  thinkingVariant: () => string
  hiddenModels: () => string[]
  activity: UserActivity
}

const DEFAULT_FIRST_EVENT_MS = 30000
const DEFAULT_IDLE_MS = 120000
const DEFAULT_CONTEXT_WINDOW = 262144
const DEFAULT_MAX_TOKENS = 32768

export const RETRY_POLICY = Object.freeze({
  mode: 'normal' as const,
  maxRetries: 4,
  retryableCodes: Object.freeze(['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE']),
  initialDelayMs: 1000,
  maxDelayMs: 15000,
  jitterRatio: 0.2,
})

function modalitiesOf(entry: CatalogEntry | undefined): string[] {
  return entry && entry.inputModalities.length > 0 ? entry.inputModalities : ['text']
}

function refOf(entry: CatalogEntry, thinkingVariant: string): ModelRef {
  if (thinkingVariant.length > 0 && thinkingVariant !== 'default' && entry.variants.includes(thinkingVariant)) {
    return { ...entry.modelRef, variant: thinkingVariant }
  }
  return entry.modelRef
}

export class LocalAdapter {
  private cfg: AdapterConfig
  private manager: ServeManager
  private catalog: ModelCatalog
  readonly diagnostics: AdapterDiagnostics = { permissionAsked: 0, permissionRejected: 0, toolEvents: 0, toolApproved: 0, sessions: [] }

  constructor(cfg: AdapterConfig, manager: ServeManager, catalog: ModelCatalog) {
    this.cfg = cfg
    this.manager = manager
    this.catalog = catalog
  }

  providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: this.cfg.providerId }
  }

  providerRetryPolicy(_provider: string): typeof RETRY_POLICY {
    return RETRY_POLICY
  }

  imageRequestPricing(_provider: string, _model: string): undefined {
    return undefined
  }

  #whitelistAllows(model: string): boolean {
    return this.cfg.modelWhitelist.length === 0 || this.cfg.modelWhitelist.includes(model)
  }

  async refreshModels(): Promise<string[]> {
    await this.catalog.refresh()
    return this.catalog.visible(this.cfg.hiddenModels()).map((e) => e.id).filter((id) => this.#whitelistAllows(id))
  }

  async listModels(provider: string): Promise<Array<{ provider: string; id: string; name: string; inputModalities: string[] }>> {
    if (this.catalog.snapshot().entries.length === 0) {
      try { await this.catalog.refresh() } catch { /* keep whatever cache has */ }
    }
    const out: Array<{ provider: string; id: string; name: string; inputModalities: string[] }> = []
    for (const e of this.catalog.visible(this.cfg.hiddenModels())) {
      if (!this.#whitelistAllows(e.id)) continue
      out.push({ provider, id: e.id, name: e.name, inputModalities: modalitiesOf(e) })
    }
    return out
  }

  resolveModel(provider: string, model: string): ResolvedModelInfo {
    const e = this.catalog.entry(model)
    return {
      provider,
      id: model,
      name: e?.name ?? model,
      inputModalities: modalitiesOf(e),
      context: { contextWindow: e?.contextWindow ?? DEFAULT_CONTEXT_WINDOW },
      defaultMaxTokens: e?.maxOutput ?? DEFAULT_MAX_TOKENS,
    }
  }

  async #ensureEntry(model: string): Promise<CatalogEntry> {
    const hit = this.catalog.entry(model)
    if (hit) return hit
    await this.catalog.refresh()
    const hit2 = this.catalog.entry(model)
    if (!hit2) throw new Error(`model "${model}" is not provided by the local opencode serve (INVALID_REQUEST)`)
    return hit2
  }

  async prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<{
    model: ResolvedModelInfo
    stream: (options: HarnessGenerateOptions) => AsyncGenerator<HarnessChunk>
  }> {
    if (!this.#whitelistAllows(model)) {
      throw new Error(`model "${model}" is excluded by modelWhitelist (INVALID_REQUEST)`)
    }
    await this.#ensureEntry(model)
    return {
      model: this.resolveModel(provider, model),
      stream: (options: HarnessGenerateOptions) => this.#streamWith(options),
    }
  }

  async *stream(options: HarnessGenerateOptions): AsyncGenerator<HarnessChunk> {
    if (!this.#whitelistAllows(options.model)) {
      throw new Error(`model "${options.model}" is excluded by modelWhitelist (INVALID_REQUEST)`)
    }
    yield* this.#streamWith(options)
  }

  async *#streamWith(options: HarnessGenerateOptions): AsyncGenerator<HarnessChunk> {
    this.cfg.activity.enter()
    try {
      const ep = await this.manager.ensureReady()
      const entry = await this.#ensureEntry(options.model)
      const modelRef = refOf(entry, this.cfg.thinkingVariant())
      yield* runTurn(
        ep,
        {
          titlePrefix: this.cfg.titlePrefix,
          firstEventMs: this.cfg.firstEventMs ?? DEFAULT_FIRST_EVENT_MS,
          idleMs: this.cfg.idleMs ?? DEFAULT_IDLE_MS,
          toolPolicy: this.cfg.toolPolicy,
        },
        options,
        modelRef,
        this.diagnostics,
      )
    } finally {
      this.cfg.activity.leave()
    }
  }
}
