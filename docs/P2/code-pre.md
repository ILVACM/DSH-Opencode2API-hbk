# 阶段 2 · 前置探针施工图（code-pre）

> 性质：**确定性执行方案**。任何模型 / agent 软件逐字遵循本文件，必得到相同的探针代码、相同的执行动作与相同的定案记录。
> 状态：待人工审核。**审核通过前禁止执行本文件任何动作。**
> 上游：`temp/P2/phase-2-pre.md`（U1–U10 待确认项）。事实核对见文末附录。
> 更正：phase-2-pre 中"探测 maxTokens=1"不成立——serve prompt API **无 maxTokens 字段**（P0 已证）；探测最小化靠极小 prompt（输出自然极小），本施工图据此实现。

## 0. 硬约束与预算

1. 新建文件仅两处：`temp/P2/probe/`（A 组脚本）+ `temp/P2/raw/`（A 组记录）+ `temp/P2/gui-spike/`（B 组一次性插件）。**不改 `plugin/` 正式代码**、不改三份参考源码。
2. A 组探针纯 Node（≥22.18，本机 v24.21）ESM，**复用 `plugin/src/serve/client.ts` 与 manager.ts**（import 源码，Node type-stripping 直跑），零额外依赖。
3. **A 组对话预算硬上限 10**：A1=0（只读元数据）；A2≤2；A3≤2；余量留排障。脚本内置计数，超预算抛错。
4. 不读取/打印/复制用户凭据值；serve 探针密码由 manager 随机生成、仅进程内存。
5. serve 只绑 127.0.0.1；A 组验毕杀进程 + 清扫 `p2-probe-` 会话。
6. **脚本逐字节提取**：§4 每文件由 `<!-- BEGIN FILE: 路径 -->`/`<!-- END FILE -->` 包围，提取代码块内容逐字节落盘，禁改写。
7. B 组 spike 是一次性验证品，**允许在故障矩阵指引下迭代修改**（它不是正式代码）；验毕人工卸载。

## 1. 能力门与编排

### 1.1 能力门（执行者第一个动作）

检查是否有"派发独立子任务并等待完成"能力（Qoder Agent / Claude Code Task / 等效）：
- **有** → `mode=parallel`：派发提取子任务**并行落盘** A 组脚本（lib/a1/a2/a3/cleanup/run-all）与 B 组 spike；提取完成后主执行者**单进程**跑 `node probe/run-all.mjs`（a1→a2→a3→cleanup 串行，共享同一 serve 与预算，杜绝跨进程孤儿）。B 组构建后需人工安装观察。
- **无** → `mode=serial`：主执行者自行提取全部脚本，再单进程跑 run-all。
- 两模式探针执行**完全相同**（同一 run-all、同一 serve、同一预算），产出结论一致；mode 记入汇总。
- **并行价值在脚本提取与 B 组独立验证**；A 组探针刻意单进程串行（稳定优先，避免跨进程 serve 孤儿——这是自查修正的设计）。

### 1.2 编排图

```
能力门 → 并行提取脚本（A 组 6 文件 ∥ B 组 spike 9 文件）
   → 主执行者：node probe/run-all.mjs（单进程：a1→a2→a3→cleanup）
   → B 组：cd gui-spike && npm install && npm run build && npm pack
            → 人工 dsh plugin add → 重启 DSH → B1/B2/B3 观察 → 人工卸载
A、B 均完成 → 主执行者写 temp/P2/protocol-notes.md（U1–U10 定案）→ 总验收
```

### 1.3 停止门

- run-all 内 a2 ok 探测失败（鉴权/限流类）→ break 跳出循环，**仍执行 cleanup**，汇总报告（凭据/网络问题）。
- A 组撞风控 → 停该项不轰炸。
- B 组 spike 加载红横幅 → 按 §7 修 spike 重建（spike 可改）。

## 2. 共享契约

