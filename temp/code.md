# 0.2.6 代码施工方案（code.md v2）

> **状态：✅ 已按本方案施工完成，打包 0.2.6 并安装到 web profile，已通过人工验收（2026-11-18）。** 归档副本见 `docs/P2/code-debug-0.2.6.md`；执行记录见 `docs/P2/impl-notes-0.2.6.md`。
> **唯一依据**：`D:\DSH-Opencode2API-hbk\temp\debug.md`（v3，探针闭环 + 歧义补全，零待定项）。
> **可复现性**：以「文件内容级」+「精确锚点」描述，逐字照抄代码块，任何模型/任何 agent 软件产物相同。
> **安装目标**：`web` profile（不变）。**不是** desktop。
> 撰写时间：2026-11-17（Asia/Shanghai）。

---

## §0 阅读顺序与铁律

1. 先读 §1（多 agent 能力探测）→ 决定并行或串行。
2. 再读 §3（全局契约）→ **所有执行者必读**，保证并行不打架。
3. 各执行者只读自己那一节（§4 的 A–E 组），**只改自己范围内的文件**。
4. 全部落盘后，由**主执行者串行**执行 §6（验收 + 打包 + 安装 + 收尾）。

### 0.1 铁律（违反即返工）

| # | 铁律 |
| --- | --- |
| R1 | 只改 §2 清单内的文件；清单外零改动（尤其 `plugin/cordis.patch.yml`、`tsconfig*.json`、`tsdown.config.ts`、`api/server.ts`、`serve/*`、`catalog/*`、`adapter/*`）。 |
| R2 | 每个执行者**只碰自己组的文件**，绝不改他组文件。 |
| R3 | 代码**逐字照抄**本文档代码块；不优化、不重排 import、不改缩进、不删注释。 |
| R4 | **不改任何既有导出的名称与语义**；`applyCompactionRoute` 尤其**一字不动**。 |
| R5 | 施工期间**禁止** `npm run build` / `npm run typecheck` / `npm pack` / 安装（统一由主执行者在 §6 做）。 |
| R6 | 每组完成后跑本节末尾**自检命令**，全绿才算完成。 |
| R7 | 不新增任何依赖（`package.json` 的 `dependencies` 保持只有 `@deepseek-ai/schemastery`）。 |
| R8 | 不写调试 `console.log`；**不提交 git**。 |
| R9 | 临时文件只允许出现在 `temp/`；测试用完必须删除。 |

### 0.2 版本

`plugin/package.json` 的 `version`：`0.2.5` → `0.2.6`（仅此一处）。

---

## §1 多 agent 协作：能力探测 → 并行 / 串行

### 1.1 目标

把 §2 的 5 个工作包（A–E）**并行**落盘，再用**串行**验证收口；产物必须与串行执行**字节级相同**。

### 1.2 能力探测（先做，约 1 分钟）

**探针 A（首选，DSH 原生）**
1. 并行启动两个子代理 `probe-a` / `probe-b`，各自任务：
   > 在 `D:\DSH-Opencode2API-hbk\temp\` 下创建 `probe-a.txt`（或 `probe-b.txt`），内容**恰好**为 `probe-ok-a`（或 `probe-ok-b`）：10 字节、无换行、无空格、无 BOM。完成后只回复 `done`。
2. 判定：两文件都出现，`Get-Content -Raw` 长度均为 **10**，内容精确匹配。
3. 成功 ⇒ **并行模式**；`subagent` 工具不可用或失败 ⇒ 探针 B。

**探针 B（平台通用）**：若平台提供任一并行/子任务能力，用同样双文件探针验证；成功 ⇒ 并行模式。

**都失败 ⇒ 串行模式**（结果一致，只影响耗时）。

> **环境预期**：本项目 DSH 环境具备 `subagent` + Agent Teams，探针 A **预期通过**。若被策略禁用，**不要放弃施工**，走串行即可。
> **清理**：无论成败，删除 `temp\probe-a.txt`、`temp\probe-b.txt`。

### 1.3 两种模式的硬约束

| 模式 | 做法 | 要求 |
| --- | --- | --- |
| **并行** | 同时派发 A–E 五个执行者，各自只改自己文件 | 与串行产物**字节级相同** |
| **串行** | 主执行者按 A→B→C→D→E 顺序落盘 | 同上 |

**跨组依赖的处理**（不影响并行）：
- B 组 `web/routes.ts` 要 import `COMPACTION_FILE_VERSION`（A 组新建的文件）；
- C 组 `CompactionTab.tsx` 要 import `COMPACTION_PATH`（B 组改的 `status-paths.ts`）。

两者都是**只在 import 层面**的依赖，§3 已把常量名与字面值钉死，各写各的即可，typecheck 阶段自然吻合。**不要**为了"等对方"而修改别人文件。

**验证阶段禁止并行**（§6 全部命令由主执行者逐条串行执行）。

---

## §2 工作包划分（写入范围，互不重叠）

| 包 | 文件（**只改这些**） |
| --- | --- |
| **A** | `plugin/src/compaction-store.ts`（**新建**）、`plugin/src/config.ts` |
| **B** | `plugin/src/index.ts`、`plugin/src/web/routes.ts`、`plugin/src/client/status-paths.ts` |
| **C** | `plugin/src/client/CompactionTab.tsx` |
| **D** | `docs/impl-harness/h6-compaction.mjs`、`docs/impl-harness/h7-compaction-ui.mjs` |
| **E** | `plugin/README.md`、`plugin/package.json` |

**文件数**：2 + 3 + 1 + 2 + 2 = **9 个文件**，两两无交集。

---

## §3 全局契约（跨文件引用的名字与字面值以此为准，不可改）

### 3.1 新增导出（签名不可变）

| 文件 | 导出 | 签名/值 |
| --- | --- | --- |
| `plugin/src/compaction-store.ts` | `CompactionChoice` | `interface { provider: string; model: string }` |
| 同上 | `DEFAULT_COMPACTION` | `Readonly<CompactionChoice>`，`Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash' })` |
| 同上 | `COMPACTION_FILE_VERSION` | `1` |
| 同上 | `parseCompactionDocument` | `(text: string) => CompactionChoice \| undefined` |
| 同上 | `readCompactionFile` | `(filePath: string) => CompactionChoice`（同步、容错、缓存） |
| 同上 | `writeCompactionFile` | `(filePath: string, next: CompactionChoice) => Promise<void>`（原子、幂等短路、写后失效缓存） |
| 同上 | `migrateCompactionFile` | `(filePath: string, old: { provider?: unknown; model?: unknown } \| undefined) => boolean`（同步一次性） |
| `plugin/src/client/status-paths.ts` | `COMPACTION_PATH` | `'/plugins/opencode-local/compaction'` |
| 同上 | `WebCompactionPayload` | `interface { version?: number; provider?: string; model?: string; error?: string }` |

