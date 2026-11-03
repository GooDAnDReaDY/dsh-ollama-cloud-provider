import assert from 'node:assert/strict'
import test from 'node:test'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { UpdateStatus } from '../src/client/api.ts'
import { PluginUpdateCardView } from '../src/client/update-card.tsx'

const t = (key: string): string => key

function status(patch: Partial<UpdateStatus>): UpdateStatus {
  return {
    packageName: '@goodandready/dsh-ollama-cloud-provider',
    currentVersion: '0.1.15',
    latestCheckFailed: false,
    updateAvailable: false,
    profileName: 'web',
    canAutoUpdate: true,
    ...patch,
  }
}

function render(value: UpdateStatus): string {
  return renderToStaticMarkup(
    <PluginUpdateCardView
      status={value}
      error={null}
      busy={false}
      notice={null}
      t={t}
      onRetry={() => {}}
      onUpdate={() => {}}
    />,
  )
}

test('update card renders a failed registry check with retry, not up-to-date', () => {
  const html = render(status({ latestCheckFailed: true }))
  assert.match(html, /updateCheckFailed/)
  assert.match(html, /retry/)
  assert.ok(!html.includes('upToDate'))
})

test('update card renders the available action without a retry prompt', () => {
  const html = render(status({ updateAvailable: true, latestVersion: '0.1.16' }))
  assert.match(html, /updateAvailable/)
  assert.match(html, /updateNow/)
  assert.ok(!html.includes('updateCheckFailed'))
})
