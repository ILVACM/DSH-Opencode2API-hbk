# 阶段 2 · 实施记录（impl-notes）

> 执行日期：2026-11-09；施工图：`temp/P2/code.md`；模式：**serial**（主执行者逐字节提取全部 29 文件——施工图由主执行者编写，直接提取比派 agent 重读超大 code.md 更可靠、产出逐字节相同，故走串行回退）。
> 对话预算：harness 实跑 4/12（h2=1、h3=1、h4=2）；目录探测 11 次免费模型探测（catalog probe 预算 ≤30，独立计）。

## 执行记录

| 步骤 | 结果 |
| --- | --- |
| T0 提取 | 29 文件落盘（服务端 16 + 客户端 7 + harness 6）|
| npm install | 14 装 / 22 移除 / 10 变更（tsdown 升 0.22、加 react/@types/react）|
| T1 typecheck | **双项目 0 错误**（含 schemastery 数组 `.volatile()` 类型通过）|
| T1 build | `lib/index.js`（40.19 kB ESM）+ `lib/client.js`（13.47 kB CJS，ModuleLoader 包装）|
| T2 harness | **allPassed=true**（明细见下）|
| T3 pack | `plugin/hbk-dsh-opencode-local-0.2.0.tgz` |

## harness 四项明细（temp/P2/impl-harness-results/）

| 项 | 结果 | 关键证据 |
| --- | --- | --- |
| h1 免费过滤 | ✅ | 11 个免费模型，**9 个探测通过进 selectable**，2 个被过滤（证明「免费 ∧ 探测通过」过滤生效）；listModels == selectable |
| h2 工具路径 B | ✅ | branch=**tool-approved**：模型调 shell 工具 → permissionAsked=1 → approved=1 → 真执行（toolEvents=5，输出 p2-impl）；工具活动以 `[工具]/[完成]` text 块转播；finish=stop |
| h3 流式 | ✅ | text="ok"，text-delta 增量，finish=stop，usage 有值，流以 finish 结尾 |
| h4 对外 API | ✅ | 端口 9676；/v1/models 返回 9 模型；无 token 401；chat 非流式 content="ok"；chat 流式含 data:+[DONE] |

- 静默后台：全程无终端窗口弹出（windowsHide 生效）。

## 勘误记录（施工图缺陷，执行期修正并同步 code.md）

- **E1**：`config.ts` 用 `unwrap(c.X as never)` 触发 TS `never` 类型错误 + `(v as {get})` 转换报错。修正：去掉 `as never`（14 处）+ `as unknown as` 转换。已同步 code.md。
- **E2**：`client/index.tsx` 的 `document.querySelector(...)` 返回 Element 无 `dataset`。修正：`querySelector<HTMLStyleElement>(...)`。已同步 code.md。

## 残留风险（待 DSH 实机确认）

1. **ModuleLoader id = scoped 包名** `@hbk/dsh-opencode-local`。spike 用非 scoped 包名验证通过；scoped 是否被宿主 client 模块表认需实机确认。若不认 → 按故障矩阵把 `tsdown.config.ts` 的 `PLUGIN_ID` 改为 loader entry id 重建（记录）。
2. **API 开关** 在配置文件（cordis.patch `config.apiEnabled`），非 GUI；改后需重载插件生效。
3. GUI 两 tab 的实际渲染/探测状态展示/工具开关持久，需 DSH 实机验收。

## 产物

- 安装包：`plugin/hbk-dsh-opencode-local-0.2.0.tgz`
- 构建产物：`plugin/lib/index.js`、`plugin/lib/client.js`
- 验证证据：`temp/P2/impl-harness-results/*.json`

## 待人工：DSH + API 实机验收

1. 卸载旧版 0.1.0：`dsh plugin --profile web remove @hbk/dsh-opencode-local`（若已装）
2. 装 0.2.0：`dsh plugin --profile web add D:\DSH-Opencode2API-hbk\plugin\hbk-dsh-opencode-local-0.2.0.tgz`
3. 确认插件启用 → 重启 DSH。
4. 设置页 opencode-local 卡片两 tab：可用模型 tab 显示免费模型+上下文+探测档（应见约 9 个可用、少数不可用），刷新按钮重探；对话框选择器只出现可用者。
5. 可用工具 tab：开总开关 + 勾选 shell/edit → DSH 对话让它跑命令/改文件应真执行；不勾的动作被拒。
6. DSH 逐字出字。
7. 对外 API：在 profile 配置 `apiEnabled: true`（apiHost 127.0.0.1 / apiPort 8787 / apiToken 设一个），重载；用 OpenAI 客户端连 `http://127.0.0.1:8787/v1` 完整对话（含流式）。
8. 若卡片不显示：查 DSH 控制台 `[opencode-local]` 报错；若为 ModuleLoader id 问题按残留风险 1 处理。
9. 验收通过后再进入阶段 3。