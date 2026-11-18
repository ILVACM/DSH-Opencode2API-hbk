# 0.2.5 实施记录（impl-notes）

> 执行日期：2026-11-16（Asia/Shanghai）
> 施工依据：`temp/code.md`（v1，对应 `temp/debug.md` v8 定案）→ 已归档 `docs/P2/code-debug-0.2.5.md`
> 人工指令：「根据 temp/code.md『执行』优化迭代，修改完代码后，直接重装插件到 web 中」
> 安装目标：**web profile**（人工当前使用形态为 web；与 desktop 共用 cordis 底座）

---

## 1. 执行方式：多 agent 并行

| 阶段 | 做法 | 结果 |
| --- | --- | --- |
| 能力探测 | 并行派发 `probe-a` / `probe-b` 两个子代理，各写 `temp\probe-a.txt`=`probe-ok-a`、`temp\probe-b.txt`=`probe-ok-b`（各 10 字节） | **提前通过**，确认并行可用；探针文件已清理 |
| 并行落盘 | 5 个子执行者按文件切分同时施工 | 全部完成，各自自检全绿 |
| 串行验证 | 主执行者独自依次执行 typecheck / build / run-all（禁止并行） | 全部通过 |

### 工作包与执行者

| 执行者 | 负责 | 文件 |
| --- | --- | --- |
| `w1-types-flatten` | W1 + W3 | `types.ts`、`adapter/flatten.ts`、`adapter/translate.ts` |
| `w2-turn` | W2 | `adapter/turn.ts`（整文件替换 117→184 行） |
| `w4-host` | W4 | `config.ts`、`index.ts`、`web/routes.ts`、`client/status-paths.ts` |
| `w5-client` | W5 | `client/locales.ts`、`client/styles.ts`、`client/CompactionTab.tsx`(新)、`client/OpencodeLocalCard.tsx`、`client/index.tsx` |
| `w6-tests-w7-version` | W6 + W7 | `h6-compaction.mjs`(新)、`h7-compaction-ui.mjs`(新)、`run-all.mjs`、`package.json`、`README.md` |

> 写入范围两两无交集；唯一交叉痛 `status-paths.ts` 由 W4 独占写、W5 只读。多个执行者报告对「整文件替换」做了与 `code.md` 代码块的**逐字节比对**。

---

## 2. 实际改动清单（18 文件）

### 2.1 修改（14）

| 文件 | 改动 |
| --- | --- |
| `plugin/src/types.ts` | `HarnessGenerateOptions` 新增 `purpose?: string` |
| `plugin/src/adapter/flatten.ts` | 新增导出 `flattenCompaction()`（`flattenHistory`/`blockText` 未动） |
| `plugin/src/adapter/turn.ts` | **整文件替换**：`COMPACT_MAX_ATTEMPTS=3`/`COMPACT_RETRY_BASE_MS=2000`/`COMPACT_RETRY_MAX_MS=8000`；新增 `runCompactTurn()`；`runTurn()` 按 `purpose==='compaction'` 分流；主体更名 `runTurnOnce()`；`flattenCompaction` 分流；`!isCompaction &&` 工具短路；标题加 `compact-` |
| `plugin/src/adapter/translate.ts` | 新增导出 `classifyFailure()`；`session.execution.failed` 分支改用之 |
| `plugin/src/config.ts` | `ResolvedPluginConfig` + `Config` 新增 `compactionProvider`/`compactionModel`（`.volatile()`，默认 `deepseek-official`/`deepseek-flash`）；`resolveConfig` 读取；新增 `liveCompactionProvider`/`liveCompactionModel`/`applyCompactionRoute` |
| `plugin/src/index.ts` | `PluginContext` 增 `on?`/`get?`；注册 **`llm/stream` 监听器**（识别 `purpose==='compaction'` → 改路由）；`registerWebRoutes` 传入 `compaction` 读者 |
| `plugin/src/web/routes.ts` | **整文件替换**：保留原 models/models-refresh 两条；新增 `catalog`、`catalog/refresh`、`context`、`compact` 四条（独立 `inject` 块） |
| `plugin/src/client/status-paths.ts` | **整文件替换**：新增 `CATALOG_PATH`/`CATALOG_REFRESH_PATH`/`CONTEXT_PATH`/`COMPACT_PATH` + 3 个 catalog 类型 |
| `plugin/src/client/CompactionTab.tsx` | **新增**：压缩按钮 + 全量模型选择器 + 上下文状态面板 |
| `plugin/src/client/OpencodeLocalCard.tsx` | **整文件替换**：tab 扩为 models/tools/compaction |
| `plugin/src/client/index.tsx` | 新增 `ctx.get?.('sessions')` 并注入卡片 |
| `plugin/src/client/locales.ts` | zh/en 各新增 15 键（`tab.compaction` + 14 个 `compaction.*`），键集完全一致 |
| `plugin/src/client/styles.ts` | `CARD_CSS` 追加 8 条 CSS |
| `plugin/package.json` | `version` 0.2.4 → 0.2.5 |
| `plugin/README.md` | 安装行改 `--profile web` + 0.2.5；新增「上下文压缩」tab 章节；注意事项补 1 条 |
| `docs/impl-harness/run-all.mjs` | **整文件替换**：注册 h6、h7 |

### 2.2 新增（4）

`plugin/src/client/CompactionTab.tsx`、`docs/impl-harness/h6-compaction.mjs`、`docs/impl-harness/h7-compaction-ui.mjs`、`temp/code.md`（并归档为 `docs/P2/code-debug-0.2.5.md`）。

