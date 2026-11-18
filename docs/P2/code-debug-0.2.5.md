# 0.2.5 代码施工方案（code.md）

> **状态：方案设计阶段。未执行任何代码改动。** 本文档只描述「改哪个文件、改成什么样」，不代替施工。
> **唯一依据**：`D:\DSH-Opencode2API-hbk\temp\debug.md`（v8 完全定案，零待定项）。
> **适用性**：本文档以「文件内容级」而非「行号级」描述改动，任何模型 / 任何 agent 软件执行，只要**逐字照抄代码块**，产物必然相同。
> **安装目标**：`web` profile（D27）。**不是** desktop。
> 撰写时间：2026-11-16（Asia/Shanghai）。

---

## §0 阅读顺序（执行前必读）

1. 先读 §1（多 agent 能力探测）：**决定并行还是串行**。
2. 再读 §3（全局契约）：**所有 agent 必须先看，保证并行时不打架**。
3. 各 agent 只读自己的任务节（§4 中的 W1–W7），**只改自己范围内的文件**。
4. 全部落盘后，由**主执行者串行**执行 §6（验收 + 打包 + 安装）。

### 0.1 铁律（违反即返工）

| # | 铁律 |
| --- | --- |
| R1 | **只改 §2 清单内的文件**，清单外任何文件零改动（含 `plugin/cordis.patch.yml`、desktop profile、git 提交）。 |
| R2 | 每个写入者**只碰自己那一组的文件**，绝不修改他人组的文件（避免并发覆盖）。 |
| R3 | 代码**逐字照抄**本文档代码块，不"优化"、不"顺手改格式"、不重排 import。 |
| R4 | 不改任何既有导出的**名称**与**语义**（`flattenHistory`、`classifyFailure` 之外的新增除外）。 |
| R5 | 施工期间**禁止**运行 `npm run build` / `npm pack` / 安装（由主执行者在 §6 串行统一做）。 |
| R6 | 每个 agent 完成后必须跑自己组的**自检命令**（§4 各节末尾），全绿才算完成。 |
| R7 | 不引入新依赖、不改 `tsconfig`、不改 `tsdown.config.ts`。 |
| R8 | 不写调试 `console.log`；不提交 git。 |

### 0.2 版本

`plugin/package.json` 的 `version` 由 `0.2.4` 改为 `0.2.5`（仅此一处版本号变化）。

---

## §1 多 agent 协作：能力探测 → 并行 / 串行

### 1.1 目标

把 §2 的 7 个工作包（W1–W7）**并行**落盘，再用**串行**验证收口。产物必须与串行执行**字节级相同**。

### 1.2 能力探测（必须先做，耗时 < 1 分钟）

主执行者执行下列**探针**，判定当前环境是否支持并行子代理：

**探针 A（首选，DSH 原生）**：
1. 调用 `subagent` 工具，`name` 用 `probe-a`，`description` 用 `cap-probe`，`prompt` 内容为：
   > 在 `D:\DSH-Opencode2API-hbk\temp\` 下创建文件 `probe-a.txt`，内容**恰好**为 `probe-ok-a`（无换行、无多余空白）。完成后只回复 `done`。
2. 同时调用第二个 `subagent`，`name` 用 `probe-b`，`prompt` 同上但文件名 `probe-b.txt`、内容 `probe-ok-b`。
3. 判定：两个文件都出现在 `temp\` 下，且内容**逐字节**等于 `probe-ok-a` / `probe-ok-b`（用 `Get-Content -Raw` 比对长度 **10/10**）。

**探针 A 成功 ⇒ 并行模式；失败或 `subagent` 工具不可用 ⇒ 探针 B。**

**探针 B（次选，任意 agent 平台）**：若平台提供"并行工具调用 / 子任务 / fork"能力（如同时发起多个独立任务），用同样的 `probe-b.txt` 双文件探针验证；成功 ⇒ 并行模式。

**两条都失败 ⇒ 串行模式**（不影响结果，只影响耗时）。

> **环境预期**：本项目的 DSH 运行环境**已具备并行子代理能力**（`subagent` 工具 + Agent Teams），探针 A **预期通过**。若探针 A 失败，先检查是否被平台策略禁用；**不要**因此放弃施工，直接走串行模式即可，产物要求完全一致。

> 清理：无论成败，探测结束后删除 `temp\probe-a.txt`、`temp\probe-b.txt`（若存在）。

### 1.3 两种模式的硬约束

| 模式 | 做法 | 结果要求 |
| --- | --- | --- |
| **并行** | 一次性派发 W1–W7 共 7 个写入者（可合并为 5 个，见 §7.2），各自只改自己文件 | 必须与串行产物**字节级相同** |
| **串行** | 主执行者按 W1→W2→…→W7 顺序依次落盘 | 与并行产物**字节级相同** |

**W4 与 W5 的依赖处理**：W5 的 `CompactionTab.tsx` 要 `import` W4 在 `status-paths.ts` 新增的常量。为保证并行不阻塞，**§3 已把常量名与字面值钉死**；W5 按 §3 写 import 即可，无需等 W4，typecheck 阶段自然吻合。

**验证阶段禁止并行**（handoff §9）：§6 的全部命令由主执行者**一条一条串行**跑。

---

## §2 工作包划分（写入范围，互不重叠）

| 包 | 文件（**只改这些**） | 依据 |
| --- | --- | --- |
| **W1** | `plugin/src/types.ts`、`plugin/src/adapter/flatten.ts` | F01、F02 |
| **W2** | `plugin/src/adapter/turn.ts` | F03 |
| **W3** | `plugin/src/adapter/translate.ts` | F04 |
| **W4** | `plugin/src/config.ts`、`plugin/src/index.ts`、`plugin/src/web/routes.ts`、`plugin/src/client/status-paths.ts` | F14、F16、F15、F13 |
| **W5** | `plugin/src/client/OpencodeLocalCard.tsx`、`plugin/src/client/CompactionTab.tsx`(新)、`plugin/src/client/locales.ts`、`plugin/src/client/styles.ts`、`plugin/src/client/index.tsx` | F09、F10、F11、F12 |
| **W6** | `docs/impl-harness/h6-compaction.mjs`(新)、`docs/impl-harness/h7-compaction-ui.mjs`(新)、`docs/impl-harness/run-all.mjs` | F06、F18、F07+F19 |
| **W7** | `plugin/package.json`、`plugin/README.md` | F05、F08 |

**文件数合计**：2(W1) + 1(W2) + 1(W3) + 4(W4) + 5(W5，含 1 新增) + 3(W6，含 2 新增) + 2(W7) = **18 个文件、7 个工作包**，两两无交集。

> ⚠️ `plugin/src/client/index.tsx` 归 **W5**（`sessions` 服务注入接线），**不归 W4**。`plugin/src/client/status-paths.ts` 归 **W4**，W5 只读不写。

> 组内文件互不重叠，故 W1–W7 可任意顺序并行执行。

---

## §3 全局契约（并行前必读；跨文件引用的名字与字面值以本节为准）

### 3.1 新增导出（名称与签名**不可变**）

| 所在文件 | 导出 | 签名 |
| --- | --- | --- |
| `plugin/src/types.ts` | （类型字段） | `HarnessGenerateOptions.purpose?: string` |
| `plugin/src/adapter/flatten.ts` | `flattenCompaction` | `(options: HarnessGenerateOptions) => string` |
| `plugin/src/adapter/translate.ts` | `classifyFailure` | `(err: { type?: string; message?: string; status?: number } \| undefined) => { message: string; code: string }` |
| `plugin/src/config.ts` | `liveCompactionProvider` | `(config: Partial<ResolvedPluginConfig> \| undefined \| null) => string` |
| `plugin/src/config.ts` | `liveCompactionModel` | `(config: Partial<ResolvedPluginConfig> \| undefined \| null) => string` |
| `plugin/src/config.ts` | `applyCompactionRoute` | `(options: { purpose?: string; provider?: string; model?: string }, provider: string, model: string) => boolean` |
| `plugin/src/client/status-paths.ts` | `CATALOG_PATH` | 字面值 `'/plugins/opencode-local/catalog'` |
| `plugin/src/client/status-paths.ts` | `CATALOG_REFRESH_PATH` | 字面值 `'/plugins/opencode-local/catalog/refresh'` |
| `plugin/src/client/status-paths.ts` | `CONTEXT_PATH` | 字面值 `'/plugins/opencode-local/context'` |
| `plugin/src/client/status-paths.ts` | `COMPACT_PATH` | 字面值 `'/plugins/opencode-local/compact'` |
| `plugin/src/client/status-paths.ts` | 类型 `WebCatalogModel` / `WebCatalogGroup` / `WebCatalogPayload` | 见 §4 W4 代码 |

### 3.2 配置字段（`ResolvedPluginConfig` / `Config`）

| 字段 | 默认值 | 是否 volatile |
| --- | --- | --- |
| `compactionProvider` | `'deepseek-official'` | **是** |
| `compactionModel` | `'deepseek-flash'` | **是** |

### 3.3 常量（`plugin/src/adapter/turn.ts`）

| 常量 | 值 |
| --- | --- |
| `COMPACT_MAX_ATTEMPTS` | `3` |
| `COMPACT_RETRY_BASE_MS` | `2000` |
| `COMPACT_RETRY_MAX_MS` | `8000` |

### 3.4 HTTP 路由契约（W4 实现 ↔ W5 消费，双方按此对齐）

**① `GET /plugins/opencode-local/catalog`** → 200
```json
{
  "default": { "provider": "deepseek-official", "model": "deepseek-flash" },
  "groups": [
    { "id": "deepseek-official", "name": "DeepSeek", "models": [
      { "id": "deepseek-flash", "name": "DeepSeek-V4.1-Flash", "contextWindow": 1048576 }
    ]}
  ],
  "failures": []
}
```
字段缺失时省略对应键；`groups` 至少 `[]`。

**② `GET /plugins/opencode-local/context?sessionId=<id>`** → 200
```json
{
  "sessionId": "ses_x",
  "found": true,
  "pressure": { "pressureTokens": 32000, "projectedTokens": 33000, "contextWindow": 200000 },
  "breakdown": { "systemTokens": 100, "toolsTokens": 200, "messageTokens": 300 },
  "usage": { "uncachedInputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheWriteTokens": 0 },
  "totalTokens": 32000,
  "percent": 16
}
```
`found:false` 时仅返回 `{ "sessionId": "...", "found": false }`。**每个可选字段只在拿到时才输出**（D16「有什么显示什么」）。

**③ `POST /plugins/opencode-local/compact`**，body `{ "sessionId": "<id>" }` → 200
```json
{ "ok": true, "kind": "success", "text": "Compacted 12 history items (~3400 tokens).", "sourceEventSeq": 42 }
```
失败：`{ "ok": false, "kind": "error", "text": "<原因>" }`；参数缺失：HTTP 400 + `{ "ok": false, "error": "sessionId required" }`；会话不存在：HTTP 404 + `{ "ok": false, "error": "session not found" }`。

**④ `POST /plugins/opencode-local/catalog/refresh`** → 同 ①（刷新 `llm.listModels` 缓存，失败返回 500 `{ "error": "..." }`）。

### 3.5 locale 键（W5 内部自洽）

新增键：`tab.compaction`、`compaction.button`、`compaction.buttonBusy`、`compaction.model`、`compaction.modelHint`、`compaction.status`、`compaction.used`、`compaction.projected`、`compaction.window`、`compaction.percent`、`compaction.breakdown`、`compaction.usage`、`compaction.noSession`、`compaction.hint`、`compaction.empty`。
**zh 与 en 必须键集完全一致**（`en: Record<keyof typeof zh, string>` 由类型强制）。

---

## §4 逐文件施工指令

> 每个文件给两种描述之一：**「完整替换」**（整文件内容给出，最稳）或 **「精确增删」**（给出锚点 + 前后代码，必须按锚点定位）。
> 代码风格沿用现有文件（2 空格缩进、单引号、无分号结尾习惯与原文一致、`any` 宽容风格）。

---

### W1-a｜`plugin/src/types.ts`（F01·精确增补）

**锚点**：`export interface HarnessGenerateOptions {` 块内的 `signal?: AbortSignal` 行。

把：

```ts
  reasoningEffort?: string
  signal?: AbortSignal
}
```

改为：

```ts
  reasoningEffort?: string
  signal?: AbortSignal
  /** DSH auxiliary-call marker; 'compaction' means an internal summarization request. */
  purpose?: string
}
```

> 只加这两行（注释 + 字段），其它一字不动。

---

### W1-b｜`plugin/src/adapter/flatten.ts`（F02·精确增补）

**做法**：在文件**末尾**（`flattenHistory` 函数闭合 `}` 之后）追加以下内容，原有 `blockText`、`flattenHistory` **完全不动**：

```ts

