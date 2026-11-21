import assert from 'node:assert/strict'
import test from 'node:test'

import { createRouteGuard } from '../src/route-guard.ts'

test('admits one request at a time and rate-limits repeats (#137)', () => {
  let clock = 1_000
  const guard = createRouteGuard(2_000, () => clock)

  assert.equal(guard.begin(), 'ok')
  assert.equal(guard.begin(), 'busy')
  guard.end()

  clock += 500
  assert.equal(guard.begin(), 'rate')
  guard.end()

  clock += 2_000
  assert.equal(guard.begin(), 'ok')
  assert.equal(guard.begin(), 'busy', 'inflight wins over the interval')
  guard.end()

  clock += 2_000
  assert.equal(guard.begin(), 'ok', 'released guard accepts the next request after the interval')
  guard.end()
})
