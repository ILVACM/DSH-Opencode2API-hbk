# 0.2.4（2026-11-13 重打包）实施记录 — A+B 修复

> 执行日期：2026-11-13（Asia/Shanghai）。基线：0.2.3（已验收）。目标：**0.2.4**（人工裁决复用该号）。
> 施工图：`docs/P2/code-debug-0.2.4.md`（由 `temp/debug.md` 归档）。模式：**并行**（P1 能力探测成功，W1–W6 六执行者）。
> ⚠️ **同号不同内容**：11-11 曾有一个 0.2.4 实测否决并回退（记录 `docs/P2/impl-notes-0.2.4.md`，保留不动）。本版本是 2026-11-13 全新构建的 A+B 修复，与其**无任何代码继承关系**。

## 需求与根因

1. 插件创建 opencode 会话时未传 `agent`，上游默认回落 `build`（并非 plan 模式）。用户观察「像一直处于 plan 模式」的真因是：跨工作目录访问触发上游额外动作 `external_directory`（`D:\opencode\packages\core\src\file-access.ts:148`），而旧版动作名/白名单对不上 → 插件按 `reject` 处理，模型收到插件自己的话术 `tools are disabled or not allowed in this channel`。
2. 旧「完全允许」只是 `allow.includes('*')` 恰好匹配全部动作名，仍受动作匹配与每回合次数上限约束，不是真·全放行。

## 人工裁决（2026-11-13）

| # | 裁决 |
| --- | --- |
| D1 | 方案 A：创建会话固定传 `agent: 'build'`，消除模式不确定性 |
| D2 | 方案 B：「完全允许」= **不做任何检查**，所有工具请求一律放行，风险全部由人工承担 |
| D3 | 完全允许时**彻底不计次**（上限失效） |
| D4 | 放行恒用 `decision: 'once'`，**禁止 `'always'`**（上游 always 会把规则永久写入 opencode.db，导致关掉开关后闸门关不回去） |
| D5 | `external_directory` 加入设置页动作清单，可单独勾选 |
| D6 | 版本号用 **0.2.4**（覆盖施工图原定 0.2.5），安装后**不主动重启 DSH**，实机验收由人工重开后进行 |

## 变更清单（13 文件，12 改 1 增）

| 编号 | 文件 | 变更 |
| --- | --- | --- |
| F01 | plugin/src/serve/client.ts | `createSession` 增加 `agent = 'build'` 参数，请求体加 `agent` 字段 |
| F02 | plugin/src/types.ts | `ToolPolicy` 增加 `allowAll: boolean` |
| F03 | plugin/src/config.ts | `liveToolPolicy` 派生 `allowAll = mode && allowList.includes('*')` |
| F04 | plugin/src/adapter/turn.ts | 裁决短路：`policy.allowAll \|\| (原检查链)`；`approved += 1` 仅在非 allowAll 时执行；放行恒 `once` |
| F05 | plugin/src/client/status-paths.ts | `TOOL_ACTIONS` 追加 `external_directory` |
| F06 | plugin/src/client/locales.ts | zh/en 的 allowAllHint、maxPerTurnHint 改写 + 新增 external_directory 键（对称） |
| F07 | plugin/src/client/ToolsTab.tsx | 完全允许时次数上限输入框也禁用 |
| F08 | plugin/package.json | 0.2.3 → **0.2.4** |
| F09 | plugin/README.md | 版本/安装/回退/工具说明/故障速查/回归命令更新 + 同号说明 |
| F10 | docs/impl-harness/lib.mjs | policy 字面量加 `allowAll: false` |
| F11 | docs/impl-harness/h2-tools.mjs | 显式 `runtime.policy.allowAll = false` |
| F12 | docs/impl-harness/h5-allow-all.mjs | **新文件**：零对话预算配置断言 5 项 + 真实对话验证上限短路与 agent 固定 |
| F13 | docs/impl-harness/run-all.mjs | 注册 h5 |

