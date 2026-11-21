import type { HostState, TransportId } from './api.ts'

export interface ManualModelDraft {
  uid: string
  id: string
  enabled: boolean
  name: string
  contextWindow: string
  maxTokens: string
  image: boolean
  thinking: boolean
  reasoningEfforts: string
  defaultReasoning: string
  tools: boolean
}

export interface ModelOverrideDraft {
  contextWindow: string
  image: '' | 'yes' | 'no'
  thinking: '' | 'yes' | 'no'
  reasoningEfforts: string
  defaultEffort: string
  enabled: '' | 'yes' | 'no'
}

export interface PriceOverrideDraft {
  input: string
  output: string
  cacheRead: string
}

export interface Draft {
  apiKeyEnv: string
  apiBase: string
  openAiBase: string
  usageUrl: string
  balanceUrl: string
  transport: TransportId
  requestTimeoutMs: string
  streamIdleTimeoutMs: string
  attemptTimeoutMs: string
  retryMaxRetries: string
  retryBaseDelayMs: string
  retryMaxDelayMs: string
  retryJitter: string
  maxOutputTokens: string
  contextWindow: string
  temperature: string
  topK: string
  topP: string
  minP: string
  seed: string
  repeatPenalty: string
  repeatLastN: string
  numCtx: string
  keepAlive: string
  stop: string
  autoRefresh: boolean
  refreshMinutes: string
  showSidebarQuota: boolean
  planLabel: string
  activeAccount: string
  accounts: Array<{ label: string; apiKeyEnv: string }>
  modelAccountRules: Array<{ pattern: string; account: string }>
  stickySession: boolean
  visibleModels: string[]
  filterModelsByPlan: boolean
  modelVisibility: Record<string, boolean>
  manualModels: ManualModelDraft[]
  modelOverrides: Record<string, ModelOverrideDraft>
  contextWindowOverrides: Record<string, string>
  priceOverrides: Record<string, PriceOverrideDraft>
  modelOrder: string[]
  showAll: boolean
  modelTransports: Record<string, TransportId | ''>
}

export interface DraftPatch {
  patch: Record<string, unknown>
  errors: Record<string, string>
}

function textOf(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function draftOf(state: HostState): Draft {
  const allIds = state.models.map((model) => model.id)
  return {
    apiKeyEnv: state.config.apiKeyEnv,
    apiBase: state.config.apiBase,
    openAiBase: state.config.openAiBase,
    usageUrl: state.config.usageUrl,
    balanceUrl: state.config.balanceUrl,
    transport: state.config.transport,
    requestTimeoutMs: String(state.config.requestTimeoutMs),
    streamIdleTimeoutMs: String(state.config.streamIdleTimeoutMs),
    attemptTimeoutMs: String(state.config.attemptTimeoutMs ?? 0),
    retryMaxRetries: String(state.config.retryMaxRetries ?? 0),
    retryBaseDelayMs: String(state.config.retryBaseDelayMs ?? 250),
    retryMaxDelayMs: String(state.config.retryMaxDelayMs ?? 2000),
    retryJitter: String(state.config.retryJitter ?? 0.2),
    maxOutputTokens: textOf(state.config.maxOutputTokens),
    contextWindow: textOf(state.config.contextWindow),
    temperature: textOf(state.config.temperature),
    topK: textOf(state.config.topK),
    topP: textOf(state.config.topP),
    minP: textOf(state.config.minP),
    seed: textOf(state.config.seed),
    repeatPenalty: textOf(state.config.repeatPenalty),
    repeatLastN: textOf(state.config.repeatLastN),
    numCtx: textOf(state.config.numCtx),
    keepAlive: state.config.keepAlive ?? '',
    stop: (state.config.stop ?? []).join(', '),
    autoRefresh: state.config.autoRefresh !== false,
    refreshMinutes: String(state.config.refreshMinutes ?? 1440),
    showSidebarQuota: state.config.showSidebarQuota,
    planLabel: state.config.planLabel,
    activeAccount: state.config.activeAccount,
    accounts: state.config.accounts.map((account) => ({ ...account })),
    modelAccountRules: state.config.modelAccountRules.map((rule) => ({ ...rule })),
    stickySession: state.config.stickySession,
    visibleModels: state.config.showAllModels ? allIds : [...state.config.visibleModels],
    filterModelsByPlan: state.config.filterModelsByPlan,
    modelVisibility: { ...state.config.modelVisibility },
    manualModels: (state.config.manualModels ?? []).map((model, index) => ({
      uid: `manual-${index}`,
      id: model.id,
      enabled: model.enabled !== false,
      name: model.name ?? '',
      contextWindow: model.contextWindow === undefined ? '' : String(model.contextWindow),
      maxTokens: model.maxTokens === undefined ? '' : String(model.maxTokens),
      image: model.image === true,
      thinking: model.thinking === true,
      reasoningEfforts: (model.reasoningEfforts ?? []).join(', '),
      defaultReasoning: model.defaultReasoning ?? '',
      tools: model.tools === true,
    })),
    modelOrder: [...(state.config.modelOrder ?? [])],
    contextWindowOverrides: Object.fromEntries(
      Object.entries(state.config.contextWindowOverrides).map(([id, value]) => [id, String(value)]),
    ),
    priceOverrides: Object.fromEntries(
      Object.entries(state.config.priceOverrides).map(([id, price]) => [id, {
        input: price.input === undefined ? '' : String(price.input),
        output: price.output === undefined ? '' : String(price.output),
        cacheRead: price.cacheRead === undefined ? '' : String(price.cacheRead),
      }]),
    ),
    modelOverrides: Object.fromEntries(
      Object.entries(state.config.modelOverrides ?? {}).map(([id, override]) => [id, {
        contextWindow: override.contextWindow === undefined ? '' : String(override.contextWindow),
        image: override.image === undefined ? '' : override.image ? 'yes' : 'no',
        thinking: override.thinking === undefined ? '' : override.thinking ? 'yes' : 'no',
        reasoningEfforts: (override.reasoningEfforts ?? []).join(', '),
        defaultEffort: override.defaultEffort ?? '',
        enabled: override.enabled === undefined ? '' : override.enabled ? 'yes' : 'no',
      }]),
    ),
    showAll: state.config.showAllModels,
    modelTransports: { ...state.config.modelTransports },
  }
}

/**
 * An empty field means "unset", never "substitute a default". The schema owns
 * the default, so an explicit null is the only value that cannot silently
 * replace what the user typed.
 */
export function numberOrNull(text: string, field = 'value'): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`)
  return value
}

function boundedNumber(
  text: string,
  min: number,
  max: number,
  integer: boolean,
  field = 'value',
): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${field} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}`)
  }
  return value
}

