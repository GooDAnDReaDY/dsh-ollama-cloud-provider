import type { ManualModel, ModelPriceOverride, ResolvedConfig, TransportId } from './config.ts'

export interface PublicConfig {
  apiKeyEnv: string
  apiBase: string
  openAiBase: string
  usageUrl: string
  balanceUrl: string
  transport: TransportId
  modelTransports: Readonly<Record<string, TransportId>>
  requestTimeoutMs: number
  streamIdleTimeoutMs: number
  attemptTimeoutMs: number
  visibleModels: readonly string[]
  showAllModels: boolean
  modelVisibility: Readonly<Record<string, boolean>>
  manualModels: readonly ManualModel[]
  modelOrder: readonly string[]
  filterModelsByPlan: boolean
  contextWindow: number | null
  contextWindowOverrides: Readonly<Record<string, number>>
  maxOutputTokens: number | null
  temperature: number | null
  topK: number | null
  topP: number | null
  minP: number | null
  seed: number | null
  repeatPenalty: number | null
  repeatLastN: number | null
  numCtx: number | null
  keepAlive: string
  stop: readonly string[]
  autoRefresh: boolean
  refreshMinutes: number
  accounts: ReadonlyArray<{ label: string; apiKeyEnv: string }>
  modelAccountRules: ReadonlyArray<{ pattern: string; account: string }>
  stickySession: boolean
  activeAccount: string
  showSidebarQuota: boolean
  planLabel: string
  priceOverrides: Readonly<Record<string, ModelPriceOverride>>
  userAgent: string
}

export function publicConfig(config: ResolvedConfig): PublicConfig {
  return {
    apiKeyEnv: config.apiKeyEnv,
    apiBase: config.apiBase,
    openAiBase: config.openAiBase,
    usageUrl: config.usageUrl,
    balanceUrl: config.balanceUrl,
    transport: config.transport,
    modelTransports: config.modelTransports,
    requestTimeoutMs: config.requestTimeoutMs,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    attemptTimeoutMs: config.attemptTimeoutMs,
    visibleModels: config.visibleModels,
    showAllModels: config.showAllModels,
    modelVisibility: config.modelVisibility,
    manualModels: config.manualModels,
    modelOrder: config.modelOrder,
    filterModelsByPlan: config.filterModelsByPlan,
    contextWindow: config.contextWindow ?? null,
    contextWindowOverrides: config.contextWindowOverrides,
    maxOutputTokens: config.maxOutputTokens ?? null,
    temperature: config.temperature ?? null,
    topK: config.topK ?? null,
    topP: config.topP ?? null,
    minP: config.minP ?? null,
    seed: config.seed ?? null,
    repeatPenalty: config.repeatPenalty ?? null,
    repeatLastN: config.repeatLastN ?? null,
    numCtx: config.numCtx ?? null,
    keepAlive: config.keepAlive ?? '',
    stop: config.stop ?? [],
    autoRefresh: config.autoRefresh,
    refreshMinutes: config.refreshMinutes,
    accounts: config.accounts.map((account) => ({
      label: typeof account.label === 'string' ? account.label : '',
      apiKeyEnv: typeof account.apiKeyEnv === 'string' ? account.apiKeyEnv : '',
    })),
    modelAccountRules: config.modelAccountRules.map((rule) => ({
      pattern: rule.pattern,
      account: rule.account,
    })),
    stickySession: config.stickySession,
    activeAccount: config.activeAccount,
    showSidebarQuota: config.showSidebarQuota,
    planLabel: config.planLabel,
    priceOverrides: config.priceOverrides,
    userAgent: config.userAgent,
  }
}
