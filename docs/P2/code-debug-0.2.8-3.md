# 0.2.8-3 施工方案（code-debug-0.2.8-3）：插件彻底退出上下文压缩

> **状态：✅ 已按本方案施工完成、打包安装（web profile 0.2.8-3）并经人工重启实机验收通过（2026-11-20）。** 本文件为归档副本——原 `temp/code.md` 已随 2026-11-20 的 temp/ 清理删除，此为唯一留存版本。执行记录见 `docs/P2/impl-notes-0.2.8-3.md`。
> **唯一依据**：`D:\DSH-Opencode2API-hbk\docs\plan.md`（0.2.8-3 迭代计划，已经人工批准；三个分歧点已裁决：版本号 0.2.8-3 / compaction-basic+nvidia 保留 / compaction.json 残留不删）。
> **可复现性**：以「文件内容级」+「逐字锚点」描述。所有修改均给出精确的逐字旧文本与新文本；小文件直接给出完整期望内容。任何模型、任何 agent 软件按本方案执行，产物必须**字节级相同**。
> **安装目标**：`web` profile（不变）。**不是** desktop。
> **本文件为全文替换版**：旧的 0.2.7 施工方案（code.md v3）已执行完毕并归档于 `docs/P2/code-debug-0.2.7.md`，本文件与其无继承关系。
> 撰写时间：2026-11-20（Asia/Shanghai）。

---

## §0 阅读顺序与铁律

1. 先读 §1（多 agent 能力探测）→ 决定并行或串行。
2. 再读 §2（全局契约）→ **所有执行者必读**。
3. 各执行者只读自己那一节（§4 的 W1–W7），**只改自己范围内的文件**。
4. 全部落盘后，由**主执行者串行**执行 §5（验证 + 打包 + 安装 + 收尾）。

### 0.1 铁律（违反即返工）

| # | 铁律 |
| --- | --- |
| R1 | 只改 §2 工作包清单内的 7 个文件；清单外**零改动**。尤其：`cordis.patch.yml`（插件自带与 profile 侧均不动）、`tsconfig*`、`tsdown.config.ts`、`adapter/*`、`serve/*`、`catalog/*`、`api/*`、`client/*`（本轮仅 README 与 harness 属改动面，client 源码零改动）、`temp/backup-0.2.6-src/`、运行时文件 `~/.dsh-opencode-local/compaction.json`（**不删**）。 |
| R2 | 每个执行者**只碰自己工作包的文件**；文件互不重叠，无跨包依赖。 |
| R3 | 代码**逐字照抄**本文档；删除按逐字锚点删；不优化、不重排 import、不改缩进、不改行尾风格（保持各文件原状）、不加减空行（本文档明确要求删除的空行除外）。 |
| R4 | **发现方案与现实的锚点文本不匹配时：停止并上报主执行者，不得自行猜测改法。** 本方案是唯一事实源。 |
| R5 | 施工期间**禁止** `npm run build` / `npm run typecheck` / `npm pack` / 安装 / 重启 DSH（统一由主执行者在 §5 做）。 |
| R6 | 每个工作包完成后跑本节末尾的**自检命令**，全绿才算完成；自检不过就地修正（仅限自己包内），仍不过则上报。 |
| R7 | **不新增任何依赖**；不写调试 `console.log`；**不提交 git**。 |
| R8 | 文件一律 UTF-8、无 BOM。 |
| R9 | **禁止删除** `~/.dsh-opencode-local/compaction.json`、`temp/llm-diag.log`（后者属 scratch，本方案不动它）。 |
| R10 | 主执行者在验证阶段发现任何红灯：先按 §6 故障矩阵处理；处理不了的**如实上报 blockers，不得伪造通过**。 |

### 0.2 版本

`plugin/package.json` 的 `version`：`0.2.8-2` → **`0.2.8-3`**（仅此一处；已人工确认）。

---

## §1 多 agent 协作：能力探测 → 并行 / 串行

### 1.1 目标

把 §4 的 7 个工作包（W1–W7）**并行**落盘，再用**串行**验证收口；产物必须与串行执行**字节级相同**。

### 1.2 能力探测（必须先做，约 1 分钟）

