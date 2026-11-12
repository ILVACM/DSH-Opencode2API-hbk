# 阶段 0 · 代码实现计划（施工图）

> 性质：本文件是**确定性执行方案**。任何模型 / agent 软件，只要逐字遵循本文件，必得到相同结论与验收结果（raw 记录中的时间戳、事件 id、端口号天然不同，不算差异）。
> 状态：待人工审核。**审核通过前禁止执行本文件任何动作。**
> 工作目录：`temp/P0/`。上游依据：`temp/P0/phase-0.md`（V1–V5 验证项）。

---

## 0. 硬约束与预算

1. 一切新建文件只放 `temp/P0/`；`temp/opencode-dev`、`temp/opencode2dsh-master` **零改动**。
2. 探针 = 纯 Node.js（≥20，本机 v24）ESM 脚本，**零第三方依赖**（只用 node 内置模块 + 全局 fetch）。
3. **不读取、不打印、不复制任何用户凭据值**。例外：`runtime.json` 中的 `password` 是本次探针自造的 serve 本地密码（固定字面量，见 §5），不是用户凭据，允许落盘。
4. serve 只绑 `127.0.0.1`；端口从 4096 起试绑递增，上限 16 个。
5. **对话预算（prompt 调用次数，硬上限，写死在各脚本与任务包中）**：

   | 任务包 | 上限 | 说明 |
   | --- | --- | --- |
   | T0 / T1 / T5 | 0 | 只读与管理操作，不 prompt |
   | T2 | ≤2 | 仅传输层失败可重试 1 次 |
   | T3 | ≤4 | 脚本固定发 2；仅传输层失败允许整脚本重跑 1 次 |
   | T4 | ≤4 | 脚本至多发 2；仅传输层失败允许整脚本重跑 1 次 |
   | **合计** | **≤10** | 各包独立计数，无共享计数器（避免并行竞争） |

   **重试纪律**：`session.execution.failed`、429 限流、鉴权拒绝都是**结果**，记录后不重试；只有 fetch 抛异常（连接拒绝/超时/流中断）才算传输层失败。
6. **脚本逐字节提取**：§4 每个脚本由 `<!-- BEGIN FILE: 路径 -->` / `<!-- END FILE -->` 标记包围，执行者把标记间代码块内容**逐字节**写入对应文件，禁止改写、优化、增删任何字符。
7. 实测撞风控/限流：记录现象，按 §7 故障矩阵处理，不重试轰炸。

## 1. 能力门与编排（多 agent 协作）

### 1.1 能力门（执行者的第一个动作）

执行者检查自身工具集中是否存在"**派发独立子任务并等待其完成**"的工具（Qoder 的 `Agent`、Claude Code 的 `Task`、或任何等效机制）：

- **有** → `mode = "parallel"`。T0 完成后，把 mode 写入 `runtime.json`，然后**同时派发两个子任务**：
  - **子任务 A** = 任务包 T1（只读探针）；
  - **子任务 B** = 对话车道：**依次**执行 T2 → T3 → T4（串行，不可并行；T2 触发停止门则 B 立即终止并标记）。
  - A 与 B **都完成后**，主执行者执行 T5。
- **没有** → `mode = "serial"`。同一执行者按 **T1 → T2 → T3 → T4** 顺序执行同一套任务包文本，再 T5。此情况须在 `protocol-notes.md` 注明"执行环境缺少多 agent 能力，采用串行回退"。

**等价性定义**：两种模式使用逐字相同的任务包、脚本、参数、预算、产出路径；对话车道内部顺序永远 T2→T3→T4（保证服务器负载一致）。"结果相同"指**结论与验收一致**，不是 raw 字节一致。

### 1.2 编排图

```
能力门 → T0（主执行者）
           │  runtime.json
           ├── 子任务A：T1（只读，0 预算）──────────────┐
           └── 子任务B：T2 → T3 → T4（对话车道，串行）──┤
                        │ T2 鉴权类失败 → 停止门，B 终止 │
                        └──────────────────────────────┤
                                          A、B 均完成 → T5（主执行者）
```

### 1.3 停止门

