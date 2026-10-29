import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { quotaBars, windowRows, worstUsedPercent } from '../quota-model.ts'
import {
  clearKey,
  fetchServiceStatus,
  fetchState,
  refreshModels,
  refreshState,
  saveConfig,
  saveKey,
  testConnection,
  type HostState,
  type ModelRow,
  type ServiceStatus,
  type TestResult,
  type TransportId,
} from './api.ts'
import { draftOf, patchOf, safeSame, type Draft } from './settings-draft.ts'
import { CONFIG_CHANGED_EVENT } from './events.ts'
import { accountMark, Field } from './settings-widgets.tsx'
import { PluginUpdateCard } from './update-card.tsx'
import { UsageBars } from './usage-bars.tsx'

function ModelEntry(props: {
  model: ModelRow
  visible: boolean
  transport: TransportId | ''
  onVisible: (visible: boolean) => void
  onTransport: (transport: TransportId | '') => void
  t: (key: string) => string
}): ReactNode {
  const { model, visible, transport, onVisible, onTransport, t } = props
  return (
    <div className="ocl-model">
      <input type="checkbox" checked={visible} onChange={(event) => onVisible(event.target.checked)} />
      <span className="ocl-model-name" title={`${model.name} · ${model.description}`}>
        {model.id}
        {model.free ? <span className="ocl-badge" title={t('legendFree')}> {t('free')}</span> : null}
        {!model.free && model.cost.priced
          ? <span className="ocl-badge" title={t('legendPrice')}> ${model.cost.input}/${model.cost.output}</span>
          : null}
        {!model.free && !model.cost.priced
          ? <span className="ocl-badge" title={t('legendUnknownPrice')}> {t('priceUnknown')}</span>
          : null}
        <span className="ocl-badge" title={t('legendContext')}>
          {' '}{Math.round(model.contextWindow / 1024)}K
        </span>
        {model.tools ? <span className="ocl-badge" title={t('legendTools')}> {t('tools')}</span> : null}
        {model.input.includes('image') ? <span className="ocl-badge"> {t('vision')}</span> : null}
        {model.reasoning.length > 0
          ? <span className="ocl-badge" title={model.reasoning.join(', ')}> {t('reasoning')}</span>
          : null}
        {model.available ? null : <span className="ocl-badge ocl-badge-warn"> {t('unavailable')}</span>}
      </span>
      <select
        className="ocl-select"
        value={transport === '' ? model.transport : transport}
        aria-label={t('transport')}
        onChange={(event) => onTransport(event.target.value as TransportId | '')}
      >
        <option value="native">native</option>
        <option value="openai-chat">openai-chat</option>
      </select>
    </div>
  )
}