**探针 A（首选，DSH 原生 subagent）**
1. 并行启动两个子代理 `probe-1` / `probe-2`，各自任务：
   > 在 `D:\DSH-Opencode2API-hbk\temp\` 下创建 `probe-a.txt`（或 `probe-b.txt`），内容**恰好**为 `probe-ok-a`（或 `probe-ok-b`）：10 字节、无换行、无空格、无 BOM。完成后只回复 `done`。
2. 判定：两文件都出现，`Get-Content -Raw` 长度均为 **10**，内容精确匹配。
3. 成功 ⇒ **并行模式**；`subagent` 工具不可用或失败 ⇒ 探针 B。

**探针 B（平台通用回退）**：若平台提供任一并行/子任务能力（如 workflow、team task），用同样的双文件探针验证；成功 ⇒ 并行模式。

**都失败 ⇒ 串行模式**（结果一致，只影响耗时）。本 DSH 环境具备 `subagent` + Agent Teams，且 0.2.4 / 0.2.5 / 0.2.6 / 0.2.7 四轮均已实证并行落盘可行，**探针 A 预期通过**；若意外失败，重试一次，仍失败**不要放弃施工**，走串行即可，并在汇报中注明。

**清理**：无论成败，删除 `temp\probe-a.txt`、`temp\probe-b.txt`。

### 1.3 两种模式的硬约束

| 模式 | 做法 | 要求 |
| --- | --- | --- |
| **并行** | 同时派发 W1–W7 七个执行者，各自只改自己文件 | 与串行产物**字节级相同** |
| **串行** | 主执行者按 W1→W7 顺序落盘 | 同上 |

七个包文件两两不重叠、无跨包 import 依赖（W6/W7 改的是测试自身，不依赖 W1/W2 的落盘时序——node 直接以源码运行 harness，验证阶段才统一跑）。

**验证阶段禁止并行**（§5 全部命令由主执行者逐条串行执行）。

---

## §2 工作包划分与全局契约

### 2.1 工作包（写入范围，互不重叠）

| 包 | 对应计划项 | 文件（**只改这些**） | 动作 |
| --- | --- | --- | --- |
| **W1** | C1 | `plugin/src/index.ts` | 删除监听器块等 6 处 |
| **W2** | C2 | `plugin/src/config.ts` | 删除 `applyCompactionRoute` 块 |
| **W3** | C3 | `plugin/src/compaction-store.ts` | 删除整个文件 |
| **W4** | C4 | `plugin/README.md` | 压缩章节改写 |
| **W5** | C5 | `plugin/package.json` | 版本号 0.2.8-3 |
| **W6** | C6 | `docs/impl-harness/h6-compaction.mjs` | 裁剪 store/route 断言 |
| **W7** | C7 | `docs/impl-harness/h7-compaction-ui.mjs` | 裁剪+新增 locales 守卫 |

### 2.2 全局契约（所有执行者必读）

- 本轮主题：**插件退出上下文压缩**。删的是「压缩决策/拦截/偏好存储」；**保留**适配器对 `purpose:'compaction'` 请求的形态处理（`adapter/turn.ts`、`adapter/flatten.ts`、`types.ts` 一字不动），也**保留**上下文状态展示链路（`client/CompactionTab.tsx`、`client/status-paths.ts`、`web/routes.ts` 的 `/context` 路由、`client/locales.ts`）。
- 所有删除按 §4 给的**逐字文本**匹配；匹配不到 = 现实与方案冲突 ⇒ 按 R4 上报。
- 文件行尾保持原样（不整体转换 CRLF/LF），UTF-8 无 BOM。

---

## §3 变更总览（与 plan.md §2 对应）

| 计划项 | 内容 | 落点 |
| --- | --- | --- |
| C1 | 删 `llm/stream` 监听器整块（含诊断代码）+ 相关 import/常量/接口字段 | W1 |
| C2 | 删 `applyCompactionRoute` 及其文档注释 | W2 |
| C3 | 删 `compaction-store.ts` 整文件 | W3 |
| C4 | README 压缩章节改为「上下文状态 / 插件不做压缩」 | W4 |
| C5 | 版本 0.2.8-3 | W5 |
| C6 | h6 删 store/route 断言，保留分类/形态/适配器行为 | W6 |
| C7 | h7 删路由语义段，新增 locales 改名守卫 | W7 |

---

## §4 各工作包精确施工内容

### W1｜`plugin/src/index.ts`（C1）

**共 6 处删除**。允许两种落法任选其一：①按下面 6 个逐字块删除；②直接把文件写成文末【W1 期望最终内容】。验收标准 = 与【W1 期望最终内容】逐字节相同。

**D1**：删除整行（第 3 行）：
```
import fs from 'node:fs'
```

**D2**：删除整行（config import 块内第 6 行）：
```
  applyCompactionRoute,
