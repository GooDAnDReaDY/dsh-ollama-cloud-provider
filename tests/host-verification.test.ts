import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import { resolveConfig } from '../src/config.ts'
import { isLoopbackAddress, isLoopbackHostname } from '../src/local-host.ts'
import { applyRoutes, defaultVerifyHost } from '../src/routes.ts'

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

test('default host verifier rejects a public 200 endpoint (unauthenticated bypass #42, #56)', async () => {
  // A synthetic or public host that answers 200 OK to all requests without auth
  const api = createServer((_req, res) => {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end('{"version":"1.0.0"}')
  })
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const { port } = api.address() as AddressInfo
  try {
    const fakeReq = {
      headers: { cookie: 'dsh-auth-x=forged-cookie' },
      socket: { localPort: port },
    } as never
    const verified = await defaultVerifyHost(fakeReq)
    assert.equal(verified, false)
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()))
  }
})

test('default host verifier accepts a verified 200 session and rejects forged cookies', async () => {
  // An authenticated host that returns 200 for valid cookie, and 401 for anonymous / forged
  const api = createServer((req, res) => {
    if (req.headers.cookie?.includes('valid-session')) {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('{"version":"1.0.0"}')
    } else {
      res.statusCode = 401
      res.end()
    }
  })
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const { port } = api.address() as AddressInfo
  try {
    const validReq = {
      headers: { cookie: 'dsh-auth-x=valid-session' },
      socket: { localPort: port },
    } as never
    assert.equal(await defaultVerifyHost(validReq), true)

    const forgedReq = {
      headers: { cookie: 'dsh-auth-x=forged' },
      socket: { localPort: port },
    } as never
    assert.equal(await defaultVerifyHost(forgedReq), false)

    const noCookieReq = {
      headers: {},
      socket: { localPort: port },
    } as never
    assert.equal(await defaultVerifyHost(noCookieReq), false)
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()))
  }
})

test('loopback classification accepts only literal addresses, never DNS names (#135)', () => {
  assert.equal(isLoopbackHostname('127.0.0.1'), true)
  assert.equal(isLoopbackHostname('127.0.0.2'), true)
  assert.equal(isLoopbackHostname('::1'), true)
  assert.equal(isLoopbackHostname('[::1]'), true)
  assert.equal(isLoopbackHostname('localhost'), true)
  assert.equal(isLoopbackHostname('127.0.0.1.attacker.example'), false)
  assert.equal(isLoopbackHostname('127.evil.example'), false)
  assert.equal(isLoopbackHostname('::ffff:127.0.0.1.attacker.example'), false)

  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('127.0.0.1.attacker.example'), false)
  assert.equal(isLoopbackAddress('localhost'), false)
  assert.equal(isLoopbackAddress(undefined), false)
})

test('health refuses a rebinding Host that only starts with 127 (#135)', async () => {
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

  const health = routes.get('/dsh-ollama/health')
  assert.ok(health !== undefined)

  const rebinding = response()
  await health({ method: 'GET', headers: { host: '127.0.0.1.attacker.example:3080' }, socket: { remoteAddress: '127.0.0.1' } }, rebinding)
  assert.equal(rebinding.statusCode, 403)

  const loopback = response()
  await health({ method: 'GET', headers: { host: '127.0.0.1:3080' }, socket: { remoteAddress: '127.0.0.1' } }, loopback)
  assert.equal(loopback.statusCode, 200)
})
