import { createSession, interruptSession, openSSE, prompt, replyDecision } from '../serve/client.ts'
import { flattenCompaction, flattenHistory } from './flatten.ts'
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
export const COMPACT_MAX_ATTEMPTS = 3
export const COMPACT_RETRY_BASE_MS = 2000
export const COMPACT_RETRY_MAX_MS = 8000
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

/**
 * Run one compaction request with a bounded retry wrapped around whole turns.
 * @param ep - serve endpoint.
 * @param cfg - turn configuration.
 * @param options - the compaction request.
 * @param modelRef - resolved opencode model.
 * @param diag - shared diagnostics.
 */
export async function* runCompactTurn(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  for (let attempt = 1; attempt <= COMPACT_MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted === true) return
    let retryable = false
    for await (const chunk of runTurnOnce(ep, cfg, options, modelRef, diag)) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        const code = chunk.reason.failure.code
        const transient = code === 'RATE_LIMIT' || code === 'TRANSPORT' || code === 'EMPTY_RESPONSE'
        if (transient && attempt < COMPACT_MAX_ATTEMPTS) { retryable = true; break }
      }
      yield chunk
    }
    if (!retryable) return
    const delay = Math.min(COMPACT_RETRY_BASE_MS * 2 ** (attempt - 1), COMPACT_RETRY_MAX_MS)
    await sleep(delay)
  }
}

/**
 * Drive one opencode turn; compaction requests use the compact prompt form and
 * never approve tools.
 * @param ep - serve endpoint.
 * @param cfg - turn configuration.
 * @param options - the request.
 * @param modelRef - resolved opencode model.
 * @param diag - shared diagnostics.
 */
export async function* runTurn(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  if (options.purpose === 'compaction') {
    yield* runCompactTurn(ep, cfg, options, modelRef, diag)
    return
  }
  yield* runTurnOnce(ep, cfg, options, modelRef, diag)
}

/**
 * Perform exactly one turn: create the session, stream events, translate chunks.
 * @param ep - serve endpoint.
 * @param cfg - turn configuration.
 * @param options - the request.
 * @param modelRef - resolved opencode model.
 * @param diag - shared diagnostics.
 */
async function* runTurnOnce(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  const isCompaction = options.purpose === 'compaction'
  const text = isCompaction ? flattenCompaction(options) : flattenHistory(options, cfg.toolPolicy().mode === 'allowlist')
  const title = `${cfg.titlePrefix}${isCompaction ? 'compact-' : ''}${options.model}-${Date.now().toString(36)}`
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
              const allowed = !isCompaction && (policy.allowAll
                || (policy.mode === 'allowlist'
                  && (policy.allow.includes('*') || policy.allow.includes(action))
                  && approved < policy.maxPerTurn))
              const r = await replyDecision(ep, sessionID, requestID, allowed ? 'once' : 'reject', allowed ? APPROVE_MESSAGE : REJECT_MESSAGE)
              if (r.status === 204 || r.status === 200) {
                if (allowed) {
                  if (!policy.allowAll) approved += 1
                  diag.toolApproved += 1
                } else { diag.permissionRejected += 1 }
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
