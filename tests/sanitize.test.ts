import assert from 'node:assert/strict'
import test from 'node:test'

import { redactText, safeErrorMessage, sanitizeUrl } from '../src/sanitize.ts'

test('sanitizes endpoint userinfo and secret query params', () => {
  const url = sanitizeUrl('https://user:pass@example.com/v1?api_key=secret&x=1&token=abc#frag')
  assert.equal(url.includes('user'), false)
  assert.equal(url.includes('pass'), false)
  assert.equal(url.includes('secret'), false)
  assert.equal(url.includes('token'), false)
  assert.match(url, /x=1/)
  assert.equal(sanitizeUrl('not a url'), 'not a url')
})

test('redacts credentials, control characters and long text', () => {
  const text = redactText('Bearer abc.def \u0001 api_key=secret sk-1234567890 ' + 'x'.repeat(400))
  assert.equal(text.includes('abc.def'), false)
  assert.equal(text.includes('secret'), false)
  assert.equal(text.includes('1234567890'), false)
  assert.equal(text.includes('\u0001'), false)
  assert.ok(text.length <= 300)
  assert.equal(safeErrorMessage(new Error('password=hunter2')), 'password=[redacted]')
})
