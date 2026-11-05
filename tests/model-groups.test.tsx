import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ModelRow } from '../src/client/api.ts'
import { groupModels, reorderIds } from '../src/client/model-groups.ts'
import { ModelEntry } from '../src/client/settings-page.tsx'

const row = (id: string, contextWindow: number, name = id): ModelRow => ({
  id,
  name,
  description: '',
  transport: 'native',
  contextWindow,
  maxTokens: 4096,
  free: false,
  cost: { input: 1, output: 1, cacheRead: 0, free: false, priced: true },
  available: true,
  input: ['text'],
  reasoning: [],
  defaultReasoning: null,
  tools: true,
  visible: true,
})

test('groups models by effective context and supports drag reorder', () => {
  const groups = groupModels([row('small', 4096), row('large', 131072), row('mid', 32768)], 'context')
  assert.deepEqual(groups.map((group) => group.label), ['128K context', '32K context', '4K context'])
  assert.deepEqual(groups[0]?.models.map((model) => model.id), ['large'])
  assert.deepEqual(reorderIds([], ['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'])
  assert.deepEqual(reorderIds(['b', 'a'], ['a', 'b', 'c'], 'a', 'c'), ['b', 'a', 'c'])
})

test('model entry renders rich badges and a drag handle', () => {
  const html = renderToStaticMarkup(
    <ModelEntry
      model={{ ...row('gpt-oss:120b', 131072), input: ['text', 'image'], reasoning: ['off', 'high'], free: true }}
      visible
      transport=""
      onVisible={() => {}}
      onTransport={() => {}}
      onDragStart={() => {}}
      onDrop={() => {}}
      t={(key) => key}
    />,
  )
  assert.match(html, /⋮⋮/)
  assert.match(html, /128K/)
  assert.match(html, /vision/)
  assert.match(html, /reasoning/)
  assert.match(html, /free/)
})
