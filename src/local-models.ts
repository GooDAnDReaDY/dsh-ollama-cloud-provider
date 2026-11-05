import type { ResolvedConfig } from './config.ts'
import { isLocalEndpoint } from './model-probe.ts'
import { rootFor } from './routing.ts'

const LOCAL_TIMEOUT_MS = 15_000
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/

export interface LocalModelDetails {
  readonly family?: string
  readonly parameterSize?: string
  readonly quantization?: string
}

export interface LocalModelInfo {
  readonly name: string
  readonly size: number
  readonly digest?: string
  readonly modifiedAt?: string
  readonly details?: LocalModelDetails
}

export interface RunningModelInfo {
  readonly name: string
  readonly size: number
  readonly sizeVram: number
  readonly digest?: string
  readonly expiresAt?: string
}

export interface LocalInventory {
  readonly models: readonly LocalModelInfo[]
  readonly running: readonly RunningModelInfo[]
  readonly diskBytes: number
  readonly runningBytes: number
}

export interface PullProgress {
  readonly status: string
  readonly digest?: string
  readonly completed?: number
  readonly total?: number
}

export interface LocalShow {
  readonly name: string
  readonly modifiedAt?: string
  readonly details?: LocalModelDetails
  readonly capabilities: readonly string[]
  readonly parameters?: string
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function assertLocal(config: ResolvedConfig): void {
  if (!isLocalEndpoint(config)) throw new Error('local endpoint required')
}

function assertModelName(model: string): string {
  const name = model.trim()
  if (name === '' || name.includes('..') || !MODEL_NAME.test(name)) {
    throw new Error('invalid model name')
  }
  return name
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function detailsOf(value: unknown): LocalModelDetails | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  const family = stringOf(record.family)
  const parameterSize = stringOf(record.parameter_size)
  const quantization = stringOf(record.quantization_level)
  const out = {
    ...(family === undefined ? {} : { family }),
    ...(parameterSize === undefined ? {} : { parameterSize }),
    ...(quantization === undefined ? {} : { quantization }),
  }
  return Object.keys(out).length === 0 ? undefined : out
}

async function localJson(
  config: ResolvedConfig,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(`${rootFor(config)}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': config.userAgent,
      ...init.headers,
    },
    signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function readLocalInventory(
  config: ResolvedConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<LocalInventory> {
  assertLocal(config)
  const [tagsPayload, psPayload] = await Promise.all([
    localJson(config, '/api/tags', { method: 'GET' }, fetchImpl),
    localJson(config, '/api/ps', { method: 'GET' }, fetchImpl).catch(() => undefined),
  ])
  const tags = recordOf(tagsPayload)
  const models: LocalModelInfo[] = []
  for (const entry of Array.isArray(tags?.models) ? tags.models : []) {
    const record = recordOf(entry)
    if (record === undefined) continue
    const name = stringOf(record.name) ?? stringOf(record.model)
    if (name === undefined) continue
    const size = numberOf(record.size) ?? 0
    const digest = stringOf(record.digest)
    const modifiedAt = stringOf(record.modified_at)
    const details = detailsOf(record.details)
    models.push({
      name,
      size,
      ...(digest === undefined ? {} : { digest }),
      ...(modifiedAt === undefined ? {} : { modifiedAt }),
      ...(details === undefined ? {} : { details }),
    })
  }
  models.sort((a, b) => a.name.localeCompare(b.name))

  const running: RunningModelInfo[] = []
  const ps = recordOf(psPayload)
  for (const entry of Array.isArray(ps?.models) ? ps.models : []) {
    const record = recordOf(entry)
    if (record === undefined) continue
    const name = stringOf(record.name) ?? stringOf(record.model)
    if (name === undefined) continue
    const digest = stringOf(record.digest)
    const expiresAt = stringOf(record.expires_at)
    running.push({
      name,
      size: numberOf(record.size) ?? 0,
      sizeVram: numberOf(record.size_vram) ?? 0,
      ...(digest === undefined ? {} : { digest }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    })
  }
  running.sort((a, b) => a.name.localeCompare(b.name))
  return {
    models,
    running,
    diskBytes: models.reduce((sum, model) => sum + model.size, 0),
    runningBytes: running.reduce((sum, model) => sum + model.sizeVram, 0),
  }
}

export async function showLocalModel(
  config: ResolvedConfig,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LocalShow> {
  assertLocal(config)
  const name = assertModelName(model)
  const payload = recordOf(await localJson(config, '/api/show', {
    method: 'POST',
    body: JSON.stringify({ model: name }),
  }, fetchImpl))
  if (payload === undefined) throw new Error('invalid show response')
  const capabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities.filter((entry): entry is string => typeof entry === 'string')
    : []
  const modifiedAt = stringOf(payload.modified_at)
  const details = detailsOf(payload.details)
  const parameters = stringOf(payload.parameters)
  return {
    name,
    ...(modifiedAt === undefined ? {} : { modifiedAt }),
    ...(details === undefined ? {} : { details }),
    capabilities,
    ...(parameters === undefined ? {} : { parameters }),
  }
}

export async function pullLocalModel(
  config: ResolvedConfig,
  model: string,
  onProgress: (progress: PullProgress) => void = () => {},
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PullProgress> {
  assertLocal(config)
  const name = assertModelName(model)
  const response = await fetchImpl(`${rootFor(config)}/api/pull`, {
    method: 'POST',
    headers: {
      accept: 'application/x-ndjson',
      'content-type': 'application/json',
      'user-agent': config.userAgent,
    },
    body: JSON.stringify({ model: name, stream: true }),
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (response.body === null) throw new Error('empty pull stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let last: PullProgress = { status: 'starting' }
  const consume = (line: string): void => {
    if (line.trim() === '') return
    const entry = recordOf(JSON.parse(line))
    if (entry === undefined) return
    if (typeof entry.error === 'string' && entry.error !== '') throw new Error(entry.error)
    if (typeof entry.status === 'string') {
      const digest = stringOf(entry.digest)
      const completed = numberOf(entry.completed)
      const total = numberOf(entry.total)
      last = {
        status: entry.status,
        ...(digest === undefined ? {} : { digest }),
        ...(completed === undefined ? {} : { completed }),
        ...(total === undefined ? {} : { total }),
      }
      onProgress(last)
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consume(line)
    if (done) break
  }
  if (buffer.trim() !== '') consume(buffer)
  return last
}

/** Delete one local model. Callers must obtain explicit confirmation first. */
export async function removeLocalModel(
  config: ResolvedConfig,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  assertLocal(config)
  const name = assertModelName(model)
  const response = await fetchImpl(`${rootFor(config)}/api/delete`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': config.userAgent,
    },
    body: JSON.stringify({ model: name }),
    signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}
