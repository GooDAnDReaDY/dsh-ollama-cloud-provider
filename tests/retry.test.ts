import assert from 'node:assert/strict'
import test from 'node:test'

import { isRetryableStatus, retryDelay, retryPolicy } from '../src/retry.ts'

test('retry policy is bounded and configurable', () => {
  assert.deepEqual(retryPolicy({}), { maxRetries: 0, baseDelayMs: 250, maxDelayMs: 2000, jitter: 0.2 })
  assert.equal(retryPolicy({ retryMaxRetries: 3, retryBaseDelayMs: 100, retryMaxDelayMs: 500 }).maxRetries, 3)
  assert.equal(retryPolicy({ retryJitter: 2 }).jitter, 0.2)
  assert.equal(isRetryableStatus(429), true)
  assert.equal(isRetryableStatus(503), true)
  assert.equal(isRetryableStatus(401), false)
})

test('backoff grows and stays within jitter bounds', () => {
  const policy = retryPolicy({ retryMaxRetries: 3, retryBaseDelayMs: 100, retryMaxDelayMs: 500, retryJitter: 0 })
  assert.equal(retryDelay(0, policy, () => 0), 100)
  assert.equal(retryDelay(1, policy, () => 0), 200)
  assert.equal(retryDelay(5, policy, () => 0), 500)
  assert.equal(retryDelay(0, { ...policy, jitter: 1 }, () => 0.5), 100)
})
