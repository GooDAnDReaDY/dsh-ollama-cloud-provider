import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { quotaBars, windowRows, worstUsedPercent } from '../quota-model.ts'
import {
  fetchAnalytics,
  fetchState,
  fetchUsage,
  refreshState,
  type AnalyticsReport,
  type HostState,
  type UsageState,
} from './api.ts'
import { RequestHeatmapView } from './heatmap.tsx'
import { CONFIG_CHANGED_EVENT } from './events.ts'
import { accountMark } from './settings-widgets.tsx'
import { UsageAnalyticsView } from './usage-analytics.tsx'
import { UsageBars } from './usage-bars.tsx'

const PANEL_EVENT = 'dsh-ollama-panel-state'

function broadcastPanel(open: boolean): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENT, { detail: { open } }))
}

function useHostState(intervalMs = 60_000): {
  state: HostState | null
  error: string | null
  load: () => Promise<void>
} {
  const [state, setState] = useState<HostState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setState(await fetchState())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, intervalMs)
    return () => clearInterval(timer)
  }, [load, intervalMs])
  return { state, error, load }
}

function MiniRing(props: { percent: number; size?: number }): ReactNode {
  const size = props.size ?? 34
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(100, props.percent)) / 100
  const stroke = props.percent >= 90
    ? 'var(--ocl-danger)'
    : props.percent >= 75 ? 'var(--ocl-warning)' : 'var(--ocl-accent)'
  return (
    <svg className="ocl-ring" width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r={radius} stroke="var(--ocl-border-strong)" strokeWidth="3" />
      <circle
        cx="17"
        cy="17"
        r={radius}
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${circumference * filled} ${circumference}`}
        transform="rotate(-90 17 17)"
      />
    </svg>
  )
}

function resetLabel(iso: string | undefined): string {
  if (iso === undefined) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const delta = date.getTime() - Date.now()
  if (delta <= 0) return 'now'
  if (delta >= 86_400_000) return `${Math.round(delta / 86_400_000)}d`
  if (delta >= 3_600_000) return `${Math.round(delta / 3_600_000)}h`
  return `${Math.max(1, Math.round(delta / 60_000))}m`
}

export function QuotaCard(props: {
  t: (key: string) => string
  open?: (() => void) | undefined
}): ReactNode {
  const { t, open } = props
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void fetchState()
        .then((state) => { if (!cancelled) setEnabled(state.config.showSidebarQuota) })
        .catch(() => { if (!cancelled) setEnabled(false) })
    }
    load()
    window.addEventListener(CONFIG_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CONFIG_CHANGED_EVENT, load)
    }
  }, [])

  // The card stays unmounted (and does not poll /state) until the user enables
  // it in settings; saving the setting broadcasts CONFIG_CHANGED_EVENT.
  if (enabled !== true) return null
  return <QuotaCardBody t={t} open={open} />
}

function QuotaCardBody(props: {
  t: (key: string) => string
  open?: (() => void) | undefined
}): ReactNode {
  const { t, open } = props
  const { state, error } = useHostState()
  const report = state?.usage?.report
  const bars = quotaBars(report)
  const worst = worstUsedPercent(report)
  const active = state?.accounts.find((account) => account.active)
  const name = active === undefined ? t('quotaCardName') : `${t('quotaCardName')} · ${active.label}`
  const detail = bars
    .map((entry) => `${entry.label}: ${entry.remainingPercent.toFixed(0)}% ${t('remaining')}`)
    .join(' · ')

  return (
    <button
      type="button"
      className="ocl-foot"
      title={`${name} — ${detail === '' ? (error ?? t('noUsage')) : detail}`}
      onClick={() => {
        broadcastPanel(true)
        open?.()
      }}
    >
      <span className="ocl-footTop">
        <MiniRing percent={worst} />
        <span className="ocl-footName">{name}</span>
        <span className={`ocl-footPct${worst >= 90 ? ' ocl-footPctBad' : worst >= 75 ? ' ocl-footPctWarn' : ''}`}>
          {worst.toFixed(0)}%
        </span>
      </span>
      {bars.length === 0
        ? <span className="ocl-footMessage">{state?.usage?.error ?? error ?? t('noUsage')}</span>
        : bars.map((entry) => (
            <span className="ocl-footRow" key={entry.key}>
              <span className="ocl-footHead">
                <span className="ocl-footLabel">{entry.label}</span>
                <span className="ocl-footAmount">
                  {entry.remainingPercent.toFixed(0)}% {t('remaining')}
                  {entry.resetsAt === undefined ? '' : ` · ${resetLabel(entry.resetsAt)}`}
                </span>
              </span>
              <span className="ocl-footBar">
                <span
                  className={
                    entry.usedPercent >= 90
                      ? 'ocl-footFill ocl-footFillBad'
                      : entry.usedPercent >= 75
                        ? 'ocl-footFill ocl-footFillWarn'
                        : 'ocl-footFill'
                  }
                  style={{ width: `${Math.max(0, Math.min(100, entry.usedPercent))}%` }}
                />
              </span>
            </span>
          ))}
    </button>
  )
}

export function QuotaPanel(props: { t: (key: string) => string; close?: () => void }): ReactNode {
  const { t, close } = props
  const { state, error, load } = useHostState(60_000)
  const [busy, setBusy] = useState(false)
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d')
  const [usage, setUsage] = useState<UsageState | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    void fetchUsage(range)
      .then((next) => { setUsage(next); setAnalyticsError(null) })
      .catch((caught: unknown) => {
        setAnalyticsError(caught instanceof Error ? caught.message : String(caught))
      })
  }, [range])

  const loadAnalytics = useCallback((nextDays: number) => {
    void fetchAnalytics(nextDays)
      .then((report) => { setAnalytics(report); setAnalyticsError(null) })
      .catch((caught: unknown) => {
        setAnalyticsError(caught instanceof Error ? caught.message : String(caught))
      })
  }, [])

  useEffect(() => { loadAnalytics(days) }, [days, loadAnalytics])

  const activeReport = usage?.report ?? state?.usage?.report
  const bars = quotaBars(activeReport)
  const rows = windowRows(activeReport)
  const activeAccount = state?.accounts.find((account) => account.active)

  const refresh = (): void => {
    setBusy(true)
    void refreshState()
      .then(() => load())
      .finally(() => setBusy(false))
  }

  return (
    <div className="ocl-panel">
      <div className="ocl-panel-head">
        <h2 className="ocl-title">{t('quotaTitle')}</h2>
        <div className="ocl-row">
          <select
            className="ocl-select"
            value={range}
            aria-label={t('range')}
            onChange={(event) => setRange(event.target.value as '24h' | '7d' | '30d')}
          >
            <option value="24h">{t('last24h')}</option>
            <option value="7d">{t('last7d')}</option>
            <option value="30d">{t('last30d')}</option>
          </select>
          <button type="button" className="ocl-button" disabled={busy} onClick={refresh}>
            {busy ? t('loading') : t('refresh')}
          </button>
          <button type="button" className="ocl-button" onClick={() => { broadcastPanel(false); close?.() }}>
            {t('close')}
          </button>
        </div>
      </div>

      {error === null ? null : <p className="ocl-error">{t('failed')}: {error}</p>}

      <section className="ocl-card">
        <div className="ocl-row">
          <span className="ocl-badge">
            {t('activeAccountNow')}: {activeAccount?.label ?? t('noActiveAccount')}
          </span>
          {activeReport?.kind === 'credits' && activeReport.credits !== undefined ? (
            <span className="ocl-badge">
              {t('purchased')}: ${activeReport.credits.purchased.toFixed(2)}
            </span>
          ) : null}
        </div>
        {usage?.error === undefined ? null : <p className="ocl-hint">{t('usageError')}: {usage.error}</p>}
        <UsageBars bars={bars} t={t} />
        {rows.length === 0 ? null : (
          <div className="ocl-table-scroll">
            <table className="ocl-table">
              <thead>
                <tr>
                  <th>{t('window')}</th>
                  <th>{t('requests')}</th>
                  <th>{t('spend')}</th>
                  <th>{t('tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.totals.requests}</td>
                    <td>${row.totals.usd.toFixed(3)}</td>
                    <td>{row.totals.inputTokens + row.totals.outputTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeReport?.byModel === undefined || activeReport.byModel.length === 0 ? null : (
          <div className="ocl-table-scroll">
            <table className="ocl-table">
              <thead>
                <tr>
                  <th>{t('model')}</th>
                  <th>{t('requests')}</th>
                  <th>{t('spend')}</th>
                  <th>{t('tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {activeReport.byModel.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td>{row.requests}</td>
                    <td>${row.usd.toFixed(3)}</td>
                    <td>{row.inputTokens + row.outputTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('accounts')}</h3>
        <div className="ocl-table-scroll">
          <table className="ocl-table">
            <thead>
              <tr>
                <th>{t('accountLabel')}</th>
                <th>{t('state')}</th>
                <th>{t('spend7d')}</th>
                <th>{t('active')}</th>
              </tr>
            </thead>
            <tbody>
              {(state?.accounts ?? []).map((account) => {
                const accountUsage = account.usage?.report?.windows.d7
                const mark = accountMark(account, t)
                return (
                  <tr key={account.label}>
                    <td>{account.label}</td>
                    <td>
                      {account.configured ? t('keyConfigured') : t('keyMissing')}
                      {mark === undefined ? '' : ` · ${mark}`}
                    </td>
                    <td>{accountUsage === undefined ? '—' : `$${accountUsage.usd.toFixed(3)}`}</td>
                    <td>{account.active ? t('active') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="ocl-hint">{t('accountsHint')}</p>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('routing')}</h3>
        {state === null || state.routing.length === 0
          ? <p className="ocl-hint">{t('routingEmpty')}</p>
          : (
              <div className="ocl-table-scroll">
                <table className="ocl-table">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('accountLabel')}</th>
                      <th>{t('model')}</th>
                      <th>{t('routing')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.routing.map((row, index) => (
                      <tr key={`${row.at}-${index}`}>
                        <td>{new Date(row.at).toLocaleTimeString()}</td>
                        <td>{row.account}</td>
                        <td>{row.model}</td>
                        <td>
                          {row.reason}
                          {row.ok ? '' : ` · ${t('routingFailed')}${row.error === undefined ? '' : ` (${row.error})`}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        <p className="ocl-hint">{t('routingHint')}</p>
      </section>

      <section className="ocl-card">
        <div className="ocl-row">
          <span className="ocl-badge">{state?.accounts.length ?? 0} {t('accountCount')}</span>
          <span className="ocl-badge">{state?.models.length ?? 0} {t('modelCount')}</span>
          <span className={`ocl-badge ${state?.key.configured === true ? 'ocl-badge-ok' : 'ocl-badge-warn'}`}>
            {state?.key.configured === true ? t('configured') : t('notConfigured')}
          </span>
        </div>
        <p className="ocl-hint">{t('intro')}</p>
      </section>

      <section className="ocl-card">
        {analyticsError === null ? null : <p className="ocl-hint">{t('failed')}: {analyticsError}</p>}
        {analytics === null ? <p className="ocl-hint">{t('loading')}</p> : (
          <UsageAnalyticsView analytics={analytics} t={t} days={days} onDays={setDays} />
        )}
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('requestHeatmap')}</h3>
        {analytics === null ? <p className="ocl-hint">{t('loading')}</p> : (
          <RequestHeatmapView heatmap={analytics.heatmap} t={t} />
        )}
      </section>
    </div>
  )
}
