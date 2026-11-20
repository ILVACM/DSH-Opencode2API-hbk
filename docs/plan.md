# 0.2.8-3 迭代计划：插件彻底退出上下文压缩（plan.md）

> 状态：**计划已经人工审核批准（2026-11-20，分歧点全部采纳执行者推荐）；待人工下达施工指令后执行（未改代码、未打包、未安装、未提交 git）**。
> 版本：**0.2.8-3**（命名规则 `0.2.8-x`；已经人工确认）。
> 历史文件定位：本文件上一版是 0.2.7 修复计划（已执行完毕，后续经 0.2.8 / 0.2.8-1 / 0.2.8-2 三轮）；现按人工 2026-11-20 最新裁决整体重写。
> 修订历史：
> - 2026-11-20：重写为「插件退出上下文压缩」迭代计划；新增版本命名规则与打包/安装机械预检流程。
> - 2026-11-20：**人工审核通过**，三个分歧点（版本号 0.2.8-3 / compaction-basic+nvidia 保留 / compaction.json 残留不删）全部采纳执行者推荐，见 §5。

---

## §0 背景与人工裁决

**背景（结论已实证）**：0.2.5→0.2.8-2 一路尝试让插件接管/改道上下文压缩（`llm/stream` 事件拦截 → compaction.json 偏好 → global 监听器 → compaction-basic 原生配置），最终证明**插件侧方案不可行**：跨工作区会话的压缩请求不经过插件 fiber 的监听器，任何插件内拦截都无法全覆盖。且当前实际安装的 0.2.8-2 仍带着**诊断版监听器**（往 `temp/llm-diag.log` 写日志），handoff §18/§19「已移除监听器与压缩偏好存储」的描述与代码实况不符。

**人工裁决（2026-11-20，本计划唯一依据）**：

| # | 裁决 |
| --- | --- |
| 1 | **插件彻底退出上下文压缩**：不再做压缩模型选择、压缩触发、压缩请求拦截/改道；压缩由人工另行方案接管 |
| 2 | 设置页「压缩上下文」tab 改为「**上下文状态**」：**保留**上下文用量监测显示（只读）；**删除**压缩模型选择器与「压缩上下文」按钮及全部后端压缩逻辑 |
| 3 | **版本命名规则改为 `0.2.8-x`**（如 0.2.8-3）。四段式 `0.2.8.x`（如 0.2.8.1）不是合法 semver，pnpm 拒绝——此前未做安装前校验属流程缺陷，本轮起**打包/安装前必须过机械预检**（见 §3 步骤 6），不再依赖人工兜底 |

---

## §1 现状盘点（2026-11-20 只读核实，零修改）

- **UI 侧已符合裁决**：`CompactionTab.tsx` 已是纯「上下文状态」展示（无选择器/无按钮，30s 自动刷新）；`locales.ts` `tab.compaction` 已是「上下文状态 / Context status」；`web/routes.ts` 的 `/context` 状态路由在、压缩偏好路由已不在。
- **后端仍有压缩残留（本轮要清的对象）**：
  - `plugin/src/index.ts`：`llm/stream` 监听器整块仍在（61–101 行），内含**诊断代码**（`diagPath = 'D:/DSH-Opencode2API-hbk/temp/llm-diag.log'`，`fs.appendFileSync`）；并引用 `readCompactionFile`（compaction-store）、`applyCompactionRoute`（config）、`compactionPath`（compaction.json）。
  - `plugin/src/compaction-store.ts`：整文件仍在。
  - `plugin/src/config.ts`：`applyCompactionRoute`（122–141 行）仍在。
  - `plugin/README.md`：第 42 行仍描述「压缩模型偏好存 compaction.json」。
- **已装版本 = 诊断版**：web profile 已装 0.2.8-2 的 `lib/index.js` 含 `llm-diag` 标记（1619 行），与仓库构建产物一致；**DSH 正在运行**（端口 3080，进程 "DeepSeek Harness"），诊断日志持续写入。⇒ 本轮安装后照例须**完全退出并重启 DSH** 再验收。
- **patch 无关**：插件自带 `plugin/cordis.patch.yml` 无任何压缩引用；profile 侧 `cordis.patch.yml` 的 compaction-basic（`summarizationProvider: nvidia / nemotron-3-ultra-550b-a55b`）是**DSH 原生压缩配置**（环境侧，属人工接管的现成挂载点），本插件安装流程不碰它。
- **保留不动（易误删，特此列明）**：`adapter/flatten.ts`、`adapter/turn.ts`、`types.ts` 中的 compaction **请求形态**处理——DSH 原生压缩请求仍可能流经适配器，这是「按 DSH 发来的请求形状正确执行」，不是插件做压缩策略；以及 `client/status-paths.ts`、`client/CompactionTab.tsx`、`client/locales.ts`、`client/OpencodeLocalCard.tsx`（tab 内部 id 仍叫 `compaction`，纯内部键名，不改）。

---

## §2 变更清单（确定性；文件少，主执行者直接串行落盘，无需多 agent）

