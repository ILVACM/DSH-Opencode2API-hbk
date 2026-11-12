# 阶段 2 · 前置探针方案（phase-2-pre）

> 状态：A 组已执行（U1–U7 定案）；B 组待人工。本版本纳入人工调整：**取消地区受限专门探测，重心为免费判定（保证显示模型免费且可用）**。施工图见 `temp/P2/code-pre.md`。
> 定位：**只做探针，不做功能实现**。目标是在阶段 2 正式实现开工前，把全部未定项 / 需验证事项逐一确认掉，产出定案记录 `temp/P2/protocol-notes.md`，为 `temp/P2/phase-2.md` 正式方案扫清地基。
> 工作目录：`temp/P2/`（探针脚本、记录、GUI spike 全在此）；参考源码零改动。
> 上游：`temp/plan.md` v6（§4 阶段 2、§5 决策表）、`temp/dsh-connect-workbuddy-analyze.md`（GUI 契约）、`temp/P0/protocol-notes.md`（已证地基）。

## 0. 宿主与已确认基础

**宿主基线：DSH 0.2.2-rc.1（Windows，人工确认）**。参考插件已在 **同版本 macOS** 上逐面实测（`dsh-connect-workbuddy-main/docs/DSH-0.2.2-RC1-FOLLOWUP.md`，2026-11-05），以下契约**已被证实**，无需重复探针，仅在本机 Windows 做轻量复核（探针组 B）：

| 已确认事项 | 证据 |
| --- | --- |
| LlmAdapter 注册面（registerAdapter/listModels/resolveModel/prepareCall/stream） | 阶段 1 实测 + 参考 followup §3.4（0.2.2 类型逐字节未变） |
| 凭据直接复用、跨会话并发、SSE text/reasoning 增量、工具拒绝回路、进程看护 | 阶段 0/1 实测双证 |
| `webServer.register({kind:'exact', handler})` 路由契约 | 参考 followup §3.3（0.2.2 保留 handler 形态，本机 200/405 全绿） |
| `settings.section` / `settings.section.icon` 槽、`dsh.client.inject` 四模块、locale.register(ns,{zh,en}) | 参考 followup §3.2/§3.6（0.2.2 全部可解析） |
| `configForms` / settings.configure(presentation, ctx.fiber)、Cordis 4.1.0 effect/inject/get | 参考 followup §3.6 |
| 主题 token `--dsw-alias-*`（带 fallback）、`llm/models-updated` 事件（目录刷新可用） | 参考 followup §3.7/§5.3 |
| 0.2.2 默认 contextWindow=1M / maxTokens=128K（仅 dsh-llm-pi-ai；我们显式赋值不受影响） | 参考 followup §3.5 |

**平台差异提醒**：参考证实于 macOS，本机为 Windows；GUI 契约理论上平台无关，探针组 B 在本机复核落地。

## 1. 硬约束

1. 一切产出在 `temp/P2/`；不改 `plugin/` 正式代码、不改三份参考源码。GUI spike 是**一次性验证品**，放 `temp/P2/gui-spike/`，验毕即弃（不进 plugin/）。
2. 探针组 A 对话预算**硬上限 10 次**（A1=0 只读元数据；A2≤1；A3≤4；余量留排障）；最小 prompt；撞限流/风控即停该项不轰炸。
3. 不读取/打印/复制用户凭据值；serve 探针密码自造、仅进程内存。
4. serve 只绑 127.0.0.1；探针进程用完即杀（复用 P0/P1 看护模式）。
5. 探针组 B 需人工配合安装 spike 到 DSH 并观察；spike 不含真实模型调用（0 对话预算）。

## 2. 待确认事项全景（每项 → 推荐默认 → 探针 → 定案）

> **免费判定核心保证（人工裁决重心）**：对话框模型选择器只显示『cost 全 0（免费）且可用性探测通过』的模型；设置页展示全部免费模型及探测状态。**地区受限不做专门探测**——运行时人工观察模型输出，受限直接切换。

| # | 未定项 | 推荐默认 | 探针 | 定案产出 |
| --- | --- | --- | --- | --- |
| U1 | 免费判定（核心：保证显示模型免费） | serve 成本元数据（cost 全 0） | A1 | 免费判定规则（A1 已证 11/11 可靠）；不可靠则回退 models.dev |
| U2 | 模型展示字段（上下文窗口/模态） | serve `limit.context` / `capabilities.input` | A1 | 字段可用性 + 缺省回退值 |
| U3 | 可用性探测（保证显示模型可用） | 最小 prompt（serve 无 maxTokens） | A2 | 探测请求形状 + 可用/不可用判定 |
| U4 | ~~地区受限专门探测~~ | **取消**（人工裁决）：运行时人工观察输出，受限直接切换 | — | 不做专门探测 |
| U5 | 工具批准 `once` 是否真放行执行 | askAll + 白名单 reply once | A3 | 批准机制定案；不执行则改 allow 规则 |
| U6 | 工具审批动作名全集（白名单 UI 用） | bash→shell（P0 已见）；其余待枚举 | A3 | 动作名词汇表 |
| U7 | 多步工具循环终态 + 真实写文件端到端 | execution.succeeded 收尾 | A3 | 多步终态证实 + 工具事件渲染字段 |
| U8 | 本机 Windows 设置卡片渲染（settings.section + ModuleLoader） | 参考契约成立 | B1 | 本机卡片可见 |
| U9 | 本机同源状态路由可达 | webServer handler 形态 | B2 | 路由 200 JSON |
| U10 | 本机配置读写是否镜像 stale | configForms 读写 + 宿主答案优先 | B3 | 读写路径定案（是否需宿主端点兜底） |

