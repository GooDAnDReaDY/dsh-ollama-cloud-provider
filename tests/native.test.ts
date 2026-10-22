import assert from 'node:assert/strict'
import test from 'node:test'

import { parseNativeStream } from '../src/transports/native.ts'

const encoder = new TextEncoder()

function bodyOf(lines: string[], cancel?: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`))
      controller.close()
    },
    cancel() {
      cancel?.()
    },
  })
}

async function collect(
  lines: string[],
  idleTimeoutMs = 1000,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const chunks: unknown[] = []
  for await (const chunk of parseNativeStream(new Response(bodyOf(lines)), idleTimeoutMs, signal)) {
    chunks.push(chunk)
  }
  return chunks
}

test('parses text, counters and finish from a native stream', async () => {
  const chunks = await collect([
    '{"message":{"content":"Hel"}}',
    '{"message":{"content":"lo"},"done":true,"done_reason":"stop","prompt_eval_count":10,"eval_count":2}',
  ])
  assert.deepEqual(chunks, [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Hel' },
    { type: 'text-delta', index: 0, text: 'lo' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
})

test('parses thinking before text', async () => {
  const chunks = await collect([
    '{"message":{"thinking":"plan"}}',
    '{"message":{"content":"OK"},"done":true}',
  ])
  assert.deepEqual(chunks, [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: 'plan' },
    { type: 'block-start', index: 1, blockType: 'text' },
    { type: 'text-delta', index: 1, text: 'OK' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'plan' } },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'OK' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
})

test('parses tool calls with object arguments', async () => {
  const chunks = await collect([
    '{"message":{"tool_calls":[{"function":{"name":"read","arguments":{"path":"a.txt"}}}]},"done":true}',
  ]) as Array<Record<string, unknown>>
  assert.deepEqual(chunks[0], { type: 'block-start', index: 0, blockType: 'tool-call' })
  assert.deepEqual(chunks[1], {
    type: 'tool-call-delta',
    index: 0,
    id: 'call_0',
    name: 'read',
    argumentsDelta: '{"path":"a.txt"}',
  })
  assert.deepEqual(chunks[2], {
    type: 'block-end',
    index: 0,
    block: { type: 'tool-call', id: 'call_0', name: 'read', arguments: '{"path":"a.txt"}' },
  })
  assert.deepEqual(chunks[3], { type: 'finish', reason: { kind: 'tool-calls' } })
})

test('rejects an in-band quota error', async () => {
  await assert.rejects(
    collect(['{"error":"quota exceeded"}']),
    /quota is exhausted/i,
  )
})

test('rejects an already-aborted stream', async () => {
  const controller = new AbortController()
  controller.abort(new Error('stop now'))
  await assert.rejects(
    collect(['{"message":{"content":"x"}}'], 1000, controller.signal),
    /stop now/,
  )
})

test('rejects an idle stream and cancels the reader', async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(encoder.encode('{"message":{}}\n'))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(async () => {
    for await (const _ of parseNativeStream(new Response(body), 20, undefined)) {
      // Drain until the idle timer fires.
    }
  }, /went idle for 20ms/)
  assert.equal(cancelled, true)
})

test('propagates an abrupt stream error', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.error(new Error('socket closed'))
    },
  })
  await assert.rejects(async () => {
    for await (const _ of parseNativeStream(new Response(body), 1000, undefined)) {
      // Drain until the reader rejects.
    }
  }, /socket closed/)
})

test('rejects an empty stream', async () => {
  await assert.rejects(collect([]), /empty stream/i)
})
