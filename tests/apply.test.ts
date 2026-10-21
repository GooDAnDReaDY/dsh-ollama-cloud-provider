import assert from 'node:assert/strict'
import test from 'node:test'

import { OllamaCloudAdapter } from '../src/adapter.ts'
import { apply, Config, name, inject } from '../src/index.ts'

test('apply registers the provider, the adapter and the expected seams', () => {
  const calls: Array<[string, unknown]> = []
  const disposers: Array<() => void> = []
  const ctx = {
    llm: {
      registerConfigurableProviders: (providers: unknown) => {
        calls.push(['providers', providers])
        return () => {}
      },
      registerAdapter: (providers: unknown, adapter: unknown) => {
        calls.push(['adapter', [providers, adapter]])
        return () => {}
      },
    },
    inject: (deps: unknown) => { calls.push(['inject', deps]) },
    effect: (fn: () => unknown) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return () => {}
    },
    logger: () => ({ info: () => {}, debug: () => {}, warn: () => {} }),
    get: () => undefined,
  } as never

  apply(ctx, { apiKeyEnv: 'OLLAMA_API_KEY' })

  assert.equal(name, 'llm-ollama-cloud')
  assert.deepEqual(inject, ['llm'])
  assert.ok(Config !== undefined)

  const providers = calls.find(([kind]) => kind === 'providers')?.[1]
  assert.deepEqual(providers, [{
    provider: 'ollama-cloud',
    displayName: 'Ollama Cloud',
    settingsNs: 'llm-ollama-cloud',
    settingsPath: [],
    defaultBaseURL: 'https://ollama.com',
  }])

  const registration = calls.find(([kind]) => kind === 'adapter')?.[1] as [string[], unknown] | undefined
  assert.deepEqual(registration?.[0], ['ollama-cloud'])
  assert.ok(registration?.[1] instanceof OllamaCloudAdapter)

  const seams = calls.filter(([kind]) => kind === 'inject').map(([, deps]) => deps)
  assert.ok(seams.some((deps) => Array.isArray(deps) && deps.includes('settings')))
  assert.ok(seams.some((deps) => Array.isArray(deps) && deps.includes('commands')))
  assert.ok(seams.some((deps) => Array.isArray(deps) && deps.includes('webServer')))
  assert.ok(disposers.length >= 1)

  for (const dispose of disposers) dispose()
})
