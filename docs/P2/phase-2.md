# 阶段 2 · 功能补充 — 正式实现方案

> 状态：**已关闭（2026-11-10）**。0.2.2 已实机验证，全部测试经人工验收通过。
> 作废标注：①探测链路（D1/D2、①⑥中探测相关部分）已被 0.2.2 施工图废止，改「全部免费模型 + 人工勾选显隐」；②「错误信息补人话 finish」经人工 2026-11-10 裁决**砍掉不做**。本文其余内容留作历史档案。
> 上游：`temp/plan.md` v6（§4 阶段 2）、`temp/P2/protocol-notes.md`（前置探针 U1–U10 定案）、`temp/dsh-connect-workbuddy-analyze.md`（GUI 契约）。
> 工作区：方案/验证产物在 `temp/P2/`；正式代码在仓库根 `plugin/`（在阶段 1 基础上增改）。
> 贯穿原则：**稳定最高优先级**；净室实现参考契约，不逐字复制。

## 1. 现状摘要（前置探针给了什么）

- **免费判定可靠**：serve `cost` 全 0 ⇒ 免费（11/11 实测，无 unknown）；`limit.context`/`capabilities.input` 齐备 ⇒ 选择器只显示「免费 ∧ 探测通过」者。
- **可用性探测**：极小 prompt 即可验活（serve prompt 无 maxTokens）。
- **工具路径 B 成立**：askAll + 按白名单 reply `once` 真放行；动作名 `shell`/`edit`/`read`（写文件动作是 **edit**）；多步循环服务端自跑、execution.succeeded 收尾；工具事件渲染字段已录（input.started.name / called.input / success.content[].text）。
- **GUI 契约本机证实**：settings.section **无条件注册**卡片才可见；配置字段须 `.volatile()`（否则 ns 不被 serve）；locale.register 包 ctx.effect；同源路由 webServer handler 形态可用；configForms 读写成立（无需宿主端点兜底）；ModuleLoader id=包名；node 入口 fixedExtension:false；react-dom 等 external。
- **P1 已具增量流式基础**（turn.ts 逐事件 yield* translateEvents），P2 完善而非从零。

## 2. 目标与范围

**做（六块）**：
- **① GUI 设置卡片**：opencode-local 卡片，两独立 tab——「可用模型」（免费模型 + 上下文窗口 + 探测状态 + 手动刷新；选择器只放免费且探测通过者）、「可用工具」（toolMode 总开关 + 逐 action 开关 + **「完全允许」**（白名单 `*`，放开所有工具）+ **每回合次数上限**输入框（默认 20，可调））。
- **② 工具能力（路径 B）**：toolMode 默认 off；开启后按白名单（action 维度）reply once 放行、其余 reject；**白名单含通配 `*`（GUI「完全允许」）时放行所有工具**；**每回合次数上限独立**（默认 20，GUI 可调），与白名单互不干扰——即使「完全允许」也照常计数限制；工具活动渲染为 text/reasoning 块（不发 DSH tool-call）。〔人工补充 2026-11-09〕
- **③ 对外 HTTP API**：OpenAI 兼容 `/v1/chat/completions` + `/v1/models`，SSE 流式；host/port 可配（默认 127.0.0.1），开放网络须显式 + token；与 DSH 入口共用核心。
- **④ 体验功能**：完善逐字流式（text/reasoning 增量，P1 已有基础）；模型目录自动刷新（与 GUI 探测同机制）；~~错误信息完善（classifyError 已落地，补人话 finish）~~〔人工 2026-11-10 裁决：砍掉不做〕。
- **⑤ 思考档位选择器（输入框右下角）**〔人工补充 2026-11-09〕：
  - 在聊天输入框右下角（模型选择器附近）加一个交互控件，给当前模型选**思考档位**；默认 `default`。
  - 选项 = `default` + **当前模型从 opencode 实时解析的档位（variants，每模型档数不同，无变体的模型只有 default）**。
  - 仅当选中模型属于 opencode-local 时显示（占位输入框右侧的 composer 槽，参考 workbuddy 组合控件位）。
  - 生效：发起对话时把选中档位作为 `variant` 传给 opencode 会话的模型引用；`default` 不传。
  - 兜底：所选档位不在当前模型档位集合内 → 回退 default；默认/上次选择存插件配置（volatile）。
  - **实现前先探针确认**：带 `variant` 建会话时 serve 是否真按档位执行（先测后定）。