| # | 文件 | 动作 | 内容 |
| --- | --- | --- | --- |
| **C1** | `plugin/src/index.ts` | 删除 | ① `llm/stream` 监听器整块（现 61–101 行，含 `diagPath`/`diag` 诊断代码）；② `import { readCompactionFile } from './compaction-store.ts'`（第 9 行）；③ config import 中的 `applyCompactionRoute,`（第 6 行）；④ `const compactionPath = join(dataDir, 'compaction.json')`（第 42 行）；⑤ 随之失效的 `import fs from 'node:fs'`（第 3 行，仅诊断使用）；⑥ `PluginContext` 接口中的 `on?` 字段（第 23 行，监听器移除后无意义）。**保留**：adapter 注册、settings inject、web 路由、API、catalog 刷新、dispose 清理，一行不动 |
| **C2** | `plugin/src/config.ts` | 删除 | `applyCompactionRoute` 函数及其文档注释（现 122–141 行）；文件内无其他压缩引用 |
| **C3** | `plugin/src/compaction-store.ts` | 删除整文件 | 压缩偏好存储随插件退出压缩一并移除 |
| **C4** | `plugin/README.md` | 改写 | 压缩相关段落改为：插件**不做**上下文压缩；「上下文状态」tab 仅展示用量；压缩由 DSH 侧/人工接管（profile patch 已预置 compaction-basic + nvidia，供接管使用/调整） |
| **C5** | `plugin/package.json` | 版本号 | `0.2.8-2` → **`0.2.8-3`**（已经人工确认；过 §3 预检 a） |
| **C6** | `docs/impl-harness/h6-compaction.mjs` | 裁剪 | 删除 `applyCompactionRoute`/`compaction-store` 的 import 与相关断言（absent-store 回落、rerouted、plain untouched、equal no-op 四段）；**保留**：402/429 失败分类、压缩 prompt 形态（flattenCompaction）、adapter 处理压缩请求行为（工具零放行 / `compact-` 标题 / build agent）——这些测的是**保留的适配器能力** |
| **C7** | `docs/impl-harness/h7-compaction-ui.mjs` | 裁剪+补强 | 删除 `applyCompactionRoute` 路由语义段及其 import；**保留**路径常量断言；**新增** locales 断言：`tab.compaction` 中文 =「上下文状态」、英文 = `Context status`（守住改名不回退）。文件名不改（避免动 run-all.mjs） |

**明确不动**：`cordis.patch.yml`（插件自带与 profile 侧均不动）、依赖清单、`adapter/*`、`serve/*`、`catalog/*`、`api/*`、其余 client 文件、`run-all.mjs`、git（人工接管）。

---

## §3 施工与验证流程（含新增机械预检）

1. **施工**：按 §2 C1–C7 串行落盘。
2. **类型检查**：`npm run typecheck` 双 tsconfig 退出码 0。
3. **构建**：`npm run build` 退出码 0；`lib/` 无新增外部包。
4. **回归**：`node docs\impl-harness\run-all.mjs` → `allPassed:true`（h1–h7，h6/h7 为裁剪后版本）。
5. **打包**：`npm pack` → `hbk-dsh-opencode-local-0.2.8-3.tgz`。
6. **机械预检（新增；任何一项不过即停止安装，无需人工兜底）**：
   - a. **版本号 semver 校验**：必须匹配 `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`，**四段式直接拒绝**（针对 0.2.8.1 事故的流程修复）；
   - b. 包内条目数 = 5；记录字节数与 SHA256；
   - c. 包内 `lib/index.js`、`lib/client.js` 与构建产物**逐字节一致**；
   - d. 包内 README 含「插件不做上下文压缩 / 上下文状态」新表述。
7. **安装**：备份 web `cordis.patch.yml` → `dsh plugin --profile web add file:…0.2.8-3.tgz` → 校验已装版本号 = 0.2.8-3、已装 lib 哈希 = 构建哈希、patch 字节不变。
8. **重启 DSH**（⚠️ 硬性：host 不热重载，`dsh plugin add` 后必须完全退出并重启）→ 人工实机验收 §4。
9. **收尾**：更新 `docs/handoff.md`（新增本轮记录；**修正 §18/§19 与代码实况不符的描述**；补记命名规则与预检流程）；新建 `docs/P2/impl-notes-0.2.8-3.md`；**不提交 git**。

---

## §4 待人工实机验收（重启后）

| # | 项 | 期望 |
| --- | --- | --- |
| 1 | 设置页 opencode-local 卡片 | tab 显示「**上下文状态**」，读数正常且自动刷新；**全页无**压缩模型选择器、无「压缩上下文」按钮 |
| 2 | `temp/llm-diag.log` | **不再增长**（监听器确已移除的客观证据；该文件属 temp scratch，可随手删） |
| 3 | 切换聊天模型 | 不再出现压缩相关的 `deepseek-official` key 错（压缩已归 DSH 侧/人工接管） |
| 4 | 回归 | 普通聊天、流式、工具 allowAll、模型列表、（冻结的）对外 API 均与 0.2.8-2 一致 |
| 5 | `cordis.patch.yml` | 安装前后字节级一致 |

---

## §5 已裁决事项（2026-11-20 人工确认，全部采纳执行者推荐）

1. **版本号 = `0.2.8-3`**。
2. **profile 侧 compaction-basic + nvidia 压缩配置保留不动**：作为人工接管压缩的现成挂载点；是否调整由人工后续决定，插件不碰。
3. **运行时残留文件 `~/.dsh-opencode-local/compaction.json` 留在原地不删**（无害，符合「卸载残留接受」先例）。

## §6 停工声明

- 计划已获人工批准（2026-11-20）。**在收到人工明确的施工指令之前保持停工：不修改代码、不构建、不打包、不安装、不提交 git。**
- 收到施工指令后：按 §2 清单直接落盘（文件少，主执行者串行即可）、按 §3 验证与安装；无需另行出施工图，除非人工要求。