**不变量零改动**：flatten.ts / translate.ts / local-adapter.ts / index.ts / api/server.ts / web/routes.ts / serve/manager.ts / catalog/models.ts / priority.ts / cordis.patch.yml / tsconfig* / tsdown.config.ts（V1b 全部 clean）。配置 Schema 零新增键（`['*']` 即完全允许，allowAll 为派生值不落盘）。

## 执行模式（多 agent 协作）

- P0 预检：V0 13/13 BASE-OK；Node v24.21.0 / npm 11.19.0 / tsdown / typescript / schemastery 齐备。
- P1 能力探测：派一次性子代理写 `temp/parallel-probe.txt` = 恰好 9 字节 `probe-ok\n`，实测 hex `70726f62652d6f6b0a` 全等 → **并行模式**。
- P2：6 个 durable teammate（w1–w6）按不相交文件集并行落盘，全部回报 `DONE` 且哈希与 V1 预期一致（w4 回报消息晚于落盘，V1 已独立验证其两文件正确；Lead 停止其运行以确保验证阶段串行）。
- P3–V6 严格串行，由 Lead 独占执行。

## 验证结果（V1–V6 全通过）

| 步 | 结果 |
| --- | --- |
| V0 基线 | 13/13 BASE-OK，无漂移 |
| V1 逐字节 | **13/13 PASS**，`{"count":13,"fail":0}` |
| V1b git diff | 13 处变更与差异表逐条对应，表外零 hunk，11 个守卫文件 clean |
| V2 typecheck | 双项目 tsc 0 错 |
| V3 build | tsdown 成功：index.js 39.69 kB / client.js 20.23 kB |
| V4 回归 | `allPassed:true`，h1–h5 全 ok；**对话预算 used=5**（h2=1/h3=1/h4=2/h5=1，cap=12） |
| V4 h2 | `branch=tool-approved`，reasoning 含 `[工具]` 断言通过 |
| V4 h5 | **`branch=cap-bypassed`**（maxPerTurn=1 仍放行 3 次工具）、`rejected:0`、**`agent:"build"`**、`finish:stop`；配置断言 5 项通过 |
| V5 打包 | `hbk-dsh-opencode-local-0.2.4.tgz`，**21237 B**，SHA1 **`b83e03b4fe51df0df81c2d72a64ca863e8a065f6`**，npm shasum `b83e03b4…`；`tar -tzf` 恰 5 条目；包内 lib 与构建产物 SHA256 全等 |
| V6 终态 | git 集合符合预期（基线 3 项遗留 + 12 改 + 1 新 tgz + 1 新 h5 + `?? temp/`）；残留扫描：旧版本号 0 命中（README 中 `0.2.3.tgz` 为合法回退清单）、`'always'` 调用实参 0 命中、`external_directory` 1 命中、旧 allowAllHint 0 命中 |

**构建产物 SHA256**：
- `plugin/lib/index.js` = `D093C4263CB062D05948CD994E24669657FEF6F04B6BA83F4B04999285BE979B`
- `plugin/lib/client.js` = `BF0EAAFE8A914234928090F7BCF567EC48584348E9557F922060A3964C99F28E`

## 安装结果（desktop profile，未重启）

命令：`dsh plugin --profile desktop add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.4.tgz`

- pnpm 输出 `- @hbk/dsh-opencode-local 0.2.3` / `+ 0.2.4`，`ADD_EXIT=0`。
- 已装包 version = **0.2.4**；`lib/index.js` 与 `lib/client.js` SHA256 与构建产物**逐字节一致**。
- `package.json` 依赖指向 `file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.4.tgz`。
- `cordis.patch.yml` **整文件未改动**（哈希与装前全等），opencode-local 配置块哈希 `C183C8D5…` 与装前一致；`toolMode:true` / `toolAllowlist:['*']` / `toolMaxPerTurn:30` / `thinkingVariant:max` 全部保留。
- **未杀 DSH 进程、未主动重启**：由人工于 2026-11-13 13:2x 完成重启，重启后新版本生效（见下节实机核验）。

**备份**（`temp/reinstall-backup/`）：`package.json`(1343B)、`pnpm-lock.yaml`(14957B)、`cordis.patch.yml`(72560B)。

