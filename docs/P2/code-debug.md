# 阶段 2 · 0.2.2「去探测 + 显隐勾选」— 差异施工图（code-debug）

> 性质：**debug/迭代施工图**（非重写）。基线 = 当前仓库 `plugin/` 上的 **0.2.1** 代码。
> 目标版本：**0.2.2**。
> 上游依据：`temp/P2/phase-2.md`（D1/D2 被本文件废止）、人工 2026-11-09 裁决（见 §0.2）。
> 状态：**待人工审核**。审核通过前**禁止执行本文件任何动作**。

---

## 0. 性质与硬约束

### 0.1 本文件做什么

**废止「模型可用性探测」整条链路**，改为「列出全部免费模型 + 人工勾选是否可见」。

### 0.2 人工裁决（2026-11-09，最高优先级）

| # | 裁决 | 落地位置 |
| --- | --- | --- |
| R1 | **彻底不做探测**，删除所有探测代码、配置、UI、测试断言 | §4 F04/F05/F07/F09/F11/F15/F16 |
| R2 | 设置页直接显示 opencode 返回的**全部免费模型** | §4 F08/F09 |
| R3 | 列出**上下文窗口**，小数**最多 2 位** | §4 F09 `formatContext()` |
| R4 | 每个模型一个**复选框**标识是否可见，**默认全部可见** | §4 F02 `hiddenModels` 默认 `[]` |
| R5 | 卡片顶端**一个按钮**，按状态在「全选」/「全不选」间切换 | §4 F09 `selectAllLabel` |
| R6 | **非免费模型不列出**（成本非 0 直接过滤） | §4 F04 `isFree()` |
| R7 | 文件名 `catalog/probe.ts` → **`catalog/models.ts`** | §4 F04/F05 |
| R8 | 版本号 → **0.2.2** | §4 F14 |

**为什么废除探测**（结论已由人工确认，执行者无需复核）：探测以「1 秒 1 个、建空会话、发完即删」的机器特征批量请求免费模型，会被上游识别并返回 `provider.free-limit`；旧实现又把该瞬时结果永久写入缓存并从选择器剔除，造成「TUI 里明明能用、插件里全部不可用」。改为不探测即可从根上消除该缺陷。

### 0.3 硬约束

1. **只改 §2 列出的 16 个文件**；其余文件**一字不动**。
2. §4 每段代码为**整文件覆盖**（或删除）。执行者**不得增删改任何字符**，包括注释、空行、引号风格、结尾换行。
3. 施工图内嵌代码即最终代码，**不参考任何外部描述**，不做「顺手优化」。
4. 全程 TypeScript；不引入任何新依赖。
5. 命名空间（provider id）保持 `opencode-local`，安装包名保持 `@hbk/dsh-opencode-local`。
6. **禁止**在本阶段新增探测、可用性测试、模型请求。唯一允许的模型来源调用是 `GET /api/model`（只读元数据，不产生推理请求）。

---

## 1. 能力门与多 Agent 编排

### 1.1 并行可行性论证（关键）

本施工图 §4 为每个文件提供了**完整、逐字节确定的最终内容**。因此：

- 任意两个文件之间**不存在内容依赖**（谁先写谁后写，落盘结果完全相同）。
- **多 Agent 并行与单 Agent 串行，产物逐字节一致**。

这就是本方案能安全并行、且「换任何模型/任何 Agent 软件都得到相同结果」的根本保证。

### 1.2 执行前的能力探测（必须先做，只做一次）

> **目的**：让执行流程在有无并行能力的两种环境下都能跑通，且结果相同。

执行者对当前环境做一次判定，记录到执行日志：

**判定方法（任一满足即视为「具备并行能力」）：**

- 存在子代理 / 团队 / 任务分派类工具（例如 `subagent`、`spawn_teammate`、`workflow`、`ralph`、`Task`，或等价能力）；**或**
- 存在可调用的 Agent 编排接口（MCP、HTTP 编排端点、多进程任务队列）；**或**
- 宿主明确声明支持多个并发执行单元。

**判定结果的使用：**

| 判定 | 执行模式 | 做法 |
| --- | --- | --- |
| 具备并行能力 | **并行模式（推荐）** | 按 §1.3 把 P1–P6 六个任务包**同时**派发给 6 个子执行者，各自只写自己那份文件 |
| 不具备并行能力 | **串行回退** | 同一执行者按 P1→P6 顺序执行；**内容与产物完全相同** |

> **重要**：并行只改变「谁在什么时候写」，**不改变「写什么」**。两种模式的最终文件树必须逐字节相同。

### 1.3 任务包划分（写作用域互不重叠）

