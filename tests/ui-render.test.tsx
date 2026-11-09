import assert from 'node:assert/strict'
import test from 'node:test'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { QuotaCard } from '../src/client/quota-card.tsx'
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

test('sidebar quota card renders null when disabled by default', () => {
  const html = renderToStaticMarkup(<QuotaCard t={(key) => key} />)
  assert.equal(html, '')
})

import { RequestHeatmapView } from '../src/client/heatmap.tsx'
import { dictionaries } from '../src/client/locales.ts'

test('heatmap renders localized weekday labels in Chinese UI (#55)', () => {
  const tZh = (key: string) => dictionaries.zh[key as keyof typeof dictionaries.zh] ?? key
  const html = renderToStaticMarkup(
    <RequestHeatmapView
      heatmap={{
        total: 10,
        grid: Array.from({ length: 7 }, () => Array(24).fill(0)),
        hours: Array(24).fill(0),
        models: [],
        accounts: [],
      }}
      t={tZh}
    />,
  )
  assert.match(html, /周一/)
  assert.match(html, /周日/)
  assert.ok(!html.includes('>Mon<'))
  assert.ok(!html.includes('>Sun<'))
})


test('Chinese dictionary translates generation and sampling parameters (#113)', () => {
  const zh = dictionaries.zh
  assert.equal(zh.tokens, 'Token 数')
  assert.equal(zh.temperature, '采样温度 (Temperature)')
  assert.equal(zh.topK, 'Top K 采样')
  assert.equal(zh.topP, 'Top P 采样')
  assert.equal(zh.minP, 'Min P 采样')
  assert.equal(zh.seed, '随机种子 (Seed)')
  assert.equal(zh.repeatPenalty, '重复惩罚 (Repeat penalty)')
  assert.equal(zh.repeatLastN, '重复惩罚窗口 (Repeat last N)')
  assert.equal(zh.numCtx, '上下文大小 (num_ctx)')
  assert.equal(zh.keepAlive, '保活时间 (Keep-alive)')
  assert.equal(zh.stop, '停止序列 (Stop sequences)')
})