### 3.2 被删除的导出（必须彻底消失）

`plugin/src/config.ts` 的 `liveCompactionProvider`、`liveCompactionModel`，以及 `ResolvedPluginConfig` / `Config` 中的 `compactionProvider` / `compactionModel` 字段。

> `applyCompactionRoute` **保留且一字不改**（签名 `(options, provider, model) => boolean`）。

### 3.3 文件格式（唯一真相）

路径：`join(homedir(), '.dsh-opencode-local', 'compaction.json')`
内容（2 空格缩进，末尾换行）：
```json
{
  "version": 1,
  "provider": "deepseek-official",
  "model": "deepseek-flash"
}
```

### 3.4 HTTP 契约（前后端唯一依据）

**同一路径只允许注册一次**（webServer 对重复 path 会抛错），必须在**单个 handler 内按 method 分流**：

| 路径 | 方法 | 请求体 | 成功 | 失败 |
| --- | --- | --- | --- | --- |
| `/plugins/opencode-local/compaction` | `GET` | 无 | `200 {version:1, provider, model}` | 无（读失败已回落默认） |
| 同上 | `POST` | `{provider:string, model:string}` | `200 {version:1, provider, model}`（**写后回读**） | `400 {error:"provider and model required"}`；`500 {error:"<原因>"}` |
| 同上 | 其它 | — | — | `405 {error:"method not allowed"}` |

### 3.5 i18n（不改；C 组沿用现有键）

C 组复用已有键：`compaction.model`、`compaction.modelHint`、`compaction.hint`、`compaction.button`、`compaction.buttonBusy`、`compaction.status`、`compaction.empty`、`compaction.noSession`、`compaction.used`、`compaction.projected`、`compaction.window`、`compaction.percent`、`compaction.breakdown`、`compaction.usage`。**不新增、不修改 locale 文件。**

---

## §4 逐文件施工指令

> 「完整替换」= 整文件覆盖；「精确增删」= 按锚点定位替换/插入，其余不动。

---

### A-1｜`plugin/src/compaction-store.ts`（**新建**·完整内容）

