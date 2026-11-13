import net from 'node:net'
import type { ModelRef, ServeEndpoint, ServeEvent, ServeModelInfo, ServeResponse } from '../types.ts'

export const ASK_ALL = [{ action: '*', resource: '*', effect: 'ask' }]
export const SSE_CONNECT_TIMEOUT_MS = 15000

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function authHeader(ep: ServeEndpoint): string {
  return 'Basic ' + Buffer.from('opencode:' + ep.password).toString('base64')
}

export async function serveRequest(ep: ServeEndpoint, method: string, path: string, body?: unknown, auth = true): Promise<ServeResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = authHeader(ep)
  const res = await fetch(ep.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, json, text }
}

export async function findFreePort(base: number, scan: number): Promise<number> {
  for (let p = base; p < base + scan; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createServer()
      s.once('error', () => resolve(false))
      s.listen(p, '127.0.0.1', () => s.close(() => resolve(true)))
    })
    if (ok) return p
  }
  throw new Error(`no free port in ${base}..${base + scan - 1}`)
}

export async function waitReady(ep: ServeEndpoint, timeoutMs: number, pollMs: number): Promise<{ version: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await serveRequest(ep, 'GET', '/api/info')
      if (r.status === 200) {
        const version = (r.json as { version?: string } | undefined)?.version
        return { version: typeof version === 'string' ? version : '' }
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return null
}

export interface SSEHandle {
  connected: Promise<void>
  close(): void
}

export function openSSE(ep: ServeEndpoint, onEvent: (e: ServeEvent) => void): SSEHandle {
  const ctrl = new AbortController()
  let buf = ''
  let settled = false
  const connected = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('SSE connect timeout')) } }, SSE_CONNECT_TIMEOUT_MS)
    void (async () => {
      try {
        const res = await fetch(ep.url + '/api/event', {
          headers: { authorization: authHeader(ep), accept: 'text/event-stream' },
          signal: ctrl.signal,
        })
        if (res.status !== 200 || !res.body) throw new Error('SSE status ' + res.status)
        for await (const chunk of res.body) {
          buf += Buffer.from(chunk).toString('utf8')
          let idx: number
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const line = frame.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            let evt: ServeEvent
            try { evt = JSON.parse(line.slice(5).trim()) as ServeEvent } catch { continue }
            if (evt.type === 'server.connected' && !settled) { settled = true; clearTimeout(timer); resolve() }
            try { onEvent(evt) } catch { /* diagnostics must never break the pump */ }
          }
        }
      } catch (err) {
        if (!settled) { settled = true; clearTimeout(timer); reject(err) }
      }
    })()
  })
  return { connected, close: () => ctrl.abort() }
}

export function toModelRef(m: ServeModelInfo): ModelRef {
  if (typeof m.id === 'string' && m.id.includes('/')) {
    const i = m.id.indexOf('/')
    return { providerID: m.id.slice(0, i), id: m.id.slice(i + 1) }
  }
  return { id: m.modelID ?? m.id, providerID: m.providerID }
}

export async function listModels(ep: ServeEndpoint): Promise<ServeModelInfo[]> {
  const r = await serveRequest(ep, 'GET', '/api/model')
  const data = (r.json as { data?: ServeModelInfo[] } | undefined)?.data
  return Array.isArray(data) ? data : []
}

export async function getDefaultModel(ep: ServeEndpoint): Promise<ServeModelInfo | null> {
  const r = await serveRequest(ep, 'GET', '/api/model/default')
  const data = (r.json as { data?: ServeModelInfo } | undefined)?.data
  return data ?? null
}

export async function createSession(ep: ServeEndpoint, title: string, modelRef: ModelRef, agent = 'build'): Promise<string> {
  const r = await serveRequest(ep, 'POST', '/api/session', { title, agent, model: modelRef, permissions: ASK_ALL })
  const id = (r.json as { data?: { id?: string } } | undefined)?.data?.id
  if (r.status !== 200 || typeof id !== 'string' || id.length === 0) {
    throw new Error(`createSession failed: ${r.status} ${r.text.slice(0, 300)}`)
  }
  return id
}

export async function prompt(ep: ServeEndpoint, sessionID: string, text: string): Promise<void> {
  const r = await serveRequest(ep, 'POST', `/api/session/${sessionID}/prompt`, { text })
  if (r.status !== 200) throw new Error(`prompt failed: ${r.status} ${r.text.slice(0, 300)}`)
}

export async function replyDecision(ep: ServeEndpoint, sessionID: string, requestID: string, decision: 'once' | 'always' | 'reject', message: string): Promise<ServeResponse> {
  return serveRequest(ep, 'POST', `/api/session/${sessionID}/permission/${requestID}/reply`, { decision, message })
}

export async function interruptSession(ep: ServeEndpoint, sessionID: string): Promise<void> {
  await serveRequest(ep, 'POST', `/api/session/${sessionID}/interrupt`).catch(() => {})
}

export async function deleteSession(ep: ServeEndpoint, sessionID: string): Promise<boolean> {
  try {
    const r = await serveRequest(ep, 'DELETE', `/api/session/${sessionID}`)
    return r.status === 204 || r.status === 200
  } catch {
    return false
  }
}

export async function listSessions(ep: ServeEndpoint): Promise<Array<{ id?: string; title?: string }>> {
  const r = await serveRequest(ep, 'GET', '/api/session')
  const data = (r.json as { data?: Array<{ id?: string; title?: string }> } | undefined)?.data
  return Array.isArray(data) ? data : []
}
