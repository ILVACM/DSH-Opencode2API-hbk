# 0.2.7 代码施工方案（code.md v3）

> **状态：方案设计阶段。未执行任何代码改动。** 本文档只描述「改哪个文件、改成什么样」，不代替施工。
> **唯一依据**：`D:\DSH-Opencode2API-hbk\docs\plan.md`（0.2.7 修复迭代计划，F1–F3）。
> **可复现性**：以「文件内容级」+「精确锚点」描述，逐字照抄代码块，任何模型/任何 agent 软件产物相同。
> **安装目标**：`web` profile（不变）。**不是** desktop。
> 撰写时间：2026-11-19（Asia/Shanghai）。

---

## §0 阅读顺序与铁律

1. 先读 §1（多 agent 能力探测）→ 决定并行或串行。
2. 再读 §3（全局契约）→ **所有执行者必读**。
3. 各执行者只读自己那一节（§4 的 A/B/C 组），**只改自己范围内的文件**。
4. 全部落盘后，由**主执行者串行**执行 §6（验收 + 打包 + 安装 + 收尾）。

### 0.1 铁律（违反即返工）

| # | 铁律 |
| --- | --- |
| R1 | 只改 §2 清单内的 3 个文件；清单外零改动（尤其 `cordis.patch.yml`、`tsconfig*`、`tsdown.config.ts`、`adapter/*`、`serve/*`、`catalog/*`、`api/*`、`compaction-store.ts`、测试文件）。 |
| R2 | 每个执行者**只碰自己组的文件**。 |
| R3 | 代码**逐字照抄**本文档代码块；不优化、不重排 import、不改缩进、不删注释。 |
| R4 | **不改任何既有导出的名称与语义**；`applyCompactionRoute`、`compaction-store.ts` 全部保持原样。 |
| R5 | 施工期间**禁止** `npm run build` / `npm run typecheck` / `npm pack` / 安装（统一由主执行者在 §6 做）。 |
| R6 | 每组完成后跑本节末尾**自检命令**，全绿才算完成。 |
| R7 | **不新增任何依赖**。 |
| R8 | 不写调试 `console.log`；**不提交 git**。 |

### 0.2 版本

`plugin/package.json` 的 `version`：`0.2.6` → `0.2.7`（仅此一处）。

---

## §1 多 agent 协作：能力探测 → 并行 / 串行

### 1.1 目标

把 §2 的 3 个工作包（A/B/C）**并行**落盘，再用**串行**验证收口；产物必须与串行执行**字节级相同**。

### 1.2 能力探测（先做，约 1 分钟）

