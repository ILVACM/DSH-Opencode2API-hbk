# 阶段 2 前置探针 · 定案记录（protocol-notes）

> 执行日期：2026-11-08；宿主 DSH 0.2.2-rc.1（Windows）；opencode v2.2.6。
> A 组对话预算：实际 3 / 上限 10（a1=0、a2=1、a3=2）。B 组 0 对话（人工实机）。
> 结论：**U1–U10 全部定案（U4 按人工裁决取消），无遗留未定项 ⇒ 解锁阶段 2 正式实现。**
> 证据：`temp/P2/raw/`（A 组）、人工观察（B 组）、宿主 app.asar 源码（GUI 契约）。

## 一、逐项定案

| # | 事项 | 结论 | 证据 | 置信度 |
| --- | --- | --- | --- | --- |
| U1 | 免费判定（核心） | **serve cost 全 0 ⇒ 免费，可靠**。11/11 模型 cost 数组 input/output/cache.read/write 全 0，无 unknown。无需 models.dev 回退 | raw/a1-models-result.json（freeCount=11） | 双证 |
| U2 | 展示字段 | `limit.context`（上下文窗口）、`capabilities.input`（模态）齐备。big-pickle：ctx 200000 / out 32000 / input["text"] | raw/a1-models-result.json fieldsPresent 全 true | 双证 |
| U3 | 可用性探测 | 极小 prompt `Reply with exactly: ok` 即可验活（serve prompt **无 maxTokens**，输出自然极小）；succeeded ⇒ 可用 | raw/a2-probe-result.json ok.terminal=succeeded | 双证 |
| U4 | 地区受限 | **取消专门探测**（人工裁决）：运行时人工观察模型输出，受限直接切换；探测只判可用/不可用 | plan.md 决策表 | 裁决 |
| U5 | 工具批准 once | **once 真放行执行**。shell 工具 reply once → toolSuccess=1 | raw/a3-tools-result.json onceExecutes=true | 双证 |
| U6 | 动作名词汇表 | 实测 `shell`（跑命令）、`edit`（写/改文件）、`read`（读文件）。**写文件权限动作是 edit 不是 write**；白名单按 permission.asked.action 过滤。源码候选另有 webfetch/websearch/grep/glob/skill/question | raw/a3-tools-result.json actionsObserved + core/src/tool/plugin/* | 双证（3 个）+源码 |
| U7 | 多步工具循环 | 写文件→读回→确认多步服务端自跑，execution.succeeded 收尾，文件真写出（hello-p2）。工具事件渲染字段见下 | raw/a3-tools-result.json multi.fileWritten=true + a3-multi.jsonl | 双证 |
| U8 | 设置卡片渲染 | **本机 Windows 卡片可见**，无红横幅（settings.section 无条件注册 + ModuleLoader 包装成立） | 人工 B1 + v0.0.2 | 实测 |
| U9 | 同源状态路由 | ping 返回 `{ok:true,host:"windows-probe",version:"0.0.2",probeToggle:true}`（webServer handler 形态 + ctx.inject 反应式等待成立） | 人工 B2 | 实测 |
| U10 | 配置读写 | 翻动开关→重开卡片保持；服务端读回 probeToggle=true（默认 false）。**volatile 字段 + configForms 读写成立，无需宿主端点兜底** | 人工 B3 + ping probeToggle=true | 实测 |

## 二、GUI 契约关键发现（宿主 app.asar 源码实证，正式实现必遵）

1. **卡片可见 ⟺ 客户端 settings.section 的 register 落地，与 settings.configure 无关**（autoGenerate 默认 true）。必须**无条件注册卡片**，配置面绑定只是 afterward 刷新 props 的可选增强（参照 workbuddy src/client/index.tsx:863）。
2. **配置字段必须 `.volatile()`**：宿主 dsh-settings `volatileForm(schema)` 只保留 volatile 字段，全非 volatile → 命名空间永不被 serve → configForms.whileServed 永不触发。schemastery ≥3.18.3 提供 `.volatile()`；volatile 字段在 config 对象里是活引用 `{get()}`，读取需解包。
3. **locale.register 必须包 ctx.effect**（否则重复 apply 抛 already has locale 被静默吞掉，整卡不注册）。
4. **client bundle 行 id = 包名**；ModuleLoader banner 的 id 必须等于包名；`include:` 前缀只改 settings ns，不改 client 行 id。
5. **构建**：node 入口须 `fixedExtension:false`（否则输出 .mjs 与 package.json main=lib/index.js 不符）；react/react-dom/cordis/dsh-client-* 必须 external（react-dom 打进 bundle 会浏览器崩溃）；client 用 ModuleLoader banner/intro/footer 包装。
6. **宿主只 serve active 条目**（fiber.state===2）：插件须启用，仅安装不够。
7. 设置导航无条件投影全部 settings.section 条目（list/root 槽）；order 决定位置（spike 用 50，参照 35）。

## 三、工具事件渲染字段（U7，供正式实现进度转播）

- `session.tool.input.started.data`：`{name}`（工具名）+ sessionID/assistantMessageID/id。
- `session.tool.called.data`：`{sessionID, assistantMessageID, id, input:{...参数}, executed}`。
- `session.tool.success.data`：`{sessionID, assistantMessageID, id, content:[{type:"text",text:"结果描述"}], metadata}`。
- 进度文字建议：`[工具] <name> <input 摘要>` → 成功后 `[完成] <content[].text>`。渲染为 text/reasoning 块，**不向 DSH 发 tool-call 块**。

## 四、对阶段 2 正式实现的设计输入

1. **免费+可用过滤（核心保证）**：选择器只显示「cost 全 0 ∧ 探测通过」的模型；设置页展示全部免费模型 + 探测状态。探测用极小 prompt，结果缓存，每轮 sweep 封顶 ≤30。
2. **工具能力（路径 B）**：会话权限 askAll；按白名单（action 维度：shell/edit/read/webfetch/…）reply once 放行，其余 reject；每回合上限防失控；toolMode 默认 off。GUI 工具 tab = 全局开关 + 逐 action 开关。
3. **GUI**：双 bundle；settings.section 无条件注册卡片（两 tab：可用模型/可用工具）；配置字段 volatile；同源路由 `/plugins/opencode-local/models`（GET）+ `/models/refresh`（POST）；locale 包 effect；react-dom external；node 入口 fixedExtension:false。
4. **对外 API**：OpenAI 兼容，复用已证核心，实现期 curl 验证（无需前置探针）。
5. **逐字流式/错误分类**：P1 已证 delta 增量与 classifyError，直接沿用。

## 五、总验收（phase-2-pre §7）

- [x] U1–U10 逐项有结论与证据（U4 取消）
- [x] 免费判定规则定案（serve cost 全 0，可靠）
- [x] 可用性探测形状 + 「免费 ∧ 探测通过」过滤规则定案
- [x] 工具批准机制（once）+ 动作名词汇表 + 多步终态定案
- [x] 本机 Windows GUI 三件事（卡片/路由/配置读写）复核通过
- [x] A 组对话 3≤10；凭据值不落盘；参考源码与 plugin/ 正式代码零改动
- [x] 无遗留未定项 ⇒ 可写入 phase-2.md 正式方案
- [ ] spike 卸载（人工，验毕执行 `dsh plugin --profile web remove opencode-local-probe`）