const EFFORT_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const FAMILY_DEFAULTS: ReadonlyArray<{ prefix: string; effort: string }> = [
  { prefix: 'glm-5.3', effort: 'max' },
  { prefix: 'glm-5.2', effort: 'max' },
  { prefix: 'kimi-k3', effort: 'max' },
  { prefix: 'kimi-k2', effort: 'high' },
  { prefix: 'deepseek-v4', effort: 'high' },
  { prefix: 'minimax-m3', effort: 'high' },
  { prefix: 'gpt-oss', effort: 'medium' },
  { prefix: 'nemotron', effort: 'low' },
]

export function normalizeEfforts(levels: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const level of levels) {
    const clean = level.trim().toLowerCase()
    if (clean !== '') seen.add(clean)
  }
  const ordered = EFFORT_ORDER.filter((level) => seen.has(level))
  const extra = [...seen].filter((level) => !EFFORT_ORDER.includes(level)).sort()
  return [...ordered, ...extra]
}

export function defaultEffortFor(id: string, levels: readonly string[]): string | undefined {
  const family = id.split(':')[0]?.toLowerCase() ?? ''
  for (const entry of FAMILY_DEFAULTS) {
    if (family.startsWith(entry.prefix) && levels.includes(entry.effort)) return entry.effort
  }
  return undefined
}

export interface NormalizedThinking {
  reasoning: string[]
  defaultReasoning?: string
}

/** Normalize boolean switches and level ladders, then apply the known family default. */
export function normalizeThinking(
  id: string,
  levels: readonly string[],
  toggle: boolean,
  fallback?: string,
): NormalizedThinking {
  const reasoning = normalizeEfforts(levels)
  if (reasoning.length === 0 && toggle) reasoning.push('off', 'high')
  const candidate = fallback !== undefined && reasoning.includes(fallback)
    ? fallback
    : defaultEffortFor(id, reasoning) ?? (toggle && reasoning.includes('high') ? 'high' : undefined)
  return {
    reasoning,
    ...(candidate === undefined ? {} : { defaultReasoning: candidate }),
  }
}
