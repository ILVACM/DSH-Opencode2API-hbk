# 0.2.8-3 实施记录：插件彻底退出上下文压缩

> 日期：2026-11-20（Asia/Shanghai）。
> 依据：`docs/plan.md`（已经人工批准）+ `temp/code.md`（施工方案，多 agent 协作版）。
> 人工指令：「根据 temp/code.md 执行迭代修改，然后重新打包构建新包，版本号自适应递增，随后重装到 web profile 中」。
> 版本：**0.2.8-3**（命名规则 `0.2.8-x`，已经人工确认）。

---

## 1. 执行方式（多 agent 并行）

1. **能力探针**：并行派发 `probe-1` / `probe-2` 两个子代理，各写 10 字节探针文件（`probe-ok-a` / `probe-ok-b`，无换行无 BOM）→ 实测均通过 → **并行模式确认**，探针文件已清理。
2. **并行落盘**：7 个工作包（W1–W7）同时派发，文件两两无交集：
   - W1 `plugin/src/index.ts`：删除 `llm/stream` 监听器整块（含 `temp/llm-diag.log` 诊断代码）、`readCompactionFile` import、`applyCompactionRoute` import、`compactionPath` 常量、失效的 `node:fs` import、`PluginContext.on?` 字段。140 行 → **93 行**。
   - W2 `plugin/src/config.ts`：删除文件末尾 `applyCompactionRoute` 及其 JSDoc（原 121–141 行）。141 行 → **120 行**。
   - W3 删除 `plugin/src/compaction-store.ts` 整文件（169 行）。
   - W4 `plugin/README.md`：tab 标题改「上下文状态」；删「压缩上下文按钮」「压缩模型选择框」「选择框选到 opencode-local…」三段；「偏好存哪」改为「插件不做上下文压缩…」；注意事项压缩行同步改写。
   - W5 `plugin/package.json`：`0.2.8-2` → `0.2.8-3`。
   - W6 `docs/impl-harness/h6-compaction.mjs`：删 store/route 断言（A1' 段 + 2 行 import）；保留失败分类、压缩 prompt 形态、A3+C2 适配器行为测试。107 行 → 90 行。
   - W7 `docs/impl-harness/h7-compaction-ui.mjs`：整文件替换——删路由语义段，新增 locales 改名守卫（zh=`上下文状态`、en=`Context status`）+ 路径常量契约。
3. 七包全部自检通过；无 MISMATCH；无越界改动（git status 核对，改动面 = 清单 7 文件 + 此前会话遗留的未提交项）。

## 2. 落盘核验（主执行者逐项复核）

| 项 | 结果 |
| --- | --- |
| index.ts | 93 行；`compaction|llm-diag|ctx\.on|node:fs` 计数 0 |
| config.ts | 120 行；以 `liveApiConfig` 的 `}` 结尾；`applyCompactionRoute|compaction` 计数 0 |
| compaction-store.ts | 已不存在 |
| README.md | 旧措辞（压缩上下文/压缩模型/compaction.json）计数 0；「上下文状态」「插件不做上下文压缩」在位 |
| package.json | `0.2.8-3`（semver 合法） |
| h6 | 90 行；store/route 引用 0；保留段（classifyFailure/flattenCompaction/A3+C2）计数 12 |
| h7 | 27 行；`applyCompactionRoute` 0；改名守卫在位 |
| plugin/src 残留扫描 | `applyCompactionRoute|compaction-store|readCompactionFile|llm-diag|compaction\.json` 计数 **0** |

> 备注：code.md 中 W4 自检模式 `上下文压缩` 会命中新文案「插件不做**上下文压缩**」自身（子串重叠），属检查模式过宽，非残留；按精确口径（旧功能措辞 + compaction.json）复核为 0。

## 3. 串行验证