export function OllamaCloudSettingsPage(props: {
  t: (key: string) => string
  close?: () => void
}): ReactNode {
  const { t } = props
  const [state, setState] = useState<HostState | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [accountKeys, setAccountKeys] = useState<Record<string, string>>({})
  const [testModel, setTestModel] = useState('gpt-oss:120b')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [service, setService] = useState<ServiceStatus | null>(null)
  const [serviceBusy, setServiceBusy] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchState()
      setState(next)
      const draftNext = draftOf(next)
      setDraft(draftNext)
      setOriginal(draftNext)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(
    () => draft !== null && original !== null && !safeSame(draft, original),
    [draft, original],
  )

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => current === null ? current : { ...current, ...patch })
  }, [])

  const save = useCallback(async () => {
    if (draft === null) return
    setSaving(true)
    try {
      await saveConfig(patchOf(draft))
      window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT))
      setNotice(t('saved'))
      setError(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [draft, load, t])

  const refresh = useCallback(async () => {
    try {
      setState(await refreshState())
      setNotice(t('refreshed'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('failed'))
    }
  }, [t])

  const reloadModels = useCallback(async () => {
    try {
      const next = await refreshModels()
      setState(next)
      setNotice(t('refreshed'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('failed'))
    }
  }, [t])

  const loadService = useCallback(async () => {
    setServiceBusy(true)
    try {
      setService(await fetchServiceStatus())
      setServiceError(null)
    } catch (caught) {
      setServiceError(caught instanceof Error ? caught.message : t('failed'))
    } finally {
      setServiceBusy(false)
    }
  }, [t])

  useEffect(() => { void loadService() }, [loadService])

  if (loading && state === null) return <p className="ocl-hint">{t('loading')}</p>
  if (state === null || draft === null) {
    return (
      <div className="ocl-page">
        <div className="ocl-error">{error ?? t('failed')}</div>
        <button type="button" className="ocl-button" onClick={() => { void load() }}>{t('refresh')}</button>
      </div>
    )
  }

  const report = state.usage?.report
  const bars = quotaBars(report)
  const rows = windowRows(report)
  const worst = worstUsedPercent(report)
  const activeAccount = state.accounts.find((account) => account.active)
  const filtered = state.models.filter((model) => search.trim() === ''
    || model.id.toLowerCase().includes(search.trim().toLowerCase()))

  const toggleModel = (id: string, visible: boolean): void => {
    const current = new Set(draft.visibleModels)
    if (visible) current.add(id)
    else current.delete(id)
    update({ visibleModels: [...current], showAll: false })
  }

  return (
    <div className="ocl-page">
      <div className="ocl-head">
        <h2 className="ocl-title">{t('title')}</h2>
        <p className="ocl-hint">{t('intro')}</p>
      </div>

      {error === null ? null : <div className="ocl-error">{error}</div>}
      {notice === null ? null : <div className="ocl-notice">{notice}</div>}

      <section className="ocl-card">
        <h3 className="ocl-card-title">
          {t('key')}
          <span className={`ocl-badge ${state.key.configured ? 'ocl-badge-ok' : 'ocl-badge-warn'}`}>
            {state.key.configured ? t('keyConfigured') : t('keyMissing')}
          </span>
          {state.key.source === undefined ? null : <span className="ocl-badge">{state.key.source}</span>}
          {accountMark(activeAccount, t) === undefined
            ? null
            : <span className="ocl-badge ocl-badge-bad">{accountMark(activeAccount, t)}</span>}
        </h3>
        <p className="ocl-hint">{t('keyHint')}</p>
        {bars.length === 0
          ? <p className="ocl-hint">{t('usageError')}: {state.usage?.error ?? t('noUsage')}</p>
          : <UsageBars bars={bars} t={t} />}
        <div className="ocl-row">
          <input
            className="ocl-input"
            type="password"
            placeholder={t('pasteKey')}
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
          />
          <button
            type="button"
            className="ocl-button ocl-button-primary"
            disabled={keyDraft.trim() === ''}
            onClick={() => {
              void saveKey(draft.apiKeyEnv || 'OLLAMA_API_KEY', keyDraft.trim())
                .then(() => { setKeyDraft(''); setNotice(t('saved')); return load() })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('failed')))
            }}
          >
            {t('saveKey')}
          </button>
          <button
            type="button"
            className="ocl-button ocl-button-danger"
            onClick={() => {
              void clearKey(draft.apiKeyEnv || 'OLLAMA_API_KEY')
                .then(() => { setNotice(t('saved')); return load() })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('failed')))
            }}
          >
            {t('clearKey')}
          </button>
        </div>
        <div className="ocl-row">
          <select
            className="ocl-select"
            value={testModel}
            aria-label={t('model')}
            onChange={(event) => setTestModel(event.target.value)}
          >
            {state.models.map((model) => (
              <option key={model.id} value={model.id}>{model.id}</option>
            ))}
          </select>
          <button
            type="button"
            className="ocl-button"
            disabled={testing}
            onClick={() => {
              setTesting(true)
              setTestResult(null)
              void testConnection(testModel)
                .then(setTestResult)
                .catch((caught: unknown) => {
                  setTestResult({
                    ok: false,
                    model: testModel,
                    provider: 'ollama-cloud',
                    latencyMs: 0,
                    error: caught instanceof Error ? caught.message : t('failed'),
                  })
                })
                .finally(() => setTesting(false))
            }}
          >
            {testing ? t('testing') : t('testConnection')}
          </button>
          {testResult === null ? null : testResult.ok
            ? <span className="ocl-notice">{t('testOk').replace('{ms}', String(testResult.latencyMs))}</span>
            : <span className="ocl-error">{t('testFailed')}: {testResult.error}</span>}
        </div>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('serviceStatus')}</h3>
        <div className="ocl-row ocl-statusRow">
          <span className={`ocl-statusDot${service?.ok === true ? ' ocl-statusDotOk' : service === null ? '' : ' ocl-statusDotBad'}`} />
          <span>
            {service === null
              ? (serviceBusy ? t('checkingService') : t('serviceUnknown'))
              : service.ok ? t('serviceOnline') : t('serviceOffline')}
          </span>
          {service === null
            ? null
            : <span className="ocl-hint">{service.latencyMs} ms · {new Date(service.checkedAt).toLocaleTimeString()}</span>}
          <button type="button" className="ocl-button" disabled={serviceBusy} onClick={() => { void loadService() }}>
            {serviceBusy ? t('checkingService') : t('refreshStatus')}
          </button>
        </div>
        {serviceError === null && service?.error === undefined
          ? null
          : <p className="ocl-hint">{serviceError ?? service?.error}</p>}
        <p className="ocl-hint">{t('serviceStatusHint')}</p>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">
          {t('quota')}
          <span className="ocl-badge">{activeAccount?.label ?? t('noActiveAccount')}</span>
          <button type="button" className="ocl-button" onClick={() => { void refresh() }}>{t('refresh')}</button>
        </h3>
        {worst >= 95 ? <div className="ocl-error">{t('quotaExhausted')}</div> : null}
        {worst >= 80 && worst < 95 ? <div className="ocl-notice">{t('quotaWarning')}</div> : null}
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
        <p className="ocl-hint">{t('quotaHint')}</p>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">
          {t('accounts')}
          <span className="ocl-badge">{draft.accounts.length} {t('accountCount')}</span>
        </h3>
        <p className="ocl-hint">{t('accountsHint')}</p>
        {draft.accounts.map((account, index) => {
          const known = state.accounts.find((entry) => entry.label === account.label)
          const mark = accountMark(known, t)
          return (
            <div className="ocl-account-block" key={index}>
              <div className="ocl-account">
                <input
                  className="ocl-input"
                  placeholder={t('accountLabel')}
                  value={account.label}
                  onChange={(event) => {
                    const accounts = draft.accounts.map((entry, position) =>
                      position === index ? { ...entry, label: event.target.value } : entry)
                    update({ accounts })
                  }}
                />
                <input
                  className="ocl-input"
                  placeholder={t('accountRef')}
                  value={account.apiKeyEnv}
                  onChange={(event) => {
                    const accounts = draft.accounts.map((entry, position) =>
                      position === index ? { ...entry, apiKeyEnv: event.target.value } : entry)
                    update({ accounts })
                  }}
                />
                <span className={`ocl-badge ${known?.configured === true ? 'ocl-badge-ok' : 'ocl-badge-warn'}`}>
                  {known?.configured === true ? t('keyConfigured') : t('keyMissing')}
                </span>
                {mark === undefined ? null : <span className="ocl-badge ocl-badge-bad">{mark}</span>}
              </div>
              {known?.usage?.report?.windows.d7 === undefined ? null : (
                <div className="ocl-row">
                  <span className="ocl-badge">
                    {t('spend7d')}: ${known.usage.report.windows.d7.usd.toFixed(3)}
                  </span>
                </div>
              )}
              <div className="ocl-row">
                <input
                  className="ocl-input"
                  type="password"
                  placeholder={t('pasteKey')}
                  value={accountKeys[account.label] ?? ''}
                  onChange={(event) => {
                    setAccountKeys((current) => ({ ...current, [account.label]: event.target.value }))
                  }}
                />
                <button
                  type="button"
                  className="ocl-button ocl-button-primary"
                  disabled={(accountKeys[account.label] ?? '').trim() === ''}
                  onClick={() => {
                    const ref = account.apiKeyEnv.trim()
                    if (ref === '') return
                    void saveKey(ref, (accountKeys[account.label] ?? '').trim())
                      .then(() => {
                        setAccountKeys((current) => ({ ...current, [account.label]: '' }))
                        setNotice(t('saved'))
                        return load()
                      })
                      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('failed')))
                  }}
                >
                  {t('saveKey')}
                </button>
                <button
                  type="button"
                  className="ocl-button"
                  onClick={() => update({ activeAccount: account.label })}
                >
                  {t('pinAccount')}
                </button>
                <button
                  type="button"
                  className="ocl-button ocl-button-danger"
                  onClick={() => {
                    update({ accounts: draft.accounts.filter((_, position) => position !== index) })
                  }}
                >
                  {t('removeAccount')}
                </button>
              </div>
            </div>
          )
        })}
        <div className="ocl-row">
          <button
            type="button"
            className="ocl-button"
            onClick={() => {
              update({
                accounts: [...draft.accounts, {
                  label: `account-${draft.accounts.length + 2}`,
                  apiKeyEnv: `OLLAMA_API_KEY_${draft.accounts.length + 2}`,
                }],
              })
            }}
          >
            {t('addAccount')}
          </button>
          <button type="button" className="ocl-button" onClick={() => { void refresh() }}>
            {t('checkAllAccounts')}
          </button>
          <span className="ocl-badge">{t('activeAccount')}: {draft.activeAccount === '' ? t('auto') : draft.activeAccount}</span>
          <button type="button" className="ocl-button" onClick={() => update({ activeAccount: '' })}>
            {t('auto')}
          </button>
        </div>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('modelAccountRules')}</h3>
        <p className="ocl-hint">{t('modelAccountRulesHint')}</p>
        {draft.modelAccountRules.map((rule, index) => (
          <div className="ocl-row" key={index}>
            <input
              className="ocl-input"
              placeholder={t('rulePattern')}
              value={rule.pattern}
              onChange={(event) => {
                const rules = draft.modelAccountRules.map((entry, position) =>
                  position === index ? { ...entry, pattern: event.target.value } : entry)
                update({ modelAccountRules: rules })
              }}
            />
            <input
              className="ocl-input"
              placeholder={t('ruleAccount')}
              value={rule.account}
              onChange={(event) => {
                const rules = draft.modelAccountRules.map((entry, position) =>
                  position === index ? { ...entry, account: event.target.value } : entry)
                update({ modelAccountRules: rules })
              }}
            />
            <button
              type="button"
              className="ocl-button ocl-button-danger"
              onClick={() => {
                update({ modelAccountRules: draft.modelAccountRules.filter((_, position) => position !== index) })
              }}
            >
              {t('removeRule')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ocl-button"
          onClick={() => update({ modelAccountRules: [...draft.modelAccountRules, { pattern: '', account: '' }] })}
        >
          {t('addRule')}
        </button>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('routing')}</h3>
        <p className="ocl-hint">{t('routingHint')}</p>
        <label className="ocl-row">
          <input
            type="checkbox"
            checked={draft.stickySession}
            onChange={(event) => update({ stickySession: event.target.checked })}
          />
          <span>{t('stickySession')}</span>
        </label>
        <p className="ocl-hint">{t('stickySessionHint')}</p>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">
          {t('models')}
          <span className="ocl-badge">{state.models.length} {t('modelCount')}</span>
          <button type="button" className="ocl-button" onClick={() => { void reloadModels() }}>
            {t('refresh')}
          </button>
          <button
            type="button"
            className="ocl-button"
            onClick={() => update({ showAll: true, visibleModels: state.models.map((model) => model.id) })}
          >
            {t('showAll')}
          </button>
        </h3>
        <p className="ocl-hint">{t('modelsHint')}</p>
        <label className="ocl-row">
          <input
            type="checkbox"
            checked={draft.filterModelsByPlan}
            onChange={(event) => update({ filterModelsByPlan: event.target.checked })}
          />
          <span>{t('filterModelsByPlan')}</span>
        </label>
        <p className="ocl-hint">{t('filterModelsByPlanHint')}</p>
        <div className="ocl-model-legend">
          <span><span className="ocl-badge">{t('free')}</span> {t('legendFree')}</span>
          <span><span className="ocl-badge">$in/$out</span> {t('legendPrice')}</span>
          <span><span className="ocl-badge">131K</span> {t('legendContext')}</span>
          <span><span className="ocl-badge">{t('tools')}</span> {t('legendTools')}</span>
          <span><span className="ocl-badge">{t('vision')}</span> {t('legendImage')}</span>
        </div>
        <input
          className="ocl-input"
          placeholder={t('modelSearch')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="ocl-models">
          {filtered.length === 0
            ? <p className="ocl-hint">{t('modelsEmpty')}</p>
            : filtered.map((model) => (
                <ModelEntry
                  key={model.id}
                  model={model}
                  visible={draft.showAll || draft.visibleModels.includes(model.id)}
                  transport={draft.modelTransports[model.id] ?? ''}
                  onVisible={(visible) => toggleModel(model.id, visible)}
                  onTransport={(transport) => {
                    const next = { ...draft.modelTransports }
                    if (transport === '') delete next[model.id]
                    else next[model.id] = transport
                    update({ modelTransports: next })
                  }}
                  t={t}
                />
              ))}
        </div>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('advanced')}</h3>
        <div className="ocl-grid">
          <Field label={t('apiKeyEnv')} hint={t('apiKeyEnvHint')} value={draft.apiKeyEnv} onChange={(value) => update({ apiKeyEnv: value })} />
          <Field label={t('apiBase')} value={draft.apiBase} onChange={(value) => update({ apiBase: value })} />
          <Field label={t('openAiBase')} value={draft.openAiBase} onChange={(value) => update({ openAiBase: value })} />
          <Field label={t('usageUrl')} value={draft.usageUrl} onChange={(value) => update({ usageUrl: value })} />
          <Field label={t('balanceUrl')} value={draft.balanceUrl} onChange={(value) => update({ balanceUrl: value })} />
          <label className="ocl-field">
            <span className="ocl-label">{t('transport')}</span>
            <select
              className="ocl-select"
              value={draft.transport}
              onChange={(event) => update({ transport: event.target.value as TransportId })}
            >
              <option value="native">native /api/chat</option>
              <option value="openai-chat">openai /v1/chat/completions</option>
            </select>
            <span className="ocl-hint">{t('transportHint')}</span>
          </label>
          <Field label={t('requestTimeoutMs')} type="number" value={draft.requestTimeoutMs} onChange={(value) => update({ requestTimeoutMs: value })} />
          <Field label={t('streamIdleTimeoutMs')} type="number" value={draft.streamIdleTimeoutMs} onChange={(value) => update({ streamIdleTimeoutMs: value })} />
          <Field label={t('maxOutputTokens')} type="number" value={draft.maxOutputTokens} onChange={(value) => update({ maxOutputTokens: value })} />
          <Field label={t('contextWindow')} type="number" value={draft.contextWindow} onChange={(value) => update({ contextWindow: value })} />
          <Field label={t('planLabel')} hint={t('planLabelHint')} value={draft.planLabel} onChange={(value) => update({ planLabel: value })} />
        </div>
      </section>

      <section className="ocl-card">
        <h3 className="ocl-card-title">{t('sidebar')}</h3>
        <label className="ocl-row">
          <input
            type="checkbox"
            checked={draft.showSidebarQuota}
            onChange={(event) => update({ showSidebarQuota: event.target.checked })}
          />
          <span>{t('showSidebarQuota')}</span>
        </label>
        <p className="ocl-hint">{t('showSidebarQuotaHint')}</p>
      </section>

      <PluginUpdateCard t={t} />

      <div className="ocl-row">
        <button type="button" className="ocl-button ocl-button-primary" disabled={!dirty || saving} onClick={() => { void save() }}>
          {saving ? t('saving') : t('save')}
        </button>
        {dirty ? <span className="ocl-badge ocl-badge-warn">{t('unsaved')}</span> : null}
        <button
          type="button"
          className="ocl-button"
          onClick={() => {
            if (original !== null) setDraft(original)
            setError(null)
            setNotice(null)
          }}
        >
          {t('discard')}
        </button>
        <button type="button" className="ocl-button" onClick={() => props.close?.()}>{t('close')}</button>
      </div>
    </div>
  )
}
