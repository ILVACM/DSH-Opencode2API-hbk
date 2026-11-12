# 阶段 1 · 代码实现计划（施工图）

> 性质：**确定性执行方案**。任何模型 / agent 软件逐字遵循本文件，必得到相同的代码、相同的测试结果与相同的验收结论。
> 状态：待人工审核。**审核通过前禁止执行本文件任何动作。**
> 上游：`temp/P1/phase-1.md`（已人工裁决，§0 五条裁决全部有效）。所有接口事实已经源码核实（session-event.ts / session-error.ts / model.ts / config.ts 对照记录见文末）。

## 0. 硬约束与预算

1. 新建文件只有两处：`plugin/`（插件源码，仓库根）与 `temp/P1/harness/`（开发期验证脚本）+ `temp/P1/harness-results/`（运行产物）。`temp/opencode-dev`、`temp/opencode2dsh-master` 零改动。
2. 插件依赖仅 `@deepseek-ai/schemastery`（运行时）+ tsdown/typescript/@types/node（开发）。HTTP/SSE 全部 Node 原生 fetch。
3. **TS 必须是"可擦除语法"**（无 enum、无 namespace、无构造器参数属性）——开发期验证用 Node 24 的原生 type-stripping 直接跑 `.ts` 源码（要求 Node ≥ 22.18，本机 v24.21 ✓）。
4. **对话预算（开发期 harness，硬上限）**：h1/h2/h3 各 1 次 prompt，计划 3 次、**上限 6 次**（允许 run-all 整体重跑 1 次）。h4/h5 与 run-all 的会话清扫为 0 prompt。超预算立即停止并报告。
5. **脚本逐字节提取**：§4 每个文件由 `<!-- BEGIN FILE: 路径 -->` / `<!-- END FILE -->` 标记包围，执行者把标记间代码块内容**逐字节**写入对应路径，禁止改写、优化、增删任何字符。
6. 插件运行时的一切凭据（serve 随机密码）只在进程内存，不落盘；harness 的 serve 日志与数据只写 `temp/P1/harness/data/`。
7. **稳定优先（裁决 3）**：实现中一切取舍已按此原则定死，提取者不需要也不允许做任何"改进"。

## 1. 能力门与编排（多 agent 协作）

### 1.1 能力门（执行者第一个动作）

检查自身工具集中是否有"派发独立子任务并等待完成"的能力（Qoder `Agent` / Claude Code `Task` / 等效机制）：
- **有** → `mode = parallel`：T0 完成后**同时派发三个代码提取子任务** A1/A2/A3（互不依赖，因为 `src/types.ts` 冻结契约已由 T0 落盘）；三者全部完成后主执行者依次 T1 → T2 → T3。
- **无** → `mode = serial`：同一执行者按 A1 → A2 → A3 → T1 → T2 → T3 顺序执行同一套提取动作。
- 两种模式的产出**逐字节相同**（代码全部来自 §4，agent 只是提取器）；在 impl-notes 中记录实际 mode。

### 1.2 编排图

```
能力门 → T0（主执行者）：脚手架 + 冻结契约 types.ts + npm install + 基线 typecheck
   ├── A1（子任务）：提取 serve/client.ts + serve/manager.ts ──┐
   ├── A2（子任务）：提取 adapter/flatten.ts + translate.ts ──┤ 三路并行
   └── A3（子任务）：提取 adapter/turn.ts + local-adapter.ts
              + config.ts + index.ts ─────────────────────────┤
                                              三者完成 → T1（主）：typecheck + build（失败即停）
                                                        → T2（主）：run-all 五项验证（对话 ≤3/上限 6）
                                                        → T3（主）：impl-notes.md + 人工验收清单
```

### 1.3 停止门

- T1 typecheck 报错 → **停止**，报告人工（说明 §4 代码存在缺陷，不允许提取者自行改代码修复）。
- T2 任一断言失败 → 该项记录失败详情；仅传输层失败（fetch 异常）允许 run-all 重跑一次；`EMPTY_RESPONSE`/限流/鉴权类失败不重试。
- harness 撞限流/风控 → 停止 T2，记录现象。

## 2. 共享契约（冻结）

- **`plugin/src/types.ts` 是唯一的类型契约源**（§4.4），A1/A2/A3 三个任务包只允许 import 它，不允许自定义重复类型。
- 跨模块调用面（签名级，均已在 §4 定稿）：
  - `client.ts`：`authHeader / serveRequest / findFreePort / waitReady / openSSE / listModels / getDefaultModel / toModelRef / createSession / prompt / replyPermission / interruptSession / deleteSession / errorMessage / ASK_ALL`
  - `manager.ts`：`ServeManager`（`start / ensureReady / restart / dispose / endpoint / healthy / diagnostics`）
  - `flatten.ts`：`flattenHistory(options) → string`
  - `translate.ts`：`translateEvents(events, sessionID) → AsyncGenerator<HarnessChunk>`、`TERMINAL_EVENT_TYPES`、`classifyError`
  - `turn.ts`：`runTurn(ep, cfg, options, modelRef, diag) → AsyncGenerator<HarnessChunk>`
  - `local-adapter.ts`：`LocalAdapter`（完整 LlmAdapter 契约 + `refreshModels / diagnostics`）
- 事件数据形状（已核实 `schema/src/session-event.ts`）：`session.execution.failed.data = {sessionID, error:{type,message,status?}}`；`session.execution.interrupted.data = {sessionID, reason}`；`text/reasoning.delta.data = {sessionID, assistantMessageID, ordinal, delta}`；`*.ended.data = {...,text}`；`usage.updated.data = {sessionID, cost, tokens:{input,output,reasoning,cache:{read,write}}}`；`permission.asked.data.id`。

## 3. 任务包