- **⑥ 优先级与探测降频**〔人工补充 2026-11-09，0.2.1 修复〕：
  - **用户对话 = 最高优先级**：一旦有对话在跑，后台探测/目录刷新全部让路——不发起新探测、不与对话抢同一本地 serve/账号/DB；**对话链路永不 await 探测**。
  - **探测只在人工点「重新探测」时强制进行**；**启动不自动探测**，只读上次探测缓存 + 轻量拉一次模型列表（不发模型请求、近零成本）。
  - **首次安装（无探测缓存）**：一次性后台 bootstrap 探测（严格让路、非阻塞），出结果后选择器按「免费 ∧ 探测通过」收敛；之后仅在手动刷新时探测。
  - **手动刷新遇正在进行的对话**：先等对话这轮跑完再探测（刷新也给人让路）。
  - 结果：冷启动秒出、发对话即时应答、后台探测绝不拖慢对话。

**不做（留阶段 3）**：安全审计、双入口并发压测、工具拦截第三层（响应体扫描）、进程退避/熔断增强、正式发布打包文档。

## 3. 关键设计决策（前置探针定案 + 裁选）

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 选择器过滤 = cost 全 0 ∧ 探测通过 | 核心保证「显示模型免费可用」（U1/U3）；设置页展示全部免费模型 + 探测状态 |
| D2 | 探测：极小 prompt、结果缓存（内存 + 落 plugin 数据目录）、每轮 sweep ≤30、手动刷新重探 | U3；预算可控；地区受限不做专门探测（人工运行时切换） |
| D3 | 工具：toolMode 默认 off + 白名单按 **action**（shell/edit/read/webfetch/websearch/grep/glob…，含通配 `*`=完全允许）+ reply once + **每回合上限独立可调**（默认 20，GUI 输入框） | U5/U6/U7；白名单按 permission.asked.action；**完全允许只放开白名单、不解除次数上限，两者独立**（人工补充 2026-11-09） |
| D4 | GUI 双 bundle；settings.section **无条件注册**；配置字段 `.volatile()`；locale 包 effect；同源路由 `/plugins/opencode-local/models`(GET)+`/models/refresh`(POST) | GUI 契约实证（protocol-notes §二）；卡片可见与 settings.configure 解耦 |
| D5 | 对外 API OpenAI 兼容；默认 127.0.0.1；网络显式 + token | plan 要点 3；网络曝光=账号曝光，闸默认关 |
| D6 | 净室实现参考契约；react/react-dom/cordis/dsh-client-* external；node 入口 fixedExtension:false | 避 MIT 署名纠缠；防浏览器崩溃 |
| D7 | 逐字流式沿用 P1 增量管道，补 reasoning 增量与 DSH 端验证 | P1 已证 delta 增量 |
| D8 | **静默后台（跨切面硬要求）**：所有 Windows 子进程 spawn 加 `windowsHide:true`；serve 启动尽量解析真实 `opencode.exe` 直 spawn（不走 shell:true）；`detached:true+windowsHide:true` 后台存活且隐藏窗口；taskkill/版本探测同样 windowsHide；日志重定向文件/走 DSH logger，不占控制台 | 人工补充：运行全程后台静默，无终端窗口弹出（观感）；windowsHide 为 Node 文档化 Windows 选项 |
| D9 | **思考档位选择器**：输入框右下角控件，选项=`default`+当前模型 opencode `variants`（实时）；选中档作为 `variant` 注入会话模型引用；default 不传；无效档回退 default；选择存 volatile 配置 | 人工补充 2026-11-09；档位来自 opencode 模型元数据 variants（每模型不同）；与工具白名单/次数上限互不影响 |
| D10 | **优先级与探测降频**：用户对话最高优先，后台探测/刷新让路（不抢 serve/账号/DB、对话不 await 探测）；启动不自动探测（读缓存+轻量列表）；探测仅手动刷新强制；首装一次性 bootstrap（让路非阻塞）；手动刷新遇对话先等其完成 | 人工补充 2026-11-09；**0.2.0「启动全量探测抢资源致卡顿」的修复**；与 D2 缓存策略配套 |

