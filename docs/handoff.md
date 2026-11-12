# 交接文件（handoff）

> 给新会话快速建立上下文。读本文件即可；细节在各自链接文件里。
> 最后更新：**2026-11-12 12:20**（Asia/Shanghai）。
> 本次更新重点：**temp/ 已清理，必留文档迁至 `docs/`**（2026-11-12 人工裁决：只留必留类，参考克隆用户别处有备份）。历史文档中的 `temp/` 路径为当时记录，其 raw/probe/gui-spike 产物已删；temp/ 现仅作 harness 运行时 scratch，可随时整删。
> 项目状态：**阶段 3 已关闭，项目正式收尾（2026-11-12 人工确认），后续仅维护**。当前 = 0.2.3（已验收）。全部阶段（0/1/2/3）完成。

---

## 1. 项目一句话

**DSH-Opencode2API-hbk**：一个 **DSH（DeepSeek Harness）插件**，把**本地真实的 opencode CLI（v2.2.6）**桥接给 DSH 使用——**不伪装**，直接复用本机 CLI 及其登录凭据，对上游而言就是官方 CLI 在交互。全部 **TypeScript**。双入口：①DSH 模型通道（LlmAdapter）②对外 OpenAI 兼容 HTTP API。贯穿原则：**稳定最高优先级**。

## 2. 环境

- DSH **0.2.2-rc.1**（Windows）；opencode **v2.2.6**；Node **v24.21.0**
- 正式插件代码在仓库根 **`plugin/`**（npm 包 `@hbk/dsh-opencode-local`，provider id `opencode-local`）
- **当前仓库代码 = 0.2.3**（`plugin/package.json` 为 `0.2.3`，0.2.4 实测否决已回退）；0.2.2、0.2.3 均已人工验收
- 安装在 **desktop profile**：`C:\Users\hbk\.dsh\profiles\desktop`（注意：不是 web profile；用户一贯要求 desktop 形态）
- 参考源码克隆（opencode-dev / opencode2dsh-master / dsh-connect-workbuddy-main）**已随 temp/ 清理删除**（2026-11-12，用户别处有备份）；GUI 契约报告保留在 `docs/dsh-connect-workbuddy-analyze.md`
- **用户新克隆的最新 opencode 发布源码在 `D:\opencode`**（git `12a661ea40`，2026-11-09 克隆），排查上游行为优先读它；DSH 源码在 `D:\deepseek-harness`（只读）

## 3. 架构

```
DSH 聊天(入口A) ──LlmAdapter──┐
外部程序(入口B) ──HTTP API────┴─► 插件核心(TS, DSH 进程内) ──► 本机 opencode serve 子进程 ──► 上游
```
- 每回合**无状态**：新建 opencode 会话，把 DSH 全量历史压平成一条 prompt；靠 SSE 收事件翻译成 DSH chunk。
- 凭据共用默认数据目录（`~/.local/share/opencode/opencode.db`），不复制。
- serve 静默后台启动（windowsHide、直启 exe），心跳+自动重启，dispose 杀树。
- **重要补充**：机器上另有一个常驻 opencode 服务（`opencode serve --service`，端口 28894，凭据在 `~/.config/opencode/service.json`），TUI 连它；**插件自己 spawn 的 serve 用 4096**。二者是不同进程，别混。

## 4. 阶段状态

