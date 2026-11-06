import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { bestEffortFailed } from './best-effort.ts'
import type { OllamaCloudModelMeta } from './models.generated.ts'

const VERSION = 1

export interface CatalogSnapshot {
  readonly at: number
  readonly ids: readonly string[]
  readonly meta: Readonly<Record<string, OllamaCloudModelMeta>>
}

interface CacheFile extends CatalogSnapshot {
  readonly version: number
  readonly baseURL: string
}

export function catalogCachePath(): string {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'cache', 'dsh-ollama-cloud', 'catalog.json')
}

function isMeta(value: unknown): value is OllamaCloudModelMeta {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.transport === 'string'
    && typeof record.contextWindow === 'number'
    && Array.isArray(record.input)
    && Array.isArray(record.reasoning)
}

function parse(value: unknown): CacheFile | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.version !== VERSION || typeof record.baseURL !== 'string') return undefined
  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) return undefined
  if (!Array.isArray(record.ids) || !record.ids.every((id) => typeof id === 'string' && id !== '')) return undefined
  if (typeof record.meta !== 'object' || record.meta === null || Array.isArray(record.meta)) return undefined
  const meta: Record<string, OllamaCloudModelMeta> = {}
  for (const [id, entry] of Object.entries(record.meta as Record<string, unknown>)) {
    if (isMeta(entry) && entry.id === id) meta[id] = entry
  }
  return { version: VERSION, baseURL: record.baseURL, at: record.at, ids: record.ids, meta }
}

export async function loadCatalogSnapshot(baseURL: string): Promise<CatalogSnapshot | undefined> {
  try {
    const parsed = parse(JSON.parse(await readFile(catalogCachePath(), 'utf8')))
    if (parsed === undefined || parsed.baseURL !== baseURL) return undefined
    return { at: parsed.at, ids: parsed.ids, meta: parsed.meta }
  } catch {
    return undefined
  }
}

export async function saveCatalogSnapshot(
  baseURL: string,
  ids: readonly string[],
  meta: Readonly<Record<string, OllamaCloudModelMeta>>,
): Promise<void> {
  const path = catalogCachePath()
  const temp = `${path}.${process.pid}.${createHash('sha1').update(`${Date.now()}`).digest('hex').slice(0, 8)}.tmp`
  const payload: CacheFile = { version: VERSION, baseURL, at: Date.now(), ids, meta }
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(temp, `${JSON.stringify(payload)}\n`, 'utf8')
    await rename(temp, path)
  } catch (error) {
    bestEffortFailed('catalog cache write failed', error)
    try {
      await unlink(temp)
    } catch (unlinkError) {
      bestEffortFailed('cleanup temp cache failed', unlinkError)
    }
  }
}

/** Remove the persistent snapshot together with the in-memory cache. */
export function clearCatalogSnapshot(): void {
  try {
    unlinkSync(catalogCachePath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      bestEffortFailed('clear catalog snapshot failed', error)
    }
  }
}