| 包 | 名称 | 写入文件（相对仓库根） | 并行安全 |
| --- | --- | --- | --- |
| **P1** | 类型层 | `plugin/src/types.ts` | ✅ 独立 |
| **P2** | 配置层 | `plugin/src/config.ts` | ✅ 独立 |
| **P3** | 目录与传输层 | `plugin/src/catalog/models.ts`（新建）<br>`plugin/src/catalog/probe.ts`（删除）<br>`plugin/src/serve/client.ts` | ✅ 独立 |
| **P4** | 适配与接线层 | `plugin/src/adapter/local-adapter.ts`<br>`plugin/src/index.ts`<br>`plugin/src/web/routes.ts` | ✅ 独立 |
| **P5** | 客户端 UI 层 | `plugin/src/client/status-paths.ts`<br>`plugin/src/client/ModelsTab.tsx`<br>`plugin/src/client/OpencodeLocalCard.tsx`<br>`plugin/src/client/locales.ts`<br>`plugin/src/client/styles.ts` | ✅ 独立 |
| **P6** | 版本与验证层 | `plugin/package.json`<br>`temp/P2/impl-harness/lib.mjs`<br>`temp/P2/impl-harness/h1-free-filter.mjs` | ✅ 独立 |

**冲突检查结论**：6 个包的文件集合两两交集为空。任何交错执行都不产生写冲突。

### 1.4 派发模板（并行模式，逐包原样使用）

对 P1–P6 各派发一个子执行者，提示词模板：

```
你是任务包 <Pn> 的执行者。只做一件事：把下列文件按施工图写成最终内容。

施工图：D:\DSH-Opencode2API-hbk\temp\P2\code-debug.md
只读取其中 §4 的 <Fxx> 段落，逐字节照抄。

你的写作用域（只准碰这些文件，其他文件一律不许修改）：
<从 §1.3 表格对应行复制>

硬要求：
1. 逐字节照抄，不增删改任何字符。
2. 完成后报告：改了哪些文件、每个文件的最终字节数。
3. 不要运行 typecheck/build（由阶段 2 统一执行）。
```

### 1.5 阶段 2（串行，必须最后执行）

全部 P1–P6 完成后，由**一个**执行者按序运行 §6.1 的验证命令。**此阶段禁止并行**（共享 `lib/` 产物与 `node_modules`）。

---

## 2. 变更清单（16 项）

| 编号 | 文件 | 动作 | 任务包 |
| --- | --- | --- | --- |
| F01 | `plugin/src/types.ts` | 整文件覆盖 | P1 |
| F02 | `plugin/src/config.ts` | 整文件覆盖 | P2 |
| F03 | `plugin/src/serve/client.ts` | 整文件覆盖 | P3 |
| F04 | `plugin/src/catalog/models.ts` | **新建** | P3 |
| F05 | `plugin/src/catalog/probe.ts` | **删除** | P3 |
| F06 | `plugin/src/adapter/local-adapter.ts` | 整文件覆盖 | P4 |
| F07 | `plugin/src/index.ts` | 整文件覆盖 | P4 |
| F08 | `plugin/src/web/routes.ts` | 整文件覆盖 | P4 |
| F09 | `plugin/src/client/status-paths.ts` | 整文件覆盖 | P5 |
| F10 | `plugin/src/client/ModelsTab.tsx` | 整文件覆盖 | P5 |
| F11 | `plugin/src/client/OpencodeLocalCard.tsx` | 整文件覆盖 | P5 |
| F12 | `plugin/src/client/locales.ts` | 整文件覆盖 | P5 |
| F13 | `plugin/src/client/styles.ts` | 整文件覆盖 | P5 |
| F14 | `plugin/package.json` | 整文件覆盖 | P6 |
| F15 | `temp/P2/impl-harness/lib.mjs` | 整文件覆盖 | P6 |
| F16 | `temp/P2/impl-harness/h1-free-filter.mjs` | 整文件覆盖 | P6 |

---

## 3. 语义契约（执行者据此自查，不改代码）

### 3.1 数据流

```
opencode serve  GET /api/model           （唯一模型来源，只读元数据，零推理请求）
        │
        ▼
ModelCatalog.refresh()                   过滤 free=false，落 catalog.json 缓存
        │
        ├──► visible(hidden) ──► LocalAdapter.listModels() ──► DSH 模型选择器
        │                                                    └─► 对外 API /v1/models
        └──► snapshot() ──► web/routes.ts ──► 设置页列表（含 hidden 标记）
                                                   ▲
                                                   │ scope.set('hiddenModels', [...])
                                             设置页复选框 / 全选按钮
```

### 3.2 可见性规则（唯一定义）

```
visible(entry) = entry.free === true AND NOT hiddenModels.includes(entry.id)
```

