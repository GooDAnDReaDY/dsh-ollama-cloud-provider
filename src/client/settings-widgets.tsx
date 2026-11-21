import type { ReactNode } from 'react'

import type { AccountRow } from './api.ts'
import { relativeLabel } from './format.ts'

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

export function untilText(epoch: number, t: (key: string) => string): string {
  return relativeLabel(Math.max(0, epoch - Date.now()), t)
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
  return `${label} · ${untilText(account.coolingUntil, t)}`
}
