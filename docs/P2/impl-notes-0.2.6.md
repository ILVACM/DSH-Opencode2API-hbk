# 0.2.6 实施记录（impl-notes）

> 执行日期：2026-11-17 ~ 2026-11-18（Asia/Shanghai）
> 施工依据：`temp/code.md` v2（对应 `temp/debug.md` v3 定案）→ 已归档 `docs/P2/code-debug-0.2.6.md`
> 人工指令：「根据 temp/debug.md『执行』优化迭代，修改完代码后，打包构建插件，版本 0.2.6，重装插件到 web profile」
> 安装目标：**web profile**（不变）。

---

## 1. 本轮目标

把「压缩用哪个模型」的偏好从 **DSH profile 配置**（每次写入触发重写 `cordis.patch.yml` + 完整 profile 重组 + serve 重启，导致切换卡顿）迁到**插件自有轻量文件** `~/.dsh-opencode-local/compaction.json`，使切换**即时生效**，且**不依赖 DSH 版本细节**。

## 2. 执行方式

- **多 agent 并行**（`code.md §1`）：探针（probe-1/probe-2 双文件 10 字节比对）通过 → 5 个工作包并行派发。
- **过程中出现执行者失败**（4/5 无 closing message），但盘点证实 **A/C/D/E 四组实际已落盘且与 `code.md` 一致**（逐项核对通过）；仅 **B 组两个文件**（`web/routes.ts`、`index.ts`）未完成。
- **剩余工作由主执行者串行补完**（`code.md §1.3` 允许串行，产物与并行一致）。

## 3. 改动清单（9 文件：1 新增 + 8 修改）

| 文件 | 改动 |
| --- | --- |
| `plugin/src/compaction-store.ts` | **新增**：`parseCompactionDocument`（纯函数，文档级/字段级回落）、`readCompactionFile`（同步容错 + mtime/size 缓存）、`writeCompactionFile`（异步原子：tmp+rename+Windows 重试；幂等短路；写后失效缓存）、`migrateCompactionFile`（同步一次性，存在即跳过） |
| `plugin/src/config.ts` | **删除** `compactionProvider`/`compactionModel`（接口、schema、resolveConfig、`liveCompactionProvider/Model` 两函数）；`applyCompactionRoute` 原样保留 |
| `plugin/src/index.ts` | 启动期一次性迁移（`configEditor.configuration()` 只读旧值 → 写 `compaction.json`）；`llm/stream` 监听器**仅压缩请求**读 store；web 路由 deps 接 store 读写；`apply` 保持同步、`inject` 保持 `['llm']` |
| `plugin/src/web/routes.ts` | 新增 `GET/POST /plugins/opencode-local/compaction`（**单 handler 分流**，避免重复路径注册）；POST 校验两字符串、失败 500 带原因、成功回读写后值 |
| `plugin/src/client/status-paths.ts` | 新增 `COMPACTION_PATH`、`WebCompactionPayload` |
| `plugin/src/client/CompactionTab.tsx` | 移除 `scope` 配置读写；打开面板 GET 一次；点选**乐观更新**→POST→失败回滚提示 |
| `docs/impl-harness/h6-compaction.mjs` | 断言改用 `DEFAULT_COMPACTION` + 「读不存在文件回落默认」 |
| `docs/impl-harness/h7-compaction-ui.mjs` | **重写**：解析（文档级/字段级回落）、缺失默认且不创建文件、写读往返、**幂等短路（mtime 不变）**、**写后立即读为新值（缓存失效）**、坏文件回落 + 写入自愈、迁移（存在跳过/逐字段回落/不覆盖）、路由语义 5 例、路径常量 7 项；`finally` 清理临时文件 |
| `plugin/README.md` | 「上下文压缩」tab 追加「偏好存哪」说明 |
| `plugin/package.json` | `version` 0.2.5 → **0.2.6** |

**未动**（与 0.2.5 备份逐字节比对一致）：`adapter/flatten.ts`、`adapter/translate.ts`、`adapter/turn.ts`、`types.ts`、`client/OpencodeLocalCard.tsx`、`client/index.tsx`、`client/locales.ts`、`client/styles.ts`；`cordis.patch.yml`、`tsconfig*`、`tsdown.config.ts`、`api/`、`serve/`、`catalog/` 也零改动。

## 4. 验收数据

| 项 | 结果 |
| --- | --- |
| typecheck（双 tsconfig） | ✅ EXITCODE=0（首轮发现 A 组删除不完整——`resolveConfig`/两个 live 函数残留，5 个 TS2339/TS2353——已补删，复跑通过） |
| build | ✅ `lib/index.js` 57131 B、`lib/client.js` 30829 B；**无新增外部包**（无 zod / storage 引用） |
| h1–h7 | ✅ `allPassed: true`（h2 tool-approved、h5 cap-bypassed、h6 压缩实机 `dsh-h-compact-…`/agent build/rejected 0、h7 新用例全过） |
| h7 临时文件 | ✅ 测试后 `temp/impl-harness-data/h7-compaction-store.json` 不存在 |
| 打包 | ✅ `hbk-dsh-opencode-local-0.2.6.tgz` **28523 B**，SHA256 `B15928B1178082F53E103E71B403B034B53CA54228322534C66C3100EE19C78A`，包内恰 5 条目 |
| 安装 | ✅ web profile `0.2.5 → 0.2.6`，EXITCODE=0 |
| 已装 lib | ✅ 与构建产物逐字节一致（index/client 哈希相同） |
| 已装版本 | ✅ 0.2.6 |

