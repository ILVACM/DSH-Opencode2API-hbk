# dsh-connect-workbuddy GUI 实现分析报告

> 分析对象：`temp/dsh-connect-workbuddy-main`（dingminhua/dsh-connect-workbuddy v5.20.3，MIT © LaoDing）
> 目的：为本插件阶段 2 的 GUI（设置页 opencode-local 卡片 + 可用模型/可用工具两 tab）提取可复用的实现契约。
> 结论先行：**它的 GUI 形态与我们的目标高度吻合**（设置卡片 + 多 tab + 逐模型探测 + 配置开关），契约可整套借鉴；但它背着账号池/双区域/积分/签到等大量我们不需要的包袱，**应学其契约、写自己的精简实现**，而非搬代码。
> 许可提示：该 repo 为 MIT，且注明沿用 dsh-connect-trae / dsh-subagent-default-model（均 MIT）。若逐字复制代码须保留署名；建议净室实现契约模式以规避许可纠缠。

## 1. 它是什么（一句话）

把本机登录的 WorkBuddy 模型接入 DSH 的插件：服务端注册 LlmAdapter 供模型，浏览器端在 DSH 设置页贡献一张卡片管理账号/模型/能力开关。与我们「服务端驱动真实 CLI + 浏览器端设置卡片」的双半结构完全同形。

## 2. GUI 总体形态：两个独立 bundle

插件被 tsdown 打成**两份产物**（`tsdown.config.ts:50-110`）：

| bundle | 入口 | 产物 | 平台/格式 | 运行处 |
| --- | --- | --- | --- | --- |
| 服务端 | `src/index.ts` | `lib/index.js` | node / esm | DSH 宿主进程（注册 adapter、起子进程、开状态路由） |
| 浏览器端 | `src/client/index.tsx` | `lib/client.js` | browser / cjs | DSH  web 前端（设置卡片 UI） |

**浏览器 bundle 的特殊包装**（`tsdown.config.ts:103-108`，必须照抄）：
```
banner: window.__ModuleLoader__.load({ id: "<插件id>", factory: (require) => {
intro:  var module = { exports: {} }; var exports = module.exports;
footer: return module.exports; } });
```
DSH 前端用 `window.__ModuleLoader__` 加载插件 client 模块，这个外壳是宿主要求的固定形状。

**package.json 声明**（`package.json:27-80`）：
- `exports["./client"] = "./lib/client.js"`
- `dsh.bundle.patch = "./cordis.patch.yml"`（服务端 loader 行）
- `dsh.client = { inject: [...], platform: "web" }` —— inject 列出 UI 需要的宿主客户端服务：
  `@deepseek-ai/dsh-client-ui-settings`、`dsh-client-ui-slots`、`dsh-client-ui-settings-plugins`、`dsh-client-locale`。

