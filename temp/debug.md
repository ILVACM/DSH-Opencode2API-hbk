# 0.2.6 迭代方案（debug.md·探针闭环版 · 存储改为自造 JSON）：压缩模型偏好「轻量存储」改造

> 状态：**✅ 已施工、已打包安装、已通过人工验收（2026-11-18）——本轮迭代关闭**。归档副本见 `docs/P2/code-debug-0.2.6.md`。
> 版本：**0.2.6**（0.2.5 已打包并装到 web profile，人工实机验收通过）。
> 本文件为本轮迭代唯一记录；原 0.2.5 方案全文（v1–v8）已按人工指令清空。
> 修订历史：
> - 2026-11-16：清空旧方案，落盘本轮迭代事项。
> - 2026-11-16 **探针闭环版 v1**：完成 4 组只读探针，曾裁决「官方存储」。
> - 2026-11-17 **v2（人工复核后修订）**：人工指出「自造 JSON 更可控、不受 DSH 版本影响、效果等价」。经重新权衡，**推翻 v1 的官方存储裁决，改为自造 JSON**（理由与四类硬风险见 §3.1）。同时把受影响的下游全部改净：`apply` 保持同步、不新增 `inject`、h6/h7 中断言改写、验收口径同步。
> - 2026-11-17 **v3（本版·歧义补全）**：人工复核后指出 9 处「执行者可能写出不同代码」的缺口，已全部补定 —— ①写后主动失效缓存 ②缓存键为 `mtimeMs+size` ③迁移逐字段回落 ④profile patch 残留旧键无害且禁止清理 ⑤固定 GET/POST 的 JSON 契约（含 400/405/500 形状）⑥写前幂等短路 ⑦并发「最后写入胜出」语义 ⑧h7 固定临时文件名并强制清理 ⑨补「收尾」四步（归档/实施记录/handoff/不提交）。另：`DEFAULT_COMPACTION` 改为 `Object.freeze`，h6 那条自证式断言改为「读不存在的文件必须回落默认」。**方案现无剩余未定项。**

---

## §0 背景与问题（已实证，非猜测）

**现象**：设置页 → `opencode-local` 卡片 → 「上下文压缩」tab → 「压缩模型」选择器切换模型时，界面反应很慢。

**根因**（0.2.5 实机复现 + 源码核实）：该偏好借道 **DSH 配置系统**持久化，每写一次都走重路径：

1. 界面无本地暂存，显示值来自配置快照，必须等写完、快照刷新后才重绘；
2. 一次切换 = **两趟串行 RPC**（`compactionProvider` 与 `compactionModel` 分两次 `scope.set`）；
3. 每趟 Host 侧：`settings.mutate` → `resolveConfig` → **重写整份 `cordis.patch.yml`** → **`reconcileProfilePatches` 完整 profile 重组**（停旧 fiber、重载解析，连带插件 dispose/重建、后台 serve 重启）。

⇒ **慢在「持久化配置」本身，不存在任何连通性/额度/成功性检测。** 这个偏好只是「记录用户选了哪个模型」。

---

## §1 人工拍板口径（逐条确认，本轮全部遵守）

| # | 事项 | 裁决 |
| --- | --- | --- |
| 1 | 作用域 | **全局**（不分 desktop / web profile） |
| 2 | 文件位置 | **插件数据目录** `~/.dsh-opencode-local/`（与现有 `catalog.json` 同目录） |
| 3 | 移除 DSH 配置字段 | **移除** `compactionProvider` / `compactionModel` 两个配置字段，不再参与持久化 |
| 4 | 存储介质 | **优先官方**；官方代价过大时用**插件自己的 JSON**（→ 本轮判定：**用 JSON**，见 §3.1） |
| 5 | 卸载残留 | **接受**（文件留在数据目录，卸载不自动清） |
| 6 | 升级迁移 | **一次性读取旧配置值**作为初始值写入新存储，避免重置 |
| 7 | 动态读取时机 | **每次打开 / 刷新面板时读取**（不做实时订阅、不做后台轮询） |

**根本目标**：显示、选用（写）、压缩生效三环节**全部轻量化且动态**。

---

