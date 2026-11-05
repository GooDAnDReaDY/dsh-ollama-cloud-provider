import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface MockOllamaRequest {
  readonly method: string
  readonly path: string
  readonly headers: IncomingMessage['headers']
  readonly body: unknown
}

export interface MockOllama {
  readonly url: string
  readonly requests: readonly MockOllamaRequest[]
  close(): Promise<void>
}

export interface MockOllamaOptions {
  readonly port?: number
  readonly requireAuth?: boolean
  readonly apiKey?: string
}

const TAGS = {
  models: [
    { name: 'gpt-oss:120b', model: 'gpt-oss:120b', capabilities: ['completion', 'tools', 'thinking'] },
    { name: 'llama3.2:3b', model: 'llama3.2:3b', capabilities: ['completion'] },
  ],
}

const SHOW = {
  details: { family: 'gpt-oss', parameter_size: '120B', quantization_level: 'Q4_K_M' },
  model_info: {
    'general.architecture': 'gpt-oss',
    'gptoss.context_length': 131072,
    'general.parameter_count': 120_000_000_000,
  },
  capabilities: ['completion', 'tools', 'thinking'],
}

async function bodyOf(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function chatStream(res: ServerResponse, model: string): void {
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
  res.write(`${JSON.stringify({ model, message: { role: 'assistant', content: 'mock ' }, done: false })}\n`)
  res.write(`${JSON.stringify({ model, message: { role: 'assistant', content: 'reply' }, done: false })}\n`)
  res.write(`${JSON.stringify({ model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 12, eval_count: 3 })}\n`)
  res.end()
}

/** Deterministic local Ollama contract server for tests; never touches the network. */
export async function startMockOllama(options: MockOllamaOptions = {}): Promise<MockOllama> {
  const requests: MockOllamaRequest[] = []
  const requiredKey = options.apiKey ?? 'test-key'
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const text = req.method === 'POST' ? await bodyOf(req) : ''
    let body: unknown
    try {
      body = text === '' ? undefined : JSON.parse(text) as unknown
    } catch {
      json(res, 400, { error: 'invalid json' })
      return
    }
    requests.push({ method: req.method ?? '', path: url.pathname, headers: req.headers, body })
    if (options.requireAuth === true) {
      const header = req.headers.authorization
      if (header !== `Bearer ${requiredKey}`) {
        json(res, 401, { error: 'unauthorized' })
        return
      }
    }
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /api/version':
        json(res, 200, { version: '0.0.0-mock' })
        return
      case 'GET /api/tags':
        json(res, 200, TAGS)
        return
      case 'POST /api/show':
        json(res, 200, { ...SHOW, model: (body as { model?: string } | undefined)?.model ?? 'gpt-oss:120b' })
        return
      case 'POST /api/chat':
        chatStream(res, (body as { model?: string } | undefined)?.model ?? 'gpt-oss:120b')
        return
      case 'POST /api/web_search':
        json(res, 200, {
          results: [
            { url: 'https://example.com/a', title: 'A', content: 'alpha' },
            { url: 'https://example.com/b', title: 'B', content: 'beta' },
            { title: 'no url' },
          ],
        })
        return
      case 'POST /api/web_fetch':
        json(res, 200, { content: '# Mock page\n\nFetched body.' })
        return
      default:
        json(res, 404, { error: 'not found' })
    }
  })
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    }),
  }
}