**无需前置探针**（实现期验证即可）：对外 HTTP API（OpenAI 标准格式 + 已证核心，实现期 curl 测）；逐字流式（P1 已证 delta 增量）；错误分类（P1 classifyError 已落地）。

## 3. 探针组 A · serve 侧（可自主执行，复用 P0/P1 探针模式）

### A1 · 模型元数据与免费判定（U1/U2，0 对话）

- **问题**：serve `/api/model` 返回的模型条目里，cost 结构能否可靠判定免费？上下文窗口与模态字段是否齐备？
- **方法**：起 serve → GET `/api/model`、`/api/model/default` 全量落盘 → 逐模型解析 `cost`（数组/tier/输入输出价）、`limit.context`、`capabilities.input`、`status`/`enabled`。统计 cost 全 0 的模型集合，与已知免费模型（如 big-pickle）对照。
- **产出**：免费判定规则（cost 全 0 ⇒ 免费，或其他可靠信号）；展示字段映射 + 缺省回退；若 cost 不可靠 → 标注需回退 models.dev（另立 fetched 探针）。
- **验收**：给出明确判定规则 + 字段可用性结论（双证：源码 schema + 实测样本）。

### A2 · 可用性探测（U3，≤1 对话）

- **问题**：怎样发一个最廉价的请求，确认模型真能用（保证选择器里的模型可用）？
- **方法**：设计最小探测（极小 prompt，如"Reply with exactly: ok"；serve prompt 无 maxTokens 字段，输出自然极小）；对默认模型发 1 次，期望 `execution.succeeded` ⇒ 可用。失败则记录错误形状（供设置页显示原因），**不做地区/限流的专门分档**——地区受限由人工运行时观察切换。
- **产出**：探测请求形状（endpoint/payload）+ 可用/不可用判定规则 + 单次探测成本估算。
- **验收**：ok 探测 succeeded；可用/不可用可程序化判定。
- **与 U1 合流**：选择器最终只显示「U1 判免费 ∧ U3 探测通过」的模型，二者合起来保证「显示出来的模型确实免费可用」。

### A3 · 工具批准回路（U5/U6/U7，≤4 对话）

- **问题**：放行工具后，reply `once` 真能执行吗？审批动作名有哪些？多步循环如何收尾？工具事件长什么样（供进度转播）？
- **方法**：会话权限 askAll；诱导单工具任务（如"用 bash 跑 echo probe"）→ 收 `permission.asked`（记 action 名）→ reply `once` → 验证工具真执行（`session.tool.success`）；再做多步写文件任务（如"创建 probe.txt 写入 hello 并读回"）→ 验证多步循环 + `execution.succeeded` 终态；落盘 `session.tool.called/success/input.*` 事件形状。尽量枚举动作名（bash/edit/read/write/grep/webfetch 等，结合源码 `packages/core/src/tool`）。
- **产出**：批准机制定案（once 放行 / 或改 allow 规则）；**动作名词汇表**（白名单 UI 直接用）；多步终态证实；工具事件→进度文字渲染字段。
- **验收**：once 执行被证实（或明确改 allow）；≥3 个动作名实测；写文件任务端到端跑通；工具不失控（每回合上限生效）。
- **安全**：写文件任务限定在 `temp/P2/` 内；bash 命令只用无害 echo；验毕清理 probe 文件。

## 4. 探针组 B · GUI 契约本机复核（一次性 spike + 人工安装，0 对话）

> 参考已在 macOS 0.2.2-rc.1 证实契约；本组在**本机 Windows** 落地复核，并验证我们的构建链（tsdown 双 bundle + ModuleLoader 包装）能产出 DSH 可加载的 client。spike 极简，验毕即弃。

### Spike 内容（`temp/P2/gui-spike/`，最小插件）

