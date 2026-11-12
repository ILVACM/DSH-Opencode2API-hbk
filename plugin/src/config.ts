import Schema from '@deepseek-ai/schemastery'
import type { ToolPolicy } from './types.ts'

export interface ResolvedPluginConfig {
  providerId: string
  opencodePath: string
  portBase: number
  modelWhitelist: string[]
  firstEventMs?: number
  idleMs?: number
  titlePrefix: string
  toolMode: boolean
  toolAllowlist: string[]
  toolMaxPerTurn: number
  thinkingVariant: string
  hiddenModels: string[]
  apiEnabled: boolean
  apiHost: string
  apiPort: number
  apiToken: string
}

export const Config = Schema.object({
  providerId: Schema.string().default('opencode-local'),
  opencodePath: Schema.string().default(''),
  portBase: Schema.number().step(1).min(1024).max(65000).default(4096),
  modelWhitelist: Schema.array(Schema.string()).default([]),
  firstEventMs: Schema.number().step(1).min(1000).max(600000),
  idleMs: Schema.number().step(1).min(1000).max(600000),
  titlePrefix: Schema.string().default('dsh-'),
  toolMode: Schema.boolean().default(false).volatile(),
  toolAllowlist: Schema.array(Schema.string()).default([]).volatile(),
  toolMaxPerTurn: Schema.number().step(1).min(1).max(1000).default(20).volatile(),
  thinkingVariant: Schema.string().default('').volatile(),
  hiddenModels: Schema.array(Schema.string()).default([]).volatile(),
  apiEnabled: Schema.boolean().default(false),
  apiHost: Schema.string().default('127.0.0.1'),
  apiPort: Schema.number().step(1).min(1).max(65535).default(8787),
  apiToken: Schema.string().default(''),
})

export function unwrap<T>(v: T | undefined): T | undefined {
  if (v !== null && typeof v === 'object' && 'get' in (v as object) && typeof (v as { get?: unknown }).get === 'function') {
    return (v as unknown as { get: () => T }).get()
  }
  return v
}

function clampInt(v: number, min: number, max: number, d: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d
  const n = Math.trunc(v)
  return n < min ? min : n > max ? max : n
}

export function resolveConfig(input: Partial<ResolvedPluginConfig> | undefined | null): ResolvedPluginConfig {
  const c = input ?? {}
  const num = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const host = unwrap(c.apiHost)
  const port = unwrap(c.apiPort)
  const token = unwrap(c.apiToken)
  const allow = unwrap(c.toolAllowlist)
  const hidden = unwrap(c.hiddenModels)
  return {
    providerId: typeof c.providerId === 'string' && c.providerId.trim().length > 0 ? c.providerId.trim() : 'opencode-local',
    opencodePath: typeof c.opencodePath === 'string' ? c.opencodePath : '',
    portBase: Number.isInteger(c.portBase) ? (c.portBase as number) : 4096,
    modelWhitelist: Array.isArray(c.modelWhitelist) ? c.modelWhitelist.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    firstEventMs: typeof c.firstEventMs === 'number' ? c.firstEventMs : undefined,
    idleMs: typeof c.idleMs === 'number' ? c.idleMs : undefined,
    titlePrefix: typeof c.titlePrefix === 'string' && c.titlePrefix.length > 0 ? c.titlePrefix : 'dsh-',
    toolMode: unwrap(c.toolMode) === true,
    toolAllowlist: Array.isArray(allow) ? allow.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    toolMaxPerTurn: clampInt(num(unwrap(c.toolMaxPerTurn), 20), 1, 1000, 20),
    thinkingVariant: (() => { const v = unwrap(c.thinkingVariant); return typeof v === 'string' ? v : '' })(),
    hiddenModels: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    apiEnabled: unwrap(c.apiEnabled) === true,
    apiHost: typeof host === 'string' && host.length > 0 ? host : '127.0.0.1',
    apiPort: num(port, 8787),
    apiToken: typeof token === 'string' ? token : '',
  }
}

export function liveToolPolicy(config: Partial<ResolvedPluginConfig> | undefined | null): ToolPolicy {
  const c = config ?? {}
  const mode = unwrap(c.toolMode) === true
  const allow = unwrap(c.toolAllowlist)
  const max = unwrap(c.toolMaxPerTurn)
  return {
    mode: mode ? 'allowlist' : 'off',
    allow: Array.isArray(allow) ? allow.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    maxPerTurn: clampInt(typeof max === 'number' ? max : 20, 1, 1000, 20),
  }
}

export function liveThinkingVariant(config: Partial<ResolvedPluginConfig> | undefined | null): string {
  const c = config ?? {}
  const v = unwrap(c.thinkingVariant)
  return typeof v === 'string' ? v : ''
}

export function liveHiddenModels(config: Partial<ResolvedPluginConfig> | undefined | null): string[] {
  const c = config ?? {}
  const v = unwrap(c.hiddenModels)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

export function liveApiConfig(config: Partial<ResolvedPluginConfig> | undefined | null): { enabled: boolean; host: string; port: number; token: string } {
  const c = config ?? {}
  const host = unwrap(c.apiHost)
  const port = unwrap(c.apiPort)
  const token = unwrap(c.apiToken)
  return {
    enabled: unwrap(c.apiEnabled) === true,
    host: typeof host === 'string' && host.length > 0 ? host : '127.0.0.1',
    port: typeof port === 'number' && Number.isFinite(port) ? port : 8787,
    token: typeof token === 'string' ? token : '',
  }
}
