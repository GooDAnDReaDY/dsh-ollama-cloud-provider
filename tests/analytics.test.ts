import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregateSessions, type SessionMetadata } from '../src/analytics.ts'

const at = Date.UTC(2026, 9, 14, 14, 0, 0)

const session: SessionMetadata = {
  id: 'session-1',
  createdAt: at,
  lastPromptAt: at,
  usage: { uncachedInputTokens: 1_000_000, outputTokens: 0 },
  lastUsed: { provider: 'ollama-cloud', model: 'gpt-oss:120b' },
  stats: { steps: 1, turns: 1, llmMs: 100, ttftMs: 50, ttftSteps: 1 },
}

test('analytics prices a session with the shared estimate', () => {
  const report = aggregateSessions([session], 30, at + 1_000)
  assert.equal(report.models.length, 1)
  assert.ok(Math.abs((report.models[0]?.cost ?? 0) - 0.15) < 1e-9)
  assert.equal(report.models[0]?.priced, true)
})

test('analytics honors per-model price overrides', () => {
  const report = aggregateSessions([session], 30, at + 1_000, {
    'gpt-oss:120b': { input: 1, output: 1 },
  })
  assert.ok(Math.abs((report.models[0]?.cost ?? 0) - 1) < 1e-9)
})