## §2 探针结论（只读，已全部完成）

### 2.1 官方存储**确实存在且已挂载**（但本轮不采用）
- 存储族：`storage`（`ctx.storage` 注册表中枢）+ `storage-json` / `storage-sqlite`（后端）+ `storage-domain`（`ctx.storageDomain`，schema 校验 KV 域）。见 `packages/storage/README.md:13-20`。
- web profile **已挂载**、profile 零改动：`packages/bundle/base/cordis.patch.yml:179-190` 有 `storage` / `storage-json`（`root: !!js dshHomePath('storages')`）/ `storage-domain`（`backend: json`）；运行期 `plugin_manager` 三者 ACTIVE。
- API：`await ctx.storageDomain.open(spec)`；`domain.global.get()` 同步读内存；`await domain.global.set(v)` 异步持久化 + 发 `domain/changed`（`storage-domain/src/index.ts:103-174`、`domain.ts:210-218`）。落盘 `$DSH_HOME/storages/<name>.json`，原子写由后端保证。

### 2.2 官方存储的三项使用约束（正是拒绝原因）
- 插件**无 `zod` / `dsh-storage-domain` 依赖**；`tsdown.config.ts:13-19` 只把 schemastery/cordis 设 `neverBundle`，新增依赖会被打进 `lib/index.js`。
- `open()` 不强制 `defineDomain()`，且 schema 只在 open 时调 `.parse()`（`index.ts:151`）⇒ 只能靠**鸭子类型**糊一个假 schema，属于**依赖实现细节的未公开用法**。
- 若要保证服务可用，需 `inject=['storageDomain']` —— **硬依赖**（Cordis 中 inject 不满足则整个插件不激活）。

### 2.3 UI 渲染契约
- Host 自动表单只渲染 `.volatile()` schema 字段（`settings/src/schema.ts:37-67`）；从 `Config` 移除两字段 → **自动表单自然消失**。
- 但本插件 `CompactionTab` 是**自定义 slot**，硬编码从 `scope.getSnapshot().value` 读两字段（`CompactionTab.tsx:22-27,94-95,119-132`），**必须手动改为读新路由**。
- `scope` 仍被 `ModelsTab` / `ToolsTab` 使用，`client/index.tsx` 的 configForms 注入**保留不动**。

### 2.4 升级迁移入口（只读，不写 patch）
- `ctx.get('configEditor').configuration()` 返回 `{entry, inherited, override}`（`packages/boot/config-editor/src/index.ts:48-69`），是 `structuredClone` 纯读；`override` 即 profile patch 中的原始 `config`。
- ⇒ 迁移 = 启动早期读旧值 → 若新存储无值则写入一次。**不使用 `edit()`**（会重写 patch 并重启插件）。
- 兜底：读不到旧值 → 默认 `deepseek-official` / `deepseek-flash`。

### 2.5 web 路由与原子写先例
- 插件自有路由已验证：`ctx.inject(['webServer'], …)` + `ws.register({kind:'exact',path,handler})`，客户端同源 `fetch` 相对路径（`plugin/src/web/routes.ts:38-68`、`host/webserver/README.md:12,59-67`）。
- 现有数据目录先例：`index.ts:1-2,35,38`（`homedir()` + `join` → `~/.dsh-opencode-local/catalog.json`）；`catalog/models.ts:50-66` 为**非原子**读写（`readFileSync` / `writeFileSync`）。
- 官方原子写范式可借鉴：`packages/util/atomic-write/README.md:28-39`（临时同目录文件 + rename，父目录自动创建，Windows 重试）。

### 2.6 Cordis 支持 async apply（本轮已不需要）
- `cordis/src/fiber.ts:401-402` 会 await apply 返回的 Promise，fiber 在 settle 前保持 LOADING（`:709-714`），故 async apply 是安全模式。
- **但 JSON 方案读写皆简单**：启动期只需一次同步读，**`apply` 保持同步**，不引入任何新的生命周期复杂度（见 §3.3）。

---

## §3 裁决（全部定案，无待决项）

### 3.1 D1 —— 存储介质：**自造 JSON**（推翻 v1 的官方存储）
**结论**：使用 `~/.dsh-opencode-local/compaction.json`。