- `hiddenModels` 为空数组 ⇒ **全部可见**（默认值）。
- 采用「记录隐藏项」而非「记录可见项」：新增模型自动可见；且能表达「一个都不显示」。
- 刷新模型列表时**不清空** `hiddenModels`；已下线的模型 id 留在数组中无害（匹配不到就被忽略）。

### 3.3 上下文数值格式化（唯一定义）

```
n >= 1_000_000  →  String(round(n / 1_000_000 * 100) / 100) + 'M'
n >= 1_000      →  String(round(n / 1_000)) + 'K'
n <  1_000      →  String(n)
n 非正数或非有限 →  '-'
```

确定性样例（执行者与验收者共用）：

| 输入 | 输出 |
| --- | --- |
| `1048576` | `1.05M` |
| `1000000` | `1M` |
| `2000000` | `2M` |
| `262144` | `262K` |
| `200000` | `200K` |
| `981504` | `982K` |
| `1024` | `1K` |
| `999` | `999` |
| `0` | `-` |
| `-1` | `-` |

> 注 1：`981504` 在早期口头示意中写作 `981K`（截断）。本方案统一采用**四舍五入**，以本节样例为准。
> 注 2：`1024` 落在 `≥1000` 分支，输出 `1K`；`999` 才原样输出数字。上表为唯一裁定。

### 3.4 全选按钮（唯一定义）

```
allSelected = 列表非空 AND 每个模型都不在 hiddenModels 中
按钮文案   = allSelected ? '全不选' : '全选'
点击动作   = allSelected ? 写入 [全部模型 id] : 写入 []
```

初始状态：`hiddenModels = []` ⇒ `allSelected = true` ⇒ 按钮显示「全不选」。

---

## 4. 内嵌代码（整文件覆盖 / 新建 / 删除）

> **执行规则**：每个 `F__` 段落的代码块内容 = 该文件**完整最终内容**，从代码块第一行到最后一个换行符，逐字节写入。不得保留旧文件残留。

---

### F01 · `plugin/src/types.ts` · 整文件覆盖

**变更点**：删除 `ModelProbeResult` 接口；`CatalogEntry` 删除 `probe` 字段。

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

---

### F02 · `plugin/src/config.ts` · 整文件覆盖

**变更点**：删除 `probeEnabled`/`probeMaxPerSweep`；新增 `hiddenModels`（`.volatile()`，默认 `[]`）与 `liveHiddenModels()`。

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
  hiddenModels: string[]
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
  hiddenModels: Schema.array(Schema.string()).default([]).volatile(),
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
  const hidden = unwrap(c.hiddenModels)
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
    hiddenModels: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
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

export function liveHiddenModels(config: Partial<ResolvedPluginConfig> | undefined | null): string[] {
  const c = config ?? {}
  const v = unwrap(c.hiddenModels)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
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

---

### F03 · `plugin/src/serve/client.ts` · 整文件覆盖

**变更点**：删除 `ProbeOutcome` 接口与 `probeModel()` 函数。其余函数（`createSession`/`prompt`/`openSSE`/`replyDecision`/`interruptSession`/`deleteSession`/`listSessions`/`listModels`/`getDefaultModel`/`toModelRef`/`waitReady`/`findFreePort`/`serveRequest`/`authHeader`/`errorMessage`）**保留原样**，因为 `turn.ts`/`manager.ts` 仍在使用。

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

export async function replyDecision(ep: ServeEndpoint, sessionID: string, requestID: string, decision: 'once' | 'always' | 'reject', message: string): Promise<ServeResponse> {
  return serveRequest(ep, 'POST', `/api/session/${sessionID}/permission/${requestID}/reply`, { decision, message })
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

---

### F04 · `plugin/src/catalog/models.ts` · **新建文件**

**变更点**：全新文件（由 `catalog/probe.ts` 改名并重写）。移除全部探测逻辑；新增 `free()`、`visible(hidden)`；`refresh()` 不再接受任何探测参数。

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { CatalogEntry, CatalogSnapshot, ServeModelInfo } from '../types.ts'
import { listModels, toModelRef } from '../serve/client.ts'
import type { ServeManager } from '../serve/manager.ts'

const DEFAULT_CTX = 262144
const DEFAULT_MAX = 32768

export interface CatalogOptions {
  cachePath: string
}

function isFree(m: ServeModelInfo): boolean {
  const cost = Array.isArray(m.cost) ? m.cost : []
  return cost.length > 0 && cost.every((c) =>
    Number(c.input) === 0 && Number(c.output) === 0 && Number(c.cache?.read) === 0 && Number(c.cache?.write) === 0)
}

function toEntry(m: ServeModelInfo): CatalogEntry {
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
        this.entries = raw.entries.map((e) => ({ ...e, variants: Array.isArray(e.variants) ? e.variants : [] }))
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

  free(): CatalogEntry[] {
    return this.entries.filter((e) => e.free)
  }

  visible(hidden: string[]): CatalogEntry[] {
    const blocked = new Set(hidden)
    return this.entries.filter((e) => e.free && !blocked.has(e.id))
  }

  async refresh(): Promise<void> {
    if (this.refreshing) await this.refreshing
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = null })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    const ep = await this.mgr.ensureReady()
    const all = await listModels(ep)
    if (all.length === 0) return
    const next: CatalogEntry[] = []
    for (const m of all) {
      if (m.enabled === false) continue
      next.push(toEntry(m))
    }
    this.entries = next
    this.updatedAt = Date.now()
    this.saveCache()
  }
}
```

---

### F05 · `plugin/src/catalog/probe.ts` · **删除文件**

**动作**：删除该文件。

**校验**：执行后 `plugin/src/catalog/` 目录下应只剩 `models.ts` 一个文件。

**注意**：`plugin/catalog/probe.ts` 与 `plugin/src/catalog/probe.ts` 不是同一个路径，**只删 `src` 下那个**。

---

### F06 · `plugin/src/adapter/local-adapter.ts` · 整文件覆盖

**变更点**：导入路径改为 `models.ts`；`AdapterConfig` 新增 `hiddenModels: () => string[]`；`listModels`/`refreshModels` 改用 `catalog.visible(...)`；`#ensureEntry` 的 `refresh()` 去掉参数。

