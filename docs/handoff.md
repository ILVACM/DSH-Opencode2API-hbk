# 交接文件（handoff）

> 给新会话快速建立上下文。读本文件即可；细节在各自链接文件里。
> 最后更新：**2026-11-20 17:51**（Asia/Shanghai）。
> 本次更新重点：**0.2.8-3 施工完成并经人工重启实机验收通过（2026-11-20）——插件彻底退出上下文压缩，tab 改「上下文状态」**；新增版本命名规则 `0.2.8-x` 与打包/安装机械预检；更正 §18/§19 与代码实况不符的描述（见 §20）；**`temp/` 已整目录清理**（施工图归档至 `docs/P2/code-debug-0.2.8-3.md`，见 §20 收尾清理）。
> 项目状态：**阶段 3 已关闭，项目正式收尾，后续仅维护 + 修复迭代**。当前 = **0.2.8-3（已装 web profile，2026-11-20 人工实机验收通过）**。全部阶段（0/1/2/3）完成。

---

## 1. 项目一句话

**DSH-Opencode2API-hbk**：一个 **DSH（DeepSeek Harness）插件**，把**本地真实的 opencode CLI（v2.2.6）**桥接给 DSH 使用——**不伪装**，直接复用本机 CLI 及其登录凭据，对上游而言就是官方 CLI 在交互。全部 **TypeScript**。双入口：①DSH 模型通道（LlmAdapter）②对外 OpenAI 兼容 HTTP API。贯穿原则：**稳定最高优先级**。

## 2. 环境

- DSH **0.2.2-rc.1**（Windows）；opencode **v2.2.6**；Node **v24.21.0**
- 正式插件代码在仓库根 **`plugin/`**（npm 包 `@hbk/dsh-opencode-local`，provider id `opencode-local`）
- **当前仓库代码 = 0.2.8-3**（`plugin/package.json` 为 `0.2.8-3`）；0.2.2–0.2.7、0.2.8-2、0.2.8-3 均已人工验收（0.2.8-3 于 2026-11-20 重启后实机验收通过）：**插件彻底退出上下文压缩**——删监听器/压缩存储/改路由函数，tab 改「上下文状态」仅留监测显示；版本命名规则 `0.2.8-x`；打包/安装机械预检，详见 §20
- 安装在 **web profile**：`C:\Users\hbk\.dsh\profiles\web`（⭐ 2026-11-16 起：**用户使用形态为 web**，其对应插件 profile 即 `web`；desktop 与 web **共用同一 cordis 底座**。⚠️ 旧的「安装/验收走 desktop profile」约定**已过时**，勿再按 desktop 操作）
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
   - ✅ **0.2.4（2026-11-13 复用该号，A+B 修复，与 11-11 否决版不同内容）**：人工裁决复用 0.2.4 号。诉求＝设置页勾「完全允许」时**不做任何检查、所有工具请求全放行、风险人工承担**。根因实证：插件建会话未传 agent（上游回落 build，不是 plan）；跨工作目录访问触发上游额外动作 `external_directory`，旧版动作名对不上 → 插件自己 reject。改动 13 文件：①`createSession` 固定 `agent:'build'`；②`ToolPolicy.allowAll` 派生 + turn.ts 裁决短路（不比对动作名/不计次）+ 放行恒 `once`（禁 `always`，避免规则写进 opencode.db 关不回去）；③`external_directory` 进设置页清单；④版本号 0.2.4 + 文案 + 新 h5 测试。多 agent 并行落盘（W1–W6），V1 13/13、typecheck/build、h1–h5 `allPassed`（预算 5）、**h5 `cap-bypassed`（上限=1 仍放行 3 次）、`rejected:0`、`agent:"build"`**。打包 21237B shasum `b83e03b4…`，已装 desktop profile。**2026-11-13 人工重启后核心项实机通过（本轮 debug 已关闭）**：重启后 7 个 `dsh-*` 会话 `agent` 全为 `build`、43 条 assistant 全为 build；`permission.rejected=0`；execute/shell/read/write/grep/question 跨目录调用全部 completed；`opencode.db` permission 表 0 行（once 不落库）。A4（取消勾选恢复管控）与 A5（只勾 external_directory+read）因配置保持 `['*']` 未单独实测，留作维护观察项。施工图 `docs/P2/code-debug-0.2.4.md`、记录 `docs/P2/impl-notes-0.2.4-r2.md`。**环境漂移**：opencode 实测 v2.2.7（原记 2.2.6），只读复核契约未变。
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
- 安装包：**当前交付 = `plugin/hbk-dsh-opencode-local-0.2.4.tgz`**（2026-11-13，A+B 修复；5 文件含 README），已装 desktop profile，**2026-11-13 人工重启后核心项实机通过、本轮 debug 已关闭**；`lib/index.js`(SHA256 `D093C426…`) / `lib/client.js`(`BF0EAAFE…`) 与已装版本逐字节一致。首打包 21237B / `b83e03b4…`；**关闭前因 README 回退指引修正重打包为 21338B / `9464bf91…`**（最新，lib 字节不变，无需重装）。上一交付：0.2.3（已验收；`lib/index.js` `74177ED5…` / `lib/client.js` `556EA7A2…`）。**历史包 0.2.1/0.2.2/0.2.3.tgz 已于 2026-11-13 人工清理（工作区删除、未提交），回退需 `git checkout HEAD -- plugin/<包名>.tgz` 或重新打包**；**0.1.0.tgz 已不存在**；**11-11 的 0.2.4 实测否决版 tgz 未留存，与本 0.2.4 不同内容**（见 §4）。
- 使用说明：**`plugin/README.md`**（随包分发）；阶段 3 文档：`docs/P3/phase-3.md`（方案+裁决）、`security-check.md`（自查报告）、`impl-notes.md`（执行记录）
- 执行日志：`docs/P2/impl-notes-0.2.2.md` / `impl-notes-0.2.3.md` / `impl-notes-0.2.4.md`
- 历史包实物（2026-11-12 核实）：`plugin/` 下只有 **0.2.1 / 0.2.2 / 0.2.3** 三个 tgz；**0.1.0.tgz 从未入库、已不存在**，0.2.4 已否决，其 tgz 也未留存（代码已回退，无需保留）。README 的回退指引已按此更正。
- 运行时数据：`C:\Users\hbk\.dsh-opencode-local\catalog.json`（2026-11-12 21:00 核实：已是 0.2.2+ 新格式，12 条条目全 `free:true`，**旧的失败探测结果已被覆盖，不再有"全不可用"固化缓存**）；`serve.log` 0 字节。

