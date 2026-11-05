import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

import type { OllamaCloudAdapter } from './adapter.ts'
import { effectiveModel } from './catalog.ts'
import type { ResolvedConfig } from './config.ts'
import type { KeyPool, ResolvedKey } from './credentials.ts'
import { formatUsd, priceFor } from './pricing.ts'
import { PROVIDER } from './provider-ids.ts'
import { quotaBars, windowRows } from './quota-model.ts'
import type { UsageReader, UsageResult } from './usage.ts'
import {
  formatBytes,
  pullLocalModel,
  readLocalInventory,
  removeLocalModel,
  showLocalModel,
} from './local-models.ts'
import { isLocalEndpoint } from './model-probe.ts'

export interface CommandDeps {
  readonly config: () => ResolvedConfig
  readonly pool: KeyPool
  readonly usage: UsageReader
  readonly adapter: OllamaCloudAdapter
}

function bar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${clamped.toFixed(0)}%`
}

function reset(iso: string | undefined): string {
  if (iso === undefined) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return ` · resets ${date.toISOString().replace('T', ' ').slice(0, 16)}Z`
}

function relative(until: number): string {
  const delta = Math.max(0, until - Date.now())
  if (delta >= 86_400_000) return `${Math.round(delta / 86_400_000)}d`
  if (delta >= 3_600_000) return `${Math.round(delta / 3_600_000)}h`
  return `${Math.max(1, Math.round(delta / 60_000))}m`
}

function usageLines(result: UsageResult | undefined): string[] {
  if (result?.report === undefined) return [`Quota unavailable: ${result?.error ?? 'no report'}`]
  const lines = quotaBars(result.report).map((entry) => {
    const detail = entry.detail === undefined ? '' : ` · ${entry.detail}`
    return `${entry.label}: ${bar(entry.usedPercent)}${detail}${reset(entry.resetsAt)}`
  })
  for (const row of windowRows(result.report)) {
    lines.push(`${row.label}: ${row.totals.requests} requests · ${formatUsd(row.totals.usd)} · `
      + `${row.totals.inputTokens + row.totals.outputTokens} tokens`)
  }
  if (result.report.byModel.length > 0) {
    lines.push('By model:')
    for (const entry of result.report.byModel.slice(0, 10)) {
      lines.push(`  ${entry.model}: ${entry.requests} req · ${formatUsd(entry.usd)}`)
    }
  }
  return lines
}

async function accountsText(deps: CommandDeps): Promise<string> {
  let keys: readonly ResolvedKey[]
  try {
    keys = await deps.pool.resolveAll(PROVIDER)
  } catch {
    return 'Accounts: no credential'
  }
  if (keys.length === 0) return 'Accounts: no credential'
  const active = keys.find((entry) => deps.adapter.accountHealth(entry.key) === undefined)
  const lines = ['Accounts:']
  for (const [index, entry] of keys.entries()) {
    const health = deps.adapter.accountHealth(entry.key)
    const usage = await deps.usage.read(entry.key)
    const quota = quotaBars(usage?.report)
      .map((item) => `${item.label} ${item.usedPercent.toFixed(0)}% used`)
      .join(' / ')
    const tags = [
      entry.source,
      entry === active ? 'active' : '',
      health === undefined ? '' : `cooling ${health.reason} ${relative(health.coolingUntil)}`,
      quota === '' ? (usage?.error ?? '') : quota,
    ].filter((tag) => tag !== '')
    lines.push(`  ${index + 1}. ${entry.label ?? 'default'}: ${tags.join(' · ')}`)
  }
  return lines.join('\n')
}

function rulesText(deps: CommandDeps): string {
  const rules = deps.config().modelAccountRules
  if (rules.length === 0) return 'No model → account rules.'
  return rules.map((rule) => `${rule.pattern} → ${rule.account}`).join('\n')
}

async function modelsText(deps: CommandDeps): Promise<string> {
  const config = deps.config()
  try {
    const models = await deps.adapter.listModels(PROVIDER, { unfiltered: true })
    if (models.length === 0) return 'No models.'
    return models.map((model) => {
      const meta = effectiveModel(model.id, config)
      const price = priceFor(model.id, config.priceOverrides)
      const tags = [
        meta.free ? 'FREE' : price.priced ? `$${price.input}/$${price.output}` : 'unpriced',
        `${Math.round(meta.contextWindow / 1024)}K`,
        meta.input.includes('image') ? 'Image' : '',
        meta.reasoning.length > 0 ? `reasoning: ${meta.reasoning.join('/')}` : '',
      ].filter((tag) => tag !== '')
      return `- ${model.id} · ${tags.join(' · ')}`
    }).join('\n')
  } catch (error) {
    return `Models unavailable: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function testText(deps: CommandDeps, model: string): Promise<{ ok: boolean; text: string }> {
  const started = Date.now()
  let text = ''
  let reasoning = ''
  try {
    for await (const chunk of deps.adapter.stream({
      provider: PROVIDER,
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly OK.' }] }],
      reasoningEffort: ReasoningEffortId('off'),
      maxTokens: 64,
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'reasoning-delta') reasoning += chunk.text
    }
    if (text === '') {
      return {
        ok: false,
        text: `${model}: empty reply${reasoning === '' ? '' : ` (reasoning only: ${reasoning.slice(0, 80)})`}`,
      }
    }
    return {
      ok: true,
      text: `${model}: OK in ${Date.now() - started} ms · ${text.slice(0, 80)}`,
    }
  } catch (error) {
    return {
      ok: false,
      text: `${model}: failed — ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function localText(deps: CommandDeps): Promise<string> {
  const config = deps.config()
  if (!isLocalEndpoint(config)) return 'Local models are available only with a local Ollama endpoint.'
  const inventory = await readLocalInventory(config)
  const running = new Map(inventory.running.map((entry) => [entry.name, entry]))
  const lines = [
    `Local Ollama · disk ${formatBytes(inventory.diskBytes)} · running ${formatBytes(inventory.runningBytes)}`,
  ]
  if (inventory.models.length === 0) return [...lines, 'No local models.'].join('\n')
  for (const model of inventory.models) {
    const active = running.get(model.name)
    const details = model.details === undefined
      ? ''
      : [model.details.family, model.details.parameterSize, model.details.quantization]
        .filter((entry): entry is string => entry !== undefined)
        .join(' ')
    lines.push(`- ${model.name} · ${formatBytes(model.size)}${active === undefined ? '' : ' · RUNNING'}`
      + `${details === '' ? '' : ` · ${details}`}`)
  }
  return lines.join('\n')
}

async function localPsText(deps: CommandDeps): Promise<string> {
  const config = deps.config()
  if (!isLocalEndpoint(config)) return 'Local models are available only with a local Ollama endpoint.'
  const inventory = await readLocalInventory(config)
  if (inventory.running.length === 0) return 'No running models.'
  return inventory.running
    .map((entry) => `- ${entry.name} · VRAM ${formatBytes(entry.sizeVram)}`
      + `${entry.expiresAt === undefined ? '' : ` · expires ${entry.expiresAt}`}`)
    .join('\n')
}

async function localShowText(deps: CommandDeps, model: string): Promise<string> {
  const config = deps.config()
  if (!isLocalEndpoint(config)) return 'Local models are available only with a local Ollama endpoint.'
  const show = await showLocalModel(config, model)
  const lines = [`Local model: ${show.name}`]
  if (show.modifiedAt !== undefined) lines.push(`Modified: ${show.modifiedAt}`)
  if (show.details !== undefined) {
    lines.push(`Details: ${show.details.family ?? '?'} ${show.details.parameterSize ?? ''} ${show.details.quantization ?? ''}`.trim())
  }
  if (show.capabilities.length > 0) lines.push(`Capabilities: ${show.capabilities.join(', ')}`)
  if (show.parameters !== undefined) lines.push(`Parameters:\n${show.parameters.slice(0, 2000)}`)
  return lines.join('\n')
}

async function localPullText(deps: CommandDeps, model: string): Promise<string> {
  const config = deps.config()
  if (!isLocalEndpoint(config)) return 'Local models are available only with a local Ollama endpoint.'
  let fraction = 0
  const result = await pullLocalModel(config, model, (progress) => {
    if (progress.total !== undefined && progress.total > 0) fraction = (progress.completed ?? 0) / progress.total
  })
  return `${model}: ${result.status}${fraction > 0 ? ` · ${Math.round(fraction * 100)}%` : ''}`
}

async function localRemoveText(deps: CommandDeps, model: string, confirmed: boolean): Promise<string> {
  if (!confirmed) return `Refusing to remove ${model}: add --yes to confirm.`
  const config = deps.config()
  if (!isLocalEndpoint(config)) return 'Local models are available only with a local Ollama endpoint.'
  await removeLocalModel(config, model)
  return `${model}: removed.`
}

async function statusText(deps: CommandDeps): Promise<string> {
  const config = deps.config()
  const rules = config.modelAccountRules.length === 0
    ? 'none'
    : config.modelAccountRules.map((rule) => `${rule.pattern} → ${rule.account}`).join(', ')
  const usage = await deps.usage.read()
  const models = await deps.adapter.listModels(PROVIDER, { unfiltered: true }).catch(() => [])
  return [
    'Ollama Cloud provider',
    `Key: ${config.apiKeyEnv} · ${config.transport}`,
    await accountsText(deps),
    ...usageLines(usage),
    `Models: ${models.length}`,
    `Rules: ${rules}`,
  ].join('\n')
}

export function applyCommands(ctx: Context, deps: CommandDeps): void {
  ctx.commands.register({
    name: 'ollama',
    description: 'Ollama Cloud status, balance, accounts, models and rules',
    input: { hint: 'status | usage | balance | accounts | models | rules | test [model] | local [models|ps|show|pull|remove] [model]' },
    handler: async (invocation) => {
      const raw = invocation.rawInput.trim()
      const parts = raw === '' ? ['status'] : raw.split(/\s+/)
      const verb = parts[0] ?? 'status'
      const arg = parts.slice(1).join(' ').trim()

      switch (verb.toLowerCase()) {
        case 'status':
          return { kind: 'success', text: await statusText(deps) }
        case 'usage':
          return { kind: 'success', text: usageLines(await deps.usage.usage('7d')).join('\n') }
        case 'balance': {
          const result = await deps.usage.read()
          return { kind: 'success', text: usageLines(result).join('\n') }
        }
        case 'accounts':
          return { kind: 'success', text: await accountsText(deps) }
        case 'models':
          return { kind: 'success', text: await modelsText(deps) }
        case 'rules':
          return { kind: 'success', text: rulesText(deps) }
        case 'test': {
          const result = await testText(deps, arg === '' ? 'gpt-oss:120b' : arg)
          return result.ok
            ? { kind: 'success', text: result.text }
            : { kind: 'error', text: result.text }
        }
        case 'local': {
          const words = arg === '' ? [] : arg.split(/\s+/)
          const action = (words[0] ?? 'models').toLowerCase()
          const confirmed = words.includes('--yes')
          const model = words.slice(1).filter((word) => word !== '--yes').join(' ')
          try {
            if (action === 'models') return { kind: 'success', text: await localText(deps) }
            if (action === 'ps') return { kind: 'success', text: await localPsText(deps) }
            if (model === '') {
              return { kind: 'error', text: `Usage: /ollama local ${action} <model>` }
            }
            if (action === 'show') return { kind: 'success', text: await localShowText(deps, model) }
            if (action === 'pull') return { kind: 'success', text: await localPullText(deps, model) }
            if (action === 'remove') {
              return {
                kind: confirmed ? 'success' : 'error',
                text: await localRemoveText(deps, model, confirmed),
              }
            }
            return { kind: 'error', text: `Unknown local action "${action}". Use models, ps, show, pull, or remove.` }
          } catch (error) {
            return { kind: 'error', text: error instanceof Error ? error.message : 'local command failed' }
          }
        }
        default:
          return {
            kind: 'error',
            text: `Unknown /ollama argument "${verb}". Use status, usage, balance, accounts, models, rules, test [model], or local.`,
          }
      }
    },
  })
}
