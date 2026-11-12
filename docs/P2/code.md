# 阶段 2 · 0.2.1 修复与增量 — debug 迭代施工图（code）

> 性质：**debug/迭代施工图**（非重写）。基线 = 当前仓库 `plugin/` 上的 0.2.0 代码。只改/增下列列出的文件；未列出的文件**保持不动**。
> 状态：待人工审核。审核通过前禁止执行本文件任何动作。
> 目标版本：**0.2.1**。
> 上游：`temp/P2/phase-2.md`（含人工补充 §2 ⑤⑥、D9/D10）、`temp/P2/impl-notes.md`（0.2.0 实施记录）。

## 0. 性质与硬约束

1. **这是增量修复**：只对 §2 列出的文件做整文件覆盖或新增；其余文件不动（不重新生成 0.2.0 的全部文件）。
2. 修复主线（D10）：**用户对话最高优先级**、**启动不自动探测**、**探测仅手动刷新强制**、**首装一次性 bootstrap（让路非阻塞）**、**对话链路永不 await 探测**。
3. 增量（D3/D9 补充）：**完全允许**（白名单 `*`）、**次数上限可调**（`toolMaxPerTurn`，默认 20，独立）、**思考档位选择器**（`thinkingVariant`，输入框右侧控件，按当前模型 variants）。
4. 代码全 TS；脚本逐字节提取；修改型文件=整文件覆盖为 §4 内容。
5. 版本号 0.2.1；构建仍走 `tsdown`（双入口配置不变）。
6. 先测后定：实现前用最小探针确认两件事（见 §3 T0）：①给会话模型带 `variant`，serve 是否按其执行；②composer 的 `modelSelection` 投影里当前模型字段名（`model` 还是其它）。据结果微调 §4 对应片段（其余不受影响）。

## 1. 能力门与编排

- **有子任务能力** → `mode=parallel`：T0 完成（脚手架/版本号 + config/types/priority）+ 探针通过后，并行四个实现子任务：A=catalog+manager(不变)+local-adapter；B=index+web/routes；C=ToolsTab+locales+status-paths；D=ThinkingLevelSelect+client/index。完成→T1 typecheck/build→T2 harness→T3 打包 0.2.1。
- **无** → `mode=serial`：同序串行。
- 两者产出逐字节相同（代码全来自 §4）；mode 记入 impl-notes。

```
能力门 → T0（主）：改 package.json 版本 0.2.1 + config/types/priority + 探针（variant/modelSelection 字段）
   ├─ A：catalog/probe.ts + adapter/local-adapter.ts
   ├─ B：index.ts + web/routes.ts
   ├─ C：client/ToolsTab.tsx + client/locales.ts + client/status-paths.ts
   └─ D：client/ThinkingLevelSelect.tsx + client/index.tsx
                四者完成 → T1 tsc + build → T2 harness（对话 ≤12）→ T3 npm pack 0.2.1 + impl-notes
```

## 2. 变更清单

**改动（整文件覆盖为 §4 内容）**：
- `src/config.ts`：+`toolMaxPerTurn`(volatile,默认20)、+`thinkingVariant`(volatile,默认'')；`liveToolPolicy` 的 maxPerTurn 读 toolMaxPerTurn；+`liveThinkingVariant`。
- `src/types.ts`：`ServeModelInfo` +`variants?`；`CatalogEntry` +`variants:string[]`。
- `src/catalog/probe.ts`：解析 variants；`refresh({probe?,reprobe?})`（默认 **probe=false 仅元数据**）；探测前检查「用户对话活跃」则等待让路；不阻塞。
- `src/adapter/local-adapter.ts`：会话进入/退出计入 UserActivity；按 thinkingVariant 给 modelRef 注入 variant；`listModels` 用 **meta-only** 刷新（绝不探测）。
- `src/index.ts`：启动**不自动探测**（缓存有探测→meta 刷新；首装无探测→一次性 bootstrap 探测，让路）；手动刷新走强制探测；接线 UserActivity 与 thinkingVariant。
- `src/web/routes.ts`：`publicModelRow` +`variants`。
- `src/client/status-paths.ts`：`WebModelRow` +`variants`。
- `src/client/ToolsTab.tsx`：+「完全允许」勾选（写 `toolAllowlist=['*']`，勾选时逐个置灰）+「每回合次数上限」数字输入（写 `toolMaxPerTurn`，独立）。
- `src/client/locales.ts`：+新增文案键（完全允许/次数上限/思考档位）。
- `src/client/index.tsx`：除 settings.section 外，再注册 composer 右侧思考档位控件。
- `package.json`：version → 0.2.1。

**新增**：
- `src/priority.ts`：`UserActivity`（对话活跃计数，供探测让路）。
- `src/client/ThinkingLevelSelect.tsx`：输入框右侧思考档位选择器。

**保持不变（明确不动）**：`src/serve/client.ts`、`src/serve/manager.ts`、`src/adapter/turn.ts`、`src/adapter/translate.ts`、`src/adapter/flatten.ts`、`src/api/server.ts`、`src/client/OpencodeLocalCard.tsx`、`src/client/ModelsTab.tsx`、`src/client/styles.ts`、`tsdown.config.ts`、`tsconfig*.json`、`cordis.patch.yml`。

## 3. 任务包

| 包 | 执行者 | 动作 | 验收 |
| --- | --- | --- | --- |
| T0 | 主 | 改 package.json 版本；提取 config/types/priority；跑探针（variant 生效 + modelSelection 字段名）；`npx tsc -p tsconfig.json` 基线 | 探针结论落 `temp/P2/probe-0.2.1.json`；基线 tsc 0 错 |
| A/B/C/D | 子任务(并行) | 提取 §4 对应文件 | 与 §4 一致 |
| T1 | 主 | `npm run typecheck && npm run build` | 双项目 0 错；lib/index.js + lib/client.js |
| T2 | 主 | 更新/运行 `temp/P2/impl-harness/*`（复用，加优先级用例） | allPassed；对话≤12 |
| T3 | 主 | `npm pack` → 0.2.1；写 impl-notes | tgz 就绪 |