- A 组复用 plugin 的 `serve/client.ts`（serveRequest/openSSE/createSession/prompt/listModels/getDefaultModel/toModelRef/ASK_ALL）与 `serve/manager.ts`（ServeManager）。**replyPermission 在 plugin 里硬编码 reject，A 组需放行 once，故 probe/lib.mjs 自带 replyDecision**。
- 记录格式：JSON 快照（2 空格）+ JSONL 事件流；会话 title 前缀 `p2-probe-`。
- 免费判定启发式（A1 计算，结论待人工/agent 核定）：`cost` 数组非空且每项 `input/output/cache.read/cache.write` 全 0 ⇒ free；cost 空 ⇒ unknown。
- 工具动作名候选（A3 实测枚举，源码佐证）：`shell`（bash）、`read`、`edit`（write/patch 工具的权限动作）、`webfetch`、`websearch`、`skill`、`question`、`grep`、`glob`、`task`。**白名单按 permission.asked.action 过滤，不是工具名**。

## 3. 任务包

| 包 | 执行者 | 动作 | 产出 | 验收 |
| --- | --- | --- | --- | --- |
| 提取 A | 主/子（可并行） | 逐字节提取 §4 A 组 6 脚本（lib/a1/a2/a3/cleanup/run-all） | probe/*.mjs | 文件与 §4 一致 |
| 提取 B | 主/子（可并行） | 逐字节提取 §4 B 组 spike | gui-spike/* | 文件齐全 |
| A 执行 | 主 | `node probe/run-all.mjs`（单进程 a1→a2→a3→cleanup） | raw/*.json/jsonl + summary.json | a1 模型非空+free 集合；a2 ok succeeded；a3 单工具终态+动作名+onceExecutes；cleanup 拒连；summary.allPassed |
| B 构建 | 主 | `cd gui-spike && npm install && npm run build && npm pack` | gui-spike/*.tgz | build 成功；tgz 含 lib/index.js+lib/client.js |
| B1/B2/B3 | 人工 | 安装 spike→重启 DSH→观察卡片/路由/开关→卸载 | 人工记录 | 卡片可见无红横幅；ping 200；开关读写一致 |
| 汇总 | 主 | 写 protocol-notes.md（U1–U10） | protocol-notes.md | 逐项结论+证据+置信度 |

## 4. 内嵌代码（逐字节提取，禁止改写）

<!-- BEGIN FILE: temp/P2/probe/lib.mjs -->
```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { ServeManager } from '../../../plugin/src/serve/manager.ts'
import { serveRequest, openSSE, createSession, prompt } from '../../../plugin/src/serve/client.ts'

export const P2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const RAW = path.join(P2, 'raw')
export const BUDGET = { used: 0, cap: 10 }
export const C = { textOk: 'Reply with exactly: ok', titlePrefix: 'p2-probe-' }

let singleton = null
export function shared() {
  if (!singleton) {
    const manager = new ServeManager({
      opencodePath: '', portBase: 4096, dataDir: path.join(P2, 'data'),
      readyTimeoutMs: 60000, heartbeatMs: 5000, restartDelayMs: 1000, maxRestarts: 3,
    })
    singleton = { manager }
  }
  return singleton
}
export function record(name, data) {
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(path.join(RAW, name + '.json'), JSON.stringify(data, null, 2))
  console.log(name, JSON.stringify(data).slice(0, 600))
}
export function appendEvent(name, e) {
  fs.mkdirSync(RAW, { recursive: true })
  fs.appendFileSync(path.join(RAW, name + '.jsonl'), JSON.stringify(e) + '\n')
}
export function check(name, ok, detail) {
  if (!ok) throw new Error(`check failed: ${name} — ${detail}`)
}
export function spend() {
  BUDGET.used += 1
  check('budget', BUDGET.used <= BUDGET.cap, `prompts ${BUDGET.used} > cap ${BUDGET.cap}`)
}
export async function replyDecision(ep, sessionID, requestID, decision, message) {
  return serveRequest(ep, 'POST', `/api/session/${sessionID}/permission/${requestID}/reply`, { decision, message })
}
export async function probeTurn(ep, modelRef, text, opts = {}) {
  const sessionID = await createSession(ep, C.titlePrefix + Date.now().toString(36), modelRef)
  const events = []
  const asked = new Set()
  const sse = openSSE(ep, (e) => {
    if (e.data?.sessionID !== undefined && e.data.sessionID !== sessionID) return
    events.push(e)
    appendEvent(opts.log ?? 'events', e)
  })
  const result = { sessionID, terminal: null, error: null, text: '', asked: [], toolSuccess: 0, prompts: 1 }
  try {
    await sse.connected
    await prompt(ep, sessionID, text)
    const deadline = Date.now() + (opts.timeoutMs ?? 120000)
    let lastIdx = 0
    while (Date.now() < deadline && !result.terminal) {
      for (let i = lastIdx; i < events.length; i++) {
        const e = events[i]
        if (e.type === 'permission.asked' && e.data && typeof e.data.id === 'string' && !asked.has(e.data.id)) {
          asked.add(e.data.id)
          result.asked.push({ id: e.data.id, action: e.data.action, resources: e.data.resources })
          if (opts.decision) await replyDecision(ep, sessionID, e.data.id, opts.decision, opts.message ?? 'p2 probe')
        }
        if (e.type === 'session.tool.success') result.toolSuccess += 1
        if (e.type === 'session.text.delta' && typeof e.data?.delta === 'string') result.text += e.data.delta
        if (e.type === 'session.execution.succeeded') result.terminal = 'succeeded'
        if (e.type === 'session.execution.failed') { result.terminal = 'failed'; result.error = e.data?.error ?? null }
        if (e.type === 'session.execution.interrupted') result.terminal = 'interrupted'
      }
      lastIdx = events.length
      if (!result.terminal) await new Promise((r) => setTimeout(r, 200))
    }
    if (!result.terminal) result.timeout = true
  } finally {
    sse.close()
  }
  return result
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/probe/a1-models.mjs -->
```js
import { shared, record, check } from './lib.mjs'
import { listModels, getDefaultModel } from '../../../plugin/src/serve/client.ts'

export async function run() {
  const { manager } = shared()
  const ep = await manager.start()
  const all = await listModels(ep)
  const def = await getDefaultModel(ep)
  record('a1-models-raw', { count: all.length, default: def, models: all })
  const rows = all.map((m) => {
    const cost = Array.isArray(m.cost) ? m.cost : []
    const isFree = cost.length > 0 && cost.every((c) =>
      Number(c.input) === 0 && Number(c.output) === 0 && Number(c.cache?.read) === 0 && Number(c.cache?.write) === 0)
    return {
      id: m.id, providerID: m.providerID, name: m.name, status: m.status, enabled: m.enabled,
      contextWindow: m.limit?.context ?? null, maxOutput: m.limit?.output ?? null,
      inputModalities: m.capabilities?.input ?? null,
      costEntries: cost.length, costSample: cost[0] ?? null, isFree,
    }
  })
  const free = rows.filter((r) => r.isFree).map((r) => r.id)
  const unknown = rows.filter((r) => r.costEntries === 0).map((r) => r.id)
  const result = {
    total: rows.length, freeCount: free.length, freeModels: free, unknownCostModels: unknown,
    defaultModel: def?.id ?? null,
    fieldsPresent: { contextWindow: rows.some((r) => r.contextWindow !== null), inputModalities: rows.some((r) => r.inputModalities !== null) },
    rows,
  }
  record('a1-models-result', result)
  check('a1 models non-empty', rows.length > 0, 'local opencode serve exposes no models')
  return result
}

if (process.argv[1] && process.argv[1].endsWith('a1-models.mjs')) await run()
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/probe/a2-probe-design.mjs -->
```js
import { spend, check, probeTurn, record, shared, C } from './lib.mjs'
import { getDefaultModel, listModels, toModelRef } from '../../../plugin/src/serve/client.ts'

export async function run() {
  const { manager } = shared()
  const ep = await manager.start()
  const def = await getDefaultModel(ep)
  const all = await listModels(ep)
  const modelRef = def ? toModelRef(def) : toModelRef(all[0])
  spend()
  const ok = await probeTurn(ep, modelRef, C.textOk, { log: 'a2-ok' })
  const regionCandidate = all.find((m) => /muse-spark/i.test(m.id)) ?? null
  let region = null
  if (regionCandidate) {
    spend()
    region = await probeTurn(ep, toModelRef(regionCandidate), C.textOk, { log: 'a2-region' })
  }
  const result = {
    modelUsed: modelRef,
    ok: { terminal: ok.terminal, error: ok.error, text: ok.text.slice(0, 80) },
    regionCandidateFound: regionCandidate !== null,
    region: region ? { model: regionCandidate.id, terminal: region.terminal, error: region.error } : null,
    prompts: region ? 2 : 1,
  }
  record('a2-probe-result', result)
  check('a2 ok probe succeeded', ok.terminal === 'succeeded', JSON.stringify(ok.error))
  return result
}

if (process.argv[1] && process.argv[1].endsWith('a2-probe-design.mjs')) await run()
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/probe/a3-tools.mjs -->
```js
import path from 'node:path'
import fs from 'node:fs'
import { spend, check, probeTurn, record, shared, P2 } from './lib.mjs'
import { getDefaultModel, listModels, toModelRef } from '../../../plugin/src/serve/client.ts'

export async function run() {
  const { manager } = shared()
  const ep = await manager.start()
  const def = await getDefaultModel(ep)
  const all = await listModels(ep)
  const modelRef = def ? toModelRef(def) : toModelRef(all[0])
  spend()
  const single = await probeTurn(ep, modelRef,
    'Use the shell tool to run the command: echo p2-probe. Then tell me the output.',
    { decision: 'once', message: 'p2 probe approved', log: 'a3-single' })
  const target = path.join(P2, 'a3-probe-file.txt')
  spend()
  const multi = await probeTurn(ep, modelRef,
    `Create a file at ${target} containing the text hello-p2, then read it back and confirm the content.`,
    { decision: 'once', message: 'p2 probe approved', log: 'a3-multi', timeoutMs: 180000 })
  const fileWritten = fs.existsSync(target)
  let fileContent = null
  if (fileWritten) { try { fileContent = fs.readFileSync(target, 'utf8') } catch { fileContent = null } }
  try { fs.rmSync(target, { force: true }) } catch { /* ignore */ }
  const actions = [...new Set([...single.asked, ...multi.asked].map((a) => a.action).filter(Boolean))]
  const result = {
    modelUsed: modelRef,
    single: { terminal: single.terminal, asked: single.asked, toolSuccess: single.toolSuccess, error: single.error },
    multi: { terminal: multi.terminal, asked: multi.asked, toolSuccess: multi.toolSuccess, fileWritten, fileContent },
    actionsObserved: actions,
    onceExecutes: single.toolSuccess > 0,
    prompts: 2,
  }
  record('a3-tools-result', result)
  check('a3 single turn completed', single.terminal !== null, JSON.stringify(single))
  return result
}

