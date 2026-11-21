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
  readonly missingModels?: readonly string[]
  readonly failShow?: readonly string[]
  readonly pullError?: string
  readonly removeError?: string
}

const TAGS = {
  models: [
    {
      name: 'gpt-oss:120b',
      model: 'gpt-oss:120b',
      size: 4 * 1024 * 1024 * 1024,
      digest: 'sha256:gpt',
      modified_at: '2026-01-01T00:00:00Z',
      capabilities: ['completion', 'tools', 'thinking'],
      details: { family: 'gpt-oss', parameter_size: '120B', quantization_level: 'Q4_K_M' },
    },
    {
      name: 'llama3.2:3b',
      model: 'llama3.2:3b',
      size: 2 * 1024 * 1024 * 1024,
      digest: 'sha256:llama',
      modified_at: '2026-01-02T00:00:00Z',
      capabilities: ['completion'],
      details: { family: 'llama', parameter_size: '3B', quantization_level: 'Q4_0' },
    },
  ],
}

const PS = {
  models: [
    {
      name: 'gpt-oss:120b',
      model: 'gpt-oss:120b',
      size: 4 * 1024 * 1024 * 1024,
      size_vram: 3 * 1024 * 1024 * 1024,
      digest: 'sha256:gpt',
      expires_at: '2026-01-01T00:05:00Z',
    },
  ],
}

const SHOW = {
  details: { family: 'gpt-oss', parameter_size: '120B', quantization_level: 'Q4_K_M' },
  model_info: {
    'general.architecture': 'gpt-oss',
    'gptoss.context_length': 131072,
    'general.parameter_count': 120_000_000_000,
  },
  capabilities: ['completion', 'tools', 'thinking', 'vision'],
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
    const text = req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT'
      ? await bodyOf(req)
      : ''
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
      case 'GET /api/ps':
        json(res, 200, PS)
        return
      case 'POST /api/pull': {
        const model = (body as { model?: string } | undefined)?.model ?? 'gpt-oss:120b'
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
        if (options.pullError !== undefined) {
          res.write(`${JSON.stringify({ error: options.pullError })}\n`)
          res.end()
          return
        }
        res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`)
        res.write(`${JSON.stringify({ status: 'downloading', digest: 'sha256:gpt', total: 100, completed: 50 })}\n`)
        res.write(`${JSON.stringify({ status: 'success', model })}\n`)
        res.end()
        return
      }
      case 'DELETE /api/delete':
        if (options.removeError !== undefined) json(res, 500, { error: options.removeError })
        else json(res, 200, {})
        return
      case 'GET /v1/models':
        json(res, 200, { data: [{ id: 'gpt-oss:120b' }, { id: 'llama3.2:3b' }] })
        return
      case 'POST /api/show': {
        const model = (body as { model?: string } | undefined)?.model ?? 'gpt-oss:120b'
        if (options.missingModels?.includes(model) === true) {
          json(res, 404, { error: 'model not found' })
          return
        }
        if (options.failShow?.includes(model) === true) {
          json(res, 503, { error: 'temporary' })
          return
        }
        json(res, 200, { ...SHOW, model })
        return
      }
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