```

**D3**：删除整行（第 9 行）：
```
import { readCompactionFile } from './compaction-store.ts'
```

**D4**：删除整行（PluginContext 接口内第 23 行）：
```
  on?(event: string, listener: (...args: any[]) => any, options?: unknown): unknown
```

**D5**：删除整行（第 42 行）：
```
  const compactionPath = join(dataDir, 'compaction.json')
```

**D6**：删除以下逐字块（第 61–102 行：监听器整块 + 其后紧跟的一个空行；块首锚点 `  // Context compaction routing:`，块尾到 `  }` 后的空行为止）：
```
  // Context compaction routing: rewrite compaction requests (purpose==='compaction')
  // to the model chosen in the settings tab (stored in compaction.json).
  // { global: true } is REQUIRED: the llm service filters waterfall listeners
  // by its own context scope, so a plugin-fiber listener would never fire
  // without it (same reason session-title registers with global:true).
  // NOTE: registered directly during apply (NOT inside ctx.effect) — wrapping
  // in ctx.effect prevented the listener from ever being invoked.
  if (typeof ctx.on === 'function') {
    const diagPath = 'D:/DSH-Opencode2API-hbk/temp/llm-diag.log'
    const diag = (line: string): void => {
      try { fs.appendFileSync(diagPath, line + '\n') } catch { /* ignore */ }
    }
    const dispose = ctx.on('llm/stream', (options: any, next: () => any) => {
      try {
        const isCompaction = options?.purpose === 'compaction'
        let rewritten = ''
        if (isCompaction) {
          const choice = readCompactionFile(compactionPath)
          const routeResult = applyCompactionRoute(options, choice.provider, choice.model)
          rewritten = ' routeResult=' + routeResult + ' after=' + options.provider + '/' + options.model
        }
        diag('fired purpose=' + (options?.purpose ?? 'none') + ' provider=' + options?.provider + ' model=' + options?.model + ' sessionId=' + (options?.sessionId ?? 'none') + ' frozen=' + Object.isFrozen(options) + rewritten + ' keys=' + Object.keys(options ?? {}).join('|'))
        if (isCompaction) {
          const inner = next()
          return (async function* () {
            try {
              for await (const chunk of inner) yield chunk
              diag('stream completed ok')
            } catch (e: any) {
              diag('stream error: ' + (e?.message ?? String(e)))
              throw e
            }
          })()
        }
      } catch (e: any) {
        diag('listener error: ' + (e?.message ?? String(e)))
      }
      return next()
    }, { global: true, prepend: true })
    ctx.effect?.(() => () => { if (typeof dispose === 'function') (dispose as () => void)() })
  }

```

**【W1 期望最终内容】**（93 行；验收 = 与此逐字节相同）：
```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  resolveConfig, liveToolPolicy, liveThinkingVariant, liveHiddenModels, liveApiConfig,
  type ResolvedPluginConfig,
} from './config.ts'
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
  get?(service: string): any
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

**W1 自检**（全绿才算完成）：
```powershell
Select-String -Path plugin\src\index.ts -Pattern 'compaction|llm-diag|ctx\.on|node:fs' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
```

---

### W2｜`plugin/src/config.ts`（C2）

**删除文件末尾的以下逐字块**（`liveApiConfig` 结束花括号 `}` 之后的空行起，至文件末尾；即现 121–141 行）：

```

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

删除后文件应以 `liveApiConfig` 的 `}`（原第 120 行）结尾，其后可有单个文件末尾换行。

**W2 自检**：
```powershell
Select-String -Path plugin\src\config.ts -Pattern 'applyCompactionRoute|compaction' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
```

