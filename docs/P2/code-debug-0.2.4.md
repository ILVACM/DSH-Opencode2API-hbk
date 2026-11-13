# 0.2.4 差异施工图（debug.md）

> 状态：**已人工批准（2026-11-13）并执行完毕；本轮 debug 已关闭（2026-11-13 人工重启后核心项实机通过）**。执行纪律不变：只按本文件落盘，不做解释、改进或重排。
> ⚠️ 本文件为**执行当时的历史事实源**，正文（含 §9 的"待实机验收"措辞）保持原貌不回改；**当前状态以 `docs/handoff.md`、`docs/plan.md`、`docs/P2/impl-notes-0.2.4-r2.md` 为准**。
> 本文件是执行的**唯一事实源**：所有最终文件内容逐字节内嵌于 §5，执行者只做"照抄落盘"，不做任何解释、改进或重排。
> 无论使用何种模型、何种 agent 软件，只要按本文件执行，产物字节必须相同。
> 制定日期：2026-11-13（Asia/Shanghai）。基线：0.2.3（已验收）。目标版本：**0.2.4**（2026-11-13 人工裁决复用该号；与 11-11 实测否决的同号版本内容不同，旧否决记录 `docs/P2/impl-notes-0.2.4.md` 保留，不与本版本冲突）。
> 性质：差异施工图（只列改动文件）。上一份全量施工图为 `docs/P2/code-debug.md`（0.2.2），本文件沿用其纪律。

---

## §0 裁决记录与目标

### 0.1 人工裁决（2026-11-13，全部已确认）

| # | 裁决 | 内容 |
| --- | --- | --- |
| D1 | 方案 A | 插件创建 opencode 会话时**固定传 `agent: 'build'`**，不再依赖上游默认回落，消除运行模式不确定性 |
| D2 | 方案 B | 设置页勾选「完全允许」时，**不做任何检查**：不比对动作名、不计每回合次数、不区分任何动作（含 `external_directory`、`subagent`、`skill`、`question` 等未列出动作），所有工具请求一律放行。**风险全部由人工承担** |
| D3 | 次数上限 | 「完全允许」时**彻底不计次**（上限失效）；未勾选时上限照旧生效 |
| D4 | once 而非 always | 放行决定一律用 `decision: 'once'`。**禁止用 `'always'`**：上游 `always` 会把规则永久写入 `opencode.db` 的 permission 表（`D:\opencode\packages\core\src\permission.ts:340-346`），导致关掉开关后闸门关不回去。`once` 逐条放行、不落库，取消勾选立即恢复管控 |
| D5 | external_directory 进清单 | 设置页动作清单加入 `external_directory`，不开「完全允许」也可单独勾选放行跨目录访问 |

### 0.2 根因回顾（为什么改）

- 实证（2026-11-12 数据库 + 源码双证）：插件会话 `agent=None`（上游回落 build，并非 plan）；工具被拒的真实原因是**跨工作目录访问触发上游 `external_directory` 动作**（`D:\opencode\packages\core\src\file-access.ts:148`），而当时白名单为空/动作名不匹配，插件按 `reject` 处理，模型收到插件自己的话术 `tools are disabled or not allowed in this channel`（`turn.ts:15`）。
- 旧「完全允许」只是 `allow.includes('*')` 恰好匹配所有动作名，仍受次数上限与动作匹配逻辑约束，不是真·全放行。本次改为**显式短路**。

### 0.3 目标

1. 每个插件会话固定 `build` 模式。
2. 「完全允许」= 裁决点短路放行，零检查、零计次、零落库。
3. `external_directory` 可单独勾选。
4. 其余行为（免费模型过滤、显隐勾选、思考档位、reasoning 折叠、API 静默保留、进程看护）**逐字节不变**。

---

## §1 执行编排（多 agent 协作，含能力探测与串行回退）

### 1.1 角色

- **主执行者（Lead）**：唯一有权运行验证命令、打包、派发与纠偏的角色。
- **施工执行者 W1–W6**：只写各自清单内的文件，写完回报哈希。**禁止**运行 npm/tsc/node 测试，**禁止**触碰清单外文件，**禁止**"改进"代码。

### 1.2 阶段顺序（严格串行推进，阶段内并行）

```
P0 预检(Lead, 只读+条件安装) → P1 能力探测(Lead) → P2 落盘(W1–W6 并行 或 Lead 串行) → P3 验证(Lead, 严格串行 V1–V6) → P4 打包(Lead) → P5 人工实机验收 → P6 收尾文档(Lead)
```

**验证阶段禁止并行**（沿用 0.2.2 纪律）。

### 1.3 P0 预检（Lead）

工作目录 `D:\DSH-Opencode2API-hbk`。逐项执行：

1. `node --version` → 必须 ≥ 20（基线 v24.21.0）。
2. `npm --version` → 必须存在（基线 11.19.0）。
3. `Test-Path plugin\node_modules\typescript` → True。
4. `Test-Path plugin\node_modules\tsdown` → True。
5. `Test-Path plugin\node_modules\@deepseek-ai\schemastery` → True（h5 直接 import config.ts 需要它）。
6. `opencode --version` → v2.2.6（P3 验证的对话回归需要）。
7. 若 3/4/5 任一为 False：在 `plugin/` 下执行 `npm install`（串行，完成后重查）。仍失败 → **停止并报告**，不得进入 P1。
8. 运行 §6 的 **V0 基线核对脚本**：13 个既有文件哈希必须与 §2 表全等，`git status --porcelain` 必须与 §2 基线一致。任何漂移 → **停止并报告**，重新出方案。

### 1.4 P1 能力探测（Lead，保证协作能力可用）

目的：**不假设**环境具备并行能力，用一次真实探测判定；无论结果如何，产物字节相同。

1. Lead 检查自身工具面是否存在"派发独立子代理/队友"的能力（DSH：`spawn_teammate` 或 `subagent`；其他 agent 软件：任何等价机制，如独立子会话、任务队列、多进程执行器）。
2. **存在** → 派 1 个探测执行者，任务全文：
   > 把文件 `D:\DSH-Opencode2API-hbk\temp\parallel-probe.txt` 写为恰好 9 字节：`probe-ok` 加一个 LF 换行（UTF-8，无 BOM，无 CRLF）。完成后回报该文件的 SHA256。不得做任何其他事。
3. Lead 验证该文件内容恰为 `probe-ok\n`。成功 → **并行模式**（P2 派 W1–W6）。失败或超时（120 秒）→ **串行回退**。
4. **不存在派发能力** → 直接**串行回退**。
5. 串行回退定义：Lead 自己按 W1→W2→W3→W4→W5→W6 顺序执行同样的落盘规则（§1.6），产物与并行模式逐字节相同。
6. 探测文件属 temp/ scratch，验证后可删。