```ts
import type { ServeManager } from '../serve/manager.ts'
import type { ModelCatalog } from '../catalog/models.ts'
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
  hiddenModels: () => string[]
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
    await this.catalog.refresh()
    return this.catalog.visible(this.cfg.hiddenModels()).map((e) => e.id).filter((id) => this.#whitelistAllows(id))
  }

  async listModels(provider: string): Promise<Array<{ provider: string; id: string; name: string; inputModalities: string[] }>> {
    if (this.catalog.snapshot().entries.length === 0) {
      try { await this.catalog.refresh() } catch { /* keep whatever cache has */ }
    }
    const out: Array<{ provider: string; id: string; name: string; inputModalities: string[] }> = []
    for (const e of this.catalog.visible(this.cfg.hiddenModels())) {
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
    await this.catalog.refresh()
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

---

### F07 · `plugin/src/index.ts` · 整文件覆盖

**变更点**：导入 `models.ts`；`ModelCatalog` 构造只传 `cachePath`；`AdapterConfig` 增加 `hiddenModels`；删除 bootstrap 探测判定；启动只做一次列表刷新；日志改为「免费/可见」计数。

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig, type ResolvedPluginConfig } from './config.ts'
import { ServeManager, defaultManagerConfig } from './serve/manager.ts'
import { ModelCatalog } from './catalog/models.ts'
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
  const catalog = new ModelCatalog(manager, { cachePath: join(dataDir, 'catalog.json') })
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
      hiddenModels: () => liveHiddenModels(config),
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
    hiddenModels: () => liveHiddenModels(config),
    refresh: async () => { await catalog.refresh() },
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

  // Startup: one metadata-only list refresh. Never sends a model request.
  void catalog
    .refresh()
    .then(() => {
      const hidden = liveHiddenModels(config)
      ctx.logger.info(`opencode-local: ${catalog.free().length} free models, ${catalog.visible(hidden).length} visible`)
    })
    .catch((err) => ctx.logger.warn(`opencode-local: catalog refresh failed: ${errorMessage(err)}`))
}
```

---

### F08 · `plugin/src/web/routes.ts` · 整文件覆盖

**变更点**：导入 `models.ts`；`publicModelRow` 去掉 `probe`/`selectable`，改为返回 `hidden`；`WebRouteDeps` 新增 `hiddenModels`；`refresh` 语义变为「重新拉列表」。

```ts
import type { ModelCatalog } from '../catalog/models.ts'
import type { CatalogEntry } from '../types.ts'

export interface WebRouteDeps {
  catalog: ModelCatalog
  hiddenModels: () => string[]
  refresh: () => Promise<void>
}

export function publicModelRow(e: CatalogEntry, hidden: Set<string>): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    contextWindow: e.contextWindow,
    maxOutput: e.maxOutput,
    inputModalities: e.inputModalities,
    variants: e.variants,
    free: e.free,
    hidden: hidden.has(e.id),
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
      const hidden = new Set(deps.hiddenModels())
      return { updatedAt: snap.updatedAt, models: snap.entries.filter((e) => e.free).map((e) => publicModelRow(e, hidden)) }
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

---

### F09 · `plugin/src/client/status-paths.ts` · 整文件覆盖

**变更点**：`WebModelRow` 删除 `selectable`/`probe`，新增 `hidden`。

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
  hidden: boolean
}

export interface WebModelsPayload {
  updatedAt: number
  models: WebModelRow[]
}

export const TOOL_ACTIONS = ['shell', 'edit', 'read', 'webfetch', 'websearch', 'grep', 'glob'] as const
```

