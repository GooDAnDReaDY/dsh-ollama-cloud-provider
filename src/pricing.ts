import type { ModelPriceOverride } from './config.ts'
import { GENERATED_MODELS, type ModelCost, type OllamaCloudModelMeta } from './models.generated.ts'

export interface ResolvedPrice {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly free: boolean
  readonly priced: boolean
}

export interface CostInput {
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly priceOverrides?: Readonly<Record<string, ModelPriceOverride>>
  readonly at?: number
}

export interface CostEstimate {
  readonly usd: number
  readonly priced: boolean
  readonly free: boolean
  readonly offPeak: boolean
}

/** `gpt-oss:120b` → `gpt-oss`; used as the second lookup key. */
export function baseIdOf(id: string): string {
  const at = id.indexOf(':')
  return at < 0 ? id : id.slice(0, at)
}

/**
 * Resolve the generated metadata for a priced id: exact tag, base tag, or the
 * first tagged variant when only a base id is known.
 */
export function metaForPrice(id: string): OllamaCloudModelMeta | undefined {
  const exact = GENERATED_MODELS[id]
  if (exact !== undefined) return exact
  const base = baseIdOf(id)
  if (base !== id) return GENERATED_MODELS[base]
  const prefix = `${id}:`
  for (const [key, meta] of Object.entries(GENERATED_MODELS)) {
    if (key.startsWith(prefix)) return meta
  }
  return undefined
}

export function priceFor(
  id: string,
  overrides: Readonly<Record<string, ModelPriceOverride>> = {},
): ResolvedPrice {
  const meta = metaForPrice(id)
  const override = overrides[id] ?? overrides[baseIdOf(id)]
  const cost: ModelCost | undefined = meta?.cost
  const input = override?.input ?? cost?.input ?? 0
  const output = override?.output ?? cost?.output ?? 0
  const cacheRead = override?.cacheRead ?? cost?.cacheRead ?? 0
  const priced = override !== undefined
    || (cost !== undefined && (input > 0 || output > 0 || cacheRead > 0))
  return {
    input,
    output,
    cacheRead,
    free: meta?.free === true,
    priced,
  }
}

/**
 * Ollama's off-peak window: outside 12:00–18:00 UTC on weekdays, plus the whole
 * weekend. Published estimates, not a contract.
 */
export function isOffPeak(at = Date.now()): boolean {
  const date = new Date(at)
  const day = date.getUTCDay()
  if (day === 0 || day === 6) return true
  const hour = date.getUTCHours()
  return hour < 12 || hour >= 18
}

export function estimateCost(input: CostInput): CostEstimate {
  const price = priceFor(input.model, input.priceOverrides)
  const meta = metaForPrice(input.model)
  const offPeak = isOffPeak(input.at) && meta?.cost.offPeakInput !== undefined
  const inputRate = offPeak ? (meta?.cost.offPeakInput ?? price.input) : price.input
  const outputRate = offPeak ? (meta?.cost.offPeakOutput ?? price.output) : price.output
  const cacheRate = offPeak ? (meta?.cost.offPeakCacheRead ?? price.cacheRead) : price.cacheRead
  const usd = (input.inputTokens * inputRate
    + input.outputTokens * outputRate
    + (input.cacheReadTokens ?? 0) * cacheRate) / 1_000_000
  return {
    usd: price.priced ? usd : 0,
    priced: price.priced,
    free: price.free,
    offPeak,
  }
}

export function formatPrice(price: ResolvedPrice): string {
  if (price.free) return 'FREE'
  if (!price.priced) return 'price unknown'
  const money = (value: number): string => value.toFixed(2).replace(/\.00$/, '')
  return `$${money(price.input)}/$${money(price.output)} per 1M`
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`
  if (Math.abs(value) >= 0.01) return `$${value.toFixed(3)}`
  return `$${value.toFixed(4)}`
}