| 维度 | 官方存储 | 自造 JSON |
| --- | --- | --- |
| 依赖 | 需硬 `inject storageDomain` + 鸭子类型投机 | **零新增依赖** |
| 与 DSH 版本耦合 | 强（未公开用法：只调 `.parse()`、单个 domain 全局槽、单/多记录布局） | **无** |
| 故障后果 | `open()` 校验失败 → fiber FAILED → **每次启动都挂**；inject 不满足 → **整个插件不激活（模型全消失）** | 读失败 → 默认值，**软着陆**，功能照常 |
| 掌控度 | 格式/位置/校验归 DSH | **完全自控** |
| 成本 | 少写代码 | 多约 40 行（序列化 + 原子替换 + 容错） |
| 实际效果 | 持久化 + 面板读 + 压缩读 | **完全等价** |

**四类硬风险（决定性）**：
1. **硬 inject 连坐**：`inject=['storageDomain']` 不满足 → 整个 opencode-local 插件不激活，免费模型全部消失（不止压缩功能）；
2. **坏数据永久启动失败**：domain 在 open 时对已存值跑 `.parse()`，解析失败即抛错、fiber FAILED，且坏数据仍在文件里，**下次启动继续失败**；
3. **投机用法**：鸭子类型依赖「open 仅调 `.parse()`」这一当前实现细节，DSH 升级改用 `safeParse`/`instanceof`/收紧 spec 即当场失效；
4. **格式不归我管**：`$DSH_HOME/storages/` 的布局、版本戳、domain 名唯一性均由 DSH 决定。

> 官方存储实现原理已在 §2.1/§2.2 完整留档，**作为备选保留**：若将来插件被允许增加依赖、且官方提供公开的轻量 KV API，可切换。切换成本被 §3.4 的接口设计压到最低（只需换 `compaction-store.ts` 内部实现）。

### 3.2 D2 —— 文件与格式（落人工第 2 条）
- 路径：`join(homedir(), '.dsh-opencode-local', 'compaction.json')`，与 `catalog.json` 同目录。
- 内容（带版本，便于未来演进）：
```json
{ "version": 1, "provider": "deepseek-official", "model": "deepseek-flash" }
```
- 解析规则（**逐字段独立回落，不是整对作废**）：
  - JSON 解析失败 → 整体回落 `DEFAULT_COMPACTION`；
  - `version !== 1` → 整体回落 `DEFAULT_COMPACTION`（未来版本由新代码接管，旧代码不猜）；
  - `provider` 非「非空字符串」→ 该字段回落默认，`model` 仍按自身规则判定；
  - `model` 同上；
  - **永不抛给调用方**（任何异常都转成默认值）。
- **残留旧键**：用户 profile patch 中若仍留有 `compactionProvider` / `compactionModel`（我们已从 schema 删除），**无害**——schemastery 默认保留未知键（探针已验 `schemastery/src/index.ts:821-823`），DSH 不会因此报错。**禁止**为「清理干净」去改 `cordis.patch.yml`；残留键只是被忽略。

### 3.3 D3 —— 接口与同步性
- **读：同步** `readCompactionFile(path)`（`readFileSync` + 容错），供 `llm/stream` 监听器与 web GET 使用。
  - **缓存**：模块级 `Map<string, { mtimeMs: number; size: number; value: CompactionChoice }>`，按绝对路径分键；
  - 命中条件：`mtimeMs` 与 `size` **都相同**才复用；任一不同则重新读盘；
  - **写后主动失效**：`writeCompactionFile` / `migrateCompactionFile` 成功后**立即删除该 path 的缓存条目**（不依赖 mtime 变化，规避同秒写入读旧值的坑）；
  - 读操作**绝不创建文件**（无副作用）。
- **写：异步原子** `writeCompactionFile(path, next)`（`fs.promises`）：写 `${path}.tmp` → `rename` 覆盖；父目录 `mkdir recursive`；Windows `EPERM/EACCES/EBUSY` 重试 3 次，间隔 30/60/120ms，仍失败则 `unlink` 临时文件并抛错。
  - **幂等短路**：写入前先比对当前值，**完全相同时直接返回、不写盘**（避免无谓 IO 与 mtime 抖动）。
  - **并发**：不做锁；原子 `rename` 保证文件永不损坏，**最后一次写入胜出**（可接受）。
