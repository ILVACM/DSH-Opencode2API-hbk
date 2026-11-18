import type { ModelCatalog } from '../catalog/models.ts'
import type { CatalogEntry } from '../types.ts'
import { COMPACTION_FILE_VERSION } from '../compaction-store.ts'

export interface WebRouteDeps {
  catalog: ModelCatalog
  hiddenModels: () => string[]
  refresh: () => Promise<void>
  compaction: () => { provider: string; model: string }
  setCompaction: (next: { provider: string; model: string }) => Promise<void>
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

async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return undefined
  try { return JSON.parse(text) } catch { return undefined }
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

    // One path, method-dispatched: the webServer rejects duplicate path registrations.
    ws.register({
      kind: 'exact',
      path: '/plugins/opencode-local/compaction',
      handler: async (req: any, res: any) => {
        if (req.method === 'GET') {
          const current = deps.compaction()
          return send(res, 200, { version: COMPACTION_FILE_VERSION, provider: current.provider, model: current.model })
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
        const body = await readJson(req)
        const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
        const model = typeof body?.model === 'string' ? body.model.trim() : ''
        if (provider.length === 0 || model.length === 0) return send(res, 400, { error: 'provider and model required' })
        try {
          await deps.setCompaction({ provider, model })
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
        const saved = deps.compaction()
        send(res, 200, { version: COMPACTION_FILE_VERSION, provider: saved.provider, model: saved.model })
      },
    })
  })

  // Full catalog, live context readings, and on-demand compaction. Registered in a
  // separate block so a composition missing one host service still serves the
  // model routes above.
  ctx.inject?.(
    ['webServer', 'llm', 'commands', 'agents', 'sessions', 'tokenMeter', 'sessionProjections'],
    (richCtx: any) => {
      const ws = richCtx.webServer ?? richCtx.get?.('webServer')
      const llm = richCtx.llm ?? richCtx.get?.('llm')
      const commands = richCtx.commands ?? richCtx.get?.('commands')
      const agents = richCtx.agents ?? richCtx.get?.('agents')
      const sessions = richCtx.sessions ?? richCtx.get?.('sessions')
      const tokenMeter = richCtx.tokenMeter ?? richCtx.get?.('tokenMeter')
      const sessionProjections = richCtx.sessionProjections ?? richCtx.get?.('sessionProjections')
      if (!ws?.register || !llm) return

      const buildCatalog = async (): Promise<Record<string, unknown>> => {
        const groups: Array<Record<string, unknown>> = []
        const failures: Array<Record<string, unknown>> = []
        const defaultRoute = deps.compaction()
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
        return { default: defaultRoute, groups, failures }
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

      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/compact',
        handler: async (req: any, res: any) => {
          if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
          const body = await readJson(req)
          const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          if (sessionId.length === 0) return send(res, 400, { ok: false, error: 'sessionId required' })
          if (!commands?.execute) return send(res, 503, { ok: false, error: 'commands unavailable' })
          let agent: any
          try { agent = agents?.get?.(sessionId) } catch { agent = undefined }
          if (agent === undefined || agent === null) return send(res, 404, { ok: false, error: 'session not found' })
          const controller = new AbortController()
          req.on?.('close', () => { if (!controller.signal.aborted) controller.abort() })
          try {
            const result = await commands.execute(agent, '/compact', [], controller.signal)
            if (result === undefined) return send(res, 200, { ok: false, kind: 'error', text: 'compact command unavailable' })
            send(res, 200, {
              ok: result.result?.kind === 'success',
              kind: result.result?.kind ?? 'error',
              text: result.result?.text ?? '',
              ...(result.result?.sourceEventSeq === undefined ? {} : { sourceEventSeq: result.result.sourceEventSeq }),
            })
          } catch (err) {
            send(res, 200, { ok: false, kind: 'error', text: err instanceof Error ? err.message : String(err) })
          }
        },
      })
    },
  )
}
