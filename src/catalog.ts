import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_GENERATE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  type ResolvedConfig,
  type TransportId,
} from './config.ts'
import { GENERATED_MODELS, type OllamaCloudModelMeta } from './models.generated.ts'
import { clearModelProbeCache, isLocalEndpoint, probeModel } from './model-probe.ts'
import { formatPrice, priceFor } from './pricing.ts'
import { modelsUrlFor, tagsUrlFor } from './routing.ts'

const CATALOG_TTL_MS = 10 * 60 * 1000
const CATALOG_TIMEOUT_MS = 15_000

interface LiveModel {
  slug?: unknown
  display_name?: unknown
  context_window?: unknown
  max_context_window?: unknown
  input_modalities?: unknown
  supported_reasoning_levels?: unknown
  default_reasoning_level?: unknown
  visibility?: unknown
  supported_in_api?: unknown
}

interface ModelsPayload {
  data?: Array<{ id?: unknown }>
  models?: LiveModel[]
}

interface TagsPayload {
  models?: Array<{ name?: unknown; model?: unknown; capabilities?: unknown }>
}

const liveMeta = new Map<string, OllamaCloudModelMeta>()
const cache = new Map<string, { at: number; ids: readonly string[] }>()
const inflight = new Map<string, Promise<readonly string[]>>()
let generation = 0

function liveKey(base: string, id: string): string {
  return `${base}|${id}`
}

const FALLBACK_META: OllamaCloudModelMeta = {
  id: '',
  name: '',
  transport: 'native',
  contextWindow: DEFAULT_CONTEXT_WINDOW,
  maxTokens: DEFAULT_MAX_TOKENS,
  input: ['text'],
  reasoning: [],
  reasoningToggle: false,
  tools: true,
  free: false,
  available: true,
  cost: { input: 0, output: 0, cacheRead: 0 },
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
}

function effortNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const effort = str((entry as Record<string, unknown>).effort)
      if (effort !== undefined) out.push(effort)
    } else if (typeof entry === 'string' && entry !== '') {
      out.push(entry)
    }
  }
  return out
}

function capabilitiesByModel(tags: TagsPayload | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const entry of tags?.models ?? []) {
    const name = str(entry.name) ?? str(entry.model)
    if (name === undefined) continue
    out.set(name, new Set(strings(entry.capabilities)))
  }
  return out
}

function metaFromLive(entry: LiveModel, caps: Set<string> | undefined): OllamaCloudModelMeta {
  const id = str(entry.slug) ?? ''
  const base = GENERATED_MODELS[id]
  const levels = effortNames(entry.supported_reasoning_levels)
  const thinking = caps?.has('thinking') === true || levels.length > 0
  const toggle = thinking && levels.length === 0
  const modalities = strings(entry.input_modalities)
  const image = modalities.includes('image')
    || (base?.input.includes('image') === true && modalities.length === 0)
  return {
    id,
    name: str(entry.display_name) ?? id,
    transport: base?.transport ?? 'native',
    contextWindow: num(entry.context_window)
      ?? num(entry.max_context_window)
      ?? base?.contextWindow
      ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: base?.maxTokens ?? DEFAULT_MAX_TOKENS,
    input: image ? ['text', 'image'] : ['text'],
    reasoning: levels.length > 0 ? levels : (toggle ? ['off', 'high'] : (base?.reasoning ?? [])),
    reasoningToggle: toggle || (base?.reasoningToggle === true && levels.length === 0),
    tools: caps?.has('tools') === true || base?.tools === true || base === undefined,
    free: base?.free === true,
    available: entry.supported_in_api !== false && entry.visibility !== 'hide',
    ...(str(entry.default_reasoning_level) === undefined
      ? (base?.defaultReasoning === undefined ? {} : { defaultReasoning: base.defaultReasoning })
      : { defaultReasoning: str(entry.default_reasoning_level) as string }),
    cost: base?.cost ?? { input: 0, output: 0, cacheRead: 0 },
  }
}

