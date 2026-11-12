import { createSession, interruptSession, openSSE, prompt, replyDecision } from '../serve/client.ts'
import { flattenHistory } from './flatten.ts'
import { TERMINAL_EVENT_TYPES, translateEvents } from './translate.ts'
import type {
  AdapterDiagnostics,
  HarnessChunk,
  HarnessGenerateOptions,
  ModelRef,
  ServeEndpoint,
  ServeEvent,
  ToolPolicy,
} from '../types.ts'

export const TURN_WATCHDOG_POLL_MS = 200
const REJECT_MESSAGE = 'tools are disabled or not allowed in this channel; reply in plain text'
const APPROVE_MESSAGE = 'approved by deepseek harness'

export interface TurnConfig {
  titlePrefix: string
  firstEventMs: number
  idleMs: number
  toolPolicy: () => ToolPolicy
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function* runTurn(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  const text = flattenHistory(options, cfg.toolPolicy().mode === 'allowlist')
  const title = `${cfg.titlePrefix}${options.model}-${Date.now().toString(36)}`
  const queue: ServeEvent[] = []
  let notify: (() => void) | null = null
  let closed = false
  let sessionID = ''
  const sse = openSSE(ep, (e) => {
    if (e.data?.sessionID !== undefined && e.data.sessionID !== sessionID) return
    queue.push(e)
    const n = notify
    notify = null
    n?.()
  })
  const closeSSE = () => {
    if (!closed) {
      closed = true
      sse.close()
    }
  }
  const onAbortCatch = () => { void interruptSession(ep, sessionID) }
  if (options.signal) {
    if (options.signal.aborted) onAbortCatch()
    else options.signal.addEventListener('abort', onAbortCatch, { once: true })
  }
  try {
    sessionID = await createSession(ep, title, modelRef)
    diag.sessions.push(sessionID)
    await sse.connected
    await prompt(ep, sessionID, text)
    const asked = new Set<string>()
    let approved = 0
    async function* pump(): AsyncGenerator<ServeEvent> {
      let lastEventAt = Date.now()
      let sawAny = false
      while (true) {
        if (queue.length > 0) {
          const e = queue.shift()!
          lastEventAt = Date.now()
          sawAny = true
          if (e.type === 'permission.asked' && e.data && typeof e.data.id === 'string') {
            const requestID = e.data.id
            if (!asked.has(requestID)) {
              asked.add(requestID)
              diag.permissionAsked += 1
              const policy = cfg.toolPolicy()
              const action = typeof e.data.action === 'string' ? e.data.action : ''
              const allowed = policy.mode === 'allowlist'
                && (policy.allow.includes('*') || policy.allow.includes(action))
                && approved < policy.maxPerTurn
              const r = await replyDecision(ep, sessionID, requestID, allowed ? 'once' : 'reject', allowed ? APPROVE_MESSAGE : REJECT_MESSAGE)
              if (r.status === 204 || r.status === 200) {
                if (allowed) { approved += 1; diag.toolApproved += 1 } else { diag.permissionRejected += 1 }
              }
            }
          }
          if (e.type.startsWith('session.tool.')) diag.toolEvents += 1
          yield e
          if (TERMINAL_EVENT_TYPES.has(e.type)) return
          continue
        }
        if (closed) throw new Error('serve SSE closed before a terminal execution event')
        const window = sawAny ? cfg.idleMs : cfg.firstEventMs
        if (Date.now() - lastEventAt > window) {
          throw new Error(sawAny ? `serve stream idle for over ${window}ms` : `no first serve event within ${cfg.firstEventMs}ms`)
        }
        await sleep(TURN_WATCHDOG_POLL_MS)
      }
    }
    yield* translateEvents(pump(), sessionID)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    yield { type: 'finish', reason: { kind: 'error', failure: { message, code: 'TRANSPORT' } } }
  } finally {
    closeSSE()
    options.signal?.removeEventListener('abort', onAbortCatch)
  }
}