function stopList(text: string): string[] {
  return text.split(/[\n,]/).map((entry) => entry.trim()).filter((entry) => entry !== '')
}

export function draftPatch(draft: Draft): DraftPatch {
  const errors: Record<string, string> = {}
  const field = <T>(name: string, compute: () => T): T | null => {
    try {
      return compute()
    } catch (error) {
      errors[name] = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  const manualModels: Array<Record<string, unknown>> = []
  draft.manualModels.forEach((model, index) => {
    const id = model.id.trim()
    if (id === '') return
    const name = `manualModels[${index}]`
    try {
      const contextWindow = numberOrNull(model.contextWindow, `${name}.contextWindow`)
      const maxTokens = numberOrNull(model.maxTokens, `${name}.maxTokens`)
      manualModels.push({
        id,
        enabled: model.enabled,
        ...(model.name.trim() === '' ? {} : { name: model.name.trim() }),
        ...(contextWindow === null ? {} : { contextWindow }),
        ...(maxTokens === null ? {} : { maxTokens }),
        image: model.image,
        thinking: model.thinking,
        ...(stopList(model.reasoningEfforts).length === 0
          ? {}
          : { reasoningEfforts: stopList(model.reasoningEfforts) }),
        ...(model.defaultReasoning.trim() === '' ? {} : { defaultReasoning: model.defaultReasoning.trim() }),
        tools: model.tools,
      })
    } catch (error) {
      errors[name] = error instanceof Error ? error.message : String(error)
    }
  })

  const patch: Record<string, unknown> = {
    apiKeyEnv: draft.apiKeyEnv.trim(),
    apiBase: draft.apiBase.trim(),
    openAiBase: draft.openAiBase.trim(),
    usageUrl: draft.usageUrl.trim(),
    balanceUrl: draft.balanceUrl.trim(),
    transport: draft.transport,
    requestTimeoutMs: field('requestTimeoutMs', () => numberOrNull(draft.requestTimeoutMs, 'requestTimeoutMs')),
    streamIdleTimeoutMs: field('streamIdleTimeoutMs', () => numberOrNull(draft.streamIdleTimeoutMs, 'streamIdleTimeoutMs')),
    attemptTimeoutMs: field('attemptTimeoutMs', () => boundedNumber(draft.attemptTimeoutMs, 0, 3_600_000, true, 'attemptTimeoutMs')),
    retryMaxRetries: field('retryMaxRetries', () => boundedNumber(draft.retryMaxRetries, 0, 10, true, 'retryMaxRetries')),
    retryBaseDelayMs: field('retryBaseDelayMs', () => boundedNumber(draft.retryBaseDelayMs, 0, 60_000, true, 'retryBaseDelayMs')),
    retryMaxDelayMs: field('retryMaxDelayMs', () => boundedNumber(draft.retryMaxDelayMs, 0, 120_000, true, 'retryMaxDelayMs')),
    retryJitter: field('retryJitter', () => boundedNumber(draft.retryJitter, 0, 1, false, 'retryJitter')),
    maxOutputTokens: field('maxOutputTokens', () => numberOrNull(draft.maxOutputTokens, 'maxOutputTokens')),
    contextWindow: field('contextWindow', () => numberOrNull(draft.contextWindow, 'contextWindow')),
    temperature: field('temperature', () => boundedNumber(draft.temperature, 0, 2, false, 'temperature')),
    topK: field('topK', () => boundedNumber(draft.topK, 1, 1_000_000, true, 'topK')),
    topP: field('topP', () => boundedNumber(draft.topP, 0, 1, false, 'topP')),
    minP: field('minP', () => boundedNumber(draft.minP, 0, 1, false, 'minP')),
    seed: field('seed', () => boundedNumber(draft.seed, 0, 4_294_967_295, true, 'seed')),
    repeatPenalty: field('repeatPenalty', () => boundedNumber(draft.repeatPenalty, 0, 2, false, 'repeatPenalty')),
    repeatLastN: field('repeatLastN', () => boundedNumber(draft.repeatLastN, -1, 1_000_000, true, 'repeatLastN')),
    numCtx: field('numCtx', () => boundedNumber(draft.numCtx, 1, 10_000_000, true, 'numCtx')),
    keepAlive: draft.keepAlive.trim(),
    stop: stopList(draft.stop),
    autoRefresh: draft.autoRefresh,
    refreshMinutes: field('refreshMinutes', () => boundedNumber(draft.refreshMinutes, 0, 10_080, true, 'refreshMinutes')),
    showSidebarQuota: draft.showSidebarQuota,
    planLabel: draft.planLabel.trim(),
    activeAccount: draft.activeAccount.trim(),
    accounts: draft.accounts
      .map((account) => ({ label: account.label.trim(), apiKeyEnv: account.apiKeyEnv.trim() }))
      .filter((account) => account.label !== '' || account.apiKeyEnv !== ''),
    modelAccountRules: draft.modelAccountRules
      .map((rule) => ({ pattern: rule.pattern.trim(), account: rule.account.trim() }))
      .filter((rule) => rule.pattern !== '' && rule.account !== ''),
    stickySession: draft.stickySession,
    visibleModels: draft.showAll ? [] : draft.visibleModels,
    showAllModels: draft.showAll,
    filterModelsByPlan: draft.filterModelsByPlan,
    modelVisibility: draft.showAll
      ? draft.modelVisibility
      : Object.fromEntries(
          Object.entries(draft.modelVisibility).filter(
            ([id, val]) => val === false || draft.visibleModels.includes(id),
          ),
        ),
    manualModels,
    modelOrder: draft.modelOrder.filter((id) => id !== ''),
    contextWindowOverrides: field('contextWindowOverrides', () => Object.fromEntries(
      Object.entries(draft.contextWindowOverrides)
        .map(([id, value]) => [id, numberOrNull(value, `contextWindowOverrides.${id}`)] as const)
        .filter((entry): entry is readonly [string, number] => entry[1] !== null && entry[1] > 0),
    )) ?? {},
    priceOverrides: field('priceOverrides', () => Object.fromEntries(
      Object.entries(draft.priceOverrides)
        .map(([id, price]) => {
          const out: Record<string, number> = {}
          for (const [name, value] of Object.entries(price)) {
            const parsed = numberOrNull(value, `priceOverrides.${id}.${name}`)
            if (parsed !== null) out[name] = parsed
          }
          return [id, out] as const
        })
        .filter((entry) => Object.keys(entry[1]).length > 0),
    )) ?? {},
    modelOverrides: field('modelOverrides', () => Object.fromEntries(
      Object.entries(draft.modelOverrides)
        .map(([id, override]) => {
          const contextWindow = numberOrNull(override.contextWindow, `modelOverrides.${id}.contextWindow`)
          const efforts = stopList(override.reasoningEfforts)
          const out: Record<string, unknown> = {
            ...(contextWindow === null || contextWindow <= 0 ? {} : { contextWindow }),
            ...(override.image === '' ? {} : { image: override.image === 'yes' }),
            ...(override.thinking === '' ? {} : { thinking: override.thinking === 'yes' }),
            ...(efforts.length === 0 ? {} : { reasoningEfforts: efforts }),
            ...(override.defaultEffort.trim() === '' ? {} : { defaultEffort: override.defaultEffort.trim() }),
            ...(override.enabled === '' ? {} : { enabled: override.enabled === 'yes' }),
          }
          return [id, out] as const
        })
        .filter((entry) => Object.keys(entry[1]).length > 0),
    )) ?? {},
    modelTransports: Object.fromEntries(
      Object.entries(draft.modelTransports).filter(([, value]) => value !== ''),
    ),
  }

  return { patch, errors }
}

export function patchOf(draft: Draft): Record<string, unknown> {
  const { patch, errors } = draftPatch(draft)
  const first = Object.values(errors)[0]
  if (first !== undefined) throw new Error(first)
  return patch
}

export function same(a: Draft, b: Draft): boolean {
  return JSON.stringify(patchOf(a)) === JSON.stringify(patchOf(b))
}

export function safeSame(a: Draft, b: Draft): boolean {
  try {
    return same(a, b)
  } catch {
    return false
  }
}

/** Refresh may keep an unsaved draft, but a config save replaces it. */
export function mergeLoadedDraft(current: Draft | null, next: Draft, preserve: boolean): Draft {
  return preserve && current !== null ? current : next
}