- 服务端 `index.ts`：name/inject/apply；`ctx.inject(['webServer'])` 注册 `GET /plugins/opencode-local-probe/ping` → `{ok:true, host:'windows', version}`；Config schema 含一个布尔 `probeToggle`。
- 浏览器 `client/index.tsx`：inject=['slots','locale']；locale.register；`slots.inject('settings.section')` 注册卡片 `OpencodeLocalProbeCard`（id='opencode-local-probe'，surface='settings'）；卡片含：① 一段文字 ② 一个按钮 fetch ping 路由显示返回 ③ 一个开关读写 `probeToggle`（configForms/settingsScope）。
- 构建：tsdown 双入口（node esm + browser cjs，ModuleLoader banner/intro/footer，react/react-dom 等 external）；package.json 带 `dsh.client`、`exports./client`、`dsh.bundle.patch`。

### B1 · 卡片渲染（U8）

- 人工：`npm pack` spike → `dsh plugin --profile web add <tgz>` → 重启 DSH → 设置页应出现 `opencode-local-probe` 卡片。
- **验收**：卡片可见、无 "Failed to load plugins" 红横幅、控制台无 client 加载错误（证实 ModuleLoader 包装 + settings.section + dsh.client.inject 在本机 Windows 成立）。

### B2 · 同源路由（U9）

- 人工：点卡片按钮 → 应显示 ping 路由返回的 JSON。
- **验收**：路由 200 且 JSON 正确（证实 webServer handler 形态 + ctx.inject 反应式等待在本机成立）。

### B3 · 配置读写（U10）

- 人工：翻动开关 → 关闭重开卡片 → 开关应保持；观察是否「保存后弹回」（镜像 stale）。
- **验收**：读写一致；若 stale → 定案需「宿主答案优先 + 宿主端点兜底」（参考 workbuddy 模式）；若正常 → 可直接用 settingsScope。
- 验毕：卸载 spike 插件，确认无残留。

## 5. 执行顺序与多 agent 编排

```
能力门（有子任务派发能力？）
  ├─ 探针组 A（自主）：T0 起 serve（复用 P1 manager）
  │     ├─ A1 模型元数据（0 对话，只读）──────────┐
  │     └─ 对话车道（串行）：A2 探测设计 → A3 工具回路 ─┤  A1 与车道可并行
  │                                              └→ A 组汇总
  └─ 探针组 B（需人工）：构建 spike → 人工安装 → B1/B2/B3 观察 → 卸载
A、B 均完成 → 汇总 temp/P2/protocol-notes.md（U1–U10 逐项定案）→ 总验收
```

- **能力门**：有子任务能力 → A1 与对话车道并行派发；无 → 串行 A1→A2→A3。B 组始终需人工配合（独立于能力门）。
- **对话车道串行**（A2→A3）保证负载与预算可控；A1 只读不耗预算，可并行。
- 预算独立计数：A2≤1、A3≤4，无共享计数器。

## 6. 产出物

| 文件 | 内容 |
| --- | --- |
| `temp/P2/phase-2-pre.md` | 本方案 |
| `temp/P2/code-pre.md` | 探针施工图（已编制，内嵌 A 组脚本 + B 组 spike 代码） |
| `temp/P2/probe/`、`temp/P2/raw/` | A 组脚本与实测记录 |
| `temp/P2/gui-spike/` | B 组一次性 spike（验毕即弃） |
| `temp/P2/protocol-notes.md` | **定案记录**：U1–U10 逐项 = 结论 + 证据（源码/实测）+ 置信度 |

## 7. 总验收（解锁阶段 2 正式实现）

- [ ] U1–U10 每项在 protocol-notes.md 有明确结论与证据；存疑项如实标注并给出处理决策
- [ ] 免费判定规则定案（serve cost 或 models.dev）
- [ ] 可用性探测形状定案；选择器「免费 ∧ 探测通过」过滤规则定案（核心保证）
- [ ] 工具批准机制 + 动作名词汇表 + 多步终态定案
- [ ] 本机 Windows GUI 三件事（卡片渲染/路由/配置读写）复核通过，spike 已卸载无残留
- [ ] A 组对话 ≤10；凭据值不落盘；参考源码与 plugin/ 正式代码零改动
- [ ] 结论足以直接写入 phase-2.md 正式方案（无遗留未定项）

## 8. 风险与故障矩阵

| 现象 | 处置 |
| --- | --- |
| serve cost 字段不可靠判免费 | A1 标注 → 增补 models.dev fetched 探针（仍在本阶段定案） |
| 探测失败的模型（含地区受限） | 不进选择器；设置页标注失败原因供人工参考；地区受限运行时人工观察切换 |
| once 不执行工具 | A3 改测 allow 规则；定案改用 allow |
| 撞限流/风控 | 停该项记录，不轰炸；换时段或请示 |
| spike 卡片不显示 / 红横幅 | 查控制台 client 加载错误（多半 react-dom 未 external 或 ModuleLoader 包装错）；修 spike 重建（spike 可改，正式 code.md 未动） |
| 配置开关弹回（镜像 stale） | B3 定案采用宿主答案优先 + 端点兜底（参考模式） |
| 子任务能力缺失 | 能力门走串行回退，结论一致 |