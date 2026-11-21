import assert from 'node:assert/strict'
import test from 'node:test'

import type { HostState } from '../src/client/api.ts'
import { draftOf, draftPatch, mergeLoadedDraft, patchOf } from '../src/client/settings-draft.ts'

function state(config: Partial<HostState['config']>): HostState {
  return {
    config: {
      apiKeyEnv: 'OLLAMA_API_KEY',
      apiBase: 'https://ollama.com',
      openAiBase: 'https://ollama.com/v1',
      usageUrl: 'https://ollama.com/api/usage',
      balanceUrl: 'https://ollama.com/api/balance',
      transport: 'native',
      modelTransports: {},
      requestTimeoutMs: 300000,
      streamIdleTimeoutMs: 300000,
      visibleModels: [],
      showAllModels: false,
      modelVisibility: {},
      filterModelsByPlan: true,
      contextWindow: null,
      contextWindowOverrides: {},
      maxOutputTokens: null,
      accounts: [],
      modelAccountRules: [],
      stickySession: true,
      activeAccount: '',
      showSidebarQuota: false,
      planLabel: '',
      priceOverrides: {},
      userAgent: 'test',
      ...config,
    },
    models: [
      { id: 'a', name: 'a', description: '', transport: 'native', contextWindow: 1, maxTokens: 1, free: true, cost: { input: 0, output: 0, cacheRead: 0 }, available: true, input: ['text'], reasoning: [], defaultReasoning: null, tools: true, visible: true },
      { id: 'b', name: 'b', description: '', transport: 'native', contextWindow: 1, maxTokens: 1, free: true, cost: { input: 0, output: 0, cacheRead: 0 }, available: true, input: ['text'], reasoning: [], defaultReasoning: null, tools: true, visible: true },
    ],
  } as never
}

test('an explicit empty model selection stays empty after save', () => {
  const draft = draftOf(state({ visibleModels: [], showAllModels: false }))
  assert.deepEqual(draft.visibleModels, [])
  assert.equal(draft.showAll, false)
  const patch = patchOf(draft)
  assert.deepEqual(patch.visibleModels, [])
  assert.equal(patch.showAllModels, false)
})

test('a legacy empty visibleModels list means all models', () => {
  const draft = draftOf(state({ visibleModels: [], showAllModels: true }))
  assert.deepEqual(draft.visibleModels, ['a', 'b'])
  assert.equal(draft.showAll, true)
  const patch = patchOf(draft)
  assert.deepEqual(patch.visibleModels, [])
  assert.equal(patch.showAllModels, true)
})

test('a non-empty allowlist is preserved with show-all disabled', () => {
  const draft = draftOf(state({ visibleModels: ['a'], showAllModels: false }))
  assert.deepEqual(draft.visibleModels, ['a'])
  assert.equal(draft.showAll, false)
  const patch = patchOf(draft)
  assert.deepEqual(patch.visibleModels, ['a'])
  assert.equal(patch.showAllModels, false)
})

test('a key refresh preserves a dirty draft while a save replaces it', () => {
  const current = draftOf(state({ visibleModels: [], showAllModels: false }))
  const next = draftOf(state({ visibleModels: ['a'], showAllModels: false }))
  assert.equal(mergeLoadedDraft(current, next, true), current)
  assert.equal(mergeLoadedDraft(current, next, false), next)
})

test('patchOf prunes positive modelVisibility overrides when model is hidden', () => {
  const draft = draftOf(state({
    visibleModels: ['a'],
    showAllModels: false,
    modelVisibility: { a: true, b: true, c: false },
  }))
  const patch = patchOf(draft)
  assert.deepEqual(patch.visibleModels, ['a'])
  assert.equal(patch.showAllModels, false)
  // b was not in visibleModels and draft.showAll is false -> b: true must be pruned!
  // c: false is an explicit hide override, preserved.
  assert.deepEqual(patch.modelVisibility, { a: true, c: false })
})

test('patchOf with zero visible models clears positive modelVisibility overrides (#63)', () => {
  const draft = draftOf(state({
    visibleModels: [],
    showAllModels: false,
    modelVisibility: { a: true, b: true },
  }))
  const patch = patchOf(draft)
  assert.deepEqual(patch.visibleModels, [])
  assert.equal(patch.showAllModels, false)
  assert.deepEqual(patch.modelVisibility, {})
})

test('a manual model row keeps a stable uid that never reaches the patch (#141)', () => {
  const draft = draftOf(state({}))
  draft.manualModels.push({
    uid: 'manual-row-1',
    id: 'custom:1b',
    enabled: true,
    name: '',
    contextWindow: '',
    maxTokens: '',
    image: false,
    thinking: false,
    reasoningEfforts: '',
    defaultReasoning: '',
    tools: true,
  })
  assert.equal(draft.manualModels[0]?.uid, 'manual-row-1')
  const patch = patchOf(draft) as { manualModels: Array<Record<string, unknown>> }
  assert.equal(patch.manualModels.length, 1)
  assert.equal('uid' in (patch.manualModels[0] ?? {}), false)
})

test('an empty numeric field is unset instead of rewritten with a default (#140)', () => {
  const draft = draftOf(state({}))
  draft.requestTimeoutMs = ''
  draft.retryBaseDelayMs = ''
  draft.refreshMinutes = ''
  const patch = patchOf(draft)
  assert.equal(patch.requestTimeoutMs, null)
  assert.equal(patch.retryBaseDelayMs, null)
  assert.equal(patch.refreshMinutes, null)
})

test('invalid values are reported per field and block the save (#140)', () => {
  const draft = draftOf(state({}))
  draft.requestTimeoutMs = 'abc'
  draft.temperature = '9'
  const { errors } = draftPatch(draft)
  assert.match(errors.requestTimeoutMs ?? '', /requestTimeoutMs/)
  assert.match(errors.temperature ?? '', /temperature/)
  assert.throws(() => patchOf(draft), /requestTimeoutMs/)
})
