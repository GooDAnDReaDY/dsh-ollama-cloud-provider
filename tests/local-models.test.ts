import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveConfig } from '../src/config.ts'
import {
  formatBytes,
  pullLocalModel,
  readLocalInventory,
  removeLocalModel,
  showLocalModel,
} from '../src/local-models.ts'
import { startMockOllama } from './mock-ollama.ts'

test('local inventory reports tags sizes, details and running VRAM', async () => {
  const mock = await startMockOllama()
  try {
    const config = resolveConfig({ apiKeyEnv: '', apiBase: mock.url })
    const inventory = await readLocalInventory(config)
    assert.equal(inventory.models.length, 2)
    assert.equal(inventory.models[0]?.name, 'gpt-oss:120b')
    assert.equal(inventory.models[0]?.size, 4 * 1024 * 1024 * 1024)
    assert.equal(inventory.models[0]?.details?.parameterSize, '120B')
    assert.equal(inventory.diskBytes, 6 * 1024 * 1024 * 1024)
    assert.equal(inventory.running[0]?.name, 'gpt-oss:120b')
    assert.equal(inventory.runningBytes, 3 * 1024 * 1024 * 1024)
    assert.equal(formatBytes(inventory.diskBytes), '6.0 GB')
    assert.equal(mock.requests.some((entry) => entry.path === '/api/ps'), true)
  } finally {
    await mock.close()
  }
})

test('local show, pull progress and confirmed removal use the local API', async () => {
  const mock = await startMockOllama()
  try {
    const config = resolveConfig({ apiKeyEnv: '', apiBase: mock.url })
    const show = await showLocalModel(config, 'gpt-oss:120b')
    assert.equal(show.name, 'gpt-oss:120b')
    assert.ok(show.capabilities.includes('tools'))

    const progress: Array<{ status: string; completed?: number; total?: number }> = []
    const last = await pullLocalModel(config, 'llama3.2:3b', (entry) => progress.push(entry))
    assert.equal(last.status, 'success')
    assert.ok(progress.some((entry) => entry.status === 'downloading' && entry.completed === 50))
    assert.equal(mock.requests.some((entry) => entry.path === '/api/pull'), true)

    await removeLocalModel(config, 'llama3.2:3b')
    const remove = mock.requests.find((entry) => entry.path === '/api/delete')
    assert.equal(remove?.method, 'DELETE')
    assert.deepEqual(remove?.body, { model: 'llama3.2:3b' })
  } finally {
    await mock.close()
  }
})

test('local management rejects cloud endpoints, invalid names and pull errors', async () => {
  const cloud = resolveConfig({ apiKey: 'k' })
  await assert.rejects(readLocalInventory(cloud), /local endpoint required/)
  assert.equal(formatBytes(Number.NaN), '0 B')

  const mock = await startMockOllama({ pullError: 'disk full' })
  try {
    const config = resolveConfig({ apiKeyEnv: '', apiBase: mock.url })
    await assert.rejects(removeLocalModel(config, '../etc/passwd'), /invalid model name/)
    await assert.rejects(pullLocalModel(config, 'llama3.2:3b'), /disk full/)
  } finally {
    await mock.close()
  }
})
