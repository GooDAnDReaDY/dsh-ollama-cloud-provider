import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  version: string
}

function hasBash(): boolean {
  return spawnSync('bash', ['-c', 'true']).status === 0
}

function stubs(health: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-ollama-deploy-'))
  const dsh = join(directory, 'dsh')
  writeFileSync(dsh, [
    '#!/usr/bin/env bash',
    `if [ "$1" = "plugin" ] && [ "$4" = "list" ]; then echo "${manifest.name}@${manifest.version}"; fi`,
    'exit 0',
    '',
  ].join('\n'))
  chmodSync(dsh, 0o755)
  const curl = join(directory, 'curl')
  writeFileSync(curl, ['#!/usr/bin/env bash', `printf '%s' "${health}"`, ''].join('\n'))
  chmodSync(curl, 0o755)
  return directory
}

function deploy(mode: string, version: string | undefined, health: string, approved: boolean): {
  status: number | null
  stdout: string
  stderr: string
} {
  const directory = stubs(health)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH ?? ''}`,
    DSH_WEB_BASE: 'http://127.0.0.1:3080',
  }
  if (approved) env.DSH_OLLAMA_APPROVED = 'yes'
  else delete env.DSH_OLLAMA_APPROVED
  const args = [join(root, 'deploy.sh'), mode]
  if (version !== undefined) args.push(version)
  const result = spawnSync('bash', args, { cwd: root, env, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('deploy.sh install requires explicit approval (#143)', (t) => {
  if (!hasBash()) return t.skip('bash is unavailable')
  const result = deploy('install', manifest.version, '200', false)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /explicit approval/)
})

test('deploy.sh install installs the exact version and runs post-install checks (#143)', (t) => {
  if (!hasBash()) return t.skip('bash is unavailable')
  const result = deploy('install', manifest.version, '200', true)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, new RegExp(`installing ${manifest.name}@${manifest.version.replaceAll('.', '\\.')}`))
  assert.match(result.stdout, /post-install checks passed/)
})

test('deploy.sh install refuses a version that differs from package.json (#143)', (t) => {
  if (!hasBash()) return t.skip('bash is unavailable')
  const result = deploy('install', '0.0.0', '200', true)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /does not match package\.json/)
})

test('deploy.sh verify fails when health is not 200 (#143)', (t) => {
  if (!hasBash()) return t.skip('bash is unavailable')
  const result = deploy('verify', manifest.version, '500', false)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /health check returned HTTP 500/)
})

test('deploy.sh verify passes when the installed version is healthy (#143)', (t) => {
  if (!hasBash()) return t.skip('bash is unavailable')
  const result = deploy('verify', undefined, '200', false)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /post-install checks passed/)
})
