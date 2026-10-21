import assert from 'node:assert/strict'
import test from 'node:test'

import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

import { clearCatalogCache, effectiveModel, refreshCatalog, sortForPicker } from '../src/catalog.ts'
import { DEFAULT_API_BASE, DEFAULT_OPENAI_BASE, resolveConfig } from '../src/config.ts'
import { classifyResponseError } from '../src/errors.ts'
import { buildChatBody, buildNativeBody, buildNativeMessages } from '../src/messages.ts'
import { estimateCost, priceFor } from '../src/pricing.ts'

const config = resolveConfig({ apiKey: 'test-key' })

test('resolved config carries Ollama defaults', () => {
  assert.equal(config.apiBase, DEFAULT_API_BASE)
  assert.equal(config.openAiBase, DEFAULT_OPENAI_BASE)
  assert.equal(config.transport, 'native')
  assert.equal(config.apiKeyEnv, 'OLLAMA_API_KEY')
  assert.equal(config.maxOutputTokens, undefined)
  const zero = resolveConfig({ maxOutputTokens: 0, transport: 'openai-chat' })
  assert.equal(zero.maxOutputTokens, 0)
  assert.equal(zero.transport, 'openai-chat')
})

test('catalog merges live metadata, capabilities and visibility', async () => {
  clearCatalogCache()
  const models = {
    object: 'list',
    data: [{ id: 'gpt-oss:120b' }, { id: 'hidden:1b' }],
    models: [
      {
        slug: 'gpt-oss:120b',
        display_name: 'GPT OSS',
        context_window: 131_072,
        input_modalities: ['text'],
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }],
        default_reasoning_level: 'medium',
        visibility: 'list',
        supported_in_api: true,
      },
      {
        slug: 'hidden:1b',
        display_name: 'Hidden',
        context_window: 32_768,
        input_modalities: ['text', 'image'],
        visibility: 'hide',
        supported_in_api: false,
      },
    ],
  }
  const tags = {
    models: [
      { name: 'gpt-oss:120b', capabilities: ['completion', 'tools', 'thinking'] },
    ],
  }
  const fakeFetch = (async (input: string | URL | Request) => {
    const href = String(input)
    return new Response(JSON.stringify(href.includes('/api/tags') ? tags : models), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const ids = await refreshCatalog(config, fakeFetch, true)
  assert.ok(ids.includes('gpt-oss:120b'))
  const meta = effectiveModel('gpt-oss:120b', config)
  assert.equal(meta.contextWindow, 131_072)
  assert.deepEqual(meta.reasoning, ['low', 'medium'])
  assert.equal(meta.defaultReasoning, 'medium')
  assert.equal(meta.tools, true)
  assert.deepEqual(meta.input, ['text'])
  assert.deepEqual(sortForPicker(ids, config), ['gpt-oss:120b'])
  assert.deepEqual(effectiveModel('hidden:1b', config).input, ['text', 'image'])
  assert.deepEqual(sortForPicker(ids, config, true).length, 2)
})

test('HTTP failures map to the harness taxonomy', () => {
  const headers = new Headers()
  assert.equal(classifyResponseError(401, '{"error":"invalid credentials"}', headers).code, 'INVALID_CREDENTIAL')
  assert.equal(classifyResponseError(404, '{"error":"model not found"}', headers).code, 'UNSUPPORTED_MODEL')
  assert.equal(classifyResponseError(402, '{"error":"payment required"}', headers).code, 'QUOTA')
  assert.equal(
    classifyResponseError(403, '{"error":"insufficient credits for this model"}', headers).code,
    'QUOTA',
  )
  assert.equal(classifyResponseError(500, '{"error":"boom"}', headers).code, 'SERVER')
  const limited = classifyResponseError(429, '{"error":"slow down"}', new Headers({ 'retry-after': '12' }))
  assert.equal(limited.code, 'RATE_LIMIT')
  assert.equal((limited.failure as { providerRetryAfterMs?: number }).providerRetryAfterMs, 12_000)
})

test('native body maps tools, thinking and output cap', () => {
  const options: GenerateOptions = {
    provider: 'ollama-cloud',
    model: 'gpt-oss:120b',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'text', text: ' there' },
        ],
      },
    ],
    tools: [{
      name: 'read',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    }],
    reasoningEffort: 'high' as never,
    maxTokens: 100,
  }
  const body = buildNativeBody(options, effectiveModel(options.model, config), config) as Record<string, unknown>
  assert.equal(body.model, 'gpt-oss:120b')
  assert.equal(body.stream, true)
  assert.equal(body.think, 'high')
  assert.deepEqual((body.options as Record<string, unknown>).num_predict, 100)
  const tools = body.tools as Array<{ function: { name: string } }>
  assert.equal(tools[0]?.function.name, 'read')
  const messages = body.messages as Array<{ role: string; content: string }>
  assert.equal(messages[0]?.role, 'user')
  assert.equal(messages[0]?.content, 'hi there')
})

test('tool results carry the tool name back to the native API', () => {
  const options = {
    provider: 'ollama-cloud',
    model: 'gpt-oss:120b',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'read it' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', id: 'c1', name: 'read', arguments: '{"path":"a"}' }],
      },
      { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'body' }] },
    ],
  } as unknown as GenerateOptions
  const messages = buildNativeMessages(options)
  const assistant = messages.find((message) => message.role === 'assistant')
  assert.deepEqual(assistant?.tool_calls?.[0]?.function.arguments, { path: 'a' })
  const result = messages.find((message) => message.role === 'tool')
  assert.equal(result?.tool_name, 'read')
})

test('OpenAI body uses reasoning_effort and max_tokens', () => {
  const options: GenerateOptions = {
    provider: 'ollama-cloud',
    model: 'gpt-oss:120b',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    reasoningEffort: 'off' as never,
    maxTokens: 64,
  }
  const body = buildChatBody(options, effectiveModel(options.model, config), config) as Record<string, unknown>
  assert.equal(body.reasoning_effort, 'none')
  assert.equal(body.max_tokens, 64)
  assert.deepEqual(body.stream_options, { include_usage: true })
})

test('pricing resolves exact ids, base tags and off-peak rates', () => {
  assert.equal(priceFor('gpt-oss:120b').input, 0.15)
  assert.equal(priceFor('gpt-oss').priced, true)
  assert.equal(priceFor('unknown-model').priced, false)
  assert.equal(priceFor('beam').free, true)

  const weekend = Date.UTC(2026, 9, 17, 10, 0, 0)
  const offPeak = estimateCost({
    model: 'deepseek-v4.1-flash',
    inputTokens: 1_000_000,
    outputTokens: 0,
    at: weekend,
  })
  assert.equal(offPeak.offPeak, true)
  assert.ok(Math.abs(offPeak.usd - 0.15) < 1e-9)
  const peak = estimateCost({
    model: 'deepseek-v4.1-flash',
    inputTokens: 1_000_000,
    outputTokens: 0,
    at: Date.UTC(2026, 9, 14, 14, 0, 0),
  })
  assert.equal(peak.offPeak, false)
  assert.ok(Math.abs(peak.usd - 0.30) < 1e-9)
})
