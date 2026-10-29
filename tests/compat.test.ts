import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
  engines: { dsh: string }
  dsh: { compatibility: { dsh: string; dshReleases: Record<string, string> } }
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}

const range = '0.2.0-rc.2 || >=0.2.1-rc.2 <0.2.2-0'

test('compatibility declarations use the same-channel range', () => {
  assert.equal(pkg.dsh.compatibility.dsh, range)
  assert.equal(pkg.engines.dsh, range)
  for (const [name, value] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh')) assert.equal(value, range, name)
  }
})

test('every tested release is inside the declared range and all dev packages agree', () => {
  const releases = Object.keys(pkg.dsh.compatibility.dshReleases)
  assert.deepEqual(releases.sort(), ['0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4'])
  for (const release of releases) {
    assert.match(release, /^(?:0\.2\.0-rc\.2|0\.2\.1-rc\.\d+)$/)
    assert.equal(pkg.dsh.compatibility.dshReleases[release], 'compatible')
  }
  const versions = new Set(
    Object.entries(pkg.devDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh'))
      .map(([, value]) => value),
  )
  assert.deepEqual([...versions], ['0.2.1-rc.4'])
  assert.ok(releases.includes('0.2.1-rc.4'))
})