T2 的 `result.stopGate === true`（回合失败且错误疑似凭据/鉴权类）→ 跳过 T3、T4，直接 T5。理由：V2（凭据复用）是命根子，不通则后续对话探针无意义，先报告人工。

## 2. 共享契约

### 2.1 目录布局（全部相对 `temp/P0/`）

```
P0/
├── phase-0.md            # 已有，验证项定义
├── code.md               # 本文件
├── runtime.json          # 仅 T0 写（mode 由主执行者补写）；其余只读
├── probe/
│   ├── lib.mjs           # 共享库
│   ├── t0-setup.mjs
│   ├── t1-readonly.mjs
│   ├── t2-chat.mjs
│   ├── t3-concurrent.mjs
│   ├── t4-permission.mjs
│   └── t5-cleanup.mjs
├── raw/
│   ├── t0/  serve.log, info.json, model-default.json, models.json
│   ├── t1/  *.json, manifest.json
│   ├── t2/  events.jsonl, session.json, result.json, manifest.json
│   ├── t3/  events-a.jsonl, events-b.jsonl, result.json, manifest.json
│   ├── t4/  events.jsonl, result.json, manifest.json
│   └── t5/  cleanup.json
└── protocol-notes.md     # T5 产出：施工图纸
```

### 2.2 runtime.json（T0 产出）

```json
{
  "url": "http://127.0.0.1:<port>",
  "password": "<§5 固定探针密码>",
  "pid": <serve 进程树根 pid>,
  "port": <number>,
  "cliVersion": "<opencode --version 输出>",
  "version": "<GET /api/info 的 version>",
  "modelRef": { "id": "<modelID>", "providerID": "<providerID>" },
  "modelRule": "default" | "lexicographic-first",
  "startedAt": "<ISO>",
  "mode": "parallel" | "serial"
}
```

### 2.3 manifest.json（每个对话/CRUD 任务包产出，T5 清扫依据）

```json
{ "sessions": ["ses_..."], "deleted": [], "prompts": <number> }
```

**会话创建后立即写 manifest（prompts:0），结束时更新 prompts**——脚本中途崩溃也能被 T5 清扫。

### 2.4 记录格式

- 接口快照：`{request:{method,path,body?}, status, json|text}`，2 空格 JSON。
- 事件流：JSONL，每行一个完整 SSE 事件信封 `{id,type,created,data,...}`，不裁剪字段。
- 会话 title 固定前缀 `p0-probe-`（便于用户在 CLI 历史识别）。

## 3. 任务包

### T0 · 环境准备与启动（主执行者，串行前置，预算 0）

1. 能力门判定（§1.1）。
2. 提取 §4 全部脚本到 `probe/`。
3. 运行 `node probe/t0-setup.mjs`：环境检查 → 选端口 → 起 serve（固定探针密码）→ 等 `/api/info` 就绪 → 定模型 → 写 `runtime.json`。
4. 把 `mode` 补写进 `runtime.json`。
- **验收**：`runtime.json` 存在且 `version` 与 CLI 版本一致；`raw/t0/info.json` 落盘。失败 → 按 §7 处理，不进入 T1。

### T1 · 只读接口探针（子任务 A，预算 0）

- 运行 `node probe/t1-readonly.mjs`。
- 覆盖：info / openapi.json / provider / model / model-default / 无鉴权 401 样本 / session 建·查·列·删 / 空会话 permission 列表 / 不存在会话 404 样本。
- **产出**：`raw/t1/*.json` + manifest。**验收**：manifest 步骤全部落盘；五组接口形状 + 两类错误样本齐全。

### T2 · 单回合对话（车道第 1 棒，预算 ≤2）

- 运行 `node probe/t2-chat.mjs`。
- 动作：全 ask 建会话 → **先连 SSE 收到 server.connected** → prompt 固定文本 → 收事件至 `session.execution.succeeded/failed/interrupted` 或 120s 超时。
- **产出**：`raw/t2/events.jsonl`、`result.json`、manifest。
- **验收**：`result.terminal` 有值；`ok===true` 即同时证实 V2（凭据复用可行）。`stopGate===true` → 触发停止门。
- 重试：仅 prompt 传输层失败可重试 1 次（脚本内置）。

### T3 · 双会话并发（车道第 2 棒，预算 ≤4）

