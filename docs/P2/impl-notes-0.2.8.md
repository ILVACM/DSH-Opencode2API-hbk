# 0.2.8 实施记录（impl-notes）

> 执行日期：2026-11-19 ~ 2026-11-20（Asia/Shanghai）
> 前置：`docs/plan.md`（0.2.7 修复迭代）→ 0.2.7 施工安装后实机验证发现「修复仍未生效」→ 本轮**诊断 + 正式修复**，版本升至 **0.2.8**。
> 安装目标：**web profile**（不变）。

## 1. 问题与根因（最终确认版）

0.2.6/0.2.7 均存在：**切换聊天模型时报 `llm-deepseek: no API key for provider route "deepseek-official"`，且上下文面板为空**。

根因（两层）：

1. **Cordis context filter 过滤了插件的 waterfall 监听者**（主因）。
   插件在自身 fiber 上 `ctx.on('llm/stream', …)`，但 llm 服务分发 waterfall 时以**自身实例**为 `thisArg`，并按 `this[Context.filter]` 过滤监听者（`vendor/cordis/src/events.ts:168-170`）。该 filter 检查监听者 context 与 emit 侧是否同一 service isolate（`service.ts:64-66`）——用户添加插件是独立 fiber，不在 llm 服务的 isolate 内 → **监听者被过滤，从未触发** → 压缩请求按 DSH 默认规则走到「最近回答模型」= 基座默认的 `deepseek-official` → 无 `DEEPSEEK_API_KEY` → 报错。
   - 证据：会话日志解压后，所有会话中 `DIAGNOSTIC`/`DIAG2` 监听器触发标记均为 **0**；而 `/catalog` 等普通路由正常。
2. **`ctx.effect()` 包装进一步阻碍注册**（次因）：0.2.7 把 `ctx.on` 包进 `ctx.effect` 回调内执行，实机验证仍不触发。改为 **apply 期间直接注册**（不包 effect）后，监听器成功触发（诊断版证实 `listener fired`、`choice=nvidia/...`、`optionsFrozen=false`）。
3. **上下文面板为空**：设置页是 root scope，手动 `ctx.get('sessions')` 取当前会话无效；改用 DSH 注入设置页组件的 **`useSessions` 钩子**（`SettingsRoot.tsx:143-147` 同款）。

## 2. 修复内容（0.2.8）

| 文件 | 改动 |
| --- | --- |
| `plugin/src/index.ts` | ① `PluginContext.on` 签名加 `options?: unknown`；② 监听器注册改为 **apply 期间直接 `ctx.on('llm/stream', handler, { global: true, prepend: true })`**（不再包 `ctx.effect`），disposer 挂到 effect 保证插件卸载时清理 |
| `plugin/src/client/OpencodeLocalCard.tsx` | 向 `CompactionTab` 透传 `useSessions: props.useSessions` |
| `plugin/src/client/CompactionTab.tsx` | 当前会话 id 改用 `useSessions(selectMainSessionId)`（DSH 注入钩子） |
| `plugin/package.json` | `version` 0.2.7 → **0.2.8** |

`compaction.json` 机制不变（用户已选 `nvidia/nemotron-3-ultra-550b-a55b`，有 `NVIDIA_API_KEY`）。

## 3. 验收数据

| 项 | 结果 |
| --- | --- |
| typecheck（双 tsconfig） | ✅ 0 错 |
| build | ✅ `lib/index.js` 57.2 KB、`lib/client.js` 31.1 KB；无新增外部包；无诊断残留 |
| h1–h7 | ✅ `allPassed: true` |
| 打包 | ✅ `hbk-dsh-opencode-local-0.2.8.tgz` **28822 B**，SHA256 `77E400A6AE8FF3AA395BB744334AC2DD95D5F6A906FD74DEE81335C14F7AF413`，5 条目（⚠️ 首次打包 28622 B 的 tgz 曾**被系统删除**导致 pnpm `getTarballIntegrity` 失败、插件一度处于未安装状态；重新打包后存活并安装成功。若再遇 tgz 消失，怀疑杀软实时保护） |
| 安装 | ✅ web profile `0.2.7 → 0.2.8`；patch 字节级未变（74371 B）；已装 lib 与构建产物一致；版本 0.2.8 |
| 监听器选项 | ✅ 已装代码含 `global`/`prepend` 选项 |

## 4. 部署过程要点（踩坑记录）

