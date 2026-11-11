/**
 * One place for deliberately ignored failures. Every call names what was
 * skipped; when a host logger is registered the label and message go to debug
 * instead of disappearing.
 */
import { redactText } from './sanitize.ts'

export interface BestEffortLogger {
  debug?: (message: string) => void
  warn?: (message: string) => void
}

let sink: BestEffortLogger | undefined

export function setBestEffortLogger(logger: BestEffortLogger | undefined): void {
  sink = logger
}

export function bestEffortFailed(label: string, error: unknown): void {
  try {
    const message = `${label}: ${redactText(error instanceof Error ? error.message : String(error))}`
    sink?.warn ? sink.warn(message) : sink?.debug?.(message)
  } catch (caught) {
    // Logging must never break the caller.
    void caught
  }
}

export async function bestEffort<T>(
  label: string,
  action: () => Promise<T> | T,
  fallback?: T,
): Promise<T | undefined> {
  try {
    return await action()
  } catch (err) {
    bestEffortFailed(label, err)
    return fallback
  }
}