```ts
import fs from 'node:fs'
import path from 'node:path'

export interface CompactionChoice {
  provider: string
  model: string
}

export const COMPACTION_FILE_VERSION = 1

export const DEFAULT_COMPACTION: Readonly<CompactionChoice> = Object.freeze({
  provider: 'deepseek-official',
  model: 'deepseek-flash',
})

interface CacheEntry {
  mtimeMs: number
  size: number
  value: CompactionChoice
}

const cache = new Map<string, CacheEntry>()

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Parse the stored document. A bad document yields undefined so callers fall
 * back to defaults; individual invalid fields fall back field by field.
 * @param text - raw file content.
 * @returns the parsed choice, or undefined when the document is unusable.
 */
export function parseCompactionDocument(text: string): CompactionChoice | undefined {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return undefined }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const doc = raw as Record<string, unknown>
  if (doc.version !== COMPACTION_FILE_VERSION) return undefined
  const provider = nonEmpty(doc.provider)
  const model = nonEmpty(doc.model)
  if (provider === undefined && model === undefined) return undefined
  return {
    provider: provider ?? DEFAULT_COMPACTION.provider,
    model: model ?? DEFAULT_COMPACTION.model,
  }
}

function serialize(value: CompactionChoice): string {
  return JSON.stringify({
    version: COMPACTION_FILE_VERSION,
    provider: value.provider,
    model: value.model,
  }, null, 2) + '\n'
}

function readDocument(filePath: string): CompactionChoice | undefined {
  try {
    return parseCompactionDocument(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Read the stored choice. Never throws and never creates the file.
 * @param filePath - absolute path of the document.
 * @returns the stored choice, or the default when absent or unusable.
 */
export function readCompactionFile(filePath: string): CompactionChoice {
  try {
    const stat = fs.statSync(filePath)
    const hit = cache.get(filePath)
    if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return { ...hit.value }
    }
    const value = readDocument(filePath) ?? { ...DEFAULT_COMPACTION }
    cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value })
    return { ...value }
  } catch {
    return { ...DEFAULT_COMPACTION }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function replaceAsync(tmp: string, target: string): Promise<void> {
  const waits = [30, 60, 120]
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.promises.rename(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!retryable || attempt >= waits.length) throw err
      await sleep(waits[attempt])
    }
  }
}

function replaceSync(tmp: string, target: string): void {
  const waits = [30, 60, 120]
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!retryable || attempt >= waits.length) throw err
      const until = Date.now() + waits[attempt]
      while (Date.now() < until) { /* brief synchronous backoff */ }
    }
  }
}

/**
 * Durably replace the document. An unchanged value is a no-op; a corrupt
 * document is healed because the comparison uses the parsed document only.
 * @param filePath - absolute path of the document.
 * @param next - the choice to store.
 */
export async function writeCompactionFile(filePath: string, next: CompactionChoice): Promise<void> {
  const existing = readDocument(filePath)
  if (existing !== undefined && existing.provider === next.provider && existing.model === next.model) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await fs.promises.writeFile(tmp, serialize(next), 'utf8')
  try {
    await replaceAsync(tmp, filePath)
  } catch (err) {
    try { await fs.promises.unlink(tmp) } catch { /* ignore */ }
    throw err
  }
  cache.delete(filePath)
}

/**
 * One-time migration: materialize the document from legacy configuration.
 * Never overwrites an existing document, and never throws.
 * @param filePath - absolute path of the document.
 * @param old - legacy values read from the profile configuration.
 * @returns whether a document was written.
 */
export function migrateCompactionFile(filePath: string, old: { provider?: unknown; model?: unknown } | undefined): boolean {
  try {
    if (fs.existsSync(filePath)) return false
    const provider = nonEmpty(old?.provider) ?? DEFAULT_COMPACTION.provider
    const model = nonEmpty(old?.model) ?? DEFAULT_COMPACTION.model
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, serialize({ provider, model }), 'utf8')
    try {
      replaceSync(tmp, filePath)
    } catch (err) {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
      throw err
    }
    cache.delete(filePath)
    return true
  } catch {
    return false
  }
}
```

**A-1 自检**：
```powershell
Select-String -Path plugin\src\compaction-store.ts -Pattern 'export function parseCompactionDocument|export function readCompactionFile|export async function writeCompactionFile|export function migrateCompactionFile|export const DEFAULT_COMPACTION|export const COMPACTION_FILE_VERSION' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 6
Select-String -Path plugin\src\compaction-store.ts -Pattern 'cache.delete\(filePath\)' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 2（write + migrate）
```

---

### A-2｜`plugin/src/config.ts`（精确删除，**不动** `applyCompactionRoute`）

**① 删除接口两行**。把：
```ts
  hiddenModels: string[]
  compactionProvider: string
  compactionModel: string
  apiEnabled: boolean
```
改为：
```ts
  hiddenModels: string[]
  apiEnabled: boolean
```

**② 删除 schema 两行**。把：
```ts
  hiddenModels: Schema.array(Schema.string()).default([]).volatile(),
  compactionProvider: Schema.string().default('deepseek-official').volatile(),
  compactionModel: Schema.string().default('deepseek-flash').volatile(),
  apiEnabled: Schema.boolean().default(false),
```
改为：
```ts
  hiddenModels: Schema.array(Schema.string()).default([]).volatile(),
  apiEnabled: Schema.boolean().default(false),
```

**③ 删除 `resolveConfig` 的两处 unwrap**。把：
```ts
  const hidden = unwrap(c.hiddenModels)
  const compactionProvider = unwrap(c.compactionProvider)
  const compactionModel = unwrap(c.compactionModel)
  return {
```
改为：
```ts
  const hidden = unwrap(c.hiddenModels)
  return {
```

**④ 删除 `resolveConfig` 返回里的两行**。把：
```ts
    hiddenModels: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    compactionProvider: typeof compactionProvider === 'string' && compactionProvider.trim().length > 0 ? compactionProvider.trim() : 'deepseek-official',
    compactionModel: typeof compactionModel === 'string' && compactionModel.trim().length > 0 ? compactionModel.trim() : 'deepseek-flash',
    apiEnabled: unwrap(c.apiEnabled) === true,
```
改为：
```ts
    hiddenModels: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    apiEnabled: unwrap(c.apiEnabled) === true,
```