- **迁移：同步一次性** `migrateCompactionFile(path, old)`：同步原子写（`writeFileSync` tmp + `renameSync`，同样 3 次重试）；**仅当文件不存在**时执行，已有文件绝不覆盖；成功后失效缓存。
- **`apply` 保持同步**，不需要改 async；**`inject` 保持 `['llm']`**，不新增任何服务依赖。

### 3.4 D4 —— 模块边界与 HTTP 契约（便于将来换实现、避免前后端对不上）
新增 `plugin/src/compaction-store.ts`，只暴露：
```ts
export interface CompactionChoice { provider: string; model: string }
export const DEFAULT_COMPACTION: Readonly<CompactionChoice>   // 用 Object.freeze 冻结，防意外篡改
export const COMPACTION_FILE_VERSION = 1
export function parseCompactionDocument(text: string): CompactionChoice | undefined   // 纯函数，可测
export function readCompactionFile(path: string): CompactionChoice                    // 同步、容错、mtime+size 缓存
export async function writeCompactionFile(path: string, next: CompactionChoice): Promise<void>  // 异步原子、幂等短路、写后失效缓存
export function migrateCompactionFile(path: string, old: { provider?: unknown; model?: unknown } | undefined): boolean  // 同步一次性、写后失效缓存
```
调用方（`index.ts`、`web/routes.ts`）只依赖这 4 个函数，不感知存储介质。

**HTTP 契约（前后端唯一依据，字段名不可改）**：

| 路由 | 方法 | 请求 | 成功响应 | 失败响应 |
| --- | --- | --- | --- | --- |
| `/plugins/opencode-local/compaction` | `GET` | 无 | `200 {version:1, provider:string, model:string}` | 永不失败（读失败已回落默认） |
| `/plugins/opencode-local/compaction` | `POST` | `{provider:string, model:string}` | `200 {version:1, provider, model}`（写后回读值） | `400 {error:"provider and model required"}`；`405 {error:"method not allowed"}`；`500 {error:"<原因>"}` |

- 前端**只读** `body.provider`、`body.model`、`body.error`，不读其它键。
- `status-paths.ts` 导出 `WebCompactionPayload = { version?: number; provider?: string; model?: string; error?: string }`。

### 3.5 D5 —— 迁移（人工第 6 条）
- 时机：`apply()` 内、store 建立之后立即执行一次（同步）。
- 来源：`ctx.get('configEditor')` 的 `configuration()`，取 `entries` 中 `entry.options.id === 'opencode-local'` 的那条；值取 `override ?? inherited`（`override` 即 profile patch 原始 config）。
- **取不到就跳过**：`configEditor` 不存在 / `configuration` 不可调用 / 找不到该 entry → **直接跳过迁移**（不报错、不写任何文件）。
- 判定与合并（**逐字段独立**）：
  - 仅当 `compaction.json` **不存在**时才迁移；已存在则什么都不做（绝不覆盖用户已有选择）。
  - `oldProvider` 为「非空字符串」→ 采用（`trim()` 后）；否则用 `DEFAULT_COMPACTION.provider`。
  - `oldModel` 同理。
  - 两者都取默认值时**仍然写文件**（作用是落一个带 `version:1` 的初始文件，后续读路径行为一致、可预期）。
- 失败：任何异常静默忽略（保底默认值），不阻塞插件启动。

### 3.6 D6 —— 动态读取（人工第 7 条）
- 面板**打开 / 刷新时** `GET` 一次；不做订阅、不做轮询。
- 压缩监听器仅在 `options.purpose === 'compaction'` 时才读 store（普通对话零磁盘开销）。

### 3.7 D7 —— 兜底
- 任何读失败 / 文件缺失 / 损坏 → `DEFAULT_COMPACTION`，**不报错、不崩溃**。
- 写失败（如磁盘只读）→ 路由返回 500 并附原因，界面回滚到写入前的值并提示；不影响压缩路由的默认行为。

---

