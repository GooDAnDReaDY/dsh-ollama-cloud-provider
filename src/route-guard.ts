export type RouteGate = 'ok' | 'busy' | 'rate'

export interface RouteGuard {
  begin(): RouteGate
  end(): void
}

/**
 * Serialises one expensive route: at most one request in flight, and no more
 * than one start per `minIntervalMs`.
 */
export function createRouteGuard(
  minIntervalMs: number,
  now: () => number = Date.now,
): RouteGuard {
  let last = Number.NEGATIVE_INFINITY
  let inflight = false
  return {
    begin(): RouteGate {
      if (inflight) return 'busy'
      const at = now()
      if (at - last < minIntervalMs) return 'rate'
      last = at
      inflight = true
      return 'ok'
    },
    end(): void {
      inflight = false
    },
  }
}
