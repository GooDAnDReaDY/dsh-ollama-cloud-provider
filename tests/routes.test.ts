import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

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

function postJson(value: unknown): unknown {
  const payload = Buffer.from(JSON.stringify(value))
  return {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield payload
    },
  }
}

test('state route serves the catalog and write routes enforce JSON', async () => {
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const written: Array<{ ref: unknown; key: string }> = []
  const cleared: unknown[] = []
  const credentials = {
    describe: async () => ({ configured: false, writable: true }),
    set: async (ref: unknown, key: string) => { written.push({ ref, key }) },
    unset: async (ref: unknown) => { cleared.push(ref) },
  }
  const ctx = {
    get: (name: string) => name === 'credentials' ? credentials : undefined,
    effect: (fn: () => () => void) => { fn(); return () => {} },
  } as never
  const web = {
    register: ({ path, handler }: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
      routes.set(path, handler)
      return () => {}
    },
  } as never
  const config = resolveConfig({ apiKey: 'k' })
  let seen: GenerateOptions | undefined
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
    stream: async function* (options: GenerateOptions): AsyncGenerator<StreamChunk> {
      seen = options
      yield { type: 'reasoning-delta', index: 0, text: 'thinking-only' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
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
  applyRoutes(ctx, web, { config: () => config, adapter, pool, usage, verifyHost: async () => true } as never)

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
  assert.equal(denied.statusCode, 403)

  const sameOrigin = fakeRes()
  await configRoute({
    method: 'POST',
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      'content-type': 'text/plain',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }, sameOrigin)
  assert.equal(sameOrigin.statusCode, 415)

  const keyRoute = routes.get('/dsh-ollama/key')
  assert.ok(keyRoute !== undefined)
  const foreign = fakeRes()
  await keyRoute(postJson({ ref: 'OPENCODE_API_KEY', key: 'x' }), foreign)
  assert.equal(foreign.statusCode, 400)
  assert.equal(written.length, 0)

  const own = fakeRes()
  await keyRoute(postJson({ ref: 'OLLAMA_API_KEY_2', key: 'x' }), own)
  assert.equal(own.statusCode, 200)
  assert.equal(written.length, 1)

  const clearRoute = routes.get('/dsh-ollama/key/clear')
  assert.ok(clearRoute !== undefined)
  const foreignClear = fakeRes()
  await clearRoute(postJson({ ref: 'CLINEBOT_API_KEY' }), foreignClear)
  assert.equal(foreignClear.statusCode, 400)
  assert.equal(cleared.length, 0)

  const testRoute = routes.get('/dsh-ollama/test')
  assert.ok(testRoute !== undefined)
  const testRes = fakeRes()
  await testRoute(postJson({ model: 'gpt-oss:120b' }), testRes)
  assert.equal(testRes.statusCode, 200)
  const testBody = JSON.parse(testRes.body()) as { text: string }
  assert.equal(testBody.text, 'thinking-only')
  assert.equal(String(seen?.reasoningEffort), 'off')
  assert.equal(seen?.maxTokens, 64)
})

test('credential writes stay inside the plugin namespace', async () => {
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const mutations: Array<Array<{ path: string[]; value?: unknown }>> = []
  const written: Array<{ ref: unknown; key: string }> = []
  const settings = {
    writable: true,
    describe: () => [],
    mutate: async (_ns: string, ops: Array<{ path: string[]; value?: unknown }>) => { mutations.push(ops) },
  }
  const credentials = {
    describe: async () => ({ configured: false, writable: true }),
    set: async (ref: unknown, key: string) => { written.push({ ref, key }) },
    unset: async () => {},
  }
  const ctx = {
    get: (name: string) => name === 'settings' ? settings : name === 'credentials' ? credentials : undefined,
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
    listModels: async () => [],
    accountHealth: () => undefined,
    routingTrace: () => [],
    stream: async function* () { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  const pool = { resolveAll: async () => [], resolve: async () => { throw new Error('missing') } }
  const usage = { read: async () => undefined, usage: async () => undefined, clear: () => {} }
  applyRoutes(ctx, web, { config: () => config, adapter, pool, usage } as never)

  const configRoute = routes.get('/dsh-ollama/config')
  const keyRoute = routes.get('/dsh-ollama/key')
  assert.ok(configRoute !== undefined && keyRoute !== undefined)

  const foreignConfig = fakeRes()
  await configRoute(postJson({ apiKeyEnv: 'OTHER_PLUGIN_API_KEY' }), foreignConfig)
  assert.equal(foreignConfig.statusCode, 400)
  assert.equal(mutations.length, 0)

  const foreignAccount = fakeRes()
  await configRoute(postJson({ accounts: [{ label: 'x', apiKeyEnv: 'OTHER_PLUGIN_API_KEY' }] }), foreignAccount)
  assert.equal(foreignAccount.statusCode, 400)
  assert.equal(mutations.length, 0)

  const foreignKey = fakeRes()
  await keyRoute(postJson({ ref: 'OTHER_PLUGIN_API_KEY', key: 'x' }), foreignKey)
  assert.equal(foreignKey.statusCode, 400)
  assert.equal(written.length, 0)

  const ownConfig = fakeRes()
  await configRoute(postJson({ apiKeyEnv: 'OLLAMA_CUSTOM' }), ownConfig)
  assert.equal(ownConfig.statusCode, 200)
  assert.equal(mutations.length, 1)

  const ownKey = fakeRes()
  await keyRoute(postJson({ ref: 'OLLAMA_CUSTOM', key: 'x' }), ownKey)
  assert.equal(ownKey.statusCode, 200)
  assert.equal(written.length, 1)
})

test('write routes require a same-origin source and a loopback socket', async () => {
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
    listModels: async () => [],
    accountHealth: () => undefined,
    routingTrace: () => [],
    stream: async function* () { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  const pool = {
    resolveAll: async () => [],
    resolve: async () => { throw new Error('missing') },
  }
  const usage = { read: async () => undefined, usage: async () => undefined, clear: () => {} }
  applyRoutes(ctx, web, {
    config: () => config,
    adapter,
    pool,
    usage,
    verifyDesktop: async (req: { headers?: { cookie?: string } }) =>
      req.headers?.cookie === 'dsh-auth-abc=v1.token',
  } as never)

  const write = routes.get('/dsh-ollama/config')
  const read = routes.get('/dsh-ollama/state')
  assert.ok(write !== undefined && read !== undefined)

  const cases: Array<{ name: string; req: Record<string, unknown>; status: number }> = [
    { name: 'non-POST', req: { method: 'GET' }, status: 405 },
    {
      name: 'non-loopback Host',
      req: { headers: { host: '192.168.1.50:3080', origin: 'http://192.168.1.50:3080', 'content-type': 'text/plain' } },
      status: 403,
    },
    {
      name: 'cross-origin Origin',
      req: { headers: { host: '127.0.0.1:3080', origin: 'http://evil.example', 'content-type': 'text/plain' } },
      status: 403,
    },
    {
      name: 'non-loopback socket',
      req: {
        headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'text/plain' },
        socket: { remoteAddress: '192.168.1.50' },
      },
      status: 403,
    },
    {
      name: 'missing Origin and Referer',
      req: { headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' } },
      status: 403,
    },
    {
      name: 'cross-origin Referer',
      req: { headers: { host: '127.0.0.1:3080', referer: 'http://evil.example/', 'content-type': 'text/plain' } },
      status: 403,
    },
    {
      name: 'same-origin Origin passes the guard',
      req: { headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'text/plain' } },
      status: 415,
    },
    {
      name: 'Desktop shell cookie and UA pass the guard',
      req: {
        headers: {
          host: '127.0.0.1:3080',
          'user-agent': 'Mozilla/5.0 @deepseek-ai/dsh-desktop/0.2.1-rc.2 Electron/44.7.0',
          cookie: 'dsh-auth-abc=v1.token',
          'content-type': 'text/plain',
        },
      },
      status: 415,
    },
    {
      name: 'Desktop forged cookie is rejected',
      req: {
        headers: {
          host: '127.0.0.1:3080',
          'user-agent': 'Mozilla/5.0 @deepseek-ai/dsh-desktop/0.2.1-rc.2 Electron/44.7.0',
          cookie: 'dsh-auth-forged=v1.fake.fake',
          'content-type': 'text/plain',
        },
      },
      status: 403,
    },
    {
      name: 'Desktop UA without the auth cookie is rejected',
      req: {
        headers: {
          host: '127.0.0.1:3080',
          'user-agent': 'Mozilla/5.0 @deepseek-ai/dsh-desktop/0.2.1-rc.2 Electron/44.7.0',
          'content-type': 'text/plain',
        },
      },
      status: 403,
    },
    {
      name: 'Desktop cookie without the UA is rejected',
      req: {
        headers: {
          host: '127.0.0.1:3080',
          cookie: 'dsh-auth-abc=v1.token',
          'content-type': 'text/plain',
        },
      },
      status: 403,
    },
    {
      name: 'Desktop shell identity does not bypass a non-loopback socket',
      req: {
        headers: {
          host: '127.0.0.1:3080',
          'user-agent': 'Mozilla/5.0 @deepseek-ai/dsh-desktop/0.2.1-rc.2 Electron/44.7.0',
          cookie: 'dsh-auth-abc=v1.token',
          'content-type': 'text/plain',
        },
        socket: { remoteAddress: '192.168.1.50' },
      },
      status: 403,
    },
    {
      name: 'same-origin Referer passes the guard',
      req: { headers: { host: '127.0.0.1:3080', referer: 'http://127.0.0.1:3080/settings', 'content-type': 'text/plain' } },
      status: 415,
    },
  ]

  for (const item of cases) {
    const res = fakeRes()
    await write({
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
      ...item.req,
    }, res)
    assert.equal(res.statusCode, item.status, item.name)
  }

  const crossOriginRead = fakeRes()
  await read({ method: 'GET', headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' } }, crossOriginRead)
  assert.equal(crossOriginRead.statusCode, 403)

  const badReadMethod = fakeRes()
  await read({ method: 'PUT', headers: { host: '127.0.0.1:3080' } }, badReadMethod)
  assert.equal(badReadMethod.statusCode, 405)
})

test('sensitive reads require an authenticated host session', async () => {
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
    listModels: async () => [],
    accountHealth: () => undefined,
    routingTrace: () => [],
    stream: async function* () { yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  const pool = { resolveAll: async () => [], resolve: async () => { throw new Error('missing') } }
  const usage = { read: async () => undefined, usage: async () => undefined, clear: () => {} }
  applyRoutes(ctx, web, {
    config: () => config,
    adapter,
    pool,
    usage,
    verifyHost: async (req: { headers: { cookie?: string } }) => req.headers.cookie === 'dsh-auth-abc=valid',
  } as never)
  const state = routes.get('/dsh-ollama/state')
  const health = routes.get('/dsh-ollama/health')
  assert.ok(state !== undefined && health !== undefined)

  const anonymous = fakeRes()
  await state({ method: 'GET', headers: { host: '127.0.0.1:3080' } }, anonymous)
  assert.equal(anonymous.statusCode, 403)

  const forged = fakeRes()
  await state({ method: 'GET', headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-abc=fake' } }, forged)
  assert.equal(forged.statusCode, 403)

  const authenticated = fakeRes()
  await state({ method: 'GET', headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-abc=valid' } }, authenticated)
  assert.equal(authenticated.statusCode, 200)

  const publicHealth = fakeRes()
  await health({ method: 'GET', headers: { host: '127.0.0.1:3080' } }, publicHealth)
  assert.equal(publicHealth.statusCode, 200)
})

test('default Desktop verifier accepts only a host-verified cookie', async () => {
  const api = createServer((req, res) => {
    res.statusCode = req.headers.cookie?.includes('valid') === true ? 404 : 401
    res.end()
  })
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const { port } = api.address() as AddressInfo
  try {
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
      listModels: async () => [],
      accountHealth: () => undefined,
      routingTrace: () => [],
      stream: async function* () { yield { type: 'finish', reason: { kind: 'stop' } } },
    }
    const pool = {
      resolveAll: async () => [],
      resolve: async () => { throw new Error('missing') },
    }
    const usage = { read: async () => undefined, usage: async () => undefined, clear: () => {} }
    applyRoutes(ctx, web, { config: () => config, adapter, pool, usage } as never)
    const write = routes.get('/dsh-ollama/config')
    assert.ok(write !== undefined)

    const request = (cookie: string) => ({
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        host: `127.0.0.1:${port}`,
        'user-agent': 'Mozilla/5.0 @deepseek-ai/dsh-desktop/0.2.1-rc.2 Electron/44.7.0',
        cookie,
        'content-type': 'text/plain',
      },
    })

    const valid = fakeRes()
    await write(request('dsh-auth-abc=valid'), valid)
    assert.equal(valid.statusCode, 415)

    const forged = fakeRes()
    await write(request('dsh-auth-forged=fake'), forged)
    assert.equal(forged.statusCode, 403)
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()))
  }
})
