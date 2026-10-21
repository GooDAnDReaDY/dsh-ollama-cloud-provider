import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveConfig } from '../src/config.ts'
import { applyRoutes } from '../src/routes.ts'

function fakeRes(): {
  statusCode: number
  setHeader: (key: string, value: string) => void
  end: (value: string) => void
  body: () => string
} {
  let status = 0
  let body = ''
  const headers: Record<string, string> = {}
  return {
    get statusCode() { return status },
    set statusCode(value: number) { status = value },
    setHeader(key: string, value: string) { headers[key] = value },
    end(value: string) { body = value },
    body: () => body,
  }
}

test('state route serves the catalog and write routes enforce JSON', async () => {
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const ctx = {
    get: () => undefined,
    effect: (fn: () => () => void) => { fn(); return () => {} },
  } as never
  const web = {
    register: ({ path, handler }: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
      routes.set(path, handler)
      return () => {}
    },
  } as never
  const config = resolveConfig({ apiKey: 'k' })
  const adapter = {
    listModels: async () => [{
      provider: 'ollama-cloud',
      id: 'gpt-oss:120b',
      name: 'gpt-oss:120b',
      description: 'native',
      inputModalities: ['text'],
    }],
    accountHealth: () => undefined,
    routingTrace: () => [],
    stream: async function* () {},
  }
  const pool = {
    resolveAll: async () => [],
    resolve: async () => { throw new Error('missing') },
  }
  const usage = {
    read: async () => undefined,
    usage: async () => undefined,
    clear: () => {},
  }
  applyRoutes(ctx, web, { config: () => config, adapter, pool, usage } as never)

  const stateRoute = routes.get('/dsh-ollama/state')
  assert.ok(stateRoute !== undefined)
  const res = fakeRes()
  await stateRoute({ method: 'GET', headers: { host: '127.0.0.1:3080' }, url: '/' }, res)
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body()) as { models: Array<{ id: string }>; key: { configured: boolean } }
  assert.equal(body.models.length, 1)
  assert.equal(body.models[0]?.id, 'gpt-oss:120b')
  assert.equal(body.key.configured, false)

  const configRoute = routes.get('/dsh-ollama/config')
  assert.ok(configRoute !== undefined)
  const denied = fakeRes()
  await configRoute({
    method: 'POST',
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress: '127.0.0.1' },
  }, denied)
  assert.equal(denied.statusCode, 415)
})
