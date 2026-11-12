# 阶段 3 · 轻量收尾方案（phase-3）

> 状态：**已关闭（2026-11-12 12:14 人工确认收尾）**。依据：`temp/plan.md` v7 §4 阶段 3（2026-11-12 人工裁决缩减）。
> 前置：**0.2.3 已人工重装验收通过（2026-11-12）✅**。
> 性质：**只读自查 + 文档**为主，默认零代码改动、零对话预算；只有发现必修项才走「差异施工图 → 人工批准 → 修复」。

---

## 0. 范围与冻结项

**做**：T1 轻量安全自查（只查活跃面）→ T2 使用说明 → T3 文档定稿。

**不做（已裁决冻结，不再讨论）**：
- API 入口任何改动（静默保留：默认关、无设置 UI、不再投入；已知缺口一并冻结）。
- 双入口并发压测（第二入口不用，风险场景不存在）。
- 工具拦截第三层响应体扫描（个人单机收益低，违背稳定优先）。
- 正式安全审计、任何新功能。

**将来启用 API 或分发他人时，上述砍掉的项须补回**（plan.md v7 已记录）。

## 1. T1 轻量安全自查（只读，不改代码）

方法：逐项过代码 + 查看本机运行时产物（`~/.dsh-opencode-local/serve.log`、`catalog.json`），每项给出**证据（文件:行）+ 结论（✅ 无问题 / ⚠️ 建议 / ❌ 必修）**。
产出：`temp/P3/security-check.md`。

### T1.1 凭据不落日志

| 检查点 | 锚点 | 判定标准 |
| --- | --- | --- |
| 插件自身日志 | index.ts:26/50/69/70/86/88 共 6 处 logger | 只输出 providerId/端口/模型计数/错误消息，无密码/token |
| serve 子进程密码传递 | serve/manager.ts:113-119 | 随机 32B 经 **env** 传递（不上 argv，进程列表不可见）；确认无其他泄露路径 |
| **serve.log 内容** | manager.ts:111-118：子进程 stdout/stderr 追加到 `~/.dsh-opencode-local/serve.log` | 读现有日志核对是否含密码/上游 token；必要时对照 `D:\opencode` 源码日志点 |
| 错误消息面 | serve/client.ts:7-9（errorMessage 只取 message）、11-13（密码在 Basic 头、URL 无密码）、116/123（上游响应前 300 字带进错误） | 错误显示给本机用户本人，判定可接受与否 |
| 落盘产物 | catalog/models.ts 写入点 → `catalog.json` | 只含模型元数据，无凭据 |
| DSH 配置中的 apiToken | 宿主明文存储 | API 已冻结，记录即可，不改 |

### T1.2 工具白名单 / 上限边界（adapter/turn.ts:75-89）

现有机制：默认 off → 一律 reject；allowlist 精确匹配 action 或 `'*'`；`approved < maxPerTurn` 才放行；reply `once`；`asked` 集合去重。

核对点：
- action 名匹配大小写/别名（P0 已证 bash→shell；确认无其他别名漏网）。
- 上限计数只在 reply 2xx 后 +1（turn.ts:86-88）；`approved` 为每回合局部变量，天然重置。
- policy 每次询问实时读（turn.ts:80）⇒ 界面改配置即时生效，无缓存旧规。
- **边界行为**：reply 非 2xx 时 `asked` 已记、不重试 ⇒ 工具悬挂 ⇒ 看门狗 idle 超时报错（turn.ts:96-99）。判定：可接受（记录）or 必修。
- 确认无任何路径向 DSH 发 tool-call 块（translate.ts note() 全 reasoning，0.2.3 已验收，复核即可）。

### T1.3 进程看护快查（已验收，仅 sanity）

- dispose killTree（taskkill /T /F，manager.ts:159-167）、心跳 10s、maxRestarts 3、健康后计数清零（manager.ts:152）、windowsHide 全覆盖。
- 附带记录：serve.log 只增不清（无旋转）——个人机可接受，写进使用说明注意事项。

### 判定与出口

- 全 ✅/⚠️ ⇒ T1 关闭；⚠️ 项写进使用说明「注意事项」。
- 有 ❌ ⇒ 出**差异施工图**（只列改动文件）→ 人工批准 → 修复 → 串行验证（typecheck/build/run-all，对话预算 ≤4）→ 版本升 **0.2.5**（0.2.4 已否决烧号）→ 重新打包 → 人工重装验收。

## 2. T2 使用说明（交付物：`plugin/README.md`）

