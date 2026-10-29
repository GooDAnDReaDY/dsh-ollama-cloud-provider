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

/**
 * Await a rejection while keeping the test event loop referenced.
 *
 * `readWithIdleTimeout` in `src/transports/ndjson.ts` deliberately calls
 * `timer.unref()` for the idle timeout: an abandoned Ollama stream must never
 * keep a real DSH process alive. Inside `node --test` that same unref'd timer
 * leaves the test process without a referenced handle while a `reader.read()`
 * promise is pending, so the runner can finish the file before the timer fires
 * and report `cancelledByParent` ("Promise resolution is still pending but the
 * event loop has already resolved").
 *
 * The interval below is intentionally referenced: it holds the loop open until
 * the rejection lands. The guard timer turns a rejection that never arrives
 * into a readable failure instead of a hung or cancelled test. Both handles are
 * cleared in `finally`, so the production `unref` stays untouched and the test
 * never leaks handles into the shared runner.
 */
async function rejectsWithin(
  action: () => Promise<unknown>,
  pattern: RegExp,
  timeoutMs = 2000,
): Promise<void> {
  const keepAlive = setInterval(() => {}, 5)
  let guard: ReturnType<typeof setTimeout> | undefined
  try {
    await assert.rejects(async () => {
      const timeout = new Promise<never>((_resolve, reject) => {
        guard = setTimeout(() => {
          reject(new Error(`the awaited rejection did not settle within ${timeoutMs}ms`))
        }, timeoutMs)
      })
      await Promise.race([Promise.resolve().then(action), timeout])
    }, pattern)
  } finally {
    clearTimeout(guard)
    clearInterval(keepAlive)
  }
}

/** Poll a flag so an assertion never races a stream's cancel callback. */
async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return predicate()
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
  await rejectsWithin(
    () => collect(['{"error":"quota exceeded"}']),
    /quota is exhausted/i,
  )
})

test('rejects an already-aborted stream', async () => {
  const controller = new AbortController()
  controller.abort(new Error('stop now'))
  await rejectsWithin(
    () => collect(['{"message":{"content":"x"}}'], 1000, controller.signal),
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
  await rejectsWithin(async () => {
    for await (const _ of parseNativeStream(new Response(body), 20, undefined)) {
      // Drain until the idle timer fires.
    }
  }, /went idle for 20ms/)
  assert.equal(await waitUntil(() => cancelled), true, 'the idle timeout must cancel the reader')
})

test('propagates an abrupt stream error', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.error(new Error('socket closed'))
    },
  })
  await rejectsWithin(async () => {
    for await (const _ of parseNativeStream(new Response(body), 1000, undefined)) {
      // Drain until the reader rejects.
    }
  }, /socket closed/)
})

test('rejects an empty stream', async () => {
  await rejectsWithin(() => collect([]), /empty stream/i)
})