function metaFromProbe(id: string, probe: Awaited<ReturnType<typeof probeModel>>): OllamaCloudModelMeta | undefined {
  if (probe === undefined) return undefined
  const base = GENERATED_MODELS[id]
  return {
    id,
    name: base?.name ?? id,
    transport: base?.transport ?? 'native',
    contextWindow: probe.contextWindow ?? base?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: base?.maxTokens ?? DEFAULT_MAX_TOKENS,
    input: [...probe.input],
    reasoning: probe.reasoning.length > 0 ? [...probe.reasoning] : (base?.reasoning ?? []),
    reasoningToggle: probe.reasoningToggle || base?.reasoningToggle === true,
    tools: probe.tools || base?.tools === true,
    free: base?.free === true,
    available: probe.available,
    ...(base?.defaultReasoning === undefined ? {} : { defaultReasoning: base.defaultReasoning }),
    cost: base?.cost ?? { input: 0, output: 0, cacheRead: 0 },
  }
}

async function adoptProbes(
  config: ResolvedConfig,
  ids: readonly string[],
  base: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const probes = await Promise.all(ids.slice(0, 64).map(async (id) => ({
    id,
    meta: metaFromProbe(id, await probeModel(config, id, fetchImpl)),
  })))
  for (const { id, meta } of probes) {
    if (meta !== undefined) liveMeta.set(liveKey(base, id), meta)
  }
}

/** Replace the in-memory live metadata for one API base with one successful response. */
function adoptLive(models: readonly LiveModel[], tags: TagsPayload | undefined, base: string): string[] {
  const caps = capabilitiesByModel(tags)
  const ids: string[] = []
  for (const entry of models) {
    const meta = metaFromLive(entry, caps.get(str(entry.slug) ?? ''))
    if (meta.id === '') continue
    liveMeta.set(liveKey(base, meta.id), meta)
    ids.push(meta.id)
  }
  const keep = new Set(ids)
  const prefix = `${base}|`
  for (const key of liveMeta.keys()) {
    if (!key.startsWith(prefix)) continue
    const id = key.slice(prefix.length)
    if (!keep.has(id)) liveMeta.delete(key)
  }
  return ids
}

async function fetchJson(
  url: string,
  config: ResolvedConfig,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'user-agent': config.userAgent,
    },
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * Refresh the live catalog (public, no key required) and return its ids.
 * Network failures keep the previous live metadata and fall back to the
 * generated snapshot, so the picker always has something to show.
 *
 * A cached catalog is served immediately, even after its TTL: the network
 * refresh runs in the background so the picker never blocks on a stale entry.
 * Only the first load (no cache) waits for the network.
 */
export async function refreshCatalog(
  config: ResolvedConfig,
  fetchImpl: typeof fetch = fetch,
  force = false,
): Promise<readonly string[]> {
  const key = config.apiBase
  const cached = cache.get(key)
  if (!force && cached !== undefined) {
    if (Date.now() - cached.at >= CATALOG_TTL_MS) refreshInBackground(config, fetchImpl, key)
    return cached.ids
  }
  return refreshNow(config, fetchImpl, key, cached !== undefined, generation)
}

async function refreshNow(
  config: ResolvedConfig,
  fetchImpl: typeof fetch,
  key: string,
  keepOnFailure: boolean,
  epoch: number,
): Promise<readonly string[]> {
  const signal = AbortSignal.timeout(CATALOG_TIMEOUT_MS)
  const [modelsResult, tagsResult] = await Promise.allSettled([
    fetchJson(modelsUrlFor(config), config, fetchImpl, signal),
    fetchJson(tagsUrlFor(config), config, fetchImpl, signal),
  ])
  if (epoch !== generation) return Object.keys(GENERATED_MODELS)
  if (modelsResult.status === 'fulfilled') {
    const payload = modelsResult.value as ModelsPayload
    const tags = tagsResult.status === 'fulfilled' ? tagsResult.value as TagsPayload : undefined
    const live = Array.isArray(payload.models) ? payload.models : []
    if (live.length > 0) {
      const ids = adoptLive(live, tags, key)
      if (ids.length > 0) {
        cache.set(key, { at: Date.now(), ids })
        return ids
      }
    }
    const fromData = Array.isArray(payload.data)
      ? payload.data.map((entry) => str(entry.id)).filter((id): id is string => id !== undefined)
      : []
    const tagsPayload = tagsResult.status === 'fulfilled' ? tagsResult.value as TagsPayload : undefined
    const fromTags = (tagsPayload?.models ?? [])
      .map((entry) => str(entry.name) ?? str(entry.model))
      .filter((id): id is string => id !== undefined)
    const ids = fromData.length > 0 ? fromData : fromTags
    if (ids.length > 0) {
      for (const liveKey of liveMeta.keys()) {
        if (liveKey.startsWith(`${key}|`)) liveMeta.delete(liveKey)
      }
      if (isLocalEndpoint(config)) await adoptProbes(config, ids, key, fetchImpl)
      cache.set(key, { at: Date.now(), ids })
      return ids
    }
  }
  if (keepOnFailure) {
    const stale = cache.get(key)
    if (stale !== undefined) return stale.ids
  }
  const fallback = Object.keys(GENERATED_MODELS)
  if (epoch === generation) cache.set(key, { at: Date.now(), ids: fallback })
  return fallback
}

