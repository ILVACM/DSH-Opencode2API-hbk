# 阶段 0 协议核实结论（opencode v2.2.6 实测）

> 执行模式：**parallel**（Qoder Agent 子任务 A=T1，子任务 B=对话车道 T2→T3→T4）；执行日期：2026-11-07
> 对话请求总数：**4 / 10**（T2=1，T3=2，T4=1）
> 施工图：`temp/P0/code.md`；验证项定义：`temp/P0/phase-0.md`
> 版本说明：实测 CLI/serve 为 **2.2.6**，源码快照（temp/opencode-dev）为 2.2.5，接口形状实测与源码一致，未发现漂移。

## V1 · 五组接口形状（置信度：双证）

五组接口全部实测通过（`raw/t1/manifest.json`，12 步全记录）：

| 接口 | 实测形状 | 源码出处 |
| --- | --- | --- |
| 健康 | `GET /api/info` → 200 `{version,pid,...}`；就绪前 503 | `protocol/src/groups/server.ts:45`；`server/src/process.ts:197-227` |
| 建会话 | `POST /api/session` payload 全可选 `{title?,model?:{id,providerID},permissions?:[{action,resource,effect}]}` → `{data:Session.Info}`（实测键：id,projectID,cost,tokens,time,title,subpath,location） | `protocol/src/groups/session.ts:165-175` |
| 发消息 | `POST /api/session/:id/prompt` payload `{text 必填,delivery?:"steer"\|"queue",resume?}` → **异步入队**即返回；回合经 SSE 事件推进 | `session.ts:337-345` |
| 收事件 | `GET /api/event` SSE；信封 `{id:"evt_...",created(ms),type,location:{directory},data}`；首帧 `server.connected`，15s 心跳 | `groups/event.ts:61`；`server/src/handlers/event.ts:13-23`；`schema/src/event.ts:108-116` |
| 审批 | 挂起列表 `GET /api/session/:id/permission`；回复 `POST /api/session/:id/permission/:requestID/reply {decision:"once"\|"always"\|"reject",message?}` → 204 | `groups/permission.ts:114-149` |
| 模型 | `GET /api/model/default` → `Model.Info{id,modelID,providerID,...}`；`GET /api/model` → 数组 | `groups/model.ts:17-46`；`schema/src/model.ts:114-138` |

- 鉴权：HTTP Basic，用户名固定 `opencode`；401 体 `{"_tag":"UnauthorizedError","message":"Authentication required"}`（`raw/t1/unauthorized.json`；`server/src/auth.ts:20,33-37`）。
- 错误样本：401、404（不存在会话，`raw/t1/session-get-404.json`）均落盘。
- 事件词汇（t2 一回合实测全集）：`session.inbox.enqueued/delivered → session.execution.started → session.step.started/streamed/ended → session.text.started/delta/ended → session.usage.updated → session.execution.succeeded`，另有 `session.instructions.updated`。**delta 字段名为 `delta`**（`raw/t2/events.jsonl`）。
- serve 本地密码经 `OPENCODE_PASSWORD` 注入生效；无该变量时启动行会打印随机密码（`cli/src/server-process.ts:91-97,207-209`）。

## V2 · 凭据直接复用（置信度：双证）

- **结论：成立**。serve 未做任何登录动作、用默认数据目录，直接聊通（T2 `ok=true`，`raw/t2/result.json`）。
- 机制：凭据在 SQLite `credential` 表（`~/.local/share/opencode/opencode.db`，`core/src/credential/sql.ts:5-14`）；serve 启动即按 `databasePath(global.data)` 打开同一 DB（`cli/src/server-process.ts:114-116`、`cli/src/database-path.ts:4-13`）；auth.json 仅作一次性遗留导入（`core/src/database/migration/20260805200742_import_legacy_credentials.ts`）。**不设** `XDG_DATA_HOME`/`OPENCODE_DB`、保持同 HOME 即复用登录。
- OAuth 自动刷新：距过期 <5 分钟自动续（`core/src/integration.ts:699-729`，仅源码）。
- 实测回合 usage：`{cost:0, tokens:{input:5801, output:3, reasoning:0, cache:{read:2546}}}`——单回合系统提示开销约 5.8k tokens（对阶段 1 的计费/延迟设计有参考价值）。

