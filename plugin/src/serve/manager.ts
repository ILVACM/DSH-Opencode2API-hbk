import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findFreePort, serveRequest, waitReady } from './client.ts'
import type { ServeEndpoint } from '../types.ts'

export interface ManagerConfig {
  opencodePath: string
  portBase: number
  dataDir: string
  readyTimeoutMs: number
  heartbeatMs: number
  restartDelayMs: number
  maxRestarts: number
}

export function defaultManagerConfig(overrides?: Partial<ManagerConfig>): ManagerConfig {
  return {
    opencodePath: overrides?.opencodePath ?? '',
    portBase: overrides?.portBase ?? 4096,
    dataDir: overrides?.dataDir ?? join(homedir(), '.dsh-opencode-local'),
    readyTimeoutMs: overrides?.readyTimeoutMs ?? 60000,
    heartbeatMs: overrides?.heartbeatMs ?? 10000,
    restartDelayMs: overrides?.restartDelayMs ?? 1000,
    maxRestarts: overrides?.maxRestarts ?? 3,
  }
}

const PORT_SCAN = 16

function resolveServeCommand(bin: string): { command: string; shell: boolean } {
  if (process.platform !== 'win32') return { command: bin, shell: false }
  if (bin.includes('\\') || bin.includes('/') || /\.exe$/i.test(bin)) return { command: bin, shell: false }
  try {
    const r = spawnSync('where.exe', ['opencode'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0 && typeof r.stdout === 'string') {
      const line = r.stdout.split(/\r?\n/).map((s) => s.trim()).find((s) => /\.exe$/i.test(s))
      if (line) return { command: line, shell: false }
    }
  } catch { /* fall through to shell */ }
  return { command: bin, shell: true }
}

export class ServeManager {
  private cfg: ManagerConfig
  private ep: ServeEndpoint | null = null
  private childPid: number | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private disposed = false
  private restartCount = 0
  private inflight: Promise<ServeEndpoint> | null = null
  readonly diagnostics = { restarts: 0 }

  constructor(cfg: ManagerConfig) {
    this.cfg = cfg
  }

  get endpoint(): ServeEndpoint | null {
    return this.ep
  }

  get healthy(): boolean {
    return this.ep !== null
  }

  async start(): Promise<ServeEndpoint> {
    if (this.ep) return this.ep
    return this.coordinate(() => this.launch())
  }

  async ensureReady(): Promise<ServeEndpoint> {
    return this.start()
  }

  async restart(): Promise<ServeEndpoint> {
    if (this.disposed) throw new Error('manager disposed')
    if (this.restartCount >= this.cfg.maxRestarts) {
      throw new Error(`opencode serve restart budget exhausted (${this.cfg.maxRestarts})`)
    }
    this.killTree()
    this.ep = null
    await new Promise((r) => setTimeout(r, this.cfg.restartDelayMs))
    this.restartCount += 1
    this.diagnostics.restarts += 1
    return this.coordinate(() => this.launch())
  }

  private coordinate(fn: () => Promise<ServeEndpoint>): Promise<ServeEndpoint> {
    if (this.inflight) return this.inflight
    this.inflight = fn().finally(() => { this.inflight = null })
    return this.inflight
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.killTree()
    this.ep = null
  }

  private async launch(): Promise<ServeEndpoint> {
    const bin = this.cfg.opencodePath.trim().length > 0 ? this.cfg.opencodePath.trim() : 'opencode'
    const resolved = resolveServeCommand(bin)
    const port = await findFreePort(this.cfg.portBase, PORT_SCAN)
    fs.mkdirSync(this.cfg.dataDir, { recursive: true })
    const logPath = join(this.cfg.dataDir, 'serve.log')
    const log = fs.openSync(logPath, 'a')
    const password = randomBytes(32).toString('base64url')
    const child = spawn(resolved.command, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
      shell: resolved.shell,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, OPENCODE_PASSWORD: password },
    })
    child.unref()
    this.childPid = typeof child.pid === 'number' ? child.pid : null
    const ep: ServeEndpoint = {
      url: `http://127.0.0.1:${port}`,
      password,
      pid: this.childPid ?? 0,
      port,
      version: '',
    }
    const ready = await waitReady(ep, this.cfg.readyTimeoutMs, 500)
    if (!ready) {
      this.killTree()
      throw new Error(`opencode serve not ready in ${this.cfg.readyTimeoutMs}ms; see ${logPath}`)
    }
    ep.version = ready.version
    this.ep = ep
    this.startHeartbeat()
    return ep
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => { void this.check() }, this.cfg.heartbeatMs)
    this.heartbeatTimer.unref?.()
  }

  private async check(): Promise<void> {
    if (this.disposed || this.inflight || !this.ep) return
    try {
      const r = await serveRequest(this.ep, 'GET', '/api/info')
      if (r.status === 200) {
        this.restartCount = 0
        return
      }
    } catch { /* dead or starting */ }
    try { await this.restart() } catch { /* budget exhausted; adapter calls will surface honest errors */ }
  }

  private killTree(): void {
    if (this.childPid === null) return
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(this.childPid), '/T', '/F'], { encoding: 'utf8', windowsHide: true })
    } else {
      try { process.kill(-this.childPid, 'SIGTERM') } catch { try { process.kill(this.childPid, 'SIGTERM') } catch { /* already gone */ } }
    }
    this.childPid = null
  }
}