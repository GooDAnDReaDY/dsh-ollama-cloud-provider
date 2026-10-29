import type { ResolvedConfig } from './config.ts'
import { tagsUrlFor } from './routing.ts'

export interface ServiceStatus {
  ok: boolean
  status: number | null
  latencyMs: number
  checkedAt: string
  error?: string
}

const PROBE_TIMEOUT_MS = 5_000

/**
 * Probe the public Ollama Cloud tag endpoint. This request carries no key and
 * does not consume quota; it only answers whether the configured API base is
 * reachable from this host.
 */
export async function probeService(
  config: ResolvedConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceStatus> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetchImpl(tagsUrlFor(config), {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    const latencyMs = Date.now() - started
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      checkedAt: new Date().toISOString(),
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      error: controller.signal.aborted
        ? 'timeout'
        : error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