> 探针 T0（先测后定）：①`POST /api/session` 带 `model:{id,providerID,variant:'<该模型拥有的档位>'}` 发最小 prompt，看是否 succeeded（确认 variant 被接受/执行）；②在 composer 控件处确认 `modelSelection` 投影的当前模型字段名（`model`/`id`）；据结果仅微调 §4 的 `ThinkingLevelSelect` 取字段与（如需）variant 值。

## 4. 内嵌代码（整文件覆盖/新增，逐字节提取）

<!-- BEGIN FILE: plugin/src/config.ts -->
```ts
import Schema from '@deepseek-ai/schemastery'
import type { ToolPolicy } from './types.ts'

export interface ResolvedPluginConfig {
  providerId: string
  opencodePath: string
  portBase: number
  modelWhitelist: string[]
  firstEventMs?: number
  idleMs?: number
  titlePrefix: string
  toolMode: boolean
  toolAllowlist: string[]
  toolMaxPerTurn: number
  thinkingVariant: string
  probeEnabled: boolean
  probeMaxPerSweep: number
  apiEnabled: boolean
  apiHost: string
  apiPort: number
  apiToken: string
}

export const Config = Schema.object({
  providerId: Schema.string().default('opencode-local'),
  opencodePath: Schema.string().default(''),
  portBase: Schema.number().step(1).min(1024).max(65000).default(4096),
  modelWhitelist: Schema.array(Schema.string()).default([]),
  firstEventMs: Schema.number().step(1).min(1000).max(600000),
  idleMs: Schema.number().step(1).min(1000).max(600000),
  titlePrefix: Schema.string().default('dsh-'),
  toolMode: Schema.boolean().default(false).volatile(),
  toolAllowlist: Schema.array(Schema.string()).default([]).volatile(),
  toolMaxPerTurn: Schema.number().step(1).min(1).max(1000).default(20).volatile(),
  thinkingVariant: Schema.string().default('').volatile(),
  probeEnabled: Schema.boolean().default(true),
  probeMaxPerSweep: Schema.number().step(1).min(1).max(200).default(30),
  apiEnabled: Schema.boolean().default(false),
  apiHost: Schema.string().default('127.0.0.1'),
  apiPort: Schema.number().step(1).min(1).max(65535).default(8787),
  apiToken: Schema.string().default(''),
})

export function unwrap<T>(v: T | undefined): T | undefined {
  if (v !== null && typeof v === 'object' && 'get' in (v as object) && typeof (v as { get?: unknown }).get === 'function') {
    return (v as unknown as { get: () => T }).get()
  }
  return v
}

function clampInt(v: number, min: number, max: number, d: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d
  const n = Math.trunc(v)
  return n < min ? min : n > max ? max : n
}

export function resolveConfig(input: Partial<ResolvedPluginConfig> | undefined | null): ResolvedPluginConfig {
  const c = input ?? {}
  const num = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const host = unwrap(c.apiHost)
  const port = unwrap(c.apiPort)
  const token = unwrap(c.apiToken)
  const allow = unwrap(c.toolAllowlist)
  return {
    providerId: typeof c.providerId === 'string' && c.providerId.trim().length > 0 ? c.providerId.trim() : 'opencode-local',
    opencodePath: typeof c.opencodePath === 'string' ? c.opencodePath : '',
    portBase: Number.isInteger(c.portBase) ? (c.portBase as number) : 4096,
    modelWhitelist: Array.isArray(c.modelWhitelist) ? c.modelWhitelist.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    firstEventMs: typeof c.firstEventMs === 'number' ? c.firstEventMs : undefined,
    idleMs: typeof c.idleMs === 'number' ? c.idleMs : undefined,
    titlePrefix: typeof c.titlePrefix === 'string' && c.titlePrefix.length > 0 ? c.titlePrefix : 'dsh-',
    toolMode: unwrap(c.toolMode) === true,
    toolAllowlist: Array.isArray(allow) ? allow.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    toolMaxPerTurn: clampInt(num(unwrap(c.toolMaxPerTurn), 20), 1, 1000, 20),
    thinkingVariant: (() => { const v = unwrap(c.thinkingVariant); return typeof v === 'string' ? v : '' })(),
    probeEnabled: unwrap(c.probeEnabled) !== false,
    probeMaxPerSweep: num(unwrap(c.probeMaxPerSweep), 30),
    apiEnabled: unwrap(c.apiEnabled) === true,
    apiHost: typeof host === 'string' && host.length > 0 ? host : '127.0.0.1',
    apiPort: num(port, 8787),
    apiToken: typeof token === 'string' ? token : '',
  }
}

export function liveToolPolicy(config: Partial<ResolvedPluginConfig> | undefined | null): ToolPolicy {
  const c = config ?? {}
  const mode = unwrap(c.toolMode) === true
  const allow = unwrap(c.toolAllowlist)
  const max = unwrap(c.toolMaxPerTurn)
  return {
    mode: mode ? 'allowlist' : 'off',
    allow: Array.isArray(allow) ? allow.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    maxPerTurn: clampInt(typeof max === 'number' ? max : 20, 1, 1000, 20),
  }
}

export function liveThinkingVariant(config: Partial<ResolvedPluginConfig> | undefined | null): string {
  const c = config ?? {}
  const v = unwrap(c.thinkingVariant)
  return typeof v === 'string' ? v : ''
}

export function liveApiConfig(config: Partial<ResolvedPluginConfig> | undefined | null): { enabled: boolean; host: string; port: number; token: string } {
  const c = config ?? {}
  const host = unwrap(c.apiHost)
  const port = unwrap(c.apiPort)
  const token = unwrap(c.apiToken)
  return {
    enabled: unwrap(c.apiEnabled) === true,
    host: typeof host === 'string' && host.length > 0 ? host : '127.0.0.1',
    port: typeof port === 'number' && Number.isFinite(port) ? port : 8787,
    token: typeof token === 'string' ? token : '',
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/priority.ts -->
```ts
export class UserActivity {
  private active = 0

  enter(): void {
    this.active += 1
  }

  leave(): void {
    if (this.active > 0) this.active -= 1
  }

