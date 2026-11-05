import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCommands } from '../src/commands.ts'
import { resolveConfig } from '../src/config.ts'
import { startMockOllama } from './mock-ollama.ts'

const config = resolveConfig({ apiKey: 'key' })

function deps(
  stream: (options: unknown) => AsyncGenerator<{ type: string; text?: string; reason?: unknown }> = async function* () {},
): Parameters<typeof applyCommands>[1] {
  return {
    config: () => config,
    pool: {
      resolveAll: async () => [{ key: 'key', source: 'env', label: 'default' }],
      resolve: async () => ({ key: 'key', source: 'env', label: 'default' }),
    },
    usage: Object.assign(async () => ({ report: undefined, checkedAt: 0 }), {
      read: async () => ({ report: undefined, error: 'no report', checkedAt: 0 }),
      usage: async () => ({ report: undefined, error: 'no report', checkedAt: 0 }),
      clear: () => {},
    }),
    adapter: {
      listModels: async () => [{
        provider: 'ollama-cloud',
        id: 'gpt-oss:120b',
        name: 'gpt-oss:120b',
        description: '',
        inputModalities: ['text'],
      }],
      accountHealth: () => undefined,
      routingTrace: () => [],
      stream,
    },
  } as unknown as Parameters<typeof applyCommands>[1]
}

function registered(
  stream?: (options: unknown) => AsyncGenerator<{ type: string; text?: string; reason?: unknown }>,
  source: Parameters<typeof applyCommands>[1] = deps(stream),
): { handler: (invocation: { rawInput: string }) => Promise<{ kind: string; text: string }> } {
  let definition: { handler: (invocation: { rawInput: string }) => Promise<{ kind: string; text: string }> } | undefined
  const ctx = {
    commands: {
      register: (value: typeof definition) => { definition = value },
    },
  } as never
  applyCommands(ctx, source)
  assert.ok(definition !== undefined)
  return definition
}

test('rules command lists the configured account rules', async () => {
  const result = await registered().handler({ rawInput: 'rules' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /No model → account rules/)
})

test('models command lists catalog entries', async () => {
  const result = await registered().handler({ rawInput: 'models' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /gpt-oss:120b/)
})

test('test command rejects a reasoning-only reply', async () => {
  let options: { reasoningEffort?: unknown; maxTokens?: number } | undefined
  const stream = async function* (seen: unknown) {
    options = seen as { reasoningEffort?: unknown; maxTokens?: number }
    yield { type: 'reasoning-delta', text: 'thinking only' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const result = await registered(stream).handler({ rawInput: 'test gpt-oss:120b' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /empty reply/)
  assert.equal(options?.maxTokens, 64)
})

test('test command accepts a text reply', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: 'OK' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const result = await registered(stream).handler({ rawInput: 'test gpt-oss:120b' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /OK/)
})

test('unknown command returns an error with the accepted verbs', async () => {
  const result = await registered().handler({ rawInput: 'bogus' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /Unknown \/ollama argument/)
})

test('local command lists models and requires --yes for removal', async () => {
  const mock = await startMockOllama()
  try {
    const local = deps()
    ;(local as { config: () => ReturnType<typeof resolveConfig> }).config =
      () => resolveConfig({ apiKeyEnv: '', apiBase: mock.url })
    const handler = registered(undefined, local)

    const list = await handler.handler({ rawInput: 'local models' })
    assert.equal(list.kind, 'success')
    assert.match(list.text, /gpt-oss:120b/)
    assert.match(list.text, /RUNNING/)

    const denied = await handler.handler({ rawInput: 'local remove llama3.2:3b' })
    assert.equal(denied.kind, 'error')
    assert.match(denied.text, /--yes/)

    const removed = await handler.handler({ rawInput: 'local remove llama3.2:3b --yes' })
    assert.equal(removed.kind, 'success')
    assert.match(removed.text, /removed/)
  } finally {
    await mock.close()
  }
})