---

### W3｜删除 `plugin/src/compaction-store.ts`（C3）

1. 前置断言：`Test-Path plugin\src\compaction-store.ts` 为 `True`。
2. `Remove-Item plugin\src\compaction-store.ts`（只删这一个文件）。
3. 自检：`Test-Path plugin\src\compaction-store.ts` 为 `False`。

---

### W4｜`plugin/README.md`（C4）

共 5 处修改，逐字锚点如下：

**R1**（第 36 行标题）旧：
```
### 「上下文压缩」tab
```
新：
```
### 「上下文状态」tab
```

**R2**：删除以下两行（第 38–39 行，整两行删掉）：
```
- **压缩上下文** 按钮：一键调用 DSH 自身的按需压缩（等价于 `/compact`），压缩当前主视图会话；完成后显示压掉了多少历史项、约省多少 token。DSH 正忙时会如实提示稍后再试。
- **压缩模型** 选择框：列出 DSH 的**全部**模型路由（官方 + 你配置的各第三方 API + `opencode-local`）。**人工主动压缩与切模型时 DSH 自动压缩是同一个操作，都使用这里指定的模型**；它**只影响压缩，不改变聊天模型**。默认官方 `deepseek-official / deepseek-flash` **仅为保底**，保证一定有模型可用；第三方 API 与官方同级同效，任选皆可。
```

**R3**：保留第 40 行（「当前上下文」面板描述）**一字不动**。

**R4**：删除以下一行（第 41 行，整行删掉）：
```
- 选择框选到 `opencode-local` 的模型时，压缩会重新经过本插件的免费通道；此时插件会自动走精简提示形态并禁止放行工具，遇到限流可自动重试。选官方或第三方 API 时压缩不经本插件。
```

**R5**（第 42 行整行替换）旧：
```
- **偏好存哪**：压缩模型的选择存在插件数据目录 `~/.dsh-opencode-local/compaction.json`（全局，不区分 profile）。切换即时生效、无需重启，也不改 `cordis.patch.yml`；文件缺失或损坏时自动回落到官方默认 `deepseek-official / deepseek-flash`。
```
新：
```
- **插件不做上下文压缩**：压缩由 DSH 侧/人工接管（web profile 的 compaction-basic 原生配置已预置 `summarizationProvider: nvidia / summarizationModel: nvidia/nemotron-3-ultra-550b-a55b`，可自行调整）。本 tab 仅保留上下文用量的只读监测显示。
```

**R6**（第 64 行注意事项整行替换）旧：
```
- 压缩请求被识别为 `purpose: 'compaction'` 时，会改用精简提示形态、且不放行任何工具（压缩指令本身要求不调工具）。只有在压缩模型选为 `opencode-local` 时才会走到这一步。
```
新：
```
- 压缩请求被识别为 `purpose: 'compaction'` 时，适配器会改用精简提示形态、且不放行任何工具（压缩指令本身要求不调工具）。压缩策略由 DSH 侧/人工接管，本插件不做压缩决策。
```

**W4 自检**：
```powershell
Select-String -Path plugin\README.md -Pattern '上下文压缩|压缩模型|压缩上下文|compaction\.json' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path plugin\README.md -Pattern '上下文状态' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 >= 1
```

---

### W5｜`plugin/package.json`（C5）

第 3 行整行替换。旧：
```
  "version": "0.2.8-2",
```
新：
```
  "version": "0.2.8-3",
```

**W5 自检**：
```powershell
node -e "const v=require('./plugin/package.json').version; if(v!=='0.2.8-3') throw new Error(v); if(!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) throw new Error('invalid semver'); console.log('ok', v)"
```

---

### W6｜`docs/impl-harness/h6-compaction.mjs`（C6）

**共 2 处删除**：

**H6-D1**：删除以下两行 import（现第 4–5 行）：
```
import { applyCompactionRoute } from '../../plugin/src/config.ts'
import { DEFAULT_COMPACTION, readCompactionFile } from '../../plugin/src/compaction-store.ts'
```