- **阶段 0 协议核实** ✅ `docs/P0/protocol-notes.md`
- **阶段 1 原型** ✅ 0.1.0，人工验收过
- **阶段 2 功能补充**：
  - 前置探针 ✅ `docs/P2/protocol-notes.md`
  - 0.2.0 ✅ → 实测**卡顿**（启动全量探测抢资源）
  - 0.2.1 ✅ 已实现、typecheck/build 通过、harness allPassed、打包 `plugin/hbk-dsh-opencode-local-0.2.1.tgz`，**已装进 desktop 并实机验证「修改生效」**
  - ⚠️ **0.2.1 实机暴露致命设计缺陷：设置页显示「所有模型都不可用」，但用户 TUI 里所有模型都能正常用**（详见 §5）
  - ✅ **人工裁决（2026-11-09 晚）：彻底废除探测功能，改「全部免费模型 + 人工勾选可见性」**
  - ✅ 0.2.2 ✅ 施工图经人工批准于 2026-11-10 执行：6 子执行者并行落盘 16 项变更（主执行者逐字节抽查全等），typecheck/build/harness allPassed，打包 `plugin/hbk-dsh-opencode-local-0.2.2.tgz`，**人工实机验收全部通过**
  - ✅ **阶段 2（P2）于 2026-11-10 关闭**；「错误信息补人话 finish」人工裁决砍掉不做；执行记录见 `docs/P2/impl-notes-0.2.2.md`
  - ✅ **0.2.3 收尾调优（2026-11-11）**：工具活动 `[工具]/[完成]/[失败]` 从 text 块改为 **reasoning 块**（DSH ReasoningRow 默认折叠，契约经 `D:\deepseek-harness` 源码核实）；仅改 translate.ts note() + 版本号 + h2 新增断言；typecheck/build/harness 全过，已打包 `plugin/hbk-dsh-opencode-local-0.2.3.tgz`；**2026-11-12 人工重装验收通过**；记录 `docs/P2/impl-notes-0.2.3.md`
  - ⚠️ **0.2.4（2026-11-11）：实测否决已回退**。曾针对「模型模仿历史笔记格式」做行级路由（行首 `^\[[^\]\n]+\]` →reasoning）+ flatten 剥历史笔记行 + h5 合成测试，h1-h5 全过并打包；但人工实测「不是很方便」（行首 Markdown 链接被误折叠等 trade-off 实感不佳），裁决回退。已按批准计划精确还原 5 文件、删 h5，typecheck/build/h1-h4 全过，重新打包 0.2.3（shasum 与原包一致）；记录 `docs/P2/impl-notes-0.2.4.md`（含回退记录）。**教训：宽匹配折叠正文会误伤正常内容，稳定/舒适优先于聪明规则**
- **阶段 3 轻量收尾** ✅ **已关闭（2026-11-12 人工确认收尾）**：安全自查 20 项 ❌0/✅14/⚠️6（⚠️ 全入 README 注意事项）；`plugin/README.md` 随包分发；0.2.3 重打包 20612B shasum `5ff475ed…`，lib 字节不变无需重装。方案/记录：`docs/P3/phase-3.md`、`security-check.md`、`impl-notes.md`。~~双入口并发压测~~、~~工具拦截第三层~~、~~安全审计 API 部分~~ 已裁决砍掉（**将来启用 API 或分发他人须补回**）

## 5. 关键事件：为什么废除「探测」（务必理解，别再走回头路）

**现象**：0.2.1 装好后，插件里 12 个免费模型全部显示不可用；用户在 opencode TUI 里同一时段却能正常出字（`longcat-2.5-free` 连续 22 次成功）。

**根因（已用 `D:\opencode` 源码 + 真实数据库 `session_message` 表 + 对照实验证）**：
1. 插件探测是「1 秒 1 个、建空会话、发 `Reply with exactly: ok`、发完即删」的**机器式批量请求**，遍历全部 12 个模型。
2. 这种请求特征被上游识别，返回 `provider.free-limit`（429）。
3. 旧代码把这一瞬时结果**永久写进 `~/.dsh-opencode-local/catalog.json`**，且 `selectable()` 要求 `probe.ok === true` 才显示 ⇒ **一次失败固化成永久全不可用**。
4. 用户的 TUI 是有人类节奏的真实会话，不触发该路径 ⇒ 一切正常。

**结论**：问题**全部在插件设计**，不是上游额度、不是没登录账号。用户已明确表态：若真是 opencode 自身问题他会自己接管，不会难为我们。之前两轮「额度用完 / 建议登录」的分析**是错的，已作废**，不要复用。

## 6. 0.2.2 定案（人工 2026-11-09 裁决，施工图已按此写）

