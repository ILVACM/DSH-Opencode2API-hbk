import { check, collectStream, firstModel, record, spend } from './lib.mjs'
import { classifyFailure } from '../../plugin/src/adapter/translate.ts'
import { flattenCompaction, flattenHistory } from '../../plugin/src/adapter/flatten.ts'

const THROTTLE_402 = '{"code":"too_many_requests","message":"AppId:**7f4z Usage limit reached.","type":"rate_limit_error"}'

function msg(role, text) {
  return { role, content: [{ type: 'text', text }] }
}

export async function run(runtime) {
  // C1 — provider failure classification.
  check('h6 402 throttle -> RATE_LIMIT',
    classifyFailure({ status: 402, message: THROTTLE_402, type: 'provider.quota' }).code === 'RATE_LIMIT',
    classifyFailure({ status: 402, message: THROTTLE_402, type: 'provider.quota' }).code)
  check('h6 429 -> RATE_LIMIT',
    classifyFailure({ status: 429, message: 'slow down', type: 'provider.rate-limit' }).code === 'RATE_LIMIT', 'not 429')
  check('h6 free-limit untouched',
    classifyFailure({ message: 'Free usage limit reached. Connect a provider or subscribe to OpenCode Go.', type: 'provider.free-limit' }).code === 'provider.free-limit',
    'genuine exhaustion was reclassified')
  check('h6 invalid-request untouched',
    classifyFailure({ message: 'bad request', type: 'provider.invalid-request' }).code === 'provider.invalid-request', 'not invalid-request')
  check('h6 message preserved',
    classifyFailure({ status: 402, message: THROTTLE_402, type: 'provider.quota' }).message === THROTTLE_402, 'message rewritten')
  const empty = classifyFailure(undefined)
  check('h6 undefined default',
    empty.code === 'UPSTREAM' && empty.message === 'session execution failed', JSON.stringify(empty))

  // A2 — compaction prompt form vs chat prompt form.
  const options = {
    provider: 'opencode-local',
    model: 'm',
    system: 'SYS',
    purpose: 'compaction',
    messages: [msg('user', 'first'), msg('assistant', 'second'), msg('user', 'COMPACT INSTRUCTION')],
  }
  const compact = flattenCompaction(options)
  const chat = flattenHistory(options, false)
  const chatTools = flattenHistory(options, true)
  for (const token of ['[System Instructions]', '[Conversation History]', '[Current User Message]', 'You have no tools', 'You may use the available tools']) {
    check('h6 compact drops framing: ' + token, !compact.includes(token), 'framing leaked: ' + token)
  }
  for (const token of ['[System Instructions]', '[Conversation History]', '[Current User Message]', 'You have no tools']) {
    check('h6 chat keeps framing: ' + token, chat.includes(token), 'framing lost in history path: ' + token)
  }
  check('h6 chat tools tail', chatTools.includes('You may use the available tools'), 'tools-enabled tail lost')
  for (const token of ['SYS', '[user]: first', '[assistant]: second', 'COMPACT INSTRUCTION']) {
    check('h6 compact keeps content: ' + token, compact.includes(token), 'content lost: ' + token)
  }
  let threw = false
  try { flattenCompaction({ provider: 'p', model: 'm', messages: [msg('assistant', 'only')] }) } catch { threw = true }
  check('h6 compact rejects missing user message', threw, 'no throw on missing user message')

  // A3 + C2 — compaction через adapter: no tools approved, compact- title, build agent.
  const model = firstModel(runtime)
  check('h6 model', model.length > 0, 'no selectable model')
  runtime.policy.mode = 'allowlist'
  runtime.policy.allow = ['*']
  runtime.policy.allowAll = true
  runtime.policy.maxPerTurn = 1
  const approvedBefore = runtime.adapter.diagnostics.toolApproved
  const rejectedBefore = runtime.adapter.diagnostics.permissionRejected
  spend()
  const result = await collectStream(runtime.adapter.stream({
    provider: 'opencode-local',
    model,
    purpose: 'compaction',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Summarize the conversation above into a checkpoint.' }] }],
  }))
  check('h6 finish', result.finish !== null, 'no finish')
  check('h6 finish not transport', result.finish?.failure?.code !== 'TRANSPORT', JSON.stringify(result.finish))
  check('h6 no tool-call blocks', result.toolBlocks === 0, String(result.toolBlocks))
  check('h6 tool never approved', runtime.adapter.diagnostics.toolApproved - approvedBefore === 0, 'a tool was approved')
  const sid = runtime.adapter.diagnostics.sessions[runtime.adapter.diagnostics.sessions.length - 1]
  const ep = await runtime.manager.ensureReady()
  const { serveRequest } = await import('../../plugin/src/serve/client.ts')
  const sres = await serveRequest(ep, 'GET', '/api/session/' + sid)
  const session = sres.json?.data ?? {}
  check('h6 agent build', session.agent === 'build', JSON.stringify({ agent: session.agent }))
  check('h6 compact title', typeof session.title === 'string' && session.title.includes('compact-'), JSON.stringify({ title: session.title }))
  record('h6-compaction', {
    model,
    finish: result.finish,
    rejected: runtime.adapter.diagnostics.permissionRejected - rejectedBefore,
    agent: session.agent,
    title: session.title,
    textHead: result.text.slice(0, 160),
  })
  return 'ok'
}
