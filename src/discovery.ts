const DISCOVERY_TIMEOUT_MS = 15_000

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { sanitizeUrl } from './sanitize.ts'

export interface DiscoveryOptions {
  /** Test seam only; production discovery rejects private, loopback and HTTP targets. */
  readonly allowPrivate?: boolean
}

export interface DiscoveryResult {
  readonly base: string
  readonly models: readonly string[]
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

function isPrivateV4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts as [number, number, number, number]
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
}

function isPrivateAddress(address: string): boolean {
  const clean = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (isIP(clean) === 4) return isPrivateV4(clean)
  if (isIP(clean) !== 6) return true
  return clean === '::1'
    || clean === '::'
    || clean.startsWith('fc')
    || clean.startsWith('fd')
    || /^fe[89ab]/.test(clean)
    || clean.startsWith('ff')
    || clean.startsWith('2001:db8')
    || clean.startsWith('::ffff:')
}

async function assertPublicEndpoint(base: string, options: DiscoveryOptions): Promise<void> {
  if (options.allowPrivate === true) return
  const url = new URL(base)
  if (url.protocol !== 'https:') throw new DiscoveryError('endpoint must use https')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new DiscoveryError('private endpoint refused')
  }
  let addresses: string[]
  if (isIP(host) !== 0) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address)
    } catch {
      throw new DiscoveryError('could not resolve endpoint')
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new DiscoveryError('private endpoint refused')
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
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const base = normalizeBase(rawBase)
  await assertPublicEndpoint(base, options)
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
  return { base, models: [...new Set(idsOf(payload))] }
}
