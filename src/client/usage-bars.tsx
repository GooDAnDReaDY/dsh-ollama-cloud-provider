import type { ReactNode } from 'react'

import type { QuotaBar } from '../quota-model.ts'

function percentClass(percent: number): string {
  if (percent >= 90) return 'ocl-bar-fill ocl-bar-fill-bad'
  if (percent >= 75) return 'ocl-bar-fill ocl-bar-fill-warn'
  return 'ocl-bar-fill'
}

function reset(iso: string | undefined): string {
  if (iso === undefined) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const delta = date.getTime() - Date.now()
  const relative = delta <= 0
    ? 'now'
    : delta >= 86_400_000
      ? `${Math.round(delta / 86_400_000)}d`
      : delta >= 3_600_000
        ? `${Math.round(delta / 3_600_000)}h`
        : `${Math.max(1, Math.round(delta / 60_000))}m`
  return `${date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} (${relative})`
}

export function UsageBars(props: { bars: readonly QuotaBar[]; t: (key: string) => string }): ReactNode {
  const { bars, t } = props
  if (bars.length === 0) return <p className="ocl-hint">{t('noUsage')}</p>
  return (
    <div className="ocl-bars">
      {bars.map((entry) => (
        <div className="ocl-bar-row" key={entry.key}>
          <span title={entry.label}>{entry.label}</span>
          <div className="ocl-bar">
            <div
              className={percentClass(entry.usedPercent)}
              style={{ width: `${Math.max(0, Math.min(100, entry.usedPercent))}%` }}
            />
          </div>
          <span title={entry.resetsAt === undefined ? undefined : new Date(entry.resetsAt).toLocaleString()}>
            {entry.remainingPercent.toFixed(0)}% {t('remaining')}
            {entry.resetsAt === undefined ? '' : ` · ${reset(entry.resetsAt)}`}
          </span>
          {entry.detail === undefined ? null : <span className="ocl-hint">{entry.detail}</span>}
        </div>
      ))}
    </div>
  )
}
