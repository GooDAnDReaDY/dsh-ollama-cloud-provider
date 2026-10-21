import { LlmError } from '@deepseek-ai/dsh-llm'

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted === true) throw signal.reason
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      action()
    }
    const timer = setTimeout(() => {
      reader.cancel().catch(() => {})
      finish(() => reject(new LlmError(
        `Ollama Cloud stream went idle for ${idleTimeoutMs}ms`,
        'TIMEOUT',
      )))
    }, idleTimeoutMs)
    timer.unref?.()
    const onAbort = () => {
      reader.cancel().catch(() => {})
      finish(() => reject(signal?.reason ?? new DOMException('aborted', 'AbortError')))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    reader.read().then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

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
      const result = await readWithIdleTimeout(reader, idleTimeoutMs, signal)
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
      for (;;) {
        const boundary = buffer.indexOf('\n')
        if (boundary < 0) break
        const line = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + 1)
        if (line === '') continue
        const parsed = JSON.parse(line) as unknown
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          yield parsed as Record<string, unknown>
        }
      }
    }
    const tail = buffer.trim()
    if (tail !== '') {
      const parsed = JSON.parse(tail) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        yield parsed as Record<string, unknown>
      }
    }
  } finally {
    reader.releaseLock()
  }
}