**探针 A（首选，DSH 原生）**
1. 并行启动两个子代理 `probe-1` / `probe-2`，各自任务：
   > 在 `D:\DSH-Opencode2API-hbk\temp\` 下创建 `probe-a.txt`（或 `probe-b.txt`），内容**恰好**为 `probe-ok-a`（或 `probe-ok-b`）：10 字节、无换行、无空格、无 BOM。完成后只回复 `done`。
2. 判定：两文件都出现，`Get-Content -Raw` 长度均为 **10**，内容精确匹配。
3. 成功 ⇒ **并行模式**；`subagent` 工具不可用或失败 ⇒ 探针 B。

**探针 B（平台通用）**：若平台提供任一并行/子任务能力，用同样双文件探针验证；成功 ⇒ 并行模式。

**都失败 ⇒ 串行模式**（结果一致，只影响耗时）。本项目 DSH 环境具备 `subagent` + Agent Teams，**探针 A 预期通过**；若被策略禁用，**不要放弃施工**，走串行即可。

**清理**：无论成败，删除 `temp\probe-a.txt`、`temp\probe-b.txt`。

### 1.3 两种模式的硬约束

| 模式 | 做法 | 要求 |
| --- | --- | --- |
| **并行** | 同时派发 A/B/C 三个执行者，各自只改自己文件 | 与串行产物**字节级相同** |
| **串行** | 主执行者按 A→B→C 顺序落盘 | 同上 |

三组文件互不重叠、无跨组 import 依赖（B 组新增的 `selectMainSessionId` 是组件内自包含函数，不依赖 A 组改动）。

**验证阶段禁止并行**（§6 全部命令由主执行者逐条串行执行）。

---

## §2 工作包划分（写入范围，互不重叠）

| 包 | 文件（**只改这些**） |
| --- | --- |
| **A** | `plugin/src/index.ts` |
| **B** | `plugin/src/client/CompactionTab.tsx` |
| **C** | `plugin/package.json` |

**文件数**：3 个，两两无交集。

---

## §3 全局契约（跨文件引用的名字与字面值以此为准，不可改）

### 3.1 监听器注册选项（F1 核心）

`llm/stream` 监听器注册必须携带 **`{ global: true, prepend: true }`**：
- `global: true` —— 绕过 llm 服务实例的 context filter（否则插件 fiber 上的监听者**永远收不到** waterfall，实测已证实）；
- `prepend: true` —— 与 DSH 自家 `session-title` 插件（`session-title/src/index.ts:360-363`）完全一致的注册形态。

### 3.2 会话推导（F2 核心）

客户端当前会话 id 一律通过 **`props.useSessions` 钩子**（DSH 渲染器注入每个 slot 组件的 GlobalStandardProps）+ 纯函数 `selectMainSessionId(state)` 获得：
- `state` 形状：`{ ids, byId: Record<id, SessionSummary>, phase, ... }`（plain object，非 Map）；
- 选中条件：`value.retainedBy.mainView ?? 0 > 0` 的第一条；
- 参考实现：`SettingsRoot.tsx:143-147`、`ui-agent-preset/src/client/index.ts:120-124`。

### 3.3 HTTP 契约（不变）

`GET/POST /plugins/opencode-local/compaction`、`GET /plugins/opencode-local/context` 等既有路由**零改动**。

---

## §4 逐文件施工指令

---

### A｜`plugin/src/index.ts`（精确修改 · 2 处）

**① `PluginContext.on` 签名扩展**。把：
```ts
  on?(event: string, listener: (...args: any[]) => any): unknown
```
改为：
```ts
  on?(event: string, listener: (...args: any[]) => any, options?: unknown): unknown
```

**② 监听器注册加 global 选项 + 注释补充**。把：
```ts
  // Route every compaction request to the configured summarization model.
  // Compaction requests are hand-built and mutable; loop requests never carry
  // purpose==='compaction', so ordinary conversation is left byte-identical.
  const listen = (ctx as { on?: (event: string, listener: (...args: any[]) => any) => unknown }).on
  if (typeof listen === 'function') {
    ctx.effect?.(() => {
      const dispose = listen.call(ctx, 'llm/stream', (options: any, next: () => any) => {
        try {
          if (options?.purpose === 'compaction') {
            const choice = readCompactionFile(compactionPath)
            applyCompactionRoute(options, choice.provider, choice.model)
          }
        } catch { /* a frozen request keeps its original route */ }
        return next()
      })
      return () => { if (typeof dispose === 'function') (dispose as () => void)() }
    })
  }
```
改为：
```ts
  // Route every compaction request to the configured summarization model.
  // Compaction requests are hand-built and mutable; loop requests never carry
  // purpose==='compaction', so ordinary conversation is left byte-identical.
  // { global: true } is REQUIRED: the llm service filters waterfall listeners
  // by its own context scope, so a plugin-fiber listener would never fire
  // without it (same reason session-title registers with global:true).
  const listen = (ctx as { on?: (event: string, listener: (...args: any[]) => any, options?: unknown) => unknown }).on
  if (typeof listen === 'function') {
    ctx.effect?.(() => {
      const dispose = listen.call(ctx, 'llm/stream', (options: any, next: () => any) => {
        try {
          if (options?.purpose === 'compaction') {
            const choice = readCompactionFile(compactionPath)
            applyCompactionRoute(options, choice.provider, choice.model)
          }
        } catch { /* a frozen request keeps its original route */ }
        return next()
      }, { global: true, prepend: true })
      return () => { if (typeof dispose === 'function') (dispose as () => void)() }
    })
  }