### 2.3 明确未改

`plugin/cordis.patch.yml`、`plugin/tsconfig.json`、`plugin/tsconfig.client.json`、`plugin/tsdown.config.ts`、`api/server.ts`、`serve/*`、`catalog/*`、`local-adapter.ts`、`client/ModelsTab.tsx`、`client/ToolsTab.tsx`、`client/ThinkingLevelSelect.tsx` — 全部零改动（`git status` 校验通过）。

---

## 3. 验收结果

### 3.1 typecheck
```
npm run typecheck   → EXITCODE=0，零 error
（tsc -p tsconfig.json && tsc -p tsconfig.client.json 双配置通过）
```

### 3.2 build
```
npm run build       → EXITCODE=0
lib/index.js   52160 bytes
lib/client.js  29633 bytes
```

### 3.3 回归测试（h1–h7，串行）
```
RUN-ALL {"results":{"h1":{"ok":true},"h2":{"ok":true,"out":"tool-approved"},
"h3":{"ok":true},"h4":{"ok":true},"h5":{"ok":true,"out":"cap-bypassed"},
"h6":{"ok":true,"out":"ok"},"h7":{"ok":true,"out":"ok"}},"failed":[],"allPassed":true}
```

h6 实机关键证据：
- `finish: {kind:'stop'}`、`rejected: 0`、`agent: "build"`
- 会话标题 `dsh-h-compact-big-pickle-mwjaovo5`（含 `compact-`）
- 产出真实检查点摘要（`## Checkpoint Summary …`）

h7 关键证据：默认 `deepseek-official/deepseek-flash`；路由断言（压缩改路由 / 普通对话不动 / 同值 no-op / 空目标忽略）全过；4 条路径常量字面值全对。

> **过程中修正 1 处施工图缺陷（非产品缺陷）**：h6 原断言用 `flattenHistory(options,false)` 去校验 `You may use the available tools` 尾注（该尾注只在 `toolsEnabled=true` 时出现）。已改为分别校验 `false`/`true` 两个分支，并**新增**一条 `chatTools` 断言（比原方案更严），`temp/code.md` 同步修正。

### 3.4 打包
```
hbk-dsh-opencode-local-0.2.5.tgz
bytes  = 27051
SHA256 = 384183D76C6E59F4CB63B5E80076D9CC731DBE3213D6285D49A868F7810A5FA7
npm shasum = 6824322c68a3dd508ac886e525660c2f73472abf
包内 5 条目：package/lib/client.js, package/lib/index.js,
            package/package.json, package/README.md, package/cordis.patch.yml
```

### 3.5 安装（web profile，只装不重启）
```
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.5.tgz
→ dependencies: - 0.2.4 / + 0.2.5   EXITCODE=0
```
校验：

| 项 | 结果 |
| --- | --- |
| web `package.json` 依赖 | `file:…/hbk-dsh-opencode-local-0.2.5.tgz` ✅ |
| web `cordis.patch.yml` | **整文件未变**（`Compare-Object` 空；SHA256 `EED1FF55…` 与备份相同）✅ |
| 已装 `lib/index.js` | `F1321AA4EF38…` = 构建产物 ✅ |
| 已装 `lib/client.js` | `E6B0CA1E2A73…` = 构建产物 ✅ |
| 已装版本 | `0.2.5` ✅ |

**备份**：`temp\reinstall-backup\cordis.patch.yml.bak-0.2.5-20261116-212446`（SHA256 `EED1FF556CD7CEC4065270B068A06883AC68CCBBBA9A2DC56984EE6F375D6F0F`）。

> 未主动重启 DSH；未安装到 `desktop` profile；未提交 git。

---

## 4. 回滚命令

```powershell
# 插件回滚
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.4.tgz
# 代码回滚
git checkout HEAD -- plugin/src docs/impl-harness plugin/package.json plugin/README.md
# patch 回滚（如需）
Copy-Item D:\DSH-Opencode2API-hbk\temp\reinstall-backup\cordis.patch.yml.bak-0.2.5-20261116-212446 `
          C:\Users\hbk\.dsh\profiles\web\cordis.patch.yml -Force
```

---

## 5. 待人工实机验收（重启后，见 `temp/debug.md §7.5`）

| # | 项 | 期望 |
| --- | --- | --- |
| A1 | 长对话切 `deepseek-v4.1-flash-free` | 不再出现 `context compaction failed: 402` |
| A2 | 切 1M 窗口模型 | 同样成功 |
| A3 | 普通对话（含工具、`allowAll`） | 与 0.2.4 一致 |
| B1 | 设置页第三个 tab「上下文压缩」 | 三块齐全 |
| B2 | 压缩模型默认 | 显示官方 / V4.1-Flash |
| B3 | 选择器全量 | 与右下角一致；第三方 API 与官方同级 |
| B4 | 点「压缩上下文」 | 调 DSH 压缩，回报项数/token；忙时如实提示 |
| B5 | 压缩后数值 | 能进当前聊天模型窗口；面板显示实测 |
| B6 | 上下文面板 | 只读，「有什么显示什么」 |
| B7 | 改回 `opencode-local` 模型 | 兜底生效（精简形态/工具不放行/可重试） |
| B8/B9 | 统一性 | 人工与自动两条路跟随同一压缩模型；聊天模型不变 |
| B10 | 普通对话不受影响 | provider/model 原样；patch 未改动 |
| B11 | 改选第三方 API | 压缩正常、不经本插件、不 402 |
| A5 | 真实额度耗尽 | 仍报原始信息，不被无限重试 |
