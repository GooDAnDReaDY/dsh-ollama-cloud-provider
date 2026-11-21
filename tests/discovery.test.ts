import assert from 'node:assert/strict'
import test from 'node:test'

import { DiscoveryError, discoverModels } from '../src/discovery.ts'
import { startMockOllama } from './mock-ollama.ts'

test('discovers models from an unsaved endpoint without a key', async () => {
  const mock = await startMockOllama()
  try {
    const result = await discoverModels(mock.url, '', fetch, { allowPrivate: true })
    assert.deepEqual(result.models, ['gpt-oss:120b', 'llama3.2:3b'])
    assert.equal(mock.requests.some((entry) => entry.headers.authorization !== undefined), false)
  } finally {
    await mock.close()
  }
})

test('uses a one-shot key for a protected endpoint and never leaks it', async () => {
  const mock = await startMockOllama({ requireAuth: true, apiKey: 'one-shot-secret' })
  try {
    await assert.rejects(discoverModels(mock.url, '', fetch, { allowPrivate: true }), (error: unknown) => {
      assert.ok(error instanceof DiscoveryError)
      assert.equal(error.status, 401)
      assert.equal(error.message.includes('one-shot-secret'), false)
      return true
    })
    const result = await discoverModels(mock.url, 'one-shot-secret', fetch, { allowPrivate: true })
    assert.equal(result.models.length, 2)
    assert.equal(JSON.stringify(result).includes('one-shot-secret'), false)
    const request = mock.requests.filter((entry) => entry.path === '/v1/models').at(-1)
    assert.equal(request?.headers.authorization, 'Bearer one-shot-secret')
  } finally {
    await mock.close()
  }
})

test('rejects an invalid endpoint before any request', async () => {
  await assert.rejects(discoverModels('file:///etc/passwd', ''), /http/)
  await assert.rejects(discoverModels('http://user:secret@example.com', ''), /credentials/)
  await assert.rejects(discoverModels('not a url', ''), /invalid endpoint/)
  await assert.rejects(discoverModels('https://127.0.0.1:11434', ''), /private endpoint/)
  await assert.rejects(discoverModels('http://example.com', ''), /https/)
})
