# 0.2.3 收尾调优 — 实施记录

> 执行日期：2026-11-11；计划：`C:\Users\hbk\.qoder-cn\plans\verdant-wilderness-linnet.md`（人工批准）；模式：串行（3 文件小改，不派并行）。
> 基线：0.2.2；目标：0.2.3。

## 需求

实机观感：工具活动（`[工具]/[完成]/[失败]`）以普通 text 块平铺刷屏。改为 reasoning 块，DSH 默认折叠。

## 改动（3 文件）

1. `plugin/src/adapter/translate.ts` note()：`text` → `reasoning`（block-start/reasoning-delta/block-end 三处），其余不动。
2. `plugin/package.json`：version 0.2.2 → 0.2.3。
3. `temp/P2/impl-harness/h2-tools.mjs`：新增条件断言——tool-approved 分支时，reasoning 块全文必须含 `[工具]`。

## 契约依据（只读核实，未改 DSH 源码）

- `D:\deepseek-harness` AssistantMarkdown.tsx:81-107：reasoning → ReasoningRow（DisclosureRow）**默认折叠**，无需字段；多 reasoning 块按 index 独立组装。
- 不可用 tool-call 块：DSH agent-loop 会真实执行（agent.ts:549-554）。
- api/server.ts 只消费 text-delta ⇒ API 响应不再夹带工具噪音（与 reasoning 既有处理一致），未改。
- sawText 只由 session.text.ended 置位 ⇒ EMPTY_RESPONSE 判定无回归。

## 验证（串行，全部通过）

- typecheck 双项目 0 错；build 双 bundle（index.js 39.55 kB / client.js 19.83 kB）。
- harness run-all **allPassed: true**（对话 4/12）：h2 tool-approved 分支**新断言通过**；h2 textHead 已不含 `[工具]/[完成]`（只剩最终答案），实证工具活动移出正文。
- `npm pack` → **hbk-dsh-opencode-local-0.2.3.tgz**（17505B，shasum 08058625…）。

## 待人工实机验收

装 0.2.3 到 desktop profile，完全退出 DSH 重开，发起会用工具的对话：`[工具]/[完成]` 应为默认折叠的思考行、可展开；正文与模型真实思考不受影响。