| 包 | 执行者 | 动作 | 产出 | 验收 |
| --- | --- | --- | --- | --- |
| T0 | 主 | 能力门 → 建目录 → 提取 §4.1–4.4（package.json / cordis.patch.yml / tsconfig / types.ts）→ `cd plugin && npm install`（需要网络）→ `npx tsc --noEmit` 基线通过 | plugin 骨架可编译 | install 退出码 0；tsc 0 错误 |
| A1 | 子任务（可与 A2/A3 并行） | 逐字节提取 §4.5、§4.6 | serve/client.ts、serve/manager.ts | 文件存在且与 §4 一致 |
| A2 | 子任务 | 逐字节提取 §4.7、§4.8 | adapter/flatten.ts、adapter/translate.ts | 同上 |
| A3 | 子任务 | 逐字节提取 §4.9–4.12 | adapter/turn.ts、local-adapter.ts、config.ts、index.ts | 同上 |
| T1 | 主 | `cd plugin && npx tsc --noEmit`，然后 `npm run build` | lib/index.js 等构建产物 | typecheck 0 错误；build 成功；失败→停止门 |
| T2 | 主 | `node temp/P1/harness/run-all.mjs`（先提取 §4.13–4.18） | harness-results/*.json + summary.json | h1–h5 全过；对话 ≤3 |
| T3 | 主 | 汇总写 `temp/P1/impl-notes.md`（mode、typecheck/build 记录、harness 结果、与 §4 的偏差=必须为零）+ 更新 plan.md §7 + 输出 §6.2 人工验收清单给用户 | impl-notes.md | 人工验收清单完整可执行 |

## 4. 内嵌代码（逐字节提取，禁止改写）

<!-- BEGIN FILE: plugin/package.json -->
```json
{
  "name": "@hbk/dsh-opencode-local",
  "version": "0.1.0",
  "description": "Drive the local real opencode CLI from DeepSeek Harness (DSH). No spoofing: the official CLI binary and the user's own login are reused as-is.",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "package.json"],
  "engines": { "node": ">=20" },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "scripts": {
    "build": "tsdown src/index.ts --format esm --dts --out-dir lib --no-clean",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.4"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsdown": "^0.15.0",
    "typescript": "^5.9.0"
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/cordis.patch.yml -->
```yaml
# dsh-opencode-local plugin — bundle patch: insert the plugin loader row.
- insert:
    - id: opencode-local
      name: '@hbk/dsh-opencode-local'
      config: {}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/tsconfig.json -->
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src/**/*.ts"]
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/types.ts -->
```ts
export interface ServeEndpoint {
  url: string
  password: string
  pid: number
  port: number
  version: string
}

export interface ModelRef {
  id: string
  providerID: string
}

export interface ServeModelInfo {
  id: string
  modelID?: string
  providerID: string
  name?: string
  enabled?: boolean
  capabilities?: { tools?: boolean; input?: string[]; output?: string[] }
  limit?: { context?: number; input?: number; output?: number }
}

export interface ServeEventData {
  sessionID?: string
  id?: unknown
  ordinal?: number
  delta?: string
  text?: string
  reason?: string
  error?: { type?: string; message?: string; status?: number }
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  [key: string]: unknown
}

export interface ServeEvent {
  id?: string
  type: string
  created?: number
  data?: ServeEventData
}

export interface ServeResponse {
  status: number
  json: unknown
  text: string
}

export interface HarnessTool {
  name: string
  description: string
  parameters: unknown
}

export type HarnessBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; signature?: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'image'; [key: string]: unknown }
  | { type: 'tool-result'; toolCallId: string; content: HarnessBlock[]; isError?: boolean; [key: string]: unknown }

export interface HarnessMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: HarnessBlock[]
  toolCallId?: string
  isError?: boolean
}

export interface HarnessGenerateOptions {
  provider: string
  model: string
  messages: HarnessMessage[]
  system?: string
  tools?: HarnessTool[]
  maxTokens?: number
  temperature?: number
  reasoning?: string
  reasoningEffort?: string
  signal?: AbortSignal
}

export type HarnessChunk =
  | { type: 'block-start'; index: number; blockType: 'text' | 'reasoning' | 'tool-call' }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: { type: 'text'; text: string } | { type: 'reasoning'; text: string; signature?: string } | { type: 'tool-call'; id: string; name: string; arguments: string } }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } }
  | { type: 'finish'; reason: FinishReason }

export type FinishReason =
  | { kind: 'stop' }
  | { kind: 'max-tokens' }
  | { kind: 'tool-calls' }
  | { kind: 'aborted'; failure: { message: string; code: string } }
  | { kind: 'error'; failure: { message: string; code: string } }

export interface ResolvedModelInfo {
  provider: string
  id: string
  name: string
  inputModalities: string[]
  context: { contextWindow: number }
  defaultMaxTokens: number
}

export interface AdapterDiagnostics {
  permissionAsked: number
  permissionRejected: number
  toolEvents: number
  sessions: string[]
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/serve/client.ts -->
```ts
import net from 'node:net'
import type { ModelRef, ServeEndpoint, ServeEvent, ServeModelInfo, ServeResponse } from '../types.ts'

export const ASK_ALL = [{ action: '*', resource: '*', effect: 'ask' }]
export const SSE_CONNECT_TIMEOUT_MS = 15000

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function authHeader(ep: ServeEndpoint): string {
  return 'Basic ' + Buffer.from('opencode:' + ep.password).toString('base64')
}

export async function serveRequest(ep: ServeEndpoint, method: string, path: string, body?: unknown, auth = true): Promise<ServeResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = authHeader(ep)
  const res = await fetch(ep.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, json, text }
}

export async function findFreePort(base: number, scan: number): Promise<number> {
  for (let p = base; p < base + scan; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createServer()
      s.once('error', () => resolve(false))
      s.listen(p, '127.0.0.1', () => s.close(() => resolve(true)))
    })
    if (ok) return p
  }
  throw new Error(`no free port in ${base}..${base + scan - 1}`)
}

export async function waitReady(ep: ServeEndpoint, timeoutMs: number, pollMs: number): Promise<{ version: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await serveRequest(ep, 'GET', '/api/info')
      if (r.status === 200) {
        const version = (r.json as { version?: string } | undefined)?.version
        return { version: typeof version === 'string' ? version : '' }
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return null
}

export interface SSEHandle {
  connected: Promise<void>
  close(): void
}

export function openSSE(ep: ServeEndpoint, onEvent: (e: ServeEvent) => void): SSEHandle {
  const ctrl = new AbortController()
  let buf = ''
  let settled = false
  const connected = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('SSE connect timeout')) } }, SSE_CONNECT_TIMEOUT_MS)
    void (async () => {
      try {
        const res = await fetch(ep.url + '/api/event', {
          headers: { authorization: authHeader(ep), accept: 'text/event-stream' },
          signal: ctrl.signal,
        })
        if (res.status !== 200 || !res.body) throw new Error('SSE status ' + res.status)
        for await (const chunk of res.body) {
          buf += Buffer.from(chunk).toString('utf8')
          let idx: number
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const line = frame.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            let evt: ServeEvent
            try { evt = JSON.parse(line.slice(5).trim()) as ServeEvent } catch { continue }
            if (evt.type === 'server.connected' && !settled) { settled = true; clearTimeout(timer); resolve() }
            try { onEvent(evt) } catch { /* diagnostics must never break the pump */ }
          }
        }
      } catch (err) {
        if (!settled) { settled = true; clearTimeout(timer); reject(err) }
      }
    })()
  })
  return { connected, close: () => ctrl.abort() }
}

