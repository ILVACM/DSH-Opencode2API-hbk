# 0.2.8-1 实施记录（impl-notes）

> 执行日期：2026-11-20（Asia/Shanghai）
> 前置：0.2.8.1 实机测试发现「压缩改路由在跨工作区会话上不生效 + 诊断监听器被 Cordis filter 过滤」。人工裁决：**插件彻底退出上下文压缩功能**（人工另行接管），tab 改名「上下文状态」；版本命名规则改为 `0.2.8-x`（四段 `0.2.8.x` 会被 pnpm 判为非法）。

## 1. 功能调整（本版本）

| 调整 | 内容 |
| --- | --- |
| tab 更名 | 「上下文压缩」→「**上下文状态**」 |
| 保留 | 上下文状态监测显示（`GET /plugins/opencode-local/context`，30s 自动刷新） |
| 移除 | 压缩模型选择器、`压缩上下文` 按钮、`llm/stream` 监听器（global 改路由）、`compaction-store.ts`、`compaction.json`、`POST /compact` 与 compaction 偏好路由 |
| patch | 保留 compaction-basic 原生配置（`summarizationProvider: nvidia, summarizationModel: nvidia/nemotron-3-ultra-550b-a55b`），供人工接管压缩时使用/调整 |

## 2. 验收数据

| 项 | 结果 |
| --- | --- |
| typecheck / build | ✅ 0 错 |
| h1–h7 | ✅ `allPassed: true` |
| 打包 | ✅ `hbk-dsh-opencode-local-0.2.8-1.tgz` **25593 B** / SHA256 `0936A26053656996B1FB7B66CBDFFFC95229B1D5AF3777D028241C75462F5C50`（5 条目） |
| 安装 | ✅ web profile `0.2.8.1 → 0.2.8-1`；lib 与构建产物一致；patch 零差异（75505 B） |
| 监听器残留 | ✅ `llm/stream` / `llm-diag` 残留 0 |

## 3. 回滚

```powershell
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.8.1.tgz
```

## 4. 待人工实机验收（重启 DSH 后）

| # | 项 | 期望 |
| --- | --- | --- |
| 1 | tab 显示「上下文状态」 | 正常 |
| 2 | 状态面板读数 | 正常 |
| 3 | 切 `opencode-local/deepseek-v4.1-flash-free` | 不再报压缩错误 |
| 4 | 普通聊天 / 工具 / `allowAll` | 无回归 |