/**
 * Condense an auxiliary compaction request: replay the prefix, keep the
 * summarization directive as the final instruction, and add no chat framing.
 * @param options - the compaction request assembled by DSH.
 * @returns the single text prompt sent to opencode.
 */
export function flattenCompaction(options: HarnessGenerateOptions): string {
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
    sections.push(options.system.trim())
  }
  const history = msgs.filter((_, i) => i !== promptIdx)
  if (history.length > 0) {
    sections.push(history.map((m) => `[${m.role}]: ` + blockText(m.content).trim()).join('\n\n'))
  }
  sections.push(promptText)
  return sections.join('\n\n')
}
```

**W1 自检**（在 `D:\DSH-Opencode2API-hbk` 下）：
```powershell
Select-String -Path plugin\src\types.ts -Pattern 'purpose\?: string' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\src\adapter\flatten.ts -Pattern 'export function flattenCompaction' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\src\adapter\flatten.ts -Pattern '\[Conversation History\]' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1（原函数仍在）
```

---

### W2｜`plugin/src/adapter/turn.ts`（F03·**完整替换**）

用下面全文**覆盖**该文件（117 行 → 新内容）：

```ts
import { createSession, interruptSession, openSSE, prompt, replyDecision } from '../serve/client.ts'
import { flattenCompaction, flattenHistory } from './flatten.ts'
import { TERMINAL_EVENT_TYPES, translateEvents } from './translate.ts'
import type {
  AdapterDiagnostics,
  HarnessChunk,
  HarnessGenerateOptions,
  ModelRef,
  ServeEndpoint,
  ServeEvent,
  ToolPolicy,
} from '../types.ts'

export const TURN_WATCHDOG_POLL_MS = 200
export const COMPACT_MAX_ATTEMPTS = 3
export const COMPACT_RETRY_BASE_MS = 2000
export const COMPACT_RETRY_MAX_MS = 8000
const REJECT_MESSAGE = 'tools are disabled or not allowed in this channel; reply in plain text'
const APPROVE_MESSAGE = 'approved by deepseek harness'

export interface TurnConfig {
  titlePrefix: string
  firstEventMs: number
  idleMs: number
  toolPolicy: () => ToolPolicy
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Run one compaction request with a bounded retry wrapped around whole turns.
 * @param ep - serve endpoint.
 * @param cfg - turn configuration.
 * @param options - the compaction request.
 * @param modelRef - resolved opencode model.
 * @param diag - shared diagnostics.
 */
export async function* runCompactTurn(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  for (let attempt = 1; attempt <= COMPACT_MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted === true) return
    let retryable = false
    for await (const chunk of runTurnOnce(ep, cfg, options, modelRef, diag)) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        const code = chunk.reason.failure.code
        const transient = code === 'RATE_LIMIT' || code === 'TRANSPORT' || code === 'EMPTY_RESPONSE'
        if (transient && attempt < COMPACT_MAX_ATTEMPTS) { retryable = true; break }
      }
      yield chunk
    }
    if (!retryable) return
    const delay = Math.min(COMPACT_RETRY_BASE_MS * 2 ** (attempt - 1), COMPACT_RETRY_MAX_MS)
    await sleep(delay)
  }
}

/**
 * Drive one opencode turn; compaction requests use the compact prompt form and
 * never approve tools.
 * @param ep - serve endpoint.
 * @param cfg - turn configuration.
 * @param options - the request.
 * @param modelRef - resolved opencode model.
 * @param diag - shared diagnostics.
 */
export async function* runTurn(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  if (options.purpose === 'compaction') {
    yield* runCompactTurn(ep, cfg, options, modelRef, diag)
    return
  }
  yield* runTurnOnce(ep, cfg, options, modelRef, diag)
}

