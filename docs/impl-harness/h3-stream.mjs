import { check, collectStream, firstModel, record, spend } from './lib.mjs'

export async function run(runtime) {
  runtime.policy.mode = 'off'
  runtime.policy.allow = []
  const model = firstModel(runtime)
  spend()
  const r = await collectStream(runtime.adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: ok' }] }],
  }))
  check('h3 finish stop', r.finish !== null && r.finish.kind === 'stop', JSON.stringify(r.finish))
  check('h3 text present', r.text.trim().length > 0, r.text.slice(0, 80))
  check('h3 ends with finish', r.endsWithFinish, 'no trailing finish')
  record('h3-stream', { model, finish: r.finish, usage: r.usage, text: r.text.slice(0, 80) })
}