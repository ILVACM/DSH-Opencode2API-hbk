import fs from 'node:fs'
import path from 'node:path'

export interface CompactionChoice {
  provider: string
  model: string
}

export const COMPACTION_FILE_VERSION = 1

export const DEFAULT_COMPACTION: Readonly<CompactionChoice> = Object.freeze({
  provider: 'deepseek-official',
  model: 'deepseek-flash',
})

interface CacheEntry {
  mtimeMs: number
  size: number
  value: CompactionChoice
}

const cache = new Map<string, CacheEntry>()

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Parse the stored document. A bad document yields undefined so callers fall
 * back to defaults; individual invalid fields fall back field by field.
 * @param text - raw file content.
 * @returns the parsed choice, or undefined when the document is unusable.
 */
export function parseCompactionDocument(text: string): CompactionChoice | undefined {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return undefined }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const doc = raw as Record<string, unknown>
  if (doc.version !== COMPACTION_FILE_VERSION) return undefined
  const provider = nonEmpty(doc.provider)
  const model = nonEmpty(doc.model)
  if (provider === undefined && model === undefined) return undefined
  return {
    provider: provider ?? DEFAULT_COMPACTION.provider,
    model: model ?? DEFAULT_COMPACTION.model,
  }
}

function serialize(value: CompactionChoice): string {
  return JSON.stringify({
    version: COMPACTION_FILE_VERSION,
    provider: value.provider,
    model: value.model,
  }, null, 2) + '\n'
}

function readDocument(filePath: string): CompactionChoice | undefined {
  try {
    return parseCompactionDocument(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Read the stored choice. Never throws and never creates the file.
 * @param filePath - absolute path of the document.
 * @returns the stored choice, or the default when absent or unusable.
 */
export function readCompactionFile(filePath: string): CompactionChoice {
  try {
    const stat = fs.statSync(filePath)
    const hit = cache.get(filePath)
    if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return { ...hit.value }
    }
    const value = readDocument(filePath) ?? { ...DEFAULT_COMPACTION }
    cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value })
    return { ...value }
  } catch {
    return { ...DEFAULT_COMPACTION }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function replaceAsync(tmp: string, target: string): Promise<void> {
  const waits = [30, 60, 120]
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.promises.rename(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!retryable || attempt >= waits.length) throw err
      await sleep(waits[attempt])
    }
  }
}

function replaceSync(tmp: string, target: string): void {
  const waits = [30, 60, 120]
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!retryable || attempt >= waits.length) throw err
      const until = Date.now() + waits[attempt]
      while (Date.now() < until) { /* brief synchronous backoff */ }
    }
  }
}

/**
 * Durably replace the document. An unchanged value is a no-op; a corrupt
 * document is healed because the comparison uses the parsed document only.
 * @param filePath - absolute path of the document.
 * @param next - the choice to store.
 */
export async function writeCompactionFile(filePath: string, next: CompactionChoice): Promise<void> {
  const existing = readDocument(filePath)
  if (existing !== undefined && existing.provider === next.provider && existing.model === next.model) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await fs.promises.writeFile(tmp, serialize(next), 'utf8')
  try {
    await replaceAsync(tmp, filePath)
  } catch (err) {
    try { await fs.promises.unlink(tmp) } catch { /* ignore */ }
    throw err
  }
  cache.delete(filePath)
}

/**
 * One-time migration: materialize the document from legacy configuration.
 * Never overwrites an existing document, and never throws.
 * @param filePath - absolute path of the document.
 * @param old - legacy values read from the profile configuration.
 * @returns whether a document was written.
 */
export function migrateCompactionFile(filePath: string, old: { provider?: unknown; model?: unknown } | undefined): boolean {
  try {
    if (fs.existsSync(filePath)) return false
    const provider = nonEmpty(old?.provider) ?? DEFAULT_COMPACTION.provider
    const model = nonEmpty(old?.model) ?? DEFAULT_COMPACTION.model
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, serialize({ provider, model }), 'utf8')
    try {
      replaceSync(tmp, filePath)
    } catch (err) {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
      throw err
    }
    cache.delete(filePath)
    return true
  } catch {
    return false
  }
}
