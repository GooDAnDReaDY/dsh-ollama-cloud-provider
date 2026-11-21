import assert from 'node:assert/strict'
import test from 'node:test'

import { WebError } from '@deepseek-ai/dsh-web'

import {
  decodeFetchResponse,
  decodeSearchResponse,
  MAX_FETCH_CHARS,
  MAX_SEARCH_RESULTS,
  OllamaWebFetchProvider,
  OllamaWebSearchProvider,
} from '../src/web.ts'
import { startMockOllama } from './mock-ollama.ts'

test('decodes search sources and drops entries without a URL', () => {
  const result = decodeSearchResponse({
    results: [
      { url: 'https://a.example/x', title: 'A', content: 'snippet a' },
      { title: 'no url' },
      { url: '', content: 'empty url' },
      { url: 'https://b.example/y', content: 'snippet b' },
    ],
  })
  assert.deepEqual(result, {
    sources: [
      { url: 'https://a.example/x', title: 'A', snippet: 'snippet a' },
      { url: 'https://b.example/y', snippet: 'snippet b' },
    ],
    truncated: false,
  })
  assert.throws(() => decodeSearchResponse({ nope: true }), /results/)
  assert.deepEqual(decodeFetchResponse({ content: '# title\n\nbody' }), {
    content: '# title\n\nbody',
    truncated: false,
  })
  const large = decodeFetchResponse({ content: 'x'.repeat(MAX_FETCH_CHARS + 1) })
  assert.equal(large.truncated, true)
  assert.equal(large.content.length, MAX_FETCH_CHARS)
})

test('web providers call the mock Ollama endpoints with bounded results', async () => {
  const mock = await startMockOllama()
  try {
    const options = {
      baseURL: () => mock.url,
      resolveApiKey: async () => 'test-key',
    }
    const search = new OllamaWebSearchProvider(options)
    const fetchProvider = new OllamaWebFetchProvider(options)

    const result = await search.search({ query: 'ollama', maxResults: 50 })
    assert.equal(result.sources.length, 2)
    const searchRequest = mock.requests.find((entry) => entry.path === '/api/web_search')
    assert.deepEqual(searchRequest?.body, { query: 'ollama', max_results: MAX_SEARCH_RESULTS })

    const page = await fetchProvider.fetch({ url: 'https://example.com/page' })
    assert.deepEqual(page, {
      url: 'https://example.com/page',
      statusCode: 200,
      body: { kind: 'text', content: '# Mock page\n\nFetched body.' },
      truncated: false,
    })
  } finally {
    await mock.close()
  }
})

test('web providers fail closed without a key and with redirects/HTTP errors', async () => {
  const noKey = new OllamaWebSearchProvider({
    baseURL: () => 'https://ollama.com',
    resolveApiKey: async () => undefined,
  })
  await assert.rejects(noKey.search({ query: 'q' }), (error: unknown) => {
    assert.ok(error instanceof WebError)
    assert.equal(error.code, 'OLLAMA_WEB_MISSING_CREDENTIAL')
    return true
  })

  const redirect = new OllamaWebSearchProvider({
    baseURL: () => 'https://ollama.com',
    resolveApiKey: async () => 'k',
    fetch: async () => { throw new TypeError('redirect mode is error') },
  })
  await assert.rejects(redirect.search({ query: 'q' }), /redirect/i)

  const httpError = new OllamaWebSearchProvider({
    baseURL: () => 'https://ollama.com',
    resolveApiKey: async () => 'k',
    fetch: async () => new Response(JSON.stringify({ error: 'nope' }), { status: 401 }),
  })
  await assert.rejects(httpError.search({ query: 'q' }), /401/)
})

test('web providers retry one pre-response transport failure', async () => {
  let calls = 0
  const provider = new OllamaWebSearchProvider({
    baseURL: () => 'https://ollama.com',
    resolveApiKey: async () => 'k',
    fetch: async () => {
      calls += 1
      if (calls === 1) throw new TypeError('fetch failed')
      return new Response(JSON.stringify({ results: [{ url: 'https://a.example' }] }), { status: 200 })
    },
  })
  const result = await provider.search({ query: 'q' })
  assert.equal(calls, 2)
  assert.equal(result.sources[0]?.url, 'https://a.example')
})

test('web provider availability only checks the configured URL', () => {
  const provider = new OllamaWebSearchProvider({
    baseURL: () => 'not a url',
    resolveApiKey: async () => 'k',
  })
  assert.equal(provider.available(), false)
  assert.equal(provider.id, 'ollama-cloud')
})

test('web fetch provider rejects non-HTTP URLs and unparseable URLs (#115)', async () => {
  const provider = new OllamaWebFetchProvider({
    baseURL: () => 'https://ollama.com',
    resolveApiKey: async () => 'k',
  })
  await assert.rejects(
    provider.fetch({ url: 'file:///etc/passwd' }),
    (error: unknown) => {
      assert.ok(error instanceof WebError)
      assert.equal(error.code, 'UNSUPPORTED_PROTOCOL')
      return true
    },
  )
  await assert.rejects(
    provider.fetch({ url: 'ftp://ftp.example/file.txt' }),
    (error: unknown) => {
      assert.ok(error instanceof WebError)
      assert.equal(error.code, 'UNSUPPORTED_PROTOCOL')
      return true
    },
  )
  await assert.rejects(
    provider.fetch({ url: 'not-a-valid-url' }),
    (error: unknown) => {
      assert.ok(error instanceof WebError)
      assert.equal(error.code, 'INVALID_URL')
      return true
    },
  )
})