## §4 目标架构

```
设置页 CompactionTab（每次打开 GET 一次；点选先本地乐观更新）
   │  GET  /plugins/opencode-local/compaction          → Host: readCompactionFile()（同步 + 容错 + mtime 缓存）
   │  POST /plugins/opencode-local/compaction {provider,model}
   │                                                   → Host: writeCompactionFile()（tmp + rename 原子）
   ▼
llm/stream 监听器（仅 purpose==='compaction' 时读）
   │  applyCompactionRoute(options, choice.provider, choice.model)   ← 判断逻辑原样不动
   ▼
~/.dsh-opencode-local/compaction.json   （全局；无 DSH 依赖；无 profile 重组；无 serve 重启）
```

- **移除**：`config.ts` 两字段 + `resolveConfig` 组装 + `liveCompactionProvider` / `liveCompactionModel` 两个函数（**完全删除**，职责由 store 接管）；`CompactionTab` 对 scope 的两字段读写。
- **新增**：`plugin/src/compaction-store.ts`；web GET/POST 两条路由。
- **不变**：`applyCompactionRoute` 判断逻辑、`inject`、工具策略、`allowAll`、`agent:'build'`、聊天路径、其它 tab、`cordis.patch.yml`、`catalog.json` 逻辑、`api/server.ts`。
- **无副作用**：不触发 profile 重组、不重启 serve、不重写任何配置文件。

---

## §5 施工清单（10 个文件；详细代码块由 `temp/code.md` v2 承接）

| # | 文件 | 改动要点 |
| --- | --- | --- |
| 1 | `plugin/src/compaction-store.ts` | **新增**：§3.4 的 4 个函数 + 常量；同步容错读（含 mtime 缓存）、异步原子写（tmp+rename+Windows 重试）、同步一次性迁移、纯函数 `parseCompactionDocument` |
| 2 | `plugin/src/config.ts` | **删除** 接口 2 行（`:17-18`）、schema 2 行（`:38-39`）、`resolveConfig` 的 2 处 unwrap（`:67-68`）与 2 处赋值（`:82-83`）、`liveCompactionProvider`/`liveCompactionModel`（`:130-140`）；**`applyCompactionRoute` 原样保留** |
| 3 | `plugin/src/index.ts` | import store 四函数；`const compactionPath = join(dataDir,'compaction.json')`；启动即 `migrateCompactionFile(...)`（读 configEditor 旧值）；`llm/stream` 监听器改为**先判 `purpose==='compaction'` 再读 store**；`registerWebRoutes` 的 `compaction` 读者改为读 store；`inject` 与 `apply` 同步性**不变** |
| 4 | `plugin/src/web/routes.ts` | 新增 `GET /plugins/opencode-local/compaction`（→ `{provider,model}`）与 `POST`（校验两字符串 → `await writeCompactionFile` → 200；失败 500 + 原因） |
| 5 | `plugin/src/client/status-paths.ts` | 新增 `COMPACTION_PATH` 与 `WebCompactionPayload` 类型 |
| 6 | `plugin/src/client/CompactionTab.tsx` | 删除 scope 快照读取与两次 `scope.set`；改为 `useState` 持有 provider/model + **打开时 GET 一次**；`choose()` = 先 `setState` 乐观更新 → POST → 失败回滚并报错；目录/上下文面板/按钮不变 |
| 7 | `docs/impl-harness/h6-compaction.mjs` | import 改为 `applyCompactionRoute` + `DEFAULT_COMPACTION`；原 `'h6 compact model default'` 断言（校验常量等于常量属自证，无价值）**改为有意义的用例**：`readCompactionFile(<不存在的临时路径>)` 必须返回 `DEFAULT_COMPACTION` 的深相等值；其余不动 |
| 8 | `docs/impl-harness/h7-compaction-ui.mjs` | **重写**：删除 `liveCompaction*` 与 `resolveConfig('compactionProvider')` 系列断言；改为 ①`parseCompactionDocument` 纯函数用例（正常 / 缺字段 / 坏 JSON / `version` 不符 / 字段非字符串 → 逐字段回落）②`write→read` 往返 + 损坏回退 + **写后立即读（验证缓存已失效、不读旧值）** ③`applyCompactionRoute` 原有用例保留 ④`COMPACTION_PATH` 与 `WebCompactionPayload` 契约字面值。**临时文件固定为 `temp/impl-harness-data/h7-compaction-store.json`，用例结束（含失败）必须删除该文件与其 `.tmp`** |
| 9 | `plugin/README.md` | 「上下文压缩」章节补一句：偏好存于插件数据目录 `compaction.json`（全局），切换即时生效、无需重启 |
| 10 | `plugin/package.json` | 版本 `0.2.5` → `0.2.6` |