### 4.1 关于 web `cordis.patch.yml` 的哈希说明（重要）

- **`dsh plugin add` 未改动 patch**：安装前备份与安装后文件**字节级完全相同**（71784 B，首个差异字节 = -1；`Compare-Object` 零差异）。
- P0 时刻记录的基线 SHA256（`31CC092C…`）与安装前不同（`81BBAF0C…`）：该变化发生在 **11-17 → 11-18 的施工暂停期间**（约一天），期间本执行**没有任何写操作**，属环境自身漂移（日常使用/DSH 自动整理）。已留档两份文件：`temp/reinstall-backup/cordis.patch.yml.bak-0.2.6-20261118-203002`（安装前）与当前文件，可随时复核。
- 本插件**没有修改** `cordis.patch.yml`；patch 中可能残留的旧 `compactionProvider/Model` 键无害（schema 已删，schemastery 保留未知键），按人工裁决**不做清理**。

## 5. 运行时说明（重启后已验证）

- `~/.dsh-opencode-local/compaction.json` **已由插件启动迁移自动生成**（实测内容 `{version:1, provider:"deepseek-official", model:"deepseek-flash"}`；若 profile 旧配置里有人工改过的压缩模型，则会迁移那个值）。
- 压缩路由从该文件动态读取（仅压缩请求读，普通对话零磁盘开销）；人工后续改选压缩模型 = 一次轻量文件写，**即时生效**。

## 6. 回滚命令

```powershell
# 插件回滚（0.2.5 tgz 仍在）
dsh plugin --profile web add file:D:/DSH-Opencode2API-hbk/plugin/hbk-dsh-opencode-local-0.2.5.tgz
# 源码回到 0.2.5（0.2.5 未提交 git，禁用 git checkout HEAD）
Remove-Item D:\DSH-Opencode2API-hbk\plugin\src -Recurse -Force
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.5-src\src D:\DSH-Opencode2API-hbk\plugin\src -Recurse -Force
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.5-src\package.json D:\DSH-Opencode2API-hbk\plugin\package.json -Force
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.5-src\README.md D:\DSH-Opencode2API-hbk\plugin\README.md -Force
Copy-Item D:\DSH-Opencode2API-hbk\temp\backup-0.2.5-src\impl-harness\* D:\DSH-Opencode2API-hbk\docs\impl-harness\ -Recurse -Force
```

## 7. 人工实机验收 —— ✅ 已通过（2026-11-18 人工确认「所有改进全部生效并且通过验收」）

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 切换压缩模型 | ✅ 界面**立刻**变化（乐观更新），无卡顿 |
| 2 | 重开「上下文压缩」tab | ✅ 仍显示所选值（从 `compaction.json` 动态读取） |
| 3 | 重启 DSH 后 | ✅ 值保留；`compaction.json` 已由启动迁移生成（`{version:1, provider, model}`，实测内容正确） |
| 4 | 长对话切模型 / 切 1M | ✅ 不报 402（统一性未回归） |
| 5 | 删除/写坏 `compaction.json` | ✅ 回落官方默认，不报错不崩 |
| 6 | 设置页 | ✅ 无「压缩模型」的 DSH 原生配置项 |
| 7 | patch | ✅ 未被本插件修改（残留旧键无害） |

### 7.1 部署插曲（已解决，留档防再犯）

- **现象**：安装 0.2.6 后**未重启 DSH** 即使用，浏览器报 `Failed to execute 'json' on 'Response': Unexpected end of JSON input`。
- **原因**：`dsh plugin add` **不会重载已运行 DSH 进程内的插件后端**——浏览器端 client.js 已是 0.2.6 新代码（请求新路由 `/plugins/opencode-local/compaction`），而 host 端仍是 0.2.5 旧代码（无此路由）→ **404 + 空 body**（`webserver/src/index.ts:614-617`：路径未匹配 → `404 + res.end()`）→ 前端 `res.json()` 解析空串报错。
- **佐证**（匿名 curl 探针，只读）：旧路由 models / catalog / context / compact 全部 200，唯 `/compaction` **404**；且 `/catalog` 的 `default` 仍从 profile 旧配置读出（`loomy2api / GLM-5.3-Flash`，即人工期间调整过的值），证明 host 为旧代码。
- **解决**：完全退出并重启 DSH 后消失，验收通过。`compaction.json` 已由启动迁移自动生成，内容正确。
- **结论**：**`dsh plugin add` 之后必须完全退出并重启 DSH 才算部署完成**；可用匿名 curl 探针（路由存在 → 401 / 不存在 → 404）快速定位此类「前后端不一致」问题。
