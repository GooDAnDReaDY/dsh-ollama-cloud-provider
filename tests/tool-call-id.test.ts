import assert from 'node:assert/strict'
import test from 'node:test'

import { uniqueToolCallId } from '../src/transports/tool-call-id.ts'

test('uniqueToolCallId returns trimmed upstream id when non-empty', () => {
  assert.equal(uniqueToolCallId('call_123'), 'call_123')
  assert.equal(uniqueToolCallId('  call_custom  '), 'call_custom')
})

test('uniqueToolCallId generates unique UUID-based id when upstream id is missing or empty (#2)', () => {
  const missing = uniqueToolCallId(undefined)
  assert.match(missing, /^call_[0-9a-f-]{36}$/)

  const empty = uniqueToolCallId('')
  assert.match(empty, /^call_[0-9a-f-]{36}$/)

  const whitespace = uniqueToolCallId('   ')
  assert.match(whitespace, /^call_[0-9a-f-]{36}$/)

  const nullVal = uniqueToolCallId(null)
  assert.match(nullVal, /^call_[0-9a-f-]{36}$/)
})

test('uniqueToolCallId generates non-colliding ids across consecutive invocations (#2)', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const id = uniqueToolCallId()
    assert.ok(!seen.has(id), `collision detected: ${id}`)
    seen.add(id)
  }
  assert.equal(seen.size, 100)
})
