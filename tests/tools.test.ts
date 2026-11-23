import assert from 'node:assert/strict'
import test from 'node:test'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'

import { limitTools, toolCapWarning } from '../src/tools.ts'

function tool(name: string): ToolSchema {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
  } as ToolSchema
}

test('caps tools at the Ollama Cloud limit', () => {
  const tools = Array.from({ length: 140 }, (_, index) => tool(`tool-${index}`))
  const limited = limitTools(tools)
  assert.equal(limited?.length, 128)
  assert.equal(limited?.[0]?.name, 'tool-0')
  assert.equal(limited?.[127]?.name, 'tool-127')
})

test('deduplicates tools by name before capping', () => {
  const tools = [tool('read'), tool('read'), tool('write'), tool('read')]
  const limited = limitTools(tools)
  assert.deepEqual(limited?.map((entry) => entry.name), ['read', 'write'])
})

test('leaves a small unique list in order', () => {
  const tools = [tool('read'), tool('write')]
  assert.deepEqual(limitTools(tools)?.map((entry) => entry.name), ['read', 'write'])
  assert.equal(limitTools(undefined), undefined)
  assert.deepEqual(limitTools([]), [])
})

test('keeps core tools when a large MCP set hits the cap', () => {
  const tools = Array.from({ length: 130 }, (_, index) => tool(`mcp-${index}`))
  tools.push(tool('read'))
  const limited = limitTools(tools)
  assert.equal(limited?.length, 128)
  assert.equal(limited?.[0]?.name, 'read')
})

test('keeps the Windows shell tool when a large MCP set hits the cap', () => {
  const tools = Array.from({ length: 130 }, (_, index) => tool(`mcp-${index}`))
  tools.push(tool('pwsh'))
  const limited = limitTools(tools)
  assert.equal(limited?.length, 128)
  assert.equal(limited?.[0]?.name, 'pwsh')
})

test('keeps the pwsh7 diagnostics tools alongside both shells', () => {
  const tools = Array.from({ length: 200 }, (_, index) => tool(`mcp-${index}`))
  tools.push(tool('pwsh'), tool('pwsh7_status'), tool('pwsh7_install'), tool('bash'))
  const names = limitTools(tools)?.map((entry) => entry.name) ?? []
  for (const name of ['bash', 'pwsh', 'pwsh7_status', 'pwsh7_install']) {
    assert.ok(names.includes(name), `${name} must survive the cap`)
  }
})

test('keeps the real DSH todo tool, not a name DSH never registers', () => {
  const tools = Array.from({ length: 200 }, (_, index) => tool(`mcp-${index}`))
  tools.push(tool('todo_write'))
  const names = limitTools(tools)?.map((entry) => entry.name) ?? []
  assert.ok(names.includes('todo_write'))
})

test('truncates MCP declarations before non-MCP built-ins', () => {
  // Alphabetical order puts the whole MCP namespace ahead of `pwsh`, which is
  // exactly what DSH hands the adapter after orderTools() sorts by name.
  const tools = [
    ...Array.from({ length: 200 }, (_, index) => tool(`mcp__server__tool${index}`)),
    tool('pwsh'),
    tool('terminal_open'),
  ]
  const names = limitTools(tools)?.map((entry) => entry.name) ?? []
  assert.equal(names.length, 128)
  assert.ok(names.includes('pwsh'))
  assert.ok(names.includes('terminal_open'))
  // Built-ins keep their order and the MCP entries follow, still in order.
  assert.equal(names[0], 'pwsh')
  assert.equal(names[1], 'terminal_open')
  assert.equal(names[2], 'mcp__server__tool0')
})

test('a profile with only MCP declarations still fills the cap', () => {
  const tools = Array.from({ length: 200 }, (_, index) => tool(`mcp__server__tool${index}`))
  const names = limitTools(tools)?.map((entry) => entry.name) ?? []
  assert.equal(names.length, 128)
  assert.equal(names[0], 'mcp__server__tool0')
  assert.equal(names[127], 'mcp__server__tool127')
})

test('the cap warning names the dropped tools', () => {
  const tools = [
    ...Array.from({ length: 130 }, (_, index) => tool(`mcp__rea__t${index}`)),
    tool('pwsh'),
    tool('bash'),
  ]
  const limited = limitTools(tools) ?? []
  const warning = toolCapWarning(tools, limited)
  assert.ok(warning !== undefined)
  assert.match(warning, /at most 128 tools/)
  assert.match(warning, /4 omitted/)
  // Core tools survived, so the warning must not claim they were dropped.
  assert.doesNotMatch(warning, /pwsh|bash/)
  assert.match(warning, /mcp__rea__t/)
})

test('the cap warning truncates a long dropped list', () => {
  const tools = Array.from({ length: 140 }, (_, index) => tool(`tool-${index}`))
  const warning = toolCapWarning(tools, limitTools(tools) ?? [])
  assert.ok(warning !== undefined)
  assert.match(warning, /12 omitted/)
  assert.match(warning, /\+2 more$/)
})

test('the cap warning is absent when nothing was dropped', () => {
  const tools = [tool('read'), tool('pwsh')]
  assert.equal(toolCapWarning(tools, limitTools(tools) ?? []), undefined)
})
