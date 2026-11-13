export const MODELS_PATH = '/plugins/opencode-local/models'
export const MODELS_REFRESH_PATH = '/plugins/opencode-local/models/refresh'

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

export const TOOL_ACTIONS = ['shell', 'edit', 'read', 'webfetch', 'websearch', 'grep', 'glob', 'external_directory'] as const