---

### F10 · `plugin/src/client/ModelsTab.tsx` · 整文件覆盖

**变更点**：删除「探测」列与状态渲染；新增复选框列、全选/全不选按钮、`formatContext()`（≤2 位小数）；写入 `hiddenModels`。

```tsx
import { createElement as h, useState } from 'react'
import type { WebModelRow, WebModelsPayload } from './status-paths.ts'

export function formatContext(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '-'
  if (n >= 1000000) return String(Math.round((n / 1000000) * 100) / 100) + 'M'
  if (n >= 1000) return String(Math.round(n / 1000)) + 'K'
  return String(n)
}

export function ModelsTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const payload: WebModelsPayload | null = props.payload ?? null
  const models: WebModelRow[] = payload?.models ?? []
  const fromScope = scope?.getSnapshot?.().value
  const committedHidden: string[] | undefined = fromScope && Array.isArray(fromScope.hiddenModels) ? fromScope.hiddenModels : undefined
  const fromPayload = models.filter((m) => m.hidden).map((m) => m.id)
  const [local, setLocal] = useState<string[] | undefined>(undefined)
  const hidden = local ?? committedHidden ?? fromPayload
  const hiddenSet = new Set(hidden)
  const allSelected = models.length > 0 && models.every((m) => !hiddenSet.has(m.id))
  const write = async (next: string[]): Promise<void> => {
    setLocal(next)
    try { await scope?.set?.('hiddenModels', next) } catch { /* observe on reopen */ }
  }
  const toggle = (id: string, on: boolean): void => {
    const s = new Set(hiddenSet)
    if (on) s.delete(id)
    else s.add(id)
    void write([...s])
  }
  const toggleAll = (): void => {
    void write(allSelected ? models.map((m) => m.id) : [])
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('p', { className: 'olp-hint' }, t('models.hint')),
    h('div', { className: 'olp-toolbar' },
      h('button', { className: 'olp-btn', onClick: toggleAll, disabled: models.length === 0 },
        allSelected ? t('models.selectNone') : t('models.selectAll')),
      h('button', { className: 'olp-btn', onClick: props.onRefresh, disabled: props.refreshing === true },
        props.refreshing === true ? t('models.loading') : t('models.refresh')),
    ),
    h('div', { className: 'olp-row olp-row-head' },
      h('span', null, ''),
      h('span', null, t('models.col.model')),
      h('span', null, t('models.col.context')),
    ),
    props.loading === true && models.length === 0 ? h('p', { className: 'olp-hint' }, t('models.loading')) : null,
    props.loading !== true && models.length === 0 ? h('p', { className: 'olp-hint' }, t('models.none')) : null,
    ...models.map((m) => h('div', { key: m.id, className: 'olp-row' },
      h('span', { className: 'olp-check' },
        h('input', { type: 'checkbox', checked: !hiddenSet.has(m.id), onChange: (e: any) => toggle(m.id, e.target.checked) })),
      h('span', { className: 'olp-model-name', title: m.id }, m.name),
      h('span', null, formatContext(m.contextWindow)),
    )),
  )
}
```

---

### F11 · `plugin/src/client/OpencodeLocalCard.tsx` · 整文件覆盖

**变更点**：`ModelsTab` 多传 `scope`（供复选框写入 `hiddenModels`）。