> 环境能力由此得到保证：能并行则并行，不能则串行，**不存在"做不了"的分支**。

### 1.5 P2 派发（并行模式）

Lead 用 §1.6 的模板向 W1–W6 各发一条**自包含**任务（文件清单见 §4.2）。六个执行者文件集**两两不相交**，无读写依赖（全部内容已内嵌于本文件），可同时开工。Lead 收齐 6 份 `DONE` 回报后进入 P3。任何执行者失败/超时 → Lead 亲自按同一规则补写该执行者的文件（不重试派发），再进入 P3。

### 1.6 施工执行者任务模板（逐字使用，替换 <n> 与 <清单>）

```
你是施工执行者 W<n>。任务：把 temp/debug.md 中指定文件的最终内容逐字节落盘。
仓库根：D:\DSH-Opencode2API-hbk

步骤：
1. 读 D:\DSH-Opencode2API-hbk\temp\debug.md（UTF-8）。
2. 对清单中每个文件 <路径>，找到独占一行的开始标记与结束标记：
     开始标记形如：===== BEGIN FILE: <路径> (trailing-newline: yes 或 no) =====
     结束标记形如：===== END FILE: <路径> =====
   取开始标记行之后、结束标记行之前的原文 R（R 必以一个换行符结尾）。
   换算规则（唯一裁定）：
     flag=yes → 文件最终内容 = R（原样，含其末尾换行）
     flag=no  → 文件最终内容 = R 去掉末尾恰好一个换行符
3. 用整文件写入（覆盖）方式落盘到 <仓库根>\<路径>。编码 UTF-8 无 BOM，换行一律 LF。
   不得增删改任何字符，不得重排、不得格式化、不得让编辑器转成 CRLF、不得补/删末尾换行。
4. 写入后计算该文件 SHA256（大写 hex）与行数，回报一行：
   DONE W<n> <路径> sha256=<hex> lines=<n>

文件清单（只许动这些，其余一律不碰）：
<清单>

禁止：运行 npm/tsc/node 测试；修改清单外任何文件；自行改进代码；与他人协调改动内容。
内容以 temp/debug.md 内嵌块为唯一事实源，本提示词不重复代码。
```

### 1.7 回报与纠偏

- 回报格式固定：`DONE W<n> <路径> sha256=<大写hex> lines=<n>`。
- Lead 不信任回报，P3 的 V1 以字节比对为准。
- V1 发现任何 FAIL：Lead 亲自按 §1.6 规则重写该文件，重跑 V1，直至 13/13 PASS。**不派执行者返工**。

---

## §2 基线（执行前必须全等）

### 2.1 git 基线

- HEAD：`473a103 complete`（其前 `d5f894c Initial commit`）。
- `git status --porcelain` 恰为以下 3 行（2026-11-12 晚清理遗留，属预期，不得提交、不得还原）：

```
 M docs/handoff.md
 M plugin/README.md
 M plugin/hbk-dsh-opencode-local-0.2.3.tgz
```

### 2.2 文件基线哈希（SHA256，大写；V0 脚本逐字节核对）

| 文件 | 行数 | 末尾换行 | SHA256 |
| --- | --- | --- | --- |
| plugin/src/serve/client.ts | 147 | 有 | 3A7F14E906BD4098B43D5E70C0668ABDDB1F23563E6613325FEEEA94D6A3C26B |
| plugin/src/types.ts | 142 | 有 | 7C2F7C00A5C9FAD00CA03E9BFA614FBB33C6333C01192976B1E93EE2BB145C98 |
| plugin/src/config.ts | 118 | 有 | B0649A038B7D4F806253D5C1737BCCDDC8E2904817B561C73D67DD67536A62A3 |
| plugin/src/adapter/turn.ts | 113 | **无** | 223B7465178FE890283A2F226700B206FDDA8227EDABE8FDAA54E19EAE9225B3 |
| plugin/src/adapter/flatten.ts（守卫，不许改） | 41 | 有 | B2E52D1CEF05B450AF9A2ACDBD32368D10B2AB594873F41E74269980E2D3D0EE |
| plugin/src/client/status-paths.ts | 20 | 有 | 3ECE6C59DF88D857499558B9C2D4F292C2130FBCF8A6716C3767B0A90A7C9CA6 |
| plugin/src/client/locales.ts | 62 | 有 | B59EE56BEC33F3ACB3FA0CB2D9025A7C31313A18D0692ACBB4E0723A7C7909CB |
| plugin/src/client/ToolsTab.tsx | 58 | **无** | A4782E66341A9D5304EFF6BB55335D48E9AD35252BC65610E3C2EDA581C05DFA |
| plugin/package.json | 41 | 有 | E947C5D28626511E4AD4E287A5E702ECD149FDF3E65B43319A1A6E8C52F9205F |
| plugin/README.md | 74 | **无** | 19D184C3AC735BB0DDC2E9390E7206EFA391CA7B6F7D701F058EAB1A0051AB6C |
| docs/impl-harness/lib.mjs | 51 | 有 | C450198E6EAEB343AFAAAED0C6D7E03A9E91ADFDA8D369B13365224C59E9CE5E |
| docs/impl-harness/run-all.mjs | 30 | **无** | 523BCFC4EF53E60413293A75F3C54D5FC2D3B8DACEE45E9747AEC9B190C10681 |
| docs/impl-harness/h2-tools.mjs | 25 | **无** | 193D8B410F5CBC4B4289147630202B2C59951447071AE808E9AD55112636B696 |

新文件（基线不存在）：`docs/impl-harness/h5-allow-all.mjs`。

### 2.3 环境基线

Windows；Node v24.21.0；npm 11.19.0；opencode v2.2.6；DSH 0.2.2-rc.1（desktop profile）。`temp/` 当前不存在（本文件写入时创建）。参考源码只读：`D:\opencode`（git 101776024c）、`D:\deepseek-harness`。

---

## §3 语义契约（唯一裁定）

### 3.1 工具裁决真值表（turn.ts 裁决点）

设 `policy = cfg.toolPolicy()`，`action` 为事件动作名，`approved` 为本回合已放行计数：

| toolMode | toolAllowlist | 派生 allowAll | 裁决 | 计次 |
| --- | --- | --- | --- | --- |
| false | 任意 | false | 一律 reject | 不计 |
| true | [] | false | 一律 reject | 不计 |
| true | ['shell'] | false | action==='shell' 且 approved<maxPerTurn → once；否则 reject | 放行且 reply 2xx 时 approved+1 |
| true | ['external_directory'] | false | action==='external_directory' 且 approved<maxPerTurn → once；否则 reject | 同上 |
| true | ['*']（或含 '*'） | **true** | **一律 once，无任何条件** | **approved 永不增加** |

裁决表达式（逐字，见 §5 F04）：

