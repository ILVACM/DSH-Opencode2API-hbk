import { check, collectStream, firstModel, record, spend } from './lib.mjs'

export async function run(runtime) {
  runtime.policy.mode = 'allowlist'
  runtime.policy.allow = ['shell']
  runtime.policy.allowAll = false
  runtime.policy.maxPerTurn = 20
  const model = firstModel(runtime)
  check('h2 model', model.length > 0, 'no selectable model')
  spend()
  const r = await collectStream(runtime.adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the shell tool to run: echo p2-impl. Then report the output.' }] }],
  }))
  check('h2 finish', r.finish !== null, 'no finish')
  check('h2 no tool-call blocks', r.toolBlocks === 0, String(r.toolBlocks))
  const approved = runtime.adapter.diagnostics.toolApproved
  const branch = approved > 0 ? 'tool-approved' : 'no-tool'
  if (branch === 'tool-approved') {
    const reasoningText = r.chunks.filter((c) => c.type === 'block-end' && c.block.type === 'reasoning').map((c) => c.block.text).join('')
    check('h2 tool activity as reasoning', reasoningText.includes('[工具]'), 'tool note not in reasoning blocks')
  }
  record('h2-tools', { model, branch, approved, finish: r.finish, textHead: r.text.slice(0, 160), diag: runtime.adapter.diagnostics })
  return branch
}