| 裁决 | 落地 |
| --- | --- |
| **彻底不做探测**，删掉所有探测代码/配置/UI/测试断言 | 删 `probeModel()`、探测主循环、`probeEnabled`/`probeMaxPerSweep`、探测列、bootstrap |
| 设置页**直接显示全部免费模型**（成本全 0 才列，付费模型直接过滤） | `isFree()` 保留；`refresh()` 只调 `GET /api/model` 元数据 |
| **上下文窗口显示，小数最多 2 位**（`1048576 → 1.05M`） | `formatContext()`，规则与 10 组样例见施工图 §3.3 |
| 每个模型一个**复选框**标识是否可见，**默认全可见** | 新增配置 `hiddenModels: string[]`（`.volatile()`，默认 `[]`），存「被隐藏的 id」 |
| 卡片顶端**一个按钮切换**「全选」/「全不选」 | 初始全选 ⇒ 显示「全不选」；语义见施工图 §3.4 |
| 文件名 `catalog/probe.ts` → **`catalog/models.ts`** | 影响 3 处源码导入 + 1 处测试导入 |
| 版本号 **0.2.2** | `plugin/package.json` |

**可见性唯一规则**：`visible(entry) = entry.free === true AND !hiddenModels.includes(entry.id)`

**为什么存「隐藏项」而不是「可见项」**：空数组即全可见（正好是默认值）；opencode 新增模型自动可见；且能表达「一个都不显示」。若用白名单，空数组按现有约定表示「全部允许」，无法表达「全不选」。

**刷新按钮语义变化**：从「重新探测」变成「刷新列表」，只重新拉 `/api/model`，**不发任何模型推理请求**。

## 7. 当前关键设计要点（0.2.1 仍有效部分；0.2.2 执行后按 §6 覆盖探测相关条目）

- **优先级（D10）**：用户对话最高优先；**对话链路永不 await 探测/目录刷新**；启动只做一次轻量列表刷新（0.2.2 起连 bootstrap 也删）。
- **免费判定**：serve 模型 `cost` 全 0 ⇒ 免费。⚠️ **「选择器只显示免费 ∧ 探测通过」这条已废止**，0.2.2 起改为「免费 ∧ 未被用户勾掉」。
- **工具（路径B）**：permission 全 ask；按 **action** 白名单 reply `once` 放行，其余 reject；**完全允许**=`toolAllowlist:['*']`；**每回合次数上限** `toolMaxPerTurn`（默认 20，独立可调）；工具活动渲染为 text 块，**不发 DSH tool-call**。
- **思考档位**：`Model.Ref.variant`；档位来自模型 `variants`（serve 实时）；输入框右侧控件经 slot `useProjection('modelSelection')` 取当前模型；默认 default，无效回退 default。
- **GUI 契约（0.2.2-rc.1 实证）**：双 bundle（client 用 `window.__ModuleLoader__.load({id: 包名})` 包装）；`settings.section` **无条件注册**才可见；配置编辑字段必须 **`.volatile()`**（否则命名空间不被 serve）；locale.register 包 `ctx.effect`；react-dom 等 external；node 入口 `fixedExtension:false`。
- **对外 API（静默保留，2026-11-12 人工裁决）**：后端已实现且 h4 实测通过（/v1/models、/v1/chat/completions 流式+非流式、Bearer 鉴权），但实测几乎无使用必要 ⇒ **保持现状、留而不用**：默认 `apiEnabled:false`、仅 127.0.0.1、**不做设置界面**（client 无 API 页签，配置只能手改文件）、不再投入。已知缺口（tools 参数忽略、流式无 usage、模型名不校验、请求体无大小上限）一并冻结，启用前须补
- **静默后台**：所有 Windows 子进程 spawn `windowsHide:true`，taskkill 同样。

## 8. 关键文件索引

