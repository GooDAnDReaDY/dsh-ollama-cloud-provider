import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_GENERATE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  type ResolvedConfig,
  type TransportId,
} from './config.ts'
import { GENERATED_MODELS, type OllamaCloudModelMeta } from './models.generated.ts'
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

/** Replace the in-memory live metadata with one successful catalog response. */
function adoptLive(models: readonly LiveModel[], tags: TagsPayload | undefined): string[] {
  const caps = capabilitiesByModel(tags)
  const ids: string[] = []
  for (const entry of models) {
    const meta = metaFromLive(entry, caps.get(str(entry.slug) ?? ''))
    if (meta.id === '') continue
    liveMeta.set(meta.id, meta)
    ids.push(meta.id)
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
 */
export async function refreshCatalog(
  config: ResolvedConfig,
  fetchImpl: typeof fetch = fetch,
  force = false,
): Promise<readonly string[]> {
  const key = config.apiBase
  const cached = cache.get(key)
  if (!force && cached !== undefined && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.ids
  }

  const signal = AbortSignal.timeout(CATALOG_TIMEOUT_MS)
  const [modelsResult, tagsResult] = await Promise.allSettled([
    fetchJson(modelsUrlFor(config), config, fetchImpl, signal),
    fetchJson(tagsUrlFor(config), config, fetchImpl, signal),
  ])
  if (modelsResult.status === 'fulfilled') {
    const payload = modelsResult.value as ModelsPayload
    const tags = tagsResult.status === 'fulfilled' ? tagsResult.value as TagsPayload : undefined
    const live = Array.isArray(payload.models) ? payload.models : []
    if (live.length > 0) {
      const ids = adoptLive(live, tags)
      if (ids.length > 0) {
        cache.set(key, { at: Date.now(), ids })
        return ids
      }
    }
    const fromData = Array.isArray(payload.data)
      ? payload.data.map((entry) => str(entry.id)).filter((id): id is string => id !== undefined)
      : []
    if (fromData.length > 0) {
      cache.set(key, { at: Date.now(), ids: fromData })
      return fromData
    }
  }
  const fallback = Object.keys(GENERATED_MODELS)
  cache.set(key, { at: Date.now(), ids: fallback })
  return fallback
}

export function clearCatalogCache(): void {
  cache.clear()
}

export function baseMeta(id: string): OllamaCloudModelMeta {
  const meta = liveMeta.get(id) ?? GENERATED_MODELS[id]
  return meta === undefined ? { ...FALLBACK_META, id, name: id } : meta
}

export interface EffectiveModel extends OllamaCloudModelMeta {
  readonly transport: TransportId
}

export function effectiveModel(id: string, config: ResolvedConfig): EffectiveModel {
  const meta = baseMeta(id)
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
  if (config.visibleModels.length === 0) return true
  return config.visibleModels.includes(id)
}

export function modelAvailable(id: string, config: ResolvedConfig): boolean {
  if (!config.filterModelsByPlan) return true
  return baseMeta(id).available !== false
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