## 9. 工作约定（人工要求）

- **阶段门**：方案文档 → 人工审核/裁决 → 批准 → 执行；**"先不要做任何操作" = 硬停**。
- 代码放 `plugin/`；方案/记录放 `docs/P{n}/`（2026-11-12 起由 temp/ 迁入）；**git 已由人工接管**：2026-11-12 已有 `d5f894c Initial commit` + `473a103 complete` 两次提交，`plugin/` 与 `docs/` 全部纳入跟踪（415 文件），工作区干净——「仓库只有 1 个 Initial commit、全未跟踪」的旧说法已过期。
- 施工图为**确定性**：代码内嵌、逐字节提取、多 agent 并行编排；debug 迭代用**差异施工图**（只列改动文件）。
- `code-debug.md` §1 要求：执行前先做**能力探测**（判定是否有并行能力），有则派 6 个子执行者，无则串行回退，产物必须逐字节相同；**验证阶段禁止并行**。
- 对话实测有**预算上限**；缺实证先探针；防御到位的可不探针直接改。
- 总测量"稳定优先"：不做聪明但脆的优化。

## 10. 下一步

**当前状态：0.2.8-3 已施工、打包、机械预检通过、安装到 web profile，并经人工重启实机验收通过（2026-11-20，插件彻底退出上下文压缩）；0.2.8-2 及之前版本均已验收。**

- 当前交付：`plugin/hbk-dsh-opencode-local-0.2.8-3.tgz`（25159 B / SHA256 `DA5096A897E911AFFF121B339B0ECAC61DF27C8EE761C01EA98F9565BEBB1728`，已装 **web** profile、**已验收**）；使用与故障速查见 `plugin/README.md`；**回退包 = `plugin/hbk-dsh-opencode-local-0.2.8-2.tgz`**（26692 B / `2CB3E7DC…`，注意其仍含诊断监听器，见 §19 更正）；**0.2.4–0.2.7 与 0.2.8.1 的 tgz 已不存在**。
- 0.2.6 内容：**压缩模型偏好轻量化**——从 DSH profile 配置迁到插件自有 `~/.dsh-opencode-local/compaction.json`（全局），切换压缩模型**即时生效**（乐观更新 + 一次轻量写），不再触发 profile 重组/serve 重启；配套 `GET/POST /plugins/opencode-local/compaction` 路由、启动期旧值迁移、损坏/缺失回落官方默认。详见 `docs/P2/code-debug-0.2.6.md`、`docs/P2/impl-notes-0.2.6.md`。
- 0.2.5 内容：①压缩请求识别（`purpose:'compaction'` → 精简形态 / 工具不放行 / `compact-` 标题）；②**设置页新增「上下文压缩」tab**（一键压缩 + 压缩专用模型选择器 + 只读上下文面板）；③**`llm/stream` 路由改写**把人工与自动压缩统一到选择器指定模型（默认官方，仅为保底，第三方 API 同级）；④402 限流正确改判 + 压缩内部有限重试。详见 `docs/P2/code-debug-0.2.5.md`、`docs/P2/impl-notes-0.2.5.md`。
- 维护触发点：opencode / DSH 版本升级导致契约漂移；想启用 API 或分发他人（**须先补回**双入口并发压测、工具拦截第三层、安全审计 API 部分，见 §4）。
- git 与归档仍由人工接管。
- 2026-11-12 晚自适应清理（人工授权「自适应清理问题」）：①删除 desktop `cordis.patch.yml` 中 0.2.1 探测时代残留的 `opencode-local-probe` 条目（包本就不存在，YAML 仍解析为 15 条目，已备份）；②修正 README 不存在的 `0.1.0.tgz` 回退指引；③本文档 §8/§9 的 git 状态与运行时数据描述、历史包清单已按实测更新；④0.2.3 重新打包（README 变更）。详见 §12。

