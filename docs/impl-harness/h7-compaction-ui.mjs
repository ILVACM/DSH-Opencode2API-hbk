import { check, record } from './lib.mjs'
import {
  CATALOG_PATH, CATALOG_REFRESH_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH,
} from '../../plugin/src/client/status-paths.ts'
import { en, zh } from '../../plugin/src/client/locales.ts'

export async function run(_runtime) {
  // 1. Tab rename guard: the former compaction tab is now a pure context-status display.
  check('h7 zh tab.compaction', zh['tab.compaction'] === '上下文状态', String(zh['tab.compaction']))
  check('h7 en tab.compaction', en['tab.compaction'] === 'Context status', String(en['tab.compaction']))

  // 2. Path constants agree with the contract.
  const paths = { CATALOG_PATH, CATALOG_REFRESH_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH }
  const expectedPaths = {
    CATALOG_PATH: '/plugins/opencode-local/catalog',
    CATALOG_REFRESH_PATH: '/plugins/opencode-local/catalog/refresh',
    CONTEXT_PATH: '/plugins/opencode-local/context',
    MODELS_PATH: '/plugins/opencode-local/models',
    MODELS_REFRESH_PATH: '/plugins/opencode-local/models/refresh',
  }
  for (const [key, value] of Object.entries(expectedPaths)) {
    check('h7 path ' + key, paths[key] === value, String(paths[key]))
  }

  record('h7-compaction-ui', { paths })
  return 'ok'
}
