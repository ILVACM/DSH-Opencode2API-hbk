import fs from 'node:fs'
import path from 'node:path'
import { RAW, makeRuntime } from './lib.mjs'
import * as h1 from './h1-free-filter.mjs'
import * as h2 from './h2-tools.mjs'
import * as h3 from './h3-stream.mjs'
import * as h4 from './h4-api.mjs'

const summary = { startedAt: new Date().toISOString(), results: {}, failed: [] }
const runtime = makeRuntime()
try {
  for (const [name, mod] of [['h1', h1], ['h2', h2], ['h3', h3], ['h4', h4]]) {
    try {
      const out = await mod.run(runtime)
      summary.results[name] = { ok: true, out: out === undefined ? null : String(out) }
    } catch (e) {
      summary.results[name] = { ok: false, error: String(e?.message ?? e) }
      summary.failed.push(name)
      break
    }
  }
} finally {
  try { await runtime.manager.dispose() } catch { /* ignore */ }
}
summary.finishedAt = new Date().toISOString()
summary.allPassed = summary.failed.length === 0
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(path.join(RAW, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('RUN-ALL', JSON.stringify(summary))
if (!summary.allPassed) process.exitCode = 1