if (process.argv[1] && process.argv[1].endsWith('a3-tools.mjs')) await run()
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/probe/cleanup.mjs -->
```js
import { shared, record } from './lib.mjs'
import { serveRequest, listSessions, deleteSession } from '../../../plugin/src/serve/client.ts'

const { manager } = shared()
const ep = manager.endpoint
let swept = 0
if (ep) {
  const sessions = await listSessions(ep)
  for (const s of sessions) {
    if (typeof s.id === 'string' && typeof s.title === 'string' && s.title.startsWith('p2-probe-')) {
      if (await deleteSession(ep, s.id)) swept += 1
    }
  }
}
await manager.dispose()
await new Promise((r) => setTimeout(r, 1500))
let refused = false
if (ep) { try { await serveRequest(ep, 'GET', '/api/info') } catch { refused = true } } else { refused = true }
record('cleanup', { swept, connectionRefused: refused })
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/probe/run-all.mjs -->
```js
import fs from 'node:fs'
import path from 'node:path'
import { RAW } from './lib.mjs'
import * as a1 from './a1-models.mjs'
import * as a2 from './a2-probe-design.mjs'
import * as a3 from './a3-tools.mjs'

const summary = { startedAt: new Date().toISOString(), results: {}, failed: [] }
for (const [name, mod] of [['a1', a1], ['a2', a2], ['a3', a3]]) {
  try {
    const out = await mod.run()
    summary.results[name] = { ok: true, out: JSON.stringify(out).slice(0, 400) }
  } catch (e) {
    summary.results[name] = { ok: false, error: String(e?.message ?? e) }
    summary.failed.push(name)
    break
  }
}
try { await import('./cleanup.mjs') } catch (e) { summary.cleanupError = String(e?.message ?? e) }
summary.finishedAt = new Date().toISOString()
summary.allPassed = summary.failed.length === 0
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(path.join(RAW, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('RUN-ALL', JSON.stringify(summary))
if (!summary.allPassed) process.exitCode = 1
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/package.json -->
```json
{
  "name": "opencode-local-probe",
  "version": "0.0.2",
  "description": "Throwaway GUI contract probe for opencode-local (phase 2 pre). Not shipped.",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "package.json"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-settings-plugins",
        "@deepseek-ai/dsh-client-locale"
      ],
      "platform": "web"
    }
  },
  "scripts": { "build": "tsdown" },
  "dependencies": { "@deepseek-ai/schemastery": "^3.18.4" },
  "devDependencies": {
    "react": "^18.3.1",
    "@types/react": "~18.3.31",
    "tsdown": "^0.22.2",
    "typescript": "^5.9.3",
    "@deepseek-ai/cordis": ">=4.0.2 <5.0.0",
    "@deepseek-ai/dsh-client-ui-settings": ">=0.1.7-rc.1 <0.3.0-0",
    "@deepseek-ai/dsh-client-ui-slots": ">=0.1.7-rc.1 <0.3.0-0",
    "@deepseek-ai/dsh-client-ui-settings-plugins": ">=0.1.7-rc.1 <0.3.0-0",
    "@deepseek-ai/dsh-client-locale": ">=0.1.7-rc.1 <0.3.0-0"
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/cordis.patch.yml -->
```yaml
- insert:
    - id: opencode-local-probe
      name: opencode-local-probe
      config: {}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/tsconfig.json -->
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "strict": false,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "jsx": "react"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/tsdown.config.ts -->
```ts
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'opencode-local-probe'
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-locale/client',
  '@deepseek-ai/dsh-client-ui-settings-plugins/client',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: true,
    deps: { neverBundle: ['@deepseek-ai/schemastery', '@deepseek-ai/cordis'] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib', format: ['cjs'], platform: 'browser', dts: false, clean: false,
    deps: { neverBundle: [...CLIENT_EXTERNALS] },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/src/index.ts -->
```ts
import Schema from '@deepseek-ai/schemastery'

export const name = 'opencode-local-probe'
export const inject = [] as const
export const Config = Schema.object({
  probeToggle: Schema.boolean().default(false).volatile(),
})

export function apply(ctx: any, config: any): void {
  const readToggle = (): boolean => {
    const v = config?.probeToggle
    return (v && typeof v.get === 'function' ? v.get() : v) === true
  }
  ctx.inject?.(['settings'], (sctx: any) => {
    const settings = sctx.settings ?? sctx.get?.('settings')
    if (settings?.configure) ctx.effect?.(() => settings.configure({ auto: true }, ctx.fiber))
  })
  ctx.inject?.(['webServer'], (webCtx: any) => {
    const ws = webCtx.webServer ?? webCtx.get?.('webServer')
    ws?.register?.({
      kind: 'exact',
      path: '/plugins/opencode-local-probe/ping',
      handler: (_req: any, res: any) => {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: true, host: 'windows-probe', version: '0.0.2', probeToggle: readToggle() }))
      },
    })
  })
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/src/client/locales.ts -->
```ts
export const zh = {
  'nav.panel': 'opencode-local 探针',
  'row.desc': '阶段 2 前置 GUI 契约探针（一次性，验毕卸载）。',
  'row.ping': '测试后台路由',
  'row.toggle': '配置开关 probeToggle',
  'row.toggleHint': '翻动后关闭重开卡片，应保持（验证配置读写）。',
}
export const en = {
  'nav.panel': 'opencode-local probe',
  'row.desc': 'Phase 2 pre GUI contract probe (throwaway, uninstall after).',
  'row.ping': 'Ping backend route',
  'row.toggle': 'Config toggle probeToggle',
  'row.toggleHint': 'Flip, close and reopen the card; it should persist.',
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/src/client/styles.ts -->
```ts
export const PROBE_CSS = `
.olp-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#202126);color:var(--dsw-alias-label-primary,#e6e6e6)}
.olp-card h3{margin:0;font-size:15px}
.olp-card p{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary,#999)}
.olp-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;padding:6px 14px;background:transparent;color:inherit;align-self:flex-start}
.olp-btn:disabled{opacity:.4;cursor:default}
.olp-pre{margin:0;padding:8px;font-size:12px;background:var(--dsw-alias-bg-layer-1,#17181b);border-radius:8px;white-space:pre-wrap;word-break:break-all}
.olp-toggle{display:flex;align-items:center;gap:8px;font-size:13px}
`
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/src/client/ProbeCard.tsx -->
```tsx
import { createElement as h, useState } from 'react'

export function ProbeCard(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const [ping, setPing] = useState('')
  const [busy, setBusy] = useState(false)
  const committed = scope?.getSnapshot?.().value
  const toggleValue = committed?.probeToggle === true
  const [localToggle, setLocalToggle] = useState<boolean | undefined>(undefined)
  const shown = localToggle ?? toggleValue
  const doPing = async () => {
    setBusy(true)
    try {
      const r = await fetch('/plugins/opencode-local-probe/ping', { credentials: 'same-origin' })
      setPing(JSON.stringify(await r.json()))
    } catch (e: any) { setPing('ERR ' + (e?.message ?? String(e))) }
    finally { setBusy(false) }
  }
  const flip = async (next: boolean) => {
    setLocalToggle(next)
    if (scope?.set) { try { await scope.set('probeToggle', next) } catch { /* observe via reopen */ } }
  }
  return h('div', { className: 'olp-card' },
    h('h3', null, t('nav.panel')),
    h('p', null, t('row.desc')),
    h('button', { className: 'olp-btn', onClick: doPing, disabled: busy }, t('row.ping')),
    h('pre', { className: 'olp-pre' }, ping),
    h('label', { className: 'olp-toggle' },
      h('input', { type: 'checkbox', checked: shown, onChange: (e: any) => flip(e.target.checked) }),
      t('row.toggle')),
    h('p', null, t('row.toggleHint')),
  )
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/gui-spike/src/client/index.tsx -->
```tsx
import { ProbeCard } from './ProbeCard.tsx'
import { zh, en } from './locales.ts'
import { PROBE_CSS } from './styles.ts'

