import assert from 'node:assert/strict'
import test from 'node:test'

import type { UpdateStatus } from '../src/client/api.ts'
import { canInstallUpdate, updateBadge } from '../src/client/update-state.ts'

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

test('a failed registry check is not shown as up to date', () => {
  const failed = status({ latestCheckFailed: true })
  assert.equal(updateBadge(failed), 'failed')
  assert.equal(canInstallUpdate(failed), false)
})

test('an available update is installable and a current version is not', () => {
  const available = status({ updateAvailable: true, latestVersion: '0.1.16' })
  assert.equal(updateBadge(available), 'available')
  assert.equal(canInstallUpdate(available), true)
  const current = status({ latestVersion: '0.1.15' })
  assert.equal(updateBadge(current), 'current')
  assert.equal(canInstallUpdate(current), false)
})
