import { check, collectStream, firstModel, record, spend } from './lib.mjs'
import { liveToolPolicy } from '../../plugin/src/config.ts'
import { TOOL_ACTIONS } from '../../plugin/src/client/status-paths.ts'
import { serveRequest } from '../../plugin/src/serve/client.ts'

export async function run(runtime) {
  check('h5 allowAll on+star', liveToolPolicy({ toolMode: true, toolAllowlist: ['*'] }).allowAll === true, 'allowAll not derived')
  check('h5 allowAll master-off', liveToolPolicy({ toolMode: false, toolAllowlist: ['*'] }).allowAll === false, 'allowAll leaked with master off')
  check('h5 allowAll no-star', liveToolPolicy({ toolMode: true, toolAllowlist: ['shell'] }).allowAll === false, 'allowAll without star')
  check('h5 allowAll empty', liveToolPolicy({}).allowAll === false, 'allowAll on empty config')
  check('h5 external_directory listed', TOOL_ACTIONS.includes('external_directory'), 'action missing from UI list')
  runtime.policy.mode = 'allowlist'
  runtime.policy.allow = ['*']
  runtime.policy.allowAll = true
  runtime.policy.maxPerTurn = 1
  const model = firstModel(runtime)
  check('h5 model', model.length > 0, 'no selectable model')
  const approvedBefore = runtime.adapter.diagnostics.toolApproved
  const rejectedBefore = runtime.adapter.diagnostics.permissionRejected
  spend()
  const r = await collectStream(runtime.adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the shell tool to run: echo h5-a. Then use the shell tool a second time to run: echo h5-b. Then report both outputs.' }] }],
  }))
  check('h5 finish', r.finish !== null, 'no finish')
  check('h5 no tool-call blocks', r.toolBlocks === 0, String(r.toolBlocks))
  const approved = runtime.adapter.diagnostics.toolApproved - approvedBefore
  const rejected = runtime.adapter.diagnostics.permissionRejected - rejectedBefore
  check('h5 zero rejections', rejected === 0, String(rejected))
  const branch = approved >= 2 ? 'cap-bypassed' : approved === 1 ? 'single-tool' : 'no-tool'
  const sid = runtime.adapter.diagnostics.sessions[runtime.adapter.diagnostics.sessions.length - 1]
  const ep = await runtime.manager.ensureReady()
  const sres = await serveRequest(ep, 'GET', '/api/session/' + sid)
  const agent = sres.json?.data?.agent
  check('h5 pinned agent build', sres.status === 200 && agent === 'build', JSON.stringify({ status: sres.status, agent }))
  record('h5-allow-all', { model, branch, approved, rejected, maxPerTurn: 1, agent, finish: r.finish, textHead: r.text.slice(0, 160), diag: runtime.adapter.diagnostics })
  return branch
}