/**
 * Perform exactly one turn: create the session, stream events, translate chunks.
 * @param ep - serve endpoint.
 * @param cfg - turn configuration.
 * @param options - the request.
 * @param modelRef - resolved opencode model.
 * @param diag - shared diagnostics.
 */
async function* runTurnOnce(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  const isCompaction = options.purpose === 'compaction'
  const text = isCompaction ? flattenCompaction(options) : flattenHistory(options, cfg.toolPolicy().mode === 'allowlist')
  const title = `${cfg.titlePrefix}${isCompaction ? 'compact-' : ''}${options.model}-${Date.now().toString(36)}`
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
  const onAbortCatch = () => { void interruptSession(ep, sessionID) }
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
    let approved = 0
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
              const policy = cfg.toolPolicy()
              const action = typeof e.data.action === 'string' ? e.data.action : ''
              const allowed = !isCompaction && (policy.allowAll
                || (policy.mode === 'allowlist'
                  && (policy.allow.includes('*') || policy.allow.includes(action))
                  && approved < policy.maxPerTurn))
              const r = await replyDecision(ep, sessionID, requestID, allowed ? 'once' : 'reject', allowed ? APPROVE_MESSAGE : REJECT_MESSAGE)
              if (r.status === 204 || r.status === 200) {
                if (allowed) {
                  if (!policy.allowAll) approved += 1
                  diag.toolApproved += 1
                } else { diag.permissionRejected += 1 }
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

**要点核对（自检项，逐条 grep）**：
```powershell
Select-String -Path plugin\src\adapter\turn.ts -Pattern 'COMPACT_MAX_ATTEMPTS = 3|COMPACT_RETRY_BASE_MS = 2000|COMPACT_RETRY_MAX_MS = 8000' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 3
Select-String -Path plugin\src\adapter\turn.ts -Pattern 'const allowed = !isCompaction && ' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\adapter\turn.ts -Pattern "isCompaction \? 'compact-' : ''" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\adapter\turn.ts -Pattern 'flattenCompaction' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 2（import + 调用）
```

---

### W3｜`plugin/src/adapter/translate.ts`（F04·精确增删）

**① 新增函数**：插到 `function summarizeInput(...)` 结束后、`export async function* translateEvents` 之前，插入以下内容（**前面加一个空行**）：

```ts

/**
 * Reclassify a provider failure reported by opencode. Free gateways answer HTTP
 * 402 with a rate-limit body, while opencode classifies any 402 as a
 * non-retryable quota; only an affirmative throttle signal is reclassified so
 * genuine exhaustion keeps its own code.
 * @param err - the failure attached to the failed execution event.
 * @returns message unchanged plus the effective failure code.
 */
export function classifyFailure(err: { type?: string; message?: string; status?: number } | undefined): { message: string; code: string } {
  const rawMessage = typeof err?.message === 'string' && err.message.length > 0 ? err.message : 'session execution failed'
  const rawCode = typeof err?.type === 'string' && err.type.length > 0 ? err.type : 'UPSTREAM'
  const text = rawMessage.toLowerCase()
  const throttled = err?.status === 429
    || text.includes('too_many_requests')
    || text.includes('rate_limit_error')
    || text.includes('rate limit')
  if (throttled) return { message: rawMessage, code: 'RATE_LIMIT' }
  return { message: rawMessage, code: rawCode }
}
```

**② 替换 `session.execution.failed` 分支**。

把：

```ts
      case 'session.execution.failed': {
        const err = d?.error
        yield { type: 'usage', usage: heldUsage ?? ZERO_USAGE }
        yield {
          type: 'finish',
          reason: {
            kind: 'error',
            failure: {
              message: typeof err?.message === 'string' && err.message.length > 0 ? err.message : 'session execution failed',
              code: typeof err?.type === 'string' && err.type.length > 0 ? err.type : 'UPSTREAM',
            },
          },
        }
        return
      }
```

改为：

```ts
      case 'session.execution.failed': {
        const err = d?.error
        yield { type: 'usage', usage: heldUsage ?? ZERO_USAGE }
        yield { type: 'finish', reason: { kind: 'error', failure: classifyFailure(err) } }
        return
      }
```

**W3 自检**：
```powershell
Select-String -Path plugin\src\adapter\translate.ts -Pattern 'export function classifyFailure' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\adapter\translate.ts -Pattern 'failure: classifyFailure\(err\)' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\adapter\translate.ts -Pattern "code: typeof err\?\.type" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 0
```

---

### W4-a｜`plugin/src/config.ts`（F14·精确增补）

**① 接口字段**。把：

```ts
  thinkingVariant: string
  hiddenModels: string[]
  apiEnabled: boolean
```

改为：

```ts
  thinkingVariant: string
  hiddenModels: string[]
  compactionProvider: string
  compactionModel: string
  apiEnabled: boolean
```

**② Schema 字段**。把：

```ts
  hiddenModels: Schema.array(Schema.string()).default([]).volatile(),
  apiEnabled: Schema.boolean().default(false),
```

改为：

```ts
  hiddenModels: Schema.array(Schema.string()).default([]).volatile(),
  compactionProvider: Schema.string().default('deepseek-official').volatile(),
  compactionModel: Schema.string().default('deepseek-flash').volatile(),
  apiEnabled: Schema.boolean().default(false),
```

**③ `resolveConfig` 返回值**。把：

```ts
  const allow = unwrap(c.toolAllowlist)
  const hidden = unwrap(c.hiddenModels)
  return {
```

改为：

```ts
  const allow = unwrap(c.toolAllowlist)
  const hidden = unwrap(c.hiddenModels)
  const compactionProvider = unwrap(c.compactionProvider)
  const compactionModel = unwrap(c.compactionModel)
  return {
```

再把：

```ts
    hiddenModels: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    apiEnabled: unwrap(c.apiEnabled) === true,
```

改为：

```ts
    hiddenModels: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    compactionProvider: typeof compactionProvider === 'string' && compactionProvider.trim().length > 0 ? compactionProvider.trim() : 'deepseek-official',
    compactionModel: typeof compactionModel === 'string' && compactionModel.trim().length > 0 ? compactionModel.trim() : 'deepseek-flash',
    apiEnabled: unwrap(c.apiEnabled) === true,
```

**④ 三个新函数**：追加到文件**末尾**（`liveApiConfig` 之后）：

```ts

/** Live compaction provider (the model that summarizes history). */
export function liveCompactionProvider(config: Partial<ResolvedPluginConfig> | undefined | null): string {
  const v = unwrap((config ?? {}).compactionProvider)
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : 'deepseek-official'
}

/** Live compaction model paired with {@link liveCompactionProvider}. */
export function liveCompactionModel(config: Partial<ResolvedPluginConfig> | undefined | null): string {
  const v = unwrap((config ?? {}).compactionModel)
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : 'deepseek-flash'
}

/**
 * Redirect one compaction request onto the configured model in place.
 * @param options - the request reaching the `llm/stream` waterfall.
 * @param provider - configured compaction provider.
 * @param model - configured compaction model.
 * @returns whether the route changed; non-compaction requests are never touched.
 */
export function applyCompactionRoute(
  options: { purpose?: string; provider?: string; model?: string },
  provider: string,
  model: string,
): boolean {
  if (options === undefined || options === null) return false
  if (options.purpose !== 'compaction') return false
  if (provider.length === 0 || model.length === 0) return false
  if (options.provider === provider && options.model === model) return false
  options.provider = provider
  options.model = model
  return true
}
```

**W4-a 自检**：
```powershell
Select-String -Path plugin\src\config.ts -Pattern 'compactionProvider: Schema.string\(\).default' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\config.ts -Pattern 'export function applyCompactionRoute' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
```

---

### W4-b｜`plugin/src/index.ts`（F16·精确增补）

**① import 行**。把：

```ts
import { resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig, type ResolvedPluginConfig } from './config.ts'
```

改为：

```ts
import {
  resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig,
  liveCompactionProvider, liveCompactionModel, applyCompactionRoute,
  type ResolvedPluginConfig,
} from './config.ts'
```

**② `PluginContext` 接口**。把：

```ts
export interface PluginContext {
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
  llm?: { registerAdapter(providers: string[], adapter: unknown): unknown }
  effect?(fn: () => () => void): unknown
  inject?(services: string[], callback: (ctx: any) => void | Promise<void>): unknown
}
```

改为：

```ts
export interface PluginContext {
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
  llm?: { registerAdapter(providers: string[], adapter: unknown): unknown }
  effect?(fn: () => () => void): unknown
  inject?(services: string[], callback: (ctx: any) => void | Promise<void>): unknown
  on?(event: string, listener: (...args: any[]) => any): unknown
  get?(service: string): any
}
```

**③ 注册 `llm/stream` 路由监听器**。在 `ctx.llm.registerAdapter([cfg.providerId], adapter)` 与 `ctx.logger.info(...)` 两行**之后**、`ctx.inject?.(['settings'], ...)` **之前**，插入：

```ts

  // Route every compaction request to the configured summarization model.
  // Compaction requests are hand-built and mutable; loop requests never carry
  // purpose==='compaction', so ordinary conversation is left byte-identical.
  const listen = (ctx as { on?: (event: string, listener: (...args: any[]) => any) => unknown }).on
  if (typeof listen === 'function') {
    ctx.effect?.(() => {
      const dispose = listen.call(ctx, 'llm/stream', (options: any, next: () => any) => {
        try {
          applyCompactionRoute(options, liveCompactionProvider(config), liveCompactionModel(config))
        } catch { /* a frozen request keeps its original route */ }
        return next()
      })
      return () => { if (typeof dispose === 'function') (dispose as () => void)() }
    })
  }
```

**④ 路由装配**。把 `registerWebRoutes(ctx, {...})` 调用**整体替换**为：

```ts
  registerWebRoutes(ctx, {
    catalog,
    hiddenModels: () => liveHiddenModels(config),
    refresh: async () => { await catalog.refresh() },
    compaction: () => ({
      provider: liveCompactionProvider(config),
      model: liveCompactionModel(config),
    }),
  })
```

**W4-b 自检**：
```powershell
Select-String -Path plugin\src\index.ts -Pattern "'llm/stream'" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\index.ts -Pattern 'compaction: \(\) => \(' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
```

---

### W4-c｜`plugin/src/client/status-paths.ts`（F13·精确增补）

把文件整体替换为：

```ts
export const MODELS_PATH = '/plugins/opencode-local/models'
export const MODELS_REFRESH_PATH = '/plugins/opencode-local/models/refresh'
export const CATALOG_PATH = '/plugins/opencode-local/catalog'
export const CATALOG_REFRESH_PATH = '/plugins/opencode-local/catalog/refresh'
export const CONTEXT_PATH = '/plugins/opencode-local/context'
export const COMPACT_PATH = '/plugins/opencode-local/compact'

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

export interface WebCatalogModel {
  id: string
  name: string
  contextWindow?: number
}

export interface WebCatalogGroup {
  id: string
  name: string
  models: WebCatalogModel[]
}

export interface WebCatalogPayload {
  default?: { provider?: string; model?: string }
  groups?: WebCatalogGroup[]
  failures?: Array<{ id: string; name?: string; message: string }>
}

export const TOOL_ACTIONS = ['shell', 'edit', 'read', 'webfetch', 'websearch', 'grep', 'glob', 'external_directory'] as const
```

---

### W4-d｜`plugin/src/web/routes.ts`（F15·**完整替换**）

> 说明：原有 models 两条路由**逻辑不变**，新增 catalog/context/compact 三条。新路由放在**独立的 `ctx.inject` 块**中，缺服务时整体不注册（不拖垮原路由）。

完整内容：

```ts
import type { ModelCatalog } from '../catalog/models.ts'
import type { CatalogEntry } from '../types.ts'

export interface WebRouteDeps {
  catalog: ModelCatalog
  hiddenModels: () => string[]
  refresh: () => Promise<void>
  compaction: () => { provider: string; model: string }
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

function send(res: any, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

export function registerWebRoutes(ctx: any, deps: WebRouteDeps): void {
  ctx.inject?.(['webServer'], (webCtx: any) => {
    const ws = webCtx.webServer ?? webCtx.get?.('webServer')
    if (!ws?.register) return
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

  // Full catalog, live context readings, and on-demand compaction. Registered in a
  // separate block so a composition missing one host service still serves the
  // model routes above.
  ctx.inject?.(
    ['webServer', 'llm', 'commands', 'agents', 'sessions', 'tokenMeter', 'sessionProjections'],
    (richCtx: any) => {
      const ws = richCtx.webServer ?? richCtx.get?.('webServer')
      const llm = richCtx.llm ?? richCtx.get?.('llm')
      const commands = richCtx.commands ?? richCtx.get?.('commands')
      const agents = richCtx.agents ?? richCtx.get?.('agents')
      const sessions = richCtx.sessions ?? richCtx.get?.('sessions')
      const tokenMeter = richCtx.tokenMeter ?? richCtx.get?.('tokenMeter')
      const sessionProjections = richCtx.sessionProjections ?? richCtx.get?.('sessionProjections')
      if (!ws?.register || !llm) return

      const buildCatalog = async (): Promise<Record<string, unknown>> => {
        const groups: Array<Record<string, unknown>> = []
        const failures: Array<Record<string, unknown>> = []
        const defaultRoute = deps.compaction()
        let providers: Array<{ id: string; name?: string }> = []
        try { providers = llm.listProviders() ?? [] } catch { providers = [] }
        for (const provider of providers) {
          try {
            const models = await llm.listModels(provider.id)
            const entries: Array<Record<string, unknown>> = []
            for (const model of models ?? []) {
              let contextWindow: number | undefined
              try {
                const info = await llm.resolveModelInfo(provider.id, model.id)
                const value = info?.context?.contextWindow
                if (typeof value === 'number' && Number.isFinite(value) && value > 0) contextWindow = value
              } catch { /* no capacity advertised */ }
              entries.push({
                id: model.id,
                name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
                ...(contextWindow === undefined ? {} : { contextWindow }),
              })
            }
            if (entries.length > 0) {
              groups.push({ id: provider.id, name: typeof provider.name === 'string' && provider.name.length > 0 ? provider.name : provider.id, models: entries })
            }
          } catch (err) {
            failures.push({ id: provider.id, name: provider.name, message: err instanceof Error ? err.message : String(err) })
          }
        }
        return { default: defaultRoute, groups, failures }
      }

      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/catalog',
        handler: async (req: any, res: any) => {
          if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
          try { send(res, 200, await buildCatalog()) } catch (err) { send(res, 500, { error: err instanceof Error ? err.message : String(err) }) }
        },
      })
      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/catalog/refresh',
        handler: async (req: any, res: any) => {
          if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
          try { send(res, 200, await buildCatalog()) } catch (err) { send(res, 500, { error: err instanceof Error ? err.message : String(err) }) }
        },
      })

      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/context',
        handler: (req: any, res: any) => {
          if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
          let sessionId = ''
          try {
            const url = new URL(req.url, 'http://127.0.0.1')
            sessionId = url.searchParams.get('sessionId') ?? ''
          } catch { sessionId = '' }
          if (sessionId.length === 0) return send(res, 400, { error: 'sessionId required' })
          let session: any
          try { session = sessions?.get?.(sessionId) } catch { session = undefined }
          if (session === undefined || session === null) return send(res, 200, { sessionId, found: false })
          let values: any = {}
          try { values = sessionProjections?.snapshot?.(session)?.values ?? {} } catch { values = {} }
          let totalTokens: number | undefined
          try {
            const measurement = tokenMeter?.measure?.(session)
            if (typeof measurement?.totalTokens === 'number') totalTokens = measurement.totalTokens
          } catch { totalTokens = undefined }
          const pressure = values.contextPressure
          const breakdown = values.contextBreakdown
          const usage = values.tokenUsage
          const contextWindow = typeof pressure?.contextWindow === 'number' ? pressure.contextWindow : undefined
          const used = typeof pressure?.projectedTokens === 'number'
            ? pressure.projectedTokens
            : typeof pressure?.pressureTokens === 'number' ? pressure.pressureTokens : totalTokens
          const percent = typeof used === 'number' && typeof contextWindow === 'number' && contextWindow > 0
            ? Math.round((used / contextWindow) * 100)
            : undefined
          send(res, 200, {
            sessionId,
            found: true,
            ...(pressure === undefined ? {} : { pressure }),
            ...(breakdown === undefined ? {} : { breakdown }),
            ...(usage === undefined ? {} : { usage }),
            ...(totalTokens === undefined ? {} : { totalTokens }),
            ...(percent === undefined ? {} : { percent }),
          })
        },
      })

      ws.register({
        kind: 'exact',
        path: '/plugins/opencode-local/compact',
        handler: async (req: any, res: any) => {
          if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
          const body = await readJson(req)
          const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          if (sessionId.length === 0) return send(res, 400, { ok: false, error: 'sessionId required' })
          if (!commands?.execute) return send(res, 503, { ok: false, error: 'commands unavailable' })
          let agent: any
          try { agent = agents?.get?.(sessionId) } catch { agent = undefined }
          if (agent === undefined || agent === null) return send(res, 404, { ok: false, error: 'session not found' })
          const controller = new AbortController()
          req.on?.('close', () => { if (!controller.signal.aborted) controller.abort() })
          try {
            const result = await commands.execute(agent, '/compact', [], controller.signal)
            if (result === undefined) return send(res, 200, { ok: false, kind: 'error', text: 'compact command unavailable' })
            send(res, 200, {
              ok: result.result?.kind === 'success',
              kind: result.result?.kind ?? 'error',
              text: result.result?.text ?? '',
              ...(result.result?.sourceEventSeq === undefined ? {} : { sourceEventSeq: result.result.sourceEventSeq }),
            })
          } catch (err) {
            send(res, 200, { ok: false, kind: 'error', text: err instanceof Error ? err.message : String(err) })
          }
        },
      })
    },
  )
}
```

**W4 自检**：
```powershell
Select-String -Path plugin\src\web\routes.ts -Pattern "path: '/plugins/opencode-local/compact'" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\src\client\status-paths.ts -Pattern 'export const COMPACT_PATH' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
```

---

### W5-a｜`plugin/src/client/status-paths.ts`

> **注意**：本文件归 W4（W4-c）。W5 只**读取**其中的常量与类型，**不得修改**。若 W5 先于 W4 完成，import 会暂时报错，等 W4 落盘后即消失——这是预期，不要"顺手修复"。

---

### W5-b｜`plugin/src/client/locales.ts`（F11·精确增补）

**① `zh` 对象**：在 `'tab.tools': '可用工具',` 之后插入：

```ts
  'tab.compaction': '上下文压缩',
```

在 `'thinking.hint': '按当前模型的可选档位；选 default 用模型默认。',` 之后插入：

```ts
  'compaction.hint': '人工主动压缩 与 切模型时 DSH 自动压缩 是同一个操作，都使用这里指定的模型；只影响压缩，不改变聊天模型。',
  'compaction.button': '压缩上下文',
  'compaction.buttonBusy': '压缩中…',
  'compaction.model': '压缩模型',
  'compaction.modelHint': '默认官方仅为保底；DSH 配置的第三方 API 与官方同级，任选皆可。',
  'compaction.status': '当前上下文',
  'compaction.used': '已用 token',
  'compaction.projected': '下一请求预估',
  'compaction.window': '窗口容量',
  'compaction.percent': '占用',
  'compaction.breakdown': '构成（系统/工具/消息）',
  'compaction.usage': '累计用量（输入/输出/缓存读/缓存写）',
  'compaction.noSession': '未找到当前会话，请先在对话中发一条消息。',
  'compaction.empty': '暂无上下文数据（需要该模型产生过一次用量上报）。',
```

**② `en` 对象**：在 `'tab.tools': 'Tools',` 之后插入：

```ts
  'tab.compaction': 'Context compaction',
```

在 `'thinking.hint': 'Options follow the current model; default uses the model default.',` 之后插入：

```ts
  'compaction.hint': 'Manual compaction and the automatic compaction DSH runs on a model switch are the same operation: both use the model chosen here. It never changes the chat model.',
  'compaction.button': 'Compact context',
  'compaction.buttonBusy': 'Compacting…',
  'compaction.model': 'Compaction model',
  'compaction.modelHint': 'The official default is only a fallback; third-party APIs configured in DSH are peers of the official one.',
  'compaction.status': 'Current context',
  'compaction.used': 'Used tokens',
  'compaction.projected': 'Next request estimate',
  'compaction.window': 'Window capacity',
  'compaction.percent': 'Occupancy',
  'compaction.breakdown': 'Composition (system/tools/messages)',
  'compaction.usage': 'Cumulative usage (input/output/cache read/cache write)',
  'compaction.noSession': 'No current session found; send a message in a conversation first.',
  'compaction.empty': 'No context data yet (the model must report usage once).',
```

**W5-b 自检**：
```powershell
Select-String -Path plugin\src\client\locales.ts -Pattern "'tab.compaction'" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 2（zh + en）
Select-String -Path plugin\src\client\locales.ts -Pattern "'compaction.button'" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 2
```

---

### W5-c｜`plugin/src/client/styles.ts`（F12·精确增补）

在 `CARD_CSS` 模板字符串**闭合反引号之前**（即最后一行 `.olp-crash{...}` 之后）追加：

```css
.olp-section{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l2,#2c2d31);border-radius:10px}
.olp-section-title{font-size:12px;color:var(--dsw-alias-label-tertiary,#999);margin:0}
.olp-model-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#999);margin:0}
.olp-select{font:inherit;font-size:13px;padding:6px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#36373b);background:var(--dsw-alias-bg-layer-2,#25262b);color:inherit;max-width:100%}
.olp-kv{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13px;align-items:baseline}
.olp-kv-key{color:var(--dsw-alias-label-secondary,#aaa)}
.olp-kv-val{font-variant-numeric:tabular-nums}
.olp-ok{font-size:13px;color:var(--dsw-alias-label-secondary,#aaa)}
```

（缩进与原文对齐：模板字符串内部顶格，不加前导空格。）

---

### W5-d｜`plugin/src/client/CompactionTab.tsx`（F10·**新建**）

完整内容：

```tsx
import { createElement as h, useEffect, useState } from 'react'
import { CATALOG_PATH, CONTEXT_PATH, COMPACT_PATH } from './status-paths.ts'
import type { WebCatalogPayload } from './status-paths.ts'

function currentSessionId(sessions: any): string | undefined {
  try {
    const byId = sessions?.list?.getSnapshot?.()?.byId
    if (byId === null || typeof byId !== 'object') return undefined
    for (const value of Object.values(byId) as any[]) {
      if (value && typeof value.id === 'string' && (value.retainedBy?.mainView ?? 0) > 0) return value.id
    }
    return undefined
  } catch { return undefined }
}

function pairOf(provider: string, model: string): string {
  return provider + '\u0000' + model
}

export function CompactionTab(props: any) {
  const t = props.t ?? ((k: string) => k)
  const scope = props.scope
  const committed = scope?.getSnapshot?.()?.value ?? {}
  const provider = typeof committed.compactionProvider === 'string' && committed.compactionProvider.length > 0
    ? committed.compactionProvider : 'deepseek-official'
  const model = typeof committed.compactionModel === 'string' && committed.compactionModel.length > 0
    ? committed.compactionModel : 'deepseek-flash'
  const sessionId = currentSessionId(props.sessions)
  const [catalog, setCatalog] = useState<WebCatalogPayload | null>(null)
  const [context, setContext] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(CATALOG_PATH, { credentials: 'same-origin' })
        const body = await r.json() as WebCatalogPayload
        if (!cancelled) setCatalog(body)
      } catch { /* keep previous catalog */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (sessionId === undefined) { setContext(null); return }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const r = await fetch(CONTEXT_PATH + '?sessionId=' + encodeURIComponent(sessionId), { credentials: 'same-origin' })
        const body = await r.json()
        if (!cancelled) setContext(body)
      } catch { /* keep previous reading */ }
    }
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [sessionId])

  const choose = async (value: string): Promise<void> => {
    const at = value.indexOf('\u0000')
    if (at < 0) return
    try {
      await scope?.set?.('compactionProvider', value.slice(0, at))
      await scope?.set?.('compactionModel', value.slice(at + 1))
    } catch { /* observe on reopen */ }
  }

  const compact = async (): Promise<void> => {
    if (sessionId === undefined) { setError(t('compaction.noSession')); return }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const r = await fetch(COMPACT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const body = await r.json() as { ok?: boolean; text?: string; error?: string }
      if (body.ok === true) setMessage(body.text ?? '')
      else setError(body.text !== undefined && body.text.length > 0 ? body.text : (body.error ?? 'failed'))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const groups = Array.isArray(catalog?.groups) ? catalog!.groups! : []
  const live = pairOf(provider, model)
  const known = groups.some((g) => g.models.some((m) => pairOf(g.id, m.id) === live))
  const rows: Array<[string, string]> = []
  const pressure = context?.pressure
  if (pressure?.pressureTokens !== undefined) rows.push([t('compaction.used'), String(pressure.pressureTokens)])
  if (pressure?.projectedTokens !== undefined) rows.push([t('compaction.projected'), String(pressure.projectedTokens)])
  if (pressure?.contextWindow !== undefined) rows.push([t('compaction.window'), String(pressure.contextWindow)])
  if (context?.percent !== undefined) rows.push([t('compaction.percent'), String(context.percent) + '%'])
  const breakdown = context?.breakdown
  if (breakdown !== undefined && breakdown !== null) {
    rows.push([t('compaction.breakdown'), [breakdown.systemTokens, breakdown.toolsTokens, breakdown.messageTokens].join(' / ')])
  }
  const usage = context?.usage
  if (usage !== undefined && usage !== null) {
    rows.push([t('compaction.usage'), [usage.uncachedInputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].join(' / ')])
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('p', { className: 'olp-hint' }, t('compaction.hint')),
    h('div', { className: 'olp-section' },
      h('button', { className: 'olp-btn', onClick: () => { void compact() }, disabled: busy === true },
        busy === true ? t('compaction.buttonBusy') : t('compaction.button')),
      message.length > 0 ? h('p', { className: 'olp-ok' }, message) : null,
      error.length > 0 ? h('p', { className: 'olp-error' }, error) : null,
    ),
    h('div', { className: 'olp-section' },
      h('p', { className: 'olp-section-title' }, t('compaction.model')),
      h('select', {
        className: 'olp-select',
        value: live,
        onChange: (e: any) => { void choose(e.target.value) },
      },
        ...groups.map((g) => h('optgroup', { key: g.id, label: g.name },
          ...g.models.map((m) => h('option', { key: pairOf(g.id, m.id), value: pairOf(g.id, m.id) }, m.name))),
        ),
        known ? null : h('option', { value: live }, provider + ' / ' + model),
      ),
      h('p', { className: 'olp-model-hint' }, t('compaction.modelHint')),
    ),
    h('div', { className: 'olp-section' },
      h('p', { className: 'olp-section-title' }, t('compaction.status')),
      rows.length === 0
        ? h('p', { className: 'olp-hint' }, t('compaction.empty'))
        : h('div', { className: 'olp-kv' },
            ...rows.flatMap(([key, value]) => [
              h('span', { key: key + ':k', className: 'olp-kv-key' }, key),
              h('span', { key: key + ':v', className: 'olp-kv-val' }, value),
            ]),
          ),
    ),
  )
}
```

---

### W5-e｜`plugin/src/client/OpencodeLocalCard.tsx`（F09·**完整替换**）

完整内容：

```tsx
import { Component, createElement as h, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { MODELS_PATH, MODELS_REFRESH_PATH } from './status-paths.ts'
import type { WebModelsPayload } from './status-paths.ts'
import { ModelsTab } from './ModelsTab.tsx'
import { ToolsTab } from './ToolsTab.tsx'
import { CompactionTab } from './CompactionTab.tsx'

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
  const sessions = props.sessions
  const [panel, setPanel] = useState<'models' | 'tools' | 'compaction'>('models')
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
  const tabBtn = (id: 'models' | 'tools' | 'compaction', label: string) =>
    h('button', { key: id, role: 'tab', className: 'olp-tab' + (panel === id ? ' olp-tab-active' : ''), onClick: () => setPanel(id) }, label)
  return h('div', { className: 'olp-card' },
    h('div', { className: 'olp-tabs', role: 'tablist' },
      tabBtn('models', t('tab.models')),
      tabBtn('tools', t('tab.tools')),
      tabBtn('compaction', t('tab.compaction')),
    ),
    error ? h('p', { className: 'olp-error' }, error) : null,
    panel === 'models'
      ? h(ModelsTab, { t, scope, payload, loading, refreshing, onRefresh: refresh })
      : panel === 'tools'
        ? h(ToolsTab, { t, scope })
        : h(CompactionTab, { t, scope, sessions }),
  )
}

export function OpencodeLocalCard(props: any) {
  return h(CardBoundary, null, h(CardBody, props))
}
```

---

### W5-f｜`plugin/src/client/index.tsx`（F09 配套·精确增补）

> ⚠️ **本文件属 W5**（debug.md 中 F09 的配套接线；§2 清单已并入 W5，勿由 W4 修改）。

**① 取 sessions 服务**。把：

```ts
    const forms = ctx.get?.('configForms')
```

改为：

```ts
    const forms = ctx.get?.('configForms')
    const sessions = ctx.get?.('sessions')
```

**② 注入 sessions**。把：

```ts
        label: () => t('nav.panel'), locale: ns, inject: () => ({ t, scope, surface: 'settings' }),
```

改为：

```ts
        label: () => t('nav.panel'), locale: ns, inject: () => ({ t, scope, surface: 'settings', sessions }),
```

> 只改这两处；`registerComposer` 与 `inject(['conversation.input.right'])` 部分**不动**。

---

### W6｜测试文件（F06、F18、F07+F19）

#### W6-a｜`docs/impl-harness/h6-compaction.mjs`（新建·完整内容）

```js
import { check, collectStream, firstModel, record, spend } from './lib.mjs'
import { classifyFailure } from '../../plugin/src/adapter/translate.ts'
import { flattenCompaction, flattenHistory } from '../../plugin/src/adapter/flatten.ts'
import { applyCompactionRoute, liveCompactionModel, liveCompactionProvider } from '../../plugin/src/config.ts'

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

  // A1' — compaction routes onto the configured model; chat is untouched.
  check('h6 compact model default', liveCompactionProvider({}) === 'deepseek-official' && liveCompactionModel({}) === 'deepseek-flash', 'bad defaults')
  const routed = { purpose: 'compaction', provider: 'opencode-local', model: 'free-x' }
  check('h6 compaction rerouted',
    applyCompactionRoute(routed, 'deepseek-official', 'deepseek-flash') === true
      && routed.provider === 'deepseek-official' && routed.model === 'deepseek-flash', JSON.stringify(routed))
  const plain = { provider: 'opencode-local', model: 'free-x' }
  check('h6 plain request untouched',
    applyCompactionRoute(plain, 'deepseek-official', 'deepseek-flash') === false
      && plain.provider === 'opencode-local' && plain.model === 'free-x', JSON.stringify(plain))
  const equal = { purpose: 'compaction', provider: 'deepseek-official', model: 'deepseek-flash' }
  check('h6 equal route is a no-op',
    applyCompactionRoute(equal, 'deepseek-official', 'deepseek-flash') === false, 'reported a change')

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
```

> 说明：`check('h6 finish not transport', ...)` 只排除传输层硬失败；真实上游若限流，本轮已由插件内重试兜住，仍以 `finish` 存在为通过。

#### W6-b｜`docs/impl-harness/h7-compaction-ui.mjs`（新建·完整内容）

```js
import { check, record } from './lib.mjs'
import {
  applyCompactionRoute, liveCompactionModel, liveCompactionProvider, resolveConfig,
} from '../../plugin/src/config.ts'
import {
  CATALOG_PATH, CATALOG_REFRESH_PATH, COMPACT_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH,
} from '../../plugin/src/client/status-paths.ts'

export async function run(_runtime) {
  // Configuration defaults and shape.
  const cfg = resolveConfig({})
  check('h7 default provider', cfg.compactionProvider === 'deepseek-official', cfg.compactionProvider)
  check('h7 default model', cfg.compactionModel === 'deepseek-flash', cfg.compactionModel)
  check('h7 override provider', resolveConfig({ compactionProvider: 'third-party-a' }).compactionProvider === 'third-party-a', 'override ignored')
  check('h7 override model', resolveConfig({ compactionModel: 'third-party-model' }).compactionModel === 'third-party-model', 'override ignored')
  check('h7 blank falls back', resolveConfig({ compactionProvider: '   ' }).compactionProvider === 'deepseek-official', 'blank not defaulted')
  check('h7 live reader defaults', liveCompactionProvider(undefined) === 'deepseek-official' && liveCompactionModel(null) === 'deepseek-flash', 'live reader default')

  // Routing semantics (manual and automatic share one listener).
  const cases = [
    ['compaction from opencode-local', { purpose: 'compaction', provider: 'opencode-local', model: 'free' }, 'deepseek-official', 'deepseek-flash', true],
    ['compaction from third-party', { purpose: 'compaction', provider: 'third-party', model: 'm' }, 'deepseek-official', 'deepseek-flash', true],
    ['plain chat untouched', { provider: 'opencode-local', model: 'free' }, 'deepseek-official', 'deepseek-flash', false],
    ['already routed', { purpose: 'compaction', provider: 'deepseek-official', model: 'deepseek-flash' }, 'deepseek-official', 'deepseek-flash', false],
    ['empty target ignored', { purpose: 'compaction', provider: 'opencode-local', model: 'free' }, '', '', false],
  ]
  for (const [name, options, provider, model, expected] of cases) {
    const changed = applyCompactionRoute(options, provider, model)
    check('h7 route: ' + name, changed === expected, JSON.stringify({ changed, expected, options }))
  }
  const target = { purpose: 'compaction', provider: 'opencode-local', model: 'free' }
  applyCompactionRoute(target, 'third-party', 'm2')
  check('h7 route follows selector', target.provider === 'third-party' && target.model === 'm2', JSON.stringify(target))

  // Route constants agree with the documented contract.
  const paths = { CATALOG_PATH, CATALOG_REFRESH_PATH, CONTEXT_PATH, COMPACT_PATH, MODELS_PATH, MODELS_REFRESH_PATH }
  const expected = {
    CATALOG_PATH: '/plugins/opencode-local/catalog',
    CATALOG_REFRESH_PATH: '/plugins/opencode-local/catalog/refresh',
    CONTEXT_PATH: '/plugins/opencode-local/context',
    COMPACT_PATH: '/plugins/opencode-local/compact',
    MODELS_PATH: '/plugins/opencode-local/models',
    MODELS_REFRESH_PATH: '/plugins/opencode-local/models/refresh',
  }
  for (const [key, value] of Object.entries(expected)) {
    check('h7 path ' + key, paths[key] === value, String(paths[key]))
  }

  record('h7-compaction-ui', { provider: cfg.compactionProvider, model: cfg.compactionModel, paths })
  return 'ok'
}
```

#### W6-c｜`docs/impl-harness/run-all.mjs`（F07+F19·**完整替换**）

```js
import fs from 'node:fs'
import path from 'node:path'
import { RAW, makeRuntime } from './lib.mjs'
import * as h1 from './h1-free-filter.mjs'
import * as h2 from './h2-tools.mjs'
import * as h3 from './h3-stream.mjs'
import * as h4 from './h4-api.mjs'
import * as h5 from './h5-allow-all.mjs'
import * as h6 from './h6-compaction.mjs'
import * as h7 from './h7-compaction-ui.mjs'

const summary = { startedAt: new Date().toISOString(), results: {}, failed: [] }
const runtime = makeRuntime()
try {
  for (const [name, mod] of [['h1', h1], ['h2', h2], ['h3', h3], ['h4', h4], ['h5', h5], ['h6', h6], ['h7', h7]]) {
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
```

**W6 自检**：
```powershell
Select-String -Path docs\impl-harness\run-all.mjs -Pattern "h6-compaction|h7-compaction-ui" | Measure-Object | Select-Object -ExpandProperty Count  # 期望 2
Test-Path docs\impl-harness\h6-compaction.mjs   # True
Test-Path docs\impl-harness\h7-compaction-ui.mjs  # True
```

---

### W7｜版本与文档（F05、F08）

#### W7-a｜`plugin/package.json`

把 `"version": "0.2.4",` 改为 `"version": "0.2.5",`（**只改这一处**；`files`、`dsh`、依赖全部不动）。

#### W7-b｜`plugin/README.md`（精确增补）

**① 安装目标**。把：

```
1. 安装：`dsh plugin add hbk-dsh-opencode-local-0.2.4.tgz`（或 DSH 插件管理界面选择该 tgz），目标为 **desktop profile**。
```

改为：

```
1. 安装：`dsh plugin --profile web add hbk-dsh-opencode-local-0.2.5.tgz`（或 DSH 插件管理界面选择该 tgz），目标为 **web profile**（当前使用的 DSH 形态为 web；其对应的插件 profile 即 `web`，与 desktop 共用同一 cordis 底座）。
```

**② 设置页章节**：在 `### 思考档位` 小节**之前**插入新小节：

```markdown
### 「上下文压缩」tab

- **压缩上下文** 按钮：一键调用 DSH 自身的按需压缩（等价于 `/compact`），压缩当前主视图会话；完成后显示压掉了多少历史项、约省多少 token。DSH 正忙时会如实提示稍后再试。
- **压缩模型** 选择框：列出 DSH 的**全部**模型路由（官方 + 你配置的各第三方 API + `opencode-local`）。**人工主动压缩与切模型时 DSH 自动压缩是同一个操作，都使用这里指定的模型**；它**只影响压缩，不改变聊天模型**。默认官方 `deepseek-official / deepseek-flash` **仅为保底**，保证一定有模型可用；第三方 API 与官方同级同效，任选皆可。
- **当前上下文** 面板：只读，显示 DSH 上报的已用/预估 token、窗口容量、占用比例、系统/工具/消息构成、累计用量。**有什么显示什么**——未上报的字段留空，不做估算、不编数字。
- 选择框选到 `opencode-local` 的模型时，压缩会重新经过本插件的免费通道；此时插件会自动走精简提示形态并禁止放行工具，遇到限流可自动重试。选官方或第三方 API 时压缩不经本插件。

```
> ⚠️ 注意：代码块内不要残留上面说明行；实际插入的是从 `### 「上下文压缩」tab` 到「选官方或第三方 API 时压缩不经本插件。」这一段（含末尾空行）。

**③ 注意事项补一条**：在 `## 注意事项` 列表末尾追加：

```markdown
- 压缩请求被识别为 `purpose: 'compaction'` 时，会改用精简提示形态、且不放行任何工具（压缩指令本身要求不调工具）。只有在压缩模型选为 `opencode-local` 时才会走到这一步。
```

**W7 自检**：
```powershell
Select-String -Path plugin\package.json -Pattern '"version": "0.2.5"' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\README.md -Pattern '「上下文压缩」tab' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
Select-String -Path plugin\README.md -Pattern '--profile web add' | Measure-Object | Select-Object -ExpandProperty Count  # 期望 1
```

---

## §5 施工后自查（每个 agent 自己跑，主执行者复核）

```powershell
cd D:\DSH-Opencode2API-hbk
# 1. 只有清单内文件被改动
git status --short
# 期望：M plugin/package.json; M plugin/README.md; M plugin/src/adapter/flatten.ts; M plugin/src/adapter/translate.ts
#       M plugin/src/adapter/turn.ts; M plugin/src/client/OpencodeLocalCard.tsx; M plugin/src/client/index.tsx
#       M plugin/src/client/locales.ts; M plugin/src/client/status-paths.ts; M plugin/src/client/styles.ts
#       M plugin/src/config.ts; M plugin/src/index.ts; M plugin/src/types.ts; M plugin/src/web/routes.ts
#       M docs/impl-harness/run-all.mjs; ?? docs/impl-harness/h6-compaction.mjs
#       ?? docs/impl-harness/h7-compaction-ui.mjs; ?? plugin/src/client/CompactionTab.tsx
#       ?? temp/code.md（本文档，新建）
#       M temp/debug.md（若尚未提交；属既有方案文档，非本次源码改动）
# 2. 禁改文件必须干净
git status --short -- plugin/cordis.patch.yml plugin/tsconfig.json plugin/tsconfig.client.json plugin/tsdown.config.ts
# 期望：无输出
```

---

## §6 串行验收、打包、安装（**主执行者独自完成，禁止并行**）

> 全部在 `D:\DSH-Opencode2API-hbk` 下、**一条一条**执行；任一步失败即停下报告，不得跳步。

### 6.1 类型检查
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm run typecheck
```
**通过判据**：退出码 0，无 `error TS` 输出（`tsc -p tsconfig.json && tsc -p tsconfig.client.json` 双配置都要过）。

### 6.2 构建
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm run build
```
**通过判据**：退出码 0，`lib/index.js` 与 `lib/client.js` 均重新生成（修改时间更新）。

### 6.3 全量测试
```powershell
cd D:\DSH-Opencode2API-hbk
node docs\impl-harness\run-all.mjs
```
**通过判据**：`summary.json` 中 `allPassed === true`，`failed` 为空数组，`results` 含 h1–h7 且各 `ok: true`。
**失败处理**：读 `temp\impl-harness-results\<hN>.json` 定位；**禁止**为过关而删断言。

### 6.4 打包
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm pack
Get-FileHash hbk-dsh-opencode-local-0.2.5.tgz -Algorithm SHA256
tar -tzf hbk-dsh-opencode-local-0.2.5.tgz
```
**通过判据**：生成 `hbk-dsh-opencode-local-0.2.5.tgz`；包内恰为 5 个条目：`package/lib/client.js`、`package/lib/index.js`、`package/package.json`、`package/README.md`、`package/cordis.patch.yml`。
**记录**：文件字节数 + SHA256（写入 `docs/P2/impl-notes-0.2.5.md`）。

### 6.5 安装到 web profile（**只装不重启**）
```powershell
# 备份 web profile 的 patch
Copy-Item C:\Users\hbk\.dsh\profiles\web\cordis.patch.yml D:\DSH-Opencode2API-hbk\temp\reinstall-backup\cordis.patch.yml.bak-0.2.5-$(Get-Date -Format yyyyMMdd-HHmmss)
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.5.tgz
```
**通过判据**：命令成功；`C:\Users\hbk\.dsh\profiles\web\package.json` 中 `@hbk/dsh-opencode-local` 指向 `0.2.5.tgz`；**web profile 的 `cordis.patch.yml` 整文件未变**（用 `Compare-Object` 与备份比对，差异为空）。
**注意**：`temp\reinstall-backup\` 不存在则先创建。**不要**安装到名为 `desktop` 的 profile。**不要**主动重启 DSH。

### 6.6 收尾文档（施工记录）
- 归档本方案到 `docs/P2/code-debug-0.2.5.md`（内容 = 本文件）。
- 写执行记录 `docs/P2/impl-notes-0.2.5.md`（含：实际改动文件清单、typecheck/build/h1–h7 结果、包字节数与 SHA256、安装 profile 与备份路径、回滚命令）。
- 更新 `docs/handoff.md`：安装/验收目标改为 `web` profile、记录 0.2.5、更正「走 desktop profile」的旧约定。
- **git 提交由人工接管**，本执行不提交。

### 6.7 回滚
```powershell
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.4.tgz
# 若代码需回退：
# git checkout HEAD -- plugin/src docs/impl-harness
```

---

## §7 多 agent 派发模板（可直接复制使用）

### 7.1 通用前置（每个 agent 的 prompt 都必须包含）

```
你在为 D:\DSH-Opencode2API-hbk 执行 0.2.5 施工的其中一个工作包。

硬性约束：
1. 只修改下列文件，其它任何文件一律不碰（尤其不要改 plugin/cordis.patch.yml、tsconfig、tsdown.config.ts）。
2. 代码逐字照抄"施工图"给出的代码块；不优化、不重排 import、不改缩进风格、不删注释。
3. 不要运行 npm run build / npm run pack / 安装插件；这些由主执行者串行完成。
4. 完成后按"自检命令"逐条执行，全部通过后才回复。
5. 回复格式只写：改动文件列表 + 每条自检命令的实际输出数字 + 是否全部通过。

施工图位于 D:\DSH-Opencode2API-hbk\temp\code.md，请只读其中「§3 全局契约」与你负责的 W 节。
```

### 7.2 七个工作包的派发清单

| agent | 负责节 | 允许修改的文件 |
| --- | --- | --- |
| `w1-core-types` | §4 W1-a、W1-b | `plugin/src/types.ts`、`plugin/src/adapter/flatten.ts` |
| `w2-turn` | §4 W2 | `plugin/src/adapter/turn.ts` |
| `w3-translate` | §4 W3 | `plugin/src/adapter/translate.ts` |
| `w4-host` | §4 W4-a…W4-d | `plugin/src/config.ts`、`plugin/src/index.ts`、`plugin/src/web/routes.ts`、`plugin/src/client/status-paths.ts` |
| `w5-client` | §4 W5-b…W5-f | `plugin/src/client/OpencodeLocalCard.tsx`、`plugin/src/client/CompactionTab.tsx`、`plugin/src/client/locales.ts`、`plugin/src/client/styles.ts`、`plugin/src/client/index.tsx` |
| `w6-tests` | §4 W6-a…W6-c | `docs/impl-harness/h6-compaction.mjs`、`docs/impl-harness/h7-compaction-ui.mjs`、`docs/impl-harness/run-all.mjs` |
| `w7-version` | §4 W7-a、W7-b | `plugin/package.json`、`plugin/README.md` |

> **w4 与 w5 的唯一交叉**是 `status-paths.ts`：**归 w4 写**，w5 只读不写。已在本表钉死，避免双写。

### 7.3 并行派发顺序

1. 同时启动 w1、w2、w3、w4、w6、w7（六路互不依赖）。
2. w5 必须**在 w4 完成后**启动（它 import w4 新增的常量与类型；提前启动只是因为 import 暂时报错，不影响落盘，但为减少困惑建议排在 w4 之后）。若环境只支持一次性并行，则 w1–w7 全部同时派发——结果相同（typecheck 在 §6 统一验证）。
3. 全部完成后，主执行者按 §5 自查，再按 §6 串行收口。

### 7.4 并行完成后的逐字节抽查（主执行者）

对每个「完整替换」的文件（`turn.ts`、`routes.ts`、`OpencodeLocalCard.tsx`、`CompactionTab.tsx`、`run-all.mjs`），执行：

```powershell
Select-String -Path <文件> -Pattern '<§4 中该文件的首行与末行特征串>' | Measure-Object
```
首次行与末行特征串都能命中，且文件行数与 §4 代码块行数一致（±2 行，允许末尾换行差异），判定为一致。

---

## §8 故障与回退矩阵

| 现象 | 判据 | 处置 |
| --- | --- | --- |
| `purpose` 类型报错 | `tsc` 报 `purpose` 不存在 | 检查 W1-a 是否落盘；确认 `types.ts` 的 `HarnessGenerateOptions` 内有该字段 |
| `flattenCompaction` 未定义 | `tsc` 报 TS2305 | 检查 W1-b 是否追加在 `flatten.ts` 末尾 |
| `liveCompactionProvider` 未定义 | `tsc` 报 TS2305 | 检查 W4-a ④ 是否追加 |
| `CATALOG_PATH` 未定义 | `tsc` 报 TS2305（W5 侧） | 检查 W4-c 是否整体替换 `status-paths.ts` |
| h6 断言 `compact drops framing` 失败 | 输出里含 `[Conversation History]` | `flattenCompaction` 未替换调用，检查 W2 的 `runTurnOnce` 首行 |
| h6 断言 `tool never approved` 失败 | `toolApproved` 增量 > 0 | 检查 W2 的 `const allowed = !isCompaction && …` |
| h6 `compact title` 失败 | 标题无 `compact-` | 检查 W2 的 title 模板串 |
| h7 `path *` 失败 | 常量字面值不符 | 按 §3.1 表格核对 `status-paths.ts` |
| 设置页无第三个 tab | 界面只见两个 tab | 检查 W5-e 的 `tabBtn('compaction', …)` 与 W5-b 的 locale 键 |
| 编译/构建通过但插件不加载 | DSH 启动日志报 `already configured` 或注入失败 | 检查 W4-b ③ 是否用 `listen.call(ctx, …)` 且未重复 `on`；确认没有改动 `registerWebRoutes` 既有 models 路由 |
| 安装后仍是旧版本 | `package.json` 依赖仍指 0.2.4 | 重跑 §6.5；确认 `--profile web`（不是 desktop） |

**总体回退**：`git checkout HEAD -- plugin/src docs/impl-harness plugin/package.json plugin/README.md`，然后重装 `0.2.4.tgz` 到 web profile。

---

## §9 硬停声明

**本文档仅为施工方案。截至落盘时刻：未修改任何插件源码、未构建、未打包、未安装、未提交 git；仅创建了本方案文档 `temp/code.md`。**
施工需人工下达明确执行指令后方可开始；施工顺序、并行策略、验收命令均以本文档为准。
