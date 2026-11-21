export interface RetryPolicy {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
  readonly jitter: number
}

export function retryPolicy(value: {
  retryMaxRetries?: number
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
  retryJitter?: number
}): RetryPolicy {
  const integer = (number: unknown, fallback: number): number =>
    typeof number === 'number' && Number.isInteger(number) && number >= 0 ? number : fallback
  const jitter = typeof value.retryJitter === 'number' && value.retryJitter >= 0 && value.retryJitter <= 1
    ? value.retryJitter
    : 0.2
  const baseDelayMs = integer(value.retryBaseDelayMs, 250)
  return {
    maxRetries: integer(value.retryMaxRetries, 0),
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, integer(value.retryMaxDelayMs, 2000)),
    jitter,
  }
}

export function retryDelay(attempt: number, policy: RetryPolicy, random = Math.random): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt)
  const capped = Math.min(policy.maxDelayMs, exponential)
  const spread = capped * policy.jitter
  return Math.max(0, Math.round(capped - spread + random() * spread * 2))
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}
