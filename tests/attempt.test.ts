import assert from 'node:assert/strict'
import test from 'node:test'

import { createAttemptBudget } from '../src/attempt.ts'

test('attempt budgets expose timeout and caller-abort separately', async () => {
  const timed = createAttemptBudget(5)
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(timed.timedOut, true)
  assert.equal(timed.callerAborted, false)
  assert.equal(timed.signal.aborted, true)
  timed.dispose()

  const caller = new AbortController()
  const cancelled = createAttemptBudget(1000, caller.signal)
  caller.abort()
  assert.equal(cancelled.callerAborted, true)
  assert.equal(cancelled.timedOut, false)
  assert.equal(cancelled.signal.aborted, true)
  cancelled.dispose()
})

test('each attempt gets a fresh budget', async () => {
  const first = createAttemptBudget(5)
  await new Promise((resolve) => setTimeout(resolve, 15))
  const second = createAttemptBudget(1000)
  assert.equal(first.signal.aborted, true)
  assert.equal(second.signal.aborted, false)
  assert.equal(second.timedOut, false)
  first.dispose()
  second.dispose()
})