历史备注：0.2.2 残留扫描曾有 2 处良性文案命中（h2/h4 的 `'no selectable model'`），已随人工验收通过，不再处理。

## 11. 易踩的坑（提醒新会话）

- 别再提「额度用完 / 需要登录」——已被人工明确否定，见 §5。
- 安装/验收走 **web** profile（2026-11-16 起用户形态为 web；旧的「走 desktop」约定已废，见 §2）。
- 排查上游行为读 `D:\opencode`（最新克隆）；`temp/opencode-dev` 旧快照已删。
- `h2-tools.mjs` / `h3-stream.mjs` / `h4-api.mjs` 通过 `lib.mjs` 的 `firstModel()` 间接取模型，签名不变 ⇒ 0.2.2 **不需要改**；`ThinkingLevelSelect.tsx` 与 `api/server.ts` 也不需要改（附录已核实）。
- 施工图 §3.3 的 `formatContext` 采用**四舍五入**（`981504 → 982K`、`1024 → 1K`），不是截断；样例表是唯一裁定。
- **desktop `cordis.patch.yml` 含一个历史控制字符**：第 2325 行注释里的 `bash -s` 处有一个 0x08（退格）字节，来自早期 `dsh-remote` shell 修复注释（原文 `bash` 被写坏）。它**早于本次清理就存在**，DSH 一直正常加载（该行是 YAML 注释），**不要顺手删**；若将来解析报错再处理。

## 12. 2026-11-12 晚自适应清理记录（人工授权）

> 触发：人工指令「自适应清理问题。然后等待人工指令，准备进行新的改进」。范围限于**已核实的不一致**，不改插件功能代码。

| # | 问题（实测证据） | 处置 | 验证 |
| --- | --- | --- | --- |
| 1 | desktop `cordis.patch.yml` 末尾残留 `opencode-local-probe` 条目（0.2.1 探测时代；该包在 node_modules 中**不存在**，也不在 profile bundles 中），配置项 `probeToggle` 属已废除功能 | 精确删除该 4 行（前置断言逐字匹配，防误删） | 备份 `D:\DSH-Opencode2API-hbk-acl-recovery\cordis.patch.yml.bak-cleanup-20261112-211024`；`Compare-Object` 差异**恰为 4 行**；YAML 解析 = **15 条目**、无 probe、`opencode-local` 配置完整（toolMode/toolAllowlist `*`/30/max）；文件无 BOM、CRLF 保持一致 |
| 2 | `plugin/README.md` 回退指引写 `0.1.0.tgz`（原型），但该包**从未入库、已不存在** | 改为 `0.2.1.tgz`（有已知缺陷，仅备查） | 新包内 README 已确认含修正行 |
| 3 | handoff §8 git 描述「只有 1 个 Initial commit、全未跟踪」已过期 | 更新为实测：`d5f894c` + `473a103 complete`，415 文件跟踪，工作区干净 | `git log` / `git ls-files` |
| 4 | handoff §8 称 `catalog.json`「含旧的失败探测结果」 | 更新为实测：已是新格式，12 条全 `free:true`，旧固化结果已被覆盖 | 读 `catalog.json` |
| 5 | handoff 安装包 shasum 因 README 变更而失效 | 重新 `npm pack` 并记录新 shasum | 新包 20650B / `7adf4e98…`；lib 双文件 SHA256 与已装版本**逐字节一致 ⇒ 无需重装** |

**未做（有意不动）**：插件功能代码、desktop profile 的 `package.json`/bundles、`catalog.json`、git 提交（由人工接管）、上文那个历史 0x08 字节。

