import assert from 'node:assert/strict'
import test from 'node:test'

import { checkEndpoint, endpointOr } from '../src/endpoints.ts'

test('accepts absolute http(s) endpoints without embedded secrets (#136)', () => {
  assert.equal(checkEndpoint('apiBase', 'https://ollama.com').ok, true)
  assert.equal(checkEndpoint('apiBase', 'https://proxy.example/v1').value, 'https://proxy.example/v1')
  assert.equal(checkEndpoint('apiBase', 'http://127.0.0.1:11434').ok, true)
  assert.equal(checkEndpoint('apiBase', '  https://ollama.com  ').value, 'https://ollama.com')
})

test('rejects endpoints that can exfiltrate the key or reach metadata (#136)', () => {
  for (const value of [
    'file:///etc/passwd',
    'ftp://example.com',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://example.com/#fragment',
    'http://169.254.169.254/latest/meta-data',
    'http://[fe80::1]/',
    'http://0.0.0.0:8080',
    'not a url',
    '',
    null,
    42,
  ]) {
    const checked = checkEndpoint('apiBase', value)
    assert.equal(checked.ok, false, `expected rejection for ${String(value)}`)
    assert.ok((checked.error ?? '').startsWith('apiBase'), `error names the field: ${String(value)}`)
  }
})

test('falls back to the default when a configured endpoint is unsafe (#136)', () => {
  assert.equal(endpointOr('file:///etc/passwd', 'apiBase', 'https://ollama.com'), 'https://ollama.com')
  assert.equal(endpointOr('https://proxy.example/v1', 'apiBase', 'https://ollama.com'), 'https://proxy.example/v1')
})