**头号坑（`tsdown.config.ts:18-48`）**：`react`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis` 及一众 dsh-client-* 必须 **external（neverBundle）**。尤其 react-dom 一旦打进 bundle，其 CJS 开发版开头的 `if (process.env.NODE_ENV !== "production")` 会在浏览器抛 `process is not defined`，**整个 client 半加载失败**。宿主已注册这些模块，external 后变成 require 由页面解析。

## 3. 浏览器入口契约（`src/client/index.tsx`）

导出三件套（`index.tsx:76-90`）：
```ts
export const name = '<插件id>-client'
export const inject = ['slots', 'locale']        // 只声明两条宿主服务门
export function apply(ctx: Context & { slots, locale }): void { ... }
```

apply 内部的关键动作：
1. **注册文案**：`ctx.locale.register('settings.<ns>', { zh, en })`，`ctx.locale.bind(ns)` 得到翻译函数 `t`（`index.tsx:92-94`）；并做 `LocaleNamespaceMap` 模块增强（68-73）。
2. **软探测宿主服务**：用 `ctx.get(name)`（缺席返回 undefined、不抛）而非直接属性访问（未 inject 的属性 getter 会抛）（`index.tsx:96-101`）。`configForms` 是 0.1.7+ 的设置面。
3. **注册设置卡片**：`ctx.slots.inject('settings.section', () => { ctx.slots.register({ name:'settings.section', id, order, label:()=>t('nav.panel'), locale, inject:()=>props }, CardComponent) })`（`index.tsx:172-200`）。`slots.inject` 本身就是探针——宿主没有该槽就什么都不做，不抛不挂。
4. **配置面晚绑定**：`configForms.whileServed(候选命名空间, served => { 绑定 settingsScope; 重新注册全部槽 })`（`index.tsx:801-864`）。
5. **整体 try/catch 降级**：apply 全身包 try/catch，失败只 `console.error`，**不触发宿主 "Failed to load plugins" 红横幅**，服务端 provider 不受影响（`index.tsx:90-91, 903-907`）。

**两个必须继承的稳定性机制**：
- **先 dispose 再 register**：keyed 槽对同一 key 重复注册会抛；重绑时必须先拆旧再建新（`index.tsx:737-768`）。
- **晚绑定要重建而非改闭包**：渲染器按 entry 身份缓存 inject 结果，配置面晚到后只有「拆旧注册 + 建新注册」才能让卡片拿到 settingsScope（`index.tsx:794-800`）。

## 4. 卡片组件与 tab 机制（`src/client/WorkBuddyCard.tsx`，4222 行）

**注入 props 契约**（`WorkBuddyCard.tsx:101-114`）：
```ts
interface Injected {
  t: Translate
  settingsScope?: {                       // 可选：无配置面时卡片只读
    getSnapshot(): { status: string; value?: unknown; writable: boolean }
    subscribe(listener: () => void): () => void
    set(field: string, value: unknown): Promise<boolean | void>
  }
}
```
另有 `surface: 'card'|'page'|'settings'`（`130`）：`settings` 面由宿主壳拥有标题/关闭/滚动，卡片**只渲染内容**，去掉自己的折叠/返回控件。我们直接用 `settings` 面。

**tab 实现**（正是我们要的「多个独立 tab」）：
- 一个 state：`const [panel, setPanel] = useState<'accounts'|'models'|'capabilities'|'diag'|'sdk'>('accounts')`（`678`）。
- tab 栏：`<div role="tablist">` 内每个 `<button role="tab" onClick={()=>setPanel('models')}>`（`3320-3390`）。
- **非活动 tab 保持挂载、用 `hidden` 属性隐藏**（`666-669` 注释）：切回不重新拉数据、未保存草稿不丢、日志保留。
- 我们的卡片只需两个 panel：`'models'`（可用模型）、`'tools'`（可用工具），比它简单得多。

**崩溃 faces**：宿主给每个槽包了 `SlotErrorBoundary`，但其失败面是**空 div**（看起来像插件没装）。所以卡片自带 `CardBodyBoundary`（`575-613`）在渲染抛错时显示「配置区崩了 + 错误消息」，header 不受影响。值得我们继承。

## 5. GUI ↔ 服务端数据通道：同源状态路由

浏览器卡片**不直接碰凭据/子进程**，而是 fetch 插件自己在宿主注册的同源路由（`src/status-paths.ts`）：

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/plugins/<id>/usage` | GET | 主状态文档（账号/模型目录/开关），卡片 60s 轮询 |
| `/plugins/<id>/models/refresh` | POST | 手动刷新模型目录 |
| `/plugins/<id>/probe` | POST | **逐模型可用性探测**（凭据只在服务端，绝不下浏览器） |
| `/plugins/<id>/accounts/refresh` | POST | 重扫账号（我们不需要） |

服务端注册方式（`src/index.ts:2763-2810`）：
```ts
ctx.inject(['webServer'], (webCtx) => registerStatusRoute(webCtx, { ... }))
```
**用 `ctx.inject` 反应式等待 webServer**（它可能晚于插件挂载），不能 apply 时 `ctx.get()` 一次性采样（Desktop 上会静默丢掉所有路由）。fetch 带 `credentials: 'same-origin'`。

**这就是我们「可用模型」tab 的现成蓝图**：
- 服务端开 `/plugins/opencode-local/models`（GET，返回免费模型 + 上下文 + 探测结果）和 `/plugins/opencode-local/models/refresh`（POST，重新探测）。
- 探测在服务端跑（复用阶段 0/1 的 serve 客户端发最小请求），结果缓存；浏览器只读结果。
- 对话框右下角模型选择器的过滤 = 服务端 `adapter.listModels()` 只返回探测通过的模型（设置页则返回全部探测到的免费模型，含失败的，标注状态）。

## 6. 逐模型探测的 UI 模式（直接对应我们的需求）

`WorkBuddyCard.tsx` 里有一套完整的探测 UI 机制，几乎可照搬语义：
- 状态：`probes`（按模型 id 存探测结果）、`probing`（哪些在飞）、`sweeping:{done,total}`（批量进度）（`809-824`）。
- `probeResultView(result)`（`485-546`）把结果分档渲染：`ok` / `rate-limited` / `credential-rejected` / `account-restricted` / `not-found` / `unavailable`… 每档配文案与色调（ok/warn/bad）。**地区限制**这类正好落在 `unavailable`/`policy-rejected` 档。
- 单模型探测按钮 + 全量 sweep 按钮（带 n/m 进度）。
- 我们的「自动探测一次 + 手动刷新」= 服务端启动/刷新时跑 sweep，卡片显示每模型档位 + 刷新按钮触发重新 sweep。

## 7. 配置开关的读写模式（对应我们的「可用工具」tab）

- 读：**宿主答案优先，浏览器 settings 镜像兜底**。因为在受影响的 0.1.7 部署上，浏览器镜像对本插件命名空间是 stale 的——只读镜像会让成功保存看起来「 revert 了」（`WorkBuddyCard.tsx:1218-1226` 等多处反复强调）。
- 写：不直接 `scope.set()`，走带「落地校验 + 宿主端点兜底」的 writeField 助手（`account-selection.ts` 的 write* 系列）；写完 re-fetch 宿主状态让控件显示已提交值。
- 每个开关独立 busy 标志（翻一个不禁用其它）；对象型字段保留无控件的同伴字段（`1590-1601`）。
- 我们的工具 tab：全局 `toolMode` 开关 + 逐工具白名单开关，写 `toolMode`/`toolAllowlist` 配置；服务端 apply 收到配置后调整审批策略（阶段 2 路径 B）。

