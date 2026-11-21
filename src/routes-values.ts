import type { ManualModel, ModelOverride, ModelPriceOverride, TransportId } from './config.ts'
import {
  booleanRecord,
  manualModelList,
  modelOverrideRecord,
  numberRecord,
  priceRecord,
  ruleList,
  transportRecord,
} from './config.ts'
import { accountLabel } from './credentials.ts'

const CREDENTIAL_REF_PATTERN = /^OLLAMA_[A-Z0-9_]+$/

/** The plugin may read and write only its own credential namespace. */
export function normalizeCredentialRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const ref = value.trim()
  return CREDENTIAL_REF_PATTERN.test(ref) ? ref : undefined
}

export function isCredentialRef(value: unknown): value is string {
  return normalizeCredentialRef(value) !== undefined
}

export function cleanAccounts(value: unknown): Array<{ label: string; apiKeyEnv: string }> {
  if (!Array.isArray(value)) return []
  const out: Array<{ label: string; apiKeyEnv: string }> = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    const apiKeyEnv = typeof record.apiKeyEnv === 'string' ? record.apiKeyEnv.trim() : ''
    if (label === '' && apiKeyEnv === '') continue
    out.push({ label: accountLabel(label, out.length), apiKeyEnv })
  }
  return out
}

export function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : []
}

export function cleanModelAccountRules(value: unknown): Array<{ pattern: string; account: string }> {
  return ruleList(value)
}

export function cleanManualModels(value: unknown): ManualModel[] {
  return manualModelList(value)
}

export function cleanModelOverrides(value: unknown): Record<string, ModelOverride> {
  return modelOverrideRecord(value)
}

export function cleanBooleanRecord(value: unknown): Record<string, boolean> {
  return booleanRecord(value)
}

export function cleanNumberRecord(value: unknown): Record<string, number> {
  return numberRecord(value)
}

export function cleanTransports(value: unknown): Record<string, TransportId> {
  return transportRecord(value)
}

export function cleanPrices(value: unknown): Record<string, ModelPriceOverride> {
  return priceRecord(value)
}