**⑤ 删除两个函数**。把（连同上方注释与之间的空行）：
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
```
改为（保留 `applyCompactionRoute` 的文档注释开头）：
```ts
/**
```

**A-2 自检**：
```powershell
Select-String -Path plugin\src\config.ts -Pattern 'compactionProvider|compactionModel|liveCompaction' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path plugin\src\config.ts -Pattern 'export function applyCompactionRoute' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
```

---

### B-1｜`plugin/src/client/status-paths.ts`（精确增补）

**① 常量**：在 `export const COMPACT_PATH = '/plugins/opencode-local/compact'` **之后**插入：
```ts
export const COMPACTION_PATH = '/plugins/opencode-local/compaction'
```

**② 类型**：在 `export const TOOL_ACTIONS = ...` **之前**插入：
```ts
export interface WebCompactionPayload {
  version?: number
  provider?: string
  model?: string
  error?: string
}

```

**B-1 自检**：
```powershell
Select-String -Path plugin\src\client\status-paths.ts -Pattern "COMPACTION_PATH = '/plugins/opencode-local/compaction'" | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\src\client\status-paths.ts -Pattern 'export interface WebCompactionPayload' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
```

---

### B-2｜`plugin/src/web/routes.ts`（精确增删）

**① import**。把：
```ts
import type { ModelCatalog } from '../catalog/models.ts'
import type { CatalogEntry } from '../types.ts'
```
改为：
```ts
import type { ModelCatalog } from '../catalog/models.ts'
import type { CatalogEntry } from '../types.ts'
import { COMPACTION_FILE_VERSION } from '../compaction-store.ts'
```

**② deps 接口**。把：
```ts
export interface WebRouteDeps {
  catalog: ModelCatalog
  hiddenModels: () => string[]
  refresh: () => Promise<void>
  compaction: () => { provider: string; model: string }
}
```
改为：
```ts
export interface WebRouteDeps {
  catalog: ModelCatalog
  hiddenModels: () => string[]
  refresh: () => Promise<void>
  compaction: () => { provider: string; model: string }
  setCompaction: (next: { provider: string; model: string }) => Promise<void>
}
```

**③ 新增路由**：在 `/plugins/opencode-local/models/refresh` 那个 `ws.register({...})` 块的**结束 `})` 之后**、该 `ctx.inject?.(['webServer'], ...)` 闭包结束的 `})` **之前**插入：

```ts

    // One path, method-dispatched: the webServer rejects duplicate path registrations.
    ws.register({
      kind: 'exact',
      path: '/plugins/opencode-local/compaction',
      handler: async (req: any, res: any) => {
        if (req.method === 'GET') {
          const current = deps.compaction()
          return send(res, 200, { version: COMPACTION_FILE_VERSION, provider: current.provider, model: current.model })
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
        const body = await readJson(req)
        const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
        const model = typeof body?.model === 'string' ? body.model.trim() : ''
        if (provider.length === 0 || model.length === 0) return send(res, 400, { error: 'provider and model required' })
        try {
          await deps.setCompaction({ provider, model })
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
        const saved = deps.compaction()
        send(res, 200, { version: COMPACTION_FILE_VERSION, provider: saved.provider, model: saved.model })
      },
    })
```

**B-2 自检**：
```powershell
Select-String -Path plugin\src\web\routes.ts -Pattern "path: '/plugins/opencode-local/compaction'" | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1（只能 1 处，重复注册会抛错）
Select-String -Path plugin\src\web\routes.ts -Pattern 'setCompaction' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 2（接口声明 1 + handler 调用 1）
Select-String -Path plugin\src\web\routes.ts -Pattern 'COMPACTION_FILE_VERSION' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 3（import 1 + GET 1 + POST 1）
```

---

### B-3｜`plugin/src/index.ts`（精确增删）

**① import 行**。把：
```ts
import {
  resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig,
  liveCompactionProvider, liveCompactionModel, applyCompactionRoute,
  type ResolvedPluginConfig,
} from './config.ts'
```
改为：
```ts
import {
  resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig,
  applyCompactionRoute,
  type ResolvedPluginConfig,
} from './config.ts'
import { readCompactionFile, writeCompactionFile, migrateCompactionFile } from './compaction-store.ts'
```

**② store 路径与迁移**。把：
```ts
  const catalog = new ModelCatalog(manager, { cachePath: join(dataDir, 'catalog.json') })
  catalog.loadCache()
```
改为：
```ts
  const catalog = new ModelCatalog(manager, { cachePath: join(dataDir, 'catalog.json') })
  catalog.loadCache()
  const compactionPath = join(dataDir, 'compaction.json')
  try {
    const editor = (ctx as { get?: (name: string) => any }).get?.('configEditor')
    const rows = typeof editor?.configuration === 'function' ? editor.configuration() : undefined
    const row = Array.isArray(rows) ? rows.find((r: any) => r?.entry?.options?.id === 'opencode-local') : undefined
    const legacy = row?.override ?? row?.inherited
    migrateCompactionFile(compactionPath, legacy)
  } catch { /* migration is best-effort */ }
```

**③ 监听器**。把：
```ts
      const dispose = listen.call(ctx, 'llm/stream', (options: any, next: () => any) => {
        try {
          applyCompactionRoute(options, liveCompactionProvider(config), liveCompactionModel(config))
        } catch { /* a frozen request keeps its original route */ }
        return next()
      })
```
改为：
```ts
      const dispose = listen.call(ctx, 'llm/stream', (options: any, next: () => any) => {
        try {
          if (options?.purpose === 'compaction') {
            const choice = readCompactionFile(compactionPath)
            applyCompactionRoute(options, choice.provider, choice.model)
          }
        } catch { /* a frozen request keeps its original route */ }
        return next()
      })
```

**④ 路由装配**。把：
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
改为：
```ts
  registerWebRoutes(ctx, {
    catalog,
    hiddenModels: () => liveHiddenModels(config),
    refresh: async () => { await catalog.refresh() },
    compaction: () => readCompactionFile(compactionPath),
    setCompaction: (next) => writeCompactionFile(compactionPath, next),
  })
