# 0.2.7 实施记录（impl-notes）

> 执行日期：2026-11-19（Asia/Shanghai）
> 施工依据：`temp/code.md` v3（依据 `docs/plan.md` 0.2.7 修复迭代计划）→ 已归档 `docs/P2/code-debug-0.2.7.md`
> 人工指令：按 `temp/code.md` 执行迭代优化，构建打包 0.2.7，重装到 web profile
> 安装目标：**web profile**（不变）。

## 1. 本轮目标

修复 0.2.6 实机暴露的**两个接线缺陷**：

1. **压缩改路由从未生效**：插件在自身 fiber 上注册 `llm/stream` 监听器，但 Cordis 分发 waterfall 时按 llm 服务的 context filter 过滤监听者（`vendor/cordis/src/events.ts:168-170`），独立插件 fiber 被过滤 → 监听器从未触发 → 压缩请求仍落到 DSH 默认官方路由（`deepseek-official`，需 `DEEPSEEK_API_KEY`）→ 切换模型时报 key 缺失错误。
2. **上下文状态面板一直为空**：设置页是 root scope，不携带会话信息；手动 `ctx.get('sessions')` 取当前会话的方式无效 → 从不请求上下文数据。

## 2. 执行方式

- **多 agent 并行**：能力探测（probe-1v7 / probe-2v7，双文件 10 字节比对）通过 → 3 个工作包 A/B/C 并行派发，三个代理均完成且自检全绿。
- 主执行者串行验收、打包、安装。

## 3. 改动清单（3 文件）

| 文件 | 改动 |
| --- | --- |
| `plugin/src/index.ts` | ① `PluginContext.on` 签名加第三参 `options?: unknown`；② `llm/stream` 监听器注册改为 `listen.call(ctx, 'llm/stream', handler, { global: true, prepend: true })` 并补注释——`global: true` 绕过 llm 服务的 context filter，确保插件监听者真正收到所有压缩请求（与 DSH 自家 `session-title/src/index.ts:360-363` 同款）|
| `plugin/src/client/CompactionTab.tsx` | 整文件替换：删除失效的 `currentSessionId(props.sessions)`，新增导出纯函数 `selectMainSessionId(state)`，会话 id 改用 DSH 注入的 **`useSessions` 钩子**：`const sessionId = useSessions(selectMainSessionId)`（与 `SettingsRoot.tsx:143-147` 同款）|
| `plugin/package.json` | `version` 0.2.6 → **0.2.7** |

**未动**：`compaction-store.ts`、`config.ts`、`web/routes.ts`、`status-paths.ts`、监听器内部判断/改派逻辑、`cordis.patch.yml`、依赖清单、所有测试文件。

## 4. 验收数据

| 项 | 结果 |
| --- | --- |
| 自检 | A：global=1 / options=2 / liveCompaction=0；B：useSessions=1 / export=1 / currentSessionId=0 / props.sessions=0；C：0.2.7=1 / 0.2.6=0 —— 全部符合 |
| typecheck | ✅ 双 tsconfig EXITCODE=0 |
| build | ✅ `lib/index.js` 57172 B、`lib/client.js` 31049 B；无新增外部包 |
| h1–h7 | ✅ `allPassed: true`（h2 no-tool、h5 cap-bypassed、h6 压缩实机 `dsh-h-compact-…`/agent build/rejected 0、h7 全过）|
| 打包 | ✅ `hbk-dsh-opencode-local-0.2.7.tgz` **28631 B**，SHA256 `621DE5076503E3E76B795D591B0B54231B265C056C504B8DEB9ACF45DAF1688C`，包内恰 5 条目 |
| 安装 | ✅ web profile `0.2.6 → 0.2.7`，EXITCODE=0 |
| patch 校验 | ✅ 安装前后字节级相同（75567 B，首差字节 -1）；备份 `temp/reinstall-backup/cordis.patch.yml.bak-0.2.7-20261119-170116` |
| 已装 lib | ✅ 与构建产物逐字节一致（index/client 哈希相同） |
| 已装版本 | ✅ 0.2.7 |

## 5. 部署须知（⚠️ 硬性）

**`dsh plugin add` 后必须完全退出并重启 DSH**——host 端不会热重载已加载的插件代码。0.2.6 曾因未重启出现「前端新/后端旧」不一致（`Unexpected end of JSON input`）。本次安装同样**未主动重启**，需人工重启后新监听器与新面板代码才会生效。

## 6. 回滚

```powershell
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.6.tgz
# 源码回 0.2.6（0.2.6 未提交 git，勿用 git checkout HEAD）
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.6-src\index.ts D:\DSH-Opencode2API-hbk\plugin\src\index.ts -Force
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.6-src\CompactionTab.tsx D:\DSH-Opencode2API-hbk\plugin\src\client\CompactionTab.tsx -Force
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.6-src\package.json D:\DSH-Opencode2API-hbk\plugin\package.json -Force
```

## 7. 待人工实机验收（重启 DSH 后，见 `docs/plan.md §4`）

| # | 项 | 期望 |
| --- | --- | --- |
| 1 | 切换 `opencode-local/deepseek-v4.1-flash-free` | **不再**报 `deepseek-official` key 错误（压缩真正改派到所选模型如 nvidia） |
| 2 | 压缩模型选择器 | 改选即时生效；重启后保留 |
| 3 | 上下文状态面板 | 正常显示当前会话 token/窗口读数（不再为空） |
| 4 | 人工 `/compact` 与切模型自动压 | 统一走选择器所选模型 |
| 5 | 普通聊天 / 工具 / `allowAll` | 无回归 |
| 6 | `cordis.patch.yml` | 未被本插件修改 |

## 8. Hotfix（同版本 0.2.7，2026-11-19 17:19）—— `useSessions is not a function`

**现象**：首次安装 0.2.7 后整个上下文 tab 消失，报 `opencode-local card crashed: useSessions is not a function`。

**根因**：renderer 注入的 standard kit（`useSessions` 等钩子）**只传给顶层 slot 组件**（`OpencodeLocalCard`），而 `CompactionTab` 是 `OpencodeLocalCard` 内部用 `h()` 自渲染的子组件——上一轮只改了 `CompactionTab` 读 `props.useSessions`，但父组件渲染它时**没有透传这个 prop**（只传了 `{t, scope, sessions}`），所以 `props.useSessions` 是 `undefined`，调用即抛错，`CardBoundary` 捕获后显示崩溃。

**修复（1 行）**：`plugin/src/client/OpencodeLocalCard.tsx:80` —
`h(CompactionTab, { t, scope, sessions })` → `h(CompactionTab, { t, scope, sessions, useSessions: props.useSessions })`。

**验证**：typecheck 0 错；build 成功（`client.js` 31090 B）；h1–h7 `allPassed:true`；重新打包 0.2.7（28637 B / SHA256 `E9B30757…`，5 条目）。
**部署**：因版本号未变，`dsh plugin add` 首次返回 `Already up to date`（已装包未更新）→ 改用 **`dsh plugin --profile web remove @hbk/dsh-opencode-local` 再 `add`** 强制重装；最终已装 `client.js` 与构建产物**逐字节一致**，hotfix 代码已在已装包中；patch 零差异（75505 B）；版本仍 **0.2.7**。备份 `temp/reinstall-backup/cordis.patch.yml.bak-0.2.7-hotfix-20261119-171946`。
**教训**：同版本重打包后必须强制重装（remove+add），否则 pnpm 因版本未变不更新文件；嵌套子组件拿不到 renderer standard kit，顶层组件必须显式透传注入的钩子。