  get isActive(): boolean {
    return this.active > 0
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/package.json -->
```json
{
  "name": "@hbk/dsh-opencode-local",
  "version": "0.2.1",
  "description": "Drive the local real opencode CLI from DeepSeek Harness (DSH). No spoofing: the official CLI binary and the user's own login are reused as-is.",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "package.json"],
  "engines": { "node": ">=20" },
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
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.client.json"
  },
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.4"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "~18.3.31",
    "react": "^18.3.1",
    "tsdown": "^0.22.2",
    "typescript": "^5.9.3"
  }
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
  variant?: string
}

export interface ServeModelInfo {
  id: string
  modelID?: string
  providerID: string
  name?: string
  enabled?: boolean
  capabilities?: { tools?: boolean; input?: string[]; output?: string[] }
  limit?: { context?: number; input?: number; output?: number }
  cost?: Array<{ tier?: { type?: string; size?: number }; input?: number; output?: number; cache?: { read?: number; write?: number } }>
  variants?: Array<{ id?: string }>
}

export interface ServeEventData {
  sessionID?: string
  id?: unknown
  ordinal?: number
  delta?: string
  text?: string
  name?: string
  reason?: string
  error?: { type?: string; message?: string; status?: number }
  input?: Record<string, unknown>
  content?: Array<{ type?: string; text?: string }>
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
  toolApproved: number
  sessions: string[]
}

export interface ModelProbeResult {
  ok: boolean
  checkedAt: number
  error?: { code: string; message: string }
}

export interface CatalogEntry {
  id: string
  name: string
  providerID: string
  modelRef: ModelRef
  contextWindow: number
  maxOutput: number
  inputModalities: string[]
  variants: string[]
  free: boolean
  probe: ModelProbeResult | null
}

export interface CatalogSnapshot {
  updatedAt: number
  entries: CatalogEntry[]
}

export interface ToolPolicy {
  mode: 'off' | 'allowlist'
  allow: string[]
  maxPerTurn: number
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/catalog/probe.ts -->
```ts
import fs from 'node:fs'
import path from 'node:path'
import type { CatalogEntry, CatalogSnapshot, ModelProbeResult, ServeModelInfo } from '../types.ts'
import { listModels, probeModel, toModelRef } from '../serve/client.ts'
import type { ServeManager } from '../serve/manager.ts'
import type { UserActivity } from '../priority.ts'
import { sleep } from '../priority.ts'

const DEFAULT_CTX = 262144
const DEFAULT_MAX = 32768

export interface CatalogOptions {
  probeEnabled: boolean
  maxPerSweep: number
  cachePath: string
  activity: UserActivity
}

function isFree(m: ServeModelInfo): boolean {
  const cost = Array.isArray(m.cost) ? m.cost : []
  return cost.length > 0 && cost.every((c) =>
    Number(c.input) === 0 && Number(c.output) === 0 && Number(c.cache?.read) === 0 && Number(c.cache?.write) === 0)
}

function toEntry(m: ServeModelInfo, probe: ModelProbeResult | null): CatalogEntry {
  const modalities = Array.isArray(m.capabilities?.input) && m.capabilities.input.length > 0 ? m.capabilities.input : ['text']
  const variants = Array.isArray(m.variants)
    ? m.variants.map((v) => (typeof v?.id === 'string' ? v.id : '')).filter((id) => id.length > 0)
    : []
  return {
    id: m.id,
    name: m.name ?? m.id,
    providerID: m.providerID,
    modelRef: toModelRef(m),
    contextWindow: typeof m.limit?.context === 'number' && m.limit.context > 0 ? m.limit.context : DEFAULT_CTX,
    maxOutput: typeof m.limit?.output === 'number' && m.limit.output > 0 ? m.limit.output : DEFAULT_MAX,
    inputModalities: modalities,
    variants,
    free: isFree(m),
    probe,
  }
}

export class ModelCatalog {
  private mgr: ServeManager
  private opts: CatalogOptions
  private entries: CatalogEntry[] = []
  private updatedAt = 0
  private refreshing: Promise<void> | null = null

  constructor(mgr: ServeManager, opts: CatalogOptions) {
    this.mgr = mgr
    this.opts = opts
  }

  loadCache(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.opts.cachePath, 'utf8')) as CatalogSnapshot
      if (raw && Array.isArray(raw.entries)) {
        this.entries = raw.entries.map((e) => ({ ...e, variants: Array.isArray(e.variants) ? e.variants : [], probe: e.probe ?? null }))
        this.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
      }
    } catch { /* no cache */ }
  }

  saveCache(): void {
    try {
      fs.mkdirSync(path.dirname(this.opts.cachePath), { recursive: true })
      const snap: CatalogSnapshot = { updatedAt: this.updatedAt, entries: this.entries }
      fs.writeFileSync(this.opts.cachePath, JSON.stringify(snap, null, 2))
    } catch { /* ignore */ }
  }

  snapshot(): CatalogSnapshot {
    return { updatedAt: this.updatedAt, entries: this.entries.map((e) => ({ ...e })) }
  }

  entry(id: string): CatalogEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  selectable(): CatalogEntry[] {
    return this.entries.filter((e) => e.free && e.probe !== null && e.probe.ok === true)
  }

  hasProbeData(): boolean {
    return this.entries.some((e) => e.probe !== null)
  }

  /**
   * Refresh model metadata always; probe only when opts.probe === true.
   * Default (no opts) = metadata only, never probes (startup / listModels safe).
   */
  async refresh(opts: { probe?: boolean; reprobe?: boolean } = {}): Promise<void> {
    if (this.refreshing) await this.refreshing
    this.refreshing = this.doRefresh(opts).finally(() => { this.refreshing = null })
    return this.refreshing
  }

  private async doRefresh(opts: { probe?: boolean; reprobe?: boolean }): Promise<void> {
    const ep = await this.mgr.ensureReady()
    const all = await listModels(ep)
    if (all.length === 0) return
    const prev = new Map(this.entries.map((e) => [e.id, e]))
    const next: CatalogEntry[] = []
    for (const m of all) {
      if (m.enabled === false) continue
      const old = prev.get(m.id)
      const keepProbe = !opts.reprobe && old && old.probe ? old.probe : null
      next.push(toEntry(m, keepProbe))
    }
    this.entries = next
    if (opts.probe === true && this.opts.probeEnabled) {
      let budget = this.opts.maxPerSweep
      for (const e of this.entries) {
        if (budget <= 0) break
        if (!e.free) continue
        if (e.probe && e.probe.ok === true && opts.reprobe !== true) continue
        // User turns have top priority: wait until idle before each probe.
        while (this.opts.activity.isActive) await sleep(500)
        budget -= 1
        try {
          const r = await probeModel(ep, e.modelRef)
          e.probe = { ok: r.ok, checkedAt: Date.now(), ...(r.error ? { error: r.error } : {}) }
        } catch (err) {
          e.probe = { ok: false, checkedAt: Date.now(), error: { code: 'PROBE_ERROR', message: String(err) } }
        }
        await sleep(200)
      }
    }
    this.updatedAt = Date.now()
    this.saveCache()
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/adapter/local-adapter.ts -->
```ts
import type { ServeManager } from '../serve/manager.ts'
import type { ModelCatalog } from '../catalog/probe.ts'
import type { UserActivity } from '../priority.ts'
import { runTurn } from './turn.ts'
import type {
  AdapterDiagnostics,
  CatalogEntry,
  HarnessChunk,
  HarnessGenerateOptions,
  ModelRef,
  ResolvedModelInfo,
  ToolPolicy,
} from '../types.ts'

export interface AdapterConfig {
  providerId: string
  modelWhitelist: string[]
  titlePrefix: string
  firstEventMs?: number
  idleMs?: number
  toolPolicy: () => ToolPolicy
  thinkingVariant: () => string
  activity: UserActivity
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

function modalitiesOf(entry: CatalogEntry | undefined): string[] {
  return entry && entry.inputModalities.length > 0 ? entry.inputModalities : ['text']
}

function refOf(entry: CatalogEntry, thinkingVariant: string): ModelRef {
  if (thinkingVariant.length > 0 && thinkingVariant !== 'default' && entry.variants.includes(thinkingVariant)) {
    return { ...entry.modelRef, variant: thinkingVariant }
  }
  return entry.modelRef
}

export class LocalAdapter {
  private cfg: AdapterConfig
  private manager: ServeManager
  private catalog: ModelCatalog
  readonly diagnostics: AdapterDiagnostics = { permissionAsked: 0, permissionRejected: 0, toolEvents: 0, toolApproved: 0, sessions: [] }

  constructor(cfg: AdapterConfig, manager: ServeManager, catalog: ModelCatalog) {
    this.cfg = cfg
    this.manager = manager
    this.catalog = catalog
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
    await this.catalog.refresh({ probe: false })
    return this.catalog.selectable().map((e) => e.id).filter((id) => this.#whitelistAllows(id))
  }

  async listModels(provider: string): Promise<Array<{ provider: string; id: string; name: string; inputModalities: string[] }>> {
    if (this.catalog.snapshot().entries.length === 0) {
      try { await this.catalog.refresh({ probe: false }) } catch { /* keep whatever cache has */ }
    }
    const out: Array<{ provider: string; id: string; name: string; inputModalities: string[] }> = []
    for (const e of this.catalog.selectable()) {
      if (!this.#whitelistAllows(e.id)) continue
      out.push({ provider, id: e.id, name: e.name, inputModalities: modalitiesOf(e) })
    }
    return out
  }

  resolveModel(provider: string, model: string): ResolvedModelInfo {
    const e = this.catalog.entry(model)
    return {
      provider,
      id: model,
      name: e?.name ?? model,
      inputModalities: modalitiesOf(e),
      context: { contextWindow: e?.contextWindow ?? DEFAULT_CONTEXT_WINDOW },
      defaultMaxTokens: e?.maxOutput ?? DEFAULT_MAX_TOKENS,
    }
  }

  async #ensureEntry(model: string): Promise<CatalogEntry> {
    const hit = this.catalog.entry(model)
    if (hit) return hit
    await this.catalog.refresh({ probe: false })
    const hit2 = this.catalog.entry(model)
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
    this.cfg.activity.enter()
    try {
      const ep = await this.manager.ensureReady()
      const entry = await this.#ensureEntry(options.model)
      const modelRef = refOf(entry, this.cfg.thinkingVariant())
      yield* runTurn(
        ep,
        {
          titlePrefix: this.cfg.titlePrefix,
          firstEventMs: this.cfg.firstEventMs ?? DEFAULT_FIRST_EVENT_MS,
          idleMs: this.cfg.idleMs ?? DEFAULT_IDLE_MS,
          toolPolicy: this.cfg.toolPolicy,
        },
        options,
        modelRef,
        this.diagnostics,
      )
    } finally {
      this.cfg.activity.leave()
    }
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/index.ts -->
```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig, liveToolPolicy, liveThinkingVariant, liveApiConfig, type ResolvedPluginConfig } from './config.ts'
import { ServeManager, defaultManagerConfig } from './serve/manager.ts'
import { ModelCatalog } from './catalog/probe.ts'
import { LocalAdapter } from './adapter/local-adapter.ts'
import { registerWebRoutes } from './web/routes.ts'
import { ApiServer } from './api/server.ts'
import { errorMessage } from './serve/client.ts'
import { UserActivity } from './priority.ts'