内容大纲：
1. **是什么/不是什么**：桥接本机真实 opencode CLI、不伪装；API 静默保留说明。
2. **前置要求**：Windows、Node ≥20、opencode v2.2.6 已登录、DSH 0.2.2-rc.1（desktop profile）。
3. **安装 / 卸载 / 回退**：`dsh plugin add <tgz>`；完全退出 DSH 重开；回退包位置（0.2.2 / 0.1.0）。
4. **设置页**：模型 tab（免费列表、显隐勾选、刷新=只拉元数据不发推理请求）；工具 tab（开关/白名单/完全允许/每回合上限）；输入框右侧思考档位。
5. **数据与日志位置**：`~/.dsh-opencode-local/`（catalog.json、serve.log）；凭据复用 CLI 默认数据目录，插件不复制。
6. **注意事项**：工具在本机真实执行（白名单是风险手闸）；serve.log 增长；插件 serve（4096 起）与常驻服务（28894）是两个进程别混；API 默认关。
7. **故障速查**：模型全不可用 ⇒ 别信旧探测结论（handoff §5）；无首事件/流 idle 超时；serve 重启预算耗尽。

**打包事实（已核实）**：npm 会自动把 README.md 收进 tgz（即使 `files` 未列，package.json:13）⇒ 仅文档变更也重新打包 **0.2.3 同版本**，记录新 shasum；**核对 lib/index.js、lib/client.js 字节不变 ⇒ 无需重装**。

验收：人工照 README 能从零装一遍（或判定步骤完整可照做）。

## 3. T3 文档定稿

- `temp/P3/impl-notes.md`：执行日志（自查结论摘要、打包结果、遗留 ⚠️ 清单）。
- `temp/handoff.md`：阶段 3 关闭标记、README 指针、当前版本状态。
- `temp/plan.md` §7：阶段 3 完成态。
- 出口：人工确认 ⇒ 项目收尾，后续仅维护。

## 4. 纪律与预算

- **阶段门**：本方案批准后才执行；❌ 必修项的修复单独再批。
- **对话预算**：默认 0；仅代码改动时跑 run-all（≤4/12）。
- **验证串行**；只读自查不改任何代码/配置/运行时数据。
- 参考源码只读（`D:\opencode`、`D:\deepseek-harness`、`temp/*-master` 等）。

## 5. 裁决结果（2026-11-12 人工批准 + 自适应自查）

1. ✅ **README 随包分发**（npm 自动收录）。
2. ✅ **无代码改动时版本号不动**（0.2.3 重打包记新 shasum；有 ❌ 必修才升 0.2.5）。
3. ✅ **serve.log 已自查：无敏感内容，无需必修，记录即可**。证据链：
   - 插件 `~/.dsh-opencode-local/serve.log` **0 字节**（2026-11-08 至今；harness 的 `temp/P2/impl-harness/data/serve.log` 同样 0 字节）⇒ opencode serve 正常运行不写 stdout/stderr，日志走它自己的文件。
   - opencode 自身日志 `~/.local/share/opencode/log/opencode.log`（7708 行 / 1.5MB）：`password|token|secret|bearer|authorization|api key|credential` 全模式 **0 命中**；内容为运行遥测（启动/进程/事件流）。
   - 源码双证（`D:\opencode`）：`packages/cli/src/env.ts:10-13` 密码为 `Config.Redacted`（打印即 `<redacted>`）；`env.ts:15-22` env 快照显式过滤两个密码变量。
   - 插件侧：密码每次启动随机 32B、经 env 传递不上 argv（manager.ts:113-119）、只走 Basic 头（client.ts:11-13）、URL 无密码。
   - 附带核实：`catalog.json`（桌面 + harness 两份）纯模型元数据，无凭据。
   - 注意事项入 README：serve.log 无旋转但实测恒空；opencode.log 是 CLI 自身行为，插件不触碰。

## 6. 验收清单

- [x] `security-check.md` 逐项有证据有结论，❌ 清零（2026-11-12：❌0 / ✅14 / ⚠️6，零代码改动）
- [x] `plugin/README.md` 步骤完整、可照做重装（**待人工最终确认**）
- [x] 重打包：lib 字节核对一致（index.js `74177ed5…` / client.js `556ea7a2…`）+ 新 shasum `5ff475ed521984608877830ad91d81bcc3022437`（20612B，5 文件含 README）
- [x] handoff / plan 定稿，**人工确认收尾（2026-11-12 12:14）✅**