```
const allowed = policy.allowAll
  || (policy.mode === 'allowlist'
    && (policy.allow.includes('*') || policy.allow.includes(action))
    && approved < policy.maxPerTurn)
```

- 保留 fallback 分支里的 `policy.allow.includes('*')` 是**有意的向后兼容**：旧式 policy 对象（无 allowAll 字段，如外部直接构造）行为与 0.2.3 完全一致；新语义只经显式 `allowAll === true` 激活。
- `allowAll` 派生规则（config.ts）：`allowAll = mode && allowList.includes('*')`。**总开关关闭时 allowAll 必为 false**（即使 allowlist 含 '*'）。
- 计次规则：reply 返回 200/204 且 allowed 时，`diag.toolApproved += 1` 恒成立（诊断计数）；`approved += 1` 仅在 `!policy.allowAll` 时成立（闸门计数）。
- 放行决定**恒为 `'once'`**，拒绝恒为 `'reject'`。代码中不得出现 `'always'` 作为实参（replyDecision 的类型签名保留三值不变）。

### 3.2 会话模式契约

- `createSession(ep, title, modelRef, agent = 'build')`，请求体恰为 `{ title, agent, model: modelRef, permissions: ASK_ALL }`。
- 所有调用点（仅 turn.ts:61 一处）不传第 4 参 → 默认 'build'。
- **安全不变量**：`permissions: ASK_ALL`（`[{action:'*',resource:'*',effect:'ask'}]`）保持不变。上游权限合并为 flat 后 findLast 生效（`D:\opencode\packages\core\src\permission.ts` evaluate/merge），会话级 ASK_ALL 排在 agent 规则之后 → 除上游内置 allow 外一切动作仍产生 `permission.asked`，**插件仍是唯一裁决点**。固定 build 不开放任何绕过（build agent 仅含 `question:allow`，见附录 A）。

### 3.3 UI 契约

- `TOOL_ACTIONS` 恰为 `['shell','edit','read','webfetch','websearch','grep','glob','external_directory']`（顺序即渲染顺序，新项在末尾）。
- 「完全允许」复选框逻辑不变：勾选 → 写 `toolAllowlist=['*']`；取消 → 写 `[]`。
- 勾选「完全允许」时：单项复选框禁用（既有逻辑），**次数上限输入框也禁用**（本次新增，值保留不丢）。
- 文案：allowAllHint 与 maxPerTurnHint 必须反映"完全允许时零检查、上限不生效"（§5 F06 逐字）。
- locales 的 en 是 `Record<keyof typeof zh, string>`：zh 新增键必须同步 en，否则 typecheck 失败（这是有意的强制）。

### 3.4 不变量（不许动的行为）

- 免费判定、显隐勾选、catalog 缓存格式、刷新语义：不变。
- flatten.ts：不变（toolsEnabled 仍由 `mode==='allowlist'` 决定；allowAll 蕴含 allowlist，故完全允许时提示词仍为"可用工具"版）。
- translate.ts / note() reasoning 折叠：不变。
- api/server.ts、web/routes.ts、index.ts、local-adapter.ts、manager.ts、priority.ts、models.ts、其余 client 文件、cordis.patch.yml、tsconfig*、tsdown.config.ts：不变。
- **配置 Schema 零新增键**：allowAll 是派生值，不存储；`toolAllowlist:['*']` 即完全允许，沿用既有 `.volatile()` 键。
- h1/h3/h4 测试文件：不变。BUDGET.cap=12 不变。

### 3.5 非目标

不做 agent 选择 UI；不支持 plan 模式；不改 API 入口（静默保留裁决继续有效）；不引入 'always'；不做响应体扫描（冻结项）。

---

## §4 变更清单（F01–F13）

### 4.1 逐文件差异摘要（Lead 在 V6 用 git diff 对照本表逐块复核）

| 编号 | 文件 | 差异（相对基线） | 行数变化 | 末尾换行 |
| --- | --- | --- | --- | --- |
| F01 | plugin/src/serve/client.ts | L112 签名追加 `, agent = 'build'`；L113 请求体 title 后插入 `agent, ` | 147→147 | 有 |
| F02 | plugin/src/types.ts | ToolPolicy 在 allow 后新增一行 `  allowAll: boolean` | 142→143 | 有 |
| F03 | plugin/src/config.ts | liveToolPolicy：新增 allowList 常量行；allow 字段改用 allowList；新增 allowAll 行 | 118→120 | 有 |
| F04 | plugin/src/adapter/turn.ts | allowed 表达式改为 allowAll 短路（7 行块→11 行块，含 reply 行）；成功分支拆行并加 `if (!policy.allowAll) approved += 1` | 113→117 | **无** |
| F05 | plugin/src/client/status-paths.ts | L20 数组末尾追加 `, 'external_directory'` | 20→20 | 有 |
| F06 | plugin/src/client/locales.ts | zh：allowAllHint、maxPerTurnHint 两行替换，glob 行后新增 external_directory 键；en：对称三处 | 62→64 | 有 |
| F07 | plugin/src/client/ToolsTab.tsx | L54 `disabled: !modeShown` → `disabled: !modeShown \|\| allowAll` | 58→58 | **无** |
| F08 | plugin/package.json | L3 `"version": "0.2.3"` → `"0.2.4"` | 41→41 | 有 |
| F09 | plugin/README.md | L5 版本、L15 安装命令、L19 回退清单、L30 白名单/完全允许、L31 上限、L49 未列出动作、L74 回归命令（h1–h5/预算≤5）共 7 行替换；L32 后新增 build 模式说明 1 行；故障速查表末新增 1 行 | 74→76 | **无** |
| F10 | docs/impl-harness/lib.mjs | L15 policy 字面量插入 `allowAll: false, ` | 51→51 | 有 |
| F11 | docs/impl-harness/h2-tools.mjs | L5 后新增一行 `  runtime.policy.allowAll = false` | 25→26 | **无** |
| F12 | docs/impl-harness/h5-allow-all.mjs | **新文件**（39 行） | 0→39 | 有 |
| F13 | docs/impl-harness/run-all.mjs | L7 后新增 h5 import；循环列表追加 `['h5', h5]` | 30→31 | **无** |

### 4.2 Worker 分配（两两不相交）

| Worker | 文件 |
| --- | --- |
| W1 | F01 plugin/src/serve/client.ts；F02 plugin/src/types.ts |
| W2 | F03 plugin/src/config.ts；F04 plugin/src/adapter/turn.ts |
| W3 | F05 plugin/src/client/status-paths.ts；F06 plugin/src/client/locales.ts；F07 plugin/src/client/ToolsTab.tsx |
| W4 | F08 plugin/package.json；F09 plugin/README.md |
| W5 | F10 docs/impl-harness/lib.mjs；F11 docs/impl-harness/h2-tools.mjs；F13 docs/impl-harness/run-all.mjs |
| W6 | F12 docs/impl-harness/h5-allow-all.mjs |

