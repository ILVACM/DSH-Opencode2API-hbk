# 阶段 1 · 最小可用 DSH 插件 — 方案

> 状态：**已人工裁决**（2026-11-07，见 §0）。下一步：编制确定性施工图 `temp/P1/code.md`，经人工审核后开工。
> 上游依据：`temp/plan.md`（总计划 §0 四要点 + §4 阶段 1 定义）、`temp/P0/protocol-notes.md`（协议实测结论，全部双证）。
> 本阶段工作区：方案与验证产物在 `temp/P1/`；**正式插件代码放仓库根 `plugin/`（已裁决）**。

## 0. 人工裁决记录（2026-11-07，最高优先级）

1. **代码位置与分工**：插件代码放仓库根目录，代码结构参考任意成熟插件实现；git 与方案资料的归档跟踪由人工接管——本项目只管分析、设计、实现。
2. **纯聊天定案**：阶段 1 接受 DSH 工具功能不可用。
3. **稳定是最高优先级**：每次对话的"重复打包"代价接受；额外上下文开销、内存占用均为可接受代价。一切设计取舍以稳定为先，不做聪明但脆的优化。
4. **验收参与**：人工参与 DSH 实装验收（§6.2）。
5. 其余已裁选项全部支持。

## 1. 现状摘要（阶段 0 给了什么）

- **协议全通**：五组接口（建会话/发消息/收事件/列模型/审批）形状实测确认，v2.2.6 与源码一致。
- **命根子成立**：serve 用默认数据目录启动即复用本机 CLI 登录，无需任何凭据操作。
- **并发成立**：不同会话同时各跑各的回合，事件按 `data.sessionID` 分流零串话。
- **安全底座成立**：会话级 `permissions:[{action:"*",resource:"*",effect:"ask"}]` 通配生效，`permission.asked` 走 SSE 推送，reply reject 后工具不执行、回合正常结束。
- **生命周期**：`/api/info` 就绪探测 + `taskkill /T /F` 杀树有效；首轮的无声死亡经复核归因于用户当时并行使用，但看护（心跳+重启）仍是必备品。
- **DSH 插件契约已从参考实现完整核实**（见 §4 契约速查）。

## 2. 目标与范围

**目标**：装进 DSH 后，模型选择器出现本地 opencode 的模型，能完整聊一回合；模型无法在本机执行任何工具；插件卸载/重启后无进程残留。

**做**：插件脚手架、serve 子进程看护最小版、单回合打通（整回合收齐后翻译成 chunk 流，先不做逐字增量）、工具拦截最小版、错误→finish 映射。

**明确不做（留给后续阶段）**：
- SSE 逐字增量流式（阶段 2）
- 对外 HTTP 转发 API（阶段 2）
- DSH 工具透传（client-mcp 路径评估，阶段 2+；P1 中 DSH 的 agent 工具不可用，纯聊天）
- 崩溃熔断/复杂重试（阶段 3；P1 只有单次自动重启）
- opencode 原生 agent 能力暴露（始终拦截）

## 3. 关键设计决策（已裁选，记录理由）

| # | 决策 | 理由 / 替代方案 |
| --- | --- | --- |
| D1 | **无状态回合**：每次 `stream()` 新建 opencode 会话，把 DSH 传来的完整历史压平成一个 prompt 发送（**已裁决：稳定优先，开销接受**） | DSH 每回合都传全量 messages，服务端无需会话记忆；压平最简单、绝无历史漂移。替代：复用 opencode 会话（历史重复累积，弃）；`/api/experimental/session/import` 回放真历史（更保真但实验性接口，阶段 2+ 评估） |
| D2 | 插件代码放仓库根 `plugin/`（单包），代码结构参考成熟插件实现（**已裁决**） | git 与方案资料归档由人工接管，插件不操心 |
| D3 | provider id 默认 `opencode-local`，可在配置改 | 在 DSH 选择器里直观表示"本机 opencode"；替代沿用 `opencode2dsh`（会和参考插件混淆，弃） |
| D4 | serve 密码每次插件启动随机生成，只存在进程内存，不落盘 | P0 用固定值是为了让探针脚本共享；插件没有这个需求，随机更安全 |
| D5 | 端口从 4096 起扫描试绑；健康看护：10s 心跳 `/api/info`，失败自动重启（退避 1s→30s，单次），重启后模型目录失效即报错 | 阶段 0 实测结论直接沿用；熔断留给阶段 3 |
| D6 | 工具拦截用 **SSE 事件驱动的 ask-then-reject**（收到 `permission.asked` 立即 reply reject），每回合拒绝数上限 20 | 比 v1 参考实现的轮询 `/permission` 更实时（v2 事件面已实测推送）；响应体扫描兜底留阶段 3 |
| D7 | 会话 title 用 `dsh-<会话摘要>` 前缀 | 用户在 CLI 历史里能识别、手动清理 |
| D8 | 依赖最小化：仅 `@deepseek-ai/schemastery`（Config schema 必需）+ tsdown 构建；HTTP/SSE 全用 Node 原生 fetch | P0 探针已证明零依赖可行；参考插件的 pi-ai/undici 我们用不上 |

