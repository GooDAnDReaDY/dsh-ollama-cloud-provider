import type { ResolvedConfig, TransportId } from './config.ts'

function trim(url: string): string {
  return url.replace(/\/+$/, '')
}

export function rootFor(config: ResolvedConfig): string {
  return trim(config.apiBase)
}

export function modelsUrlFor(config: ResolvedConfig): string {
  return `${rootFor(config)}/v1/models`
}

export function tagsUrlFor(config: ResolvedConfig): string {
  return `${rootFor(config)}/api/tags`
}

export function showUrlFor(config: ResolvedConfig): string {
  return `${rootFor(config)}/api/show`
}

/** Endpoint for one model and one wire protocol. */
export function endpointFor(transport: TransportId, config: ResolvedConfig): string {
  return transport === 'openai-chat'
    ? `${trim(config.openAiBase)}/chat/completions`
    : `${rootFor(config)}/api/chat`
}
