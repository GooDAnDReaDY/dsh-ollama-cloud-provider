import type { ReactNode } from 'react'

import type { AccountRow } from './api.ts'

export function Field(props: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  list?: string
}): ReactNode {
  return (
    <label className="ocl-field">
      <span className="ocl-label">{props.label}</span>
      <input
        className="ocl-input"
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        list={props.list}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.hint === undefined ? null : <span className="ocl-hint">{props.hint}</span>}
    </label>
  )
}

export function untilText(epoch: number): string {
  const delta = Math.max(0, epoch - Date.now())
  if (delta >= 86_400_000) return `${Math.round(delta / 86_400_000)}d`
  if (delta >= 3_600_000) return `${Math.round(delta / 3_600_000)}h`
  return `${Math.max(1, Math.round(delta / 60_000))}m`
}

export function accountMark(
  account: Pick<AccountRow, 'mark' | 'coolingUntil'> | undefined,
  t: (key: string) => string,
): string | undefined {
  if (account === undefined || account.mark === '') return undefined
  if (account.mark === 'invalid-credential') return t('markInvalid')
  const label = account.mark === 'quota'
    ? t('markQuota')
    : account.mark === 'rate-limit'
      ? t('markRateLimit')
      : t('markTransport')
  if (account.coolingUntil <= 0) return label
  return `${label} · ${untilText(account.coolingUntil)}`
}