```

**B-3 自检**：
```powershell
Select-String -Path plugin\src\index.ts -Pattern 'liveCompaction' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path plugin\src\index.ts -Pattern 'migrateCompactionFile|readCompactionFile|writeCompactionFile' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 5（import 行 1 + 迁移 1 + 监听 1 + 路由 2）
Select-String -Path plugin\src\index.ts -Pattern "export const inject = \['llm'\] as const" | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1（inject 未变）
Select-String -Path plugin\src\index.ts -Pattern 'export async function apply' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0（apply 保持同步）
```

---

### C｜`plugin/src/client/CompactionTab.tsx`（**完整替换**）

```tsx
import { createElement as h, useEffect, useState } from 'react'
import { CATALOG_PATH, CONTEXT_PATH, COMPACT_PATH, COMPACTION_PATH } from './status-paths.ts'
import type { WebCatalogPayload, WebCompactionPayload } from './status-paths.ts'

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
  const sessions = props.sessions
  const sessionId = currentSessionId(sessions)
  const [catalog, setCatalog] = useState<WebCatalogPayload | null>(null)
  const [context, setContext] = useState<any>(null)
  const [provider, setProvider] = useState('deepseek-official')
  const [model, setModel] = useState('deepseek-flash')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
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
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(COMPACTION_PATH, { credentials: 'same-origin' })
        const body = await r.json() as WebCompactionPayload
        if (cancelled) return
        if (typeof body.provider === 'string' && body.provider.length > 0) setProvider(body.provider)
        if (typeof body.model === 'string' && body.model.length > 0) setModel(body.model)
      } catch { /* keep defaults */ }
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
    const nextProvider = value.slice(0, at)
    const nextModel = value.slice(at + 1)
    const previousProvider = provider
    const previousModel = model
    setProvider(nextProvider)
    setModel(nextModel)
    setError('')
    setSaving(true)
    try {
      const r = await fetch(COMPACTION_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: nextProvider, model: nextModel }),
      })
      const body = await r.json() as WebCompactionPayload
      if (r.ok !== true || typeof body.error === 'string') {
        setProvider(previousProvider)
        setModel(previousModel)
        setError(typeof body.error === 'string' ? body.error : 'save failed')
      }
    } catch (e: any) {
      setProvider(previousProvider)
      setModel(previousModel)
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
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
        disabled: saving === true,
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

**C 自检**：
```powershell
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'scope\.set|scope\?\.set|getSnapshot' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'COMPACTION_PATH' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 3（import + GET + POST）
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'setProvider\(nextProvider\)' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1（乐观更新）
```

---

### D-1｜`docs/impl-harness/h6-compaction.mjs`（精确增删）

**① import**。把：
```ts
import { applyCompactionRoute, liveCompactionModel, liveCompactionProvider } from '../../plugin/src/config.ts'
```
改为：
```ts
import { applyCompactionRoute } from '../../plugin/src/config.ts'
import { DEFAULT_COMPACTION, readCompactionFile } from '../../plugin/src/compaction-store.ts'
```

**② 断言**。把：
```ts
  check('h6 compact model default', liveCompactionProvider({}) === 'deepseek-official' && liveCompactionModel({}) === 'deepseek-flash', 'bad defaults')
```
改为：
```ts
  const absent = readCompactionFile('temp/impl-harness-data/__h6-absent-store__.json')
  check('h6 missing store falls back', absent.provider === DEFAULT_COMPACTION.provider && absent.model === DEFAULT_COMPACTION.model, JSON.stringify(absent))
```

**D-1 自检**：
```powershell
Select-String -Path docs\impl-harness\h6-compaction.mjs -Pattern 'liveCompaction' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path docs\impl-harness\h6-compaction.mjs -Pattern 'h6 missing store falls back' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
```

---

### D-2｜`docs/impl-harness/h7-compaction-ui.mjs`（**完整替换**）

```js
import fs from 'node:fs'
import path from 'node:path'
import { check, record, RAW } from './lib.mjs'
import { applyCompactionRoute } from '../../plugin/src/config.ts'
import {
  COMPACTION_FILE_VERSION, DEFAULT_COMPACTION, migrateCompactionFile,
  parseCompactionDocument, readCompactionFile, writeCompactionFile,
} from '../../plugin/src/compaction-store.ts'
import {
  CATALOG_PATH, CATALOG_REFRESH_PATH, COMPACT_PATH, COMPACTION_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH,
} from '../../plugin/src/client/status-paths.ts'

const STORE = path.join(RAW, '..', 'impl-harness-data', 'h7-compaction-store.json')

function cleanup() {
  for (const target of [STORE, STORE + '.tmp']) {
    try { fs.rmSync(target, { force: true }) } catch { /* ignore */ }
  }
}

export async function run(_runtime) {
  cleanup()
  try {
    // 1. Pure parser: document-level and field-level fallback.
    const good = JSON.stringify({ version: 1, provider: 'p', model: 'm' })
    const parsed = parseCompactionDocument(good)
    check('h7 parse valid', parsed?.provider === 'p' && parsed?.model === 'm', JSON.stringify(parsed))
    check('h7 parse bad json', parseCompactionDocument('{oops') === undefined, 'accepted bad json')
    check('h7 parse wrong version', parseCompactionDocument(JSON.stringify({ version: 2, provider: 'p', model: 'm' })) === undefined, 'accepted wrong version')
    check('h7 parse array', parseCompactionDocument('[]') === undefined, 'accepted array')
    const halfProvider = parseCompactionDocument(JSON.stringify({ version: 1, provider: 'only-provider' }))
    check('h7 parse field fallback',
      halfProvider?.provider === 'only-provider' && halfProvider?.model === DEFAULT_COMPACTION.model,
      JSON.stringify(halfProvider))
    const badType = parseCompactionDocument(JSON.stringify({ version: 1, provider: 5, model: 'm2' }))
    check('h7 parse bad field type',
      badType?.provider === DEFAULT_COMPACTION.provider && badType?.model === 'm2', JSON.stringify(badType))
    check('h7 parse empty doc', parseCompactionDocument(JSON.stringify({ version: 1 })) === undefined, 'accepted empty doc')

    // 2. Missing file -> defaults, and reading must not create it.
    check('h7 missing -> default',
      readCompactionFile(STORE).provider === DEFAULT_COMPACTION.provider
        && readCompactionFile(STORE).model === DEFAULT_COMPACTION.model, 'not defaulted')
    check('h7 read does not create', fs.existsSync(STORE) === false, 'reader created the file')

    // 3. Write -> read roundtrip, then write-then-read proves cache invalidation.
    await writeCompactionFile(STORE, { provider: 'deepseek-official', model: 'deepseek-flash' })
    check('h7 write creates file', fs.existsSync(STORE) === true, 'file missing after write')
    const mtimeAfterFirst = fs.statSync(STORE).mtimeMs
    await writeCompactionFile(STORE, { provider: 'deepseek-official', model: 'deepseek-flash' })
    check('h7 idempotent write skips disk', fs.statSync(STORE).mtimeMs === mtimeAfterFirst, 'rewrote identical value')
    await writeCompactionFile(STORE, { provider: 'third-party', model: 'm3' })
    const afterWrite = readCompactionFile(STORE)
    check('h7 write then read fresh', afterWrite.provider === 'third-party' && afterWrite.model === 'm3', JSON.stringify(afterWrite))
    const doc = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    check('h7 stored shape', doc.version === COMPACTION_FILE_VERSION && doc.provider === 'third-party' && doc.model === 'm3', JSON.stringify(doc))

    // 4. Corrupt file -> default, and a later write heals it.
    fs.writeFileSync(STORE, '{corrupt', 'utf8')
    const corrupt = readCompactionFile(STORE)
    check('h7 corrupt -> default',
      corrupt.provider === DEFAULT_COMPACTION.provider && corrupt.model === DEFAULT_COMPACTION.model, JSON.stringify(corrupt))
    await writeCompactionFile(STORE, { provider: 'deepseek-official', model: 'deepseek-flash' })
    const healed = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    check('h7 write heals corrupt', healed.version === 1 && healed.model === 'deepseek-flash', JSON.stringify(healed))

    // 5. Migration: only when absent; per-field fallback.
    cleanup()
    check('h7 migrate absent flag', migrateCompactionFile(STORE, { provider: 'legacy-p' }) === true, 'migration did not run')
    const migrated = readCompactionFile(STORE)
    check('h7 migrate per-field',
      migrated.provider === 'legacy-p' && migrated.model === DEFAULT_COMPACTION.model, JSON.stringify(migrated))
    check('h7 migrate never overwrites', migrateCompactionFile(STORE, { provider: 'other', model: 'other' }) === false, 'overwrote existing')
    check('h7 migrate keeps existing', readCompactionFile(STORE).provider === 'legacy-p', 'existing value lost')

    // 6. Routing semantics stay unchanged.
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

    // 7. Path constants agree with the contract.
    const paths = { CATALOG_PATH, CATALOG_REFRESH_PATH, COMPACTION_PATH, CONTEXT_PATH, COMPACT_PATH, MODELS_PATH, MODELS_REFRESH_PATH }
    const expectedPaths = {
      CATALOG_PATH: '/plugins/opencode-local/catalog',
      CATALOG_REFRESH_PATH: '/plugins/opencode-local/catalog/refresh',
      COMPACTION_PATH: '/plugins/opencode-local/compaction',
      CONTEXT_PATH: '/plugins/opencode-local/context',
      COMPACT_PATH: '/plugins/opencode-local/compact',
      MODELS_PATH: '/plugins/opencode-local/models',
      MODELS_REFRESH_PATH: '/plugins/opencode-local/models/refresh',
    }
    for (const [key, value] of Object.entries(expectedPaths)) {
      check('h7 path ' + key, paths[key] === value, String(paths[key]))
    }

    record('h7-compaction-ui', { defaults: { ...DEFAULT_COMPACTION }, paths })
    return 'ok'
  } finally {
    cleanup()
  }
}
```

**D-2 自检**：
```powershell
Select-String -Path docs\impl-harness\h7-compaction-ui.mjs -Pattern 'liveCompaction|resolveConfig' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path docs\impl-harness\h7-compaction-ui.mjs -Pattern 'cleanup\(\)' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 3（定义 + 开头 + finally）
Test-Path docs\impl-harness\h7-compaction-ui.mjs   # True
```

---

### E-1｜`plugin/package.json`

把 `"version": "0.2.5",` 改为 `"version": "0.2.6",`（仅此一处；`files`、`dsh`、依赖全部不动）。

### E-2｜`plugin/README.md`（精确增补）

在「上下文压缩」tab 章节的**最后一条 bullet 之后**、下一节 `### 思考档位` **之前**，追加一条 bullet（与既有 bullet 同级）：

```markdown
- **偏好存哪**：压缩模型的选择存在插件数据目录 `~/.dsh-opencode-local/compaction.json`（全局，不区分 profile）。切换即时生效、无需重启，也不改 `cordis.patch.yml`；文件缺失或损坏时自动回落到官方默认 `deepseek-official / deepseek-flash`。
```

**E 自检**：
```powershell
Select-String -Path plugin\package.json -Pattern '"version": "0.2.6"' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\README.md -Pattern 'compaction.json' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\README.md -Pattern '^\| "@hbk' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0（README 无该表格，忽略）
```

---

## §5 施工后自查（主执行者复核）

```powershell
cd D:\DSH-Opencode2API-hbk
git status --short
```

**期望恰好**：`M` **9 个** + `??` **1 个**（其余为方案/测试产物）

| 状态 | 文件 |
| --- | --- |
| `M`（9） | `plugin/package.json`、`plugin/README.md`、`plugin/src/config.ts`、`plugin/src/index.ts`、`plugin/src/web/routes.ts`、`plugin/src/client/status-paths.ts`、`plugin/src/client/CompactionTab.tsx`、`docs/impl-harness/h6-compaction.mjs`、`docs/impl-harness/h7-compaction-ui.mjs` |
| `??`（1） | `plugin/src/compaction-store.ts` |
| 允许附带 | `temp/code.md`、`temp/debug.md`、`temp/impl-harness-*`（测试产物） |

**禁改文件必须干净**：
```powershell
git status --short -- plugin/cordis.patch.yml plugin/tsconfig.json plugin/tsconfig.client.json plugin/tsdown.config.ts plugin/src/adapter plugin/src/serve plugin/src/catalog plugin/src/api
```
**期望：无输出。**

---

## §6 串行验收、打包、安装、收尾（**主执行者独自完成，禁止并行**）

> 在 `D:\DSH-Opencode2API-hbk` 下**逐条**执行；任一步失败即停并报告，不得跳步。

### 6.1 类型检查
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm run typecheck
```
**通过**：退出码 0，无 `error TS`（`tsconfig.json` + `tsconfig.client.json` 双配置）。

### 6.2 构建
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm run build
```
**通过**：退出码 0，`lib/index.js`、`lib/client.js` 均更新；`lib/` 内**无新增外部包**（`Select-String -Path lib\index.js -Pattern 'require\("zod"'` 应为 0）。

### 6.3 全量测试
```powershell
cd D:\DSH-Opencode2API-hbk
node docs\impl-harness\run-all.mjs
```
**通过**：`temp\impl-harness-results\summary.json` 中 `allPassed === true`、`failed` 为空、h1–h7 全 `ok:true`。
**额外确认**：跑完后 `temp\impl-harness-data\h7-compaction-store.json` **不存在**（清理生效）。
**失败处理**：读 `temp\impl-harness-results\<hN>.json` 定位；**禁止**删断言过关。

### 6.4 打包
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm pack
Get-FileHash hbk-dsh-opencode-local-0.2.6.tgz -Algorithm SHA256
tar -tzf hbk-dsh-opencode-local-0.2.6.tgz
```
**通过**：生成 `0.2.6.tgz`；包内**恰 5 条目**（`package/lib/client.js`、`package/lib/index.js`、`package/package.json`、`package/README.md`、`package/cordis.patch.yml`）。
**记录**：字节数 + SHA256。

### 6.5 安装到 web profile（**只装不重启**）
```powershell
New-Item -ItemType Directory -Force -Path D:\DSH-Opencode2API-hbk\temp\reinstall-backup | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item C:\Users\hbk\.dsh\profiles\web\cordis.patch.yml "D:\DSH-Opencode2API-hbk\temp\reinstall-backup\cordis.patch.yml.bak-0.2.6-$stamp"
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.6.tgz
```
**通过**：命令成功；web `package.json` 依赖指向 `0.2.6.tgz`；**web `cordis.patch.yml` 整文件未变**（`Compare-Object` 与备份为空）；已装 `lib/*.js` 与 `plugin/lib/*.js` 哈希一致。
**注意**：`--profile web`（**不是 desktop**）；**不主动重启**。

### 6.6 收尾（串行，全部成功后）
1. 归档：`Copy-Item temp\code.md docs\P2\code-debug-0.2.6.md -Force`
2. 新建 `docs/P2/impl-notes-0.2.6.md`（内容见 §6.7 模板）
3. 更新 `docs/handoff.md`：版本 → 0.2.6；记录「压缩偏好改存插件 JSON、切换即时」；安装/验收目标仍为 `web` profile
4. **不提交 git**

### 6.7 `docs/P2/impl-notes-0.2.6.md` 必含内容
- 执行方式（多 agent 并行 / 串行）与工作包分工
- 改动文件清单（9 个）+ 新增文件
- `typecheck` / `build` / `run-all` 结果（含 h1–h7 原始 JSON 摘要）
- 包字节数、SHA256、包内条目
- 安装 profile（web）、备份路径、patch 校验结论
- 回滚命令：
```powershell
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.5.tgz
git checkout HEAD -- plugin/src plugin/README.md plugin/package.json docs/impl-harness
```
- 待人工验收项（见 §6.8）

### 6.8 待人工实机验收（重启后）
| # | 项 | 期望 |
| --- | --- | --- |
| 1 | 切换压缩模型 | 界面**立刻**变化，无卡顿 |
| 2 | 重开面板 | 显示仍是刚选的值 |
| 3 | 重启 DSH | 值保留；`~/.dsh-opencode-local/compaction.json` 存在且内容正确 |
| 4 | 长对话切模型 / 切 1M 模型 | 不报 402（统一性未回归） |
| 5 | 删除/写坏 `compaction.json` | 回落到官方默认，不报错、不崩 |
| 6 | 设置页 | 不再出现「压缩模型」的 DSH 原生配置项（已移出 schema） |
| 7 | `cordis.patch.yml` | 内容与安装前一致 |

---

## §7 多 agent 派发模板（可直接复制）

### 7.1 通用前置（每个执行者 prompt 必含）

```
你在为 D:\DSH-Opencode2API-hbk 执行 0.2.6 施工的其中一个工作包。

硬性约束：
1. 只修改下列文件，其它任何文件一律不碰（尤其 plugin/cordis.patch.yml、tsconfig*、tsdown.config.ts、
   plugin/src/adapter、plugin/src/serve、plugin/src/catalog、plugin/src/api）。
2. 代码逐字照抄施工图代码块；不优化、不重排 import、不改缩进、不删注释。
3. 不要运行 npm run build / typecheck / pack，也不要安装插件（主执行者统一做）。
4. 不要提交 git。
5. 完成后按"自检命令"逐条执行，全部通过才回复。
6. 回复只写：改动文件列表 + 每条自检的实际数字 + 是否全部通过。

施工图：D:\DSH-Opencode2API-hbk\temp\code.md，只读「§3 全局契约」与你负责的那一节。
```

### 7.2 五个执行者

| 执行者 | 负责节 | 允许修改的文件 |
| --- | --- | --- |
| `a-store-config` | §4 A-1、A-2 | `plugin/src/compaction-store.ts`(新)、`plugin/src/config.ts` |
| `b-host-routes` | §4 B-1、B-2、B-3 | `plugin/src/client/status-paths.ts`、`plugin/src/web/routes.ts`、`plugin/src/index.ts` |
| `c-client-tab` | §4 C | `plugin/src/client/CompactionTab.tsx` |
| `d-tests` | §4 D-1、D-2 | `docs/impl-harness/h6-compaction.mjs`、`docs/impl-harness/h7-compaction-ui.mjs` |
| `e-docs-version` | §4 E-1、E-2 | `plugin/README.md`、`plugin/package.json` |

### 7.3 派发顺序
1. **同时**启动 `a-store-config`、`b-host-routes`、`c-client-tab`、`d-tests`、`e-docs-version`（五路互不重叠）。
2. 若平台只支持逐个执行，则按 A→B→C→D→E 串行，结果相同。
3. 全部完成后，主执行者按 §5 自查，再按 §6 串行收口。

### 7.4 逐字节抽查（主执行者）
对三个「完整替换」的文件（`compaction-store.ts`、`CompactionTab.tsx`、`h7-compaction-ui.mjs`）：
```powershell
(Get-Content <文件>).Count
```
与本文档对应代码块行数比对（允许 ±2 行差异，仅因结尾换行）。

---

## §8 故障与回退矩阵

| 现象 | 判据 | 处置 |
| --- | --- | --- |
| `compaction-store.ts` 未找到 | `tsc` 报 TS2307 | 检查 A-1 是否创建、路径是否为 `plugin/src/compaction-store.ts` |
| `COMPACTION_PATH` 未定义 | `tsc` 报 TS2305 | 检查 B-1 ② 是否插入 |
| `setCompaction` 缺参 | `tsc` 报 TS2345 | 检查 B-2 ② 接口与 B-3 ④ 调用**都要**加 |
| 路由注册抛重复 | 启动日志出现 `duplicate` | B-2 ③ 必须**一个** `ws.register` 内分流 GET/POST，不可注册两次 |
| `liveCompaction*` 残留 | `tsc` 报 TS2305（h6/h7） | 检查 A-2 ⑤、D-1 ①、D-2 全量替换 |
| h7 `idempotent write skips disk` 失败 | mtime 变化 | 检查 A-1 `writeCompactionFile` 是否先 `readDocument` 比对 |
| h7 `write then read fresh` 失败 | 读到旧值 | 检查 `writeCompactionFile` 末尾是否有 `cache.delete(filePath)` |
| h7 `write heals corrupt` 失败 | 文件仍为坏内容 | 幂等短路必须基于**解析后的文档**，不能用回落后默认值比对 |
| h7 `migrate never overwrites` 失败 | 返回 true | 检查 `migrateCompactionFile` 首行 `fs.existsSync` 短路 |
| 安装后仍是旧版本 | 依赖仍指 0.2.5 | 重跑 §6.5；确认 `--profile web` |
| 切换仍慢 | 面板仍读 `scope` | 检查 C 组自检 `scope.set|getSnapshot` 计数为 0 |

**总体回退**：`git checkout HEAD -- plugin/src plugin/README.md plugin/package.json docs/impl-harness`，重装 0.2.5。

---

## §9 硬停声明

**本文档仅为施工方案。截至落盘时刻：未修改任何插件源码、未构建、未打包、未安装、未提交 git；仅创建/覆盖了本方案文档 `temp/code.md`。**
施工须人工下达明确执行指令后方可开始；并行策略、文件范围、验收命令均以本文档为准。