```

**A 自检**：
```powershell
Select-String -Path plugin\src\index.ts -Pattern 'global: true, prepend: true' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\src\index.ts -Pattern 'options?: unknown' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 2（PluginContext.on 签名 1 + listen 类型断言 1）
Select-String -Path plugin\src\index.ts -Pattern 'liveCompaction' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
```

---

### B｜`plugin/src/client/CompactionTab.tsx`（**完整替换**）

```tsx
import { createElement as h, useEffect, useState } from 'react'
import { CATALOG_PATH, CONTEXT_PATH, COMPACT_PATH, COMPACTION_PATH } from './status-paths.ts'
import type { WebCatalogPayload, WebCompactionPayload } from './status-paths.ts'

/**
 * Pick the id of the session currently held by the main view.
 * @param state - the client session-list snapshot state (`{ byId, phase, ... }`).
 * @returns the main-view session id, or undefined when none is retained.
 */
export function selectMainSessionId(state: any): string | undefined {
  try {
    const byId = state?.byId
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
  const useSessions = props.useSessions as any
  const sessionId = useSessions(selectMainSessionId)
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

**B 自检**：
```powershell
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'useSessions(selectMainSessionId)' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'export function selectMainSessionId' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'currentSessionId' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path plugin\src\client\CompactionTab.tsx -Pattern 'props.sessions' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
```

---

### C｜`plugin/package.json`

把 `"version": "0.2.6",` 改为 `"version": "0.2.7",`（仅此一处；`files`、`dsh`、依赖全部不动）。

**C 自检**：
```powershell
Select-String -Path plugin\package.json -Pattern '"version": "0.2.7"' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
Select-String -Path plugin\package.json -Pattern '"version": "0.2.6"' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
```

---

## §5 施工后自查（主执行者复核）

```powershell
cd D:\DSH-Opencode2API-hbk
git status --short -- plugin/
```

**期望恰好 3 个 `M`**：`plugin/package.json`、`plugin/src/client/CompactionTab.tsx`、`plugin/src/index.ts`。
**禁改文件必须干净**：
```powershell
git status --short -- plugin/cordis.patch.yml plugin/tsconfig.json plugin/tsconfig.client.json plugin/tsdown.config.ts plugin/src/adapter plugin/src/serve plugin/src/catalog plugin/src/api plugin/src/compaction-store.ts plugin/src/client/status-paths.ts docs/impl-harness
```
**期望：无输出**（注意：以上路径在 0.2.5/0.2.6 后处于「已修改未提交」状态，本轮**不得产生新变化**——以执行前快照比对）。

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
**通过**：退出码 0；`lib/index.js`、`lib/client.js` 均更新；无新增外部包。

### 6.3 全量测试
```powershell
cd D:\DSH-Opencode2API-hbk
node docs\impl-harness\run-all.mjs
```
**通过**：`temp\impl-harness-results\summary.json` 中 `allPassed === true`、`failed` 为空、h1–h7 全 `ok:true`。
**失败处理**：读 `temp\impl-harness-results\<hN>.json` 定位；**禁止**删断言过关。

### 6.4 打包
```powershell
cd D:\DSH-Opencode2API-hbk\plugin
npm pack
Get-FileHash hbk-dsh-opencode-local-0.2.7.tgz -Algorithm SHA256
tar -tzf hbk-dsh-opencode-local-0.2.7.tgz
```
**通过**：生成 `0.2.7.tgz`；包内**恰 5 条目**（`package/lib/client.js`、`package/lib/index.js`、`package/package.json`、`package/README.md`、`package/cordis.patch.yml`）。
**记录**：字节数 + SHA256。

### 6.5 安装到 web profile（**只装不重启**）
```powershell
New-Item -ItemType Directory -Force -Path D:\DSH-Opencode2API-hbk\temp\reinstall-backup | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item C:\Users\hbk\.dsh\profiles\web\cordis.patch.yml "D:\DSH-Opencode2API-hbk\temp\reinstall-backup\cordis.patch.yml.bak-0.2.7-$stamp"
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.7.tgz
```
**通过**：命令成功；web `package.json` 依赖指向 `0.2.7.tgz`；**web `cordis.patch.yml` 与安装前备份字节一致**；已装 `lib/*.js` 与 `plugin/lib/*.js` 哈希一致。
**注意**：`--profile web`（**不是 desktop**）；**安装后必须重启 DSH 才会生效**（host 端不热重载——0.2.6 的教训）。

### 6.6 收尾（串行，全部成功后）
1. 归档：`Copy-Item temp\code.md docs\P2\code-debug-0.2.7.md -Force`
2. 新建 `docs/P2/impl-notes-0.2.7.md`（改动清单、验收数据、包哈希、安装 profile 与备份路径、回滚命令、待验收项）
3. 更新 `docs/handoff.md`：版本 → 0.2.7；记录本次两个缺陷的修复；**安装/验收目标仍为 `web` profile**
4. **不提交 git**

### 6.7 回滚
```powershell
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.6.tgz
# 源码回到 0.2.6：从执行前快照恢复（0.2.6 未提交 git，勿用 git checkout HEAD）
```

---

## §7 多 agent 派发模板（可直接复制）

### 7.1 通用前置（每个执行者 prompt 必含）

```
你在为 D:\DSH-Opencode2API-hbk 执行 0.2.7 施工的其中一个工作包。

硬性约束：
1. 只修改下列文件，其它任何文件一律不碰（尤其 cordis.patch.yml、tsconfig*、tsdown.config.ts、
   plugin/src/adapter、plugin/src/serve、plugin/src/catalog、plugin/src/api、plugin/src/compaction-store.ts、
   plugin/src/client/status-paths.ts、docs/impl-harness）。
2. 代码逐字照抄施工图代码块；不优化、不重排 import、不改缩进、不删注释。
3. 不要运行 npm run build / typecheck / pack，也不要安装插件（主执行者统一做）。
4. 不要提交 git。
5. 完成后按"自检命令"逐条执行，全部通过才回复。
6. 回复只写：改动文件列表 + 每条自检的实际数字 + 是否全部通过。

施工图：D:\DSH-Opencode2API-hbk\temp\code.md，只读「§3 全局契约」与你负责的那一节。
```

### 7.2 三个执行者

| 执行者 | 负责节 | 允许修改的文件 |
| --- | --- | --- |
| `a-index-global` | §4 A | `plugin/src/index.ts` |
| `b-compaction-tab` | §4 B | `plugin/src/client/CompactionTab.tsx` |
| `c-version` | §4 C | `plugin/package.json` |

### 7.3 派发顺序
1. **同时**启动三个执行者（互不重叠、无跨组依赖）。
2. 若平台只支持逐个执行，则按 A→B→C 串行，结果相同。
3. 全部完成后，主执行者按 §5 自查，再按 §6 串行收口。

### 7.4 逐字节抽查（主执行者）
对「完整替换」的 `CompactionTab.tsx`：`(Get-Content plugin\src\client\CompactionTab.tsx).Count` 与本文档代码块行数比对（±2 行内）。

---

## §8 故障与回退矩阵

| 现象 | 判据 | 处置 |
| --- | --- | --- |
| `global: true` 未生效（仍报 deepseek-official） | 重启后切换仍报同类错 | 核对 A 组自检 1；确认 DSH 进程**确实重启**（PID 变化） |
| `props.useSessions` 未注入（组件崩溃） | slot 显示 crashed | 检查 B 组代码是否误删 `props.useSessions` 读取；确认 DSH 版本注入该钩子（SettingsRoot 同款） |
| typecheck 报 `on` 签名错误 | TS2339/TS2353 | 检查 A 组 ① 的 `PluginContext.on` 是否已扩为三参 |
| h6/h7 回归失败 | summary.json failed 非空 | 本轮未改测试与 store；按 `temp\impl-harness-results\<hN>.json` 定位是否为环境问题 |
| 安装后仍 0.2.6 | 依赖仍指 0.2.6 | 重跑 §6.5；确认 `--profile web` |
| 切换仍慢/仍 404 | — | 确认 DSH 已重启（PID 变化）；curl 探针 `/compaction` 应 401/200 而非 404 |

**总体回退**：重装 `0.2.6.tgz`；源码从执行前快照恢复（0.2.6 未提交 git，**勿用** `git checkout HEAD`）。

---

## §9 硬停声明

**本文档仅为施工方案。截至落盘时刻：未修改任何插件源码、未构建、未打包、未安装、未提交 git；仅创建/覆盖了本方案文档 `temp/code.md`。**
施工须人工下达明确执行指令后方可开始；并行策略、文件范围、验收命令均以本文档为准。
