import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveConfig } from '../src/config.ts'
import { clearStatusCache, probeService, probeServiceCached } from '../src/status.ts'

const config = resolveConfig({ apiKey: 'test-key' })

test('reports a reachable Ollama Cloud endpoint', async () => {
  const fetchImpl = (async () => new Response('{}', { status: 200 })) as typeof fetch
  const status = await probeService(config, fetchImpl)
  assert.equal(status.ok, true)
  assert.equal(status.status, 200)
  assert.ok(status.latencyMs >= 0)
  assert.ok(Number.isFinite(Date.parse(status.checkedAt)))
  assert.equal(status.error, undefined)
})

test('reports an HTTP failure', async () => {
  const fetchImpl = (async () => new Response('', { status: 503 })) as typeof fetch
  const status = await probeService(config, fetchImpl)
  assert.equal(status.ok, false)
  assert.equal(status.status, 503)
  assert.equal(status.error, 'HTTP 503')
})

test('reports a transport failure', async () => {
  const fetchImpl = (async () => { throw new Error('boom') }) as typeof fetch
  const status = await probeService(config, fetchImpl)
  assert.equal(status.ok, false)
  assert.equal(status.status, null)
  assert.equal(status.error, 'boom')
})

test('caches the probe so repeated UI polls do not fan out (#137)', async () => {
  clearStatusCache()
  let calls = 0
  const fetchImpl = (async () => {
    calls += 1
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  let clock = 1_000

  const first = await probeServiceCached(config, fetchImpl, () => clock)
  clock += 5_000
  const second = await probeServiceCached(config, fetchImpl, () => clock)
  assert.equal(calls, 1)
  assert.equal(second, first)

  clock += 10_000
  await probeServiceCached(config, fetchImpl, () => clock)
  assert.equal(calls, 2)

  clearStatusCache()
})
