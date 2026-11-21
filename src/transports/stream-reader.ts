import { LlmError } from '@deepseek-ai/dsh-llm'

import { bestEffortFailed } from '../best-effort.ts'

/** Read one stream chunk, rejecting with TIMEOUT or AbortError instead of hanging. */
export async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  signal: AbortSignal | undefined,
  label: string,
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
      finish(() => reject(new LlmError(
        `Ollama Cloud stream went idle for ${idleTimeoutMs}ms`,
        'TIMEOUT',
      )))
      void reader.cancel().catch((err: unknown) => bestEffortFailed(`${label}:cancel`, err))
    }, idleTimeoutMs)
    timer.unref?.()
    const onAbort = () => {
      finish(() => reject(signal?.reason ?? new DOMException('aborted', 'AbortError')))
      void reader.cancel().catch((err: unknown) => bestEffortFailed(`${label}:cancel`, err))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    reader.read().then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}