> 归组（沿用 code.md 的多 agent 并行模式，写盘范围互不重叠）：**A**={1,2}、**B**={3,4,5}、**C**={6}、**D**={7,8}、**E**={9,10}。

### 5.1 收尾（施工与验收全部通过后，串行执行；沿用 0.2.5 惯例）

| # | 动作 | 说明 |
| --- | --- | --- |
| 11 | 归档方案 | `temp/code.md` → 复制为 `docs/P2/code-debug-0.2.6.md` |
| 12 | 写实施记录 | 新建 `docs/P2/impl-notes-0.2.6.md`：改动文件清单、typecheck/build/h1–h7 结果、包字节数与 SHA256、安装 profile 与备份路径、回滚命令、验收项 |
| 13 | 更新 `docs/handoff.md` | 版本 → 0.2.6；记录本轮「压缩偏好改存插件 JSON、切换即时」；**安装/验收目标仍为 `web` profile**（不变） |
| 14 | **不提交 git** | 由人工接管 |

> 收尾动作**不属于并行工作包**，由主执行者在验证通过后按序完成；任一步失败即停并报告。

---

## §6 验收口径

1. **切换即时**：点选后界面**立即**更新（乐观），POST 完成后持久化；**无 profile 重组、无 serve 重启**。
2. **动态读取**：每次打开/刷新 tab 都从 `compaction.json` 读回并显示；改完重开面板仍是新值。
3. **持久化**：重启 DSH 后值保留；`~/.dsh-opencode-local/compaction.json` 内容为 `{version:1, provider, model}`。
4. **统一性不回归**：人工 `/compact` 与切模型自动压仍走同一对值（D19）。
5. **迁移**：0.2.5 升级后旧值被写入作为初始值；无旧值 → 默认。
6. **兜底**：文件缺失/损坏/权限错误 → 默认值、无崩溃；写失败 → 界面回滚 + 明确提示。
7. **回归**：h1–h7 全过（h6 压缩路由断言保持、h7 新增 store 用例全过）；普通聊天逐字节不变。
8. **安装**：web profile，只装不重启，`cordis.patch.yml` 未变。
9. **无新依赖**：`plugin/package.json` 的 `dependencies` 不变；`lib/index.js` 不新增外部包引用。
10. **契约一致**：`GET` 返回 `{version,provider,model}`；`POST` 成功回同结构、失败回 `{error}`；前端只读 `provider`/`model`/`error` 三键。
11. **幂等**：重复提交与当前值相同的选择 → 不产生磁盘写入（文件 mtime 不变），界面仍正常。
12. **并发**：快速连续切换两次 → 文件可正常解析、内容等于**最后一次**选择，无损坏、无半写文件残留。
13. **残留旧键无害**：profile patch 中保留 `compactionProvider`/`compactionModel` 时，插件正常加载、无报错，且 `cordis.patch.yml` **未被本插件修改**。

---

## §7 硬停声明

- 本文件为探针闭环 + 人工复核 + 歧义补全后的完整方案；**未改任何代码、未构建、未打包、未安装、未提交 git**；仅修订本方案文档。
- 本轮补全的 9 处歧义（写后缓存失效、缓存键、迁移逐字段回落、残留旧键、HTTP 契约、幂等短路、并发语义、h7 临时文件与清理、收尾步骤）已全部写入 §3.2/§3.3/§3.4/§3.5/§5/§6，**无剩余未定项**。
- 下一步待人工指令：据本方案产出精确到代码块的 `temp/code.md` v2（多 agent 并行施工指引），或直接批准施工。
