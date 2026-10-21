/**
 * One place for deliberately ignored failures. Every call names what was
 * skipped; when a host logger is registered the label and message go to debug
 * instead of disappearing.
 */
export interface BestEffortLogger {
  debug?: (message: string) => void
}

let sink: BestEffortLogger | undefined

export function setBestEffortLogger(logger: BestEffortLogger | undefined): void {
  sink = logger
}

export function bestEffortFailed(label: string, error: unknown): void {
  try {
    sink?.debug?.(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  } catch {
    // Logging must never break the caller.
  }
}