export function toModelRef(m: ServeModelInfo): ModelRef {
  if (typeof m.id === 'string' && m.id.includes('/')) {
    const i = m.id.indexOf('/')
    return { providerID: m.id.slice(0, i), id: m.id.slice(i + 1) }
  }
  return { id: m.modelID ?? m.id, providerID: m.providerID }
}

export async function listModels(ep: ServeEndpoint): Promise<ServeModelInfo[]> {
  const r = await serveRequest(ep, 'GET', '/api/model')
  const data = (r.json as { data?: ServeModelInfo[] } | undefined)?.data
  return Array.isArray(data) ? data : []
}

export async function getDefaultModel(ep: ServeEndpoint): Promise<ServeModelInfo | null> {
  const r = await serveRequest(ep, 'GET', '/api/model/default')
  const data = (r.json as { data?: ServeModelInfo } | undefined)?.data
  return data ?? null
}

export async function createSession(ep: ServeEndpoint, title: string, modelRef: ModelRef): Promise<string> {
  const r = await serveRequest(ep, 'POST', '/api/session', { title, model: modelRef, permissions: ASK_ALL })
  const id = (r.json as { data?: { id?: string } } | undefined)?.data?.id
  if (r.status !== 200 || typeof id !== 'string' || id.length === 0) {
    throw new Error(`createSession failed: ${r.status} ${r.text.slice(0, 300)}`)
  }
  return id
}

export async function prompt(ep: ServeEndpoint, sessionID: string, text: string): Promise<void> {
  const r = await serveRequest(ep, 'POST', `/api/session/${sessionID}/prompt`, { text })
  if (r.status !== 200) throw new Error(`prompt failed: ${r.status} ${r.text.slice(0, 300)}`)
}

export async function replyPermission(ep: ServeEndpoint, sessionID: string, requestID: string, message: string): Promise<ServeResponse> {
  return serveRequest(ep, 'POST', `/api/session/${sessionID}/permission/${requestID}/reply`, { decision: 'reject', message })
}

export async function interruptSession(ep: ServeEndpoint, sessionID: string): Promise<void> {
  await serveRequest(ep, 'POST', `/api/session/${sessionID}/interrupt`).catch(() => {})
}

export async function deleteSession(ep: ServeEndpoint, sessionID: string): Promise<boolean> {
  try {
    const r = await serveRequest(ep, 'DELETE', `/api/session/${sessionID}`)
    return r.status === 204 || r.status === 200
  } catch {
    return false
  }
}

