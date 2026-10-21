/**
 * Host-side load smoke test: imports the built plugin, runs `apply()` against a
 * minimal cordis-like context, and exercises the adapter's live catalog.
 *
 *   node scripts/smoke-load.mjs
 */
import assert from 'node:assert/strict'

import { apply, name, inject, OllamaCloudAdapter, Config, effectiveModel, resolveConfig } from '../lib/index.js'

assert.equal(name, 'llm-ollama-cloud')
assert.deepEqual(inject, ['llm'])
assert.ok(Config !== undefined)

const calls = []
const ctx = {
  llm: {
    registerConfigurableProviders: (providers) => calls.push(['providers', providers]),
    registerAdapter: (ids, adapter) => calls.push(['adapter', ids, adapter]),
  },
  inject: (deps) => calls.push(['inject', deps]),
  effect: (fn) => {
    calls.push(['effect'])
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  },
  logger: () => ({ info: () => {}, warn: () => {} }),
  get: () => undefined,
}

apply(ctx, { apiKeyEnv: 'OLLAMA_API_KEY' })

const providers = calls.find(([kind]) => kind === 'providers')?.[1]
assert.deepEqual(providers, [{
  provider: 'ollama-cloud',
  displayName: 'Ollama Cloud',
  settingsNs: 'llm-ollama-cloud',
  settingsPath: [],
  defaultBaseURL: 'https://ollama.com',
}])
const registration = calls.find(([kind]) => kind === 'adapter')
assert.deepEqual(registration?.[1], ['ollama-cloud'])
assert.ok(registration?.[2] instanceof OllamaCloudAdapter)

const config = resolveConfig({ apiKey: 'smoke' })
assert.equal(effectiveModel('gpt-oss:120b', config).transport, 'native')

const adapter = new OllamaCloudAdapter({
  config: () => config,
  resolveKey: async () => ({ key: 'smoke', source: 'smoke' }),
})
const models = await adapter.listModels('ollama-cloud', { unfiltered: true })
console.log(`live catalog through adapter: ${models.length} models`)
console.log(models.slice(0, 5).map((model) => `${model.id} — ${model.description}`).join('\n'))
assert.ok(models.length >= 20)
assert.ok(models.some((model) => model.id === 'gpt-oss:120b'))

const resolved = await adapter.resolveModel('ollama-cloud', 'gpt-oss:120b')
assert.equal(resolved.context?.contextWindow, 131_072)
assert.ok((resolved.reasoning?.efforts.length ?? 0) >= 2)
console.log('resolveModel:', JSON.stringify({
  context: resolved.context,
  efforts: resolved.reasoning?.efforts.map((effort) => effort.id),
  defaultEffort: resolved.reasoning?.defaultEffort,
  input: resolved.inputModalities,
}))

console.log('smoke-load: OK')
