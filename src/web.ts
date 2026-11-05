import { WebError, type WebFetchProvider, type WebFetchRequest, type WebFetchResult, type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web'

import { createAttemptBudget } from './attempt.ts'
import { redactText, sanitizeUrl } from './sanitize.ts'

export const OLLAMA_WEB_PROVIDER_ID = 'ollama-cloud'
export const MAX_SEARCH_RESULTS = 10
export const MAX_FETCH_CHARS = 256 * 1024
export const WEB_TIMEOUT_MS = 15_000

export interface OllamaWebOptions {
  readonly baseURL: () => string
  readonly resolveApiKey: () => Promise<string | undefined>
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

interface SearchEntry {
  url?: unknown
  title?: unknown
  content?: unknown
}

export function decodeSearchResponse(body: unknown): WebSearchResult {
  const results = (body as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) {
    throw new WebError('ollama-cloud web search answered without a "results" array', 'OLLAMA_WEB_BAD_REPLY')
  }
  const sources: WebSearchSource[] = []
  for (const entry of results) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as SearchEntry
    if (typeof record.url !== 'string' || record.url === '') continue
    sources.push({
      url: record.url,
      ...(typeof record.title === 'string' && record.title !== '' ? { title: record.title } : {}),
      ...(typeof record.content === 'string' && record.content !== '' ? { snippet: record.content } : {}),
    })
  }
  return { sources, truncated: false }
}

export function decodeFetchResponse(body: unknown): { content: string; truncated: boolean } {
  const content = (body as { content?: unknown } | null)?.content
  if (typeof content !== 'string') {
    throw new WebError('ollama-cloud web fetch answered without text "content"', 'OLLAMA_WEB_BAD_REPLY')
  }
  return content.length > MAX_FETCH_CHARS
    ? { content: content.slice(0, MAX_FETCH_CHARS), truncated: true }
    : { content, truncated: false }
}

function isRedirectFailure(error: unknown): boolean {
  let current: unknown = error
  while (current instanceof Error) {
    if (/redirect/i.test(current.message)) return true
    current = current.cause
  }
  return false
}

async function postOnce(
  options: OllamaWebOptions,
  url: string,
  payload: unknown,
  caller: AbortSignal | undefined,
): Promise<{ status: number; body: unknown }> {
  const apiKey = await options.resolveApiKey()
  if (apiKey === undefined) {
    throw new WebError(
      'ollama-cloud web capabilities need an API key; configure the credential reference through plugin settings',
      'OLLAMA_WEB_MISSING_CREDENTIAL',
    )
  }
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? WEB_TIMEOUT_MS
  const safeUrl = sanitizeUrl(url)
  const budget = createAttemptBudget(timeoutMs, caller)
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(apiKey === '' ? {} : { authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: budget.signal,
    })
  } catch (error) {
    budget.dispose()
    if (budget.callerAborted) {
      throw new WebError('ollama-cloud web request aborted by caller', 'ABORTED', { cause: error })
    }
    if (budget.timedOut) {
      throw new WebError(`ollama-cloud web request timed out after ${timeoutMs}ms`, 'OLLAMA_WEB_TIMEOUT', { cause: error })
    }
    if (isRedirectFailure(error)) {
      throw new WebError(`${safeUrl} attempted a redirect`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const detail = error instanceof Error && error.message !== '' ? `: ${redactText(error.message)}` : ''
    throw new WebError(`could not reach ${safeUrl}${detail}`, 'OLLAMA_WEB_TRANSPORT', { cause: error })
  }
  if (!response.ok) {
    budget.dispose()
    await response.body?.cancel()
    const hint = response.status === 401 || response.status === 403 ? '; check the API key' : ''
    throw new WebError(`${safeUrl} answered ${response.status}${hint}`, 'WEB_PROVIDER_ERROR')
  }
  try {
    return { status: response.status, body: await response.json() }
  } catch (error) {
    if (budget.callerAborted) {
      throw new WebError('ollama-cloud web request aborted by caller', 'ABORTED', { cause: error })
    }
    if (budget.timedOut) {
      throw new WebError(`ollama-cloud web request timed out after ${timeoutMs}ms`, 'OLLAMA_WEB_TIMEOUT', { cause: error })
    }
    throw new WebError(`${safeUrl} did not answer with JSON`, 'OLLAMA_WEB_BAD_REPLY', { cause: error })
  } finally {
    budget.dispose()
  }
}

async function postJson(
  options: OllamaWebOptions,
  suffix: string,
  payload: unknown,
  caller: AbortSignal | undefined,
): Promise<{ status: number; body: unknown }> {
  const base = options.baseURL().replace(/\/+$/, '')
  if (!URL.canParse(base)) {
    throw new WebError('ollama-cloud web capabilities need a valid API base URL', 'WEB_PROVIDER_ERROR')
  }
  const url = `${base}${suffix}`
  try {
    return await postOnce(options, url, payload, caller)
  } catch (error) {
    const retryable = error instanceof WebError
      && (error.code === 'OLLAMA_WEB_TIMEOUT' || error.code === 'OLLAMA_WEB_TRANSPORT')
    if (!retryable || caller?.aborted === true) throw error
  }
  return postOnce(options, url, payload, caller)
}

abstract class OllamaWebEndpoint {
  readonly id = OLLAMA_WEB_PROVIDER_ID

  constructor(protected readonly options: OllamaWebOptions) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL())
  }
}

export class OllamaWebSearchProvider extends OllamaWebEndpoint implements WebSearchProvider {
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const { body } = await postJson(
      this.options,
      '/api/web_search',
      {
        query: request.query,
        ...(request.maxResults === undefined
          ? {}
          : { max_results: Math.min(request.maxResults, MAX_SEARCH_RESULTS) }),
      },
      signal,
    )
    return decodeSearchResponse(body)
  }
}

export class OllamaWebFetchProvider extends OllamaWebEndpoint implements WebFetchProvider {
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const { status, body } = await postJson(this.options, '/api/web_fetch', { url: request.url }, signal)
    const decoded = decodeFetchResponse(body)
    return {
      url: request.url,
      statusCode: status,
      body: { kind: 'text', content: decoded.content },
      truncated: decoded.truncated,
    }
  }
}