---

## §5 内嵌最终文件（逐字节事实源）

标记行独占一行、顶格。两标记之间的原文 R 必以换行结尾；`trailing-newline: yes` → 文件内容=R；`no` → 文件内容=R 去掉末尾一个换行。全部 UTF-8 无 BOM、LF。

===== BEGIN FILE: plugin/src/serve/client.ts (trailing-newline: yes) =====
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

export async function createSession(ep: ServeEndpoint, title: string, modelRef: ModelRef, agent = 'build'): Promise<string> {
  const r = await serveRequest(ep, 'POST', '/api/session', { title, agent, model: modelRef, permissions: ASK_ALL })
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
===== END FILE: plugin/src/serve/client.ts =====

===== BEGIN FILE: plugin/src/types.ts (trailing-newline: yes) =====
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
  allowAll: boolean
  maxPerTurn: number
}
===== END FILE: plugin/src/types.ts =====

===== BEGIN FILE: plugin/src/config.ts (trailing-newline: yes) =====
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
  const allowList = Array.isArray(allow) ? allow.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  return {
    mode: mode ? 'allowlist' : 'off',
    allow: allowList,
    allowAll: mode && allowList.includes('*'),
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
===== END FILE: plugin/src/config.ts =====

===== BEGIN FILE: plugin/src/adapter/turn.ts (trailing-newline: no) =====
import { createSession, interruptSession, openSSE, prompt, replyDecision } from '../serve/client.ts'
import { flattenHistory } from './flatten.ts'
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

export async function* runTurn(
  ep: ServeEndpoint,
  cfg: TurnConfig,
  options: HarnessGenerateOptions,
  modelRef: ModelRef,
  diag: AdapterDiagnostics,
): AsyncGenerator<HarnessChunk> {
  const text = flattenHistory(options, cfg.toolPolicy().mode === 'allowlist')
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
              const allowed = policy.allowAll
                || (policy.mode === 'allowlist'
                  && (policy.allow.includes('*') || policy.allow.includes(action))
                  && approved < policy.maxPerTurn)
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
===== END FILE: plugin/src/adapter/turn.ts =====

===== BEGIN FILE: plugin/src/client/status-paths.ts (trailing-newline: yes) =====
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

export const TOOL_ACTIONS = ['shell', 'edit', 'read', 'webfetch', 'websearch', 'grep', 'glob', 'external_directory'] as const
===== END FILE: plugin/src/client/status-paths.ts =====

===== BEGIN FILE: plugin/src/client/locales.ts (trailing-newline: yes) =====
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
  'tools.allowAllHint': '勾选后不做任何检查：所有工具请求（含未列出的动作、工作目录外访问）一律放行，每回合次数上限不生效。风险全部由你承担；取消勾选立即恢复管控。',
  'tools.maxPerTurn': '每回合工具次数上限：',
  'tools.maxPerTurnHint': '仅在未勾选「完全允许」时生效：每回合最多放行这么多次工具调用。',
  'tools.action.shell': 'shell（执行命令）',
  'tools.action.edit': 'edit（写/改文件）',
  'tools.action.read': 'read（读取文件）',
  'tools.action.webfetch': 'webfetch（抓取网页）',
  'tools.action.websearch': 'websearch（网页搜索）',
  'tools.action.grep': 'grep（内容搜索）',
  'tools.action.glob': 'glob（文件查找）',
  'tools.action.external_directory': 'external_directory（访问工作目录外的文件）',
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
  'tools.allowAllHint': 'No checks at all: every tool request (including unlisted actions and access outside the working directory) is allowed, and the per-turn cap does not apply. You bear all risk; untick to restore gating immediately.',
  'tools.maxPerTurn': 'Per-turn tool cap:',
  'tools.maxPerTurnHint': 'Only applies when Allow all is unticked: at most this many tool calls per turn.',
  'tools.action.shell': 'shell (run commands)',
  'tools.action.edit': 'edit (write/edit files)',
  'tools.action.read': 'read (read files)',
  'tools.action.webfetch': 'webfetch (fetch pages)',
  'tools.action.websearch': 'websearch (web search)',
  'tools.action.grep': 'grep (content search)',
  'tools.action.glob': 'glob (find files)',
  'tools.action.external_directory': 'external_directory (access files outside the working directory)',
  'tools.saveHint': 'Changes save immediately.',
  'thinking.label': 'Thinking level',
  'thinking.default': 'default (model default)',
  'thinking.loading': 'Loading…',
  'thinking.hint': 'Options follow the current model; default uses the model default.',
}
===== END FILE: plugin/src/client/locales.ts =====

===== BEGIN FILE: plugin/src/client/ToolsTab.tsx (trailing-newline: no) =====
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
      h('input', { type: 'number', min: 1, max: 1000, value: maxShown, disabled: !modeShown || allowAll, onChange: (e: any) => void writeMax(Number(e.target.value)), style: { width: '80px' } })),
    h('p', { className: 'olp-hint' }, t('tools.maxPerTurnHint')),
    h('p', { className: 'olp-hint' }, t('tools.saveHint')),
  )
}
===== END FILE: plugin/src/client/ToolsTab.tsx =====

