import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultEffortFor, normalizeEfforts, normalizeThinking } from '../src/reasoning.ts'

test('normalizes boolean switches and known level ladders', () => {
  assert.deepEqual(normalizeThinking('kimi-k2.6', [], true), {
    reasoning: ['off', 'high'],
    defaultReasoning: 'high',
  })
  assert.deepEqual(normalizeEfforts(['max', 'off', 'low', 'max']), ['off', 'low', 'max'])
  assert.deepEqual(normalizeThinking('unknown', ['off', 'high'], false), {
    reasoning: ['off', 'high'],
  })
})

test('applies family defaults only when the level exists', () => {
  assert.equal(defaultEffortFor('glm-5.2', ['off', 'high', 'max']), 'max')
  assert.equal(defaultEffortFor('deepseek-v4-pro:0813', ['off', 'high']), 'high')
  assert.equal(defaultEffortFor('gpt-oss:120b', ['low', 'medium', 'high']), 'medium')
  assert.equal(defaultEffortFor('nemotron-3-super', ['low', 'high']), 'low')
  assert.equal(defaultEffortFor('glm-5.2', ['low', 'high']), undefined)
  assert.equal(normalizeThinking('glm-5.2', ['off', 'high', 'max'], false).defaultReasoning, 'max')
})