- **0.2.2 施工图（当前最重要）**：`docs/P2/code-debug.md` — 1628 行 / 65 KB；§0 裁决、§1 多 agent 编排（含能力探测 + 派发模板）、§2 变更清单 16 项、§3 语义契约、§4 内嵌代码（F01–F16 逐字节）、§5 常量表、§6 验收、§7 故障矩阵、附录事实核对
- 主计划：`docs/plan.md`（v7，2026-11-12 已记入 API 静默保留 + 阶段 3 缩减裁决）、`docs/P2/phase-2.md`（阶段 2 方案，其中 D1/D2 关于探测的部分**已被 code-debug.md 废止**）
- 历史施工图/记录：`docs/P2/code.md`（0.2.1 差异施工图）、`docs/P2/impl-notes-0.2.1.md`、`docs/P2/impl-notes.md`（0.2.0）、`docs/P2/protocol-notes.md`
- 插件源码：`plugin/src/`（`index.ts` 接线、`config.ts`、`priority.ts`、`serve/{client,manager}.ts`、`catalog/probe.ts`（0.2.2 改名 `models.ts`）、`adapter/{local-adapter,turn,translate,flatten}.ts`、`web/routes.ts`、`api/server.ts`、`client/*`）
- 验证：`docs/impl-harness/`（run-all：h1 免费过滤 / h2 工具 / h3 流式 / h4 API）；运行产物在 `temp/impl-harness-results/`、`temp/impl-harness-data/`（scratch，可随时删）
- 安装包：**`plugin/hbk-dsh-opencode-local-0.2.3.tgz`（当前，已验收；最新重打包 2026-11-12：20642B，shasum `def0ac34558e2e79d5d0774c47c4f7c422042bb1`，README 回归路径更新，lib 字节不变无需重装）**；历史：0.2.4（实测否决已回退）/ 0.2.2（已验收）/ 0.2.1 tgz
- 使用说明：**`plugin/README.md`**（随包分发）；阶段 3 文档：`docs/P3/phase-3.md`（方案+裁决）、`security-check.md`（自查报告）、`impl-notes.md`（执行记录）
- 执行日志：`docs/P2/impl-notes-0.2.2.md` / `impl-notes-0.2.3.md` / `impl-notes-0.2.4.md`
- 运行时数据：`C:\Users\hbk\.dsh-opencode-local\catalog.json`（含旧的失败探测结果，0.2.2 执行后会被新格式覆盖）

## 9. 工作约定（人工要求）

- **阶段门**：方案文档 → 人工审核/裁决 → 批准 → 执行；**"先不要做任何操作" = 硬停**。
- 代码放 `plugin/`；方案/记录放 `docs/P{n}/`（2026-11-12 起由 temp/ 迁入）；git 与归档人工接管（仓库目前只有 1 个 `Initial commit`，`plugin/` 和 `docs/` 全未跟踪）。
- 施工图为**确定性**：代码内嵌、逐字节提取、多 agent 并行编排；debug 迭代用**差异施工图**（只列改动文件）。
- `code-debug.md` §1 要求：执行前先做**能力探测**（判定是否有并行能力），有则派 6 个子执行者，无则串行回退，产物必须逐字节相同；**验证阶段禁止并行**。
- 对话实测有**预算上限**；缺实证先探针；防御到位的可不探针直接改。
- 总测量"稳定优先"：不做聪明但脆的优化。

## 10. 下一步

**无待办——项目已收尾（2026-11-12），后续仅维护。**

- 当前交付：`plugin/hbk-dsh-opencode-local-0.2.3.tgz`（含 README）；使用与故障速查见 `plugin/README.md`。
- 维护触发点：opencode / DSH 版本升级导致契约漂移；想启用 API 或分发他人（**须先补回**双入口并发压测、工具拦截第三层、安全审计 API 部分，见 §4）。
- git 与归档仍由人工接管。

历史备注：0.2.2 残留扫描曾有 2 处良性文案命中（h2/h4 的 `'no selectable model'`），已随人工验收通过，不再处理。

## 11. 易踩的坑（提醒新会话）

- 别再提「额度用完 / 需要登录」——已被人工明确否定，见 §5。
- 安装/验收走 **desktop** profile，不是 web。
- 排查上游行为读 `D:\opencode`（最新克隆）；`temp/opencode-dev` 旧快照已删。
- `h2-tools.mjs` / `h3-stream.mjs` / `h4-api.mjs` 通过 `lib.mjs` 的 `firstModel()` 间接取模型，签名不变 ⇒ 0.2.2 **不需要改**；`ThinkingLevelSelect.tsx` 与 `api/server.ts` 也不需要改（附录已核实）。
- 施工图 §3.3 的 `formatContext` 采用**四舍五入**（`981504 → 982K`、`1024 → 1K`），不是截断；样例表是唯一裁定。