export async function listSessions(ep: ServeEndpoint): Promise<Array<{ id?: string; title?: string }>> {
  const r = await serveRequest(ep, 'GET', '/api/session')
  const data = (r.json as { data?: Array<{ id?: string; title?: string }> } | undefined)?.data
  return Array.isArray(data) ? data : []
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/serve/manager.ts -->
```ts
import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findFreePort, serveRequest, waitReady } from './client.ts'
import type { ServeEndpoint } from '../types.ts'

export interface ManagerConfig {
  opencodePath: string
  portBase: number
  dataDir: string
  readyTimeoutMs: number
  heartbeatMs: number
  restartDelayMs: number
  maxRestarts: number
}

export function defaultManagerConfig(overrides?: Partial<ManagerConfig>): ManagerConfig {
  return {
    opencodePath: overrides?.opencodePath ?? '',
    portBase: overrides?.portBase ?? 4096,
    dataDir: overrides?.dataDir ?? join(homedir(), '.dsh-opencode-local'),
    readyTimeoutMs: overrides?.readyTimeoutMs ?? 60000,
    heartbeatMs: overrides?.heartbeatMs ?? 10000,
    restartDelayMs: overrides?.restartDelayMs ?? 1000,
    maxRestarts: overrides?.maxRestarts ?? 3,
  }
}

const PORT_SCAN = 16

export class ServeManager {
  private cfg: ManagerConfig
  private ep: ServeEndpoint | null = null
  private childPid: number | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private disposed = false
  private restartCount = 0
  private inflight: Promise<ServeEndpoint> | null = null
  readonly diagnostics = { restarts: 0 }

  constructor(cfg: ManagerConfig) {
    this.cfg = cfg
  }

  get endpoint(): ServeEndpoint | null {
    return this.ep
  }

  get healthy(): boolean {
    return this.ep !== null
  }

  async start(): Promise<ServeEndpoint> {
    if (this.ep) return this.ep
    return this.coordinate(() => this.launch())
  }

  async ensureReady(): Promise<ServeEndpoint> {
    return this.start()
  }

  async restart(): Promise<ServeEndpoint> {
    if (this.disposed) throw new Error('manager disposed')
    if (this.restartCount >= this.cfg.maxRestarts) {
      throw new Error(`opencode serve restart budget exhausted (${this.cfg.maxRestarts})`)
    }
    this.killTree()
    this.ep = null
    await new Promise((r) => setTimeout(r, this.cfg.restartDelayMs))
    this.restartCount += 1
    this.diagnostics.restarts += 1
    return this.coordinate(() => this.launch())
  }

  private coordinate(fn: () => Promise<ServeEndpoint>): Promise<ServeEndpoint> {
    if (this.inflight) return this.inflight
    this.inflight = fn().finally(() => { this.inflight = null })
    return this.inflight
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.killTree()
    this.ep = null
  }

  private async launch(): Promise<ServeEndpoint> {
    const bin = this.cfg.opencodePath.trim().length > 0 ? this.cfg.opencodePath.trim() : 'opencode'
    const port = await findFreePort(this.cfg.portBase, PORT_SCAN)
    fs.mkdirSync(this.cfg.dataDir, { recursive: true })
    const logPath = join(this.cfg.dataDir, 'serve.log')
    const log = fs.openSync(logPath, 'a')
    const password = randomBytes(32).toString('base64url')
    const child = spawn(bin, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
      shell: true,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, OPENCODE_PASSWORD: password },
    })
    child.unref()
    this.childPid = typeof child.pid === 'number' ? child.pid : null
    const ep: ServeEndpoint = {
      url: `http://127.0.0.1:${port}`,
      password,
      pid: this.childPid ?? 0,
      port,
      version: '',
    }
    const ready = await waitReady(ep, this.cfg.readyTimeoutMs, 500)
    if (!ready) {
      this.killTree()
      throw new Error(`opencode serve not ready in ${this.cfg.readyTimeoutMs}ms; see ${logPath}`)
    }
    ep.version = ready.version
    this.ep = ep
    this.startHeartbeat()
    return ep
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => { void this.check() }, this.cfg.heartbeatMs)
    this.heartbeatTimer.unref?.()
  }

  private async check(): Promise<void> {
    if (this.disposed || this.inflight || !this.ep) return
    try {
      const r = await serveRequest(this.ep, 'GET', '/api/info')
      if (r.status === 200) {
        this.restartCount = 0
        return
      }
    } catch { /* dead or starting */ }
    try { await this.restart() } catch { /* budget exhausted; adapter calls will surface honest errors */ }
  }

  private killTree(): void {
    if (this.childPid === null) return
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(this.childPid), '/T', '/F'], { encoding: 'utf8' })
    } else {
      try { process.kill(-this.childPid, 'SIGTERM') } catch { try { process.kill(this.childPid, 'SIGTERM') } catch { /* already gone */ } }
    }
    this.childPid = null
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/adapter/flatten.ts -->
```ts
import type { HarnessBlock, HarnessGenerateOptions, HarnessMessage } from '../types.ts'

function blockText(blocks: HarnessBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (b.type === 'text') parts.push(b.text)
    else if (b.type === 'reasoning') parts.push(`[reasoning omitted]`)
    else if (b.type === 'tool-call') parts.push(`[assistant attempted tool call: ${b.name} — tools are disabled]`)
    else if (b.type === 'image') parts.push(`[image omitted]`)
    else if (b.type === 'tool-result') {
      const inner = blockText(b.content)
      parts.push(`[tool result for ${b.toolCallId}] ${inner}`.trim())
    }
  }
  return parts.join('\n')
}

export function flattenHistory(options: HarnessGenerateOptions): string {
  const msgs: HarnessMessage[] = options.messages
  let promptIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { promptIdx = i; break }
  }
  if (promptIdx < 0) throw new Error('no user message in conversation (INVALID_REQUEST)')
  const promptText = blockText(msgs[promptIdx].content).trim()
  if (promptText.length === 0) throw new Error('current user message is empty (INVALID_REQUEST)')
  const sections: string[] = []
  if (options.system !== undefined && options.system.trim().length > 0) {
    sections.push('[System Instructions]\n' + options.system.trim())
  }
  const history = msgs.filter((_, i) => i !== promptIdx)
  if (history.length > 0) {
    const lines = history.map((m) => `[${m.role}]: ` + blockText(m.content).trim())
    sections.push('[Conversation History]\n' + lines.join('\n\n'))
  }
  sections.push('[Current User Message]\n' + promptText)
  sections.push('Answer the current user message. You have no tools in this channel; reply in plain text.')
  return sections.join('\n\n')
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/adapter/translate.ts -->
```ts
import type { HarnessChunk, ServeEvent } from '../types.ts'

export const TERMINAL_EVENT_TYPES = new Set([
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
])

export function classifyError(type: string | undefined, message: string, status?: number): string {
  const text = `${type ?? ''} ${message}`
  if (/\bRegionError\b|not available in your country/i.test(text)) return 'REGION_BLOCKED'
  if (/\bFreeTierError\b|free tier can only be used from within opencode/i.test(text)) return 'FREE_TIER_RESTRICTED'
  if (status === 401 || status === 403 || /\b(?:401|403)\b/.test(text)) return 'AUTH'
  if (status === 429 || /\b429\b|rate.?limit/i.test(text)) return 'RATE_LIMIT'
  if (status !== undefined && status >= 500) return 'SERVER'
  if (/insufficient|quota|billing/i.test(text)) return 'QUOTA_EXCEEDED'
  if (status === 400 || status === 404 || status === 413 || /\b400\b|invalid.?request/i.test(text)) return 'INVALID_REQUEST'
  if (/\btime(?:d)?\s*out\b|timeout/i.test(text)) return 'TIMEOUT'
  if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b|terminated|premature close/i.test(text)) return 'TRANSPORT'
  return 'UPSTREAM'
}

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

