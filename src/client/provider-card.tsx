import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { quotaBars, worstUsedPercent } from '../quota-model.ts'
import { fetchState, type HostState } from './api.ts'

export function OllamaProviderCardView(props: {
  t: (key: string) => string
  state: HostState | null
  error?: string | null
}): ReactNode {
  const { t, state, error } = props
  const report = state?.usage?.report
  const bars = quotaBars(report)
  const worst = worstUsedPercent(report)
  return (
    <div className="ocl-card" data-ollama-provider-card="true">
      <div className="ocl-row">
        <strong>Ollama Cloud</strong>
        <span className="ocl-badge">ollama-cloud</span>
        {state === null
          ? <span className="ocl-badge ocl-badge-warn">{t('loading')}</span>
          : state.key.configured
            ? <span className="ocl-badge ocl-badge-ok">{t('keyConfigured')}</span>
            : <span className="ocl-badge ocl-badge-warn">{t('noKey')}</span>}
      </div>
      <p className="ocl-hint">{t('providerCardHint')}</p>
      {error !== undefined && error !== null ? <p className="ocl-error">{error}</p> : null}
      {state !== null && (
        <div className="ocl-row">
          <span>{t('models')}: <strong>{state.models.length}</strong></span>
          <span>{t('transport')}: <strong>{state.config.transport}</strong></span>
          {bars.length > 0 && <span>{t('quotaCardName')}: <strong>{worst.toFixed(0)}%</strong></span>}
        </div>
      )}
      {state?.usage?.stale === true ? <p className="ocl-notice">{t('lastGoodUsage')}</p> : null}
      {bars.length > 0 && (
        <div className="ocl-models">
          {bars.map((bar) => (
            <div className="ocl-row" key={bar.key}>
              <span className="ocl-model-name">
                {bar.labelKey === undefined ? bar.label : t(bar.labelKey)}
              </span>
              <span className="ocl-badge">{bar.remainingPercent.toFixed(0)}% {t('remaining')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OllamaProviderCard(props: { t: (key: string) => string }): ReactNode {
  const [state, setState] = useState<HostState | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void fetchState()
      .then((next) => { if (active) setState(next) })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : props.t('failed'))
      })
    return () => { active = false }
  }, [props.t])
  return <OllamaProviderCardView t={props.t} state={state} error={error} />
}
