import type { ManualModel, ModelOverride, ModelPriceOverride, TransportId } from './config.ts'
import {
  booleanRecord,
  modelOverrideRecord,
  numberRecord,
  priceRecord,
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
  if (!Array.isArray(value)) return []
  const out: Array<{ pattern: string; account: string }> = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const pattern = typeof record.pattern === 'string' ? record.pattern.trim() : ''
    const account = typeof record.account === 'string' ? record.account.trim() : ''
    if (pattern === '' || account === '') continue
    out.push({ pattern, account })
  }
  return out
}

export function cleanManualModels(value: unknown): ManualModel[] {
  if (!Array.isArray(value)) return []
  const out: ManualModel[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (id === '' || id.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id)) continue
    const efforts = Array.isArray(record.reasoningEfforts)
      ? record.reasoningEfforts.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : undefined
    const thinking = typeof record.thinking === 'boolean' ? record.thinking : undefined
    const normalizedEfforts = thinking === true && (efforts === undefined || efforts.length === 0)
      ? ['off', 'high']
      : thinking === false ? [] : efforts
    out.push({
      id,
      enabled: record.enabled !== false,
      ...(typeof record.name === 'string' && record.name.trim() !== '' ? { name: record.name.trim() } : {}),
      ...(typeof record.contextWindow === 'number' && Number.isInteger(record.contextWindow) && record.contextWindow > 0
        ? { contextWindow: record.contextWindow }
        : {}),
      ...(typeof record.maxTokens === 'number' && Number.isInteger(record.maxTokens) && record.maxTokens > 0
        ? { maxTokens: record.maxTokens }
        : {}),
      ...(typeof record.image === 'boolean' ? { image: record.image } : {}),
      ...(thinking === undefined ? {} : { thinking }),
      ...(normalizedEfforts === undefined ? {} : { reasoningEfforts: normalizedEfforts }),
      ...(typeof record.defaultReasoning === 'string' && record.defaultReasoning.trim() !== ''
        ? { defaultReasoning: record.defaultReasoning.trim() }
        : {}),
      ...(typeof record.tools === 'boolean' ? { tools: record.tools } : {}),
    })
  }
  return out
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
