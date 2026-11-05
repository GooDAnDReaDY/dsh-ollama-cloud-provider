import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCommands } from '../src/commands.ts'
import { resolveConfig } from '../src/config.ts'

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
  return command('ollama', source)
}

function command(
  name: string,
  source: Parameters<typeof applyCommands>[1] = deps(),
): { handler: (invocation: { rawInput: string; agent?: { id: string } }) => Promise<{ kind: string; text: string }> } {
  let definitions: Map<string, { handler: (invocation: { rawInput: string; agent?: { id: string } }) => Promise<{ kind: string; text: string }> }> | undefined = new Map()
  const ctx = {
    commands: {
      register: (value: { name: string; handler: (invocation: { rawInput: string; agent?: { id: string } }) => Promise<{ kind: string; text: string }> }) => {
        definitions?.set(value.name, value)
      },
    },
  } as never
  applyCommands(ctx, source)
  const definition = definitions?.get(name)
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

test('context command applies presets per session and follows config', async () => {
  const source = deps()
  ;(source as { config: () => ReturnType<typeof resolveConfig> }).config =
    () => resolveConfig({ apiKey: 'key', numCtx: 8192 })
  const handler = command('ollama-context', source)

  const preset = await handler.handler({ rawInput: '16k', agent: { id: 'session-a' } })
  assert.equal(preset.kind, 'success')
  assert.match(preset.text, /16384 tokens/)
  const isolated = await handler.handler({ rawInput: 'status', agent: { id: 'session-b' } })
  assert.match(isolated.text, /session=unset/)
  assert.match(isolated.text, /effective=8192 tokens/)

  const follow = await handler.handler({ rawInput: 'follow', agent: { id: 'session-a' } })
  assert.match(follow.text, /session=follow/)
  assert.match(follow.text, /effective=8192 tokens/)
  const reset = await handler.handler({ rawInput: 'reset', agent: { id: 'session-a' } })
  assert.match(reset.text, /Session override cleared/)
  const invalid = await handler.handler({ rawInput: 'nonsense', agent: { id: 'session-a' } })
  assert.equal(invalid.kind, 'error')
})
