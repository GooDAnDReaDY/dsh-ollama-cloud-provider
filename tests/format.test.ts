import assert from 'node:assert/strict'
import test from 'node:test'

import { creditsDetail, formatDate, formatDateTime, formatTime, relativeLabel } from '../src/client/format.ts'

const t = (key: string): string => `<${key}>`

test('relative labels go through locale keys (#149)', () => {
  assert.equal(relativeLabel(-1, t), '<now>')
  assert.equal(relativeLabel(5 * 60_000, t), '5<minutesShort>')
  assert.equal(relativeLabel(3 * 3_600_000, t), '3<hoursShort>')
  assert.equal(relativeLabel(2 * 86_400_000, t), '2<daysShort>')
})

test('credit details use translated words instead of English literals (#149)', () => {
  const detail = creditsDetail({ remaining: 5, allowance: 10, purchased: 2 }, t)
  assert.match(detail, /5\.00 \/ 10\.00 <remaining>/)
  assert.match(detail, /<purchased> 2\.00/)
})

test('date formatting never throws without a document (#149)', () => {
  const iso = '2026-11-21T12:34:56.000Z'
  assert.ok(formatTime(iso).length > 0)
  assert.ok(formatDate(iso).length > 0)
  assert.ok(formatDateTime(iso).length > 0)
})