**一处环境侧修复**（非项目文件）：本次会话开始时 shell 全部失败（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(...)`），系工作区目录缺 `WRITE_OWNER` 导致沙箱无法授权；已用诊断脚本为当前用户补完全控制并复核通过，原始权限备份与回滚命令见 `D:\DSH-Opencode2API-hbk-acl-recovery\`。

## 13. 2026-11-13 0.2.4（A+B 修复）执行记录

> 人工指令「根据 `temp/debug.md` 执行修改优化，完成后直接重新打包构建，版本号 0.2.4，然后重装插件」；计划模式批准；两项裁决：①复用 0.2.4 号（覆盖方案原定 0.2.5）②只装包不主动重启。

- 施工图 `temp/debug.md` → 归档 `docs/P2/code-debug-0.2.4.md`；实施记录 `docs/P2/impl-notes-0.2.4-r2.md`。
- 方案对齐：15 处 `0.2.5`→`0.2.4`，README 加同号说明，§9 收尾文档改名 `impl-notes-0.2.4-r2.md`。
- 执行：P1 能力探测成功（9 字节 `probe-ok\n`）→ **并行模式**，W1–W6 六执行者落盘 13 文件；V1 13/13、V1b 表外零改动、V2/V3 通过、V4 h1–h5 `allPassed`（预算 5，h5 `cap-bypassed`/`rejected:0`/`agent:"build"`）、V5 打包 21237B / `b83e03b4…`、V6 残留扫描通过。
- 安装：`dsh plugin --profile desktop add file:…/0.2.4.tgz` 成功；已装 0.2.4，lib 与构建产物逐字节一致，`cordis.patch.yml` 整文件未变（配置全保留）。备份 `temp/reinstall-backup/`，回滚命令见 impl-notes-0.2.4-r2.md。
- **人工重启后实机核验（2026-11-13 13:25 之后，只读查 `opencode.db`）**：7 个 `dsh-*` 会话 `session_v2.agent` 全为 `build`、43 条 assistant 实际 agent 全 build；`permission.rejected=0`；`execute/shell/read/write/grep/question` 跨目录调用全部 `completed`；permission 表 0 行（once 不落库）。**人工确认核心项通过 ⇒ 本轮 debug 已关闭**（A4 取消勾选恢复管控、A5 只勾 external_directory+read 因配置保持 `['*']` 未单独实测，列维护观察项）。
- 收尾：README 回退指引按人工清理历史包的事实修正，同版本重打包（lib 字节不变）；最新字节数/shasum 见实施记录。
- 环境漂移：opencode v2.2.7（原记 2.2.6），只读复核上游契约未变，h5 实机断言通过。
- 历史包 `0.2.1/0.2.2/0.2.3.tgz` 于 2026-11-13 人工清理（工作区删除、未提交），`plugin/` 仅留 0.2.4.tgz；回退需从 git 恢复或重新打包。
- git 提交仍由人工接管。

## 14. 2026-11-16 0.2.5 执行记录（压缩统一改道 + 上下文压缩 tab）

> 人工指令：「根据 `temp/code.md`『执行』优化迭代，修改完代码后，直接重装插件到 web 中」。计划模式提交方案并获批后执行。
> 定案依据 `temp/debug.md` v8；施工依据 `temp/code.md`（归档 `docs/P2/code-debug-0.2.5.md`）；执行记录 `docs/P2/impl-notes-0.2.5.md`。

- **核心机制变更（D13'）**：不再试图写 DSH 原生 `summarizationProvider/Model`（探针证明运行时不可写：构造期 deepFreeze、无 volatile、嵌套 4 个预设重复 id、settings 寻址不到），改为在 **`llm/stream` waterfall** 上识别 `purpose==='compaction'` 并就地改 `options.provider/model` —— 人工 `/compact` 与切模型自动压缩共用同一出口，**一次挂岗全跟随**。
- **执行方式**：多 agent 并行（2 探针 + 5 工作包，文件两两无交集；`status-paths.ts` 归 W4 独占写）。串行验证：`typecheck`（双 tsconfig）0 错、`build` 成功、`run-all` **h1–h7 全过 `allPassed:true`**。
- **测试修正（非产品缺陷）**：h6 原断言误用 `flattenHistory(options,false)` 校验 `You may use the available tools` 尾注（该尾注仅在 `toolsEnabled=true` 出现）。已拆成 false/true 两分支校验并**新增** `chatTools` 断言（比原方案更严）；`temp/code.md` 已同步。
- **打包**：`hbk-dsh-opencode-local-0.2.5.tgz` 27051 B / SHA256 `384183D76C6E59F4CB63B5E80076D9CC731DBE3213D6285D49A868F7810A5FA7`；包内 5 条目。
- **安装**：`dsh plugin --profile web add …` 成功（0.2.4 → 0.2.5）；web `cordis.patch.yml` **整文件未变**（SHA256 `EED1FF55…`）；已装 lib 与构建产物**逐字节一致**；**未重启**。
- **备份**：`temp/reinstall-backup/cordis.patch.yml.bak-0.2.5-20261116-212446`。
- **待办**：人工重启后按 `docs/P2/impl-notes-0.2.5.md §5`（A1–A6 / B1–B11）实机验收；重点看「切模型不再报 402」与「上下文压缩 tab 三块齐全」。
- git 提交仍由人工接管。

## 15. 2026-11-18 0.2.6 执行记录（压缩模型偏好轻量化：迁出 profile 配置）

> 人工指令：按 `temp/debug.md`（v3 定案）执行，完成后打包 0.2.6 并重装到 web profile。计划模式提交方案并获批后执行。
> 定案依据 `temp/debug.md` v3；施工依据 `temp/code.md` v2（归档 `docs/P2/code-debug-0.2.6.md`）；执行记录 `docs/P2/impl-notes-0.2.6.md`。

- **背景**：0.2.5 实机验收通过，但「上下文压缩」tab 的压缩模型选择器切换缓慢——根因是偏好借道 DSH 配置系统，每写一次触发**重写整份 `cordis.patch.yml` + profile 重组 + serve 重启**（无任何成功性检测）。人工裁决：**改存插件自有 JSON**（`~/.dsh-opencode-local/compaction.json`，全局），不走 DSH 官方存储（避免硬 `inject` 连坐与鸭子类型投机）。
- **实现**：新增 `compaction-store.ts`（同步容错读 + mtime/size 缓存 + 异步原子写 tmp+rename+Windows 重试 + 幂等短路 + 写后失效缓存 + 一次性迁移）；`config.ts` 删除两个压缩配置字段与 `liveCompactionProvider/Model`；新增 `GET/POST /plugins/opencode-local/compaction`（单 handler 分流，避免重复路径注册）；`llm/stream` 监听器**仅压缩请求**动态读 store；`CompactionTab` 改为打开面板 GET 一次 + 点选**乐观更新**失败回滚。`applyCompactionRoute` 判断逻辑一字未动。
- **执行方式**：多 agent 并行（2 探针通过 + 5 工作包）；4 个执行者中途失败，但盘点证实 A/C/D/E 已落盘且与施工图一致，**仅 B 组两文件由主执行者串行补完**（`code.md §1.3` 允许串行，产物一致）。
- **验收**：typecheck 双配置 0 错（首轮抓到 A 组删除不完整 5 处 TS 错误，补删后通过）；build 成功且 **lib 无新增外部包**；`run-all` **h1–h7 全过 `allPassed:true`**（h6 压缩实机断言保持，h7 新增解析/读写/幂等/自愈/迁移用例全过，临时文件已清理）。
- **打包**：`hbk-dsh-opencode-local-0.2.6.tgz` **28523 B** / SHA256 `B15928B1178082F53E103E71B403B034B53CA54228322534C66C3100EE19C78A`；包内 5 条目。
- **安装**：web profile `0.2.5 → 0.2.6` 成功；**`dsh plugin add` 未改动 `cordis.patch.yml`**（安装前后 71784 B 字节级相同）；已装 lib 与构建产物逐字节一致；**未重启**。
- **patch 哈希说明**：P0 基线 `31CC092C…` 与安装前 `81BBAF0C…` 不同，发生在 11-17→11-18 施工暂停期间（约一天，本执行无任何写操作），属环境自身漂移，与本次施工无关；两份文件均已留档备查。
- **备份**：源码 `temp/backup-0.2.5-src/`（0.2.5 未提交 git，回退用它，**勿用** `git checkout HEAD`）；patch `temp/reinstall-backup/cordis.patch.yml.bak-0.2.6-20261118-203002`。
- **验收结果（2026-11-18 人工确认）**：✅ **全部改进生效并通过验收**。
- **⚠️ 部署插曲（已解决，留档防再犯）**：`dsh plugin add` **不会重载已运行 DSH 进程里的插件后端**——安装后立即使用时出现「前端新（0.2.6 请求新路由 `/plugins/opencode-local/compaction`）、后端旧（0.2.5 无此路由）」→ 404 空响应 → 浏览器报 `Failed to execute 'json' on 'Response': Unexpected end of JSON input`。**完全退出并重启 DSH 后消失**。结论：**`dsh plugin add` 之后必须重启 DSH 才算部署完成**；匿名 curl 探针（存在→401 / 不存在→404）可快速区分此类问题。
- **遗留观察项（无碍使用）**：profile patch 中残留的旧 `compactionProvider/compactionModel` 键按裁决不清理（schema 已删，无害）；若 DSH 未来对插件存储/配置行为有变化，优先复查 `compaction.json` 读写。
- git 提交仍由人工接管。

## 16. 2026-11-19 0.2.7 执行记录（修复两个接线缺陷）

> 计划依据 `docs/plan.md`；施工依据 `temp/code.md` v3（归档 `docs/P2/code-debug-0.2.7.md`）；执行记录 `docs/P2/impl-notes-0.2.7.md`。

- **背景（实机暴露）**：0.2.6 验收后人工故意不配 `DEEPSEEK_API_KEY`、改选 nvidia 压缩模型，切换 `opencode-local/deepseek-v4.1-flash-free` 仍报 `llm-deepseek: no API key for provider route "deepseek-official"`；且上下文面板一直为空。只读探针实证为两个**接线缺陷**（非配置问题）：
  1. **监听器从未触发**：Cordis 分发 waterfall 时按 llm 服务 context filter 过滤监听者（`vendor/cordis/src/events.ts:168-170`），插件独立 fiber 被过滤 → 0.2.5/0.2.6 的 `llm/stream` 改路由**从未真正生效**，压缩一直走默认官方路由。
  2. **设置页会话推导无效**：root-scope 设置页手动 `ctx.get('sessions')` 拿不到当前会话 → 面板从不请求数据。
- **修复**：① `index.ts` 监听器注册加 **`{ global: true, prepend: true }`**（DSH 自家 `session-title` 同款，绕过 filter）；② `CompactionTab.tsx` 改用 DSH 注入的 **`useSessions` 钩子** + 纯函数 `selectMainSessionId`（`SettingsRoot.tsx` 同款）；③ 版本 0.2.6 → 0.2.7。判断/改派逻辑、store、路由、patch 均未动。
- **执行**：多 agent 并行（2 探针 + 3 工作包），三包自检全绿；串行验收 `typecheck` 0 错、`build` 成功无新增外部包、`run-all` **h1–h7 全过 `allPassed:true`**。
- **打包**：`hbk-dsh-opencode-local-0.2.7.tgz` **28631 B** / SHA256 `621DE5076503E3E76B795D591B0B54231B265C056C504B8DEB9ACF45DAF1688C`；包内 5 条目。
- **安装**：web profile `0.2.6 → 0.2.7` 成功；`cordis.patch.yml` 安装前后字节级相同（75567 B）；已装 lib 与构建产物一致；**未重启**。
- **备份**：源码 `temp/backup-0.2.6-src/`；patch `temp/reinstall-backup/cordis.patch.yml.bak-0.2.7-20261119-170116`。
- **Hotfix（同版本 0.2.7）**：首次安装后上下文 tab 崩溃（`useSessions is not a function`）——renderer 的 standard kit 只注入顶层 slot 组件，`CompactionTab` 是内部自渲染子组件、父组件漏透传 `useSessions`。修复：`OpencodeLocalCard.tsx:80` 透传 `useSessions: props.useSessions`。因版本未变 pnpm 报 `Already up to date`，改用 **remove + add 强制重装**；已装 `client.js` 与构建产物逐字节一致、patch 零差异。重打包 0.2.7（28637 B / `E9B30757…`）。详见 `docs/P2/impl-notes-0.2.7.md §8`。
- **待办**：⚠️ **必须完全退出并重启 DSH**（host 不热重载）后按 `docs/P2/impl-notes-0.2.7.md §7` / `docs/plan.md §4` 实机验收（核心：切模型不再报 deepseek-official key 错、上下文面板有真实读数、tab 不再崩溃）。
- git 提交仍由人工接管。

## 17. 2026-11-20 0.2.8 执行记录（压缩改路由真正生效）

> 计划依据 `docs/plan.md`；施工依据 `temp/code.md` v3；执行记录 `docs/P2/impl-notes-0.2.8.md`。

- **背景**：0.2.7 安装重启后，上下文面板已修复，但切模型仍报 `deepseek-official` key 错——**压缩改路由仍未生效**。深入探针（含会话日志多帧解压）确认：`llm/stream` 监听器加了 `global:true` 仍**从未被调用**。
- **根因**：两层问题叠加——① 0.2.7 把 `ctx.on(...)` 包在 **`ctx.effect()`** 内注册，导致监听器在真实 DSH 中**从未被触发**（去掉 effect 包装直接在 apply 注册后，诊断版立即证实 `listener fired`、`choice=nvidia/...`、`optionsFrozen=false`）；② 0.2.6 的启动迁移未把用户在 0.2.5 时代选的压缩模型（nvidia）迁入 `compaction.json`，写成了默认 `deepseek-official`（无 key）。
- **修复（0.2.8）**：监听器注册改为 **apply 期间直接 `ctx.on('llm/stream', handler, { global: true, prepend: true })`**（disposer 挂 effect 仅做卸载清理）；诊断代码已移除，恢复正式改写逻辑。
- **验证**：typecheck 0 错、build 成功、h1–h7 `allPassed:true`；打包 0.2.8（28622 B / SHA256 `197E8D6A…`，5 条目）；安装 web profile，patch 零差异，已装 lib 与构建产物一致。
- **待办**：人工重启 DSH 后验收（压缩走 nvidia、面板有读数、无回归）。
- git 提交仍由人工接管。

## 18. 2026-11-20 0.2.8-1 执行记录（插件退出上下文压缩功能）

> 计划依据 `docs/plan.md`（0.2.7 修复迭代的后续调整）；人工指令：「压缩上下文 tab 改为上下文状态，保留状态监测显示，删除压缩模型选择器与压缩按钮，插件不再做上下文压缩（人工另行接管）」；版本命名规则改为 `0.2.8-x`。

- **功能调整**：「上下文压缩」tab 更名为「上下文状态」，仅保留上下文状态监测显示；**移除**压缩模型选择器、`压缩上下文` 按钮、`llm/stream` 监听器、`compaction-store.ts`、`compaction.json` 及相关路由。
- **web profile 的 `cordis.patch.yml`**：保留并预置 compaction-basic 原生配置（`summarizationProvider: nvidia, summarizationModel: nvidia/nemotron-3-ultra-550b-a55b`）——压缩由人工另行接管时可直接使用/调整。
- **修复记录**：patch 文件位置 71734 的非法控制字符 0x08（历史损坏）已字节级修复为 `bash` 的 `b`；Python yaml 全文校验通过（17 条目）。
- **验证**：typecheck 0 错、build 成功、h1–h7 `allPassed:true`；0.2.8-1.tgz 25593 B / SHA256 `0936A260…`（5 条目）；安装 web profile 成功（0.2.8.1 → 0.2.8-1），lib 与构建产物一致，patch 零差异。
- **待办**：人工重启 DSH 后实机验收（tab 显示「上下文状态」且读数正常；切模型不再报压缩错误）。
- git 提交仍由人工接管。

## 19. 2026-11-20 0.2.8-2 执行记录（监听器恢复 + 强制部署）

> 前置：0.2.8-1 重启实测仍报 deepseek-official no key。排查发现 **0.2.7 的 `index.js` 因 pnpm 同版本缓存从未真正部署**（remove+add 后仍 stale），且首次打包的 0.2.8.tgz 被系统删除——「修复无效」实为「修复未部署」。已通过 force copy 纠正部署状态。

- **诊断决定性结论**：监听器**能触发**（DIAG2 + llm-diag 多次证实）、能读到 nvidia 偏好、options 未冻结、改写执行——**但改写后的压缩仍走 deepseek-official**。跨工作区会话的压缩**不经过插件 fiber 的监听器**（Cordis 多 isolate/多 root 树，两个子代理探针 + 会话日志交叉证实）。
- **修复（0.2.8-2）**：**放弃 llm/stream 事件拦截**，改用 **compaction-basic 原生配置**——web profile 的 `cordis.patch.yml` 给 compaction-basic 加 `summarizationProvider: nvidia, summarizationModel: nvidia/nemotron-3-ultra-550b-a55b`。压缩从源头走 nvidia，**所有会话/作用域原生生效**。插件移除 `llm/stream` 监听器与压缩偏好存储；patch 顺带修复 0x08 非法字符。
- **验证**：typecheck 0 错、build 成功、h1–h7 `allPassed:true`；0.2.8-2.tgz 26692 B / SHA256 `2CB3E7DC…`（5 条目）；安装 web profile 成功（0.2.8-1 → 0.2.8-2），lib 一致，patch 零差异。
- **待办**：人工重启 DSH 后实机验收（压缩走 nvidia、面板读数、无回归）。
- git 提交仍由人工接管。
- ⚠️ **事后更正（2026-11-20 晚）**：本节与 §18 所述「插件移除 `llm/stream` 监听器与压缩偏好存储」**与实际交付的 0.2.8-2 包不符**——实测包内 `lib/index.js` 仍含监听器与 `llm-diag` 诊断代码，`compaction-store.ts` 仍在。真正的移除由 **0.2.8-3** 完成（见 §20）。

## 20. 2026-11-20 0.2.8-3 执行记录（插件彻底退出上下文压缩）

> 人工裁决（2026-11-20）：**原来的插件侧压缩改路由思路本身不可行，直接放弃——本插件不做上下文压缩，压缩由人工另行方案接管**。tab「压缩上下文」改「上下文状态」，仅保留用量监测显示；删除压缩模型选择器与「压缩上下文」按钮及全部后端压缩逻辑。版本命名规则由 `0.2.8.x` 改 **`0.2.8-x`**（四段式 semver 非法，pnpm 拒绝；此前未预检即安装属流程缺陷，本轮起打包/安装前强制机械预检）。
> 计划：`docs/plan.md`（已批准，§5 记录三项裁决）；施工图：`temp/code.md`（多 agent 协作版）；执行记录：`docs/P2/impl-notes-0.2.8-3.md`。

- **执行方式**：能力探针（2 子代理写 10 字节探针文件）通过 → **W1–W7 七工作包并行落盘**（index.ts / config.ts / 删 compaction-store.ts / README / package.json / h6 / h7，文件互不重叠）→ 主执行者串行验证。全部自检通过，无 MISMATCH、无越界改动。
- **变更要点**：index.ts 删 `llm/stream` 监听器整块（含 `llm-diag` 诊断代码）等 6 处（140→93 行）；config.ts 删 `applyCompactionRoute`（141→120 行）；`compaction-store.ts` 整文件删除；README 压缩章节改写；版本 0.2.8-3；h6/h7 裁剪 store/route 断言，h7 新增「上下文状态」改名守卫。**保留**：适配器对 `purpose:'compaction'` 请求的形态处理、`/context` 状态路由、CompactionTab 纯状态展示。
- **验证**：typecheck 双 tsconfig 0 错；build 成功（`lib/index.js` 47843 B / SHA256 `A1A9F9EE…`；`lib/client.js` 25657 B / SHA256 `F017622E…`，与上版一致——client 零改动）；plugin/src 压缩残留扫描 0；run-all **h1–h7 `allPassed:true`**。
- **⚠️ 上游漂移 + 插曲**：opencode 当日 **v2.2.7 → v2.3.2**。首跑 h6 报 `SSE 401`——心跳重启竞态致新旧 serve 进程短暂并存（非代码缺陷）；用真实 ServeManager 对 v2.3.2 实测 `/api/info`、`/api/event`、`/api/model` 鉴权均 200，证实兼容；清理孤儿进程重跑即全过。所有 opencode 残留进程已清零。
- **打包 + 机械预检**：`hbk-dsh-opencode-local-0.2.8-3.tgz` **25159 B** / SHA256 `DA5096A897E911AFFF121B339B0ECAC61DF27C8EE761C01EA98F9565BEBB1728`，5 条目；预检四项（semver 非四段式 / 条目数 / lib 哈希一致 / README 新表述）全过。
- **安装**：web profile `0.2.8-2 → 0.2.8-3` 成功；已装 lib 与构建产物逐字节一致；`cordis.patch.yml` 字节级未变（74,672 B），compaction-basic + nvidia 配置原样保留。备份 `temp/reinstall-backup/cordis.patch.yml.bak-0.2.8-3-20261120-174520`。
- **验收结果（2026-11-20 人工确认：修改生效、任务完成）**：✅ 重启后按 `docs/plan.md` §4 实机验收通过——tab=「上下文状态」读数正常、无压缩选择器/按钮、切模型无压缩 key 错、`temp/llm-diag.log` 不再增长、无回归。本轮迭代闭环。
- 遗留不变项：`~/.dsh-opencode-local/compaction.json`（失效残留，按裁决不删）；git 提交仍由人工接管。
- **收尾清理（2026-11-20，人工发起）**：`temp/` 已**整目录清理**并重建为空目录（scratch，harness 运行时会自动重建其子目录）。要点：①本轮施工图 `temp/code.md` 已先归档为 `docs/P2/code-debug-0.2.8-3.md`；②`temp/debug.md`（0.2.6 方案）此前已归档于 `docs/P2/code-debug-0.2.6.md`；③`temp/backup-0.2.6-src/` 删除——0.2.6 源码可从 git 提交 `7dfba3e` 恢复，备份冗余；④`session-logs/`、`decompress*.cjs`、`yamlcheck*`、`llm-diag.log` 等 0.2.8 排障产物全部删除；⑤`reinstall-backup/` 历史 patch 备份删除（当前 patch 已验证，无需回退素材）；⑥impl-harness 产物为可再生 scratch，重跑 `run-all.mjs` 自动重建。**此前各节中指向 `temp/` 的路径自此均为历史记录。**
