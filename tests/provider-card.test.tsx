import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { OllamaProviderCardView } from '../src/client/provider-card.tsx'
import type { HostState } from '../src/client/api.ts'

const state = {
  config: { transport: 'native' },
  key: { configured: true },
  models: [{ id: 'gpt-oss:120b' }, { id: 'glm-5.3' }],
  usage: {
    report: {
      kind: 'credits',
      credits: { includedRemaining: 25, includedAllowance: 100, purchased: 0 },
      windows: {},
      byModel: [],
      range: '7d',
    },
    checkedAt: Date.now(),
  },
} as unknown as HostState

test('native provider card shows provider, key and model count', () => {
  const html = renderToStaticMarkup(
    <OllamaProviderCardView t={(key) => key} state={state} />,
  )
  assert.match(html, /Ollama Cloud/)
  assert.match(html, /ollama-cloud/)
  assert.match(html, /keyConfigured/)
  assert.match(html, /2/)
  assert.match(html, /25%/)
})
