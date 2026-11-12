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

export function registerWebRoutes(ctx: any, deps: WebRouteDeps): void {
  ctx.inject?.(['webServer'], (webCtx: any) => {
    const ws = webCtx.webServer ?? webCtx.get?.('webServer')
    if (!ws?.register) return
    const send = (res: any, status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
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
}