1. **同版本重打包后 `dsh plugin add` 报 `Already up to date`**，pnpm 不更新已装文件 → 需 **remove + add**；若仍不更新，**直接覆盖** `node_modules/@hbk/dsh-opencode-local/lib/*.js`（本次最终采用，已验证与构建产物一致）。
2. **诊断版技巧**：让监听器触发时抛出带标记的错误（含读到的偏好值、options 冻结状态），一次重启即可确认「监听器是否触发 / 读到什么 / options 是否可写」。
3. **系统时钟偏差**：环境时钟约超前 20 小时（文件 mtime 出现「未来」时间），时间线推断以**文件内容与先后顺序**为准，不依赖绝对时间戳。

## 5. 待人工实机验收（重启 DSH 后）

| # | 项 | 期望 |
| --- | --- | --- |
| 1 | 切 `opencode-local/deepseek-v4.1-flash-free` | **不再报** `deepseek-official` key 错；压缩走 nvidia |
| 2 | 压缩模型选择器改选 | 即时生效（写 `compaction.json`），重启后保留 |
| 3 | 上下文状态面板 | 显示当前会话真实读数 |
| 4 | 人工 `/compact` 与自动压缩 | 统一走所选压缩模型 |
| 5 | 普通聊天 / 工具 / `allowAll` | 无回归 |
| 6 | `cordis.patch.yml` | 未被插件修改 |

## 6. 回滚

**⚠️ plugin/ 目录现存 tgz 仅有 `0.2.8.1.tgz` 与 `0.2.8.2.tgz`**（0.2.4–0.2.7 的 tgz 已不存在），回滚目标据此确定：

```powershell
# 插件回滚到 0.2.8.1（最后一个「上下文 tab/面板正常」的版本；其压缩改路由对 Catpaw2API 会话无效）
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.8.1.tgz
# 源码回退到 0.2.6（0.2.6/0.2.7/0.2.8.* 均未提交 git，勿用 git checkout HEAD）：
#   1) 从 temp/backup-0.2.6-src/ 恢复 index.ts / CompactionTab.tsx / package.json
#      （注意：会失去「上下文压缩」tab 与本修复，回到 0.2.6 功能状态）
# patch 回退：从 temp/reinstall-backup/ 对应备份恢复（会移除 compaction-basic 原生配置）
```

> 0.2.7 源码备份：`index.ts` / `CompactionTab.tsx` / `package.json`（0.2.7 状态）可从 git 工作区历史或按 impl-notes-0.2.7 记录恢复；patch 备份见 `temp/reinstall-backup/`。

---

## 7. 最终修复（0.2.8.2）：改用 compaction-basic 原生配置（人工批准方案 B，2026-11-20）

**诊断结论**：`{global:true}` 监听器**能触发**（llm-diag 证实），**改写也执行了**，但压缩最终仍走 deepseek-official——**跨工作区会话的压缩请求不经过插件 fiber 可见的 waterfall 实例**（Cordis 多 isolate 作用域隔离，两个子代理探针 + 会话日志交叉证实）。

**最终修复（人工批准，2026-11-20）**：放弃 llm/stream 事件拦截，改用 **compaction-basic 原生配置**——在 web profile 的 `cordis.patch.yml` 中给 compaction-basic 加：

```yaml
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    summarizationProvider: nvidia
    summarizationModel: nvidia/nemotron-3-ultra-550b-a55b
```

**效果**：压缩从源头走 nvidia 路由，**所有会话、所有工作区、所有作用域**原生生效，不依赖事件监听。

**附带修复**：patch 文件中位置 71734 的**非法控制字符 0x08**（历史损坏，应为 `bash` 的 `b`）已字节级修复——该字符会导致严格 YAML 解析器（如 Python yaml）报错。

**验证**：patch YAML 校验通过（Python yaml，17 条目，compaction-basic 配置正确）；0.2.8.2 打包（28855 B，版本 0.2.8.2）并安装 web profile 成功（lib 一致、patch 零差异、版本 0.2.8.2）。

**注意**：压缩模型选择器（设置页 tab）当前对应 nvidia/nemotron；**若 nvidia 路由请求失败（模型 id 为 OpenRouter 命名，NVIDIA 端点可能无此模型），需改选已验证可用的路由**（如 moss/nex-n2.6、workbuddy/hy4flash-free、loomy2api/deepseek-v4-flash-1017），改选后需同步更新 patch 的 compaction-basic 配置并重启 DSH。

## 8. 待人工实机验收（重启 DSH 后）

| # | 项 | 期望 |
| --- | --- | --- |
| 1 | 切 `opencode-local/deepseek-v4.1-flash-free` | 压缩走 nvidia（原生配置），**不再报 deepseek-official key 错** |
| 2 | 上下文状态面板 | 正常显示读数 |
| 3 | 普通聊天 / 工具 / `allowAll` | 无回归 |
| 4 | `cordis.patch.yml` | 仅 compaction-basic 新增配置 + 0x08 字符修复，其余未变 |
