import assert from 'node:assert/strict'
import test from 'node:test'

import { quotaBars, windowRows, worstUsedPercent } from '../src/quota-model.ts'
import { createUsageReader, normalizeBalance, normalizeUsage } from '../src/usage.ts'

test('new balance format becomes a credit balance', () => {
  const parsed = normalizeBalance({
    included: {
      balance_usd: 72.5,
      allowance_usd: 100,
      period: { from: '2026-09-15T09:30:00Z', until: '2026-10-15T09:30:00Z' },
    },
    purchased: { balance_usd: 25 },
  })
  assert.equal(parsed.kind, 'credits')
  assert.equal(parsed.credits?.includedRemaining, 72.5)
  assert.equal(parsed.credits?.includedAllowance, 100)
  assert.equal(parsed.credits?.purchased, 25)
  assert.equal(parsed.credits?.periodUntil, '2026-10-15T09:30:00Z')
})

test('legacy balance format becomes percentage windows', () => {
  const parsed = normalizeBalance({
    included: {
      session: { remaining_percent: 40, resets_at: '2026-10-21T18:00:00Z' },
      weekly: { remaining_percent: 90, status: 'ok' },
    },
  })
  assert.equal(parsed.kind, 'legacy')
  assert.equal(parsed.legacy?.fiveHour?.percentUsed, 60)
  assert.equal(parsed.legacy?.weekly?.percentUsed, 10)
  assert.equal(parsed.legacy?.fiveHour?.resetsAt, '2026-10-21T18:00:00Z')
})

test('usage payload normalizes totals and model groups', () => {
  const parsed = normalizeUsage({
    totals: {
      request_count: 15,
      usage_usd: 0.017,
      input_tokens: 106_000,
      cached_input_tokens: 46_000,
      output_tokens: 13_600,
    },
    groups: [
      { model: 'glm-5.3', request_count: 4, usage_usd: 0.005, input_tokens: 24_000, output_tokens: 3_200 },
      { group: { model: 'gpt-oss:120b', request_count: 1, usage_usd: 0.001 } },
    ],
  }, '7d')
  assert.equal(parsed.totals.requests, 15)
  assert.equal(parsed.totals.usd, 0.017)
  assert.equal(parsed.byModel.length, 2)
  assert.equal(parsed.byModel[0]?.model, 'glm-5.3')
})

test('quota bars expose credits and legacy windows', () => {
  const credits = quotaBars({
    kind: 'credits',
    credits: { includedRemaining: 25, includedAllowance: 100, purchased: 5 },
    windows: {},
    byModel: [],
    range: '7d',
  })
  assert.equal(credits.length, 1)
  assert.equal(credits[0]?.usedPercent, 75)
  assert.equal(credits[0]?.remainingPercent, 25)

  const legacy = quotaBars({
    kind: 'legacy',
    legacy: {
      fiveHour: { percentUsed: 60 },
      weekly: { percentUsed: 10 },
    },
    windows: {},
    byModel: [],
    range: '7d',
  })
  assert.equal(legacy.length, 2)
  assert.equal(worstUsedPercent({
    kind: 'legacy',
    legacy: { fiveHour: { percentUsed: 60 }, weekly: { percentUsed: 10 } },
    windows: {},
    byModel: [],
    range: '7d',
  }), 60)
})

test('window rows expose only present spend windows', () => {
  const rows = windowRows({
    kind: 'credits',
    credits: { includedRemaining: 1, includedAllowance: 2, purchased: 0 },
    windows: {
      d24: { requests: 1, usd: 0.1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 },
      d7: { requests: 2, usd: 0.2, inputTokens: 20, cachedInputTokens: 0, outputTokens: 10 },
    },
    byModel: [],
    range: '7d',
  })
  assert.deepEqual(rows.map((row) => row.key), ['24h', '7d'])
})

test('usage reader caches balance and usage per key', async () => {
  let calls = 0
  const fakeFetch = (async (input: string | URL | Request) => {
    calls += 1
    const href = String(input)
    const body = href.includes('/api/balance')
      ? { included: { balance_usd: 50, allowance_usd: 100 }, purchased: { balance_usd: 0 } }
      : {
          totals: { request_count: 3, usage_usd: 0.5, input_tokens: 100, output_tokens: 50 },
          groups: [{ model: 'gpt-oss:120b', request_count: 3, usage_usd: 0.5 }],
        }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const reader = createUsageReader(
    () => ({
      apiBase: 'https://ollama.com',
      openAiBase: 'https://ollama.com/v1',
      usageUrl: 'https://ollama.com/api/usage',
      balanceUrl: 'https://ollama.com/api/balance',
      userAgent: 'test',
    }) as never,
    async () => ({ key: 'key-1', source: 'test' }),
    fakeFetch,
  )

  const first = await reader.read()
  assert.equal(first?.report?.credits?.includedRemaining, 50)
  assert.equal(first?.report?.windows.d7?.requests, 3)
  const before = calls
  const second = await reader.read()
  assert.equal(second?.report?.credits?.includedRemaining, 50)
  assert.equal(calls, before)
})

test('usage reader fails open when both endpoints fail', async () => {
  const fakeFetch = (async () => { throw new Error('offline') }) as typeof fetch
  const reader = createUsageReader(
    () => ({
      apiBase: 'https://ollama.com',
      openAiBase: 'https://ollama.com/v1',
      usageUrl: 'https://ollama.com/api/usage',
      balanceUrl: 'https://ollama.com/api/balance',
      userAgent: 'test',
    }) as never,
    async () => ({ key: 'key-2', source: 'test' }),
    fakeFetch,
  )
  const result = await reader.read()
  assert.ok(result?.error !== undefined)
  assert.equal(result?.report, undefined)
})
