import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import {
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  attributionHeaders,
  resolveRetryPolicy,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type ResolvedRetryPolicy,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

import { matchModelAccount, orderKeysForModel } from './account-rules.ts'
import { bestEffortFailed } from './best-effort.ts'
import {
  describeModel,
  effectiveMaxTokens,
  effectiveModel,
  refreshCatalog,
  sortForPicker,
  type EffectiveModel,
} from './catalog.ts'
import type { ResolvedConfig } from './config.ts'
import type { KeyResolver, ResolvedKey } from './credentials.ts'
import { classifyResponseError } from './errors.ts'
import { hasImages, resolveImages, type ImageMap } from './images.ts'
import { buildChatBody, buildNativeBody } from './messages.ts'
import { PROVIDER } from './provider-ids.ts'
import { recordRequest as defaultRecordRequest, type RequestOutcome } from './request-log.ts'
import { endpointFor } from './routing.ts'
import { limitTools, MAX_TOOLS } from './tools.ts'
import { parseNativeStream } from './transports/native.ts'
import { parseChatStream } from './transports/openai-chat.ts'

export type RoutingReason = 'rule' | 'sticky' | 'pinned' | 'default' | 'rotation'

export interface RoutingTraceEntry {
  readonly at: number
  readonly provider: string
  readonly model: string
  readonly account: string
  readonly reason: RoutingReason
  readonly fallback: boolean
  readonly ok: boolean
  readonly error?: string
}

export interface OllamaCloudAdapterDeps {
  readonly config: () => ResolvedConfig
  readonly resolveKey: KeyResolver
  readonly resolveKeys?: (provider: string) => Promise<readonly ResolvedKey[]>
  readonly resolveAttachments?: () => AttachmentStore | undefined
  readonly fetchImpl?: typeof fetch
  /** Test seam; defaults to the local append-only request log. */
  readonly recordRequest?: (
    provider: string,
    model: string,
    purpose?: string,
    account?: string,
    reason?: string,
    outcome?: RequestOutcome,
  ) => void
  /** Test seam; defaults to ~/.dsh/storages/dsh-ollama/cooldowns.json. */
  readonly cooldownPath?: string
  /** Test seam; defaults to ~/.dsh/storages/dsh-ollama/sticky.json. */
  readonly stickyPath?: string
  /** Receives a one-time warning when the provider tool limit drops tools. */
  readonly warn?: (message: string) => void
}

function storagePath(file: string): string {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-ollama', file)
}

function effortName(id: string): string {
  if (id === 'off' || id === 'none') return 'Off'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export class OllamaCloudAdapter extends LlmAdapter {
  private readonly fetchImpl: typeof fetch
  private readonly cooldownPath: string
  private readonly stickyPath: string
  private cooldownWrites: Promise<void> = Promise.resolve()
  private stickyWrites: Promise<void> = Promise.resolve()
  /** key fingerprint → cooldown deadline and the rejection that caused it. */
  private readonly cooldowns = new Map<string, { until: number; reason: string }>()
  private readonly sticky = new Map<string, {
    fingerprint: string
    label: string
    provider: string
    model: string
    at: number
  }>()
  private readonly routing: RoutingTraceEntry[] = []
  private warnedTools = false

  constructor(private readonly deps: OllamaCloudAdapterDeps) {
    super()
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.cooldownPath = deps.cooldownPath ?? storagePath('cooldowns.json')
    this.stickyPath = deps.stickyPath ?? storagePath('sticky.json')
    this.loadCooldowns()
    this.loadSticky()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Ollama Cloud' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return resolveRetryPolicy(
      {
        mode: 'normal',
        maxRetries: 5,
        retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
        backoff: { initialDelayMs: 500, maxDelayMs: 15_000, jitterRatio: 0.1 },
      },
      'llm-ollama-cloud: retryPolicy',
    )
  }

  override async listModels(
    provider: string,
    opts?: { unfiltered?: boolean },
  ): Promise<readonly LlmModelInfo[]> {
    const config = this.deps.config()
    const ids = await refreshCatalog(config, this.fetchImpl)
    return sortForPicker(ids, config, opts?.unfiltered === true).map((id) => {
      const model = effectiveModel(id, config)
      return {
        provider,
        id,
        name: model.name === '' ? id : model.name,
        description: describeModel(model, config),
        inputModalities: model.input,
      }
    })
  }

  /** Recent routing decisions, newest first; no keys or prompt content. */
  routingTrace(): readonly RoutingTraceEntry[] {
    return [...this.routing]
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    signal?.throwIfAborted()
    const config = this.deps.config()
    const meta = effectiveModel(model, config)
    const maxTokens = effectiveMaxTokens(meta, config)
    const efforts = meta.reasoning
    const defaultEffort = meta.defaultReasoning
    return {
      provider,
      id: model,
      name: meta.name === '' ? model : meta.name,
      description: describeModel(meta, config),
      inputModalities: meta.input,
      context: { contextWindow: meta.contextWindow },
      ...(maxTokens === undefined ? {} : { defaultMaxTokens: maxTokens }),
      ...(efforts.length === 0
        ? {}
        : {
            reasoning: {
              efforts: efforts.map((effort) => ({
                id: ReasoningEffortId(effort),
                name: offLabel(effort, meta),
              })),
              ...(defaultEffort !== undefined && efforts.includes(defaultEffort)
                ? { defaultEffort: ReasoningEffortId(defaultEffort) }
                : {}),
            },
          }),
    }
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.run(options)
  }

  private async *run(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const record = this.deps.recordRequest
      ?? ((provider: string, model: string, purpose?: string, account?: string, reason?: string, outcome?: RequestOutcome) =>
        defaultRecordRequest(provider, model, outcome?.at ?? Date.now(), purpose, account, reason, outcome))
    const config = this.deps.config()
    const runStartedAt = Date.now()
    const model = effectiveModel(options.model, config)
    const rawKeys = orderKeysForModel(
      this.deps.resolveKeys !== undefined
        ? await this.deps.resolveKeys(options.provider)
        : [await this.deps.resolveKey(options.provider)],
      options.model,
      config.modelAccountRules,
    )
    const rule = matchModelAccount(options.model, config.modelAccountRules)
    let keys = rawKeys
    let reason: RoutingReason = rule === undefined ? 'default' : 'rule'
    if (config.activeAccount !== '') {
      reason = 'pinned'
    } else if (config.stickySession && rule === undefined) {
      const previous = this.sticky.get(options.sessionId === undefined ? '' : String(options.sessionId))
      if (previous !== undefined) {
        const preferred = rawKeys.find((entry) => this.keyId(entry.key) === previous.fingerprint)
        if (preferred !== undefined) {
          keys = [preferred, ...rawKeys.filter((entry) => entry !== preferred)]
          reason = 'sticky'
        }
      }
    }

    const url = endpointFor(model.transport, config)
    let images: ImageMap | undefined
    if (hasImages(options)) {
      const store = this.deps.resolveAttachments?.()
      if (store === undefined) {
        throw new LlmError(
          'llm-ollama-cloud: image input requires the durable attachment service',
          'UNSUPPORTED_CONTENT',
        )
      }
      images = await resolveImages(options, store, options.signal)
    }
    let bodyOptions: GenerateOptions = options
    if (options.tools !== undefined) {
      const limited = limitTools(options.tools) ?? []
      if (limited.length < options.tools.length && !this.warnedTools) {
        this.warnedTools = true
        this.deps.warn?.(
          `llm-ollama-cloud: provider accepts at most ${MAX_TOOLS} tools; `
          + `${options.tools.length - limited.length} tool declaration(s) omitted`,
        )
      }
      bodyOptions = { ...options, tools: limited }
    }
    const body = model.transport === 'openai-chat'
      ? buildChatBody(bodyOptions, model, config, images)
      : buildNativeBody(bodyOptions, model, config, images)

    let lastError: LlmError | undefined
    let lastAccount = 'default'
    let loggedAny = false
    for (const [index, entry] of keys.entries()) {
      if (this.coolingDown(entry.key)) continue
      lastAccount = entry.label ?? 'default'
      const attemptReason: RoutingReason = index === 0 ? reason : 'rotation'
      const attemptStartedAt = Date.now()
      let started = false
      let responseFailure = false
      let firstChunkAt: number | undefined
      let logged = false
      const logAttempt = (ok: boolean, errorCode?: string): void => {
        if (logged) return
        logged = true
        loggedAny = true
        record(options.provider, options.model, options.purpose, entry.label ?? 'default', attemptReason, {
          at: attemptStartedAt,
          ok,
          latencyMs: Math.max(0, Date.now() - attemptStartedAt),
          ...(firstChunkAt === undefined ? {} : { ttftMs: Math.max(0, firstChunkAt - attemptStartedAt) }),
          ...(errorCode === undefined ? {} : { error: errorCode }),
        })
      }
      try {
        const response = await this.send(url, entry.key, model, body, config, options.signal)
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          const error = classifyResponseError(response.status, text, response.headers)
          lastError = error
          logAttempt(false, error.code)
          const canRotate = index < keys.length - 1
          const retryable = error.code === 'INVALID_CREDENTIAL'
            || error.code === 'RATE_LIMIT'
            || error.code === 'QUOTA'
            || error.code === 'SERVER'
          const credentialOrQuota = error.code === 'INVALID_CREDENTIAL'
            || error.code === 'RATE_LIMIT'
            || error.code === 'QUOTA'
          if (retryable) {
            // A single account must stay usable for the harness retry policy:
            // cooling it down on a generic 5xx makes the retry fail immediately.
            if (canRotate || credentialOrQuota) {
              this.markCooldown(entry.key, response.status, response.headers, error.code)
            }
            responseFailure = true
            if (canRotate) continue
          }
          throw error
        }

        this.rememberSticky(options, entry)
        this.pushTrace({
          at: Date.now(),
          provider: options.provider,
          model: options.model,
          account: entry.label ?? 'default',
          reason: attemptReason,
          fallback: false,
          ok: true,
        })
        const chunks = model.transport === 'openai-chat'
          ? parseChatStream(response, config.streamIdleTimeoutMs, options.signal)
          : parseNativeStream(response, config.streamIdleTimeoutMs, options.signal)
        for await (const chunk of chunks) {
          if (firstChunkAt === undefined) firstChunkAt = Date.now()
          started = true
          yield chunk
        }
        logAttempt(true)
        return
      } catch (error) {
        const classified = error instanceof LlmError
          ? error
          : new LlmError(
              error instanceof Error ? error.message : 'Ollama Cloud request failed',
              'TRANSPORT',
              { cause: error },
            )
        logAttempt(false, classified.code)
        if (started || options.signal?.aborted === true) throw error
        lastError = classified
        const transient = this.isTransient(classified)
        const canRotate = index < keys.length - 1 && transient
        const credentialOrQuota = classified.code === 'INVALID_CREDENTIAL'
          || classified.code === 'RATE_LIMIT'
          || classified.code === 'QUOTA'
        // With one account, a transport/timeout/server failure must reach the
        // harness retry policy instead of cooling the only usable key.
        if (!responseFailure && (canRotate || credentialOrQuota)) {
          this.markCooldown(entry.key, 0)
        }
        if (!canRotate) throw classified
      }
    }

    const finalError = lastError ?? new LlmError(
      'llm-ollama-cloud: every configured account is cooling down after provider rejections',
      'RATE_LIMIT',
    )
    if (!loggedAny) {
      record(options.provider, options.model, options.purpose, lastAccount, reason, {
        at: runStartedAt,
        ok: false,
        latencyMs: 0,
        error: finalError.code,
      })
    }
    this.pushTrace({
      at: Date.now(),
      provider: options.provider,
      model: options.model,
      account: lastAccount,
      reason,
      fallback: false,
      ok: false,
      error: finalError.code,
    })
    throw finalError
  }

  private rememberSticky(options: GenerateOptions, entry: ResolvedKey): void {
    if (!this.deps.config().stickySession) return
    if (options.sessionId === undefined) return
    const sessionId = String(options.sessionId)
    if (!this.sticky.has(sessionId) && this.sticky.size >= 500) {
      const oldest = this.sticky.keys().next().value
      if (oldest !== undefined) this.sticky.delete(oldest)
    }
    this.sticky.set(sessionId, {
      fingerprint: this.keyId(entry.key),
      label: entry.label ?? 'default',
      provider: options.provider,
      model: options.model,
      at: Date.now(),
    })
    this.persistSticky()
  }

  /** Await pending sticky persistence writes (tests and shutdown). */
  async flushSticky(): Promise<void> {
    await this.stickyWrites
  }

  private loadSticky(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.stickyPath, 'utf8')) as { sticky?: unknown }
      const entries = parsed.sticky
      if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return
      for (const [sessionId, value] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
        const record = value as Record<string, unknown>
        const fingerprint = record.fingerprint
        const label = record.label
        const provider = record.provider
        const model = record.model
        const at = record.at
        if (typeof fingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(fingerprint)) continue
        if (typeof label !== 'string' || label === '') continue
        if (typeof provider !== 'string' || provider === '') continue
        if (typeof model !== 'string' || model === '') continue
        if (typeof at !== 'number' || !Number.isFinite(at)) continue
        this.sticky.set(sessionId, { fingerprint, label, provider, model, at })
      }
      this.pruneSticky()
    } catch (error) {
      // Missing or corrupt state is ignored; sticky routing is an optimization.
      bestEffortFailed('sticky state is unavailable', error)
    }
  }

  private pruneSticky(): void {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    for (const [sessionId, entry] of this.sticky) {
      if (entry.at < cutoff) this.sticky.delete(sessionId)
    }
    const overflow = this.sticky.size - 500
    if (overflow <= 0) return
    const oldest = [...this.sticky.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, overflow)
    for (const [sessionId] of oldest) this.sticky.delete(sessionId)
  }

  private persistSticky(): void {
    this.pruneSticky()
    const payload = JSON.stringify({ sticky: Object.fromEntries(this.sticky) })
    this.stickyWrites = this.stickyWrites
      .then(async () => {
        await mkdir(dirname(this.stickyPath), { recursive: true })
        await writeFile(this.stickyPath, payload, 'utf8')
      })
      .catch(() => {})
  }

  private pushTrace(entry: RoutingTraceEntry): void {
    this.routing.unshift(entry)
    if (this.routing.length > 20) this.routing.length = 20
  }

  private async send(
    url: string,
    key: string,
    model: EffectiveModel,
    body: Record<string, unknown>,
    config: ResolvedConfig,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...attributionHeaders(),
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: model.transport === 'openai-chat' ? 'text/event-stream' : 'application/x-ndjson',
      'user-agent': config.userAgent,
    }

    const controller = new AbortController()
    let timedOut = false
    const onAbort = (): void => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, config.requestTimeoutMs)
    timer.unref?.()

    try {
      return await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      if (signal?.aborted === true) throw signal.reason ?? error
      if (timedOut) {
        throw new LlmError(
          `Ollama Cloud did not return response headers within ${config.requestTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private keyId(key: string): string {
    return createHash('sha256').update(key).digest('hex').slice(0, 16)
  }

  private coolingDown(key: string): boolean {
    const id = this.keyId(key)
    const entry = this.cooldowns.get(id)
    if (entry === undefined) return false
    if (entry.until <= Date.now()) {
      this.cooldowns.delete(id)
      return false
    }
    return true
  }

  /** Current cooldown for one resolved key, if any. */
  accountHealth(key: string): { coolingUntil: number; reason: string } | undefined {
    const id = this.keyId(key)
    const entry = this.cooldowns.get(id)
    if (entry === undefined) return undefined
    if (entry.until <= Date.now()) {
      this.cooldowns.delete(id)
      return undefined
    }
    return { coolingUntil: entry.until, reason: entry.reason }
  }

  /** Await pending cooldown persistence writes (tests and shutdown). */
  async flushCooldowns(): Promise<void> {
    await this.cooldownWrites
  }

  private loadCooldowns(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.cooldownPath, 'utf8')) as { cooldowns?: unknown }
      const entries = parsed.cooldowns
      if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return
      for (const [id, value] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
        const until = (value as { until?: unknown }).until
        const reason = (value as { reason?: unknown }).reason
        if (typeof until !== 'number' || !Number.isFinite(until) || until <= Date.now()) continue
        if (typeof reason !== 'string' || reason === '') continue
        this.cooldowns.set(id, { until, reason })
      }
      this.pruneCooldowns()
    } catch (error) {
      // Missing or corrupt state is ignored; cooldowns are an optimization.
      bestEffortFailed('cooldown state is unavailable', error)
    }
  }

  private pruneCooldowns(): void {
    const now = Date.now()
    for (const [id, entry] of this.cooldowns) {
      if (entry.until <= now) this.cooldowns.delete(id)
    }
    const overflow = this.cooldowns.size - 50
    if (overflow <= 0) return
    const oldest = [...this.cooldowns.entries()].sort((a, b) => a[1].until - b[1].until).slice(0, overflow)
    for (const [id] of oldest) this.cooldowns.delete(id)
  }

  private persistCooldowns(): void {
    this.pruneCooldowns()
    const payload = JSON.stringify({ cooldowns: Object.fromEntries(this.cooldowns) })
    this.cooldownWrites = this.cooldownWrites
      .then(async () => {
        await mkdir(dirname(this.cooldownPath), { recursive: true })
        await writeFile(this.cooldownPath, payload, 'utf8')
      })
      .catch(() => {})
  }

  private markCooldown(key: string, status: number, headers?: Headers, code?: string): void {
    let delayMs = 30_000
    let reason = 'transport'
    if (code === 'QUOTA' || status === 402) {
      const seconds = Number(headers?.get('retry-after') ?? Number.NaN)
      delayMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 10 * 60 * 1000
      reason = 'quota'
    } else if (status === 401 || status === 403) {
      delayMs = 24 * 60 * 60 * 1000
      reason = 'invalid-credential'
    } else if (status === 429) {
      const seconds = Number(headers?.get('retry-after') ?? Number.NaN)
      delayMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000
      reason = 'rate-limit'
    }
    this.cooldowns.set(this.keyId(key), { until: Date.now() + delayMs, reason })
    this.persistCooldowns()
  }

  private isTransient(error: LlmError): boolean {
    return error.code === 'RATE_LIMIT'
      || error.code === 'QUOTA'
      || error.code === 'SERVER'
      || error.code === 'TIMEOUT'
      || error.code === 'TRANSPORT'
      || error.code === 'EMPTY_RESPONSE'
  }
}

function offLabel(id: string, meta: EffectiveModel): string {
  if (id === 'off' || id === 'none') return 'Off'
  if (id === 'high' && meta.reasoningToggle) return 'On'
  return effortName(id)
}
