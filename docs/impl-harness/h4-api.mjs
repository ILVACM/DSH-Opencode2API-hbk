import { check, firstModel, record, spend } from './lib.mjs'
import { ApiServer } from '../../plugin/src/api/server.ts'

export async function run(runtime) {
  runtime.policy.mode = 'off'
  runtime.policy.allow = []
  const model = firstModel(runtime)
  check('h4 model', model.length > 0, 'no selectable model')
  const api = new ApiServer({ enabled: true, host: '127.0.0.1', port: 0, token: 'test-token' }, runtime.adapter)
  let port = 0
  try {
    const started = await api.start()
    port = started.port
    const base = `http://127.0.0.1:${port}`
    const auth = { authorization: 'Bearer test-token' }
    const mres = await fetch(base + '/v1/models', { headers: auth })
    const mjson = await mres.json()
    check('h4 models list', mres.status === 200 && Array.isArray(mjson.data) && mjson.data.length > 0, JSON.stringify(mjson).slice(0, 200))
    const unauth = await fetch(base + '/v1/models')
    check('h4 auth enforced', unauth.status === 401, String(unauth.status))
    spend()
    const cres = await fetch(base + '/v1/chat/completions', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: ok' }] }),
    })
    const cjson = await cres.json()
    check('h4 chat nonstream', cres.status === 200 && typeof cjson.choices?.[0]?.message?.content === 'string' && cjson.choices[0].message.content.length > 0, JSON.stringify(cjson).slice(0, 200))
    spend()
    const sres = await fetch(base + '/v1/chat/completions', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: 'Reply with exactly: ok' }] }),
    })
    const stext = await sres.text()
    check('h4 chat stream', sres.status === 200 && stext.includes('data:') && stext.includes('[DONE]'), stext.slice(0, 200))
    record('h4-api', { model, port, models: mjson.data.length, chatText: cjson.choices?.[0]?.message?.content, streamOk: true })
  } finally {
    await api.stop()
  }
}