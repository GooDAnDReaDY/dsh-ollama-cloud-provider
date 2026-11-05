import { useCallback, useEffect, useState } from 'react'

import {
  fetchLocalModels,
  fetchLocalShow,
  formatBytes,
  pullLocalModel,
  removeLocalModel,
  type LocalInventory,
  type LocalShow,
  type PullProgress,
} from './api.ts'

export function isLocalConfig(config: { apiKeyEnv: string; apiBase: string }): boolean {
  if (config.apiKeyEnv === '') return true
  try {
    const host = new URL(config.apiBase).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

export function LocalModelsCard(props: {
  t: (key: string) => string
  config: { apiKeyEnv: string; apiBase: string }
  onChanged?: () => void
}) {
  const { t, config, onChanged } = props
  const [inventory, setInventory] = useState<LocalInventory | null>(null)
  const [details, setDetails] = useState<LocalShow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pullName, setPullName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const local = isLocalConfig(config)

  const load = useCallback(async () => {
    if (!local) return
    try {
      setInventory(await fetchLocalModels())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'local models failed')
    }
  }, [local])

  useEffect(() => { void load() }, [load, config.apiKeyEnv, config.apiBase])

  if (!local) return null

  const pull = async (): Promise<void> => {
    const model = pullName.trim()
    if (model === '' || pulling) return
    setPulling(true)
    setError(null)
    setNotice(null)
    setProgress({ status: 'starting' })
    try {
      const last = await pullLocalModel(model, setProgress)
      setNotice(`${model}: ${last.status}`)
      setPullName('')
      await load()
      onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('localPullFailed'))
    } finally {
      setPulling(false)
      setProgress(null)
    }
  }

  const remove = async (model: string): Promise<void> => {
    setError(null)
    setNotice(null)
    try {
      await removeLocalModel(model)
      setConfirmRemove(null)
      setDetails((current) => current?.name === model ? null : current)
      setNotice(`${model}: ${t('localRemoveDone')}`)
      await load()
      onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('localRemoveFailed'))
    }
  }

  const show = async (model: string): Promise<void> => {
    setError(null)
    try {
      setDetails(await fetchLocalShow(model))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('localShowFailed'))
    }
  }

  const running = new Set(inventory?.running.map((entry) => entry.name) ?? [])
  const percent = progress?.total !== undefined && progress.total > 0
    ? Math.min(100, Math.round(((progress.completed ?? 0) / progress.total) * 100))
    : null

  return (
    <section className="ocl-card">
      <h3 className="ocl-card-title">{t('localModels')}</h3>
      <p className="ocl-hint">{t('localModelsHint')}</p>
      {inventory !== null && (
        <p className="ocl-hint">
          {t('localDisk')}: {formatBytes(inventory.diskBytes)} · {t('localRunning')}: {formatBytes(inventory.runningBytes)}
        </p>
      )}
      <div className="ocl-row">
        <input
          className="ocl-input"
          value={pullName}
          placeholder={t('localPullPlaceholder')}
          onChange={(event) => setPullName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void pull() } }}
        />
        <button type="button" className="ocl-button" disabled={pulling || pullName.trim() === ''} onClick={() => { void pull() }}>
          {pulling ? t('localPulling') : t('localPull')}
        </button>
        <button type="button" className="ocl-button" onClick={() => { void load() }}>{t('localRefresh')}</button>
      </div>
      {progress !== null && (
        <div className="ocl-row">
          <span className="ocl-hint">{percent === null ? progress.status : `${progress.status} · ${percent}%`}</span>
        </div>
      )}
      {notice !== null && <p className="ocl-notice">{notice}</p>}
      {error !== null && <p className="ocl-error">{error}</p>}
      {inventory !== null && inventory.models.length === 0 && <p className="ocl-hint">{t('localNoModels')}</p>}
      <div className="ocl-models">
        {(inventory?.models ?? []).map((model) => (
          <div className="ocl-model" key={model.name}>
            <span className="ocl-model-name">{model.name}</span>
            <span className="ocl-badge">{formatBytes(model.size)}</span>
            {running.has(model.name) && <span className="ocl-badge ocl-badge-ok">{t('localRunningBadge')}</span>}
            <button type="button" className="ocl-button" onClick={() => { void show(model.name) }}>{t('localShow')}</button>
            {confirmRemove === model.name ? (
              <>
                <button type="button" className="ocl-button ocl-button-danger" onClick={() => { void remove(model.name) }}>
                  {t('localConfirmRemove')}
                </button>
                <button type="button" className="ocl-button" onClick={() => setConfirmRemove(null)}>{t('localCancel')}</button>
              </>
            ) : (
              <button type="button" className="ocl-button ocl-button-danger" onClick={() => setConfirmRemove(model.name)}>
                {t('localRemove')}
              </button>
            )}
          </div>
        ))}
      </div>
      {details !== null && (
        <div className="ocl-model-section">
          <div className="ocl-model-section-head">{details.name}</div>
          {details.modifiedAt !== undefined && <p className="ocl-hint">{t('localModified')}: {details.modifiedAt}</p>}
          {details.details !== undefined && (
            <p className="ocl-hint">
              {[details.details.family, details.details.parameterSize, details.details.quantization]
                .filter((entry): entry is string => entry !== undefined)
                .join(' · ')}
            </p>
          )}
          {details.capabilities.length > 0 && (
            <p className="ocl-hint">{t('localCapabilities')}: {details.capabilities.join(', ')}</p>
          )}
        </div>
      )}
    </section>
  )
}
