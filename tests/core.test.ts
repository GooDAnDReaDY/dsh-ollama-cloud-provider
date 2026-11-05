import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { CONTEXT_WINDOW_EXCEEDED_CODE, type GenerateOptions } from '@deepseek-ai/dsh-llm'

import { clearCatalogCache, effectiveModel, modelVisible, refreshCatalog, sortForPicker } from '../src/catalog.ts'
import { DEFAULT_API_BASE, DEFAULT_OPENAI_BASE, resolveConfig } from '../src/config.ts'
import { classifyResponseError } from '../src/errors.ts'
import { buildChatBody, buildNativeBody, buildNativeMessages } from '../src/messages.ts'
import { estimateCost, priceFor } from '../src/pricing.ts'

const coreHome = await mkdtemp(join(tmpdir(), 'dsh-ollama-core-home-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = coreHome
test.after(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(coreHome, { recursive: true, force: true })
})

const config = resolveConfig({ apiKey: 'test-key' })

test('resolved config carries Ollama defaults', () => {
  assert.equal(config.apiBase, DEFAULT_API_BASE)
  assert.equal(config.openAiBase, DEFAULT_OPENAI_BASE)
  assert.equal(config.transport, 'native')
  assert.equal(config.apiKeyEnv, 'OLLAMA_API_KEY')
  assert.equal(config.maxOutputTokens, undefined)
  assert.equal(config.autoRefresh, true)
  assert.equal(config.refreshMinutes, 1440)
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

test('live catalog metadata is scoped to its API base and cleared', async () => {
  const baseA = resolveConfig({ apiKey: 'k', apiBase: 'https://catalog-a.example' })
  const baseB = resolveConfig({ apiKey: 'k', apiBase: 'https://catalog-b.example' })
  const fakeFetch = (async (input: string | URL | Request) => {
    const href = String(input)
    const isA = href.includes('catalog-a.example')
    const models = href.includes('/api/tags')
      ? { models: [] }
      : {
          models: [{
            slug: 'shared:1b',
            display_name: 'Shared',
            context_window: isA ? 2048 : 8192,
            visibility: 'list',
            supported_in_api: true,
          }],
        }
    return new Response(JSON.stringify(models), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  clearCatalogCache()
  await refreshCatalog(baseA, fakeFetch, true)
  await refreshCatalog(baseB, fakeFetch, true)
  assert.equal(effectiveModel('shared:1b', baseA).contextWindow, 2048)
  assert.equal(effectiveModel('shared:1b', baseB).contextWindow, 8192)

  clearCatalogCache()
  assert.notEqual(effectiveModel('shared:1b', baseA).contextWindow, 2048)
})

test('a later catalog response removes disappeared live models', async () => {
  const scope = resolveConfig({ apiKey: 'k', apiBase: 'https://catalog-prune.example' })
  let call = 0
  const fakeFetch = (async (input: string | URL | Request) => {
    const href = String(input)
    if (href.includes('/api/tags')) {
      return new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    call += 1
    const slug = call === 1 ? 'first:1b' : 'second:1b'
    return new Response(JSON.stringify({
      models: [{ slug, display_name: slug, context_window: 4096, visibility: 'list', supported_in_api: true }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  clearCatalogCache()
  await refreshCatalog(scope, fakeFetch, true)
  assert.equal(effectiveModel('first:1b', scope).contextWindow, 4096)
  await refreshCatalog(scope, fakeFetch, true)
  assert.notEqual(effectiveModel('first:1b', scope).contextWindow, 4096)
  assert.equal(effectiveModel('second:1b', scope).contextWindow, 4096)
})

test('explicit empty visibility means none while legacy empty means all', () => {
  assert.equal(modelVisible('x', resolveConfig({ visibleModels: [] })), true)
  assert.equal(modelVisible('x', resolveConfig({ visibleModels: [], showAllModels: false })), false)
  assert.equal(modelVisible('x', resolveConfig({ visibleModels: ['y'], showAllModels: false })), false)
  assert.equal(modelVisible('y', resolveConfig({ visibleModels: ['y'], showAllModels: false })), true)
  assert.equal(modelVisible('x', resolveConfig({ visibleModels: [], showAllModels: true })), true)
})

test('serves a stale catalog immediately and refreshes it in the background', async () => {
  const staleConfig = resolveConfig({ apiKey: 'test-key', apiBase: 'https://catalog-stale.example' })
  clearCatalogCache()
  let modelCalls = 0
  const fakeFetch = (async (input: string | URL | Request) => {
    const href = String(input)
    if (href.includes('/api/tags')) {
      return new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    modelCalls += 1
    const id = modelCalls === 1 ? 'first:1b' : 'second:1b'
    return new Response(JSON.stringify({
      models: [{ slug: id, display_name: id, context_window: 1024, visibility: 'list', supported_in_api: true }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const first = await refreshCatalog(staleConfig, fakeFetch, true)
  assert.deepEqual(first, ['first:1b'])

  const date = Date as unknown as { now: () => number }
  const realNow = date.now
  const base = realNow()
  date.now = () => base + 11 * 60 * 1000
  try {
    const stale = await refreshCatalog(staleConfig, fakeFetch)
    assert.deepEqual(stale, ['first:1b'])
    for (let i = 0; i < 100 && modelCalls < 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(modelCalls, 2)

    let fresh: readonly string[] = []
    for (let i = 0; i < 50; i += 1) {
      fresh = await refreshCatalog(staleConfig, fakeFetch)
      if (fresh[0] === 'second:1b') break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.deepEqual(fresh, ['second:1b'])
  } finally {
    date.now = realNow
    clearCatalogCache()
  }
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
  assert.equal(
    classifyResponseError(400, '{"error":"context length exceeded"}', headers).code,
    CONTEXT_WINDOW_EXCEEDED_CODE,
  )
  assert.equal(
    classifyResponseError(400, '{"error":"this model does not support images"}', headers).code,
    'UNSUPPORTED_MODEL',
  )
  const tooLarge = classifyResponseError(413, '{"error":"request body too large"}', headers)
  assert.equal(tooLarge.code, 'PROVIDER_HTTP_ERROR')
  assert.match(tooLarge.message, /too large/i)
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

test('generation defaults merge into native and OpenAI bodies with request precedence', () => {
  const tuned = resolveConfig({
    apiKey: 'k',
    temperature: 0.7,
    topK: 40,
    topP: 0.9,
    minP: 0.05,
    seed: 42,
    repeatPenalty: 1.1,
    repeatLastN: 64,
    numCtx: 8192,
    keepAlive: '5m',
    stop: ['END'],
  })
  const base: GenerateOptions = {
    provider: 'ollama-cloud',
    model: 'gpt-oss:120b',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  }
  const native = buildNativeBody(base, effectiveModel(base.model, tuned), tuned) as {
    keep_alive?: string
    options?: Record<string, unknown>
  }
  assert.equal(native.keep_alive, '5m')
  assert.deepEqual(native.options, {
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9,
    min_p: 0.05,
    seed: 42,
    repeat_penalty: 1.1,
    repeat_last_n: 64,
    num_ctx: 8192,
    num_predict: 32768,
    stop: ['END'],
  })

  const overridden = buildNativeBody(
    { ...base, temperature: 0.2, stop: ['STOP'] },
    effectiveModel(base.model, tuned),
    tuned,
  ) as { options?: Record<string, unknown> }
  assert.equal(overridden.options?.temperature, 0.2)
  assert.deepEqual(overridden.options?.stop, ['STOP'])

  const openai = buildChatBody(base, effectiveModel(base.model, tuned), tuned) as Record<string, unknown>
  assert.equal(openai.temperature, 0.7)
  assert.equal(openai.top_p, 0.9)
  assert.equal(openai.seed, 42)
  assert.deepEqual(openai.stop, ['END'])
  assert.equal('top_k' in openai, false)
  assert.equal('keep_alive' in openai, false)
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

test('per-field price overrides win in peak and off-peak estimates', () => {
  const weekend = Date.UTC(2026, 9, 17, 10, 0, 0)
  const overriddenInput = estimateCost({
    model: 'deepseek-v4.1-flash',
    inputTokens: 1_000_000,
    outputTokens: 0,
    at: weekend,
    priceOverrides: { 'deepseek-v4.1-flash': { input: 999 } },
  })
  assert.equal(overriddenInput.offPeak, true)
  assert.equal(overriddenInput.usd, 999)

  const overriddenOutput = estimateCost({
    model: 'deepseek-v4.1-flash',
    inputTokens: 0,
    outputTokens: 1_000_000,
    at: weekend,
    priceOverrides: { 'deepseek-v4.1-flash': { output: 999 } },
  })
  assert.equal(overriddenOutput.usd, 999)
})
