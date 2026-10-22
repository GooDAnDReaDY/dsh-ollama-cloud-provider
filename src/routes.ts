import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { ReasoningEffortId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'

import type { OllamaCloudAdapter } from './adapter.ts'
import { bestEffortFailed } from './best-effort.ts'
import { readModelAnalytics, type AnalyticsReport } from './analytics.ts'
import {
  clearCatalogCache,
  effectiveModel,
  modelAvailable,
  modelVisible,
  refreshCatalog,
} from './catalog.ts'
import { NS, type Config, type ResolvedConfig } from './config.ts'
import type { KeyPool } from './credentials.ts'
import { priceFor } from './pricing.ts'
import { PROVIDER } from './provider-ids.ts'
import type { RequestHeatmap } from './request-log.ts'
import { publicConfig } from './routes-public.ts'
import {
  cleanAccounts,
  cleanBooleanRecord,
  cleanModelAccountRules,
  cleanNumberRecord,
  cleanPrices,
  cleanStringArray,
  cleanTransports,
} from './routes-values.ts'
import type { UsageRange, UsageReader } from './usage.ts'

const MAX_BODY_BYTES = 256 * 1024

export interface RouteDeps {
  readonly config: () => ResolvedConfig
  readonly adapter: OllamaCloudAdapter
  readonly pool: KeyPool
  readonly usage: UsageReader
  readonly analytics?: (days: number) => Promise<AnalyticsReport>
  readonly heatmap?: (days: number) => Promise<RequestHeatmap>
  readonly refreshTui?: () => void
}

type UsageValue = Awaited<ReturnType<UsageReader['read']>> | null

function json(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

function sourceHost(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

/**
 * Write routes must prove a same-origin browser context. A LAN bridge that
 * rewrites Host and socket to loopback would otherwise let any non-browser
 * client write keys and settings without an Origin. Fail closed when neither
 * Origin nor Referer is present.
 */
function writeSourceError(req: IncomingMessage): string | undefined {
  const host = req.headers.host
  if (host === undefined || host === '') return 'request host required'
  const origin = req.headers.origin
  if (origin !== undefined && origin !== '') {
    return sourceHost(origin) === host ? undefined : 'cross-origin request refused'
  }
  const referer = req.headers.referer
  if (referer === undefined || referer === '') return 'request origin required'
  return sourceHost(referer) === host ? undefined : 'cross-origin request refused'
}

function allowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined || origin === '') return true
  try {
    const parsed = new URL(origin)
    const host = req.headers.host
    if (host !== undefined && parsed.host === host) return true
    return parsed.hostname === '127.0.0.1'
      || parsed.hostname === 'localhost'
      || parsed.hostname === '::1'
      || parsed.hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * DNS rebinding keeps the browser's `Host` pointing at the attacker's name
 * while the socket reaches loopback. Write endpoints accept only a literal
 * loopback Host.
 */
function loopbackHost(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (host === undefined || host === '') return false
  try {
    const hostname = new URL(`http://${host}`).hostname
    return hostname === '127.0.0.1'
      || hostname === 'localhost'
      || hostname === '::1'
      || hostname === '[::1]'
  } catch {
    return false
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('payload too large')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function requirePost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'POST required' })
    return false
  }
  if (!loopbackHost(req)) {
    json(res, 403, { error: 'non-loopback Host refused' })
    return false
  }
  const sourceError = writeSourceError(req)
  if (sourceError !== undefined) {
    json(res, 403, { error: sourceError })
    return false
  }
  const remote = req.socket.remoteAddress ?? ''
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  if (!loopback) {
    json(res, 403, { error: 'write endpoints are restricted to the local machine' })
    return false
  }
  const type = req.headers['content-type'] ?? ''
  if (!type.includes('application/json')) {
    json(res, 415, { error: 'application/json required' })
    return false
  }
  return true
}

interface SettingsService {
  describe?: (options?: { redactSecrets?: boolean }) => Array<{ ns: string; revision?: number }>
  mutate?: (
    ns: string,
    ops: Array<{ op: 'set' | 'unset'; path: string[]; value?: unknown }>,
    revision?: number,
  ) => Promise<void>
  writable?: boolean
}

function getSettings(ctx: Context): SettingsService | undefined {
  return ctx.get('settings') as SettingsService | undefined
}

function getCredentials(ctx: Context): CredentialProvider | undefined {
  return ctx.get('credentials') as CredentialProvider | undefined
}

function settingsRevision(ctx: Context): number | undefined {
  try {
    return getSettings(ctx)?.describe?.({ redactSecrets: true })
      .find((row) => row.ns === NS)?.revision
  } catch {
    return undefined
  }
}

/**
 * Writes are limited to this plugin's credential namespace. Without this
 * allowlist any same-origin caller could overwrite or unset another plugin's
 * key in the shared credential store.
 */
function canWriteCredentialRef(config: ResolvedConfig, ref: string): boolean {
  if (ref === config.apiKeyEnv) return true
  for (const account of config.accounts) {
    if (typeof account.apiKeyEnv === 'string' && account.apiKeyEnv.trim() === ref) return true
  }
  return /^OLLAMA_[A-Z0-9_]+$/.test(ref)
}

function configOps(patch: Record<string, unknown>): Array<{ op: 'set' | 'unset'; path: string[]; value?: unknown }> {
  const ops: Array<{ op: 'set' | 'unset'; path: string[]; value?: unknown }> = []
  const set = (field: keyof Config, value: unknown): void => {
    if (value === null || value === undefined) ops.push({ op: 'unset', path: [field] })
    else ops.push({ op: 'set', path: [field], value })
  }
  if ('apiKeyEnv' in patch) set('apiKeyEnv', patch.apiKeyEnv)
  if ('apiBase' in patch) set('apiBase', patch.apiBase)
  if ('openAiBase' in patch) set('openAiBase', patch.openAiBase)
  if ('usageUrl' in patch) set('usageUrl', patch.usageUrl)
  if ('balanceUrl' in patch) set('balanceUrl', patch.balanceUrl)
  if ('transport' in patch) set('transport', patch.transport)
  if ('modelTransports' in patch) set('modelTransports', cleanTransports(patch.modelTransports))
  if ('requestTimeoutMs' in patch) set('requestTimeoutMs', patch.requestTimeoutMs)
  if ('streamIdleTimeoutMs' in patch) set('streamIdleTimeoutMs', patch.streamIdleTimeoutMs)
  if ('visibleModels' in patch) set('visibleModels', cleanStringArray(patch.visibleModels))
  if ('modelVisibility' in patch) set('modelVisibility', cleanBooleanRecord(patch.modelVisibility))
  if ('filterModelsByPlan' in patch) set('filterModelsByPlan', patch.filterModelsByPlan === true)
  if ('contextWindow' in patch) set('contextWindow', patch.contextWindow)
  if ('contextWindowOverrides' in patch) {
    set('contextWindowOverrides', cleanNumberRecord(patch.contextWindowOverrides))
  }
  if ('maxOutputTokens' in patch) set('maxOutputTokens', patch.maxOutputTokens)
  if ('accounts' in patch) set('accounts', cleanAccounts(patch.accounts))
  if ('modelAccountRules' in patch) set('modelAccountRules', cleanModelAccountRules(patch.modelAccountRules))
  if ('stickySession' in patch) set('stickySession', patch.stickySession === true)
  if ('activeAccount' in patch) set('activeAccount', patch.activeAccount)
  if ('showSidebarQuota' in patch) set('showSidebarQuota', patch.showSidebarQuota === true)
  if ('planLabel' in patch) set('planLabel', patch.planLabel)
  if ('priceOverrides' in patch) set('priceOverrides', cleanPrices(patch.priceOverrides))
  if ('userAgent' in patch) set('userAgent', patch.userAgent)
  return ops
}

async function buildState(ctx: Context, deps: RouteDeps): Promise<Record<string, unknown>> {
  const config = deps.config()
  const credentials = getCredentials(ctx)
  let keyInfo: { configured: boolean; writable: boolean; source?: string } = {
    configured: false,
    writable: false,
  }
  if (credentials !== undefined) {
    try {
      const info = await credentials.describe(credentialRef(config.apiKeyEnv))
      keyInfo = {
        configured: info.configured,
        writable: info.writable,
        ...(info.source === undefined ? {} : { source: info.source }),
      }
    } catch (error) {
      // An invalid reference is reported as unconfigured.
      bestEffortFailed('primary credential describe failed', error)
    }
  }

  const resolved = await deps.pool.resolveAll(PROVIDER).catch(() => [])
  if (!keyInfo.configured) keyInfo = { ...keyInfo, configured: resolved.length > 0 }

  const usageByKey = new Map<string, UsageValue>()
  await Promise.all([...new Set(resolved.map((entry) => entry.key))].map(async (key) => {
    usageByKey.set(key, (await deps.usage.read(key)) ?? null)
  }))
  const usageByLabel = new Map<string, UsageValue>()
  for (const entry of resolved) usageByLabel.set(entry.label ?? 'default', usageByKey.get(entry.key) ?? null)

  const slots = [
    { label: 'default', ref: config.apiKeyEnv, default: true },
    ...config.accounts.map((account, index) => ({
      label: typeof account.label === 'string' && account.label.trim() !== ''
        ? account.label.trim()
        : `account-${index + 2}`,
      ref: typeof account.apiKeyEnv === 'string' ? account.apiKeyEnv.trim() : '',
      default: false,
    })),
  ]
  let activeLabel = ''
  for (const entry of resolved) {
    if (deps.adapter.accountHealth(entry.key) === undefined) {
      activeLabel = entry.label ?? 'default'
      break
    }
  }
  const keyByLabel = new Map(resolved.map((entry) => [entry.label ?? 'default', entry]))
  const accounts: Array<Record<string, unknown>> = []
  for (const slot of slots) {
    let configured = false
    let source = ''
    if (slot.ref !== '' && credentials !== undefined) {
      try {
        const info = await credentials.describe(credentialRef(slot.ref))
        configured = info.configured
        source = info.source ?? ''
      } catch (error) {
        // An invalid reference is reported as unconfigured.
        bestEffortFailed('account credential describe failed', error)
      }
    }
    const hit = keyByLabel.get(slot.label)
    if (!configured && hit !== undefined) {
      configured = true
      source = hit.source
    }
    const health = hit === undefined ? undefined : deps.adapter.accountHealth(hit.key)
    accounts.push({
      ...slot,
      configured,
      source,
      active: activeLabel === slot.label,
      coolingUntil: health?.coolingUntil ?? 0,
      mark: health?.reason ?? '',
      usage: hit === undefined ? null : usageByLabel.get(slot.label) ?? null,
    })
  }

  let models: Array<Record<string, unknown>> = []
  try {
    const listed = await deps.adapter.listModels(PROVIDER, { unfiltered: true })
    models = listed.map((model) => {
      const meta = effectiveModel(model.id, config)
      return {
        id: model.id,
        name: model.name,
        description: model.description ?? '',
        transport: meta.transport,
        contextWindow: meta.contextWindow,
        maxTokens: meta.maxTokens,
        free: meta.free,
        cost: priceFor(model.id, config.priceOverrides),
        available: modelAvailable(model.id, config),
        input: meta.input,
        reasoning: meta.reasoning,
        defaultReasoning: meta.defaultReasoning ?? null,
        tools: meta.tools,
        visible: modelVisible(model.id, config),
      }
    })
  } catch {
    models = []
  }

  const displayEntry = resolved.find((entry) => (entry.label ?? 'default') === activeLabel) ?? resolved[0]
  const usage = displayEntry === undefined
    ? null
    : usageByLabel.get(displayEntry.label ?? 'default') ?? null
  return {
    config: publicConfig(config),
    key: keyInfo,
    accounts,
    models,
    usage: usage ?? null,
    routing: deps.adapter.routingTrace(),
    revision: settingsRevision(ctx),
  }
}

async function refreshAndState(ctx: Context, deps: RouteDeps, res: ServerResponse): Promise<void> {
  try {
    json(res, 200, await buildState(ctx, deps))
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'state failed' })
  }
}

