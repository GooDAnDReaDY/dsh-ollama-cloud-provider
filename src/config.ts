import z from '@deepseek-ai/schemastery'

export const NS = 'llm-ollama-cloud'
export const DEFAULT_API_KEY_ENV = 'OLLAMA_API_KEY'
export const DEFAULT_API_BASE = 'https://ollama.com'
export const DEFAULT_OPENAI_BASE = 'https://ollama.com/v1'
export const DEFAULT_USAGE_URL = 'https://ollama.com/api/usage'
export const DEFAULT_BALANCE_URL = 'https://ollama.com/api/balance'
export const DEFAULT_USER_AGENT = 'dsh-ollama-cloud-provider/0.1.5'
export const DEFAULT_CONTEXT_WINDOW = 131_072
export const DEFAULT_MAX_TOKENS = 32_768
export const DEFAULT_GENERATE_MAX_TOKENS = 131_072

export type TransportId = 'native' | 'openai-chat'

export interface AccountConfig {
  label?: string
  apiKeyEnv?: string
  apiKey?: string
}

export interface ModelAccountRule {
  pattern: string
  account: string
}

export interface ModelPriceOverride {
  input?: number
  output?: number
  cacheRead?: number
}

/**
 * Plugin configuration. Every field except the literal `apiKey` is volatile:
 * the harness projects settings forms from schema fields carrying that marker.
 */
export interface Config {
  /** Credential reference resolved per request; defaults to `OLLAMA_API_KEY`. */
  apiKeyEnv?: string
  /** Literal key for composition config only; stripped from settings reads. */
  apiKey?: string
  /** Native API root; defaults to `https://ollama.com`. */
  apiBase?: string
  /** OpenAI-compatible root; defaults to `https://ollama.com/v1`. */
  openAiBase?: string
  /** Cloud usage endpoint. */
  usageUrl?: string
  /** Cloud balance endpoint. */
  balanceUrl?: string
  /** Default wire protocol for chat. */
  transport?: TransportId
  /** Per-model transport overrides; wins over `transport`. */
  modelTransports?: Record<string, TransportId>
  /** Milliseconds to wait for response headers; defaults to 300s. */
  requestTimeoutMs?: number
  /** Milliseconds a stream may stall; defaults to 300s. */
  streamIdleTimeoutMs?: number
  /** Visible-model allowlist; empty means "show everything". */
  visibleModels?: string[]
  /** Per-model visibility overrides; wins over `visibleModels`. */
  modelVisibility?: Record<string, boolean>
  /** Hide models the cloud marks unsupported in the API; defaults to true. */
  filterModelsByPlan?: boolean
  /** Global context-window override. */
  contextWindow?: number
  /** Per-model context-window overrides. */
  contextWindowOverrides?: Record<string, number>
  /** Per-turn output cap; `0` omits `num_predict`/`max_tokens`. */
  maxOutputTokens?: number
  /** Extra accounts for rotation. */
  accounts?: AccountConfig[]
  /** Preferred account per model glob; others remain fallbacks. */
  modelAccountRules?: ModelAccountRule[]
  /** Prefer the last successful account for a conversation. */
  stickySession?: boolean
  /** Pinned account label; empty means automatic. */
  activeAccount?: string
  /** Show the quota card in the sidebar. */
  showSidebarQuota?: boolean
  /** Optional plan label shown on the sidebar card, for example PRO. */
  planLabel?: string
  /** Per-model price overrides in USD per 1M tokens. */
  priceOverrides?: Record<string, ModelPriceOverride>
  /** Product user agent sent to Ollama Cloud. */
  userAgent?: string
}

function markVolatile<T>(schema: T): T {
  const mark = (schema as { volatile?: () => T }).volatile
  return typeof mark === 'function' ? mark.call(schema) : schema
}

export const Config: z<Config> = z.object({
  apiKeyEnv: markVolatile(z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV)),
  apiKey: z.string().role('secret'),
  apiBase: markVolatile(z.string().default(DEFAULT_API_BASE)),
  openAiBase: markVolatile(z.string().default(DEFAULT_OPENAI_BASE)),
  usageUrl: markVolatile(z.string().default(DEFAULT_USAGE_URL)),
  balanceUrl: markVolatile(z.string().default(DEFAULT_BALANCE_URL)),
  transport: markVolatile(z.union(['native', 'openai-chat']).default('native')),
  modelTransports: markVolatile(z.dict(z.union(['native', 'openai-chat'])).default({})),
  requestTimeoutMs: markVolatile(z.number().min(1).max(2_147_483_647).default(300_000)),
  streamIdleTimeoutMs: markVolatile(z.number().min(1).max(2_147_483_647).default(300_000)),
  visibleModels: markVolatile(z.array(z.string()).default([])),
  modelVisibility: markVolatile(z.dict(z.boolean()).default({})),
  filterModelsByPlan: markVolatile(z.boolean().default(true)),
  contextWindow: markVolatile(z.number().min(1).max(10_000_000).step(1)),
  contextWindowOverrides: markVolatile(z.dict(z.number().min(1).max(10_000_000).step(1)).default({})),
  maxOutputTokens: markVolatile(z.number().min(0).max(10_000_000).step(1)),
  accounts: markVolatile(z.array(z.object({
    label: z.string(),
    apiKeyEnv: z.string().role('credential-ref'),
    apiKey: z.string().role('secret'),
  })).default([])),
  modelAccountRules: markVolatile(z.array(z.object({
    pattern: z.string(),
    account: z.string(),
  })).default([])),
  stickySession: markVolatile(z.boolean().default(true)),
  activeAccount: markVolatile(z.string().default('')),
  showSidebarQuota: markVolatile(z.boolean().default(false)),
  planLabel: markVolatile(z.string().default('')),
  priceOverrides: markVolatile(z.dict(z.object({
    input: z.number().min(0),
    output: z.number().min(0),
    cacheRead: z.number().min(0),
  })).default({})),
  userAgent: markVolatile(z.string().default(DEFAULT_USER_AGENT)),
})