export async function* translateEvents(events: AsyncIterable<ServeEvent>, sessionID: string): AsyncGenerator<HarnessChunk> {
  let nextIndex = 0
  const textIndex = new Map<number, number>()
  const reasoningIndex = new Map<number, number>()
  let sawText = false
  let heldUsage: Usage | null = null
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
      case 'session.usage.updated': {
        heldUsage = usageOf(evt)
        break
      }
      case 'session.execution.succeeded': {
        yield { type: 'usage', usage: heldUsage ?? ZERO_USAGE }
        if (sawText) {
          yield { type: 'finish', reason: { kind: 'stop' } }
        } else {
          yield { type: 'finish', reason: { kind: 'error', failure: { message: `session "${sessionID}" completed without any text output`, code: 'EMPTY_RESPONSE' } } }
        }
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
              code: classifyError(err?.type, typeof err?.message === 'string' ? err.message : '', typeof err?.status === 'number' ? err.status : undefined),
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
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/adapter/turn.ts -->
```ts
import { createSession, interruptSession, openSSE, prompt, replyPermission } from '../serve/client.ts'
import { flattenHistory } from './flatten.ts'
import { TERMINAL_EVENT_TYPES, translateEvents } from './translate.ts'
import type { AdapterDiagnostics, HarnessChunk, HarnessGenerateOptions, ModelRef, ServeEndpoint, ServeEvent } from '../types.ts'

export const MAX_PERMISSION_REJECTS_PER_TURN = 20
export const TURN_WATCHDOG_POLL_MS = 200
const REJECT_MESSAGE = 'tools are disabled in this channel; reply in plain text'

export interface TurnConfig {
  titlePrefix: string
  firstEventMs: number
  idleMs: number
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
  const text = flattenHistory(options)
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
  const onAbort = () => { void interruptSession(ep, sessionID) }
  const onAbortCatch = () => { onAbort() }
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
    let rejected = 0
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
              if (rejected >= MAX_PERMISSION_REJECTS_PER_TURN) {
                await interruptSession(ep, sessionID).catch(() => {})
              } else {
                const r = await replyPermission(ep, sessionID, requestID, REJECT_MESSAGE)
                if (r.status === 204 || r.status === 200) {
                  rejected += 1
                  diag.permissionRejected += 1
                }
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
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/adapter/local-adapter.ts -->
```ts
import type { ServeManager } from '../serve/manager.ts'
import { getDefaultModel, listModels, toModelRef } from '../serve/client.ts'
import { runTurn } from './turn.ts'
import type {
  AdapterDiagnostics,
  HarnessChunk,
  HarnessGenerateOptions,
  ModelRef,
  ResolvedModelInfo,
  ServeModelInfo,
} from '../types.ts'

export interface AdapterConfig {
  providerId: string
  modelWhitelist: string[]
  titlePrefix: string
  firstEventMs?: number
  idleMs?: number
}

const DEFAULT_FIRST_EVENT_MS = 30000
const DEFAULT_IDLE_MS = 120000
const DEFAULT_CONTEXT_WINDOW = 262144
const DEFAULT_MAX_TOKENS = 32768

export const RETRY_POLICY = Object.freeze({
  mode: 'normal' as const,
  maxRetries: 4,
  retryableCodes: Object.freeze(['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE']),
  initialDelayMs: 1000,
  maxDelayMs: 15000,
  jitterRatio: 0.2,
})

function modalitiesOf(info: ServeModelInfo | undefined): string[] {
  const declared = info?.capabilities?.input
  return Array.isArray(declared) && declared.length > 0 ? declared : ['text']
}

export class LocalAdapter {
  private cfg: AdapterConfig
  private manager: ServeManager
  private models: Map<string, { ref: ModelRef; info: ServeModelInfo }> = new Map()
  readonly diagnostics: AdapterDiagnostics = { permissionAsked: 0, permissionRejected: 0, toolEvents: 0, sessions: [] }

  constructor(cfg: AdapterConfig, manager: ServeManager) {
    this.cfg = cfg
    this.manager = manager
  }

  providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: this.cfg.providerId }
  }

  providerRetryPolicy(_provider: string): typeof RETRY_POLICY {
    return RETRY_POLICY
  }

  imageRequestPricing(_provider: string, _model: string): undefined {
    return undefined
  }

  #whitelistAllows(model: string): boolean {
    return this.cfg.modelWhitelist.length === 0 || this.cfg.modelWhitelist.includes(model)
  }

  async refreshModels(): Promise<string[]> {
    const ep = await this.manager.ensureReady()
    const [def, all] = await Promise.all([getDefaultModel(ep), listModels(ep)])
    const seen = new Set<string>()
    const ids: string[] = []
    const add = (m: ServeModelInfo | null): void => {
      if (!m || typeof m.id !== 'string' || m.id.length === 0 || seen.has(m.id) || m.enabled === false) return
      seen.add(m.id)
      this.models.set(m.id, { ref: toModelRef(m), info: m })
      ids.push(m.id)
    }
    add(def)
    const rest = all.filter((m) => !def || m.id !== def.id)
    rest.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const m of rest) add(m)
    return ids.filter((id) => this.#whitelistAllows(id))
  }

  async listModels(provider: string): Promise<Array<{ provider: string; id: string; name: string; inputModalities: string[] }>> {
    await this.refreshModels()
    const out: Array<{ provider: string; id: string; name: string; inputModalities: string[] }> = []
    for (const [id, entry] of this.models) {
      if (!this.#whitelistAllows(id)) continue
      out.push({ provider, id, name: entry.info.name ?? id, inputModalities: modalitiesOf(entry.info) })
    }
    return out
  }

  resolveModel(provider: string, model: string): ResolvedModelInfo {
    const entry = this.models.get(model)
    const info = entry?.info
    const contextWindow = typeof info?.limit?.context === 'number' && info.limit.context > 0 ? info.limit.context : DEFAULT_CONTEXT_WINDOW
    const maxTokens = typeof info?.limit?.output === 'number' && info.limit.output > 0 ? info.limit.output : DEFAULT_MAX_TOKENS
    return {
      provider,
      id: model,
      name: info?.name ?? model,
      inputModalities: modalitiesOf(info),
      context: { contextWindow },
      defaultMaxTokens: maxTokens,
    }
  }

  async #ensureEntry(model: string): Promise<{ ref: ModelRef; info: ServeModelInfo }> {
    const hit = this.models.get(model)
    if (hit) return hit
    await this.refreshModels()
    const hit2 = this.models.get(model)
    if (!hit2) throw new Error(`model "${model}" is not provided by the local opencode serve (INVALID_REQUEST)`)
    return hit2
  }

  async prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<{
    model: ResolvedModelInfo
    stream: (options: HarnessGenerateOptions) => AsyncGenerator<HarnessChunk>
  }> {
    if (!this.#whitelistAllows(model)) {
      throw new Error(`model "${model}" is excluded by modelWhitelist (INVALID_REQUEST)`)
    }
    await this.#ensureEntry(model)
    return {
      model: this.resolveModel(provider, model),
      stream: (options: HarnessGenerateOptions) => this.#streamWith(options),
    }
  }

  async *stream(options: HarnessGenerateOptions): AsyncGenerator<HarnessChunk> {
    if (!this.#whitelistAllows(options.model)) {
      throw new Error(`model "${options.model}" is excluded by modelWhitelist (INVALID_REQUEST)`)
    }
    yield* this.#streamWith(options)
  }

  async *#streamWith(options: HarnessGenerateOptions): AsyncGenerator<HarnessChunk> {
    const ep = await this.manager.ensureReady()
    const entry = await this.#ensureEntry(options.model)
    yield* runTurn(
      ep,
      {
        titlePrefix: this.cfg.titlePrefix,
        firstEventMs: this.cfg.firstEventMs ?? DEFAULT_FIRST_EVENT_MS,
        idleMs: this.cfg.idleMs ?? DEFAULT_IDLE_MS,
      },
      options,
      entry.ref,
      this.diagnostics,
    )
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/config.ts -->
```ts
import Schema from '@deepseek-ai/schemastery'

export interface ResolvedPluginConfig {
  providerId: string
  opencodePath: string
  portBase: number
  modelWhitelist: string[]
  firstEventMs?: number
  idleMs?: number
  titlePrefix: string
}

export const Config = Schema.object({
  providerId: Schema.string().default('opencode-local'),
  opencodePath: Schema.string().default(''),
  portBase: Schema.number().step(1).min(1024).max(65000).default(4096),
  modelWhitelist: Schema.array(Schema.string()).default([]),
  firstEventMs: Schema.number().step(1).min(1000).max(600000),
  idleMs: Schema.number().step(1).min(1000).max(600000),
  titlePrefix: Schema.string().default('dsh-'),
})

export function resolveConfig(input: Partial<ResolvedPluginConfig> | undefined | null): ResolvedPluginConfig {
  const c = input ?? {}
  return {
    providerId: typeof c.providerId === 'string' && c.providerId.trim().length > 0 ? c.providerId.trim() : 'opencode-local',
    opencodePath: typeof c.opencodePath === 'string' ? c.opencodePath : '',
    portBase: typeof c.portBase === 'number' && Number.isInteger(c.portBase) ? c.portBase : 4096,
    modelWhitelist: Array.isArray(c.modelWhitelist) ? c.modelWhitelist.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    firstEventMs: typeof c.firstEventMs === 'number' ? c.firstEventMs : undefined,
    idleMs: typeof c.idleMs === 'number' ? c.idleMs : undefined,
    titlePrefix: typeof c.titlePrefix === 'string' && c.titlePrefix.length > 0 ? c.titlePrefix : 'dsh-',
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/index.ts -->
```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig, type ResolvedPluginConfig } from './config.ts'
import { ServeManager } from './serve/manager.ts'
import { errorMessage } from './serve/client.ts'
import { LocalAdapter } from './adapter/local-adapter.ts'

