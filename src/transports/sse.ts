import { LlmError } from '@deepseek-ai/dsh-llm'

import { bestEffortFailed } from '../best-effort.ts'
import { readWithIdleTimeout } from './stream-reader.ts'

const MAX_FRAME_BYTES = 1_000_000

/** Yield the `data:` payload of every SSE event, honoring cancellation and idle timeouts. */
export async function* sseData(
  body: ReadableStream<Uint8Array>,
  idleTimeoutMs: number,
  signal: AbortSignal | undefined,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const result = await readWithIdleTimeout(reader, idleTimeoutMs, signal, 'sse')
      if (result.done) break
      buffer = (buffer + decoder.decode(result.value, { stream: true })).replace(/\r\n/g, '\n')
      if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES) {
        throw new LlmError('Ollama Cloud sent an oversized stream event', 'MALFORMED_RESPONSE')
      }
      for (;;) {
        const boundary = buffer.indexOf('\n\n')
        if (boundary < 0) break
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data !== '') yield data
      }
    }
    const tail = buffer.trim()
    if (tail !== '') {
      const data = tail
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data !== '') yield data
    }
  } finally {
    await reader.cancel().catch((err: unknown) => bestEffortFailed('sse:cancel', err))
    try {
      reader.releaseLock()
    } catch (error) {
      bestEffortFailed('sse:release', error)
    }
  }
}