## 4. DSH 插件契约速查（从参考实现逐行核实）

- **插件形态**：cordis 插件，npm 包 `main: lib/index.js`，`package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`（内容：`insert: [{id, name, config}]`）；`dsh plugin --profile web add <tgz>` 安装；需 DSH ≥ 0.1.7。
- **入口导出**：`name`、`Config`（schemastery schema，设置页据此渲染）、`inject: ['llm']`、`apply(ctx, config)`。
- **ctx 面**：`ctx.logger.{info,warn,error}`；`ctx.llm.registerAdapter([providerId], adapter)` 返回带 `.replace()` 的句柄；`ctx.effect(() => disposer)` 注册纤维回收。
- **LlmAdapter 结构化契约**（无需 import 宿主类型）：
  - `providerInfo(provider) → {id, name}`
  - `providerRetryPolicy(provider) → {mode:'normal', maxRetries, retryableCodes, initialDelayMs, maxDelayMs, jitterRatio}`
  - `imageRequestPricing(provider, model) → undefined`
  - `listModels(provider) → Promise<{provider,id,name,inputModalities}[]>`（宿主会 await 并缓存）
  - `resolveModel(provider, model) → {provider,id,name,inputModalities,context:{contextWindow},defaultMaxTokens,reasoning?}`
  - `prepareCall(provider, model, signal?) → Promise<{model, stream}>`
  - `stream(options) → AsyncGenerator<HarnessChunk>`（**必须以 usage + finish 结尾**）
- **HarnessGenerateOptions**：`{provider, model, messages: [{role: system|user|assistant|tool, content: blocks[], toolCallId?}], system?, tools?, maxTokens?, temperature?, reasoning?, reasoningEffort?, signal?}`
- **HarnessChunk**：`block-start{text|reasoning|tool-call}` / `text-delta` / `reasoning-delta` / `tool-call-delta` / `block-end` / `usage{inputTokens,outputTokens,cacheRead?/Write?}` / `finish{reason: stop|max-tokens|tool-calls|aborted|error}`。
- **错误分类码**（providerRetryPolicy 的 retryableCodes 按此）：`RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT/EMPTY_RESPONSE` 可重试；`AUTH/REGION_BLOCKED/INVALID_REQUEST/UPSTREAM` 不重试。

## 5. 模块清单（文件级）

