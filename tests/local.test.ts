import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { OllamaCloudAdapter } from '../src/adapter.ts'
import { clearCatalogCache, effectiveModel, refreshCatalog } from '../src/catalog.ts'
import { resolveConfig } from '../src/config.ts'
import { createKeyPool } from '../src/credentials.ts'
import { clearModelProbeCache, isLocalEndpoint, modelProbeCacheInfo, probeModel } from '../src/model-probe.ts'
import { createUsageReader } from '../src/usage.ts'
import { startMockOllama } from './mock-ollama.ts'

test('explicit empty apiKeyEnv means no authentication', async () => {
  const config = resolveConfig({ apiKeyEnv: '' })
  assert.equal(config.apiKeyEnv, '')
  const pool = createKeyPool({ get: () => undefined } as never, () => config)
  const keys = await pool.resolveAll('ollama-cloud')
  assert.deepEqual(keys.map((entry) => entry.key), [''])
  assert.equal(isLocalEndpoint(resolveConfig({ apiKeyEnv: '', apiBase: 'http://127.0.0.1:11434' })), true)
  assert.equal(isLocalEndpoint(resolveConfig({ apiKeyEnv: 'k', apiBase: 'https://ollama.com' })), false)
})

test('local adapter sends no Authorization header and streams a reply', async () => {
  const mock = await startMockOllama()
  const home = await mkdtemp(join(tmpdir(), 'dsh-ollama-local-'))
  try {
    const config = resolveConfig({
      apiKeyEnv: '',
      apiBase: mock.url,
      openAiBase: `${mock.url}/v1`,
      requestTimeoutMs: 5000,
      streamIdleTimeoutMs: 5000,
    })
    const adapter = new OllamaCloudAdapter({
      config: () => config,
      resolveKey: async () => ({ key: '', source: 'none', label: 'default' }),
      resolveKeys: async () => [{ key: '', source: 'none', label: 'default' }],
      cooldownPath: join(home, 'cooldowns.json'),
      stickyPath: join(home, 'sticky.json'),
      recordRequest: () => {},
    })
    const chunks = []
    for await (const chunk of adapter.stream({
      provider: 'ollama-cloud',
      model: 'gpt-oss:120b',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })) chunks.push(chunk)
    assert.ok(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === 'mock '))
    const chat = mock.requests.find((entry) => entry.path === '/api/chat')
    assert.equal(chat?.headers.authorization, undefined)
  } finally {
    await mock.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('local catalog enriches models through /api/show and caches probes', async () => {
  const mock = await startMockOllama()
  try {
    clearCatalogCache()
    clearModelProbeCache()
    const config = resolveConfig({ apiKeyEnv: '', apiBase: mock.url })
    const ids = await refreshCatalog(config, fetch, true)
    assert.ok(ids.includes('gpt-oss:120b'))
    const meta = effectiveModel('gpt-oss:120b', config)
    assert.equal(meta.contextWindow, 131072)
    assert.deepEqual(meta.input, ['text', 'image'])
    assert.equal(meta.tools, true)
    assert.equal(meta.reasoningToggle, true)

    const firstCount = mock.requests.filter((entry) => entry.path === '/api/show').length
    const probe = await probeModel(config, 'gpt-oss:120b')
    assert.equal(probe?.contextWindow, 131072)
    assert.equal(mock.requests.filter((entry) => entry.path === '/api/show').length, firstCount)
    assert.ok(modelProbeCacheInfo().some((entry) => entry.model === 'gpt-oss:120b'))

    clearModelProbeCache()
    await probeModel(config, 'gpt-oss:120b')
    assert.equal(mock.requests.filter((entry) => entry.path === '/api/show').length, firstCount + 1)
  } finally {
    await mock.close()
  }
})

test('usage reader does not hit the network without a key', async () => {
  let calls = 0
  const config = resolveConfig({ apiKeyEnv: '' })
  const reader = createUsageReader(
    () => config,
    async () => ({ key: '', source: 'none' }),
    (async () => {
      calls += 1
      return new Response('{}', { status: 200 })
    }) as typeof fetch,
  )
  const result = await reader.read()
  assert.equal(calls, 0)
  assert.ok(result?.error !== undefined)
})