## 4. 模块清单（文件级，在 plugin/ 增改）

**现有（P1，按需改）**：`src/index.ts`、`src/config.ts`、`src/types.ts`、`src/serve/client.ts`、`src/serve/manager.ts`、`src/adapter/{local-adapter,turn,translate,flatten}.ts`。

**修改**：
- `config.ts`：Config 增 `toolMode`(bool,volatile)、`toolAllowlist`(string[],volatile)、**`toolMaxPerTurn`(number,volatile,默认20,GUI可调)**、**`thinkingVariant`(string,volatile,默认default，输入框选择器写)**、`apiEnabled`/`apiHost`/`apiPort`/`apiToken`(配置文件驱动、非volatile)、`probeEnabled`/`probeMaxPerSweep`；resolveConfig 补默认；liveToolPolicy 读 toolMaxPerTurn（与白名单独立）。
- `types.ts`：增 ModelProbeResult、CatalogSnapshot、ToolPolicy、OpenAI 请求/响应类型。
- `serve/client.ts`：增模型探测 helper（复用 createSession/prompt/openSSE，极小 prompt，判 succeeded）。
- `serve/manager.ts`：启动 spawn 加 `windowsHide:true` + 解析真实 `opencode.exe` 直 spawn（找不到再回退 shell）；killTree 的 taskkill 加 `windowsHide`；日志静默（D8）。
- `adapter/local-adapter.ts`：`listModels` 改为「免费 ∧ 探测通过」过滤；`refreshModels` 接 catalog；resolveModel 用真实 limit；**按 thinkingVariant 给会话 modelRef 注入 `variant`（无效则回退 default）**；**对外暴露「用户对话活跃」状态（stream 开始置活跃、结束清除），供探测让路**。
- `adapter/turn.ts`：permission 处理按 toolMode + 白名单 once/reject（替换 P1 一律 reject）；工具事件计数 + 上限；工具活动渲染为 text/reasoning 块。
- `adapter/translate.ts`：补 session.tool.* → 进度 text/reasoning 块；reasoning 增量完善。
- `index.ts`：接线目录（**启动仅 loadCache + 轻量列表刷新，不自动探测**）、web 路由、API server、settings.configure（ctx.inject(['settings'])）、client bundle 注册；探测由手动刷新触发。
- `package.json`：双 bundle 构建脚本、`dsh.client`、`exports./client`、react 及 dsh-client-* devDeps、`files` 含 lib。

**新增**：
- `src/catalog/probe.ts`：免费判定（cost 全 0）+ 可用性探测 + 缓存 + 预算封顶；**暴露每模型的 `variants` 档位列表**；**探测仅在手动刷新/bootstrap 时进行，且每次探测前检查「用户对话活跃」则等待让路；不阻塞 listModels**。
- `src/client/ThinkingLevelSelect.tsx`：**输入框右下角思考档位选择器**（composer 右侧槽；仅 opencode-local 选中模型显示；选项=default+当前模型 variants；写 `thinkingVariant`）。
- `src/web/routes.ts`：`ctx.inject(['webServer'])` 注册 `/plugins/opencode-local/models`(GET 返回全部免费模型+探测状态)、`/models/refresh`(POST 重探)。
- `src/api/server.ts`：对外 OpenAI 兼容 HTTP 服务（node:http，独立 host:port，token 鉴权，/v1/models + /v1/chat/completions 含 SSE），复用 adapter 核心。
- `src/client/index.tsx`：浏览器入口（name/inject=['slots','locale']/apply；locale 包 effect；settings.section 无条件注册卡片；configForms 绑定 scope）。
- `src/client/OpencodeLocalCard.tsx`：卡片壳 + 两 tab（hidden 保持挂载）+ 错误边界。
- `src/client/ModelsTab.tsx`：fetch models 路由 → 表格（模型名/上下文/探测档位）+ 刷新按钮 + 轮询。
- `src/client/ToolsTab.tsx`：toolMode 总开关 + 逐 action 开关 + **「完全允许」勾选**（写 toolAllowlist=['*']）+ **每回合次数上限数字输入**（写 toolMaxPerTurn，默认 20）（settingsScope 读写）。
- `src/client/{styles.ts,locales.ts,status-paths.ts}`：CSS（主题变量+回退）、zh/en 文案、node-free 路由常量+共享类型。
- `tsdown.config.ts`（双入口 node+client，ModuleLoader 包装，external，fixedExtension:false）、`tsconfig.client.json`。