export interface PluginContext {
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
  llm?: { registerAdapter(providers: string[], adapter: unknown): unknown }
  effect?(fn: () => () => void): unknown
}

export const name = 'opencode-local'
export { Config } from './config.ts'
export const inject = ['llm'] as const

export function apply(ctx: PluginContext, config: Partial<ResolvedPluginConfig> = {}): void {
  const cfg = resolveConfig(config)
  if (!ctx.llm || typeof ctx.llm.registerAdapter !== 'function') {
    ctx.logger.error('opencode-local: llm service unavailable; adapter not registered')
    return
  }
  const manager = new ServeManager(
    defaultManagerOverrides(cfg),
  )
  const adapter = new LocalAdapter(
    {
      providerId: cfg.providerId,
      modelWhitelist: cfg.modelWhitelist,
      titlePrefix: cfg.titlePrefix,
      firstEventMs: cfg.firstEventMs,
      idleMs: cfg.idleMs,
    },
    manager,
  )
  ctx.llm.registerAdapter([cfg.providerId], adapter)
  ctx.logger.info(`opencode-local: adapter registered for "${cfg.providerId}"; local opencode serve starting`)
  const maybeEffect = ctx.effect
  if (typeof maybeEffect === 'function') {
    maybeEffect.call(ctx, () => () => {
      void manager.dispose()
    })
  }
  void adapter
    .refreshModels()
    .then((ids) => { ctx.logger.info(`opencode-local: ${ids.length} models available from local opencode (v${manager.endpoint?.version ?? '?'})`) })
    .catch((err) => { ctx.logger.warn(`opencode-local: model refresh failed: ${errorMessage(err)}`) })
}