## V3 · 并发模型（跨会话：双证；同会话排队：仅源码）

- **结论：不同会话可并行**。T3 双会话同批 prompt（时间戳差 1ms），双双 `execution.succeeded`，事件按 `data.sessionID` 分流互不串话（`raw/t3/result.json`、`events-a/b.jsonl`）。
- 同会话连发：入队不拒绝，`steer` 在步边界插入、`queue` 等空闲（`core/src/session/run-coordinator.ts:6,131-140`、`session/inbox.ts:52-57`，仅源码）。
- 中断：`POST /api/session/:id/interrupt`（`session.ts:672-689`，未实测）。

## V4 · 工具拦截与透传（拦截：双证；透传路径：仅源码）

- **permission 回路实测打通**：会话级 `permissions:[{action:"*",resource:"*",effect:"ask"}]` 通配生效——模型调 shell 时产生 `permission.asked {action:"shell",resources:["echo p0-probe"],source:{type:"tool",...}}` → 回复 `reject` → 工具未执行（`toolSuccess=0`），回合正常结束（`raw/t4/result.json`、`events.jsonl`）。**通配符 ask 验证有效，插件可直接复用此载荷。**
- DSH 工具透传：prompt 请求**无 tools 字段**（`schema/src/prompt-input.ts:25-30`），常规途径不可行；**潜在路径**为实验性 client-mcp WebSocket（`PUT /api/experimental/mcp/:server`、`GET /api/experimental/client-mcp`，`protocol/src/groups/mcp.ts:120,139-153`），客户端可自托管 MCP 工具——留给后续阶段评估，阶段 0 不实测。
- 判坑经验确认：v2 失败有显式 `session.execution.failed` 事件，判成败看终态事件即可。

## V5 · 健康与生命周期（端点：双证；异常一例：存疑）

- 启动：`opencode serve --hostname 127.0.0.1 --port <p>`（default 模式），数秒内 `/api/info` 就绪；探针密码固定注入。
- 回收：`taskkill /PID <pid> /T /F` 杀树有效，杀后连接拒绝（补救脚本二次验证，`raw/t5/cleanup-retry.json`）。
- **异常记录**：首轮 serve 在 T4 结束后、T5 之前**无声死亡**（serve.log 空，无任何输出），T5 首轮 DELETE 因此全部 `fetch failed`。同时刻（14:01:15）系统出现两个**非探针**的 opencode 进程，其一为 `serve --service`（托管服务模式，疑似 DSH 或 opencode 自身拉起，安装路径与本探针不同，未触碰）。死因未定，已在补救脚本重启-清扫-回收闭环。**阶段 1 必须带健康看护（心跳 + 自动重启）**。

## 与 v1 参考实现（opencode2dsh delegate）的差异清单

1. 健康端点：`/api/info`（非 `/global/health`）。
2. 发消息：异步入队 + SSE 终态（非同步 `POST /message`）；不再有"HTTP 200 藏 `info.error`"判坑。
3. 审批路径：`/api/session/:id/permission/:requestID/reply`（非 `/permission/{id}/reply`）。
4. 凭据：SQLite `credential` 表 + 默认数据目录直用（非 auth.json 复制种子），插件零凭据保管。
5. `--pure` 旗标 v2 serve 不存在（仅文档残留）；隔离用 `OPENCODE_DISABLE_*` 环境变量族。
6. SSE 信封与事件名全变（`session.text.delta` 等；`message.part.*` 是 V1-only 不可用）。
7. 模型不能随 prompt 逐请求指定，只能建会话时或 `POST /api/session/:id/model` 设定。
8. 用户机上可能已有 `opencode serve --service` 托管实例（win 默认端口 28894）——插件选端口必须扫描，未来可评估直接复用托管实例。

