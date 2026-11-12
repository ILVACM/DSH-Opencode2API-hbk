import http from 'node:http'
import type { LocalAdapter } from '../adapter/local-adapter.ts'
import type { HarnessGenerateOptions, HarnessMessage } from '../types.ts'

export interface ApiConfig {
  enabled: boolean
  host: string
  port: number
  token: string
}

interface OaiMessage { role?: string; content?: unknown }
interface OaiRequest { model?: string; messages?: unknown; stream?: boolean; max_tokens?: number; temperature?: number }

function contentText(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c.map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('')
  }
  return ''
}

function toOptions(req: OaiRequest): HarnessGenerateOptions {
  const model = typeof req.model === 'string' ? req.model : ''
  const systemParts: string[] = []
  const messages: HarnessMessage[] = []
  const list = Array.isArray(req.messages) ? (req.messages as OaiMessage[]) : []
  for (const m of list) {
    const role = m?.role
    const text = contentText(m?.content)
    if (role === 'system') { systemParts.push(text); continue }
    const r = role === 'assistant' ? 'assistant' : role === 'tool' ? 'tool' : 'user'
    messages.push({ role: r, content: [{ type: 'text', text }] })
  }
  const options: HarnessGenerateOptions = { provider: 'opencode-local', model, messages }
  if (systemParts.length > 0) options.system = systemParts.join('\n\n')
  if (typeof req.max_tokens === 'number') options.maxTokens = req.max_tokens
  if (typeof req.temperature === 'number') options.temperature = req.temperature
  return options
}

export class ApiServer {
  private cfg: ApiConfig
  private adapter: LocalAdapter
  private server: http.Server | null = null

  constructor(cfg: ApiConfig, adapter: LocalAdapter) {
    this.cfg = cfg
    this.adapter = adapter
  }

  start(): Promise<{ port: number }> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => { void this.handle(req, res) })
      srv.once('error', reject)
      srv.listen(this.cfg.port, this.cfg.host, () => {
        this.server = srv
        const addr = srv.address()
        const port = addr && typeof addr === 'object' ? addr.port : this.cfg.port
        resolve({ port })
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      const srv = this.server
      this.server = null
      srv.close(() => resolve())
    })
  }

  private authorized(req: http.IncomingMessage): boolean {
    if (this.cfg.token.length === 0) return true
    const h = req.headers['authorization']
    return typeof h === 'string' && h === 'Bearer ' + this.cfg.token
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let buf = ''
      req.on('data', (c) => { buf += c })
      req.on('end', () => resolve(buf))
      req.on('error', reject)
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const send = (status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    if (!this.authorized(req)) return send(401, { error: { message: 'unauthorized', type: 'auth_error' } })
    const url = req.url ?? '/'
    if (req.method === 'GET' && (url === '/v1/models' || url === '/v1/models/')) {
      try {
        const models = await this.adapter.listModels('opencode-local')
        return send(200, { object: 'list', data: models.map((m) => ({ id: m.id, object: 'model', owned_by: 'opencode-local' })) })
      } catch (err) {
        return send(500, { error: { message: err instanceof Error ? err.message : String(err), type: 'server_error' } })
      }
    }
    if (req.method === 'POST' && (url === '/v1/chat/completions' || url === '/v1/chat/completions/')) {
      let body: OaiRequest
      try { body = JSON.parse(await this.readBody(req)) as OaiRequest } catch { return send(400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } }) }
      const options = toOptions(body)
      if (!options.model) return send(400, { error: { message: 'model is required', type: 'invalid_request_error' } })
      const id = 'chatcmpl-' + Date.now().toString(36)
      const created = Math.floor(Date.now() / 1000)
      if (body.stream === true) {
        res.statusCode = 200
        res.setHeader('content-type', 'text/event-stream')
        res.setHeader('cache-control', 'no-cache')
        res.setHeader('connection', 'keep-alive')
        const write = (obj: unknown): void => { res.write('data: ' + JSON.stringify(obj) + '\n\n') }
        write({ id, object: 'chat.completion.chunk', created, model: options.model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
        try {
          for await (const chunk of this.adapter.stream(options)) {
            if (chunk.type === 'text-delta' && chunk.text.length > 0) {
              write({ id, object: 'chat.completion.chunk', created, model: options.model, choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }] })
            } else if (chunk.type === 'finish') {
              const fr = chunk.reason.kind === 'max-tokens' ? 'length' : 'stop'
              write({ id, object: 'chat.completion.chunk', created, model: options.model, choices: [{ index: 0, delta: {}, finish_reason: fr }] })
            }
          }
          res.write('data: [DONE]\n\n')
          res.end()
        } catch (err) {
          write({ id, object: 'chat.completion.chunk', created, model: options.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], error: { message: err instanceof Error ? err.message : String(err) } })
          res.write('data: [DONE]\n\n')
          res.end()
        }
        return
      }
      let text = ''
      let usage = { inputTokens: 0, outputTokens: 0 }
      try {
        for await (const chunk of this.adapter.stream(options)) {
          if (chunk.type === 'text-delta') text += chunk.text
          else if (chunk.type === 'usage') usage = { inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens }
        }
      } catch (err) {
        return send(500, { error: { message: err instanceof Error ? err.message : String(err), type: 'server_error' } })
      }
      return send(200, {
        id,
        object: 'chat.completion',
        created,
        model: options.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.inputTokens + usage.outputTokens },
      })
    }
    send(404, { error: { message: 'not found', type: 'invalid_request_error' } })
  }
}