import assert from 'node:assert/strict'
import test from 'node:test'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { UsageBars } from '../src/client/usage-bars.tsx'
import { quotaBars } from '../src/quota-model.ts'

test('quota bars render localized labels in the Chinese UI', () => {
  const bars = quotaBars({
    kind: 'credits',
    credits: { includedRemaining: 25, includedAllowance: 100, purchased: 5 },
    windows: {},
    byModel: [],
    range: '7d',
  })
  const translations: Record<string, string> = {
    quotaIncludedCredits: '包含额度',
    remaining: '剩余',
    purchased: '已购买',
  }
  const html = renderToStaticMarkup(
    <UsageBars bars={bars} t={(key) => translations[key] ?? key} />,
  )
  assert.match(html, /包含额度/)
  assert.ok(!html.includes('Included credits'))
  assert.match(html, /已购买/)
})