- 运行 `node probe/t3-concurrent.mjs`。
- 动作：建 a/b 两会话 → 一条 SSE 就绪 → `Promise.all` 同批发两个 prompt（记双时间戳）→ 按 `data.sessionID` 分流收事件，至双方均终态或 180s。
- **产出**：`raw/t3/events-a.jsonl`、`events-b.jsonl`、`result.json`、manifest。
- **验收**：a/b 各自有终态；分流文件无对方 sessionID；不以时间重叠为判据。
- 重试：仅传输层失败允许整脚本重跑 1 次。

### T4 · 工具拦截与 permission 回路（车道第 3 棒，预算 ≤4）

- 运行 `node probe/t4-permission.mjs`。
- 动作：全 ask 建会话 → SSE 就绪 → 诱导文本 A；出现 `permission.asked` 则对该会话每个 asked 回 `reject`；未出现则文本 B 再试一次；收至终态。
- **产出**：`raw/t4/events.jsonl`、`result.json`、manifest。
- **验收**：`branch` 为 `asked-rejected` 或 `no-tool`（**两种结局都算完成**）；`toolSuccess===0`（>0 是重大发现，如实记录）。
- 工具透传结论（写入 notes，源码证据，不实测）：prompt 无 tools 字段（`packages/protocol/src/groups/session.ts:337-345`）；潜在路径为实验性 client-mcp WebSocket（`packages/protocol/src/groups/mcp.ts:120,139-153`）。
- 重试：仅传输层失败允许整脚本重跑 1 次。

### T5 · 清扫与汇总（主执行者，串行后置，预算 0）

1. 运行 `node probe/t5-cleanup.mjs`：按 manifest **先删会话**（需要活 API）→ **再杀进程树**（Windows `taskkill /PID <pid> /T /F`）→ 验证 `/api/info` 连接拒绝。
2. 通读 `raw/`，按 §6.1 模板写 `protocol-notes.md`。
3. 按 §6.2 总验收逐项核对。
- **验收**：cleanup.json 的 `connectionRefused===true`；notes 覆盖 V1–V5；总验收全过。

## 4. 内嵌脚本（逐字节提取，禁止改写）

<!-- BEGIN FILE: probe/lib.mjs -->
```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const P0 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RAW = path.join(P0, "raw");
export const C = {
  portBase: 4096, portScan: 16,
  password: "p0-probe-local-only",
  readyTimeoutMs: 60000, turnTimeoutMs: 120000, concurrentTimeoutMs: 180000,
  textOk: "Reply with exactly: ok",
  textToolA: "Use the bash tool to run the command: echo p0-probe. Do not answer without using the tool.",
  textToolB: "Run echo p0-probe in bash now.",
  titlePrefix: "p0-probe-",
  askAll: [{ action: "*", resource: "*", effect: "ask" }],
};
export function runtime() { return JSON.parse(fs.readFileSync(path.join(P0, "runtime.json"), "utf8")); }
export function rawDir(task) { const d = path.join(RAW, task); fs.mkdirSync(d, { recursive: true }); return d; }
export function record(task, name, data) { fs.writeFileSync(path.join(rawDir(task), name + ".json"), JSON.stringify(data, null, 2)); }
export function appendEvent(task, name, evt) { fs.appendFileSync(path.join(rawDir(task), name + ".jsonl"), JSON.stringify(evt) + "\n"); }
export function manifest(task, sessions, prompts, deleted = []) { record(task, "manifest", { sessions, prompts, deleted }); }
export function authHeader(rt) { return "Basic " + Buffer.from("opencode:" + rt.password).toString("base64"); }
export async function api(rt, method, p, body, auth = true) {
  const headers = { "content-type": "application/json" };
  if (auth) headers.authorization = authHeader(rt);
  const res = await fetch(rt.url + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, json, text };
}
export function toRef(m) {
  if (typeof m.id === "string" && m.id.includes("/")) { const i = m.id.indexOf("/"); return { providerID: m.id.slice(0, i), id: m.id.slice(i + 1) }; }
  return { id: m.modelID ?? m.id, providerID: m.providerID };
}
export async function createSession(rt, title) {
  const r = await api(rt, "POST", "/api/session", { title, model: rt.modelRef, permissions: C.askAll });
  if (r.status !== 200 || !r.json?.data?.id) throw new Error("createSession failed: " + r.status + " " + r.text.slice(0, 300));
  return r.json.data.id;
}
export async function prompt(rt, sessionID, text) {
  const r = await api(rt, "POST", `/api/session/${sessionID}/prompt`, { text });
  if (r.status !== 200) throw new Error("prompt failed: " + r.status + " " + r.text.slice(0, 300));
  return r.json;
}
export async function openSSE(rt, onEvent, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const res = await fetch(rt.url + "/api/event", { headers: { authorization: authHeader(rt), accept: "text/event-stream" }, signal: ctrl.signal });
  if (res.status !== 200) throw new Error("SSE status " + res.status);
  let connected = false, buf = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SSE connect timeout")), timeoutMs);
    (async () => {
      try {
        for await (const chunk of res.body) {
          buf += Buffer.from(chunk).toString("utf8");
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let evt; try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (evt.type === "server.connected" && !connected) { connected = true; clearTimeout(timer); resolve(); }
            try { onEvent(evt); } catch {}
          }
        }
      } catch (e) { if (!connected) { clearTimeout(timer); reject(e); } }
    })();
  });
  return { close: () => ctrl.abort() };
}
export const TERMINAL = new Set(["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"]);
export function isTerminal(evt, sessionID) { return TERMINAL.has(evt.type) && evt.data?.sessionID === sessionID; }
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
```
<!-- END FILE -->

