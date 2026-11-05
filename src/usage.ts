import { createHash } from 'node:crypto'

import type { ResolvedConfig } from './config.ts'
import type { KeyResolver } from './credentials.ts'
import { PROVIDER } from './provider-ids.ts'
import { isRetryableStatus, retryDelay, retryPolicy } from './retry.ts'

export type UsageRange = '24h' | '7d' | '30d'

export interface UsageTotals {
  requests: number
  usd: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export interface UsageWindow {
  percentUsed: number
  resetsAt?: string
  status?: string
}

export interface CreditBalance {
  includedRemaining: number
  includedAllowance: number
  purchased: number
  periodFrom?: string
  periodUntil?: string
}

export interface UsageReport {
  kind: 'credits' | 'legacy'
  credits?: CreditBalance
  legacy?: { fiveHour?: UsageWindow; weekly?: UsageWindow }
  windows: {
    d24?: UsageTotals
    d7?: UsageTotals
    d30?: UsageTotals
    session?: UsageTotals
    weekly?: UsageTotals
    monthly?: UsageTotals
  }
  byModel: Array<{ model: string } & UsageTotals>
  byWindow?: Partial<Record<UsageRange, Array<{ model: string } & UsageTotals>>>
  range: UsageRange
}

export interface UsageResult {
  report?: UsageReport
  error?: string
  checkedAt: number
  stale?: boolean
}

export interface UsageReader {
  /** Balance plus the 7-day spend window for one key. */
  read(key?: string): Promise<UsageResult | undefined>
  /** One spend window; the plugin caches each range separately. */
  usage(range: UsageRange, key?: string): Promise<UsageResult | undefined>
  clear(): void
}

const BALANCE_TTL_MS = 60_000
const USAGE_TTL_MS = 120_000
const FAILURE_TTL_MS = 30_000
const USAGE_TIMEOUT_MS = 20_000
/** `/api/usage` is limited to 10 requests per minute per user. */
const USAGE_WINDOW_MS = 60_000
const USAGE_WINDOW_LIMIT = 9

function obj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function fingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function totalsOf(value: unknown): UsageTotals {
  const raw = obj(value)
  return {
    requests: num(raw.request_count),
    usd: num(raw.usage_usd),
    inputTokens: num(raw.input_tokens),
    cachedInputTokens: num(raw.cached_input_tokens),
    outputTokens: num(raw.output_tokens),
  }
}

function legacyWindow(value: unknown): UsageWindow | undefined {
  const raw = obj(value)
  if (raw.remaining_percent === undefined && raw.percent === undefined) return undefined
  const remaining = num(raw.remaining_percent)
  const used = raw.remaining_percent === undefined ? num(raw.percent) : 100 - remaining
  const resets = str(raw.resets_at) ?? str(raw.resetsAt)
  const status = str(raw.status)
  return {
    percentUsed: Math.max(0, Math.min(100, used)),
    ...(status === undefined ? {} : { status }),
    ...(resets === undefined ? {} : { resetsAt: resets }),
  }
}

export function normalizeBalance(payload: unknown): Pick<UsageReport, 'kind' | 'credits' | 'legacy'> {
  const included = obj(obj(payload).included)
  const purchased = obj(obj(payload).purchased)
  const allowance = num(included.allowance_usd)
  const remaining = num(included.balance_usd)
  if (included.allowance_usd !== undefined || included.balance_usd !== undefined) {
    const period = obj(included.period)
    return {
      kind: 'credits',
      credits: {
        includedRemaining: remaining,
        includedAllowance: allowance,
        purchased: num(purchased.balance_usd),
        ...(str(period.from) === undefined ? {} : { periodFrom: str(period.from) as string }),
        ...(str(period.until) === undefined ? {} : { periodUntil: str(period.until) as string }),
      },
    }
  }
  const fiveHour = legacyWindow(included.session)
  const weekly = legacyWindow(included.weekly)
  return {
    kind: 'legacy',
    legacy: {
      ...(fiveHour === undefined ? {} : { fiveHour }),
      ...(weekly === undefined ? {} : { weekly }),
    },
  }
}

export function normalizeUsage(payload: unknown, range: UsageRange): {
  totals: UsageTotals
  byModel: Array<{ model: string } & UsageTotals>
} {
  const root = obj(payload)
  const groups: Array<{ model: string } & UsageTotals> = []
  for (const entry of Array.isArray(root.groups) ? root.groups : []) {
    const outer = obj(entry)
    const inner = Object.keys(obj(outer.group)).length > 0 ? obj(outer.group) : outer
    const model = str(inner.model) ?? str(outer.model) ?? str(inner.name) ?? str(outer.name)
    if (model === undefined) continue
    groups.push({ model, ...totalsOf(inner) })
  }
  return { totals: totalsOf(root.totals), byModel: groups.sort((a, b) => b.usd - a.usd) }
}

/** Cached reader for Ollama Cloud balance and usage. Fail-open by design. */
export function createUsageReader(
  config: () => ResolvedConfig,
  resolveKey: KeyResolver,
  fetchImpl: typeof fetch = fetch,
): UsageReader {
  const cache = new Map<string, UsageResult>()
  const lastGood = new Map<string, UsageResult>()
  const inflight = new Map<string, Promise<UsageResult>>()
  const usageCalls: number[] = []
  let generation = 0

  const keyFor = async (explicit?: string): Promise<string | undefined> => {
    if (explicit !== undefined && explicit !== '') return explicit
    try {
      return (await resolveKey(PROVIDER)).key
    } catch {
      return undefined
    }
  }

  const cached = (key: string): UsageResult | undefined => {
    const hit = cache.get(key)
    if (hit === undefined) return undefined
    const ttl = hit.report === undefined ? FAILURE_TTL_MS : USAGE_TTL_MS
    return Date.now() - hit.checkedAt < ttl ? hit : undefined
  }

  const request = async (url: string, key: string): Promise<Response> => {
    const current = config()
    const policy = retryPolicy({ ...current, retryMaxRetries: Math.max(2, current.retryMaxRetries) })
    for (let attempt = 0; ; attempt += 1) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          headers: {
            authorization: `Bearer ${key}`,
            accept: 'application/json',
            'user-agent': current.userAgent,
          },
          signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
        })
      } catch (error) {
        if (attempt < policy.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, policy)))
          continue
        }
        throw error
      }
      if (attempt < policy.maxRetries && isRetryableStatus(response.status)) {
        await response.body?.cancel()
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, policy)))
        continue
      }
      return response
    }
  }

  const readBalance = async (key: string): Promise<Pick<UsageReport, 'kind' | 'credits' | 'legacy'> | undefined> => {
    if (key === '') return undefined
    const current = config()
    try {
      const response = await request(current.balanceUrl, key)
      if (!response.ok) return undefined
      return normalizeBalance(await response.json())
    } catch {
      return undefined
    }
  }

  const readUsage = async (
    key: string,
    range: UsageRange,
    epoch: number,
  ): Promise<{ totals: UsageTotals; byModel: Array<{ model: string } & UsageTotals> } | undefined> => {
    if (key === '') return undefined
    const current = config()
    const cacheKey = `${fingerprint(key)}:${range}`
    const hit = cached(cacheKey)
    if (hit !== undefined) {
      if (hit.report === undefined) return undefined
      const totals = hit.report.windows[range === '24h' ? 'd24' : range === '7d' ? 'd7' : 'd30']
      return totals === undefined ? undefined : { totals, byModel: hit.report.byModel }
    }
    const now = Date.now()
    const recent = usageCalls.filter((at) => now - at < USAGE_WINDOW_MS)
    if (recent.length >= USAGE_WINDOW_LIMIT) return undefined
    recent.push(now)
    usageCalls.length = 0
    usageCalls.push(...recent)
    try {
      const url = new URL(current.usageUrl)
      url.searchParams.set('range', range)
      url.searchParams.set('group_by', 'model')
      const response = await request(url.toString(), key)
      if (!response.ok) {
        if (epoch === generation) {
          cache.set(cacheKey, {
            error: `usage endpoint returned HTTP ${response.status}`,
            checkedAt: Date.now(),
          })
        }
        return undefined
      }
      return normalizeUsage(await response.json(), range)
    } catch (error) {
      if (epoch === generation) {
        cache.set(cacheKey, {
          error: error instanceof Error ? error.message : 'usage request failed',
          checkedAt: Date.now(),
        })
      }
      return undefined
    }
  }

  const compose = async (key: string, range: UsageRange, epoch: number): Promise<UsageResult> => {
    const [balance, usage] = await Promise.all([readBalance(key), readUsage(key, range, epoch)])
    const reportKey = `${fingerprint(key)}:report:${range}`
    if (balance === undefined && usage === undefined) {
      const result: UsageResult = { error: 'usage and balance are unavailable', checkedAt: Date.now() }
      const previous = lastGood.get(reportKey)
      if (epoch === generation) cache.set(reportKey, result)
      return previous === undefined ? result : {
        ...previous,
        stale: true,
        ...(result.error === undefined ? {} : { error: result.error }),
      }
    }
    const windowKey = range === '24h' ? 'd24' as const : range === '7d' ? 'd7' as const : 'd30' as const
    const report: UsageReport = {
      kind: balance?.kind ?? 'credits',
      ...(balance?.credits === undefined ? {} : { credits: balance.credits }),
      ...(balance?.legacy === undefined ? {} : { legacy: balance.legacy }),
      windows: usage === undefined
        ? {}
        : {
            [windowKey]: usage.totals,
            ...(range === '24h' ? { session: usage.totals } : {}),
            ...(range === '7d' ? { weekly: usage.totals } : {}),
            ...(range === '30d' ? { monthly: usage.totals } : {}),
          },
      byModel: usage?.byModel ?? [],
      ...(usage === undefined ? {} : { byWindow: { [range]: usage.byModel } }),
      range,
    }
    const result: UsageResult = { report, checkedAt: Date.now() }
    if (epoch === generation) {
      cache.set(reportKey, result)
      if (usage !== undefined) {
        cache.set(`${fingerprint(key)}:${range}`, result)
        lastGood.set(reportKey, result)
      }
    }
    return result
  }

  const reader = async (range: UsageRange, explicitKey?: string): Promise<UsageResult | undefined> => {
    const key = await keyFor(explicitKey)
    if (key === undefined) return { error: 'no credential', checkedAt: Date.now() }
    const cacheKey = `${fingerprint(key)}:report:${range}`
    const hit = cache.get(cacheKey)
    const ttl = hit?.report === undefined ? FAILURE_TTL_MS : BALANCE_TTL_MS
    if (hit !== undefined && Date.now() - hit.checkedAt < ttl) {
      if (hit.report === undefined) {
        const previous = lastGood.get(cacheKey)
        if (previous !== undefined) return {
          ...previous,
          stale: true,
          ...(hit.error === undefined ? {} : { error: hit.error }),
        }
      }
      return hit
    }
    const existing = inflight.get(cacheKey)
    if (existing !== undefined) return existing
    const epoch = generation
    const task = compose(key, range, epoch).finally(() => inflight.delete(cacheKey))
    inflight.set(cacheKey, task)
    return task
  }

  reader.read = (key?: string) => reader('7d', key)
  reader.usage = (range: UsageRange, key?: string) => reader(range, key)
  reader.clear = (): void => {
    generation += 1
    cache.clear()
    inflight.clear()
  }
  return reader as UsageReader
}