```tsx
import { Component, createElement as h, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { MODELS_PATH, MODELS_REFRESH_PATH } from './status-paths.ts'
import type { WebModelsPayload } from './status-paths.ts'
import { ModelsTab } from './ModelsTab.tsx'
import { ToolsTab } from './ToolsTab.tsx'

class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean; message?: string }> {
  state: { failed: boolean; message?: string } = { failed: false }
  static getDerivedStateFromError(error: unknown): { failed: boolean; message?: string } {
    if (error instanceof Error && error.name === 'SlotAssemblyError') throw error
    return { failed: true, message: error instanceof Error ? error.message : String(error) }
  }
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    try { console.error('[opencode-local] card render failed:', error, info.componentStack) } catch { /* ignore */ }
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return h('div', { className: 'olp-crash' }, 'opencode-local card crashed: ' + (this.state.message ?? 'unknown'))
  }
}

function CardBody(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const [panel, setPanel] = useState<'models' | 'tools'>('models')
  const [payload, setPayload] = useState<WebModelsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const load = async (): Promise<void> => {
    if (mounted.current) setLoading(true)
    try {
      const r = await fetch(MODELS_PATH, { credentials: 'same-origin' })
      const body = await r.json() as WebModelsPayload
      if (mounted.current) { setPayload(body); setError(undefined) }
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? String(e))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }
  const refresh = async (): Promise<void> => {
    if (mounted.current) setRefreshing(true)
    try {
      const r = await fetch(MODELS_REFRESH_PATH, { method: 'POST', credentials: 'same-origin' })
      const body = await r.json() as WebModelsPayload
      if (mounted.current) { setPayload(body); setError(undefined) }
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? String(e))
    } finally {
      if (mounted.current) setRefreshing(false)
    }
  }
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => clearInterval(timer)
  }, [])
  const tabBtn = (id: 'models' | 'tools', label: string) =>
    h('button', { key: id, role: 'tab', className: 'olp-tab' + (panel === id ? ' olp-tab-active' : ''), onClick: () => setPanel(id) }, label)
  return h('div', { className: 'olp-card' },
    h('div', { className: 'olp-tabs', role: 'tablist' }, tabBtn('models', t('tab.models')), tabBtn('tools', t('tab.tools'))),
    error ? h('p', { className: 'olp-error' }, error) : null,
    panel === 'models'
      ? h(ModelsTab, { t, scope, payload, loading, refreshing, onRefresh: refresh })
      : h(ToolsTab, { t, scope }),
  )
}

export function OpencodeLocalCard(props: any) {
  return h(CardBoundary, null, h(CardBody, props))
}
```

---

### F12 · `plugin/src/client/locales.ts` · 整文件覆盖

**变更点**：删除 `models.col.status`/`models.refresh`旧义/`status.*`；新增 `models.selectAll`/`models.selectNone`；`tab.models` 改为「免费模型」；`models.hint` 改写。