export const name = 'opencode-local-probe-client'
export const inject = ['slots', 'locale']

export function apply(ctx: any): void {
  try {
    if (typeof document !== 'undefined') {
      const id = 'opencode-local-probe/css'
      let tag = document.querySelector(`style[data-plugin-css="${id}"]`)
      if (!tag) { tag = document.createElement('style'); tag.dataset.pluginCss = id; document.head.appendChild(tag) }
      tag.textContent = PROBE_CSS
    }
    const ns = 'settings.opencode-local-probe'
    ctx.effect?.(() => ctx.locale.register(ns, { zh, en }))
    const t = ctx.locale.bind(ns)
    const forms = ctx.get?.('configForms')
    let scope: any = undefined
    let cardDisposer: any = undefined
    const registerCard = () => {
      if (cardDisposer) { try { cardDisposer() } catch { /* ignore */ } }
      cardDisposer = ctx.slots.register({
        name: 'settings.section', id: 'opencode-local-probe', order: 50,
        label: () => t('nav.panel'), locale: ns, inject: () => ({ t, scope, surface: 'settings' }),
      }, ProbeCard)
    }
    ctx.slots.inject('settings.section', () => {
      registerCard()
      if (forms?.whileServed) {
        ctx.effect?.(() => forms.whileServed(
          ['opencode-local-probe', ns, 'include:opencode-local-probe'],
          (served: Set<string>) => {
            const found = [...served].find((x: string) => /opencode-local-probe/.test(x))
            scope = found ? forms.get(found) : undefined
            registerCard()
            return () => { /* cardDisposer cleaned below */ }
          },
        ))
      } else if (forms?.get) {
        scope = forms.get('opencode-local-probe')
        registerCard()
      }
      return () => { try { cardDisposer?.() } catch { /* ignore */ } }
    })
  } catch (e) {
    console.error('[opencode-local-probe] client card failed to load:', e)
  }
}
```
<!-- END FILE -->

## 5. 固定常量表

| 常量 | 值 | 位置 |
| --- | --- | --- |
| A 组对话预算 | 上限 10（A1=0/A2≤2/A3≤2） | probe/lib.mjs BUDGET |
| 探测 prompt | `Reply with exactly: ok`（无 maxTokens，serve 不支持） | lib C.textOk |
| 会话 title 前缀 | `p2-probe-` | lib C.titlePrefix |
| 端口基址 | 4096（manager 扫描 16） | shared() |
| 免费判定 | cost 非空且 input/output/cache.read/write 全 0 | a1 |
| 地区候选 | id 匹配 /muse-spark/i（无则记 null） | a2 |
| 工具放行 | replyDecision decision='once' | a3 |
| 写文件目标 | temp/P2/a3-probe-file.txt（验毕删） | a3 |
| spike 插件 id | opencode-local-probe | gui-spike |
| spike ping 路由 | /plugins/opencode-local-probe/ping | gui-spike index.ts |
| spike 配置项 | probeToggle（boolean default false） | gui-spike Config |
| client 外部化 | react/react-dom/cordis/dsh-client-* | tsdown.config.ts |

## 6. 验收

### 6.1 A 组（自动）

- [ ] a1：模型非空；cost/limit/capabilities 结构落盘；free/unknown 集合算出（U1/U2 定案依据）
- [ ] a2：ok 探测 succeeded；地区档实测或"无候选"如实记录（U3/U4）
- [ ] a3：单工具回合有终态；onceExecutes 布尔记录；actionsObserved 集合；多步 fileWritten 记录（U5/U6/U7）
- [ ] cleanup：p2-probe 会话清扫、连接拒绝
- [ ] 对话实际 ≤10；凭据值不落盘；plugin/ 与参考源码零改动

### 6.2 B 组（人工观察）

- [ ] B1：设置页出现「opencode-local 探针」卡片，无红横幅，控制台无 client 加载错误（U8）
- [ ] B2：点「测试后台路由」显示 `{ok:true,...}` JSON（U9）
- [ ] B3：翻动开关→关闭重开卡片→保持；若弹回则定案需宿主端点兜底（U10）
- [ ] 验毕卸载 spike，无残留

### 6.3 汇总

`temp/P2/protocol-notes.md`：U1–U10 逐项 = 结论 + 证据（raw 文件/源码出处）+ 置信度（双证/仅源码/存疑）；无遗留未定项 ⇒ 解锁 phase-2.md。

## 7. 故障矩阵

| 现象 | 处置 |
| --- | --- |
| a1 cost 全 unknown（无成本字段） | 定案回退 models.dev；增补 fetched 探针（仍本阶段） |
| a2 ok 探测鉴权/限流失败 | 停止门：停 Lane，记录报告（凭据/网络问题） |
| a2 无地区候选模型 | 地区档以源码 REGION_BLOCKED 形状定案，标"仅源码" |
| a3 once 不执行（toolSuccess=0） | 定案改用 allow 规则；记录动作名仍有效 |
| a3 写文件被 opencode 沙箱拒 | 记录 fileWritten=false + 原因；U7 以终态+工具事件为准 |
| 撞风控/限流 | 停该项不轰炸 |
| spike build 失败 | 查 tsdown 双入口/external 配置；spike 可改重建 |
| spike 卡片红横幅/不显示 | 多半 react-dom 未 external 或 ModuleLoader 包装错；修 spike 重建 |
| spike 开关弹回 | B3 定案：宿主答案优先 + 端点兜底（参考模式） |
| npm install 网络失败 | 重试 1 次；仍失败停止报告 |
| 子任务能力缺失 | 能力门串行回退，结论一致 |

## 附录：事实核对（已核实）

- Model.Cost 结构：`schema/src/model.ts:93-104`（{tier?, input, output, cache:{read,write}}，USDPerMillionTokens）；Model.Info.cost=Cost[]、limit{context,input?,output}、capabilities{tools,input[],output[]}（114-138）。
- serve prompt 无 maxTokens：`schema/src/prompt-input.ts:25-30`（text/files/agents/skills）；P0 protocol-notes 已证。
- 工具动作名候选：`packages/core/src/tool/plugin/*`（shell/read/edit/write→edit/webfetch/websearch/grep/glob）；P0 实测 bash→action "shell"。
- permission reply：`protocol/src/groups/permission.ts:142-149`（decision once/always/reject）。
- GUI 契约（0.2.2-rc.1 macOS 已证）：`dsh-connect-workbuddy-main/docs/DSH-0.2.2-RC1-FOLLOWUP.md` §3.2/3.3/3.6；ModuleLoader 包装与 external 规则 `tsdown.config.ts:94-109`；settings.section 注册 `src/client/index.tsx:172-200`。