**H6-D2**：删除以下逐字块（A1' 段：从注释行起到 `'reported a change')` 行，**含块后紧跟的一个空行**；删除后 `  // A3 + C2 —` 注释行直接跟随在 `check('h6 compact rejects missing user message', ...)` 之后的空行处）：
```
  // A1' — compaction routes onto the configured model; chat is untouched.
  const absent = readCompactionFile('temp/impl-harness-data/__h6-absent-store__.json')
  check('h6 missing store falls back', absent.provider === DEFAULT_COMPACTION.provider && absent.model === DEFAULT_COMPACTION.model, JSON.stringify(absent))
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

```

**其余内容一字不动**（含 402/429 分类断言、压缩 prompt 形态断言、`// A3 + C2 — compaction через adapter` 起的适配器行为测试）。

**W6 自检**：
```powershell
Select-String -Path docs\impl-harness\h6-compaction.mjs -Pattern 'applyCompactionRoute|compaction-store|DEFAULT_COMPACTION|readCompactionFile' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path docs\impl-harness\h6-compaction.mjs -Pattern 'classifyFailure|flattenCompaction|A3 \+ C2' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 >= 3（保留段仍在）
```

---

### W7｜`docs/impl-harness/h7-compaction-ui.mjs`（C7）

**整文件替换**为以下内容（逐字照抄；旧的路由语义段删除，新增 locales 改名守卫；文件名不改）：

```js
import { check, record } from './lib.mjs'
import {
  CATALOG_PATH, CATALOG_REFRESH_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH,
} from '../../plugin/src/client/status-paths.ts'
import { en, zh } from '../../plugin/src/client/locales.ts'

export async function run(_runtime) {
  // 1. Tab rename guard: the former compaction tab is now a pure context-status display.
  check('h7 zh tab.compaction', zh['tab.compaction'] === '上下文状态', String(zh['tab.compaction']))
  check('h7 en tab.compaction', en['tab.compaction'] === 'Context status', String(en['tab.compaction']))

  // 2. Path constants agree with the contract.
  const paths = { CATALOG_PATH, CATALOG_REFRESH_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH }
  const expectedPaths = {
    CATALOG_PATH: '/plugins/opencode-local/catalog',
    CATALOG_REFRESH_PATH: '/plugins/opencode-local/catalog/refresh',
    CONTEXT_PATH: '/plugins/opencode-local/context',
    MODELS_PATH: '/plugins/opencode-local/models',
    MODELS_REFRESH_PATH: '/plugins/opencode-local/models/refresh',
  }
  for (const [key, value] of Object.entries(expectedPaths)) {
    check('h7 path ' + key, paths[key] === value, String(paths[key]))
  }

  record('h7-compaction-ui', { paths })
  return 'ok'
}
```

**W7 自检**：
```powershell
Select-String -Path docs\impl-harness\h7-compaction-ui.mjs -Pattern 'applyCompactionRoute' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
Select-String -Path docs\impl-harness\h7-compaction-ui.mjs -Pattern '上下文状态' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 1
```

---

## §5 串行验证 + 打包 + 安装（主执行者逐条执行，禁止并行）

1. **落盘核对**：7 个包全部完成且自检全绿；`git status --short` 核对改动文件集 = §2 清单（允许 temp/ 探针清理痕迹）。
2. **残留扫描**：
   ```powershell
   Select-String -Path plugin\src\*.ts,plugin\src\*.tsx -Pattern 'applyCompactionRoute|compaction-store|readCompactionFile|llm-diag|compaction\.json' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
   ```
   （`adapter/*`、`types.ts` 中出现 `purpose === 'compaction'` / `flattenCompaction` 字样属**预期保留**，不算残留。）
3. **类型检查**：`cd plugin; npm run typecheck` → 双 tsconfig 退出码 0。
4. **构建**：`npm run build` → 退出码 0；`lib/` 无新增外部包。
5. **构建产物核验**：
   ```powershell
   Select-String -Path plugin\lib\index.js -Pattern 'llm-diag|compaction-store|applyCompactionRoute|readCompactionFile' | Measure-Object | Select-Object -ExpandProperty Count   # 期望 0
   Get-FileHash plugin\lib\client.js -Algorithm SHA256   # 应与上一版一致：F017622E183DAA73D789E8EE900F866BD9845CF0345D244DFF086ED6CAF6EAFD（client 源码零改动；不一致即停下查明）
   Get-FileHash plugin\lib\index.js -Algorithm SHA256    # 记录新值
   ```
