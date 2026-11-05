const DISCOVERY_TIMEOUT_MS = 15_000

import { sanitizeUrl } from './sanitize.ts'

export interface DiscoveryResult {
  readonly base: string
  readonly models: readonly string[]
  readonly local: boolean
}

export class DiscoveryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'DiscoveryError'
  }
}

function normalizeBase(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new DiscoveryError('invalid endpoint URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DiscoveryError('endpoint must use http or https')
  }
  if (url.username !== '' || url.password !== '') {
    throw new DiscoveryError('endpoint URL must not contain credentials')
  }
  return sanitizeUrl(value)
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

function idsOf(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return []
  const record = payload as Record<string, unknown>
  const fromData = Array.isArray(record.data)
    ? record.data.map((entry) => {
        if (typeof entry !== 'object' || entry === null) return undefined
        const id = (entry as Record<string, unknown>).id
        return typeof id === 'string' && id !== '' ? id : undefined
      }).filter((id): id is string => id !== undefined)
    : []
  if (fromData.length > 0) return fromData
  return Array.isArray(record.models)
    ? record.models.map((entry) => {
        if (typeof entry !== 'object' || entry === null) return undefined
        const item = entry as Record<string, unknown>
        const id = typeof item.name === 'string' ? item.name : item.model
        return typeof id === 'string' && id !== '' ? id : undefined
      }).filter((id): id is string => id !== undefined)
    : []
}

async function get(
  url: string,
  key: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(key === '' ? {} : { authorization: `Bearer ${key}` }),
    },
    redirect: 'error',
    signal,
  })
  if (!response.ok) {
    throw new DiscoveryError(`endpoint answered ${response.status}`, response.status)
  }
  return response.json()
}

/**
 * Discover a catalog for an unsaved endpoint with a one-shot key.
 * This function performs no persistence and never includes the key in errors.
 */
export async function discoverModels(
  rawBase: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryResult> {
  const base = normalizeBase(rawBase)
  const budget = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
  let payload: unknown
  try {
    payload = await get(`${base}/v1/models`, key, fetchImpl, budget)
  } catch (error) {
    if (error instanceof DiscoveryError && error.status === 401) throw error
    if (error instanceof DiscoveryError && error.status === 404) {
      payload = await get(`${base}/api/tags`, key, fetchImpl, budget)
    } else {
      throw error
    }
  }
  return { base, models: [...new Set(idsOf(payload))], local: isLoopback(base) }
}
