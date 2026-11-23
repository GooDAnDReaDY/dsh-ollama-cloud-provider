import type { ToolSchema } from '@deepseek-ai/dsh-llm'

/** Ollama Cloud rejects a request whose `tools` array has more than 128 items. */
export const MAX_TOOLS = 128

/** Namespace prefix DSH gives every tool a connected MCP server contributes. */
const MCP_PREFIX = 'mcp__'

/** How many dropped names the one-time warning spells out. */
const OMITTED_NAMES_SHOWN = 10

/**
 * Harness tools that must survive the cap when a profile defines too many.
 *
 * Both shells are listed because the platform decides which one is registered:
 * the standard preset enables `tool-bash` off Windows and `tool-pwsh` on it.
 * `pwsh7_status`/`pwsh7_install` belong to the `dsh-win-pwsh7` diagnostics
 * plugin, which cannot restore a declaration that was never sent.
 */
const CORE_TOOLS: ReadonlySet<string> = new Set([
  'read', 'write', 'edit', 'apply_patch',
  'bash', 'pwsh', 'pwsh7_status', 'pwsh7_install',
  'glob', 'grep', 'todo_write',
  'web_search', 'web_fetch',
])

/**
 * Deduplicate tools by name and keep at most the provider's limit. Duplicate
 * names would be ambiguous to the model anyway; the first declaration wins.
 *
 * At the cap the survivors are picked in three tiers: core harness tools, then
 * every other non-MCP declaration, then MCP declarations. DSH hands the list
 * over sorted by name and one MCP server can contribute hundreds of entries, so
 * without the tiers a large MCP set evicts the built-in tools that happen to
 * sort after `m` — on Windows that is `pwsh`, the only shell registered there.
 * MCP declarations are the ones that arrive in bulk, so they are truncated
 * first.
 */
export function limitTools(
  tools: readonly ToolSchema[] | undefined,
  max = MAX_TOOLS,
): ToolSchema[] | undefined {
  if (tools === undefined) return undefined
  const seen = new Set<string>()
  const out: ToolSchema[] = []
  for (const tool of tools) {
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    out.push(tool)
  }
  if (out.length <= max) return out
  const core: ToolSchema[] = []
  const builtin: ToolSchema[] = []
  const mcp: ToolSchema[] = []
  for (const tool of out) {
    if (CORE_TOOLS.has(tool.name)) core.push(tool)
    else if (tool.name.startsWith(MCP_PREFIX)) mcp.push(tool)
    else builtin.push(tool)
  }
  return [...core, ...builtin, ...mcp].slice(0, max)
}

/**
 * The one-time warning for a capped request, naming what was dropped.
 *
 * A bare count leaves an operator who lost a shell nothing to search for, so the
 * message lists the omitted declarations (deduplicated, capped at a readable
 * length). Returns `undefined` when the cap removed nothing.
 */
export function toolCapWarning(
  tools: readonly ToolSchema[],
  limited: readonly ToolSchema[],
  max = MAX_TOOLS,
): string | undefined {
  const kept = new Set(limited.map((tool) => tool.name))
  const seen = new Set<string>()
  const dropped: string[] = []
  for (const tool of tools) {
    if (kept.has(tool.name) || seen.has(tool.name)) continue
    seen.add(tool.name)
    dropped.push(tool.name)
  }
  if (dropped.length === 0) return undefined
  const shown = dropped.slice(0, OMITTED_NAMES_SHOWN)
  const rest = dropped.length - shown.length
  return `llm-ollama-cloud: provider accepts at most ${max} tools; `
    + `${dropped.length} omitted: ${shown.join(', ')}`
    + (rest > 0 ? `, +${rest} more` : '')
}
