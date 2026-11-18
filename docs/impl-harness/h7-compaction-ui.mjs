import fs from 'node:fs'
import path from 'node:path'
import { check, record, RAW } from './lib.mjs'
import { applyCompactionRoute } from '../../plugin/src/config.ts'
import {
  COMPACTION_FILE_VERSION, DEFAULT_COMPACTION, migrateCompactionFile,
  parseCompactionDocument, readCompactionFile, writeCompactionFile,
} from '../../plugin/src/compaction-store.ts'
import {
  CATALOG_PATH, CATALOG_REFRESH_PATH, COMPACT_PATH, COMPACTION_PATH, CONTEXT_PATH, MODELS_PATH, MODELS_REFRESH_PATH,
} from '../../plugin/src/client/status-paths.ts'

const STORE = path.join(RAW, '..', 'impl-harness-data', 'h7-compaction-store.json')

function cleanup() {
  for (const target of [STORE, STORE + '.tmp']) {
    try { fs.rmSync(target, { force: true }) } catch { /* ignore */ }
  }
}

export async function run(_runtime) {
  cleanup()
  try {
    // 1. Pure parser: document-level and field-level fallback.
    const good = JSON.stringify({ version: 1, provider: 'p', model: 'm' })
    const parsed = parseCompactionDocument(good)
    check('h7 parse valid', parsed?.provider === 'p' && parsed?.model === 'm', JSON.stringify(parsed))
    check('h7 parse bad json', parseCompactionDocument('{oops') === undefined, 'accepted bad json')
    check('h7 parse wrong version', parseCompactionDocument(JSON.stringify({ version: 2, provider: 'p', model: 'm' })) === undefined, 'accepted wrong version')
    check('h7 parse array', parseCompactionDocument('[]') === undefined, 'accepted array')
    const halfProvider = parseCompactionDocument(JSON.stringify({ version: 1, provider: 'only-provider' }))
    check('h7 parse field fallback',
      halfProvider?.provider === 'only-provider' && halfProvider?.model === DEFAULT_COMPACTION.model,
      JSON.stringify(halfProvider))
    const badType = parseCompactionDocument(JSON.stringify({ version: 1, provider: 5, model: 'm2' }))
    check('h7 parse bad field type',
      badType?.provider === DEFAULT_COMPACTION.provider && badType?.model === 'm2', JSON.stringify(badType))
    check('h7 parse empty doc', parseCompactionDocument(JSON.stringify({ version: 1 })) === undefined, 'accepted empty doc')

    // 2. Missing file -> defaults, and reading must not create it.
    check('h7 missing -> default',
      readCompactionFile(STORE).provider === DEFAULT_COMPACTION.provider
        && readCompactionFile(STORE).model === DEFAULT_COMPACTION.model, 'not defaulted')
    check('h7 read does not create', fs.existsSync(STORE) === false, 'reader created the file')

    // 3. Write -> read roundtrip, then write-then-read proves cache invalidation.
    await writeCompactionFile(STORE, { provider: 'deepseek-official', model: 'deepseek-flash' })
    check('h7 write creates file', fs.existsSync(STORE) === true, 'file missing after write')
    const mtimeAfterFirst = fs.statSync(STORE).mtimeMs
    await writeCompactionFile(STORE, { provider: 'deepseek-official', model: 'deepseek-flash' })
    check('h7 idempotent write skips disk', fs.statSync(STORE).mtimeMs === mtimeAfterFirst, 'rewrote identical value')
    await writeCompactionFile(STORE, { provider: 'third-party', model: 'm3' })
    const afterWrite = readCompactionFile(STORE)
    check('h7 write then read fresh', afterWrite.provider === 'third-party' && afterWrite.model === 'm3', JSON.stringify(afterWrite))
    const doc = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    check('h7 stored shape', doc.version === COMPACTION_FILE_VERSION && doc.provider === 'third-party' && doc.model === 'm3', JSON.stringify(doc))

    // 4. Corrupt file -> default, and a later write heals it.
    fs.writeFileSync(STORE, '{corrupt', 'utf8')
    const corrupt = readCompactionFile(STORE)
    check('h7 corrupt -> default',
      corrupt.provider === DEFAULT_COMPACTION.provider && corrupt.model === DEFAULT_COMPACTION.model, JSON.stringify(corrupt))
    await writeCompactionFile(STORE, { provider: 'deepseek-official', model: 'deepseek-flash' })
    const healed = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    check('h7 write heals corrupt', healed.version === 1 && healed.model === 'deepseek-flash', JSON.stringify(healed))

    // 5. Migration: only when absent; per-field fallback.
    cleanup()
    check('h7 migrate absent flag', migrateCompactionFile(STORE, { provider: 'legacy-p' }) === true, 'migration did not run')
    const migrated = readCompactionFile(STORE)
    check('h7 migrate per-field',
      migrated.provider === 'legacy-p' && migrated.model === DEFAULT_COMPACTION.model, JSON.stringify(migrated))
    check('h7 migrate never overwrites', migrateCompactionFile(STORE, { provider: 'other', model: 'other' }) === false, 'overwrote existing')
    check('h7 migrate keeps existing', readCompactionFile(STORE).provider === 'legacy-p', 'existing value lost')

    // 6. Routing semantics stay unchanged.
    const cases = [
      ['compaction from opencode-local', { purpose: 'compaction', provider: 'opencode-local', model: 'free' }, 'deepseek-official', 'deepseek-flash', true],
      ['compaction from third-party', { purpose: 'compaction', provider: 'third-party', model: 'm' }, 'deepseek-official', 'deepseek-flash', true],
      ['plain chat untouched', { provider: 'opencode-local', model: 'free' }, 'deepseek-official', 'deepseek-flash', false],
      ['already routed', { purpose: 'compaction', provider: 'deepseek-official', model: 'deepseek-flash' }, 'deepseek-official', 'deepseek-flash', false],
      ['empty target ignored', { purpose: 'compaction', provider: 'opencode-local', model: 'free' }, '', '', false],
    ]
    for (const [name, options, provider, model, expected] of cases) {
      const changed = applyCompactionRoute(options, provider, model)
      check('h7 route: ' + name, changed === expected, JSON.stringify({ changed, expected, options }))
    }

    // 7. Path constants agree with the contract.
    const paths = { CATALOG_PATH, CATALOG_REFRESH_PATH, COMPACTION_PATH, CONTEXT_PATH, COMPACT_PATH, MODELS_PATH, MODELS_REFRESH_PATH }
    const expectedPaths = {
      CATALOG_PATH: '/plugins/opencode-local/catalog',
      CATALOG_REFRESH_PATH: '/plugins/opencode-local/catalog/refresh',
      COMPACTION_PATH: '/plugins/opencode-local/compaction',
      CONTEXT_PATH: '/plugins/opencode-local/context',
      COMPACT_PATH: '/plugins/opencode-local/compact',
      MODELS_PATH: '/plugins/opencode-local/models',
      MODELS_REFRESH_PATH: '/plugins/opencode-local/models/refresh',
    }
    for (const [key, value] of Object.entries(expectedPaths)) {
      check('h7 path ' + key, paths[key] === value, String(paths[key]))
    }

    record('h7-compaction-ui', { defaults: { ...DEFAULT_COMPACTION }, paths })
    return 'ok'
  } finally {
    cleanup()
  }
}
