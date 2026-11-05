import type { ResolvedConfig } from './config.ts'
import { rootFor } from './routing.ts'

const PROBE_TTL_MS = 5 * 60 * 1000

export interface ModelProbe {
  readonly contextWindow?: number
  readonly input: readonly ('text' | 'image')[]
  readonly reasoning: readonly string[]
  readonly reasoningToggle: boolean
  readonly tools: boolean
  readonly available: boolean
}

interface ProbeEntry {
  readonly at: number
  readonly value: ModelProbe
}

const cache = new Map<string, ProbeEntry>()

function keyOf(config: ResolvedConfig, model: string): string {
  return `${rootFor(config)}|${model}`
}

export function isLocalEndpoint(config: ResolvedConfig): boolean {
  if (config.apiKeyEnv === '') return true
  try {
    const host = new URL(config.apiBase).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

function contextOf(info: Record<string, unknown>): number | undefined {
  let best: number | undefined
  for (const [key, value] of Object.entries(info)) {
    if (!key.endsWith('.context_length')) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    best = best === undefined ? value : Math.max(best, value)
  }
  return best === undefined ? undefined : Math.trunc(best)
}

function probeOf(body: unknown): ModelProbe | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const record = body as Record<string, unknown>
  const info = typeof record.model_info === 'object' && record.model_info !== null
    ? record.model_info as Record<string, unknown>
    : {}
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((entry): entry is string => typeof entry === 'string')
    : []
  const thinking = capabilities.includes('thinking')
  const vision = capabilities.includes('vision')
  const contextWindow = contextOf(info)
  const input: Array<'text' | 'image'> = vision ? ['text', 'image'] : ['text']
  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    input,
    reasoning: thinking ? ['off', 'high'] : [],
    reasoningToggle: thinking,
    tools: capabilities.includes('tools'),
    available: true,
  }
}

/** Probe one local model via `/api/show`, caching successful answers for five minutes. */
export async function probeModel(
  config: ResolvedConfig,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelProbe | undefined> {
  if (!isLocalEndpoint(config)) return undefined
  const key = keyOf(config, model)
  const hit = cache.get(key)
  if (hit !== undefined && Date.now() - hit.at < PROBE_TTL_MS) return hit.value
  try {
    const response = await fetchImpl(`${rootFor(config)}/api/show`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': config.userAgent,
      },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return undefined
    const value = probeOf(await response.json())
    if (value === undefined) return undefined
    cache.set(key, { at: Date.now(), value })
    return value
  } catch {
    return undefined
  }
}

/** Clear all probe entries, or only entries for one endpoint. */
export function clearModelProbeCache(baseURL?: string): void {
  if (baseURL === undefined) {
    cache.clear()
    return
  }
  const prefix = `${baseURL.replace(/\/+$/, '')}|`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

export function modelProbeCacheInfo(): Array<{ baseURL: string; model: string; at: number }> {
  return [...cache.entries()].map(([key, entry]) => {
    const separator = key.indexOf('|')
    return { baseURL: key.slice(0, separator), model: key.slice(separator + 1), at: entry.at }
  })
}
