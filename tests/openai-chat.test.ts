import assert from 'node:assert/strict'
import test from 'node:test'

import type { StreamChunk } from '@deepseek-ai/dsh-llm'

import { parseChatStream } from '../src/transports/openai-chat.ts'

function responseOf(events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function chunkedResponse(chunks: Uint8Array[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function splitBytes(text: string): Uint8Array[] {
  const bytes = new TextEncoder().encode(text)
  return Array.from(bytes, (byte) => Uint8Array.of(byte))
}

async function collectResponse(response: Response): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of parseChatStream(response, 1000, undefined)) chunks.push(chunk)
  return chunks
}

async function collect(events: string[]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of parseChatStream(responseOf(events), 1000, undefined)) chunks.push(chunk)
  return chunks
}

test('closes a complete SSE response on finish_reason and DONE', async () => {
  const chunks = await collect([
    '{"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}',
    '[DONE]',
  ])
  assert.ok(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === 'Hi'))
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('accepts DONE without an explicit finish_reason', async () => {
  const chunks = await collect([
    '{"choices":[{"delta":{"content":"Hi"}}]}',
    '[DONE]',
  ])
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('rejects EOF before DONE after text without emitting finish', async () => {
  await assert.rejects(
    collect(['{"choices":[{"delta":{"content":"partial"}}]}']),
    /ended before \[DONE\]/i,
  )
})

test('rejects EOF before DONE after a tool call', async () => {
  await assert.rejects(
    collect([
      '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"read","arguments":"{"}}]}}]}',
    ]),
    /ended before \[DONE\]/i,
  )
})

test('rejects malformed SSE JSON instead of skipping it', async () => {
  await assert.rejects(
    collect(['{bad']),
    /invalid SSE event/i,
  )
})

test('normalizes CRLF split between chunks and splits UTF-8 safely', async () => {
  const text = 'data: {"choices":[{"delta":{"content":"Привет 世界"}}]}\r\n\r\n'
    + 'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\r\n\r\n'
    + 'data: [DONE]\r\n\r\n'
  const chunks = await collectResponse(chunkedResponse(splitBytes(text)))
  const content = chunks
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => chunk.type === 'text-delta' ? chunk.text : '')
    .join('')
  assert.equal(content, 'Привет 世界!')
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})