```ts
export const zh = {
  'nav.panel': 'opencode-local',
  'tab.models': '免费模型',
  'tab.tools': '可用工具',
  'models.hint': '从 opencode 读取到的全部免费模型。勾选决定它是否出现在聊天模型选择器；默认全部可见。',
  'models.col.model': '模型',
  'models.col.context': '上下文',
  'models.selectAll': '全选',
  'models.selectNone': '全不选',
  'models.refresh': '刷新列表',
  'models.loading': '加载中…',
  'models.none': '暂无免费模型',
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
  'tab.models': 'Free models',
  'tab.tools': 'Tools',
  'models.hint': 'Every free model the local opencode reports. Tick one to show it in the chat model picker; all are visible by default.',
  'models.col.model': 'Model',
  'models.col.context': 'Context',
  'models.selectAll': 'Select all',
  'models.selectNone': 'Select none',
  'models.refresh': 'Reload list',
  'models.loading': 'Loading…',
  'models.none': 'No free models',
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

---

### F13 · `plugin/src/client/styles.ts` · 整文件覆盖

**变更点**：`.olp-row` 改 3 列（复选框 / 模型 / 上下文）；新增 `.olp-toolbar`、`.olp-check`；删除 `.olp-status*`。

```ts
export const CARD_CSS = `
.olp-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#202126);color:var(--dsw-alias-label-primary,#e6e6e6)}
.olp-tabs{display:flex;gap:8px}
.olp-tab{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:6px 14px;background:transparent;color:var(--dsw-alias-label-secondary,#aaa)}
.olp-tab-active{color:var(--dsw-alias-label-primary,#e6e6e6);border-color:var(--dsw-alias-border-l2,#36373b);background:var(--dsw-alias-bg-layer-2,#25262b)}
.olp-hint{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary,#999)}
.olp-error{margin:0;font-size:13px;color:var(--dsw-alias-state-error-primary,#d92d20)}
.olp-toolbar{display:flex;gap:8px;flex-wrap:wrap}
.olp-row{display:grid;grid-template-columns:24px 1fr 90px;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2,#2c2d31);font-size:13px}
.olp-row-head{color:var(--dsw-alias-label-tertiary,#999);border-top:0;font-size:12px}
.olp-check{display:flex;align-items:center;justify-content:center}
.olp-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.olp-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;padding:6px 14px;background:transparent;color:inherit;align-self:flex-start}
.olp-btn:disabled{opacity:.4;cursor:default}
.olp-toggle{display:flex;align-items:center;gap:8px;font-size:13px}
.olp-disabled{opacity:.5}
.olp-crash{padding:12px;font-size:13px;color:var(--dsw-alias-state-error-primary,#d92d20)}
`
```

---

### F14 · `plugin/package.json` · 整文件覆盖

**变更点**：`version` 由 `0.2.1` → `0.2.2`。其余字段**原样不动**。

```json
{
  "name": "@hbk/dsh-opencode-local",
  "version": "0.2.2",
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

---

### F15 · `temp/P2/impl-harness/lib.mjs` · 整文件覆盖

**变更点**：导入 `catalog/models.ts`；`ModelCatalog` 构造只传 `cachePath`；`LocalAdapter` 增加 `hiddenModels`；`firstModel` 用 `visible([])`。

```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { ServeManager, defaultManagerConfig } from '../../../plugin/src/serve/manager.ts'
import { ModelCatalog } from '../../../plugin/src/catalog/models.ts'
import { LocalAdapter } from '../../../plugin/src/adapter/local-adapter.ts'
import { UserActivity } from '../../../plugin/src/priority.ts'

export const H = path.dirname(fileURLToPath(import.meta.url))
export const RAW = path.join(H, '..', 'impl-harness-results')
export const BUDGET = { used: 0, cap: 12 }

export function makeRuntime() {
  const activity = new UserActivity()
  const policy = { mode: 'off', allow: [], maxPerTurn: 20 }
  const manager = new ServeManager(defaultManagerConfig({ opencodePath: '', portBase: 4096, dataDir: path.join(H, 'data') }))
  const catalog = new ModelCatalog(manager, { cachePath: path.join(H, 'data', 'catalog.json') })
  const adapter = new LocalAdapter({ providerId: 'opencode-local', modelWhitelist: [], titlePrefix: 'dsh-h-', toolPolicy: () => policy, thinkingVariant: () => '', hiddenModels: () => [], activity }, manager, catalog)
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
  const sel = runtime.catalog.visible([])
  return sel.length > 0 ? sel[0].id : ''
}
```

---

### F16 · `temp/P2/impl-harness/h1-free-filter.mjs` · 整文件覆盖

**变更点**：删除探测断言；改为验证「全部条目免费」「可见性遵循 hidden」「listModels == visible」三条。

```js
import { check, record } from './lib.mjs'

export async function run(runtime) {
  await runtime.catalog.refresh()
  const snap = runtime.catalog.snapshot()
  const free = runtime.catalog.free()
  check('h1 free models exist', free.length > 0, 'no free models')
  for (const e of snap.entries) {
    check('h1 entry is free', e.free === true, e.id)
  }
  const visibleAll = runtime.catalog.visible([])
  check('h1 visible(all) == free', JSON.stringify(visibleAll.map((e) => e.id).sort()) === JSON.stringify(free.map((e) => e.id).sort()), 'visible mismatch')
  const hideOne = free.length > 0 ? [free[0].id] : []
  const visibleHidden = runtime.catalog.visible(hideOne)
  check('h1 hidden excluded', visibleHidden.length === free.length - hideOne.length, JSON.stringify({ free: free.length, visible: visibleHidden.length, hideOne }))
  const models = await runtime.adapter.listModels('opencode-local')
  const selIds = visibleAll.map((e) => e.id).sort()
  const modelIds = models.map((m) => m.id).sort()
  check('h1 listModels == visible', JSON.stringify(selIds) === JSON.stringify(modelIds), JSON.stringify({ selIds, modelIds }))
  record('h1-free-filter', { total: snap.entries.length, free: free.length, visible: visibleAll.length, hideOne, visibleAfterHide: visibleHidden.length, selIds })
}
```

---

## 5. 固定常量表（执行者与验收者共用）

| 名称 | 值 |
| --- | --- |
| 目标版本 | `0.2.2` |
| provider id | `opencode-local` |
| 包名 | `@hbk/dsh-opencode-local` |
| 缓存文件 | `%USERPROFILE%\.dsh-opencode-local\catalog.json` |
| 配置项（新增） | `hiddenModels: string[]`，`.volatile()`，默认 `[]` |
| 配置项（删除） | `probeEnabled`、`probeMaxPerSweep` |
| 目录模块路径 | `plugin/src/catalog/models.ts` |
| 删除的文件 | `plugin/src/catalog/probe.ts` |
| Web 路由（保留） | `GET /plugins/opencode-local/models`、`POST /plugins/opencode-local/models/refresh` |
| 上下文格式 | §3.3 |
| 全选按钮语义 | §3.4 |

---

## 6. 验收

### 6.1 验证命令（阶段 2，串行，按序执行）

工作目录 `D:\DSH-Opencode2API-hbk\plugin`：

```powershell
npm run typecheck
npm run build
```

工作目录 `D:\DSH-Opencode2API-hbk`：

```powershell
node temp\P2\impl-harness\run-all.mjs
```

打包（工作目录 `plugin`）：

```powershell
npm pack
```

### 6.2 通过标准

| 检查 | 通过条件 |
| --- | --- |
| `typecheck` | **0 错误**（`tsconfig.json` + `tsconfig.client.json` 两个项目） |
| `build` | 生成 `lib/index.js` 与 `lib/client.js`，无报错 |
| harness | `summary.json` 中 `allPassed: true` |
| `npm pack` | 生成 `hbk-dsh-opencode-local-0.2.2.tgz` |
| 残留扫描 | 全仓（`plugin/src` + `temp/P2/impl-harness`）搜索 `probe`/`Probe`/`selectable`，**0 命中** |
| 文件核对 | `plugin/src/catalog/` 下**只有** `models.ts` |

### 6.3 残留扫描命令（确定性）

```powershell
Get-ChildItem D:\DSH-Opencode2API-hbk\plugin\src, D:\DSH-Opencode2API-hbk\temp\P2\impl-harness -Recurse -File -Include *.ts,*.tsx,*.mjs |
  Select-String -Pattern 'probe|Probe|selectable'
```

**期望：无输出。**

### 6.4 人工实机验收（阶段 3，由人工执行）

1. 安装 `hbk-dsh-opencode-local-0.2.2.tgz` 到 desktop profile，完全退出 DSH 后重开。
2. 设置页 → opencode-local 卡片：显示全部免费模型，上下文形如 `200K` / `1.05M`（**不再有长小数**）。
3. 默认全部勾选；顶部按钮显示「全不选」。
4. 勾掉任意一个 → 聊天模型选择器里立即看不到它。
5. 点「全不选」→ 选择器为空；按钮变为「全选」；再点「全选」→ 恢复。
6. 点「刷新列表」→ 只重新读取列表，**不产生任何模型推理请求**。
7. 全程无 `provider.free-limit` 由插件自身触发。

---

## 7. 故障矩阵

| 现象 | 原因 | 处置 |
| --- | --- | --- |
| typecheck 报 `Cannot find module '../catalog/probe.ts'` | F05 已删但某处仍引用 | 按 §6.3 扫描，把该引用改为 `models.ts` |
| typecheck 报 `Property 'probe' does not exist` | 有文件仍访问 `entry.probe` | 该文件未按 §4 更新，重做对应 Fxx |
| typecheck 报 `probeModel is not exported` | `serve/client.ts` 未按 F03 覆盖 | 重做 F03 |
| typecheck 报 `hiddenModels does not exist on AdapterConfig` | F06 未覆盖或 F07 未传 | 重做 F06/F07 |
| build 后 `lib/client.js` 无 `hiddenModels` | F10/F11 未生效 | 重做 F10/F11 |
| 设置页空白 | client bundle 报错 | 查 DSH 控制台 `[opencode-local]` 前缀日志 |
| 复选框点击无反应 | `scope` 为空 | 确认 F11 已把 `scope` 传给 `ModelsTab` |
| 勾选后不持久 | `hiddenModels` 未加 `.volatile()` | 重做 F02 |
| 刷新仍触发模型请求 | `catalog.refresh()` 残留探测分支 | 重做 F04，确认 `doRefresh` 只有 `listModels` |
| 上下文仍显示长小数 | `formatContext` 未生效 | 重做 F10，核对 §3.3 样例 |

---

## 附录 · 事实核对（本施工图编写时已逐项只读验证）

| 事实 | 验证方式 | 结果 |
| --- | --- | --- |
| 基线版本 | `plugin/package.json` | `0.2.1` |
| 源文件总数 | `plugin/src` 递归计数 | 21 |
| `catalog/probe.ts` 被引用处 | 全仓搜索 `catalog/probe` | 3 处：`index.ts`、`web/routes.ts`、`local-adapter.ts`（均在 §2 内） |
| harness 对 `probe` 的依赖 | 搜索 `temp/P2/impl-harness` | `lib.mjs`、`h1-free-filter.mjs` 两处（均在本方案内） |
| `h2/h3/h4` 是否需改 | 搜索 `firstModel`/`selectable` | **不需要**：三文件均通过 `lib.mjs` 的 `firstModel` 间接取模型，签名不变 |
| `ThinkingLevelSelect.tsx` 是否需改 | 读取全文 | **不需要**：只读 `payload.models` 的 `variants`，字段保留 |
| `api/server.ts` 是否需改 | 读取全文 | **不需要**：只调 `adapter.listModels()`，行为随适配器自动更新 |
| `adapter/turn.ts`/`translate.ts`/`flatten.ts` | 未触及探测 | **不需要** |
| `serve/manager.ts` | 未触及探测 | **不需要** |
| 当前免费模型数 | 查询 `GET /api/model` | 12 个，成本全 0，`enabled` 全 true |
| 真实上下文取值 | 同上 | `200000` / `262144` / `1000000` / `1048576` |

**总改动文件数：16（覆盖 14 + 新建 1 + 删除 1）。**
