export interface AttemptBudget {
  readonly signal: AbortSignal
  readonly timedOut: boolean
  readonly callerAborted: boolean
  dispose(): void
}

export interface BudgetView {
  readonly signal: AbortSignal
  timedOut: boolean
  callerAborted: boolean
  dispose(): void
}

/** One abort/timeout budget for one attempt; callers create a fresh one per retry. */
export function createAttemptBudget(timeoutMs: number | undefined, caller?: AbortSignal): BudgetView {
  const controller = new AbortController()
  const budget: BudgetView = {
    signal: controller.signal,
    timedOut: false,
    callerAborted: caller?.aborted === true,
    dispose: () => {},
  }
  const onAbort = (): void => {
    budget.callerAborted = true
    controller.abort(caller?.reason)
  }
  caller?.addEventListener('abort', onAbort, { once: true })
  if (caller?.aborted === true) controller.abort(caller.reason)
  const timer = timeoutMs !== undefined && timeoutMs > 0
    ? setTimeout(() => {
        budget.timedOut = true
        controller.abort()
      }, timeoutMs)
    : undefined
  budget.dispose = () => {
    if (timer !== undefined) clearTimeout(timer)
    caller?.removeEventListener('abort', onAbort)
  }
  return budget
}
