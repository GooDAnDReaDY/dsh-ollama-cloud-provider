import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

import { OllamaCloudAdapter } from '../src/adapter.ts'
import { resolveConfig } from '../src/config.ts'

function paths(): { cooldownPath: string; stickyPath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ollama-adapter-'))
  return {
    cooldownPath: join(directory, 'cooldowns.json'),
    stickyPath: join(directory, 'sticky.json'),
  }
}

function ndjson(lines: string[]): Response {
  return new Response(lines.join('\n'), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const options: GenerateOptions = {
  provider: 'ollama-cloud',
  model: 'gpt-oss:120b',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
}

test('native stream emits thinking, text, usage and finish', async () => {
  const fetchImpl = (async () => ndjson([
    '{"message":{"role":"assistant","content":"","thinking":"plan"},"done":false}',
    '{"message":{"role":"assistant","content":"Hi"},"done":false}',
    '{"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":10,"prompt_eval_cached_count":2,"eval_count":3}',
  ])) as typeof fetch
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'k' }),
    resolveKey: async () => ({ key: 'k', source: 'test' }),
    fetchImpl,
    ...paths(),
  })
  const chunks = await collect(adapter.stream(options))
  assert.ok(chunks.some((chunk) => chunk.type === 'reasoning-delta' && chunk.text === 'plan'))
  assert.ok(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === 'Hi'))
  const usage = chunks.find((chunk) => chunk.type === 'usage')
  assert.deepEqual(usage, {
    type: 'usage',
    usage: { inputTokens: 8, outputTokens: 3, totalTokens: 13, cacheReadTokens: 2 },
  })
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('native stream assembles complete tool calls', async () => {
  const fetchImpl = (async () => ndjson([
    '{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"read","arguments":{"path":"a"}}}]},"done":false}',
    '{"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop"}',
  ])) as typeof fetch
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'k' }),
    resolveKey: async () => ({ key: 'k', source: 'test' }),
    fetchImpl,
    ...paths(),
  })
  const chunks = await collect(adapter.stream(options))
  const end = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
  assert.equal(end?.type === 'block-end' && end.block.type === 'tool-call' ? end.block.name : '', 'read')
  assert.equal(
    end?.type === 'block-end' && end.block.type === 'tool-call' ? end.block.arguments : '',
    '{"path":"a"}',
  )
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } })
})

test('an invalid key rotates to the next account before streaming', async () => {
  let calls = 0
  const fetchImpl = (async () => {
    calls += 1
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'invalid credentials' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    return ndjson([
      '{"message":{"role":"assistant","content":"OK"},"done":true,"done_reason":"stop"}',
    ])
  }) as typeof fetch
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'bad' }),
    resolveKey: async () => ({ key: 'bad', source: 'test' }),
    resolveKeys: async () => [
      { key: 'bad', source: 'first', label: 'first' },
      { key: 'good', source: 'second', label: 'second' },
    ],
    fetchImpl,
    ...paths(),
  })
  const chunks = await collect(adapter.stream(options))
  assert.ok(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === 'OK'))
  assert.equal(calls, 2)
  assert.equal(adapter.accountHealth('bad')?.reason, 'invalid-credential')
  assert.equal(adapter.accountHealth('good'), undefined)
  const trace = adapter.routingTrace()
  assert.equal(trace[0]?.account, 'second')
})

test('OpenAI-compatible stream parses reasoning and usage', async () => {
  const body = [
    'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}',
    'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}',
    'data: {"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
    'data: [DONE]',
    '',
  ].join('\n\n')
  const fetchImpl = (async () => new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })) as typeof fetch
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'k', transport: 'openai-chat' }),
    resolveKey: async () => ({ key: 'k', source: 'test' }),
    fetchImpl,
    ...paths(),
  })
  const chunks = await collect(adapter.stream(options))
  assert.ok(chunks.some((chunk) => chunk.type === 'reasoning-delta' && chunk.text === 'think'))
  assert.ok(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === 'Hi'))
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('a single-account transport error does not create a cooldown', async () => {
  const fetchImpl = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'k' }),
    resolveKey: async () => ({ key: 'only', source: 'test' }),
    fetchImpl,
    ...paths(),
  })
  await assert.rejects(async () => {
    for await (const _chunk of adapter.stream(options)) {
      // Consume the stream so the adapter runs to its error path.
    }
  }, /fetch failed/)
  assert.equal(adapter.accountHealth('only'), undefined)
})

test('a single-account credential rejection still cools the key', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ error: 'invalid credentials' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'k' }),
    resolveKey: async () => ({ key: 'only', source: 'test' }),
    fetchImpl,
    ...paths(),
  })
  await assert.rejects(async () => {
    for await (const _chunk of adapter.stream(options)) {
      // Consume the stream so the adapter runs to its error path.
    }
  })
  assert.equal(adapter.accountHealth('only')?.reason, 'invalid-credential')
})

test('resolveModel does not advertise an unimplemented tool projection', async () => {
  const adapter = new OllamaCloudAdapter({
    config: () => resolveConfig({ apiKey: 'k' }),
    resolveKey: async () => ({ key: 'k', source: 'test' }),
    ...paths(),
  })
  const resolved = await adapter.resolveModel('ollama-cloud', 'gpt-oss:120b')
  assert.equal('toolUpdate' in resolved, false)
})