===== BEGIN FILE: plugin/package.json (trailing-newline: yes) =====
{
  "name": "@hbk/dsh-opencode-local",
  "version": "0.2.4",
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
===== END FILE: plugin/package.json =====

===== BEGIN FILE: plugin/README.md (trailing-newline: no) =====
# @hbk/dsh-opencode-local

把**本机真实的 opencode CLI** 桥接进 DSH（DeepSeek Harness）的插件。**不伪装**：直接复用你已安装、已登录的官方 CLI，对上游而言就是官方 CLI 在正常使用。全程 TypeScript，零原生依赖。

> 当前版本 **0.2.4**。对外 HTTP API 已**静默保留**（代码在、默认关闭、无设置界面、不再维护投入）——本说明不涉及它。
> 注：本 0.2.4 为 2026-11-13 全新构建（固定 build 模式 + 真·完全允许 + external_directory 可勾选），与 11-11 曾实测否决的同号版本内容不同。

## 前置要求

- Windows；Node ≥ 20
- opencode CLI **v2.2.6** 已安装并**已登录**（TUI 里能正常对话即可）
- DSH **0.2.2-rc.1**，使用 **desktop profile**（`C:\Users\<你>\.dsh\profiles\desktop`）

## 安装 / 卸载 / 回退

1. 安装：`dsh plugin add hbk-dsh-opencode-local-0.2.4.tgz`（或 DSH 插件管理界面选择该 tgz），目标为 **desktop profile**。
2. **完全退出 DSH 再重开**（不是关窗口，是退出进程）。
3. 设置页出现 **opencode-local** 卡片即成功；模型选择器里出现免费模型。
4. 卸载：DSH 插件管理里移除本插件，完全退出重开。
5. 回退：历史包在仓库 `plugin/` 目录——`0.2.3.tgz`（已验收）、`0.2.2.tgz`（已验收）、`0.2.1.tgz`（有已知缺陷，仅备查）。装旧包同样需完全退出重开。

## 设置页

### 「可用模型」tab
- 只列**免费模型**（serve 成本元数据全 0 才列），显示上下文窗口（如 `1.05M`）。
- 每个模型一个**可见性复选框**，默认全可见；顶端按钮一键全选/全不选。勾掉的模型不进选择器。
- **刷新**只重新拉取模型元数据，**不发任何模型推理请求**（0.2.2 起探测功能已废除）。

### 「可用工具」tab
- **总开关默认关**：关闭时模型只能纯文本对话。
- 打开后按**动作白名单**放行：`shell / edit / read / webfetch / websearch / grep / glob / external_directory` 逐项勾选。**完全允许** = 不做任何检查：所有工具请求一律放行（含未列出的动作、工作目录外访问），每回合次数上限不生效；风险全部由你承担，取消勾选立即恢复管控。
- **每回合次数上限**默认 20（1–1000），防失控；仅在未勾选「完全允许」时生效。
- 工具活动（`[工具]/[完成]/[失败]`）在 DSH 里**折叠为思考行**，可展开；正文不受影响。
- 插件会话固定使用 opencode 的 **build** 模式，不受 TUI 当前模式影响。

### 思考档位
输入框右侧控件，档位来自当前模型实时上报的 `variants`；默认 default，无效选择自动回退 default。

## 数据与日志

| 位置 | 内容 |
| --- | --- |
| `~/.dsh-opencode-local/catalog.json` | 模型元数据缓存（无凭据） |
| `~/.dsh-opencode-local/serve.log` | 插件 serve 子进程输出（实测恒空，无旋转） |
| `~/.local/share/opencode/` | opencode 自己的数据库与日志，**凭据在这里，插件直接复用、不复制** |

## 注意事项

- **工具在你本机真实执行**（跑命令、读写文件）。白名单是风险手闸：只勾你信任的动作。
- 白名单**按动作、不按资源**：放行 `read` 后 `.env` 等敏感文件也可被读取；放行 `shell` 等于允许任意命令。请按需最小勾选。
- UI 未列出的动作（`subagent`、`skill`、`question` 等）只能经「完全允许」放行；不勾 = 一律拒绝（安全方向）。`external_directory`（工作目录外文件访问）已列入清单，可单独勾选。
- 个别情况下工具审批回复失败会导致该回合挂起，看门狗约 120 秒后报超时错误，DSH 会自动重试（最多 4 次）。
- 错误消息可能带上游响应的前 300 字，仅显示给你本人。
- 插件自启的 serve 用 **4096 起**的端口；机器上常驻的 `opencode serve --service`（**28894**）是另一个进程，互不影响，别混。
- 对外 API 默认关闭、只听 127.0.0.1；其 token 在 DSH 配置中明文存储（宿主行为）。静默保留期间不建议开启。

## 故障速查

| 症状 | 处置 |
| --- | --- |
| 模型全显示不可用 | 那是 0.2.1 旧探测时代的固化缓存，0.2.2 起已废除探测；升级后点「刷新」即可。**不是额度用完、不是要重新登录** |
| 发对话 30 秒无首事件 / 流中断 120 秒 | 看门狗报错并重试；持续出现查 `serve.log` 与 opencode 自身日志 |
| 提示 restart budget exhausted | serve 连续重启 3 次失败；检查 opencode CLI 本体能否手动 `opencode serve` 启动 |
| 回合结束无任何正文（EMPTY_RESPONSE） | 可重试错误，DSH 自动重试；多发生于模型只输出了工具笔记的回合 |
| 提示工具被禁用但你已勾选放行 | 本版本起跨目录访问对应 `external_directory` 动作：单独勾选它，或勾「完全允许」。旧版本此动作不在清单里，只能靠完全允许 |

## 构建（开发者）

```bash
cd plugin
npm install
npm run typecheck   # 双项目 tsc
npm run build       # tsdown → lib/
npm pack            # 生成 tgz（README 自动随包）
```

真实对话回归：`node docs/impl-harness/run-all.mjs`（h1–h5，对话预算 ≤5；运行产物在 temp/，可随时删）。
===== END FILE: plugin/README.md =====

===== BEGIN FILE: docs/impl-harness/lib.mjs (trailing-newline: yes) =====
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { ServeManager, defaultManagerConfig } from '../../plugin/src/serve/manager.ts'
import { ModelCatalog } from '../../plugin/src/catalog/models.ts'
import { LocalAdapter } from '../../plugin/src/adapter/local-adapter.ts'
import { UserActivity } from '../../plugin/src/priority.ts'

export const H = path.dirname(fileURLToPath(import.meta.url))
export const RAW = path.join(H, '..', '..', 'temp', 'impl-harness-results')
export const BUDGET = { used: 0, cap: 12 }

export function makeRuntime() {
  const activity = new UserActivity()
  const policy = { mode: 'off', allow: [], allowAll: false, maxPerTurn: 20 }
  const manager = new ServeManager(defaultManagerConfig({ opencodePath: '', portBase: 4096, dataDir: path.join(H, '..', '..', 'temp', 'impl-harness-data') }))
  const catalog = new ModelCatalog(manager, { cachePath: path.join(H, '..', '..', 'temp', 'impl-harness-data', 'catalog.json') })
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
===== END FILE: docs/impl-harness/lib.mjs =====

===== BEGIN FILE: docs/impl-harness/h2-tools.mjs (trailing-newline: no) =====
import { check, collectStream, firstModel, record, spend } from './lib.mjs'

export async function run(runtime) {
  runtime.policy.mode = 'allowlist'
  runtime.policy.allow = ['shell']
  runtime.policy.allowAll = false
  runtime.policy.maxPerTurn = 20
  const model = firstModel(runtime)
  check('h2 model', model.length > 0, 'no selectable model')
  spend()
  const r = await collectStream(runtime.adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the shell tool to run: echo p2-impl. Then report the output.' }] }],
  }))
  check('h2 finish', r.finish !== null, 'no finish')
  check('h2 no tool-call blocks', r.toolBlocks === 0, String(r.toolBlocks))
  const approved = runtime.adapter.diagnostics.toolApproved
  const branch = approved > 0 ? 'tool-approved' : 'no-tool'
  if (branch === 'tool-approved') {
    const reasoningText = r.chunks.filter((c) => c.type === 'block-end' && c.block.type === 'reasoning').map((c) => c.block.text).join('')
    check('h2 tool activity as reasoning', reasoningText.includes('[工具]'), 'tool note not in reasoning blocks')
  }
  record('h2-tools', { model, branch, approved, finish: r.finish, textHead: r.text.slice(0, 160), diag: runtime.adapter.diagnostics })
  return branch
}
===== END FILE: docs/impl-harness/h2-tools.mjs =====

