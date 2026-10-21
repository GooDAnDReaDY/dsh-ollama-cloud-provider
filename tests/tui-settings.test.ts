import assert from 'node:assert/strict'
import test from 'node:test'

import { buildOllamaTuiSection, TUI_ACCOUNT_AUTO } from '../src/tui-settings.ts'

test('TUI section exposes the Ollama fields', () => {
  const section = buildOllamaTuiSection({
    ns: 'llm-ollama-cloud',
    apiKeyRef: () => 'OLLAMA_API_KEY',
    accountSlots: () => [{ id: 'second', label: 'second' }],
    visibleModels: () => ['gpt-oss:120b'],
    activeAccount: () => '',
    stickySession: () => true,
    showSidebarQuota: () => false,
  })
  assert.equal(section.ns, 'llm-ollama-cloud')
  assert.equal(section.title, 'Ollama Cloud')
  const paths = section.fields.map((field) => field.path.join('.'))
  assert.ok(paths.includes('apiKey'))
  assert.ok(paths.includes('apiBase'))
  assert.ok(paths.includes('openAiBase'))
  assert.ok(paths.includes('transport'))
  assert.ok(paths.includes('usageUrl'))
  const transport = section.fields.find((field) => field.path[0] === 'transport')
  assert.deepEqual(transport?.options?.map((option) => option.value), ['native', 'openai-chat'])
  const account = section.fields.find((field) => field.path[0] === 'activeAccount')
  assert.equal(account?.format?.(undefined), TUI_ACCOUNT_AUTO)
  assert.deepEqual(account?.parse?.('second'), { kind: 'set', value: 'second' })
})