**回滚**：恢复上述三个备份文件 → 从 git 恢复 0.2.3 包（`git checkout HEAD -- plugin/hbk-dsh-opencode-local-0.2.3.tgz`，历史 tgz 已于本次人工清理）后执行 `dsh plugin --profile desktop add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.3.tgz` → 完全退出 DSH 重开。

## 环境漂移记录

- `opencode --version` 实测 **v2.2.7**（方案 §2.3 记录为 v2.2.6）。只读复核 `D:\opencode`（git `101776024c`）：`build` 默认 agent、`session.create` 的 `agent` 字段、`Reply` 三值枚举、`session.get` 响应形状均未变；V4 h5 的 `agent:"build"` 实机断言通过，本次不构成阻断。**维护触发点**：将来 opencode 再升级须复核这几处契约。

## 实机验收结果（2026-11-13 人工重启后；人工裁决「按核心项通过关闭」）

重启后只读核验 `opencode.db`（13:25 之后的 `dsh-*` 会话，区别于 13:10–13:11 的 V4 harness 会话）：

| # | 结果 | 证据 |
| --- | --- | --- |
| A1 | ✅ UI 生效（人工确认；数据库侧见 A2/A7） | 重启后大量工具调用成功，非旧版行为 |
| A2 | ✅ **跨目录读取不再被禁** | `execute/shell/read/write/grep/question` 跨工作目录路径（`C:\Users\hbk\.dsh\profiles\desktop\cordis.patch.yml`、`cordis.yml`、`node_modules` 内文件）全部 `status=completed`；全批 `permission.rejected = 0`，未再出现 "tools are disabled or not allowed in this channel" |
| A3 | ✅ 上限不生效 | 13:34 单回合 12+ 次工具调用（含 `write` 写文件）全部 completed；配置 `maxPerTurn=30` 且完全允许 |
| A4 | ⚠️ **未单独实测**（观察项） | 人工配置始终为 `['*']`，未取消勾选；permission 表 0 行证明 once 不落库，取消后可立即恢复管控的技术前提成立 |
| A5 | ⚠️ **未单独实测**（观察项） | 未只勾 `external_directory`+`read`；代码侧 D5 已实现且 V4 h5 配置断言通过 |
| A6 | ✅ 回归正常 | 多轮 `finish=stop` 纯文本对话正常；工具笔记/模型选择等未见异常报告 |
| A7 | ✅ **build 模式固定** | 重启后 7 个 `dsh-glm-5.3-flash-free-*` 会话 `session_v2.agent` **全部 = `build`**（不再是 `None`）；43 条 assistant 消息实际 agent 全为 build |
| once 不落库 | ✅ | `opencode.db` 的 `permission` 表 **0 行** |

**结论：人工确认核心项通过，2026-11-13 本轮 debug 关闭。** A4/A5 列为维护观察项（非阻塞）；将来若调整配置时发现问题再开 debug 迭代。

## 收尾状态

- 施工图已归档 `docs/P2/code-debug-0.2.4.md`（73848 B）。
- `docs/handoff.md` / `docs/plan.md` 已按「核心项实机通过、debug 关闭」更新。
- **README 回退指引修正后的同版本重打包**（历史 tgz 已人工清理，见下）：`plugin/hbk-dsh-opencode-local-0.2.4.tgz`，**21338 B**，SHA1 **`9464bf91f4a1bfdcb659c06591c964bc77f135e7`**；`lib/index.js` / `lib/client.js` SHA256 与首打包**逐字节一致**（`D093C426…` / `BF0EAAFE…`）⇒ **无需重装**，已装的 0.2.4 功能代码完全相同。
- 历史包 `0.2.1/0.2.2/0.2.3.tgz` 于 2026-11-13 人工清理（工作区删除、未提交），`plugin/` 仅留 0.2.4.tgz；回退需 `git checkout HEAD -- plugin/<包名>.tgz` 或切回源码重新 build/pack。
- **不做 git 提交**（人工接管）。
- 当前状态 = **已构建 / 已打包 / 已安装 / 已重启实机通过 / debug 已关闭；后续仅维护**。