<!-- BEGIN FILE: probe/t0-setup.mjs -->
```js
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { P0, RAW, C, api, record, toRef, sleep } from "./lib.mjs";

if (fs.existsSync(path.join(P0, "runtime.json"))) throw new Error("runtime.json exists; run t5-cleanup first");
if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("node >= 20 required");
const v = spawnSync("opencode", ["--version"], { encoding: "utf8", shell: true });
if (v.status !== 0) throw new Error("opencode not in PATH");
const cliVersion = v.stdout.trim();

async function freePort(start, scan) {
  for (let p = start; p < start + scan; p++) {
    const ok = await new Promise((res) => { const s = net.createServer(); s.once("error", () => res(false)); s.listen(p, "127.0.0.1", () => s.close(() => res(true))); });
    if (ok) return p;
  }
  throw new Error("no free port in range");
}
const port = await freePort(C.portBase, C.portScan);
fs.mkdirSync(path.join(RAW, "t0"), { recursive: true });
const log = fs.openSync(path.join(RAW, "t0", "serve.log"), "a");
const child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
  shell: true, detached: true, stdio: ["ignore", log, log],
  env: { ...process.env, OPENCODE_PASSWORD: C.password },
});
child.unref();
const rt = { url: `http://127.0.0.1:${port}`, password: C.password, pid: child.pid, port, cliVersion, startedAt: new Date().toISOString() };
const deadline = Date.now() + C.readyTimeoutMs;
let info;
while (Date.now() < deadline) {
  try { const r = await api(rt, "GET", "/api/info"); if (r.status === 200) { info = r.json; break; } } catch {}
  await sleep(500);
}
if (!info) throw new Error("serve not ready in 60s; see raw/t0/serve.log");
rt.version = info.version;
record("t0", "info", info);
let modelRef, modelRule = "default";
const d = await api(rt, "GET", "/api/model/default");
record("t0", "model-default", d);
const cand = d.json?.data;
if (cand && cand.providerID && (cand.id || cand.modelID)) modelRef = toRef(cand);
else {
  modelRule = "lexicographic-first";
  const m = await api(rt, "GET", "/api/model");
  record("t0", "models", m);
  const arr = (m.json?.data ?? []).filter((x) => x.providerID && (x.id || x.modelID) && x.enabled !== false);
  const key = (x) => x.providerID + "/" + (x.modelID ?? x.id);
  arr.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  if (arr[0]) modelRef = toRef(arr[0]);
}
if (!modelRef) throw new Error("no usable model; stop and report");
rt.modelRef = modelRef; rt.modelRule = modelRule;
fs.writeFileSync(path.join(P0, "runtime.json"), JSON.stringify(rt, null, 2));
console.log("T0 OK", JSON.stringify({ url: rt.url, version: rt.version, modelRef, pid: rt.pid }));
```
<!-- END FILE -->

<!-- BEGIN FILE: probe/t1-readonly.mjs -->
```js
import { runtime, api, record } from "./lib.mjs";
const rt = runtime();
const steps = [];
async function step(name, method, p, body, auth = true) {
  const r = await api(rt, method, p, body, auth);
  record("t1", name, { request: { method, path: p, body }, status: r.status, json: r.json ?? r.text });
  steps.push({ name, method, path: p, status: r.status });
  return r;
}
await step("info", "GET", "/api/info");
await step("openapi", "GET", "/openapi.json");
await step("providers", "GET", "/api/provider");
await step("models", "GET", "/api/model");
await step("model-default", "GET", "/api/model/default");
await step("unauthorized", "GET", "/api/info", undefined, false);
const c = await step("session-create", "POST", "/api/session", { title: "p0-probe-t1" });
const id = c.json?.data?.id;
const deleted = [];
if (id) {
  await step("session-get", "GET", `/api/session/${id}`);
  await step("session-list", "GET", "/api/session");
  await step("permission-list-empty", "GET", `/api/session/${id}/permission`);
  const del = await step("session-delete", "DELETE", `/api/session/${id}`);
  if (del.status === 204 || del.status === 200) deleted.push(id);
}
await step("session-get-404", "GET", "/api/session/ses_p0nonexistent");
record("t1", "manifest", { sessions: id ? [id] : [], deleted, prompts: 0, steps });
console.log("T1 OK", steps.length, "steps");
```
<!-- END FILE -->

<!-- BEGIN FILE: probe/t2-chat.mjs -->
```js
import { runtime, record, manifest, createSession, prompt, openSSE, isTerminal, appendEvent, C, sleep } from "./lib.mjs";
const rt = runtime();
const sid = await createSession(rt, C.titlePrefix + "t2");
record("t2", "session", { id: sid });
manifest("t2", [sid], 0);
const events = [];
const sse = await openSSE(rt, (e) => { events.push(e); appendEvent("t2", "events", e); });
const result = { sessionID: sid, prompts: 0, ok: false, terminal: null, stopGate: false };
for (let attempt = 0; attempt < 2; attempt++) {
  try { await prompt(rt, sid, C.textOk); result.prompts++; break; }
  catch (e) { result.transportError = String(e); if (attempt === 0) await sleep(1000); }
}
if (result.prompts > 0) {
  const deadline = Date.now() + C.turnTimeoutMs;
  while (Date.now() < deadline && !result.terminal) {
    const t = events.find((e) => isTerminal(e, sid));
    if (t) result.terminal = t.type;
    await sleep(200);
  }
  if (!result.terminal) result.timeout = true;
}
sse.close();
result.ok = result.terminal === "session.execution.succeeded";
const errEvt = events.find((e) => e.type === "session.execution.failed" && e.data?.sessionID === sid);
result.error = errEvt?.data ?? null;
result.stopGate = !result.ok && /auth|credential|freetier|401|403|api.?key/i.test(JSON.stringify(result.error ?? ""));
result.textDeltas = events.filter((e) => e.type === "session.text.delta" && e.data?.sessionID === sid).length;
record("t2", "result", result);
manifest("t2", [sid], result.prompts);
console.log("T2", JSON.stringify(result));
```
<!-- END FILE -->

<!-- BEGIN FILE: probe/t3-concurrent.mjs -->
```js
import { runtime, record, manifest, createSession, prompt, openSSE, isTerminal, appendEvent, C, sleep } from "./lib.mjs";
const rt = runtime();
const a = await createSession(rt, C.titlePrefix + "t3-a");
const b = await createSession(rt, C.titlePrefix + "t3-b");
manifest("t3", [a, b], 0);
const ea = [], eb = [];
const sse = await openSSE(rt, (e) => {
  const s = e.data?.sessionID;
  if (s === a) { ea.push(e); appendEvent("t3", "events-a", e); }
  else if (s === b) { eb.push(e); appendEvent("t3", "events-b", e); }
});
const sentAt = [new Date().toISOString(), new Date().toISOString()];
await Promise.all([prompt(rt, a, C.textOk), prompt(rt, b, C.textOk)]);
const deadline = Date.now() + C.concurrentTimeoutMs;
let ta = null, tb = null;
while (Date.now() < deadline && (!ta || !tb)) {
  ta ??= ea.find((e) => isTerminal(e, a))?.type ?? null;
  tb ??= eb.find((e) => isTerminal(e, b))?.type ?? null;
  await sleep(200);
}
sse.close();
const result = {
  a: { sessionID: a, terminal: ta, textDeltas: ea.filter((e) => e.type === "session.text.delta").length },
  b: { sessionID: b, terminal: tb, textDeltas: eb.filter((e) => e.type === "session.text.delta").length },
  sentAt, prompts: 2,
  crossTalk: ea.some((e) => e.data?.sessionID !== a) || eb.some((e) => e.data?.sessionID !== b),
};
record("t3", "result", result);
manifest("t3", [a, b], 2);
console.log("T3", JSON.stringify(result));
```
<!-- END FILE -->

<!-- BEGIN FILE: probe/t4-permission.mjs -->
```js
import { runtime, record, manifest, api, createSession, prompt, openSSE, isTerminal, appendEvent, C, sleep } from "./lib.mjs";
const rt = runtime();
const sid = await createSession(rt, C.titlePrefix + "t4");
manifest("t4", [sid], 0);
const events = [];
const sse = await openSSE(rt, (e) => { events.push(e); appendEvent("t4", "events", e); });
const result = { sessionID: sid, prompts: 0, branch: null, asked: [], rejected: 0, toolSuccess: 0, terminal: null };
async function runTurn(text) {
  await prompt(rt, sid, text); result.prompts++;
  const startIdx = events.length;
  const deadline = Date.now() + C.turnTimeoutMs;
  while (Date.now() < deadline) {
    for (let i = startIdx; i < events.length; i++) {
      const e = events[i];
      if (e.type === "permission.asked" && e.data?.sessionID === sid && !result.asked.includes(e.data.id)) {
        result.asked.push(e.data.id);
        const r = await api(rt, "POST", `/api/session/${sid}/permission/${e.data.id}/reply`, { decision: "reject", message: "p0 probe: tools are disabled" });
        if (r.status === 204 || r.status === 200) result.rejected++;
      }
    }
    const t = events.slice(startIdx).find((e) => isTerminal(e, sid));
    if (t) { result.terminal = t.type; return; }
    await sleep(200);
  }
  result.timeout = true;
}
await runTurn(C.textToolA);
if (!result.asked.length && !result.timeout && result.prompts < 2) { result.terminal = null; await runTurn(C.textToolB); }
result.branch = result.asked.length ? "asked-rejected" : "no-tool";
result.toolSuccess = events.filter((e) => e.type === "session.tool.success" && e.data?.sessionID === sid).length;
sse.close();
record("t4", "result", result);
manifest("t4", [sid], result.prompts);
console.log("T4", JSON.stringify(result));
```
<!-- END FILE -->

<!-- BEGIN FILE: probe/t5-cleanup.mjs -->
```js
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { P0, RAW, runtime, api, record, sleep } from "./lib.mjs";
const rt = runtime();
const deleted = [], failed = [];
for (const t of ["t1", "t2", "t3", "t4"]) {
  const mf = path.join(RAW, t, "manifest.json");
  if (!fs.existsSync(mf)) continue;
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  for (const sid of m.sessions ?? []) {
    if ((m.deleted ?? []).includes(sid)) continue;
    try {
      const r = await api(rt, "DELETE", `/api/session/${sid}`);
      (r.status === 204 || r.status === 200 ? deleted : failed).push({ sid, status: r.status });
    } catch (e) { failed.push({ sid, error: String(e) }); }
  }
}
if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(rt.pid), "/T", "/F"], { encoding: "utf8" });
else { try { process.kill(-rt.pid, "SIGTERM"); } catch { try { process.kill(rt.pid, "SIGTERM"); } catch {} } }
await sleep(1500);
let connectionRefused = false;
try { await api(rt, "GET", "/api/info"); } catch { connectionRefused = true; }
record("t5", "cleanup", { deleted, failed, pid: rt.pid, connectionRefused });
console.log("T5 cleanup", JSON.stringify({ deleted: deleted.length, failed: failed.length, connectionRefused }));
```
<!-- END FILE -->

## 5. 固定常量表

| 常量 | 值 | 说明 |
| --- | --- | --- |
| 端口基址 / 扫描数 | 4096 / 16 | 试绑递增，全选不上即失败报告 |
| 探针密码 | `p0-probe-local-only` | 自造 serve 本地密码，经 `OPENCODE_PASSWORD` 注入；非用户凭据 |
| 就绪等待 | 60s | `/api/info` 200 且 version 一致 |
| 单回合超时 | 120s | T2/T4 |
| 并发回合超时 | 180s | T3 |
| SSE 连接超时 | 15s | 收到 `server.connected` 为准 |
| 对话文本 | `Reply with exactly: ok` | T2/T3 固定 |
| 诱导文本 A / B | 见 lib.mjs `C.textToolA/B` | T4 固定，顺序 A→B |
| 会话 title | `p0-probe-<任务包>` | 固定前缀 |
| permissions 载荷 | `[{action:"*",resource:"*",effect:"ask"}]` | 逐字固定；通配是否生效本身是核实项 |
| 模型选择 | default 端点 → 失败则 (providerID/modelID) ASCII 字典序首个 enabled 模型 | 规则与结果写 runtime.json；选定后不换 |
| 终态事件 | `session.execution.succeeded/failed/interrupted` | 按 `data.sessionID` 匹配 |

## 6. 汇总与总验收

### 6.1 protocol-notes.md 固定模板

```markdown
# 阶段 0 协议核实结论（opencode v2.2.5）
执行模式：parallel / serial；执行日期：____；对话请求总数：__/10
## V1 接口形状（五组 + 错误样本）
结论 / 源码出处(文件:行号) / 实测样本(raw/t1/...) / 置信度(双证|仅源码|存疑)
## V2 凭据直接复用
## V3 并发模型
## V4 工具透传（含 client-mcp 潜在路径）
## V5 健康与生命周期
## 与 v1 参考实现的差异清单
## 对阶段 1 的设计输入
```

### 6.2 总验收清单（T5 逐项核对）

- [ ] `runtime.json` 存在，`version` 与 CLI 一致（预期 2.2.5）
- [ ] `raw/t1/` 步骤齐全（含 401、404 错误样本）
- [ ] T2 `result.terminal` 有值；`ok===true`（或停止门已记录并报告）
- [ ] T3 a/b 各有终态，`crossTalk===false`
- [ ] T4 `branch` 有值，`toolSuccess===0`
- [ ] `protocol-notes.md` 覆盖 V1–V5，每项有源码出处 + 实测样本 + 置信度
- [ ] `cleanup.json` 的 `connectionRefused===true`；manifest 会话全部清扫（failed 为空或有解释）
- [ ] 各 manifest prompts 合计 ≤10
- [ ] 两份参考源码零改动；`temp/P0/` 外无新建文件
- [ ] `temp/P0/` 全部文件中无用户凭据值（探针密码除外）

## 7. 故障矩阵

| 现象 | 处置 |
| --- | --- |
| 端口 4096–4111 全占 | T0 失败，报告人工，不抢端口 |
| serve 60s 未就绪 | 读 `raw/t0/serve.log` 报告；不自动重起 |
| 无可用模型 | T0 失败，停止并报告（V2 存疑） |
| serve 返回 401 | 探针密码未生效，查 serve.log，停止报告 |
| T2 鉴权类失败 | **停止门**：跳过 T3/T4，直接 T5 报告 |
| 429 / execution.failed | 是结果不是故障：记录，不重试，车道继续 |
| SSE  mid-turn 中断 | 传输层失败：事件可能丢失，按预算重跑一次；notes 标注置信度 |
| prompt fetch 抛异常 | 传输层失败：按各包预算重试 |
| taskkill 后仍连接 | cleanup 记 `connectionRefused:false`，人工杀进程后重跑 t5-cleanup |
| 子 agent 能力缺失 | 能力门走 serial 回退，notes 注明环境事实 |