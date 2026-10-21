import type { UsageReport, UsageTotals, UsageWindow } from './usage.ts'

export interface QuotaBar {
  readonly key: string
  readonly label: string
  readonly usedPercent: number
  readonly remainingPercent: number
  readonly resetsAt?: string
  readonly status?: string
  readonly detail?: string
}

function bar(
  key: string,
  label: string,
  usedPercent: number,
  extra: { resetsAt?: string; status?: string; detail?: string } = {},
): QuotaBar {
  const used = Math.max(0, Math.min(100, usedPercent))
  return {
    key,
    label,
    usedPercent: used,
    remainingPercent: 100 - used,
    ...(extra.resetsAt === undefined ? {} : { resetsAt: extra.resetsAt }),
    ...(extra.status === undefined ? {} : { status: extra.status }),
    ...(extra.detail === undefined ? {} : { detail: extra.detail }),
  }
}

function legacyBar(key: string, label: string, window: UsageWindow | undefined): QuotaBar | undefined {
  if (window === undefined) return undefined
  return bar(key, label, window.percentUsed, {
    ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
    ...(window.status === undefined ? {} : { status: window.status }),
  })
}

/** Bars for the sidebar card and the settings page, newest plan format first. */
export function quotaBars(report: UsageReport | undefined): readonly QuotaBar[] {
  if (report === undefined) return []
  if (report.kind === 'credits' && report.credits !== undefined) {
    const credits = report.credits
    const used = credits.includedAllowance > 0
      ? ((credits.includedAllowance - credits.includedRemaining) / credits.includedAllowance) * 100
      : 0
    return [
      bar('included', 'Included credits', used, {
        detail: `$${credits.includedRemaining.toFixed(2)} of $${credits.includedAllowance.toFixed(2)} left`
          + (credits.purchased > 0 ? ` · $${credits.purchased.toFixed(2)} purchased` : ''),
        ...(credits.periodUntil === undefined ? {} : { resetsAt: credits.periodUntil }),
      }),
    ]
  }
  return [
    legacyBar('fiveHour', '5-hour window', report.legacy?.fiveHour),
    legacyBar('weekly', 'Weekly window', report.legacy?.weekly),
  ].filter((entry): entry is QuotaBar => entry !== undefined)
}

export function worstUsedPercent(report: UsageReport | undefined): number {
  return quotaBars(report).reduce((worst, entry) => Math.max(worst, entry.usedPercent), 0)
}

export interface WindowRow {
  readonly key: '24h' | '7d' | '30d'
  readonly label: string
  readonly totals: UsageTotals
}

export function windowRows(report: UsageReport | undefined): readonly WindowRow[] {
  if (report === undefined) return []
  return [
    report.windows.d24 === undefined ? undefined : { key: '24h' as const, label: '24 hours', totals: report.windows.d24 },
    report.windows.d7 === undefined ? undefined : { key: '7d' as const, label: '7 days', totals: report.windows.d7 },
    report.windows.d30 === undefined ? undefined : { key: '30d' as const, label: '30 days', totals: report.windows.d30 },
  ].filter((entry): entry is WindowRow => entry !== undefined)
}
