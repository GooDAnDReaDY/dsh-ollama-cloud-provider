import type { ModelRow } from './api.ts'

export interface ModelGroup {
  key: string
  label: string
  contextWindow: number
  models: ModelRow[]
}

export function formatContext(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(value / 1024)}K`
}

/** Stable groups by effective context, richest first. */
export function groupModels(models: readonly ModelRow[], contextLabel: string): ModelGroup[] {
  const groups = new Map<number, ModelGroup>()
  for (const model of models) {
    const existing = groups.get(model.contextWindow)
    if (existing !== undefined) {
      existing.models.push(model)
      continue
    }
    groups.set(model.contextWindow, {
      key: String(model.contextWindow),
      label: `${formatContext(model.contextWindow)} ${contextLabel}`,
      contextWindow: model.contextWindow,
      models: [model],
    })
  }
  return [...groups.values()].sort((left, right) => right.contextWindow - left.contextWindow)
}

export function reorderIds(order: readonly string[], ids: readonly string[], from: string, to: string): string[] {
  const base = [...new Set([...order, ...ids])]
  const source = base.indexOf(from)
  const target = base.indexOf(to)
  if (source < 0 || target < 0 || source === target) return base
  const [moved] = base.splice(source, 1)
  if (moved === undefined) return base
  const insertAt = source < target ? target - 1 : target
  base.splice(insertAt, 0, moved)
  return base
}
