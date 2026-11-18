export const MODELS_PATH = '/plugins/opencode-local/models'
export const MODELS_REFRESH_PATH = '/plugins/opencode-local/models/refresh'
export const CATALOG_PATH = '/plugins/opencode-local/catalog'
export const CATALOG_REFRESH_PATH = '/plugins/opencode-local/catalog/refresh'
export const CONTEXT_PATH = '/plugins/opencode-local/context'
export const COMPACT_PATH = '/plugins/opencode-local/compact'
export const COMPACTION_PATH = '/plugins/opencode-local/compaction'

export interface WebModelRow {
  id: string
  name: string
  contextWindow: number
  maxOutput: number
  inputModalities: string[]
  variants: string[]
  free: boolean
  hidden: boolean
}

export interface WebModelsPayload {
  updatedAt: number
  models: WebModelRow[]
}

export interface WebCatalogModel {
  id: string
  name: string
  contextWindow?: number
}

export interface WebCatalogGroup {
  id: string
  name: string
  models: WebCatalogModel[]
}

export interface WebCatalogPayload {
  default?: { provider?: string; model?: string }
  groups?: WebCatalogGroup[]
  failures?: Array<{ id: string; name?: string; message: string }>
}

export interface WebCompactionPayload {
  version?: number
  provider?: string
  model?: string
  error?: string
}

export const TOOL_ACTIONS = ['shell', 'edit', 'read', 'webfetch', 'websearch', 'grep', 'glob', 'external_directory'] as const
