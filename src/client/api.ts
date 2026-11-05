export type TransportId = 'native' | 'openai-chat'

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
  retryMaxRetries: number
  retryBaseDelayMs: number
  retryMaxDelayMs: number
  retryJitter: number
  visibleModels: readonly string[]
  showAllModels: boolean
  modelVisibility: Readonly<Record<string, boolean>>
  manualModels: ManualModel[]
  modelOverrides: Record<string, ModelOverride>
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
  priceOverrides: Readonly<Record<string, { input?: number; output?: number; cacheRead?: number }>>
  userAgent: string
}

export interface RoutingTraceRow {
  at: number
  provider: string
  model: string
  account: string
  reason: 'rule' | 'sticky' | 'pinned' | 'default' | 'rotation'
  fallback: boolean
  ok: boolean
  error?: string
}

export interface ManualModel {
  id: string
  enabled?: boolean
  name?: string
  contextWindow?: number
  maxTokens?: number
  image?: boolean
  thinking?: boolean
  reasoningEfforts?: string[]
  defaultReasoning?: string
  tools?: boolean
}

export interface ModelOverride {
  contextWindow?: number
  image?: boolean
  thinking?: boolean
  reasoningEfforts?: string[]
  defaultEffort?: string
  enabled?: boolean
}

export interface ModelRow {
  id: string
  name: string
  description: string
  transport: TransportId
  contextWindow: number
  maxTokens: number
  free: boolean
  cost: { input: number; output: number; cacheRead: number; free: boolean; priced: boolean }
  available: boolean
  input: readonly string[]
  reasoning: readonly string[]
  defaultReasoning: string | null
  tools: boolean
  visible: boolean
}

export interface UsageWindow {
  percentUsed: number
  resetsAt?: string
  status?: string
}

