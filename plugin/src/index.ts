import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig,
  applyCompactionRoute,
  type ResolvedPluginConfig,
} from './config.ts'
import { readCompactionFile, writeCompactionFile, migrateCompactionFile } from './compaction-store.ts'
import { ServeManager, defaultManagerConfig } from './serve/manager.ts'
import { ModelCatalog } from './catalog/models.ts'
import { LocalAdapter } from './adapter/local-adapter.ts'
import { registerWebRoutes } from './web/routes.ts'
import { ApiServer } from './api/server.ts'
import { errorMessage } from './serve/client.ts'
import { UserActivity } from './priority.ts'

export interface PluginContext {
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
  llm?: { registerAdapter(providers: string[], adapter: unknown): unknown }
  effect?(fn: () => () => void): unknown
  inject?(services: string[], callback: (ctx: any) => void | Promise<void>): unknown
  on?(event: string, listener: (...args: any[]) => any): unknown
  get?(service: string): any
}

export const name = 'opencode-local'
export { Config } from './config.ts'
export const inject = ['llm'] as const

export function apply(ctx: PluginContext, config: Partial<ResolvedPluginConfig> = {}): void {
  const cfg = resolveConfig(config)
  if (!ctx.llm || typeof ctx.llm.registerAdapter !== 'function') {
    ctx.logger.error('opencode-local: llm service unavailable; adapter not registered')
    return
  }
  const dataDir = join(homedir(), '.dsh-opencode-local')
  const activity = new UserActivity()
  const manager = new ServeManager(defaultManagerConfig({ opencodePath: cfg.opencodePath, portBase: cfg.portBase, dataDir }))
  const catalog = new ModelCatalog(manager, { cachePath: join(dataDir, 'catalog.json') })
  catalog.loadCache()
  const compactionPath = join(dataDir, 'compaction.json')
  try {
    const editor = (ctx as { get?: (name: string) => any }).get?.('configEditor')
    const rows = typeof editor?.configuration === 'function' ? editor.configuration() : undefined
    const row = Array.isArray(rows) ? rows.find((r: any) => r?.entry?.options?.id === 'opencode-local') : undefined
    const legacy = row?.override ?? row?.inherited
    migrateCompactionFile(compactionPath, legacy)
  } catch { /* migration is best-effort */ }
  const adapter = new LocalAdapter(
    {
      providerId: cfg.providerId,
      modelWhitelist: cfg.modelWhitelist,
      titlePrefix: cfg.titlePrefix,
      firstEventMs: cfg.firstEventMs,
      idleMs: cfg.idleMs,
      toolPolicy: () => liveToolPolicy(config),
      thinkingVariant: () => liveThinkingVariant(config),
      hiddenModels: () => liveHiddenModels(config),
      activity,
    },
    manager,
    catalog,
  )
  ctx.llm.registerAdapter([cfg.providerId], adapter)
  ctx.logger.info(`opencode-local: adapter registered for "${cfg.providerId}"`)

  // Route every compaction request to the configured summarization model.
  // Compaction requests are hand-built and mutable; loop requests never carry
  // purpose==='compaction', so ordinary conversation is left byte-identical.
  const listen = (ctx as { on?: (event: string, listener: (...args: any[]) => any) => unknown }).on
  if (typeof listen === 'function') {
    ctx.effect?.(() => {
      const dispose = listen.call(ctx, 'llm/stream', (options: any, next: () => any) => {
        try {
          if (options?.purpose === 'compaction') {
            const choice = readCompactionFile(compactionPath)
            applyCompactionRoute(options, choice.provider, choice.model)
          }
        } catch { /* a frozen request keeps its original route */ }
        return next()
      })
      return () => { if (typeof dispose === 'function') (dispose as () => void)() }
    })
  }

  ctx.inject?.(['settings'], (sctx: any) => {
    const settings = sctx.settings ?? sctx.get?.('settings')
    if (settings?.configure) ctx.effect?.(() => settings.configure({ auto: true }, (ctx as { fiber?: unknown }).fiber))
  })

  registerWebRoutes(ctx, {
    catalog,
    hiddenModels: () => liveHiddenModels(config),
    refresh: async () => { await catalog.refresh() },
    compaction: () => readCompactionFile(compactionPath),
    setCompaction: (next) => writeCompactionFile(compactionPath, next),
  })

  let api: ApiServer | null = null
  const apiCfg = liveApiConfig(config)
  if (apiCfg.enabled) {
    api = new ApiServer(apiCfg, adapter)
    api
      .start()
      .then(({ port }) => ctx.logger.info(`opencode-local: API listening on ${apiCfg.host}:${port}`))
      .catch((err) => ctx.logger.warn(`opencode-local: API start failed: ${errorMessage(err)}`))
  }

  const maybeEffect = ctx.effect
  if (typeof maybeEffect === 'function') {
    maybeEffect.call(ctx, () => () => {
      if (api) void api.stop()
      void manager.dispose()
    })
  }

  // Startup: one metadata-only list refresh. Never sends a model request.
  void catalog
    .refresh()
    .then(() => {
      const hidden = liveHiddenModels(config)
      ctx.logger.info(`opencode-local: ${catalog.free().length} free models, ${catalog.visible(hidden).length} visible`)
    })
    .catch((err) => ctx.logger.warn(`opencode-local: catalog refresh failed: ${errorMessage(err)}`))
}
