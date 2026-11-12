import type { HarnessChunk, ServeEvent } from '../types.ts'

export const TERMINAL_EVENT_TYPES = new Set([
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
])

type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 }

function usageOf(evt: ServeEvent): Usage {
  const t = evt.data?.tokens
  const input = typeof t?.input === 'number' ? t.input : 0
  const output = typeof t?.output === 'number' ? t.output : 0
  const cacheRead = typeof t?.cache?.read === 'number' ? t.cache.read : 0
  const cacheWrite = typeof t?.cache?.write === 'number' ? t.cache.write : 0
  return {
    inputTokens: input,
    outputTokens: output,
    ...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite > 0 ? { cacheWriteTokens: cacheWrite } : {}),
  }
}

function summarizeInput(input: unknown): string {
  if (input === undefined || input === null) return ''
  try {
    const s = JSON.stringify(input)
    return s.length > 140 ? s.slice(0, 140) + '…' : s
  } catch {
    return ''
  }
}

export async function* translateEvents(events: AsyncIterable<ServeEvent>, sessionID: string): AsyncGenerator<HarnessChunk> {
  let nextIndex = 0
  const textIndex = new Map<number, number>()
  const reasoningIndex = new Map<number, number>()
  const toolNames = new Map<string, string>()
  let sawText = false
  let heldUsage: Usage | null = null

  function* note(label: string): Generator<HarnessChunk> {
    const i = nextIndex++
    yield { type: 'block-start', index: i, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index: i, text: label }
    yield { type: 'block-end', index: i, block: { type: 'reasoning', text: label } }
  }

  for await (const evt of events) {
    if (evt.data?.sessionID !== undefined && evt.data.sessionID !== sessionID) continue
    const d = evt.data
    switch (evt.type) {
      case 'session.text.started': {
        const i = nextIndex++
        textIndex.set(d?.ordinal ?? 0, i)
        yield { type: 'block-start', index: i, blockType: 'text' }
        break
      }
      case 'session.text.delta': {
        const i = textIndex.get(d?.ordinal ?? 0)
        if (i !== undefined && typeof d?.delta === 'string' && d.delta.length > 0) {
          yield { type: 'text-delta', index: i, text: d.delta }
        }
        break
      }
      case 'session.text.ended': {
        const i = textIndex.get(d?.ordinal ?? 0)
        if (i !== undefined) {
          sawText = true
          yield { type: 'block-end', index: i, block: { type: 'text', text: typeof d?.text === 'string' ? d.text : '' } }
        }
        break
      }
      case 'session.reasoning.started': {
        const i = nextIndex++
        reasoningIndex.set(d?.ordinal ?? 0, i)
        yield { type: 'block-start', index: i, blockType: 'reasoning' }
        break
      }
      case 'session.reasoning.delta': {
        const i = reasoningIndex.get(d?.ordinal ?? 0)
        if (i !== undefined && typeof d?.delta === 'string' && d.delta.length > 0) {
          yield { type: 'reasoning-delta', index: i, text: d.delta }
        }
        break
      }
      case 'session.reasoning.ended': {
        const i = reasoningIndex.get(d?.ordinal ?? 0)
        if (i !== undefined) {
          yield { type: 'block-end', index: i, block: { type: 'reasoning', text: typeof d?.text === 'string' ? d.text : '' } }
        }
        break
      }
      case 'session.tool.input.started': {
        if (typeof d?.id === 'string' && typeof d?.name === 'string') toolNames.set(d.id, d.name)
        break
      }
      case 'session.tool.called': {
        const id = typeof d?.id === 'string' ? d.id : ''
        const name = toolNames.get(id) ?? 'tool'
        yield* note(`\n[工具] ${name} ${summarizeInput(d?.input)}\n`)
        break
      }
      case 'session.tool.success': {
        const content = Array.isArray(d?.content) ? d.content.map((c) => (typeof c?.text === 'string' ? c.text : '')).filter(Boolean).join(' ') : ''
        yield* note(`[完成] ${content}\n`)
        break
      }
      case 'session.tool.failed': {
        const msg = typeof d?.error === 'object' && d?.error !== null && typeof (d.error as { message?: unknown }).message === 'string'
          ? (d.error as { message: string }).message
          : 'tool failed'
        yield* note(`[失败] ${msg}\n`)
        break
      }
      case 'session.usage.updated': {
        heldUsage = usageOf(evt)
        break
      }
      case 'session.execution.succeeded': {
        yield { type: 'usage', usage: heldUsage ?? ZERO_USAGE }
        if (sawText) yield { type: 'finish', reason: { kind: 'stop' } }
        else yield { type: 'finish', reason: { kind: 'error', failure: { message: `session "${sessionID}" completed without any text output`, code: 'EMPTY_RESPONSE' } } }
        return
      }
      case 'session.execution.failed': {
        const err = d?.error
        yield { type: 'usage', usage: heldUsage ?? ZERO_USAGE }
        yield {
          type: 'finish',
          reason: {
            kind: 'error',
            failure: {
              message: typeof err?.message === 'string' && err.message.length > 0 ? err.message : 'session execution failed',
              code: typeof err?.type === 'string' && err.type.length > 0 ? err.type : 'UPSTREAM',
            },
          },
        }
        return
      }
      case 'session.execution.interrupted': {
        yield { type: 'usage', usage: heldUsage ?? ZERO_USAGE }
        yield { type: 'finish', reason: { kind: 'aborted', failure: { message: `turn interrupted (${typeof d?.reason === 'string' ? d.reason : 'unknown'})`, code: 'ABORTED' } } }
        return
      }
      default:
        break
    }
  }
  throw new Error('serve event stream ended without a terminal execution event')
}