```
plugin/
├── package.json              # 仿参考：main lib/index.js、dsh.bundle.patch、tsdown build、engines node>=20
├── cordis.patch.yml          # insert: [{id: opencode-local, name: '@hbk/dsh-opencode-local', config: {}}]
├── tsconfig.json
└── src/
    ├── index.ts              # 入口：Config 导出、apply（注册 adapter + 看护启动）、effect 释放
    ├── config.ts             # schemastery schema：providerId、opencodePath?、portBase?、modelWhitelist?、
    │                         #   firstEventMs?、idleMs?、titlePrefix；默认值全可用
    ├── serve/
    │   ├── manager.ts        # 看护：二进制解析（显式配置→PATH）→ 选端口 → spawn（随机密码 env）→
    │   │                     #   /api/info 就绪等待 → 10s 心跳 → 失败单次自动重启 → dispose 杀树验证
    │   └── client.ts         # serve API 薄客户端：Basic 鉴权 request、SSE 解析、模型/会话/审批封装
    │                         #   （直接以 P0 probe/lib.mjs 实测代码为底子改写）
    └── adapter/
        ├── local-adapter.ts  # LlmAdapter 契约实现：providerInfo/retryPolicy/listModels/resolveModel/
        │                     #   prepareCall/stream（对照 zen-adapter.ts 的壳，去掉一切 Zen 匿名车道逻辑）
        ├── turn.ts           # 单回合编排：建会话(model+askAll permissions) → 先连 SSE → 压平历史发 prompt →
        │                     #   收事件至终态 → translate 出 chunk；signal 中断 → /interrupt；看门狗
        │                     #   （首事件 30s / 流中静默 120s，超时按 TRANSPORT 报错）
        ├── translate.ts      # v2 事件 → HarnessChunk：text.*/reasoning.* → block 系列；
        │                     #   usage.updated → usage；execution.succeeded/failed/interrupted → finish
        │                     #   （成功必须有正文，否则 EMPTY_RESPONSE 错误；失败取 data 错误信息）
        └── flatten.ts        # HarnessMessage[] → 单 prompt 文本（system 前置 + role 标注逐条转写；
                              #   tool-result 块 P1 简单文本化并标注）
```

## 6. 验证与验收

### 6.1 开发期验证（不装 DSH，node 测试台直接驱动 adapter）

`temp/P1/` 内建测试脚本（复用 P0 探针模式）：
1. **单回合**：构造 HarnessGenerateOptions（system + 两轮历史），断言 chunk 流以 usage+finish 结尾、text 块非空。
2. **工具拦截**：诱导 prompt（复用 P0 文本），断言 `permission.asked` 被 reject、无工具执行、回合正常 finish。
3. **中断**：发出 prompt 后 2s abort signal，断言 serve 会话被 interrupt、finish 为 aborted。
4. **看护**：手动 kill serve，断言心跳检测到、自动重启成功、模型目录恢复。
5. **dispose**：卸载路径调用后断言连接拒绝、无残留进程。

### 6.2 DSH 实装验收（人工参与，已裁决确认）

- [ ] `dsh plugin --profile web add <tgz>` 安装成功（先核实 DSH 版本 ≥ 0.1.7）
- [ ] 模型选择器出现 `opencode-local` 分组及本机模型
- [ ] 完整聊一回合，回答正常出现在 DSH 界面
- [ ] 让模型尝试执行命令 → 被拒、无本机执行痕迹
- [ ] DSH 里关闭/重载插件 → serve 进程被回收（任务管理器核查）
- [ ] 重启 DSH → 插件自动恢复可用

## 7. 风险与开放问题

| 风险 | 应对 |
| --- | --- |
| DSH 桌面版实际版本未知（契约要求 ≥0.1.7） | 6.2 第一步先核实版本；不满足则先升级 |
| reasoning 事件字段名仅源码推断（P0 只实测了 text.*） | 实现时对照 `schema/src/session-event.ts`；用思考模型实测一轮补证 |
| opencode 自带 agent 系统提示会污染回答风格（实测单回合开销 ~5.8k tokens） | **已裁决接受**（裁决 3）；阶段 2 仍可评估 `OPENCODE_CONFIG_CONTENT` 精简指令 |
| 历史压平丢失结构（工具调用历史等） | P1 纯聊天无感（裁决 2）；阶段 2+ 评估 session/import 回放真历史 |
| 压平后超长历史超上下文 | resolveModel 的 contextWindow 由 serve 模型信息提供；P1 不做裁剪，报错诚实透出 |
| DSH 每回合全量重发历史 → 每回合新会话+全量 token | **已裁决接受**（裁决 3：稳定最高优先级）；阶段 2 评估复用优化 |

## 8. 执行顺序建议（供 code.md 细化）

1. 脚手架（package.json / cordis.patch.yml / tsconfig / 目录）
2. `serve/client.ts` ← P0 探针代码改写（已有实测基础，最先做）
3. `serve/manager.ts`（看护）
4. `adapter/flatten.ts` → `translate.ts` → `turn.ts` → `local-adapter.ts`
5. `index.ts` + `config.ts` 接线
6. 6.1 测试台五项验证
7. 打包 tgz → 6.2 DSH 实装验收（需人工配合）

步骤 2-4 相互独立度高，可多 agent 并行（client/manager/flatten+translate 三路），code.md 按此编排。