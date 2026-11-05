import type { ModelRow } from './api.ts'
import type { Draft, ModelOverrideDraft } from './settings-draft.ts'
import { Field } from './settings-widgets.tsx'

const blankOverride: ModelOverrideDraft = {
  contextWindow: '',
  image: '',
  thinking: '',
  reasoningEfforts: '',
  defaultEffort: '',
  enabled: '',
}

export function ModelOverrideEditor(props: {
  model: ModelRow
  draft: Draft
  t: (key: string) => string
  update: (patch: Partial<Draft>) => void
  close: () => void
}) {
  const { model, draft, t, update, close } = props
  const override = draft.modelOverrides[model.id] ?? blankOverride
  const price = draft.priceOverrides[model.id] ?? { input: '', output: '', cacheRead: '' }
  const context = draft.contextWindowOverrides[model.id] ?? ''
  const visibility = draft.modelVisibility[model.id]

  const updateOverride = (patch: Partial<ModelOverrideDraft>): void => {
    update({ modelOverrides: { ...draft.modelOverrides, [model.id]: { ...override, ...patch } } })
  }
  const updatePrice = (patch: Partial<typeof price>): void => {
    update({ priceOverrides: { ...draft.priceOverrides, [model.id]: { ...price, ...patch } } })
  }
  const updateVisibility = (value: string): void => {
    const next = { ...draft.modelVisibility }
    if (value === 'inherit') delete next[model.id]
    else next[model.id] = value === 'show'
    update({ modelVisibility: next })
  }
  const reset = (): void => {
    const nextContext = { ...draft.contextWindowOverrides }
    const nextPrice = { ...draft.priceOverrides }
    const nextVisibility = { ...draft.modelVisibility }
    const nextOverrides = { ...draft.modelOverrides }
    delete nextContext[model.id]
    delete nextPrice[model.id]
    delete nextVisibility[model.id]
    delete nextOverrides[model.id]
    update({
      contextWindowOverrides: nextContext,
      priceOverrides: nextPrice,
      modelVisibility: nextVisibility,
      modelOverrides: nextOverrides,
    })
  }

  return (
    <section className="ocl-model-section">
      <div className="ocl-model-section-head">
        <span>{t('overrideEditor')}: {model.id}</span>
        <button type="button" className="ocl-button" onClick={reset}>{t('resetToLive')}</button>
        <button type="button" className="ocl-button" onClick={close}>{t('close')}</button>
      </div>
      <div className="ocl-grid">
        <Field label={t('contextWindow')} value={context} onChange={(value) => update({
          contextWindowOverrides: { ...draft.contextWindowOverrides, [model.id]: value },
        })} />
        <Field label={t('priceInput')} type="number" value={price.input} onChange={(value) => updatePrice({ input: value })} />
        <Field label={t('priceOutput')} type="number" value={price.output} onChange={(value) => updatePrice({ output: value })} />
        <Field label={t('priceCacheRead')} type="number" value={price.cacheRead} onChange={(value) => updatePrice({ cacheRead: value })} />
        <label className="ocl-field">
          <span>{t('visibility')}</span>
          <select className="ocl-select" value={visibility === undefined ? 'inherit' : visibility ? 'show' : 'hide'} onChange={(event) => updateVisibility(event.target.value)}>
            <option value="inherit">{t('inherit')}</option>
            <option value="show">{t('show')}</option>
            <option value="hide">{t('hide')}</option>
          </select>
        </label>
        <label className="ocl-field">
          <span>{t('vision')}</span>
          <select className="ocl-select" value={override.image} onChange={(event) => updateOverride({ image: event.target.value as ModelOverrideDraft['image'] })}>
            <option value="">{t('inherit')}</option>
            <option value="yes">{t('yes')}</option>
            <option value="no">{t('no')}</option>
          </select>
        </label>
        <label className="ocl-field">
          <span>{t('reasoning')}</span>
          <select className="ocl-select" value={override.thinking} onChange={(event) => updateOverride({ thinking: event.target.value as ModelOverrideDraft['thinking'] })}>
            <option value="">{t('inherit')}</option>
            <option value="yes">{t('yes')}</option>
            <option value="no">{t('no')}</option>
          </select>
        </label>
        <label className="ocl-field">
          <span>{t('enabled')}</span>
          <select className="ocl-select" value={override.enabled} onChange={(event) => updateOverride({ enabled: event.target.value as ModelOverrideDraft['enabled'] })}>
            <option value="">{t('inherit')}</option>
            <option value="yes">{t('yes')}</option>
            <option value="no">{t('no')}</option>
          </select>
        </label>
        <Field label={t('reasoningEfforts')} value={override.reasoningEfforts} onChange={(value) => updateOverride({ reasoningEfforts: value })} />
        <Field label={t('defaultReasoning')} value={override.defaultEffort} onChange={(value) => updateOverride({ defaultEffort: value })} />
      </div>
    </section>
  )
}
