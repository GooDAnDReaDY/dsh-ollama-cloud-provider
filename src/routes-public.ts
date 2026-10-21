import type { ModelPriceOverride, ResolvedConfig, TransportId } from './config.ts'

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
  visibleModels: readonly string[]
  modelVisibility: Readonly<Record<string, boolean>>
  filterModelsByPlan: boolean
  contextWindow: number | null
  contextWindowOverrides: Readonly<Record<string, number>>
  maxOutputTokens: number | null
  accounts: ReadonlyArray<{ label: string; apiKeyEnv: string }>
  modelAccountRules: ReadonlyArray<{ pattern: string; account: string }>
  stickySession: boolean
  activeAccount: string
  showSidebarQuota: boolean
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
    visibleModels: config.visibleModels,
    modelVisibility: config.modelVisibility,
    filterModelsByPlan: config.filterModelsByPlan,
    contextWindow: config.contextWindow ?? null,
    contextWindowOverrides: config.contextWindowOverrides,
    maxOutputTokens: config.maxOutputTokens ?? null,
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
    priceOverrides: config.priceOverrides,
    userAgent: config.userAgent,
  }
}