export interface PluginContext {
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
  llm?: { registerAdapter(providers: string[], adapter: unknown): unknown }
  effect?(fn: () => () => void): unknown
  inject?(services: string[], callback: (ctx: any) => void | Promise<void>): unknown
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
  const dataDir = join(homedir(), '.dsh-opencode-local')
  const activity = new UserActivity()
  const manager = new ServeManager(defaultManagerConfig({ opencodePath: cfg.opencodePath, portBase: cfg.portBase, dataDir }))
  const catalog = new ModelCatalog(manager, {
    probeEnabled: cfg.probeEnabled,
    maxPerSweep: cfg.probeMaxPerSweep,
    cachePath: join(dataDir, 'catalog.json'),
    activity,
  })
  catalog.loadCache()
  const adapter = new LocalAdapter(
    {
      providerId: cfg.providerId,
      modelWhitelist: cfg.modelWhitelist,
      titlePrefix: cfg.titlePrefix,
      firstEventMs: cfg.firstEventMs,
      idleMs: cfg.idleMs,
      toolPolicy: () => liveToolPolicy(config),
      thinkingVariant: () => liveThinkingVariant(config),
      activity,
    },
    manager,
    catalog,
  )
  ctx.llm.registerAdapter([cfg.providerId], adapter)
  ctx.logger.info(`opencode-local: adapter registered for "${cfg.providerId}"`)

