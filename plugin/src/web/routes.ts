import type { ModelCatalog } from '../catalog/models.ts'
import type { CatalogEntry } from '../types.ts'

export interface WebRouteDeps {
  catalog: ModelCatalog
  hiddenModels: () => string[]
  refresh: () => Promise<void>
}

export function publicModelRow(e: CatalogEntry, hidden: Set<string>): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    contextWindow: e.contextWindow,
    maxOutput: e.maxOutput,
    inputModalities: e.inputModalities,
    variants: e.variants,
    free: e.free,
    hidden: hidden.has(e.id),
  }
}

function send(res: any, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export function registerWebRoutes(ctx: any, deps: WebRouteDeps): void {
  ctx.inject?.(['webServer'], (webCtx: any) => {
    const ws = webCtx.webServer ?? webCtx.get?.('webServer')
    if (!ws?.register) return
    const payload = (): Record<string, unknown> => {
      const snap = deps.catalog.snapshot()
      const hidden = new Set(deps.hiddenModels())
      return { updatedAt: snap.updatedAt, models: snap.entries.filter((e) => e.free).map((e) => publicModelRow(e, hidden)) }
    }
    ws.register({
      kind: 'exact',
      path: '/plugins/opencode-local/models',
      handler: (req: any, res: any) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
        send(res, 200, payload())
      },
    })
    ws.register({
      kind: 'exact',
      path: '/plugins/opencode-local/models/refresh',
      handler: async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
        try {
          await deps.refresh()
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
        send(res, 200, payload())
      },
    })
  })

  // Full catalog and live context readings. Registered in a separate block so a
  // composition missing one host service still serves the model routes above.
  ctx.inject?.(
    ['webServer', 'llm', 'sessions', 'tokenMeter', 'sessionProjections'],
    (richCtx: any) => {
      const ws = richCtx.webServer ?? richCtx.get?.('webServer')
      const llm = richCtx.llm ?? richCtx.get?.('llm')
      const sessions = richCtx.sessions ?? richCtx.get?.('sessions')
      const tokenMeter = richCtx.tokenMeter ?? richCtx.get?.('tokenMeter')
      const sessionProjections = richCtx.sessionProjections ?? richCtx.get?.('sessionProjections')
      if (!ws?.register || !llm) return

      const buildCatalog = async (): Promise<Record<string, unknown>> => {
        const groups: Array<Record<string, unknown>> = []
        const failures: Array<Record<string, unknown>> = []
        let providers: Array<{ id: string; name?: string }> = []
        try { providers = llm.listProviders() ?? [] } catch { providers = [] }
        for (const provider of providers) {
          try {
            const models = await llm.listModels(provider.id)
            const entries: Array<Record<string, unknown>> = []
            for (const model of models ?? []) {
              let contextWindow: number | undefined
              try {
                const info = await llm.resolveModelInfo(provider.id, model.id)
                const value = info?.context?.contextWindow
                if (typeof value === 'number' && Number.isFinite(value) && value > 0) contextWindow = value
              } catch { /* no capacity advertised */ }
              entries.push({
                id: model.id,
                name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
                ...(contextWindow === undefined ? {} : { contextWindow }),
              })
            }
            if (entries.length > 0) {
              groups.push({ id: provider.id, name: typeof provider.name === 'string' && provider.name.length > 0 ? provider.name : provider.id, models: entries })
            }
          } catch (err) {
            failures.push({ id: provider.id, name: provider.name, message: err instanceof Error ? err.message : String(err) })
          }
        }
        return { groups, failures }
      }

      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/catalog',
        handler: async (req: any, res: any) => {
          if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
          try { send(res, 200, await buildCatalog()) } catch (err) { send(res, 500, { error: err instanceof Error ? err.message : String(err) }) }
        },
      })
      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/catalog/refresh',
        handler: async (req: any, res: any) => {
          if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
          try { send(res, 200, await buildCatalog()) } catch (err) { send(res, 500, { error: err instanceof Error ? err.message : String(err) }) }
        },
      })

      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/context',
        handler: (req: any, res: any) => {
          if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
          let sessionId = ''
          try {
            const url = new URL(req.url, 'http://127.0.0.1')
            sessionId = url.searchParams.get('sessionId') ?? ''
          } catch { sessionId = '' }
          if (sessionId.length === 0) return send(res, 400, { error: 'sessionId required' })
          let session: any
          try { session = sessions?.get?.(sessionId) } catch { session = undefined }
          if (session === undefined || session === null) return send(res, 200, { sessionId, found: false })
          let values: any = {}
          try { values = sessionProjections?.snapshot?.(session)?.values ?? {} } catch { values = {} }
          let totalTokens: number | undefined
          try {
            const measurement = tokenMeter?.measure?.(session)
            if (typeof measurement?.totalTokens === 'number') totalTokens = measurement.totalTokens
          } catch { totalTokens = undefined }
          const pressure = values.contextPressure
          const breakdown = values.contextBreakdown
          const usage = values.tokenUsage
          const contextWindow = typeof pressure?.contextWindow === 'number' ? pressure.contextWindow : undefined
          const used = typeof pressure?.projectedTokens === 'number'
            ? pressure.projectedTokens
            : typeof pressure?.pressureTokens === 'number' ? pressure.pressureTokens : totalTokens
          const percent = typeof used === 'number' && typeof contextWindow === 'number' && contextWindow > 0
            ? Math.round((used / contextWindow) * 100)
            : undefined
          send(res, 200, {
            sessionId,
            found: true,
            ...(pressure === undefined ? {} : { pressure }),
            ...(breakdown === undefined ? {} : { breakdown }),
            ...(usage === undefined ? {} : { usage }),
            ...(totalTokens === undefined ? {} : { totalTokens }),
            ...(percent === undefined ? {} : { percent }),
          })
        },
      })
    },
  )
}
