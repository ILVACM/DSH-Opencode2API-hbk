# 阶段 1 · 实施记录（impl-notes）

> 执行日期：2026-11-08；施工图：`temp/P1/code.md`；执行模式：**parallel**（Qoder Agent 三路并行提取 A1/A2/A3）。
> 对话预算：实际 **3 / 上限 6**（h1/h2/h3 各 1 次）。

## 执行记录

| 步骤 | 结果 |
| --- | --- |
| T0 脚手架 | package.json / cordis.patch.yml / tsconfig.json / types.ts 落盘；npm install 51 包；基线 tsc 零错误 |
| A1/A2/A3 并行提取 | 8 个模块文件全部落盘；**字节级核对 12/12 一致**（仅末尾换行符差异，已归一化确认） |
| T1 编译构建 | `npx tsc --noEmit` 零错误；tsdown 构建 `lib/index.js`（24.21 kB）+ `lib/index.d.ts` |
| T2 harness | run-all 五项 **allPassed=true**（明细见下） |
| T3 打包 | `npm pack` → `plugin/hbk-dsh-opencode-local-0.1.0.tgz` |

## harness 五项明细（temp/P1/harness-results/）

| 项 | 结果 | 关键证据 |
| --- | --- | --- |
| h1 单回合 | ✅ | finish=stop；usage {input 5806, output 2, cacheRead 2560}；text="ok"；流以 finish 结尾；无 tool 块 |
| h2 工具拦截 | ✅ | branch=no-tool：模型在 flatten 指令下直接拒绝执行（"no tools are available here"），finish=stop；零工具事件 |
| h3 中断 | ✅ | finish=aborted（reason=user），AbortSignal → /interrupt 全链路打通 |
| h4 看护自愈 | ✅ | taskkill 旧进程（pid 39928）→ 心跳检测 → 自动重启（pid 24364）→ 11 个模型恢复 |
| h5 卸载回收 | ✅ | 3 个 dsh- 会话全部清扫；endpoint 清空；dispose 后连接拒绝 |

**额外覆盖**：h2/h3 的事件流中出现 reasoning 块（block-start/reasoning-delta/block-end），思考翻译路径同步获得实测证据。
**双层防线说明**：h2 走的是第一层（flatten 提示词声明无工具，模型根本不调用）；第二层（permission askAll + SSE 事件驱动拒绝）已在阶段 0 T4 实测验证（asked→reject→未执行）。两层独立成立。

## 勘误记录

- **E1**：施工图初稿 harness 导入深度笔误（`../../plugin/src/` 应为 `../../../plugin/src/`，lib.mjs 3 处 + h5-dispose.mjs 1 处）。T2 首跑发现后，**同步修正 code.md 原文与提取文件**（保持零偏差不变量），重跑通过。插件本体代码零改动。

## 产物清单

- 插件源码：`plugin/src/`（8 个 TS 文件）+ 脚手架 3 件
- 构建产物：`plugin/lib/index.js`、`plugin/lib/index.d.ts`
- **安装包：`plugin/hbk-dsh-opencode-local-0.1.0.tgz`**
- 验证脚本与证据：`temp/P1/harness/`、`temp/P1/harness-results/`

## 待人工：DSH 实装验收（code.md §6.2）

1. 核实 DSH 版本 ≥ 0.1.7（设置 → 关于）
2. `dsh plugin --profile web add D:\DSH-Opencode2API-hbk\plugin\hbk-dsh-opencode-local-0.1.0.tgz`
3. 重启 DSH → 设置 → 插件出现 `opencode-local`
4. 模型选择器出现 `opencode-local` 分组（本机模型）
5. 完整聊一回合
6. 诱导执行命令 → 被拒、无本机执行痕迹
7. 禁用/卸载插件 → 任务管理器确认 serve 子进程消失
8. 重启 DSH → 插件自动恢复