function refreshInBackground(
  config: ResolvedConfig,
  fetchImpl: typeof fetch,
  key: string,
): void {
  if (inflight.has(key)) return
  const epoch = generation
  const task = refreshNow(config, fetchImpl, key, true, epoch)
    .catch(() => cache.get(key)?.ids ?? Object.keys(GENERATED_MODELS))
    .finally(() => { inflight.delete(key) })
  inflight.set(key, task)
  void task
}

export function clearCatalogCache(): void {
  generation += 1
  cache.clear()
  inflight.clear()
  liveMeta.clear()
  clearModelProbeCache()
}

export function baseMeta(id: string, base: string): OllamaCloudModelMeta {
  const meta = liveMeta.get(liveKey(base, id)) ?? GENERATED_MODELS[id]
  return meta === undefined ? { ...FALLBACK_META, id, name: id } : meta
}

export interface EffectiveModel extends OllamaCloudModelMeta {
  readonly transport: TransportId
}

export function effectiveModel(id: string, config: ResolvedConfig): EffectiveModel {
  const meta = baseMeta(id, config.apiBase)
  return {
    ...meta,
    transport: config.modelTransports[id] ?? config.transport,
    contextWindow: config.contextWindowOverrides[id] ?? config.contextWindow ?? meta.contextWindow,
  }
}

/** Effective per-request output default; `0` means "omit the field". */
export function effectiveMaxTokens(meta: OllamaCloudModelMeta, config: ResolvedConfig): number | undefined {
  const ceiling = Math.min(meta.maxTokens, DEFAULT_GENERATE_MAX_TOKENS)
  if (config.maxOutputTokens === undefined) return ceiling
  if (config.maxOutputTokens === 0) return undefined
  return Math.min(ceiling, config.maxOutputTokens)
}

export function modelVisible(id: string, config: ResolvedConfig): boolean {
  const override = config.modelVisibility[id]
  if (override !== undefined) return override
  if (config.showAllModels) return true
  return config.visibleModels.includes(id)
}

export function modelAvailable(id: string, config: ResolvedConfig): boolean {
  if (!config.filterModelsByPlan) return true
  return baseMeta(id, config.apiBase).available !== false
}

export function sortForPicker(
  ids: readonly string[],
  config: ResolvedConfig,
  unfiltered = false,
): string[] {
  return ids
    .filter((id) => unfiltered || (modelVisible(id, config) && modelAvailable(id, config)))
    .sort((left, right) => {
      const a = effectiveModel(left, config)
      const b = effectiveModel(right, config)
      if (a.free !== b.free) return a.free ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function formatContext(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(value / 1024)}K`
}

export function describeModel(meta: EffectiveModel, config: ResolvedConfig): string {
  const parts = [meta.transport, `${formatContext(meta.contextWindow)} context`]
  if (meta.free) parts.push('FREE')
  else parts.push(formatPrice(priceFor(meta.id, config.priceOverrides)))
  if (meta.input.includes('image')) parts.push('Image')
  if (meta.tools) parts.push('Tools')
  if (meta.reasoning.length > 0) parts.push(`reasoning: ${meta.reasoning.join('/')}`)
  return parts.join(' · ')
}
