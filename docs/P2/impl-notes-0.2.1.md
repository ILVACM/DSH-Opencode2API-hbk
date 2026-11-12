# 阶段 2 · 0.2.1 修复与增量 — 实施记录

> 执行日期：2026-11-09；施工图：`temp/P2/code.md`（debug 迭代）；模式：serial（主执行者按 §4 逐文件覆盖）。
> 基线：0.2.0；目标：0.2.1。

## 本次改动（13 改/增 + 2 测试适配，未列文件不动）

- 修复主线（D10）：`src/priority.ts`(新)、`src/catalog/probe.ts`、`src/adapter/local-adapter.ts`、`src/index.ts`。
- 增量：`src/config.ts`(+toolMaxPerTurn/thinkingVariant)、`src/client/ToolsTab.tsx`(完全允许+次数上限)、`src/client/ThinkingLevelSelect.tsx`(新)、`src/client/index.tsx`(注册 composer 控件)、`src/client/status-paths.ts`、`src/web/routes.ts`、`src/client/locales.ts`、`src/types.ts`、`package.json`。
- 测试适配：`temp/P2/impl-harness/lib.mjs`、`h1-free-filter.mjs`。
- 未动：serve/client、manager、turn、translate、flatten、api/server、OpencodeLocalCard、ModelsTab、styles、tsdown/tsconfig、cordis.patch.yml。

## 修复要点（0.2.0 卡顿根因）

- **启动不再自动探测**：`index.ts` 用 `catalog.hasProbeData()` 判断——有缓存探测→`refresh({probe:false})` 仅元数据；首装无探测→一次性 `refresh({probe:true})` bootstrap（让路）。
- **探测遇对话让路**：`catalog` 每次探测前 `while(activity.isActive) sleep(500)`；`local-adapter.#streamWith` 进入/退出计入 `UserActivity`；探测间隔 200ms。
- **对话链路永不 await 探测**：`listModels`/`#ensureEntry` 只做 `refresh({probe:false})`（meta-only），不再触发真实探测。
- **手动刷新强制探测**：`web/routes` 的 refresh → `refresh({probe:true, reprobe:true})`（也遇对话让路）。

## 增量要点

- **完全允许**：ToolsTab 勾选写 `toolAllowlist=['*']`（勾选时逐项置灰）；与次数上限独立（turn 仍按 `approved < maxPerTurn`）。
- **次数上限可调**：`toolMaxPerTurn`（volatile，默认 20，1–1000），ToolsTab 数字输入写该字段；`liveToolPolicy` 读它。
- **思考档位选择器**：`ThinkingLevelSelect` 注册 `conversation.input.right`；经 slot 提供的 `useProjection('modelSelection')` 取当前模型（`next??lastUsed`，`model`/`id` 均试）；按该模型 `variants` 列 `default`+档位；写 `thinkingVariant`；`local-adapter.refOf` 仅在模型含该档位时注入 `variant`，否则回退 default。

## 构建与验证

- typecheck 双项目 **0 错**；build 成功：`lib/index.js` 42.14 kB、`lib/client.js` 19.00 kB（含 ModuleLoader 包装，id=`@hbk/dsh-opencode-local`）。
- harness（h1–h4）**allPassed=true**（对话 4/12）：h1 11 免费/9 探测通过（2 地区受限过滤）；h2 工具 shell 真执行（tool-approved）；h3 流式 stop；h4 API 双模式通。

## 残留风险（实机确认）

1. `variant` 是否被 serve 真生效（仅接受不生效也不会报错/破坏；实机看档位是否变化）。
2. `modelSelection` 投影当前模型字段名（组件已 `model??id` 兜底；取不到则只显示 default）。
3. composer 控件 `conversation.input.right` 在本机的渲染/注入（参考已验证该槽+useProjection 可用）。
4. 完全允许/次数上限/思考档位三个 UI 的读写持久（volatile）。

## 产物

- 安装包：`plugin/hbk-dsh-opencode-local-0.2.1.tgz`
- 构建：`plugin/lib/index.js`、`plugin/lib/client.js`

## 待人工 DSH 实机验收

1. 卸载旧版 → 装 0.2.1：`dsh plugin --profile web add D:\DSH-Opencode2API-hbk\plugin\hbk-dsh-opencode-local-0.2.1.tgz`（确认启用，重启）。
2. **冷启动模型列表秒出、不卡；发对话即时应答**（核心修复验收）。
3. 设置页工具 tab：完全允许（放行所有工具）、次数上限数字可调（如 50），两者独立。
4. 输入框右下角思考档位选择器：随当前模型列 default+档位，选后生效；切模型选项变化。
5. 点「重新探测」才探测；探测中发对话不受影响。
6. 逐字出字；卸载/重启无残留。