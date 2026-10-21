import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCommands } from '../src/commands.ts'
import { resolveConfig } from '../src/config.ts'

const config = resolveConfig({ apiKey: 'key' })

function deps(): Parameters<typeof applyCommands>[1] {
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
      stream: async function* () {},
    },
  } as unknown as Parameters<typeof applyCommands>[1]
}

function registered(): { handler: (invocation: { rawInput: string }) => Promise<{ kind: string; text: string }> } {
  let definition: { handler: (invocation: { rawInput: string }) => Promise<{ kind: string; text: string }> } | undefined
  const ctx = {
    commands: {
      register: (value: typeof definition) => { definition = value },
    },
  } as never
  applyCommands(ctx, deps())
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

test('unknown command returns an error with the accepted verbs', async () => {
  const result = await registered().handler({ rawInput: 'bogus' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /Unknown \/ollama argument/)
})
