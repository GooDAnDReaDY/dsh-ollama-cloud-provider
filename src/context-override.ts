import type { ResolvedConfig } from './config.ts'

export type ContextOverride = number | 'follow'

const overrides = new Map<string, ContextOverride>()

function sessionKey(sessionId: unknown): string {
  return sessionId === undefined || sessionId === null ? '' : String(sessionId)
}

export function setContextOverride(sessionId: unknown, value: ContextOverride): void {
  overrides.set(sessionKey(sessionId), value)
}

export function clearContextOverride(sessionId: unknown): void {
  overrides.delete(sessionKey(sessionId))
}

export function contextOverrideFor(sessionId: unknown): ContextOverride | undefined {
  return overrides.get(sessionKey(sessionId))
}

/** Session value wins; `follow` and an unset value use the configured num_ctx. */
export function effectiveNumCtx(config: ResolvedConfig, sessionId: unknown): number | undefined {
  const override = contextOverrideFor(sessionId)
  return typeof override === 'number' ? override : config.numCtx
}

export function parseContextValue(raw: string): ContextOverride | 'reset' | undefined {
  const value = raw.trim().toLowerCase()
  if (value === '' || value === 'status') return undefined
  if (value === 'follow') return 'follow'
  if (value === 'reset') return 'reset'
  const match = /^(\d+)(k|m)?$/.exec(value)
  if (match === null) return undefined
  const base = Number(match[1])
  const multiplier = match[2] === 'k' ? 1024 : match[2] === 'm' ? 1024 * 1024 : 1
  const number = base * multiplier
  if (!Number.isInteger(number) || number < 1024 || number > 10_000_000) return undefined
  return number
}

export function describeContext(config: ResolvedConfig, sessionId: unknown): string {
  const override = contextOverrideFor(sessionId)
  const effective = effectiveNumCtx(config, sessionId)
  const state = override === undefined
    ? 'unset'
    : override === 'follow' ? 'follow' : `${override} tokens`
  return `Context: session=${state}, effective=${effective === undefined ? 'model default' : `${effective} tokens`}`
}
