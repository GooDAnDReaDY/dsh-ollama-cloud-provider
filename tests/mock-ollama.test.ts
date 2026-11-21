import assert from 'node:assert/strict'
import test from 'node:test'

import { startMockOllama } from './mock-ollama.ts'

test('mock Ollama serves tags, show, chat, web and records requests', async () => {
  const mock = await startMockOllama()
  try {
    const tags = await fetch(`${mock.url}/api/tags`).then((response) => response.json()) as {
      models: Array<{ name: string }>
    }
    assert.ok(tags.models.some((model) => model.name === 'gpt-oss:120b'))

    const show = await fetch(`${mock.url}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-oss:120b' }),
    }).then((response) => response.json()) as { model: string; capabilities: string[] }
    assert.equal(show.model, 'gpt-oss:120b')
    assert.ok(show.capabilities.includes('thinking'))

    const chat = await fetch(`${mock.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-oss:120b', messages: [] }),
    }).then((response) => response.text())
    assert.match(chat, /"done":true/)
    assert.match(chat, /"eval_count":3/)

    const search = await fetch(`${mock.url}/api/web_search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'q' }),
    }).then((response) => response.json()) as { results: Array<{ url?: string }> }
    assert.equal(search.results.filter((entry) => entry.url !== undefined).length, 2)

    const page = await fetch(`${mock.url}/api/web_fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    }).then((response) => response.json()) as { content: string }
    assert.match(page.content, /Mock page/)

    assert.ok(mock.requests.some((entry) => entry.path === '/api/chat'))
    assert.ok(mock.requests.some((entry) => entry.path === '/api/web_search'))
  } finally {
    await mock.close()
  }
})
