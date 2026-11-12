export interface ServeEndpoint {
  url: string
  password: string
  pid: number
  port: number
  version: string
}

export interface ModelRef {
  id: string
  providerID: string
  variant?: string
}

export interface ServeModelInfo {
  id: string
  modelID?: string
  providerID: string
  name?: string
  enabled?: boolean
  capabilities?: { tools?: boolean; input?: string[]; output?: string[] }
  limit?: { context?: number; input?: number; output?: number }
  cost?: Array<{ tier?: { type?: string; size?: number }; input?: number; output?: number; cache?: { read?: number; write?: number } }>
  variants?: Array<{ id?: string }>
}

export interface ServeEventData {
  sessionID?: string
  id?: unknown
  ordinal?: number
  delta?: string
  text?: string
  name?: string
  reason?: string
  error?: { type?: string; message?: string; status?: number }
  input?: Record<string, unknown>
  content?: Array<{ type?: string; text?: string }>
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  [key: string]: unknown
}

export interface ServeEvent {
  id?: string
  type: string
  created?: number
  data?: ServeEventData
}

export interface ServeResponse {
  status: number
  json: unknown
  text: string
}

export interface HarnessTool {
  name: string
  description: string
  parameters: unknown
}

export type HarnessBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; signature?: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'image'; [key: string]: unknown }
  | { type: 'tool-result'; toolCallId: string; content: HarnessBlock[]; isError?: boolean; [key: string]: unknown }

export interface HarnessMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: HarnessBlock[]
  toolCallId?: string
  isError?: boolean
}

export interface HarnessGenerateOptions {
  provider: string
  model: string
  messages: HarnessMessage[]
  system?: string
  tools?: HarnessTool[]
  maxTokens?: number
  temperature?: number
  reasoning?: string
  reasoningEffort?: string
  signal?: AbortSignal
}

export type HarnessChunk =
  | { type: 'block-start'; index: number; blockType: 'text' | 'reasoning' | 'tool-call' }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: { type: 'text'; text: string } | { type: 'reasoning'; text: string; signature?: string } | { type: 'tool-call'; id: string; name: string; arguments: string } }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } }
  | { type: 'finish'; reason: FinishReason }

export type FinishReason =
  | { kind: 'stop' }
  | { kind: 'max-tokens' }
  | { kind: 'tool-calls' }
  | { kind: 'aborted'; failure: { message: string; code: string } }
  | { kind: 'error'; failure: { message: string; code: string } }

export interface ResolvedModelInfo {
  provider: string
  id: string
  name: string
  inputModalities: string[]
  context: { contextWindow: number }
  defaultMaxTokens: number
}

export interface AdapterDiagnostics {
  permissionAsked: number
  permissionRejected: number
  toolEvents: number
  toolApproved: number
  sessions: string[]
}

export interface CatalogEntry {
  id: string
  name: string
  providerID: string
  modelRef: ModelRef
  contextWindow: number
  maxOutput: number
  inputModalities: string[]
  variants: string[]
  free: boolean
}

export interface CatalogSnapshot {
  updatedAt: number
  entries: CatalogEntry[]
}

export interface ToolPolicy {
  mode: 'off' | 'allowlist'
  allow: string[]
  maxPerTurn: number
}
