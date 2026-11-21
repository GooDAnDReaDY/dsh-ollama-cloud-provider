export interface CatalogSchedulerConfig {
  autoRefresh: boolean
  refreshMinutes: number
}

export interface CatalogSchedulerOptions {
  current: () => CatalogSchedulerConfig
  refresh: () => void | Promise<unknown>
  now?: () => number
  tickMs?: number
  onError?: (error: unknown) => void
}

export interface CatalogScheduler {
  check(): void
  dispose(): void
}

/**
 * The single owner of periodic catalog refresh. It re-reads the live settings on
 * every tick, so changing `autoRefresh` or `refreshMinutes` applies without a
 * restart, and it never runs two refreshes for the same due moment.
 */
export function createCatalogScheduler(options: CatalogSchedulerOptions): CatalogScheduler {
  const now = options.now ?? Date.now
  let last = now()
  const check = (): void => {
    try {
      const config = options.current()
      if (!config.autoRefresh) return
      const minutes = Math.floor(config.refreshMinutes)
      if (!Number.isFinite(minutes) || minutes <= 0) return
      const at = now()
      if (at - last < minutes * 60_000) return
      last = at
      const result = options.refresh()
      if (result !== undefined) {
        void Promise.resolve(result).catch((error: unknown) => options.onError?.(error))
      }
    } catch (error) {
      options.onError?.(error)
    }
  }
  const timer = setInterval(check, options.tickMs ?? 60_000)
  timer.unref?.()
  return {
    check,
    dispose: () => clearInterval(timer),
  }
}
