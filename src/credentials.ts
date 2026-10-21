import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { LlmError } from '@deepseek-ai/dsh-llm'

import type { ResolvedConfig } from './config.ts'
import { bestEffortFailed } from './best-effort.ts'

export interface ResolvedKey {
  readonly key: string
  readonly source: string
  /** Slot label (`default` or the configured account name). */
  readonly label?: string
}

export type KeyResolver = (provider: string) => Promise<ResolvedKey>

export interface KeyPool {
  resolve(provider: string): Promise<ResolvedKey>
  resolveAll(provider: string): Promise<readonly ResolvedKey[]>
}

interface CredentialsService {
  resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string; source?: string } | undefined>
}

interface Slot {
  readonly label: string
  readonly literal?: string
  readonly refName?: string
}

async function resolveRef(ctx: Context, refName: string): Promise<ResolvedKey | undefined> {
  const credentials = ctx.get('credentials') as CredentialsService | undefined
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(credentialRef(refName))
      if (hit !== undefined && hit.value.trim() !== '') {
        return { key: hit.value.trim(), source: hit.source ?? refName }
      }
    } catch (error) {
      // An invalid reference name is a configuration problem, not a storage miss.
      bestEffortFailed('credential reference is invalid', error)
    }
  }
  const ambient = launchEnvironmentOf(ctx).get(refName)
  if (ambient !== undefined && ambient.value.trim() !== '') {
    return { key: ambient.value.trim(), source: ambient.source }
  }
  return undefined
}

function slotsOf(config: ResolvedConfig): Slot[] {
  const slots: Slot[] = [{
    label: 'default',
    ...(config.apiKey === undefined ? {} : { literal: config.apiKey }),
    refName: config.apiKeyEnv,
  }]
  for (const [index, account] of config.accounts.entries()) {
    const label = typeof account.label === 'string' && account.label.trim() !== ''
      ? account.label.trim()
      : `account-${index + 2}`
    const literal = typeof account.apiKey === 'string' && account.apiKey.trim() !== ''
      ? account.apiKey.trim()
      : undefined
    const refName = typeof account.apiKeyEnv === 'string' && account.apiKeyEnv.trim() !== ''
      ? account.apiKeyEnv.trim()
      : undefined
    if (literal === undefined && refName === undefined) continue
    slots.push({
      label,
      ...(literal === undefined ? {} : { literal }),
      ...(refName === undefined ? {} : { refName }),
    })
  }
  return slots
}

async function resolveSlot(ctx: Context, slot: Slot): Promise<ResolvedKey | undefined> {
  if (slot.literal !== undefined) {
    return { key: slot.literal, source: `${slot.label}:config.apiKey`, label: slot.label }
  }
  if (slot.refName !== undefined) {
    const resolved = await resolveRef(ctx, slot.refName)
    if (resolved !== undefined) return { ...resolved, label: slot.label }
  }
  return undefined
}

/**
 * Resolve every configured account for one request. The default account comes
 * first unless `activeAccount` pins another slot by label or credential name.
 * Keys are deduplicated; a slot without a resolvable value is skipped.
 */
export function createKeyPool(ctx: Context, config: () => ResolvedConfig): KeyPool {
  const all = async (): Promise<readonly ResolvedKey[]> => {
    const current = config()
    const pinned = current.activeAccount.trim()
    const slots = slotsOf(current)
    if (pinned !== '') {
      const index = slots.findIndex((slot) => slot.label === pinned || slot.refName === pinned)
      if (index > 0) {
        const [slot] = slots.splice(index, 1)
        if (slot !== undefined) slots.unshift(slot)
      }
    }

    const resolved: ResolvedKey[] = []
    const seen = new Set<string>()
    for (const slot of slots) {
      const key = await resolveSlot(ctx, slot)
      if (key === undefined || seen.has(key.key)) continue
      seen.add(key.key)
      resolved.push(key)
    }
    return resolved
  }

  return {
    async resolveAll() {
      const keys = await all()
      if (keys.length === 0) throw missingKey(config())
      return keys
    },
    async resolve() {
      const keys = await all()
      const first = keys[0]
      if (first === undefined) throw missingKey(config())
      return first
    },
  }
}

function missingKey(config: ResolvedConfig): LlmError {
  return new LlmError(
    `llm-ollama-cloud: no API key. Store ${config.apiKeyEnv} through the credentials`
    + ' service, export it in the launching environment, or set config.apiKey in the'
    + ' composition. Create a key at https://ollama.com/settings/keys.',
    'MISSING_CREDENTIAL',
  )
}

/** Backwards-compatible single-key facade over the pool. */
export function createKeyResolver(ctx: Context, config: () => ResolvedConfig): KeyResolver {
  return createKeyPool(ctx, config).resolve
}