/** Register the Host HTTP surface consumed by the browser settings page. */
export function applyRoutes(ctx: Context, web: WebServer, deps: RouteDeps): void {
  const disposers: Array<() => void> = []
  const route = (path: string, handler: Parameters<WebServer['register']>[0]['handler']): void => {
    disposers.push(web.register({ kind: 'exact', path, handler }))
  }
  const readOnly = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      json(res, 405, { error: 'GET required' })
      return false
    }
    if (!allowedOrigin(req)) {
      json(res, 403, { error: 'cross-origin request refused' })
      return false
    }
    return true
  }

  route('/dsh-ollama/state', async (req, res) => {
    if (!readOnly(req, res)) return
    await refreshAndState(ctx, deps, res)
  })

  route('/dsh-ollama/health', async (req, res) => {
    if (!readOnly(req, res)) return
    try {
      const config = deps.config()
      const models = await deps.adapter.listModels(PROVIDER, { unfiltered: true }).catch(() => [])
      json(res, 200, {
        ok: true,
        providers: [PROVIDER],
        accounts: config.accounts.length + 1,
        models: models.length,
      })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'health failed' })
    }
  })

  route('/dsh-ollama/analytics', async (req, res) => {
    if (!readOnly(req, res)) return
    const url = new URL(req.url ?? '/', 'http://localhost')
    const requested = Number(url.searchParams.get('days') ?? '30')
    const days = Number.isFinite(requested) ? Math.max(1, Math.min(365, Math.trunc(requested))) : 30
    try {
      const report = deps.analytics === undefined
        ? await readModelAnalytics(days, deps.config().priceOverrides)
        : await deps.analytics(days)
      const heatmap = deps.heatmap === undefined ? undefined : await deps.heatmap(days)
      json(res, 200, heatmap === undefined ? report : { ...report, heatmap })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'analytics failed' })
    }
  })

  route('/dsh-ollama/usage', async (req, res) => {
    if (!readOnly(req, res)) return
    const url = new URL(req.url ?? '/', 'http://localhost')
    const raw = url.searchParams.get('range') ?? '7d'
    const range: UsageRange = raw === '24h' || raw === '30d' ? raw : '7d'
    try {
      const result = await deps.usage.usage(range)
      json(res, 200, result ?? { error: 'usage unavailable', checkedAt: Date.now() })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'usage failed' })
    }
  })

  route('/dsh-ollama/balance', async (req, res) => {
    if (!readOnly(req, res)) return
    try {
      const result = await deps.usage.read()
      json(res, 200, result ?? { error: 'balance unavailable', checkedAt: Date.now() })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'balance failed' })
    }
  })

  route('/dsh-ollama/config', async (req, res) => {
    if (!requirePost(req, res)) return
    const settings = getSettings(ctx)
    if (settings?.mutate === undefined) {
      json(res, 503, { error: 'settings service unavailable' })
      return
    }
    if (settings.writable === false) {
      json(res, 403, { error: 'settings are read-only' })
      return
    }
    try {
      const body = await readJson(req)
      const patch = typeof body.patch === 'object' && body.patch !== null && !Array.isArray(body.patch)
        ? body.patch as Record<string, unknown>
        : body
      const ops = configOps(patch)
      if (ops.length === 0) {
        json(res, 400, { error: 'no known fields in patch' })
        return
      }
      await settings.mutate(NS, ops, settingsRevision(ctx))
      deps.usage.clear()
      deps.refreshTui?.()
      json(res, 200, { ok: true })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'config write failed' })
    }
  })

  route('/dsh-ollama/key', async (req, res) => {
    if (!requirePost(req, res)) return
    const credentials = getCredentials(ctx)
    if (credentials === undefined) {
      json(res, 503, { error: 'credentials service unavailable' })
      return
    }
    try {
      const body = await readJson(req)
      const refName = typeof body.ref === 'string' && body.ref.trim() !== ''
        ? body.ref.trim()
        : deps.config().apiKeyEnv
      if (!canWriteCredentialRef(deps.config(), refName)) {
        json(res, 400, { error: 'unknown credential reference' })
        return
      }
      const key = typeof body.key === 'string' ? body.key.trim() : ''
      if (key === '') {
        json(res, 400, { error: 'key is required' })
        return
      }
      await credentials.set(credentialRef(refName), key)
      json(res, 200, { ok: true, ref: refName })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'key write failed' })
    }
  })

  route('/dsh-ollama/key/clear', async (req, res) => {
    if (!requirePost(req, res)) return
    const credentials = getCredentials(ctx)
    if (credentials === undefined) {
      json(res, 503, { error: 'credentials service unavailable' })
      return
    }
    try {
      const body = await readJson(req)
      const refName = typeof body.ref === 'string' && body.ref.trim() !== ''
        ? body.ref.trim()
        : deps.config().apiKeyEnv
      if (!canWriteCredentialRef(deps.config(), refName)) {
        json(res, 400, { error: 'unknown credential reference' })
        return
      }
      await credentials.unset(credentialRef(refName))
      json(res, 200, { ok: true, ref: refName })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'key clear failed' })
    }
  })

  route('/dsh-ollama/refresh', async (req, res) => {
    if (!requirePost(req, res)) return
    deps.usage.clear()
    await refreshAndState(ctx, deps, res)
  })

  route('/dsh-ollama/models/refresh', async (req, res) => {
    if (!requirePost(req, res)) return
    clearCatalogCache()
    deps.usage.clear()
    try {
      await refreshCatalog(deps.config(), fetch, true)
    } catch (error) {
      // The state call below reports the fallback catalog.
      bestEffortFailed('catalog refresh failed', error)
    }
    await refreshAndState(ctx, deps, res)
  })

  route('/dsh-ollama/test', async (req, res) => {
    if (!requirePost(req, res)) return
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'invalid body' })
      return
    }
    const model = typeof body.model === 'string' && body.model !== '' ? body.model : 'gpt-oss:120b'
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    let text = ''
    let finish: unknown
    try {
      const options: GenerateOptions = {
        provider: PROVIDER,
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: OK' }] }],
        reasoningEffort: ReasoningEffortId('off'),
        maxTokens: 64,
        signal: controller.signal,
      }
      let reasoning = ''
      for await (const chunk of deps.adapter.stream(options)) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'reasoning-delta') reasoning += chunk.text
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      const reply = text === '' ? reasoning : text
      json(res, 200, {
        ok: true,
        model,
        provider: PROVIDER,
        latencyMs: Date.now() - started,
        text: reply.slice(0, 200),
        finish,
      })
    } catch (error) {
      json(res, 200, {
        ok: false,
        model,
        provider: PROVIDER,
        latencyMs: Date.now() - started,
        error: controller.signal.aborted
          ? 'timeout'
          : error instanceof Error ? error.message : 'test failed',
      })
    } finally {
      clearTimeout(timer)
    }
  })

  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-ollama-cloud-provider: HTTP routes')
}
