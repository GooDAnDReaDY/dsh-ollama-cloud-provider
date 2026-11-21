import type { ReactNode } from 'react'

import type { QuotaBar } from '../quota-model.ts'
import { creditsDetail, formatDateTime, relativeLabel } from './format.ts'

function percentClass(percent: number): string {
  if (percent >= 90) return 'ocl-bar-fill ocl-bar-fill-bad'
  if (percent >= 75) return 'ocl-bar-fill ocl-bar-fill-warn'
  return 'ocl-bar-fill'
}

function reset(iso: string | undefined, t: (key: string) => string): string {
  if (iso === undefined) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${formatDateTime(date.getTime())} (${relativeLabel(date.getTime() - Date.now(), t)})`
}

export function UsageBars(props: { bars: readonly QuotaBar[]; t: (key: string) => string }): ReactNode {
  const { bars, t } = props
  if (bars.length === 0) return <p className="ocl-hint">{t('noUsage')}</p>
  return (
    <div className="ocl-bars">
      {bars.map((entry) => (
        <div className="ocl-bar-row" key={entry.key}>
          <span title={t(entry.labelKey ?? 'quotaWindow')}>{t(entry.labelKey ?? 'quotaWindow')}</span>
          <div className="ocl-bar">
            <div
              className={percentClass(entry.usedPercent)}
              style={{ width: `${Math.max(0, Math.min(100, entry.usedPercent))}%` }}
            />
          </div>
          <span title={entry.resetsAt === undefined ? undefined : formatDateTime(entry.resetsAt)}>
            {entry.remainingPercent.toFixed(0)}% {t('remaining')}
            {entry.resetsAt === undefined ? '' : ` · ${reset(entry.resetsAt, t)}`}
          </span>
          {entry.detailValues === undefined
            ? null
            : <span className="ocl-hint">{creditsDetail(entry.detailValues, t)}</span>}
        </div>
      ))}
    </div>
  )
}