  ctx.inject?.(['settings'], (sctx: any) => {
    const settings = sctx.settings ?? sctx.get?.('settings')
    if (settings?.configure) ctx.effect?.(() => settings.configure({ auto: true }, (ctx as { fiber?: unknown }).fiber))
  })

  registerWebRoutes(ctx, {
    catalog,
    refresh: () => catalog.refresh({ probe: true, reprobe: true }),
  })

  let api: ApiServer | null = null
  const apiCfg = liveApiConfig(config)
  if (apiCfg.enabled) {
    api = new ApiServer(apiCfg, adapter)
    api
      .start()
      .then(({ port }) => ctx.logger.info(`opencode-local: API listening on ${apiCfg.host}:${port}`))
      .catch((err) => ctx.logger.warn(`opencode-local: API start failed: ${errorMessage(err)}`))
  }

  const maybeEffect = ctx.effect
  if (typeof maybeEffect === 'function') {
    maybeEffect.call(ctx, () => () => {
      if (api) void api.stop()
      void manager.dispose()
    })
  }

  // Startup: NEVER auto-probe in the normal case. Meta-only refresh (uses cache probes).
  // First install (no probe data yet): ONE background bootstrap probe that yields to user turns.
  const hadProbe = catalog.hasProbeData()
  void catalog
    .refresh({ probe: !hadProbe })
    .then(() => {
      const snap = catalog.snapshot()
      ctx.logger.info(`opencode-local: ${catalog.selectable().length} selectable models (of ${snap.entries.length} free; bootstrap=${!hadProbe})`)
    })
    .catch((err) => ctx.logger.warn(`opencode-local: catalog refresh failed: ${errorMessage(err)}`))
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/web/routes.ts -->
```ts
import type { ModelCatalog } from '../catalog/probe.ts'
import type { CatalogEntry } from '../types.ts'

export interface WebRouteDeps {
  catalog: ModelCatalog
  refresh: () => Promise<void>
}

export function publicModelRow(e: CatalogEntry): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    contextWindow: e.contextWindow,
    maxOutput: e.maxOutput,
    inputModalities: e.inputModalities,
    variants: e.variants,
    free: e.free,
    selectable: e.free && e.probe !== null && e.probe.ok === true,
    probe: e.probe ? { ok: e.probe.ok, checkedAt: e.probe.checkedAt, error: e.probe.error ?? null } : null,
  }
}

export function registerWebRoutes(ctx: any, deps: WebRouteDeps): void {
  ctx.inject?.(['webServer'], (webCtx: any) => {
    const ws = webCtx.webServer ?? webCtx.get?.('webServer')
    if (!ws?.register) return
    const send = (res: any, status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    const payload = (): Record<string, unknown> => {
      const snap = deps.catalog.snapshot()
      return { updatedAt: snap.updatedAt, models: snap.entries.map(publicModelRow) }
    }
    ws.register({
      kind: 'exact',
      path: '/plugins/opencode-local/models',
      handler: (req: any, res: any) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
        send(res, 200, payload())
      },
    })
    ws.register({
      kind: 'exact',
      path: '/plugins/opencode-local/models/refresh',
      handler: async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
        try {
          await deps.refresh()
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
        send(res, 200, payload())
      },
    })
  })
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/client/status-paths.ts -->
```ts
export const MODELS_PATH = '/plugins/opencode-local/models'
export const MODELS_REFRESH_PATH = '/plugins/opencode-local/models/refresh'

export interface WebModelRow {
  id: string
  name: string
  contextWindow: number
  maxOutput: number
  inputModalities: string[]
  variants: string[]
  free: boolean
  selectable: boolean
  probe: { ok: boolean; checkedAt: number; error: { code: string; message: string } | null } | null
}

export interface WebModelsPayload {
  updatedAt: number
  models: WebModelRow[]
}

export const TOOL_ACTIONS = ['shell', 'edit', 'read', 'webfetch', 'websearch', 'grep', 'glob'] as const
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/client/ToolsTab.tsx -->
```tsx
import { createElement as h, useState } from 'react'
import { TOOL_ACTIONS } from './status-paths.ts'

export function ToolsTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const committed = scope?.getSnapshot?.().value ?? {}
  const committedMode = committed.toolMode === true
  const committedAllow: string[] = Array.isArray(committed.toolAllowlist) ? committed.toolAllowlist : []
  const committedMax = typeof committed.toolMaxPerTurn === 'number' ? committed.toolMaxPerTurn : 20
  const [mode, setMode] = useState<boolean | undefined>(undefined)
  const [allow, setAllow] = useState<string[] | undefined>(undefined)
  const [max, setMax] = useState<number | undefined>(undefined)
  const modeShown = mode ?? committedMode
  const allowShown = allow ?? committedAllow
  const maxShown = max ?? committedMax
  const allowAll = allowShown.includes('*')
  const writeMode = async (next: boolean): Promise<void> => {
    setMode(next)
    try { await scope?.set?.('toolMode', next) } catch { /* observe on reopen */ }
  }
  const writeAllow = async (next: string[]): Promise<void> => {
    setAllow(next)
    try { await scope?.set?.('toolAllowlist', next) } catch { /* observe on reopen */ }
  }
  const writeMax = async (next: number): Promise<void> => {
    const n = Math.max(1, Math.min(1000, Math.trunc(next) || 20))
    setMax(n)
    try { await scope?.set?.('toolMaxPerTurn', n) } catch { /* observe on reopen */ }
  }
  const toggleAllowAll = (on: boolean): void => { void writeAllow(on ? ['*'] : []) }
  const toggleAction = (action: string, on: boolean): void => {
    if (allowAll) return
    const set = new Set(allowShown)
    if (on) set.add(action)
    else set.delete(action)
    void writeAllow([...set])
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('p', { className: 'olp-hint' }, t('tools.hint')),
    h('label', { className: 'olp-toggle' },
      h('input', { type: 'checkbox', checked: modeShown, onChange: (e: any) => void writeMode(e.target.checked) }),
      t('tools.global')),
    h('label', { className: 'olp-toggle' + (modeShown ? '' : ' olp-disabled') },
      h('input', { type: 'checkbox', checked: allowAll, disabled: !modeShown, onChange: (e: any) => toggleAllowAll(e.target.checked) }),
      t('tools.allowAll')),
    h('p', { className: 'olp-hint' }, t('tools.allowAllHint')),
    ...TOOL_ACTIONS.map((a) => h('label', { key: a, className: 'olp-toggle' + (modeShown && !allowAll ? '' : ' olp-disabled') },
      h('input', { type: 'checkbox', checked: allowAll ? true : allowShown.includes(a), disabled: !modeShown || allowAll, onChange: (e: any) => toggleAction(a, e.target.checked) }),
      t('tools.action.' + a),
    )),
    h('label', { className: 'olp-toggle' },
      t('tools.maxPerTurn'),
      h('input', { type: 'number', min: 1, max: 1000, value: maxShown, disabled: !modeShown, onChange: (e: any) => void writeMax(Number(e.target.value)), style: { width: '80px' } })),
    h('p', { className: 'olp-hint' }, t('tools.maxPerTurnHint')),
    h('p', { className: 'olp-hint' }, t('tools.saveHint')),
  )
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/client/locales.ts -->
```ts
export const zh = {
  'nav.panel': 'opencode-local',
  'tab.models': '可用模型',
  'tab.tools': '可用工具',
  'models.hint': '只列免费模型；对话框模型选择器只显示「免费且探测通过」者。',
  'models.col.model': '模型',
  'models.col.context': '上下文',
  'models.col.status': '探测',
  'models.refresh': '重新探测',
  'models.loading': '加载中…',
  'models.none': '暂无免费模型',
  'status.ok': '可用',
  'status.fail': '不可用',
  'status.pending': '未探测',
  'tools.hint': '开启后模型可调用工具；白名单按动作放行。默认关闭更安全。',
  'tools.global': '启用工具调用（总开关）',
  'tools.allowAll': '完全允许（放行所有工具）',
  'tools.allowAllHint': '勾选后不再按单项过滤、放行全部工具；每回合次数上限仍单独生效。请仅在能确保安全时使用。',
  'tools.maxPerTurn': '每回合工具次数上限：',
  'tools.maxPerTurnHint': '与「完全允许」相互独立：无论是否完全允许，每回合最多执行这么多次工具调用。',
  'tools.action.shell': 'shell（执行命令）',
  'tools.action.edit': 'edit（写/改文件）',
  'tools.action.read': 'read（读取文件）',
  'tools.action.webfetch': 'webfetch（抓取网页）',
  'tools.action.websearch': 'websearch（网页搜索）',
  'tools.action.grep': 'grep（内容搜索）',
  'tools.action.glob': 'glob（文件查找）',
  'tools.saveHint': '开关改动即时保存。',
  'thinking.label': '思考档位',
  'thinking.default': 'default（模型默认）',
  'thinking.loading': '加载中…',
  'thinking.hint': '按当前模型的可选档位；选 default 用模型默认。',
}
export const en: Record<keyof typeof zh, string> = {
  'nav.panel': 'opencode-local',
  'tab.models': 'Models',
  'tab.tools': 'Tools',
  'models.hint': 'Free models only; the chat model picker shows only free AND probe-passed models.',
  'models.col.model': 'Model',
  'models.col.context': 'Context',
  'models.col.status': 'Probe',
  'models.refresh': 'Re-probe',
  'models.loading': 'Loading…',
  'models.none': 'No free models',
  'status.ok': 'Usable',
  'status.fail': 'Unavailable',
  'status.pending': 'Not probed',
  'tools.hint': 'When enabled the model may call tools; the allowlist gates by action. Off is safer.',
  'tools.global': 'Enable tool calling (master)',
  'tools.allowAll': 'Allow all tools',
  'tools.allowAllHint': 'Bypasses per-action filtering and allows every tool; the per-turn cap still applies. Use only when you can ensure safety.',
  'tools.maxPerTurn': 'Per-turn tool cap:',
  'tools.maxPerTurnHint': 'Independent of Allow all: at most this many tool calls per turn, regardless.',
  'tools.action.shell': 'shell (run commands)',
  'tools.action.edit': 'edit (write/edit files)',
  'tools.action.read': 'read (read files)',
  'tools.action.webfetch': 'webfetch (fetch pages)',
  'tools.action.websearch': 'websearch (web search)',
  'tools.action.grep': 'grep (content search)',
  'tools.action.glob': 'glob (find files)',
  'tools.saveHint': 'Changes save immediately.',
  'thinking.label': 'Thinking level',
  'thinking.default': 'default (model default)',
  'thinking.loading': 'Loading…',
  'thinking.hint': 'Options follow the current model; default uses the model default.',
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/client/ThinkingLevelSelect.tsx -->
```tsx
import { createElement as h, useEffect, useState } from 'react'
import { MODELS_PATH } from './status-paths.ts'
import type { WebModelsPayload } from './status-paths.ts'

interface ModelSelectionLike {
  lastUsed?: { provider?: unknown; model?: unknown; id?: unknown } | null
  next?: { provider?: unknown; model?: unknown; id?: unknown } | null
}

export function ThinkingLevelSelect(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  // `useProjection` is a standard slot hook injected by the host for session slots
  // (reference: workbuddy ComposerCreditsGate reads `modelSelection` the same way).
  const useProjection = props.useProjection
  const [variants, setVariants] = useState<string[]>([])
  const [local, setLocal] = useState<string | undefined>(undefined)
  const projection = typeof useProjection === 'function'
    ? (useProjection('modelSelection') as ModelSelectionLike | undefined)
    : undefined
  const cur = projection?.next ?? projection?.lastUsed
  const provider = typeof cur?.provider === 'string' ? cur.provider : ''
  const modelId = typeof cur?.model === 'string' ? cur.model : typeof cur?.id === 'string' ? cur.id : ''
  useEffect(() => {
    if (provider !== 'opencode-local' || modelId.length === 0) {
      setVariants([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(MODELS_PATH, { credentials: 'same-origin' })
        const body = await r.json() as WebModelsPayload
        const row = (body.models ?? []).find((m) => m.id === modelId)
        if (!cancelled) setVariants(Array.isArray(row?.variants) ? row.variants : [])
      } catch {
        if (!cancelled) setVariants([])
      }
    })()
    return () => { cancelled = true }
  }, [provider, modelId])
  const committed = scope?.getSnapshot?.().value ?? {}
  const current = typeof committed.thinkingVariant === 'string' && committed.thinkingVariant.length > 0 ? committed.thinkingVariant : 'default'
  const shown = local ?? current
  const opts = ['default', ...variants.filter((v) => v !== 'default')]
  const write = async (v: string): Promise<void> => {
    setLocal(v)
    try { await scope?.set?.('thinkingVariant', v === 'default' ? '' : v) } catch { /* observe on reopen */ }
  }
  if (provider !== 'opencode-local') return null
  return h('label', { className: 'olp-thinking', title: t('thinking.hint'), style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' } },
    h('span', null, t('thinking.label')),
    h('select', { value: shown, onChange: (e: any) => void write(e.target.value), style: { fontSize: '12px' } },
      ...opts.map((o) => h('option', { key: o, value: o }, o === 'default' ? t('thinking.default') : o))),
  )
}
```
<!-- END FILE -->

<!-- BEGIN FILE: plugin/src/client/index.tsx -->
```tsx
import { OpencodeLocalCard } from './OpencodeLocalCard.tsx'
import { ThinkingLevelSelect } from './ThinkingLevelSelect.tsx'
import { zh, en } from './locales.ts'
import { CARD_CSS } from './styles.ts'

export const name = 'opencode-local-client'
export const inject = ['slots', 'locale']

export function apply(ctx: any): void {
  try {
    if (typeof document !== 'undefined') {
      const id = 'opencode-local/css'
      let tag = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
      if (!tag) { tag = document.createElement('style'); tag.dataset.pluginCss = id; document.head.appendChild(tag) }
      tag.textContent = CARD_CSS
    }
    const ns = 'settings.opencode-local'
    ctx.effect?.(() => ctx.locale.register(ns, { zh, en }))
    const t = ctx.locale.bind(ns)
    const forms = ctx.get?.('configForms')
    let scope: any = undefined
    let cardDisposer: any = undefined
    let composerDisposer: any = undefined
    const registerCard = () => {
      if (cardDisposer) { try { cardDisposer() } catch { /* ignore */ } }
      cardDisposer = ctx.slots.register({
        name: 'settings.section', id: 'opencode-local', order: 50,
        label: () => t('nav.panel'), locale: ns, inject: () => ({ t, scope, surface: 'settings' }),
      }, OpencodeLocalCard)
    }
    const registerComposer = () => {
      if (composerDisposer) { try { composerDisposer() } catch { /* ignore */ } }
      composerDisposer = ctx.slots.register({
        name: 'conversation.input.right', id: 'opencode-local-thinking', order: 5, locale: ns,
        inject: () => ({ t, scope }),
      }, ThinkingLevelSelect)
    }
    ctx.slots.inject('settings.section', () => {
      registerCard()
      if (forms?.whileServed) {
        ctx.effect?.(() => forms.whileServed(
          ['opencode-local', ns, 'include:opencode-local'],
          (served: Set<string>) => {
            const found = [...served].find((x: string) => /opencode-local/.test(x))
            scope = found ? forms.get(found) : undefined
            registerCard()
            registerComposer()
            return () => { /* disposers cleaned below */ }
          },
        ))
      } else if (forms?.get) {
        scope = forms.get('opencode-local')
        registerCard()
        registerComposer()
      }
      return () => {
        try { cardDisposer?.() } catch { /* ignore */ }
        try { composerDisposer?.() } catch { /* ignore */ }
      }
    })
    ctx.slots.inject('conversation.input.right', () => {
      registerComposer()
      return () => { try { composerDisposer?.() } catch { /* ignore */ } }
    })
  } catch (e) {
    console.error('[opencode-local] client card failed to load:', e)
  }
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/impl-harness/lib.mjs -->
```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { ServeManager, defaultManagerConfig } from '../../../plugin/src/serve/manager.ts'
import { ModelCatalog } from '../../../plugin/src/catalog/probe.ts'
import { LocalAdapter } from '../../../plugin/src/adapter/local-adapter.ts'
import { UserActivity } from '../../../plugin/src/priority.ts'

export const H = path.dirname(fileURLToPath(import.meta.url))
export const RAW = path.join(H, '..', 'impl-harness-results')
export const BUDGET = { used: 0, cap: 12 }

export function makeRuntime() {
  const activity = new UserActivity()
  const policy = { mode: 'off', allow: [], maxPerTurn: 20 }
  const manager = new ServeManager(defaultManagerConfig({ opencodePath: '', portBase: 4096, dataDir: path.join(H, 'data') }))
  const catalog = new ModelCatalog(manager, { probeEnabled: true, maxPerSweep: 30, cachePath: path.join(H, 'data', 'catalog.json'), activity })
  const adapter = new LocalAdapter({ providerId: 'opencode-local', modelWhitelist: [], titlePrefix: 'dsh-h-', toolPolicy: () => policy, thinkingVariant: () => '', activity }, manager, catalog)
  return { manager, catalog, adapter, policy, activity }
}

export function spend() {
  BUDGET.used += 1
  if (BUDGET.used > BUDGET.cap) throw new Error('budget exceeded ' + BUDGET.used)
}

export function record(name, data) {
  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(path.join(RAW, name + '.json'), JSON.stringify(data, null, 2))
  console.log(name, JSON.stringify(data).slice(0, 400))
}

export function check(name, ok, detail) {
  if (!ok) throw new Error('check failed: ' + name + ' — ' + detail)
}

export async function collectStream(gen) {
  const chunks = []
  for await (const c of gen) chunks.push(c)
  const finish = chunks.find((c) => c.type === 'finish')?.reason ?? null
  const usage = chunks.find((c) => c.type === 'usage')?.usage ?? null
  const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
  const toolBlocks = chunks.filter((c) => c.type === 'block-start' && c.blockType === 'tool-call').length
  const endsWithFinish = chunks.length > 0 && chunks[chunks.length - 1].type === 'finish'
  return { chunks, finish, usage, text, toolBlocks, endsWithFinish }
}

export function firstModel(runtime) {
  const sel = runtime.catalog.selectable()
  return sel.length > 0 ? sel[0].id : ''
}
```
<!-- END FILE -->

<!-- BEGIN FILE: temp/P2/impl-harness/h1-free-filter.mjs -->
```js
import { check, record } from './lib.mjs'

export async function run(runtime) {
  await runtime.catalog.refresh({ probe: true })
  const snap = runtime.catalog.snapshot()
  const sel = runtime.catalog.selectable()
  check('h1 free models exist', snap.entries.some((e) => e.free), 'no free models')
  for (const e of sel) {
    check('h1 selectable free', e.free, e.id)
    check('h1 selectable probed ok', e.probe !== null && e.probe.ok === true, e.id + ' ' + JSON.stringify(e.probe))
  }
  const models = await runtime.adapter.listModels('opencode-local')
  const selIds = sel.map((e) => e.id).sort()
  const modelIds = models.map((m) => m.id).sort()
  check('h1 listModels == selectable', JSON.stringify(selIds) === JSON.stringify(modelIds), JSON.stringify({ selIds, modelIds }))
  record('h1-free-filter', { total: snap.entries.length, free: snap.entries.filter((e) => e.free).length, selectable: sel.length, selIds })
}
```
<!-- END FILE -->

## 5. 固定常量表（0.2.1 增量）

| 常量 | 值 | 位置 |
| --- | --- | --- |
| 版本 | 0.2.1 | package.json |
| 探测让路轮询 / 探测间隔 | 500ms / 200ms | catalog/probe.ts |
| toolMaxPerTurn | 默认 20，范围 1–1000（volatile） | config.ts |
| thinkingVariant | 默认 ''（=default），volatile | config.ts |
| 完全允许 | toolAllowlist=['*']（勾选时逐项置灰；不影响 maxPerTurn） | ToolsTab.tsx / config liveToolPolicy |
| 启动探测 | 有缓存探测→meta 刷新（不探测）；首装→一次性 bootstrap（让路） | index.ts（hadProbe） |
| 手动刷新 | `refresh({probe:true, reprobe:true})`（遇对话让路） | web/routes.ts + catalog |
| 思考档位来源 | 当前模型 `variants`（composer 经 `useProjection('modelSelection')` 取 provider/model） | ThinkingLevelSelect.tsx |

## 6. 验收

### 6.1 开发期（T2 自动）
- [ ] 启动路径：`catalog.hasProbeData()` 有缓存→refresh 不探测（0 模型请求）；无缓存→bootstrap 探测一次
- [ ] h1：`refresh({probe:true})` 后 selectable 全为 free∧probe.ok；listModels==selectable
- [ ] h2/h3/h4：工具/流式/API 回归通过（与 0.2.0 相同）
- [ ] 优先级：探测循环在 `activity.isActive` 时等待（代码审查 + DSH 实测；harness 不做昂贵真实占位测试）
- [ ] typecheck 双项目 0 错；build 产出 lib/index.js + lib/client.js（含 ModuleLoader 包装）

### 6.2 DSH 实机（人工）
- [ ] **冷启动模型列表秒出、不卡**；发对话即时应答（不再长时间无反应）
- [ ] 设置页工具 tab：**完全允许**勾选放行所有工具；**次数上限**可调（如改 50）；两者独立（完全允许下次数仍生效）
- [ ] 输入框右下角**思考档位选择器**：随当前模型列出 default+档位，选后生效；切模型选项随之变化
- [ ] 点「重新探测」才发探测；探测进行中发对话不受影响（对话优先）
- [ ] 逐字出字；卸载/重启无残留

### 6.3 对外 API（人工/脚本）
- [ ] `/v1/models` + `/v1/chat/completions`（含流式）仍正常；token 生效

## 7. 故障矩阵

| 现象 | 处置 |
| --- | --- |
| T0 探针：带 variant 建会话报错/被忽略 | 不注入 variant（thinkingVariant 恒空默认），ThinkingLevelSelect 仅展示不生效，记录；或按 serve 实际支持的档位字段调整 |
| T0 探针：modelSelection 投影取不到 model 字段 | ThinkingLevelSelect 改用 `id` 或退回「全部档位并集」展示；后端仍按当前模型 variants 校验注入（无效回退 default） |
| tsc/build 报错 | 停止门：§4 代码缺陷，报告人工 |
| 启动仍探测/卡 | 核对 index.ts hadProbe 分支与 catalog.refresh 默认 probe:false；确认无其它调用传 probe:true |
| 完全允许下次数上限不生效 | 核对 turn.ts 用 policy.maxPerTurn（不变）与 liveToolPolicy 读 toolMaxPerTurn |
| 思考档位选了不生效 | 核对 modelRef 是否带 variant + serve 是否认；回退见上 |
| 卡片/控件不显示 | 查 DSH 控制台 `[opencode-local]`；composer 槽名/注入结构；ModuleLoader id |
| 探测期间对话变慢 | 检查 activity enter/leave 是否覆盖整个回合（#streamWith try/finally） |
| 撞限流/风控 | 停该项记录，不轰炸 |

## 附录：事实核对
- composer 读当前模型：`dsh-connect-workbuddy-main/src/client/ComposerCreditsGate.tsx:47-63,149-166`（`useProjection('modelSelection')`，`next ?? lastUsed`，取 `provider`）。**model 字段名待 T0 探针确认**。
- 档位来源：opencode Model.Info `variants`（`schema/src/model.ts`）；Model.Ref 含 `variant?`（P0 已证）。
- 工具批准/次数：`turn.ts` 用 `policy.allow.includes('*')` 与 `approved < policy.maxPerTurn`（0.2.0 已在，本次仅让 maxPerTurn 可配）。
- 0.2.0 卡顿根因与修复：`temp/P2/phase-2.md` §2 ⑥ / D10。