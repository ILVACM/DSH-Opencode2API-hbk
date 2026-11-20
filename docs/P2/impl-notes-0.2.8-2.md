# 0.2.8-2 实施记录（impl-notes）

> 执行日期：2026-11-20（Asia/Shanghai）
> 前置：0.2.8-1 重启实测仍报 deepseek-official no key。根因：0.2.7 的 index.js 因 pnpm 同版本缓存从未真正部署（remove+add 后仍 stale），且首次 0.2.8 tgz 被删——「修复无效」实为「修复未部署」。force copy 纠正后 DIAG2 证实监听器触发，但改写后的压缩仍走 deepseek-official（跨工作区会话的压缩不经过插件 fiber 的监听器——Cordis 多 isolate 作用域隔离）。

## 1. 最终修复（0.2.8-2，人工批准方案 B）

**放弃 llm/stream 事件拦截**，改用 **compaction-basic 原生配置**——web profile 的 `cordis.patch.yml` 给 compaction-basic 加：

```yaml
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    summarizationProvider: nvidia
    summarizationModel: nvidia/nemotron-3-ultra-550b-a55b
```

**效果**：压缩从源头走 nvidia 路由，**所有会话、所有工作区、所有作用域**原生生效，不依赖事件监听。

**附带**：插件移除 `llm/stream` 监听器、`compaction-store.ts`、`compaction.json`、压缩按钮/选择器与相关路由；「上下文压缩」tab 改名「**上下文状态**」（仅保留状态监测显示）；patch 修复 0x08 非法字符。

## 2. 验收数据

| 项 | 结果 |
| --- | --- |
| typecheck / build | ✅ 0 错 |
| h1–h7 | ✅ `allPassed: true` |
| 打包 | ✅ `hbk-dsh-opencode-local-0.2.8-2.tgz` **26692 B** / SHA256 `2CB3E7DC0F18DD4DCC1B9BCF87D7BBB685EBA7154DA6DE65088AD982CDA4730C`（5 条目） |
| 安装 | ✅ web profile `0.2.8-1 → 0.2.8-2`；lib 一致；patch 零差异；版本 0.2.8-2 |

## 3. 回滚

```powershell
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.8-1.tgz
```

## 4. 待人工实机验收（重启 DSH 后）

| # | 项 | 期望 |
| --- | --- | --- |
| 1 | 切 `opencode-local/deepseek-v4.1-flash-free` | 压缩走 nvidia（原生配置），**不再报 deepseek-official key 错** |
| 2 | 上下文状态面板 | 正常显示读数 |
| 3 | 普通聊天 / 工具 / `allowAll` | 无回归 |
| 4 | `cordis.patch.yml` | 仅 compaction-basic 新增配置 + 0x08 修复，其余未变 |
