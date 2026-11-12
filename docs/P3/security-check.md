# 阶段 3 · 轻量安全自查报告（security-check）

> 日期：2026-11-12；依据：`temp/P3/phase-3.md` §1（已批准）。方法：只读代码审查 + 本机运行时产物核对 + `D:\opencode` 源码双证。
> **总结论：❌ 必修 = 0；✅ 无问题 = 14；⚠️ 建议/记录 = 6。零代码改动，版本号不动。**

---

## T1.1 凭据不落日志

| # | 检查点 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 | 插件自身日志 | index.ts:26/50/69/70/86/88 共 6 处 logger，仅输出 providerId/端口/模型计数/错误消息；client 两处 console.error 仅渲染错误 | ✅ |
| 2 | serve 密码传递 | manager.ts:113-119：每次启动随机 32B（base64url），经 **env** 传递，不上 argv（进程列表不可见） | ✅ |
| 3 | 插件 serve.log | `~/.dsh-opencode-local/serve.log` **0 字节**（2026-11-08 至今）；harness `temp/P2/impl-harness/data/serve.log` 同 0 字节 ⇒ serve 正常运行不写 stdout/stderr | ✅ |
| 4 | opencode 自身日志 | `~/.local/share/opencode/log/opencode.log` 7708 行/1.5MB，`password\|token\|secret\|bearer\|authorization\|api key\|credential` 全模式 **0 命中**，内容为运行遥测 | ✅ |
| 5 | 上游源码双证 | `D:\opencode/packages/cli/src/env.ts:10-13` 密码 `Config.Redacted`（打印即 `<redacted>`）；`env.ts:15-22` env 快照显式过滤 OPENCODE_PASSWORD / OPENCODE_SERVER_PASSWORD | ✅ |
| 6 | 密码传输路径 | client.ts:11-13：仅 Basic 头；URL 无密码；errorMessage 只取 err.message（client.ts:7-9） | ✅ |
| 7 | catalog.json | models.ts:60-66 saveCache 只写 `{updatedAt, entries}`；toEntry（20-36）只取模型元数据；桌面+harness 两份实物核对无凭据 | ✅ |
| 8 | 错误消息面 | client.ts:116/123：上游响应前 300 字带进错误 → 经 finish/日志显示给**本机用户本人** | ⚠️ 可接受，记录 |
| 9 | DSH 配置 apiToken 明文 | 宿主 DSH 自身存储行为；API 已静默保留（默认关、仅本机） | ⚠️ 冻结项，记录 |

## T1.2 工具白名单 / 上限边界

机制锚点：turn.ts:75-89。会话创建即 `permissions: ASK_ALL`（client.ts:4,113）⇒ 每个工具动作都产生 `permission.asked`，插件是唯一裁决点。

| # | 检查点 | 证据 | 结论 |
| --- | --- | --- | --- |
| 10 | 默认 off 全拒 | turn.ts:82-85：`mode==='allowlist'` 才可能放行，否则一律 `reject` | ✅ |
| 11 | 动作名匹配 | P0 实测 bash 工具 → `action:"shell"`（P0/protocol-notes.md:41）；h2 用 `allow:['shell']` 真实放行成功；UI 列表 TOOL_ACTIONS（status-paths.ts:20）= shell/edit/read/webfetch/websearch/grep/glob，与上游动作名一致（core 源码 grep 双证）；精确匹配、全小写，无别名漏网 | ✅ |
| 12 | 上限与计数 | turn.ts:84 `approved < maxPerTurn` 先判后放；86-88 仅 reply 2xx 才 +1；`approved` 每回合局部变量天然重置；`asked` 集合防重复裁决 | ✅ |
| 13 | 配置即时生效 | turn.ts:80 每次询问实时 `cfg.toolPolicy()` → liveToolPolicy 读最新配置，无缓存旧规 | ✅ |
| 14 | 不发 DSH tool-call | translate.ts 全文 blockType 仅 text/reasoning；工具活动经 note() 全走 reasoning（44-49,103/108/115）；h2 断言 `toolBlocks===0` 通过 | ✅ |
| 15 | UI 动作覆盖面 | 上游还有 external_directory/question/subagent/skill/execute 等动作（core/src  grep 实证）未列入 UI 七项 ⇒ 只能经 `'*'` 放行；**方向安全：未列出 = 拒绝** | ⚠️ 记录（README 说明） |
| 16 | 白名单按动作不按资源 | 放行 `read` 后 `.env` 等敏感文件也可读（上游默认 agent 对 .env 单独 ask，本插件 ASK_ALL+动作级白名单不区分资源）——0.2.2 已裁决的动作级语义 | ⚠️ 记录（README 风险提示） |
| 17 | reply 失败边界 | reply 非 2xx 时 `asked` 已记、不重试 ⇒ 工具悬挂 ⇒ idle 看门狗（默认 120s）超时报 TRANSPORT（可重试码，走 DSH 重试） | ⚠️ 可接受，记录 |

## T1.3 进程看护快查（sanity）

| # | 检查点 | 证据 | 结论 |
| --- | --- | --- | --- |
| 18 | 子进程全静默 | 全部 3 处 spawn/spawnSync 均 `windowsHide:true`（manager.ts:37/117/162），无其他 spawn 点（全 src grep） | ✅ |
| 19 | 回收与看护 | dispose：清心跳 + killTree（taskkill /PID /T /F 杀树，manager.ts:96-104/159-167）；心跳 10s unref；maxRestarts 3、健康 200 后计数清零（152）；启动失败 killTree 不留残留（132） | ✅ |
| 20 | serve.log 无旋转 | 只增不清，但实测恒空（#3）⇒ 实际无增长风险；opencode.log 归 CLI 自身管理，插件不触碰 | ⚠️ 记录 |

## 出口判定

- **❌ = 0** ⇒ 无需差异施工图、无需修复、**版本号不动（0.2.3）**、无需跑对话回归（预算 0）。
- ⚠️ 共 6 项（#8/9/15/16/17/20），全部转入 README「注意事项」，不改代码。