===== BEGIN FILE: docs/impl-harness/h5-allow-all.mjs (trailing-newline: yes) =====
import { check, collectStream, firstModel, record, spend } from './lib.mjs'
import { liveToolPolicy } from '../../plugin/src/config.ts'
import { TOOL_ACTIONS } from '../../plugin/src/client/status-paths.ts'
import { serveRequest } from '../../plugin/src/serve/client.ts'

export async function run(runtime) {
  check('h5 allowAll on+star', liveToolPolicy({ toolMode: true, toolAllowlist: ['*'] }).allowAll === true, 'allowAll not derived')
  check('h5 allowAll master-off', liveToolPolicy({ toolMode: false, toolAllowlist: ['*'] }).allowAll === false, 'allowAll leaked with master off')
  check('h5 allowAll no-star', liveToolPolicy({ toolMode: true, toolAllowlist: ['shell'] }).allowAll === false, 'allowAll without star')
  check('h5 allowAll empty', liveToolPolicy({}).allowAll === false, 'allowAll on empty config')
  check('h5 external_directory listed', TOOL_ACTIONS.includes('external_directory'), 'action missing from UI list')
  runtime.policy.mode = 'allowlist'
  runtime.policy.allow = ['*']
  runtime.policy.allowAll = true
  runtime.policy.maxPerTurn = 1
  const model = firstModel(runtime)
  check('h5 model', model.length > 0, 'no selectable model')
  const approvedBefore = runtime.adapter.diagnostics.toolApproved
  const rejectedBefore = runtime.adapter.diagnostics.permissionRejected
  spend()
  const r = await collectStream(runtime.adapter.stream({
    provider: 'opencode-local',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the shell tool to run: echo h5-a. Then use the shell tool a second time to run: echo h5-b. Then report both outputs.' }] }],
  }))
  check('h5 finish', r.finish !== null, 'no finish')
  check('h5 no tool-call blocks', r.toolBlocks === 0, String(r.toolBlocks))
  const approved = runtime.adapter.diagnostics.toolApproved - approvedBefore
  const rejected = runtime.adapter.diagnostics.permissionRejected - rejectedBefore
  check('h5 zero rejections', rejected === 0, String(rejected))
  const branch = approved >= 2 ? 'cap-bypassed' : approved === 1 ? 'single-tool' : 'no-tool'
  const sid = runtime.adapter.diagnostics.sessions[runtime.adapter.diagnostics.sessions.length - 1]
  const ep = await runtime.manager.ensureReady()
  const sres = await serveRequest(ep, 'GET', '/api/session/' + sid)
  const agent = sres.json?.data?.agent
  check('h5 pinned agent build', sres.status === 200 && agent === 'build', JSON.stringify({ status: sres.status, agent }))
  record('h5-allow-all', { model, branch, approved, rejected, maxPerTurn: 1, agent, finish: r.finish, textHead: r.text.slice(0, 160), diag: runtime.adapter.diagnostics })
  return branch
}
===== END FILE: docs/impl-harness/h5-allow-all.mjs =====

===== BEGIN FILE: docs/impl-harness/run-all.mjs (trailing-newline: no) =====
import fs from 'node:fs'
import path from 'node:path'
import { RAW, makeRuntime } from './lib.mjs'
import * as h1 from './h1-free-filter.mjs'
import * as h2 from './h2-tools.mjs'
import * as h3 from './h3-stream.mjs'
import * as h4 from './h4-api.mjs'
import * as h5 from './h5-allow-all.mjs'