1. **typecheck**：双 tsconfig 退出码 0。
2. **build**：成功。`lib/index.js` 47,843 B（SHA256 `A1A9F9EEA289D469B7465305B55723B7E7C84DB10879D3927B8C96BEEE6AA283`）；`lib/client.js` 25,657 B（SHA256 `F017622E183DAA73D789E8EE900F866BD9845CF0345D244DFF086ED6CAF6EAFD`，**与上一版逐字节一致**——client 源码零改动，符合预期）。lib 内禁用标记（llm-diag/compaction-store/applyCompactionRoute/readCompactionFile/compaction.json）计数 0。
3. **run-all（h1–h7）**：
   - 首跑 **h6 失败：SSE 401**。排查：opencode 当日已从 v2.2.7 漂移到 **v2.3.2**；现场遗留两个同秒启动的 serve 进程（4096/4097），判定为心跳重启竞态（serve 存活期间 `/api/info` 瞬时异常 → restart → 新旧进程短暂并存），非代码缺陷。
   - 决定性实验：用真实 `ServeManager` 对 v2.3.2 全新 spawn，`/api/info`、`/api/event`、`/api/model` 带 Basic 鉴权均 **200** → 插件鉴权机制与 v2.3.2 兼容，401 属瞬态竞态。
   - 清理孤儿进程后重跑：**h1–h7 全过，`allPassed:true`**（h6 `rejected:0`、`agent:"build"`、`compact-` 标题；h7 改名守卫 + 路径契约通过）。对话预算未超。
4. 孤儿进程已全部清理（含 auth-probe 与两次 run-all 的遗留 serve），当前机器 0 个 opencode 残留进程。

## 4. 打包 + 机械预检（全部通过）

- `npm pack` → `hbk-dsh-opencode-local-0.2.8-3.tgz`：**25,159 B**，SHA256 `DA5096A897E911AFFF121B339B0ECAC61DF27C8EE761C01EA98F9565BEBB1728`。
- a. 版本 `0.2.8-3`：semver 合法，**非四段式**（0.2.8.1 事故的预检修复首次落地）。
- b. 包内条目 = 5（package.json / cordis.patch.yml / README.md / lib/index.js / lib/client.js）。
- c. 包内 lib 双文件 SHA256 与构建产物逐字节一致。
- d. 包内 README：含「上下文状态」「插件不做上下文压缩」，不含「压缩模型」「压缩上下文」「compaction.json」。

## 5. 安装（web profile）

- 备份：`temp/reinstall-backup/cordis.patch.yml.bak-0.2.8-3-20261120-174520`（74,672 B）。
- `dsh plugin --profile web add file:…0.2.8-3.tgz` → **0.2.8-2 → 0.2.8-3**，退出码 0。
- 已装 `package.json` 版本 = 0.2.8-3；已装 `lib/index.js`（`A1A9F9EE…`）、`lib/client.js`（`F017622E…`）与构建产物逐字节一致。
- profile `cordis.patch.yml` 安装前后字节级相同（74,672 B）；compaction-basic 的 `summarizationProvider: nvidia / summarizationModel: nvidia/nemotron-3-ultra-550b-a55b` 原样保留（人工接管压缩的挂载点）。

## 6. 验收结果（2026-11-20 人工确认）

- ✅ **修改生效、任务完成**：人工完全退出并重启 DSH 后，按 `docs/plan.md` §4 实机验收通过——tab=「上下文状态」读数正常、无压缩选择器/按钮、切模型无压缩 key 错、`temp/llm-diag.log` 不再增长、无回归。本轮迭代闭环。

## 7. 其他记录

- **上游漂移**：opencode **v2.2.7 → v2.3.2**（当日内发生）。只读探针证实插件 serve 鉴权（`OPENCODE_PASSWORD` + Basic `opencode:<password>`）在 v2.3.2 下兼容；harness 心跳重启竞态在 v2.3.2 下偶发（本次两跑中现形一次），未影响最终验收。
- **遗留不变项**：`~/.dsh-opencode-local/compaction.json`（失效残留，按裁决留在原地）；`temp/llm-diag.log`（scratch，重启后不再增长，可随时删）。
- git 未提交（人工接管）。
