# 0.2.4 收尾调优 — 实施记录

> 执行日期：2026-11-11；计划：`C:\Users\hbk\.qoder-cn\plans\timeless-cove-bear.md`（人工批准）；模式：串行。
> 基线：0.2.3；目标：0.2.4。

## 需求与根因

0.2.3 后实机仍见 `[工具]/[完成]` 平铺。确诊：插件自身笔记已全部 reasoning（DSH 默认折叠、流式不自动展开，源码核实）；残留是**模型模仿历史格式在正文里输出**——flatten 把旧 text 笔记原样回喂。用户规则：凡行首 `^\[[^\]\n]+\]` 的内容行全部折叠为思考，只留正文。

## 改动（3 改 2 增）

1. `plugin/src/adapter/translate.ts`：行级路由状态机（RouteState/push/route/endChunk/closeRoutes）。惰性开块；仅行首 `[` 前缀缓冲（上限 64），普通正文逐字透传不退化；同类共块、类切换闭旧开新；block-end 用自累积文本；sawText 只在真实 text 输出时置位；三终态前 closeRoutes 闭悬空块。note()/reasoning 透传/finish 逻辑不动。
2. `plugin/src/adapter/flatten.ts`：assistant 历史 text 块剥掉笔记行（断模仿源）；先剥后拼 `[assistant]:` 前缀；user/system/当前 prompt 不动。
3. `plugin/package.json`：0.2.3 → 0.2.4。
4. 新增 `temp/P2/impl-harness/h5-note-routing.mjs`：合成 SSE 事件直测，**零对话预算**；10 组用例（流式时点 channel、跨 delta 切分、多 ordinal 交错、纯笔记 EMPTY_RESPONSE、12 项边界、flatten 过滤）+ 全用例协议不变量检查。
5. `temp/P2/impl-harness/run-all.mjs`：注册 h5。

## 验证（串行，全部通过）

- h5 单跑 10/10（过程中修正 2 处**测试自身**错误：行中括号不算笔记，用例改为换行后起笔记行；路由器行为始终符合规则）。
- typecheck 双项目 0 错；build（index.js 42.39 kB / client.js 19.83 kB）。
- run-all **allPassed: true**（h1-h5，对话预算 4/12，h5 零消耗）；h2 tool-approved 断言无回归。
- `npm pack` → **hbk-dsh-opencode-local-0.2.4.tgz**（18298B，shasum 302f934c…）。

## 已知 trade-off（计划内）

- 行首 Markdown 链接 `[link](url)` 会被折叠（用户规则的有意宽匹配）。
- 纯笔记无正文回合 finish=EMPTY_RESPONSE（可重试码，走既有重试）。
- 行首空白缩进的笔记不匹配（严格列 0）。
- API 通道顺带净化（server 只读 text-delta，未改）。

## 待人工实机验收

装 0.2.4 到 desktop profile，完全退出 DSH 重开：①含工具调用的对话；②含旧笔记历史的对话。期望：`[XX]` 行全部默认折叠思考行、可展开；正文逐字流出、无整行卡顿。

---

## 回退记录（2026-11-11 15:56，人工裁决）

**人工实测否决**：0.2.4 装机实测「不是很方便」，裁决回退到 0.2.3 并重新构建打包。0.2.3 的行为（插件工具笔记走 reasoning 折叠、模型正文原样透传、历史不剥行）是已验收的舒适点。

**回退范围（5 项，按批准计划执行）**：
1. `translate.ts` 还原 0.2.3：删 RouteState/push/route/endChunk/closeRoutes 与 NOTE_PREFIX_CAP，`textIndex` Map 还原，三个 `session.text.*` case 还原，note()（reasoning 版）不动。
2. `flatten.ts` 还原原始版：删 NOTE_LINE/stripNoteLines，blockText 单参数、text 原样。
3. `package.json`：0.2.4 → 0.2.3。
4. `run-all.mjs`：注销 h5，循环还原 h1-h4。
5. 删除 `h5-note-routing.mjs`（0.2.4 专属测试）。h2 的 0.2.3 断言（reasoning 含 `[工具]`）保留不动。

**验证（串行，全部通过）**：残留扫描 0 命中（无 RouteState/closeRoutes/stripNoteLines）；typecheck 双项目 0 错；build（index.js 39.55 kB）；run-all **allPassed: true**（h1-h4，预算 4/12，h2 tool-approved 无回归）；`npm pack` 重新生成 **hbk-dsh-opencode-local-0.2.3.tgz**（17505B，shasum `08058625ca7476a448147263a6fa8a1670af7560`）——**与回退前 0.2.3 包 shasum 完全一致，逐字节确认还原精确**。

**状态**：当前代码 = 0.2.3（已重新打包待装）；0.2.4 tgz 保留在 plugin/ 作历史，标记「实测否决已回退」。