## 5. 验证与验收

### 5.1 开发期（node harness，复用 P1 模式 + 新增）
- 免费过滤：catalog 判免费 + 探测通过者进 listModels，失败者不进。
- 工具：toolMode on + 白名单 → 诱导 shell/edit 任务 once 放行执行；白名单外 reject；**「完全允许」放行所有工具**；**次数上限独立生效且可调**（如设 1 时第二次被拒，且完全允许下也生效）；toolMode off 回归 P1 行为。
- 思考档位：模型 `variants` 透出正确；选择器选项 = default + 当前模型档位；选档后会话 modelRef 带 `variant`（探针确认 serve 按档位执行）；无效档回退 default。
- 优先级与降频：启动不自动探测（0 模型请求，秒出缓存）；探测仅手动刷新触发；**探测进行中发起对话 → 对话立即完成、探测让路延迟**；对话链路从不等待探测。
- 流式：text/reasoning 增量 chunk 序列正确，usage+finish 收尾。
- API：起 API server → curl `/v1/models` + `/v1/chat/completions`（含 stream）完整对话；token 鉴权（无 token 拒）；默认仅 127.0.0.1。
- 看护/dispose 回归（P1 h4/h5）。
- 静默后台：运行/测试全程无终端窗口弹出（windowsHide 生效）；日志只落文件/DSH logger。

### 5.2 DSH 实机（人工）
- 设置页 opencode-local 卡片两 tab 可用；可用模型 tab 显示免费模型+上下文+探测状态，刷新按钮重探；选择器只出现免费且探测通过者。
- 可用工具 tab 全局/逐项开关读写持久（volatile）。
- 开 toolMode 后 DSH 里让模型跑命令/改文件真执行；白名单外被拒。
- DSH 逐字出字；**输入框右下角思考档位选择器可选 default 与当前模型档位，切换模型选项随之变化，选后生效**。
- **冷启动模型列表秒出、不卡；发对话即时应答；点「重新探测」才发探测、且探测中发对话不受影响**。
- 卸载/重启无残留、自动恢复。

### 5.3 对外 API（人工/脚本）
- 外部 OpenAI 客户端经 `http://<host>:<port>/v1` 完整对话（含流式）；网络监听 + token 生效。

## 6. 风险与开放问题

| 风险 | 应对 |
| --- | --- |
| GUI 正式卡片比 spike 复杂（两 tab+探测 UI） | 契约已 spike 证实；增量搭建，先 ModelsTab 再 ToolsTab |
| 探测额度（模型多） | 缓存 + 每轮 ≤30 + 手动刷新；免费模型当前 11 个，开销可控 |
| 工具在本机真实执行 | toolMode 默认 off + 白名单 + 上限；用户显式开启才放行 |
| API 网络曝光 | 默认 127.0.0.1 + token；网络显式配置 |
| DSH 版本线差异 | 基线 0.2.2-rc.1 已证；configForms.whileServed + 无条件注册兼容晚绑定 |
| volatile 活引用读取 | 服务端读 config 解包 {get()}（protocol-notes 已证） |

## 7. 执行顺序建议（供 code.md 多 agent 编排）

1. 脚手架改造（package.json 双 bundle / tsdown.config / tsconfig.client / dsh.client）+ config/types 扩展。
2. 并行模块（冻结 types 契约后）：
   - A：catalog/probe.ts + serve/client 探测 helper + local-adapter 过滤
   - B：adapter/turn.ts 工具策略 + translate.ts 工具/reasoning 渲染
   - C：web/routes.ts + api/server.ts
   - D：client/*（GUI 两 tab）
3. 集成 index.ts 接线 + typecheck + build（停止门）。
4. harness 开发期验证（对话预算封顶）。
5. 打包 0.2.0 + 人工 DSH/API 实机验收。

> 并行价值在模块实现（A/B/C/D 互不依赖实现细节，只依赖冻结 types）；集成与验证串行。能力门同 P0/P1：有子任务能力则并行派发，无则串行同一任务包。