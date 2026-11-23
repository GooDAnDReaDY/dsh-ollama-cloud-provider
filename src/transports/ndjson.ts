import { LlmError } from '@deepseek-ai/dsh-llm'

import { bestEffortFailed } from '../best-effort.ts'
import { readWithIdleTimeout } from './stream-reader.ts'

const MAX_FRAME_BYTES = 1_000_000

/**
 * Yield parsed NDJSON objects from a `/api/chat` stream. Ollama uses one JSON
 * object per line, with no `data:` prefix, and a final `{done:true}` line.
 */
export async function* ndjsonObjects(
  body: ReadableStream<Uint8Array>,
  idleTimeoutMs: number,
  signal: AbortSignal | undefined,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const result = await readWithIdleTimeout(reader, idleTimeoutMs, signal, 'ndjson')
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
      if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES) {
        throw new LlmError('Ollama Cloud sent an oversized stream frame', 'MALFORMED_RESPONSE')
      }
      for (;;) {
        const boundary = buffer.indexOf('\n')
        if (boundary < 0) break
        const line = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + 1)
        if (line === '') continue
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch (error) {
          bestEffortFailed('ndjson line parse failed', error)
          continue
        }
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          yield parsed as Record<string, unknown>
        }
      }
    }
    const tail = buffer.trim()
    if (tail !== '') {
      let parsed: unknown
      try {
        parsed = JSON.parse(tail)
      } catch (error) {
        bestEffortFailed('ndjson tail parse failed', error)
      }
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        yield parsed as Record<string, unknown>
      }
    }
  } finally {
    await reader.cancel().catch((err: unknown) => bestEffortFailed('ndjson:cancel', err))
    try {
      reader.releaseLock()
    } catch (error) {
      bestEffortFailed('ndjson:release', error)
    }
  }
}