import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.attachments` and `ctx.settings` service merges into this program.
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'

import { OllamaCloudAdapter } from './adapter.ts'
import { setBestEffortLogger } from './best-effort.ts'
import { applyCommands } from './commands.ts'
import { Config, NS, resolveConfig, unwrapVolatileConfig } from './config.ts'
import { createKeyPool } from './credentials.ts'
import { registerPluginUpdater } from './plugin-updater.ts'
import { PROVIDER } from './provider-ids.ts'
import { flushRequestLog, readRequestHeatmap } from './request-log.ts'
import { applyRoutes } from './routes.ts'
import { applyOllamaTuiSettings } from './tui-settings.ts'
import { createUsageReader } from './usage.ts'

export const name = 'llm-ollama-cloud'
export const inject = ['llm']

export { Config, resolveConfig }
export { PROVIDER } from './provider-ids.ts'
export { OllamaCloudAdapter }
export type { OllamaCloudAdapterDeps } from './adapter.ts'
export type { Config as OllamaCloudConfig, ResolvedConfig, TransportId } from './config.ts'
export type { ResolvedKey } from './credentials.ts'
export { createKeyPool, createKeyResolver } from './credentials.ts'
export { applyCommands } from './commands.ts'
export type { CommandDeps } from './commands.ts'
export { applyRoutes } from './routes.ts'
export type { RouteDeps } from './routes.ts'
export type { UsageReport, UsageResult, UsageWindow } from './usage.ts'
export { normalizeBalance, normalizeUsage, createUsageReader } from './usage.ts'
export { classifyResponseError } from './errors.ts'
export { clearCatalogCache, describeModel, effectiveModel } from './catalog.ts'

/**
 * Register the `ollama-cloud` route against the dsh `llm` service. Requests
 * resolve their key per call, so a changed credential reaches the next request
 * without a restart.
 */
export function apply(ctx: Context, config: Config): void {
  const logger = ctx.logger('llm-ollama-cloud')
  setBestEffortLogger({ debug: (message) => logger.debug(message) })
  const current = () => resolveConfig(unwrapVolatileConfig(config))
  const keys = createKeyPool(ctx, current)
  const usage = createUsageReader(current, (provider) => keys.resolve(provider))
  const adapter = new OllamaCloudAdapter({
    config: current,
    resolveKey: (provider) => keys.resolve(provider),
    resolveKeys: (provider) => keys.resolveAll(provider),
    resolveAttachments: () => ctx.get('attachments'),
    warn: (message) => ctx.logger('llm-ollama-cloud').warn(message),
  })

  ctx.llm.registerConfigurableProviders([{
    provider: PROVIDER,
    displayName: 'Ollama Cloud',
    settingsNs: NS,
    settingsPath: [],
    defaultBaseURL: 'https://ollama.com',
  }])
  ctx.llm.registerAdapter([PROVIDER], adapter)
  logger.info(`registered provider: ${PROVIDER}`)
  ctx.effect(() => () => { void flushRequestLog() }, 'dsh-ollama-cloud-provider: flush request log')

  // The plugin ships its own UI; declaring that keeps SettingsForms from
  // publishing an auto-generated page for this entry.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.configure({ auto: false }, ctx.fiber)
  })

  ctx.inject(['commands'], (commandCtx) => {
    applyCommands(commandCtx, { config: current, pool: keys, usage, adapter })
  })

  let refreshTuiSettings: (() => void) | undefined
  ctx.inject(['tuiSettingsSections'], (tuiCtx) => {
    refreshTuiSettings = applyOllamaTuiSettings(tuiCtx, {
      ns: NS,
      title: 'Ollama Cloud',
      apiKeyRef: () => current().apiKeyEnv,
      accountSlots: () => [
        { id: 'default', label: 'default' },
        ...current().accounts.map((account, index) => ({
          id: typeof account.label === 'string' && account.label.trim() !== ''
            ? account.label.trim()
            : `account-${index + 2}`,
          label: typeof account.label === 'string' && account.label.trim() !== ''
            ? account.label.trim()
            : `account-${index + 2}`,
        })),
      ],
      visibleModels: () => current().visibleModels,
      activeAccount: () => current().activeAccount,
      stickySession: () => current().stickySession,
      showSidebarQuota: () => current().showSidebarQuota,
      planLabel: () => current().planLabel,
    })
  })

  ctx.inject(['webServer'], (webCtx) => {
    applyRoutes(webCtx, webCtx.webServer, {
      config: current,
      adapter,
      pool: keys,
      usage,
      heatmap: readRequestHeatmap,
      refreshTui: () => refreshTuiSettings?.(),
    })
    webCtx.effect(() => registerPluginUpdater(webCtx, {
      endpoint: '/dsh-ollama/update',
      packageName: '@goodandready/dsh-ollama-cloud-provider',
      manifestUrl: new URL('../package.json', import.meta.url),
    }), 'dsh-ollama-cloud-provider: plugin updater')
  })
}