function defaultManagerOverrides(cfg: ResolvedPluginConfig) {
  return {
    opencodePath: cfg.opencodePath,
    portBase: cfg.portBase,
    dataDir: join(homedir(), '.dsh-opencode-local'),
    readyTimeoutMs: 60000,
    heartbeatMs: 10000,
    restartDelayMs: 1000,
    maxRestarts: 3,
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/lib.mjs -->
```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { ServeManager } from '../../../plugin/src/serve/manager.ts'
import { LocalAdapter } from '../../../plugin/src/adapter/local-adapter.ts'
import { deleteSession, listSessions, serveRequest } from '../../../plugin/src/serve/client.ts'

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url))
export const RESULTS_DIR = path.join(HARNESS_DIR, '..', 'harness-results')
export const CHAT_BUDGET = { used: 0, cap: 6 }

let singleton = null
export function shared() {
  if (!singleton) {
    const manager = new ServeManager({
      opencodePath: '',
      portBase: 4096,
      dataDir: path.join(HARNESS_DIR, 'data'),
      readyTimeoutMs: 60000,
      heartbeatMs: 2000,
      restartDelayMs: 1000,
      maxRestarts: 3,
    })
    const adapter = new LocalAdapter(
      { providerId: 'opencode-local', modelWhitelist: [], titlePrefix: 'dsh-' },
      manager,
    )
    singleton = { manager, adapter }
  }
  return singleton
}

export function record(name, data) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  fs.writeFileSync(path.join(RESULTS_DIR, name + '.json'), JSON.stringify(data, null, 2))
  console.log(name, JSON.stringify(data))
}

export function check(name, ok, detail) {
  if (!ok) throw new Error(`check failed: ${name} — ${detail}`)
}

export async function collectStream(gen) {
  const chunks = []
  for await (const c of gen) chunks.push(c)
  const finish = chunks.find((c) => c.type === 'finish')?.reason ?? null
  const usage = chunks.find((c) => c.type === 'usage')?.usage ?? null
  const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
  const toolChunks = chunks.filter((c) => c.type === 'block-start' && c.blockType === 'tool-call').length
  const lastIdx = chunks.length > 0 && chunks[chunks.length - 1].type === 'finish'
  return { chunks, finish, usage, text, toolChunks, endsWithFinish: lastIdx }
}

export async function pickModel(adapter) {
  const models = await adapter.listModels('opencode-local')
  check('listModels non-empty', models.length > 0, 'local opencode serve exposes no models')
  return models[0].id
}

export async function sweepDSHSessions(manager) {
  const ep = manager.endpoint
  if (!ep) return 0
  const sessions = await listSessions(ep)
  let n = 0
  for (const s of sessions) {
    if (typeof s.id === 'string' && typeof s.title === 'string' && s.title.startsWith('dsh-')) {
      if (await deleteSession(ep, s.id)) n++
    }
  }
  return n
}

export async function serveAlive(manager) {
  try {
    const r = await serveRequest(await manager.ensureReady(), 'GET', '/api/info')
    return r.status === 200
  } catch {
    return false
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/h1-single-turn.mjs -->
```js
import { CHAT_BUDGET, check, collectStream, pickModel, record, shared } from './lib.mjs'

export async function run() {
  CHAT_BUDGET.used += 1
  check('chat budget', CHAT_BUDGET.used <= CHAT_BUDGET.cap, `prompts ${CHAT_BUDGET.used} > cap ${CHAT_BUDGET.cap}`)
  const { manager, adapter } = shared()
  const ep = await manager.start()
  const model = await pickModel(adapter)
  const result = await collectStream(adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: ok' }] }],
  }))
  check('h1 finish stop', result.finish?.kind === 'stop', JSON.stringify(result.finish))
  check('h1 usage present', result.usage !== null && typeof result.usage.inputTokens === 'number', JSON.stringify(result.usage))
  check('h1 text non-empty', result.text.trim().length > 0, JSON.stringify(result.text.slice(0, 100)))
  check('h1 ends with finish', result.endsWithFinish, 'chunk stream must end with finish')
  check('h1 no tool chunks', result.toolChunks === 0, 'tool-call blocks must not appear')
  record('h1-single-turn', {
    ok: true, model, url: ep.url, version: ep.version,
    usage: result.usage, text: result.text.slice(0, 200),
    diag: adapter.diagnostics,
  })
  return result
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/h2-tool-block.mjs -->
```js
import { CHAT_BUDGET, check, collectStream, pickModel, record, shared } from './lib.mjs'

export async function run() {
  CHAT_BUDGET.used += 1
  check('chat budget', CHAT_BUDGET.used <= CHAT_BUDGET.cap, `prompts ${CHAT_BUDGET.used} > cap ${CHAT_BUDGET.cap}`)
  const { adapter } = shared()
  const model = await pickModel(adapter)
  const result = await collectStream(adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the bash tool to run the command: echo p0-probe. Do not answer without using the tool.' }] }],
  }))
  check('h2 finish present', result.finish !== null, 'no finish chunk')
  check('h2 no tool-call chunks', result.toolChunks === 0, JSON.stringify({ toolChunks: result.toolChunks }))
  const branch = adapter.diagnostics.permissionRejected > 0 ? 'asked-rejected' : 'no-tool'
  record('h2-tool-block', {
    ok: true, model, branch,
    finish: result.finish,
    diag: adapter.diagnostics,
    text: result.text.slice(0, 200),
  })
  return result
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/h3-abort.mjs -->
```js
import { CHAT_BUDGET, check, collectStream, pickModel, record, shared } from './lib.mjs'

export async function run() {
  CHAT_BUDGET.used += 1
  check('chat budget', CHAT_BUDGET.used <= CHAT_BUDGET.cap, `prompts ${CHAT_BUDGET.used} > cap ${CHAT_BUDGET.cap}`)
  const { adapter } = shared()
  const model = await pickModel(adapter)
  const ctrl = new AbortController()
  const gen = adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Write the numbers from 1 to 500, one number per line.' }] }],
    signal: ctrl.signal,
  })
  const collected = collectStream(gen)
  await new Promise((r) => setTimeout(r, 2000))
  ctrl.abort()
  const result = await collected
  check('h3 finish present', result.finish !== null, 'no finish chunk')
  check('h3 aborted', result.finish?.kind === 'aborted', JSON.stringify(result.finish))
  record('h3-abort', { ok: true, model, finish: result.finish, diag: adapter.diagnostics })
  return result
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/h4-restart.mjs -->
```js
import { spawnSync } from 'node:child_process'
import { check, record, serveAlive, shared } from './lib.mjs'

export async function run() {
  const { manager, adapter } = shared()
  const epBefore = await manager.start()
  const oldPid = epBefore.pid
  check('h4 old pid', typeof oldPid === 'number' && oldPid > 0, String(oldPid))
  spawnSync('taskkill', ['/PID', String(oldPid), '/T', '/F'], { encoding: 'utf8' })
  const deadline = Date.now() + 45000
  let epAfter = null
  while (Date.now() < deadline) {
    const ep = manager.endpoint
    if (ep && ep.pid !== oldPid && ep.pid > 0) {
      if (await serveAlive(manager)) { epAfter = manager.endpoint; break }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  check('h4 restarted', epAfter !== null, 'serve did not come back within 45s')
  const models = await adapter.listModels('opencode-local')
  check('h4 models after restart', models.length > 0, 'model list empty after restart')
  record('h4-restart', {
    ok: true, oldPid, newPid: epAfter.pid, version: epAfter.version,
    restarts: manager.diagnostics.restarts, models: models.length,
  })
  return epAfter
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/h5-dispose.mjs -->
```js
import { serveRequest } from '../../../plugin/src/serve/client.ts'
import { check, record, shared, sweepDSHSessions } from './lib.mjs'

