import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import { resolveConfig } from '../src/config.ts'
import { applyRoutes } from '../src/routes.ts'

function response(): { statusCode: number; setHeader: () => void; end: () => void } {
  return { statusCode: 0, setHeader: () => {}, end: () => {} }
}

test('default host verifier rejects a public 404 probe', async () => {
  const api = createServer((_req, res) => {
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const { port } = api.address() as AddressInfo
  try {
    const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
    const ctx = { get: () => undefined, effect: (fn: () => () => void) => { fn(); return () => {} } } as never
    const web = {
      register: ({ path, handler }: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        routes.set(path, handler)
        return () => {}
      },
    } as never
    const config = resolveConfig({ apiKey: 'k' })
    applyRoutes(ctx, web, {
      config: () => config,
      adapter: {
        listModels: async () => [],
        accountHealth: () => undefined,
        routingTrace: () => [],
        stream: async function* () { yield { type: 'finish', reason: { kind: 'stop' } } },
      },
      pool: { resolveAll: async () => [], resolve: async () => { throw new Error('missing') } },
      usage: { read: async () => undefined, usage: async () => undefined, clear: () => {} },
    } as never)
    const state = routes.get('/dsh-ollama/state')
    assert.ok(state !== undefined)
    const result = response()
    await state({
      method: 'GET',
      headers: { cookie: 'dsh-auth-x=valid', host: 'attacker.example' },
      socket: { remoteAddress: '127.0.0.1', localPort: port },
    }, result)
    assert.equal(result.statusCode, 403)
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()))
  }
})
