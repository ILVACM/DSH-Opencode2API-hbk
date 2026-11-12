# 0.2.2 执行日志（impl-notes）

> 施工图：`temp/P2/code-debug.md`（人工已于 2026-11-10 批准执行）。
> 基线：0.2.1 → 目标：0.2.2。

## 能力探测（施工图 §1.2，只做一次）

- 时间：2026-11-10
- 判定方法：宿主存在子代理分派工具（Agent，含 Explore / Plan / general-purpose 类型），满足「存在子代理/团队/任务分派类工具」。
- **判定结果：具备并行能力 ⇒ 并行模式**，按 §1.3 派 P1–P6 六个子执行者。
- 验证阶段（§1.5 / §6.1）由主执行者串行运行，禁止并行。

## 落盘方式决策

- 施工图要求 §4 代码块逐字节落盘。为保证确定性，子执行者统一用 **node 机械抽取**（按 `### Fxx` 标题定位 → 取围栏代码块内容，LF 拼接 + 末尾换行），不手工转录。
- 已实测：`code-debug.md` 为纯 LF（65266 字节），抽取结果字节确定。
- 注意：0.2.1 旧文件结尾无换行；施工图规定「到最后一个换行符」⇒ 0.2.2 新文件以 `\n` 结尾，属预期差异。

## 执行记录（2026-11-10，串行验证由主执行者完成）

### P1–P6 回账（并行，6 个子执行者）

全部按 §1.4 模板派发，机械抽取落盘，各自报告无异常。主执行者**独立抽查**：15 个写入文件与施工图 §4 抽取串**逐字节全等**（node Buffer.equals），probe.ts 已删、`catalog/` 只剩 models.ts、version=0.2.2。

| 包 | 文件 | 字节数 |
| --- | --- | --- |
| P1 | types.ts | 3825 |
| P2 | config.ts | 5260 |
| P3 | serve/client.ts / catalog/models.ts / 删 catalog/probe.ts | 6252 / 3418 / — |
| P4 | adapter/local-adapter.ts / index.ts / web/routes.ts | 5349 / 3575 / 1962 |
| P5 | client/{status-paths,ModelsTab,OpencodeLocalCard,locales,styles} | 513 / 2902 / 3471 / 3325 / 1677 |
| P6 | package.json / impl-harness/lib.mjs / h1-free-filter.mjs | 1201 / 2387 / 1294 |

### 串行验证（§6.1 顺序）

1. `npm run typecheck`：**0 错误**（tsconfig + tsconfig.client 两项目）。
2. `npm run build`：生成 lib/index.js（39533B）与 lib/client.js（19834B）；client.js 含 `hiddenModels`（2 处）。
3. `node temp/P2/impl-harness/run-all.mjs`：**allPassed: true**，failed=[]。h1 新语义实证：12 免费 / 12 可见，hideOne 后 11 可见；h2 工具放行、h3 流式、h4 API（12 模型、stream ok）全过。
4. 残留扫描：`plugin/src` **0 命中**；`impl-harness` 有 **2 处良性命中**——h2-tools.mjs:8 与 h4-api.mjs:8 的检查提示字符串 `'no selectable model'`。施工图附录明确豁免 h2/h3/h4 不改，且 §0.3 硬约束只许改 16 个文件，故**判定为文案字符串而非代码残留，自行裁选放行**（依据：feedback-adaptive-decisions，记录理由）。⚠️ 与 §6.3「0 命中」字面期望存在出入，留人工知悉；如需严格归零，下一轮差异施工图再改这两条文案。
5. `npm pack`：生成 **hbk-dsh-opencode-local-0.2.2.tgz**（17492B，shasum a033f1f1…）。

### 状态

- 代码与打包完成，**未安装、未动 desktop profile**。
- 下一步：人工安装 0.2.2 tgz 到 desktop profile，完全退出 DSH 重开，按施工图 §6.4 验收 7 项。

## 关闭记录（2026-11-10，人工裁决）

- **全部测试（含 §6.4 实机验收及此前遗留确认项）人工验收通过**，0.2.2 正式生效。
- 「错误信息补人话 finish」：**人工裁决砍掉不做**（phase-2.md ④ 已标注）。
- 残留扫描 2 处良性文案命中（h2/h4 的 `'no selectable model'`）随验收一并通过，不再处理。
- **阶段 2（P2）关闭**。后续工作进入阶段 3：安全审计、双入口并发压测、工具拦截第三层、发布打包。