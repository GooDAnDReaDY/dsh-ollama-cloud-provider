import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { refreshCatalog } from '../src/catalog.ts'
import { catalogCachePath, clearCatalogSnapshot, loadCatalogSnapshot, saveCatalogSnapshot } from '../src/catalog-cache.ts'
import { resolveConfig } from '../src/config.ts'
import { GENERATED_MODELS } from '../src/models.generated.ts'

const base = 'https://catalog-cache.example'

test('persists a valid snapshot, rejects another endpoint and recovers from corruption', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ollama-cache-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const meta = GENERATED_MODELS['gpt-oss:120b']
    assert.ok(meta !== undefined)
    await saveCatalogSnapshot(base, ['gpt-oss:120b'], { 'gpt-oss:120b': meta })
    const snapshot = await loadCatalogSnapshot(base)
    assert.deepEqual(snapshot?.ids, ['gpt-oss:120b'])
    assert.equal(await loadCatalogSnapshot('https://other.example'), undefined)

    const path = catalogCachePath()
    assert.ok(path.startsWith(home))
    await writeFile(path, '{not json', 'utf8')
    assert.equal(await loadCatalogSnapshot(base), undefined)

    await saveCatalogSnapshot(base, ['gpt-oss:120b'], { 'gpt-oss:120b': meta })
    clearCatalogSnapshot()
    assert.equal(await loadCatalogSnapshot(base), undefined)
    assert.equal(await readFile(path, 'utf8').then(() => true).catch(() => false), false)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true }).catch((err: unknown) => { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err })
  }
})

test('serves an offline disk snapshot without a network call when autoRefresh is off', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ollama-cache-offline-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    await saveCatalogSnapshot(base, ['gpt-oss:120b'], {})
    let calls = 0
    const config = resolveConfig({ apiKey: 'k', apiBase: base, autoRefresh: false })
    const ids = await refreshCatalog(config, (async () => {
      calls += 1
      return new Response('{}', { status: 500 })
    }) as typeof fetch, false)
    assert.deepEqual(ids, ['gpt-oss:120b'])
    assert.equal(calls, 0)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true }).catch((err: unknown) => { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err })
  }
})