## 对阶段 1 的设计输入

1. LlmAdapter 流映射：DSH 回合 → 建会话（model + askAll permissions）→ prompt → SSE 转发（text/reasoning delta、usage、finish=execution 终态）。
2. 进程看护：spawn serve（default 模式）→ 轮询 `/api/info` → **心跳看护 + 崩溃自动重启**（V5 异常的教训）。
3. serve 工作目录决定会话 location（实测 `location.directory` = serve cwd）——插件应显式选择 cwd 或用 `location[directory]` 参数。
4. 会话 title 前缀策略沿用 `p0-probe-` → 插件用 `dsh-` 前缀便于用户在 CLI 历史识别。
5. 双入口共用核心：每入口会话独立（V3 已证并发安全）；外部 API 层（阶段 2）按会话映射复用同一套探针验证过的端点。

## 总验收（code.md §6.2）

- [x] runtime.json 存在，version=2.2.6 与 CLI 一致（CLI 已从源码快照 2.2.5 升到 2.2.6，接口无漂移）
- [x] raw/t1/ 12 步齐全（含 401、404 错误样本）
- [x] T2 terminal 有值且 ok=true（停止门未触发）
- [x] T3 双终态，crossTalk=false
- [x] T4 branch=asked-rejected，toolSuccess=0
- [x] 本文档覆盖 V1–V5，每项有源码出处 + 实测样本 + 置信度
- [x] cleanup：connectionRefused=true；4 个探针会话全删、remainingP0=0（首轮因 serve 意外死亡失败，已补救闭环并有解释）
- [x] prompts 合计 4 ≤ 10
- [x] 两份参考源码零改动；temp/P0 外无新建文件（补救脚本 probe/t5-remediate.mjs 在 P0 内，属故障矩阵处置）
- [x] temp/P0 全部文件无用户凭据值（仅探针自造密码）

---

## 复核附记（2026-11-07 14:12，干净环境）

> 背景：人工确认首轮探针期间（约 14:00–14:03）本人正在并行使用 opencode，现已关闭。为排除干扰做最小复核：备份首轮证据（`raw-round1/`、`runtime-round1.json`）后干净重跑 T0/T2/T3，静默 90 秒复现"探针结束→清理"时间窗后跑 T5。对话累计预算 7/10（本轮 3 次）。

### 两轮对照

| 项 | 首轮（有并行使用） | 复核轮（干净） | 结论 |
| --- | --- | --- | --- |
| T2 凭据复用 | ok=true, succeeded | ok=true, succeeded（`raw/t2/result.json`） | **维持成立** |
| T3 并发 | 双终态, crossTalk=false | 双终态, crossTalk=false（`raw/t3/result.json`） | **维持成立** |
| V5 serve 存活 | T4 后无声死亡，T5 首轮 DELETE 全败 | **90 秒静默后仍存活**，T5 首轮 3×204 删除成功，杀树后 connectionRefused=true | **死亡与用户并行使用强相关** |
| V1/V4 | — | 未重跑（本地服务行为，与外部使用无关） | 首轮证据有效 |

### V5 死因更新

- 首轮两个"外来" opencode 进程出现于 14:01:15（恰在探针时间窗内），确认为用户并行使用所为；干净复核轮中仅剩一个空闲托管服务（`serve --service`，PID 10908，非探针、未触碰）与探针 serve 共存，**未发生任何干扰**——顺带证明与托管实例共存可用。
- 无声死亡在干净环境未复现 → 归因于用户并行使用（保留少量不确定性，无法 100% 定位机制）。
- **阶段 1 健康看护（心跳 + 自动重启）的建议不因此撤销**：无论死因如何，看护都是插件必需品。
- 复核轮 cleanup 中 1 条 404 属预期：首轮 T4 会话已在首轮补救清扫中删除，manifest 残留所致，非异常。
