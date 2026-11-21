import type { UpdateStatus } from './api.ts'

export type UpdateBadge = 'failed' | 'available' | 'current'

export function updateBadge(status: UpdateStatus): UpdateBadge {
  if (status.latestCheckFailed) return 'failed'
  return status.updateAvailable ? 'available' : 'current'
}

export function canInstallUpdate(status: UpdateStatus): boolean {
  return !status.latestCheckFailed
    && status.updateAvailable
    && status.updatedVersion === undefined
}