export async function run() {
  const { manager, adapter } = shared()
  const epBefore = manager.endpoint
  const sessionCount = adapter.diagnostics.sessions.length
  const swept = await sweepDSHSessions(manager)
  await manager.dispose()
  await new Promise((r) => setTimeout(r, 1500))
  let refused = false
  if (epBefore) {
    try {
      await serveRequest(epBefore, 'GET', '/api/info')
    } catch { refused = true }
  } else {
    refused = true
  }
  check('h5 endpoint cleared', manager.endpoint === null, JSON.stringify(manager.endpoint))
  check('h5 connection refused', refused, 'serve still reachable after dispose')
  record('h5-dispose', {
    ok: true, turnSessions: sessionCount, sweptSessions: swept,
    diag: adapter.diagnostics,
  })
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P1/harness/run-all.mjs -->
```js
import fs from 'node:fs'
import path from 'node:path'
import { RESULTS_DIR } from './lib.mjs'
import * as h1 from './h1-single-turn.mjs'
import * as h2 from './h2-tool-block.mjs'
import * as h3 from './h3-abort.mjs'
import * as h4 from './h4-restart.mjs'
import * as h5 from './h5-dispose.mjs'

const steps = [
  ['h1-single-turn', h1.run],
  ['h2-tool-block', h2.run],
  ['h3-abort', h3.run],
  ['h4-restart', h4.run],
  ['h5-dispose', h5.run],
]
const summary = { startedAt: new Date().toISOString(), results: {}, failed: [] }
for (const [name, run] of steps) {
  try {
    const out = await run()
    summary.results[name] = { ok: true, out: out === undefined ? null : String(JSON.stringify(out)).slice(0, 300) }
  } catch (err) {
    summary.results[name] = { ok: false, error: err instanceof Error ? err.message : String(err) }
    summary.failed.push(name)
    break
  }
}
summary.finishedAt = new Date().toISOString()
summary.allPassed = summary.failed.length === 0
fs.mkdirSync(RESULTS_DIR, { recursive: true })
fs.writeFileSync(path.join(RESULTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('RUN-ALL', JSON.stringify(summary))
if (!summary.allPassed) process.exitCode = 1
```
<!-- END FILE -->

## 5. 固定常量表

| 常量 | 值 | 位置 |
| --- | --- | --- |
| providerId / 插件名 | `opencode-local` / `@hbk/dsh-opencode-local` | config.ts / package.json |
| 端口基址 / 扫描数 | 4096 / 16 | manager.ts PORT_SCAN |
| 就绪等待 / 轮询 | 60s / 500ms | manager.ts |
| 心跳 / 重启退避 / 重启上限 | 10s（harness 2s）/ 1s / 3 次 | manager.ts |
| 看门狗：首事件 / 流中静默 / 轮询步 | 30s / 120s / 200ms | local-adapter.ts / turn.ts |
| 每回合拒绝上限 | 20 | turn.ts |
| permissions 载荷 | `[{action:"*",resource:"*",effect:"ask"}]` | client.ts ASK_ALL |
| 会话 title | `dsh-<model>-<base36 时间戳>` | turn.ts |
| retryPolicy | maxRetries 4；retryable RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT/EMPTY_RESPONSE；1s→15s；jitter 0.2 | local-adapter.ts |
| 上下文/输出缺省 | 262144 / 32768（仅当 serve 模型信息缺失） | local-adapter.ts |
| harness 对话预算 | 计划 3 / 上限 6 | harness/lib.mjs CHAT_BUDGET |
| harness 数据目录 | `temp/P1/harness/data`（serve 日志）；`temp/P1/harness-results/`（结果） | harness/lib.mjs |

## 6. 验收

### 6.1 开发期自动验收（T2 run-all 断言，全部客观）

- [x 定义] h1：finish=stop、usage 有 inputTokens、text 非空、流以 finish 结尾、无 tool-call 块
- [x 定义] h2：finish 存在、无 tool-call 块、branch=asked-rejected 或 no-tool（记录 diagnostics）
- [x 定义] h3：finish.kind=aborted
- [x 定义] h4：kill 后 45s 内心跳自动重启（新 pid≠旧 pid）、模型列表恢复
- [x 定义] h5：endpoint 清空、dispose 后连接拒绝、dsh- 会话清扫
- summary.json 的 allPassed===true；对话实际使用 ≤3

### 6.2 DSH 实装验收（人工执行，T3 输出清单）

1. `cd plugin && npm run build`，确认 `lib/` 生成
2. 核实 DSH 版本 ≥ 0.1.7（设置 → 关于；不满足先升级）
3. `dsh plugin --profile web add <打包的 tgz>`（`npm pack` 产物）
4. 重启 DSH → 设置 → 插件：出现 `opencode-local` 条目
5. 模型选择器出现 `opencode-local` 分组及本机模型
6. 完整聊一回合；回答正常出现在 DSH
7. 诱导执行命令（如"用 bash 跑 echo test"）→ 被拒、无本机执行痕迹
8. 禁用/卸载插件 → 任务管理器确认 opencode serve 子进程消失
9. 重启 DSH → 插件自动恢复

## 7. 故障矩阵

| 现象 | 处置 |
| --- | --- |
| npm install 网络失败 | 重试 1 次；仍失败→停止报告 |
| tsc/build 报错 | **停止门**：说明 §4 代码有缺陷，报告人工，禁止提取者自行改码 |
| Node 拒绝加载 .ts（type-stripping 不可用） | 核对 Node ≥ 22.18；不满足→停止报告 |
| h1/h2/h3 传输层失败（fetch 异常） | run-all 整体重跑 1 次（预算上限 6 内）；其他失败不重跑 |
| h3 finish=stop（模型 2 秒内提前写完） | 视同传输层失败：run-all 重跑 1 次；仍复现则记录详情停止报告（中断路径需排查） |
| h5 sweptSessions 大于 turnSessions | 正常：run-all 起始未清扫的历史 dsh- 会话一并回收（前缀即所有权约定） |
| h1 EMPTY_RESPONSE / 限流 / 鉴权失败 | 记录失败详情，停止 T2 报告（是结果不是故障） |
| h4 45s 未恢复 | 记录 manager.diagnostics 与 harness/data/serve.log，停止报告 |
| 端口 4096–4111 全占 | manager 抛错，报告 |
| 模型列表为空 | 核实本机 `opencode` CLI 可用与登录态；停止报告 |
| run-all 中途断言失败 | 后续步骤跳过（break 语义已内建），汇总 failed 列表报告 |

## 附：本施工图的事实对照（全部已核实）

- 事件字段：`schema/src/session-event.ts`（Execution 244-264、Text 396-432、Reasoning 434-471、Tool 473-539、Base 29-31）
- 失败错误形状：`schema/src/session-error.ts:7-14`（{type,message,status?}）
- 模型能力：`schema/src/model.ts:78-90`（capabilities.input 数组）
- interrupt 路由：`protocol/src/groups/session.ts:672-689`
- permission reply：`protocol/src/groups/permission.ts:142-149`（decision: once|always|reject）
- schemastery 用法：对照参考插件 `src/config.ts:200-249`（Schema.object/.string().default/.number().step().min().max()/.array().default()）
- LlmAdapter 契约与 chunk 词汇表：参考插件 `src/adapter/zen-adapter.ts`（纯结构化契约）与 `src/adapter/events.ts:13-20`（usage+finish 收尾铁律）
- serve 启动/鉴权/凭据复用：`temp/P0/protocol-notes.md` V1/V2/V5（实测双证）