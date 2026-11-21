import assert from 'node:assert/strict'
import test from 'node:test'

import { createCatalogScheduler } from '../src/catalog-scheduler.ts'

function harness(initial: { autoRefresh: boolean; refreshMinutes: number }) {
  let clock = 1_000
  let calls = 0
  const config = { ...initial }
  const scheduler = createCatalogScheduler({
    current: () => config,
    refresh: () => { calls += 1 },
    now: () => clock,
    tickMs: 3_600_000,
  })
  return {
    config,
    scheduler,
    calls: () => calls,
    advance: (ms: number) => { clock += ms },
  }
}

test('refreshes only when the configured interval has elapsed (#139)', () => {
  const run = harness({ autoRefresh: true, refreshMinutes: 1 })
  try {
    run.scheduler.check()
    assert.equal(run.calls(), 0)

    run.advance(60_000)
    run.scheduler.check()
    assert.equal(run.calls(), 1)

    run.advance(30_000)
    run.scheduler.check()
    assert.equal(run.calls(), 1)

    run.advance(30_000)
    run.scheduler.check()
    assert.equal(run.calls(), 2)
  } finally {
    run.scheduler.dispose()
  }
})

test('honours autoRefresh and refreshMinutes changes without a restart (#139)', () => {
  const run = harness({ autoRefresh: false, refreshMinutes: 5 })
  try {
    run.scheduler.check()
    assert.equal(run.calls(), 0)

    run.config.autoRefresh = true
    run.config.refreshMinutes = 2
    run.advance(120_000)
    run.scheduler.check()
    assert.equal(run.calls(), 1, 'settings read on every tick')

    run.config.refreshMinutes = 0
    run.advance(600_000)
    run.scheduler.check()
    assert.equal(run.calls(), 1, 'zero minutes disables the schedule')

    run.config.refreshMinutes = 1
    run.advance(60_000)
    run.scheduler.check()
    assert.equal(run.calls(), 2)

    run.config.autoRefresh = false
    run.advance(600_000)
    run.scheduler.check()
    assert.equal(run.calls(), 2)
  } finally {
    run.scheduler.dispose()
  }
})