export interface UsageTotals {
  requests: number
  usd: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export interface CreditBalance {
  includedRemaining: number
  includedAllowance: number
  purchased: number
  periodFrom?: string
  periodUntil?: string
}

export interface UsageReport {
  kind: 'credits' | 'legacy'
  credits?: CreditBalance
  legacy?: { fiveHour?: UsageWindow; weekly?: UsageWindow }
  windows: { d24?: UsageTotals; d7?: UsageTotals; d30?: UsageTotals }
  byModel: Array<{ model: string } & UsageTotals>
  range: '24h' | '7d' | '30d'
}

export interface UsageState {
  report?: UsageReport
  error?: string
  checkedAt: number
}

export interface AccountRow {
  label: string
  ref: string
  default: boolean
  configured: boolean
  source: string
  active: boolean
  coolingUntil: number
  mark: string
  usage: UsageState | null
}

export interface HostState {
  config: PublicConfig
  key: { configured: boolean; writable: boolean; source?: string }
  accounts: AccountRow[]
  models: ModelRow[]
  usage: UsageState | null
  routing: RoutingTraceRow[]
  revision?: number
}

export interface ServiceStatus {
  ok: boolean
  status: number | null
  latencyMs: number
  checkedAt: string
  error?: string
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body as T
}

export function fetchState(): Promise<HostState> {
  return call<HostState>('/dsh-ollama/state')
}

export function fetchServiceStatus(): Promise<ServiceStatus> {
  return call<ServiceStatus>('/dsh-ollama/status')
}

export function refreshState(): Promise<HostState> {
  return call<HostState>('/dsh-ollama/refresh', { method: 'POST', body: '{}' })
}

export function refreshModels(): Promise<HostState> {
  return call<HostState>('/dsh-ollama/models/refresh', { method: 'POST', body: '{}' })
}

export interface DiscoveryResult {
  base: string
  models: string[]
  local: boolean
}

export function discoverModels(apiBase: string, apiKey: string): Promise<DiscoveryResult> {
  return call<DiscoveryResult>('/dsh-ollama/discover', {
    method: 'POST',
    body: JSON.stringify({ apiBase, apiKey }),
  })
}

export interface LocalModelDetails {
  family?: string
  parameterSize?: string
  quantization?: string
}

export interface LocalModelInfo {
  name: string
  size: number
  digest?: string
  modifiedAt?: string
  details?: LocalModelDetails
}

export interface RunningModelInfo {
  name: string
  size: number
  sizeVram: number
  digest?: string
  expiresAt?: string
}

export interface LocalInventory {
  models: LocalModelInfo[]
  running: RunningModelInfo[]
  diskBytes: number
  runningBytes: number
}

export interface PullProgress {
  status: string
  digest?: string
  completed?: number
  total?: number
  done?: boolean
  error?: string
}

export interface LocalShow {
  name: string
  modifiedAt?: string
  details?: LocalModelDetails
  capabilities: string[]
  parameters?: string
}

export function fetchLocalModels(): Promise<LocalInventory> {
  return call<LocalInventory>('/dsh-ollama/local/models')
}

export function fetchLocalShow(model: string): Promise<LocalShow> {
  return call<LocalShow>(`/dsh-ollama/local/show?model=${encodeURIComponent(model)}`)
}

export async function pullLocalModel(
  model: string,
  onProgress: (progress: PullProgress) => void,
): Promise<PullProgress> {
  const response = await fetch('/dsh-ollama/local/pull', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/x-ndjson', 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }
  if (response.body === null) throw new Error('empty pull stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let last: PullProgress = { status: 'starting' }
  const consume = (line: string): void => {
    if (line.trim() === '') return
    let event: PullProgress
    try {
      event = JSON.parse(line) as PullProgress
    } catch {
      return
    }
    if (typeof event.error === 'string' && event.error !== '') throw new Error(event.error)
    if (typeof event.status === 'string') last = event
    onProgress(event)
  }
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consume(line)
    if (done) break
  }
  if (buffer.trim() !== '') consume(buffer)
  return last
}

export function removeLocalModel(model: string): Promise<{ ok: true; model: string }> {
  return call('/dsh-ollama/local/remove', {
    method: 'POST',
    body: JSON.stringify({ model, confirm: true }),
  })
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

export function saveConfig(patch: Record<string, unknown>): Promise<{ ok: true }> {
  return call('/dsh-ollama/config', { method: 'POST', body: JSON.stringify({ patch }) })
}

export function fetchUsage(range: '24h' | '7d' | '30d'): Promise<UsageState> {
  return call(`/dsh-ollama/usage?range=${encodeURIComponent(range)}`)
}

export interface UpdateStatus {
  packageName: string
  currentVersion: string
  latestVersion?: string
  latestCheckFailed: boolean
  updateAvailable: boolean
  profileName: string
  canAutoUpdate: boolean
  updatedVersion?: string
  restartRequired?: boolean
}

export function fetchUpdate(): Promise<UpdateStatus> {
  return call<UpdateStatus>('/dsh-ollama/update')
}

export function installUpdate(): Promise<UpdateStatus> {
  return call<UpdateStatus>('/dsh-ollama/update', {
    method: 'POST',
    headers: { 'x-dsh-plugin-update': '1' },
    body: '{}',
  })
}

export function saveKey(ref: string, key: string): Promise<{ ok: true }> {
  return call('/dsh-ollama/key', { method: 'POST', body: JSON.stringify({ ref, key }) })
}

export function clearKey(ref: string): Promise<{ ok: true }> {
  return call('/dsh-ollama/key/clear', { method: 'POST', body: JSON.stringify({ ref }) })
}

export interface TestResult {
  ok: boolean
  model: string
  provider: string
  latencyMs: number
  text?: string
  finish?: unknown
  error?: string
}

export interface ModelUsageRow {
  provider: string
  model: string
  sessions: number
  turns: number
  steps: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  priced: boolean
  partial: boolean
  free: boolean
  llmMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
}

export interface AnalyticsSummary {
  sessions: number
  requests: number
  tokens: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number | null
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  priced: boolean
  partial: boolean
  free: boolean
  avgTtftMs: number | null
  avgLatencyMs: number | null
  errors: number | null
  successRate: number | null
}

export interface DayUsageRow {
  date: string
  sessions: number
  requests: number
  tokens: number
  cost: number
  priced: boolean
  partial: boolean
  free: boolean
  avgTtftMs: number | null
}

export interface SessionUsageRow {
  id: string
  provider: string
  model: string
  at: number
  requests: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  priced: boolean
  partial: boolean
  free: boolean
  avgTtftMs: number | null
  avgLatencyMs: number | null
}

export interface ModelRequestHeatmap {
  provider: string
  model: string
  total: number
  hours: number[]
  grid: number[][]
}

export interface AccountRequestHeatmap {
  account: string
  total: number
  errors: number
  avgLatencyMs: number | null
  avgTtftMs: number | null
  hours: number[]
  grid: number[][]
}

export interface RequestHeatmap {
  since: number
  total: number
  hours: number[]
  grid: number[][]
  firstAt: number | null
  lastAt: number | null
  models: ModelRequestHeatmap[]
  accounts: AccountRequestHeatmap[]
}

export interface AnalyticsReport {
  since: number
  scannedSessions: number
  matchedSessions: number
  models: ModelUsageRow[]
  summary: AnalyticsSummary
  days: DayUsageRow[]
  sessions: SessionUsageRow[]
  truncated?: boolean
  totalFiles?: number
  heatmap?: RequestHeatmap
}

export function fetchAnalytics(days = 30): Promise<AnalyticsReport> {
  return call(`/dsh-ollama/analytics?days=${encodeURIComponent(String(days))}`)
}

export function testConnection(model: string): Promise<TestResult> {
  return call('/dsh-ollama/test', { method: 'POST', body: JSON.stringify({ model }) })
}