6. **回归**：`node docs\impl-harness\run-all.mjs` → `allPassed:true`（h1–h7；h6/h7 为裁剪后版本）。注意 h6 含真实对话用例，消耗对话预算（预算 ≤5，沿用既有口径）。
7. **打包**：`npm pack` → 生成 `hbk-dsh-opencode-local-0.2.8-3.tgz`，记录字节数与 SHA256。
8. **机械预检（全部通过才允许安装；任一失败 ⇒ 停止并上报）**：
   - a. 版本号：读包内 `package.json` 的 `version`，必须 `=== '0.2.8-3'` 且匹配 `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`；**四段式（如 0.2.8.3）直接判失败**（0.2.8.1 事故的流程修复）；
   - b. 包内条目数 = **5**（`package.json`、`cordis.patch.yml`、`README.md`、`lib/index.js`、`lib/client.js`）；
   - c. 包内 `lib/index.js`、`lib/client.js` 与 `plugin/lib/` 构建产物 SHA256 **逐字节一致**；
   - d. 包内 `README.md` 含「上下文状态」与「插件不做上下文压缩」字样，且**不含**「压缩模型」「压缩上下文」「compaction.json」。
9. **安装（web profile）**：
   ```powershell
   Copy-Item C:\Users\hbk\.dsh\profiles\web\cordis.patch.yml temp\reinstall-backup\cordis.patch.yml.bak-0.2.8-3-<时间戳>
   dsh plugin --profile web add file:D:\DSH-Opencode2API-hbk\plugin\hbk-dsh-opencode-local-0.2.8-3.tgz
   ```
   安装后核验：①已装 `node_modules/@hbk/dsh-opencode-local/package.json` 版本 = `0.2.8-3`；②已装 `lib/index.js`、`lib/client.js` SHA256 = 构建产物；③profile `cordis.patch.yml` 与备份**字节级相同**。若 pnpm 报 `Already up to date`（不应发生，版本已变）⇒ 按 0.2.7 教训改用 remove + add 强制重装。
10. **不重启 DSH**：重启由人工执行（host 不热重载；安装后未重启期间存在「前端新/后端旧」窗口，勿做任何验收）。
11. **收尾**：新建 `docs/P2/impl-notes-0.2.8-3.md`（按既有 impl-notes 体例：背景/变更/验证/打包/安装/待办）；更新 `docs/handoff.md`（新增本轮记录一节；**修正 §18/§19 与代码实况不符的描述**；补记版本命名规则 `0.2.8-x` 与机械预检流程）；**不提交 git**。

---

## §6 故障矩阵

| 症状 | 处置 |
| --- | --- |
| 某执行者失败/超时 | 主执行者**串行补完该包**（按 §4 逐字落盘），产物一致即可；不必重跑其他包 |
| 锚点文本匹配不到 | 按 R4 停止上报；**禁止**凭记忆/猜测改 |
| typecheck 报 unused import 之外的红 | 对照 §4 期望内容逐字核对是否漏删/多删；修复后重跑 |
| `lib/client.js` 哈希与 F017622E… 不一致 | 说明 client 侧被意外改动：查 `git status`，恢复 client 源码零改动，重建 |
| run-all 某项失败 | 先看是否 h6/h7 裁剪引入（对照 §4）；再查是否 W1/W2 落盘偏差；均排除后按 R10 上报，不得伪造 |
| pnpm 报版本非法 | 检查是否四段式；本方案版本 `0.2.8-3` 为合法 semver，若仍报错 ⇒ 上报 |
| 安装后 404 / JSON 报错 | 0.2.6 教训：host 未重启，属预期窗口；重启后复测 |
| h6 真实对话用例因上游限流失败 | 按既有预算口径重跑一次；仍失败 ⇒ 上报，不改断言放水 |

---

## §7 硬停声明

- 本文件为**施工方案**。**当前未修改任何代码、未构建、未打包、未安装、未提交 git。**
- 待人工下达施工指令后：按 §1 探测 → §4 并行（或串行）落盘 → §5 串行验证与安装 → 人工重启 DSH 验收（plan.md §4）。