const summary = { startedAt: new Date().toISOString(), results: {}, failed: [] }
const runtime = makeRuntime()
try {
  for (const [name, mod] of [['h1', h1], ['h2', h2], ['h3', h3], ['h4', h4], ['h5', h5]]) {
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
===== END FILE: docs/impl-harness/run-all.mjs =====

---

## §6 验证（Lead 独占，严格串行 V0→V6）

### 6.0 工具脚本（Lead 在 P0/P3 先把以下两个脚本原样存到 temp/，再运行）

**V0 基线核对脚本** → 存为 `temp/v0-baseline.mjs`，仓库根运行 `node temp/v0-baseline.mjs`。任何 BASE-DRIFT → 停止报告。

```js
import fs from 'node:fs'
import crypto from 'node:crypto'
const expected = {
  'plugin/src/serve/client.ts': '3A7F14E906BD4098B43D5E70C0668ABDDB1F23563E6613325FEEEA94D6A3C26B',
  'plugin/src/types.ts': '7C2F7C00A5C9FAD00CA03E9BFA614FBB33C6333C01192976B1E93EE2BB145C98',
  'plugin/src/config.ts': 'B0649A038B7D4F806253D5C1737BCCDDC8E2904817B561C73D67DD67536A62A3',
  'plugin/src/adapter/turn.ts': '223B7465178FE890283A2F226700B206FDDA8227EDABE8FDAA54E19EAE9225B3',
  'plugin/src/adapter/flatten.ts': 'B2E52D1CEF05B450AF9A2ACDBD32368D10B2AB594873F41E74269980E2D3D0EE',
  'plugin/src/client/status-paths.ts': '3ECE6C59DF88D857499558B9C2D4F292C2130FBCF8A6716C3767B0A90A7C9CA6',
  'plugin/src/client/locales.ts': 'B59EE56BEC33F3ACB3FA0CB2D9025A7C31313A18D0692ACBB4E0723A7C7909CB',
  'plugin/src/client/ToolsTab.tsx': 'A4782E66341A9D5304EFF6BB55335D48E9AD35252BC65610E3C2EDA581C05DFA',
  'plugin/package.json': 'E947C5D28626511E4AD4E287A5E702ECD149FDF3E65B43319A1A6E8C52F9205F',
  'plugin/README.md': '19D184C3AC735BB0DDC2E9390E7206EFA391CA7B6F7D701F058EAB1A0051AB6C',
  'docs/impl-harness/lib.mjs': 'C450198E6EAEB343AFAAAED0C6D7E03A9E91ADFDA8D369B13365224C59E9CE5E',
  'docs/impl-harness/run-all.mjs': '523BCFC4EF53E60413293A75F3C54D5FC2D3B8DACEE45E9747AEC9B190C10681',
  'docs/impl-harness/h2-tools.mjs': '193D8B410F5CBC4B4289147630202B2C59951447071AE808E9AD55112636B696',
}
let fail = 0
for (const [rel, want] of Object.entries(expected)) {
  const got = crypto.createHash('sha256').update(fs.readFileSync(rel)).digest('hex').toUpperCase()
  const ok = got === want
  if (!ok) fail++
  console.log(ok ? 'BASE-OK' : 'BASE-DRIFT', rel)
}
console.log('V0', JSON.stringify({ fail }))
if (fail > 0) process.exitCode = 1
```

**V1 逐字节比对脚本** → 存为 `temp/v1-verify-files.mjs`，仓库根运行 `node temp/v1-verify-files.mjs`。它从本文件提取 13 个内嵌块到 `temp/expected/`，与实际文件比 SHA256。必须 13/13 PASS 且 count=13。

```js
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const root = process.cwd()
const plan = fs.readFileSync(path.join(root, 'temp', 'debug.md'), 'utf8').replace(/\r\n/g, '\n')
const beginRe = /^===== BEGIN FILE: (.+) \(trailing-newline: (yes|no)\) =====$/gm
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').toUpperCase()
const expectedDir = path.join(root, 'temp', 'expected')
let m
let fail = 0
let count = 0
while ((m = beginRe.exec(plan)) !== null) {
  const rel = m[1]
  const flag = m[2]
  const start = m.index + m[0].length + 1
  const endMarker = '===== END FILE: ' + rel + ' ====='
  const end = plan.indexOf(endMarker, start)
  if (end < 0) { console.log('MISSING-END', rel); fail++; continue }
  const raw = plan.slice(start, end)
  if (!raw.endsWith('\n')) { console.log('BAD-BLOCK', rel); fail++; continue }
  const content = flag === 'yes' ? raw : raw.slice(0, -1)
  const bytes = Buffer.from(content, 'utf8')
  const expPath = path.join(expectedDir, rel)
  fs.mkdirSync(path.dirname(expPath), { recursive: true })
  fs.writeFileSync(expPath, bytes)
  count++
  const actPath = path.join(root, rel)
  if (!fs.existsSync(actPath)) { console.log('MISSING-FILE', rel); fail++; continue }
  const act = fs.readFileSync(actPath)
  const ok = sha(act) === sha(bytes)
  if (!ok) fail++
  console.log(ok ? 'PASS' : 'FAIL', rel, 'expected=' + sha(bytes), 'actual=' + sha(act))
}
console.log('VERIFY-FILES', JSON.stringify({ count, fail }))
if (fail > 0 || count !== 13) process.exitCode = 1
```

### 6.1 验证序列（每步通过才进下一步；失败按 §8 处置）

| 步 | 命令（工作目录） | 通过判据 |
| --- | --- | --- |
| V1 | `node temp/v1-verify-files.mjs`（仓库根） | 13 行 PASS，`{"count":13,"fail":0}` |
| V1b | `git diff`（仓库根） | 每个 hunk 与 §4.1 差异表逐条对应；无表外改动；flatten.ts 等守卫文件零 diff |
| V2 | `npm run typecheck`（plugin/） | 双项目 tsc 0 错 |
| V3 | `npm run build`（plugin/） | 生成 lib/index.js 与 lib/client.js，无错误 |
| V4 | `node docs/impl-harness/run-all.mjs`（仓库根） | `allPassed:true`；h1–h5 全 ok；对话预算 used=5（h2=1,h3=1,h4=2,h5=1）；h2 branch=tool-approved 时 reasoning 含 `[工具]`；**h5 branch 期望 `cap-bypassed`**（maxPerTurn=1 却放行 ≥2 次 = 上限短路实证），且 h5 `agent:"build"`、`rejected:0` |
| V5 | `npm pack`（plugin/） | 生成 `hbk-dsh-opencode-local-0.2.4.tgz`；记录字节数与 SHA1；`tar -tzf` 恰 5 条目（package.json、README.md、cordis.patch.yml、lib/index.js、lib/client.js）；解包核对 lib 两文件与 V3 产物哈希一致 |
| V6 | `git status --porcelain`（仓库根）+ 残留扫描 | 见 6.2 |

**V4 补充规则**：
- h5 branch 为 `single-tool` 或 `no-tool`（模型没配合调两次工具）→ 单独重跑 h5（命令如下），最多重试 2 次（每次 +1 预算，总 used ≤7）；仍非 cap-bypassed → 停止，把 record 交人工裁决，不得改测试断言迁就结果。
  ```
  node -e "import('./docs/impl-harness/lib.mjs').then(async ({makeRuntime})=>{const rt=makeRuntime();const h5=await import('./docs/impl-harness/h5-allow-all.mjs');try{console.log('H5',await h5.run(rt))}finally{await rt.manager.dispose()}})"
  ```
- h5 `pinned agent build` 失败 → 上游契约漂移，停止，读 `D:\opencode` 复核后重新出方案。
- 任何 h 失败都不得跳过后续验证；run-all 本身遇错即停（既有逻辑）。

### 6.2 V6 终态核对

`git status --porcelain` 必须**恰好**是以下集合（顺序不限；`??` 为新增）：

```
 M docs/handoff.md                                        ← 基线遗留，不许动
 M docs/impl-harness/h2-tools.mjs
 M docs/impl-harness/lib.mjs
 M docs/impl-harness/run-all.mjs
 M plugin/README.md
 M plugin/hbk-dsh-opencode-local-0.2.3.tgz                ← 基线遗留，不许动
 M plugin/package.json
 M plugin/src/adapter/turn.ts
 M plugin/src/client/ToolsTab.tsx
 M plugin/src/client/locales.ts
 M plugin/src/client/status-paths.ts
 M plugin/src/config.ts
 M plugin/src/serve/client.ts
 M plugin/src/types.ts
?? docs/impl-harness/h5-allow-all.mjs
?? plugin/hbk-dsh-opencode-local-0.2.4.tgz
```

（lib/ 与 temp/ 被 .gitignore 忽略，不出现在列表中；若出现即异常。）

残留扫描（全部必须 0 命中）：
- `Select-String -Path plugin\src\client\locales.ts -Pattern '每回合次数上限仍单独生效'`
- `Select-String -Path plugin\package.json -Pattern '"version": "0.2.3"'`
- `Select-String -Path plugin\src\adapter\turn.ts -Pattern "'always'"`（replyDecision 调用实参不得为 always；类型签名在 client.ts，不在扫描范围）
- `Select-String -Path plugin\src\client\status-paths.ts -Pattern 'external_directory'` 必须 **1 命中**（反向确认）。

---

## §7 打包与人工实机验收

### 7.1 交付物

- `plugin/hbk-dsh-opencode-local-0.2.4.tgz`（V5 产物，含 README）。
- 验证记录：`temp/impl-harness-results/summary.json` 与各 h*.json（scratch，验收后由 Lead 摘录进实施记录）。

### 7.2 人工验收清单（desktop profile，完全退出 DSH 再重开）

| # | 操作 | 期望 |
| --- | --- | --- |
| A1 | 安装 0.2.4，重启，打开设置 → 可用工具 | 出现 `external_directory` 行；勾「完全允许」后次数上限输入框变灰、单项复选框变灰 |
| A2 | 勾「完全允许」，发起对话让模型读取 **serve 工作目录之外** 的文件（复现原 bug：如 `D:\CPS-GDAA_airport2\docs\` 下任一 .md） | 读取成功，不再出现 "tools are disabled or not allowed in this channel" |
| A3 | 把次数上限改为 1，保持「完全允许」，发起需要 ≥2 次工具的对话 | 工具照常多次执行（上限不生效） |
| A4 | 取消「完全允许」，只勾 `read`，再发起跨目录读取 | 被拒绝（管控立即恢复）；Lead 用只读 sqlite 查 `opencode.db` permission 表仍为 0 行（once 不落库实证） |
| A5 | 只勾 `external_directory` + `read`（不开完全允许），跨目录读取 | 成功（D5 单独勾选生效） |
| A6 | 回归：普通纯文本对话、工具笔记折叠为思考行、模型列表与显隐、思考档位 | 与 0.2.3 一致 |
| A7 | （可选）TUI 切到 plan 模式后，用插件发起对话 | Lead 查 DB：新 dsh-* 会话 agent='build'（模式固定实证） |

任何一项不过 → 回退 `0.2.3.tgz`（仍在 plugin/），报告现象，进入 debug 迭代（新的差异施工图）。

### 7.3 验收通过后

Lead 按 §9 收尾；git 提交与归档仍由人工接管（本项目纪律）。

---

## §8 故障矩阵

| 症状 | 判定 | 处置 |
| --- | --- | --- |
| V0 BASE-DRIFT | 基线漂移（有人动过文件） | **停止**，报告漂移文件，重新核基线出方案；不得在漂移基线上施工 |
| P1 探测失败/无派发能力 | 环境不支持并行 | 串行回退（§1.4），产物不变 |
| W 回报超时/失败 | 执行者异常 | Lead 亲自补写该清单文件，不重派 |
| V1 FAIL | 落盘字节不符（含 CRLF 污染、末尾换行错） | Lead 按 §1.6 规则重写该文件，重跑 V1；禁止"差不多就行" |
| V1b 出现表外 hunk | 执行者越权改动 | Lead 用 `git diff` 定位，恢复该文件到基线后按内嵌块重写 |
| V2 typecheck 错 | 内嵌块转录错误或依赖缺失 | 先查 plugin/node_modules（P0 第 7 条）；再对照 §4.1 逐块核对；只修转录错误，不改设计 |
| V4 h5 agent 检查失败 | 上游契约漂移 | 停止，读 D:\opencode 复核 session.create/session.get，重新出方案 |
| V4 h5 branch 非 cap-bypassed | 模型未配合 | 按 6.1 重试规则（≤2 次）；仍不行交人工裁决 |
| V4 其他 h 失败 | 回归 | 停止，保留 summary.json，出 debug 迭代方案；不得改断言迁就 |
| V5 包内 lib 与构建产物不一致 | 打包异常 | 重新 npm pack；仍不一致停止报告 |
| A2/A3 实机不过 | 设计或上游行为偏差 | 回退 0.2.3，收集 serve.log 与 DB 证据，重新出方案 |

---

## §9 收尾文档（构建/打包/安装完成、人工实机验收通过后，Lead 串行执行）

1. 新建 `docs/P2/impl-notes-0.2.4-r2.md`（避开与 11-11 否决记录 `impl-notes-0.2.4.md` 同名覆盖），必含：执行日期与模式（并行/串行回退）、13 文件变更摘要、V1–V6 结果（含 h5 branch、预算 used）、tgz 字节数与 SHA1、lib 两文件 SHA256、安装验证结果、人工验收 A1–A7 结果、同号版本冲突说明、回滚命令、遗留事项。
2. 更新 `docs/handoff.md`：§4 的 0.2.4 条目后追加「2026-11-13 复用 0.2.4 号实现 A+B 修复（与 11-11 否决版不同内容）」；§8 安装包指针改为 0.2.4.tgz（记录新 shasum）；§10 维护触发点不变；§12 后追加本次记录指针。
3. 更新 `docs/plan.md` §7 当前状态：0.2.4（2026-11-13 重打包）已构建/打包/安装至 desktop profile，**待完全退出重开后人工实机验收**（实机通过前不得写「已验收」）。
4. 本文件 `temp/debug.md` 由 Lead 归档至 `docs/P2/code-debug-0.2.4.md`（与 0.2.2 施工图并列，避免 temp 被整删丢失）；temp/ 其余产物为 scratch，可随时删。
5. 不做 git 提交（人工接管）。

---

## 附录 A 上游事实核对（只读证据，制定本方案时已核实）

| 事实 | 证据（D:\opencode，git 101776024c） |
| --- | --- |
| session.create 支持 agent 字段 | packages/protocol/src/groups/session.ts:167-176（payload 含 `agent: Agent.ID.pipe(Schema.optional)`） |
| 默认 agent 为 build | packages/core/src/agent.ts:13（`defaultID = ID.make("build")`）、:55-64（selectedDefault 回落链） |
| build agent 无 deny 规则，仅 question:allow | packages/core/src/plugin/agent.ts:56-61 |
| plan agent 含 edit:deny（本次固定 build 即避开） | packages/core/src/plugin/plan.ts:38-40 |
| 跨目录访问先请求 external_directory 再请求 read | packages/core/src/file-access.ts:120-137、:148-154 |
| 权限合并 flat + findLast，会话 ASK_ALL 排最后 → 插件仍是唯一裁决点 | packages/core/src/permission.ts:169-174（configured/merge）、evaluate（findLast） |
| Reply 枚举 once/always/reject | packages/schema/src/permission.ts:42 |
| always 会持久化规则到 permission 表（故禁用） | packages/core/src/permission.ts:340-346 |
| session.get 端点存在（h5 用它验证 agent） | packages/protocol/src/groups/session.ts:234-240 |
| 实证：插件会话 agent=None、assistant 实际 build；被拒工具 error=permission.rejected 且消息为插件 REJECT_MESSAGE | opencode.db session_v2 / session_message（2026-11-12 查询，会话 ses_e303222acffefBToyXWZ23GTIO：12 次目录内工具成功后，14 次跨目录 read 全拒） |

## 附录 B 预算与纪律

- 对话预算：run-all 期望 used=5，硬上限 BUDGET.cap=12；h5 重试最多 +2。任何超出 → 停止报告。
- 验证严格串行；施工并行仅限 P2 落盘阶段。
- 参考源码（D:\opencode、D:\deepseek-harness）只读。
- 稳定优先：本方案不做任何"聪明但脆"的优化；fallback 分支保留 '*' 匹配是有意兼容，不是冗余。
- 阶段门：本文件未经人工批准，任何执行者不得开始 P0 之后的动作。