## 8. 样式与 i18n

- **样式**：一个 CSS 字符串常量（`styles.ts`），模块加载时注入一次 `<style data-plugin-css="<id>/client.css">`（`WorkBuddyCard.tsx:294-307`，幂等更新）。类名 `dsm-*`，颜色用宿主主题变量 `var(--dsw-alias-*, #回退色)`。折叠箭头用**纯 CSS caret**（宿主图标命名族随 DSH 版本变，静态导入必挂一边）——版本无关，值得学。
- **i18n**：`locales.ts` 导出 `en`/`zh` 两个对象，`Record<Key,string>` 强制中英键 1:1；命名空间 `settings.<ns>`，文案键约定 `nav.*` / `row.*`。我们至少做 zh + en（en 是语言链兜底）。

## 9. 详情页（次要，了解即可）

`docs/PLUGIN-DETAIL-GUIDE.md`：DSH 0.2.2+ 插件详情页默认整篇渲染 README；要短简介需在每个 `locale/*.json` 的 `meta.detail` 指向一份 ≤100 字符 md。workbuddy 自己已弃用此法（详情页显示完整 README）。我们阶段 2 可不做，README 写干净即可。

## 10. 映射到本插件阶段 2 的 GUI 架构（建议）

**服务端新增**（`plugin/src/`）：
- `web/routes.ts`：`ctx.inject(['webServer'])` 注册 `/plugins/opencode-local/models`（GET）、`/models/refresh`（POST）。模型探测复用 `serve/client.ts`；免费判定来源待定（serve 成本信息 vs models.dev）；探测结果缓存 + 预算控制。
- `adapter/listModels` 改为只返回探测通过者（选择器过滤）；设置页路由返回全部免费模型 + 探测档位。
- 配置 schema 增 `toolMode`、`toolAllowlist`（路径 B）。

**浏览器端新增**（`plugin/src/client/`）：
- `index.tsx`：name/inject=['slots','locale']/apply；locale.register；slots.inject('settings.section') 注册 `OpencodeLocalCard`（id='opencode-local'，surface='settings'）；configForms.whileServed 晚绑定；整体 try/catch 降级。
- `OpencodeLocalCard.tsx`：两 tab（models / tools），hidden 保持挂载；自带 CardBodyBoundary。
  - models tab：fetch `/plugins/opencode-local/models` → 表格（模型名 / 上下文窗口 / 探测档位）+ 刷新按钮（POST refresh）+ 轮询。
  - tools tab：全局 toolMode 开关 + 逐工具开关，settingsScope 写配置。
- `styles.ts`（dsm-opencode-local-* + 主题变量）、`locales.ts`（zh/en）、`status-paths.ts`（node-free 路由常量 + 共享类型）。

**构建/打包改造**：
- `tsdown.config.ts` 改双入口（node index + browser client），client 用 ModuleLoader 包装 + CLIENT_EXTERNALS（react/react-dom 等 external）。
- `package.json` 加 `exports["./client"]`、`dsh.client`、react 及 dsh-client-* 为 peer/devDependencies、`files` 含 lib。
- `tsconfig.client.json`（browser 类型）。

## 11. 必须继承的坑位清单（稳定性优先）

1. react-dom 等宿主模块必须 external，否则浏览器整半崩溃。
2. client bundle 的 ModuleLoader banner/intro/footer 固定形状照抄。
3. 槽注册先 dispose 再 register；晚绑定配置面要重建注册（渲染器按身份缓存）。
4. apply 全身 try/catch → console.error 降级，不触发红横幅、不影响服务端 provider。
5. 配置读「宿主答案优先、镜像兜底」；写带落地校验 + 宿主端点兜底；写后 re-fetch。
6. 凭据与模型探测只在服务端，浏览器只读结果。
7. webServer 用 ctx.inject 反应式等待，不要一次性采样。
8. 槽名（settings.section 等）不在 0.1.7 SlotMap 类型表里 → 结构化类型 / `as never`，靠运行时。
9. CSS 用主题变量 + 回退色；图标用纯 CSS（版本无关）。
10. 卡片自带错误边界（宿主边界失败面是空 div）。
11. DSH 版本线差异（0.1.5 settingsScope / 0.1.7 configForms / 0.2.x）：软探测 ctx.get，inject 只声明两线都有的服务。

## 12. 规划前仍需确认（留给 phase-2.md）

- 本机 DSH 桌面版精确版本线（阶段 1 验收已过 ⇒ ≥0.1.7，但 configForms 行为随线变）。
- 免费模型判定来源（serve 返回的 cost 信息 vs models.dev 元数据）。
- 模型探测的额度预算与缓存策略（每模型一次真实请求；模型多时开销可观）。
- 是否逐字借鉴代码（须 MIT 署名）还是净室实现契约（建议后者）。