export interface ResolvedConfig {
  apiKeyEnv: string
  apiKey?: string
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
  contextWindow?: number
  contextWindowOverrides: Readonly<Record<string, number>>
  maxOutputTokens?: number
  accounts: readonly AccountConfig[]
  modelAccountRules: readonly ModelAccountRule[]
  stickySession: boolean
  activeAccount: string
  showSidebarQuota: boolean
  planLabel: string
  priceOverrides: Readonly<Record<string, ModelPriceOverride>>
  userAgent: string
}

/** Read each volatile field through its live reference, if the loader installed one. */
export function unwrapVolatileConfig(config: Config): Config {
  const source = config as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    const value = source[key]
    out[key] = value !== null
      && typeof value === 'object'
      && typeof (value as { get?: unknown }).get === 'function'
      ? (value as { get: () => unknown }).get()
      : value
  }
  return out as Config
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, entry] of Object.entries(recordOf(value))) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) out[key] = entry
  }
  return out
}

function booleanRecord(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(recordOf(value))) {
    if (typeof entry === 'boolean') out[key] = entry
  }
  return out
}

function priceRecord(value: unknown): Record<string, ModelPriceOverride> {
  const out: Record<string, ModelPriceOverride> = {}
  for (const [key, entry] of Object.entries(recordOf(value))) {
    const raw = recordOf(entry)
    const price: ModelPriceOverride = {}
    if (typeof raw.input === 'number' && raw.input >= 0) price.input = raw.input
    if (typeof raw.output === 'number' && raw.output >= 0) price.output = raw.output
    if (typeof raw.cacheRead === 'number' && raw.cacheRead >= 0) price.cacheRead = raw.cacheRead
    if (Object.keys(price).length > 0) out[key] = price
  }
  return out
}

const TRANSPORTS = new Set<TransportId>(['native', 'openai-chat'])

function transportRecord(value: unknown): Record<string, TransportId> {
  const out: Record<string, TransportId> = {}
  for (const [key, entry] of Object.entries(recordOf(value))) {
    if (typeof entry === 'string' && TRANSPORTS.has(entry as TransportId)) {
      out[key] = entry as TransportId
    }
  }
  return out
}

function ruleList(value: unknown): ModelAccountRule[] {
  if (!Array.isArray(value)) return []
  const out: ModelAccountRule[] = []
  for (const entry of value) {
    const raw = recordOf(entry)
    const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : ''
    const account = typeof raw.account === 'string' ? raw.account.trim() : ''
    if (pattern !== '' && account !== '') out.push({ pattern, account })
  }
  return out
}

/** Normalize a raw config (possibly bypassing schemastery) into request facts. */
export function resolveConfig(config: Config): ResolvedConfig {
  const apiKey = typeof config.apiKey === 'string' && config.apiKey.trim() !== ''
    ? config.apiKey.trim()
    : undefined
  return {
    apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() !== ''
      ? config.apiKeyEnv.trim()
      : DEFAULT_API_KEY_ENV,
    ...(apiKey === undefined ? {} : { apiKey }),
    apiBase: typeof config.apiBase === 'string' && config.apiBase !== '' ? config.apiBase : DEFAULT_API_BASE,
    openAiBase: typeof config.openAiBase === 'string' && config.openAiBase !== ''
      ? config.openAiBase
      : DEFAULT_OPENAI_BASE,
    usageUrl: typeof config.usageUrl === 'string' && config.usageUrl !== '' ? config.usageUrl : DEFAULT_USAGE_URL,
    balanceUrl: typeof config.balanceUrl === 'string' && config.balanceUrl !== ''
      ? config.balanceUrl
      : DEFAULT_BALANCE_URL,
    transport: config.transport === 'openai-chat' ? 'openai-chat' : 'native',
    modelTransports: transportRecord(config.modelTransports),
    requestTimeoutMs: positiveInt(config.requestTimeoutMs, 300_000),
    streamIdleTimeoutMs: positiveInt(config.streamIdleTimeoutMs, 300_000),
    visibleModels: Array.isArray(config.visibleModels)
      ? config.visibleModels.filter((id): id is string => typeof id === 'string' && id !== '')
      : [],
    modelVisibility: booleanRecord(config.modelVisibility),
    filterModelsByPlan: config.filterModelsByPlan !== false,
    ...(typeof config.contextWindow === 'number'
      && Number.isInteger(config.contextWindow)
      && config.contextWindow > 0
      ? { contextWindow: config.contextWindow }
      : {}),
    contextWindowOverrides: numberRecord(config.contextWindowOverrides),
    ...(typeof config.maxOutputTokens === 'number'
      && Number.isInteger(config.maxOutputTokens)
      && config.maxOutputTokens >= 0
      ? { maxOutputTokens: config.maxOutputTokens }
      : {}),
    accounts: Array.isArray(config.accounts) ? config.accounts : [],
    modelAccountRules: ruleList(config.modelAccountRules),
    stickySession: config.stickySession !== false,
    activeAccount: typeof config.activeAccount === 'string' ? config.activeAccount : '',
    showSidebarQuota: config.showSidebarQuota === true,
    planLabel: typeof config.planLabel === 'string' ? config.planLabel.trim() : '',
    priceOverrides: priceRecord(config.priceOverrides),
    userAgent: typeof config.userAgent === 'string' && config.userAgent !== ''
      ? config.userAgent
      : DEFAULT_USER_AGENT,
  }
}
