import assert from 'node:assert/strict'
import test from 'node:test'

import { GlobalWindow } from 'happy-dom'

const win = new GlobalWindow()
const g = globalThis as Record<string, unknown>
g.IS_REACT_ACT_ENVIRONMENT = true
g.window = win
g.document = win.document
g.Event = win.Event
g.MouseEvent = win.MouseEvent
g.HTMLElement = win.HTMLElement
g.HTMLInputElement = win.HTMLInputElement
g.HTMLButtonElement = win.HTMLButtonElement
g.HTMLSelectElement = win.HTMLSelectElement
g.Node = win.Node
g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0)
g.cancelAnimationFrame = (id: NodeJS.Timeout) => clearTimeout(id)

import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { HostState, UpdateStatus } from '../src/client/api.ts'
import { dictionaries } from '../src/client/locales.ts'
import { draftOf, patchOf } from '../src/client/settings-draft.ts'
import { PluginUpdateCardView } from '../src/client/update-card.tsx'

function createContainer(): { div: HTMLElement; root: ReturnType<typeof createRoot> } {
  const div = win.document.createElement('div')
  win.document.body.appendChild(div)
  const root = createRoot(div as never)
  return { div: div as unknown as HTMLElement, root }
}

test('UI action: mounting, interactive language switching and unmounting (#61)', async () => {
  const { div, root } = createContainer()

  function LocaleSwitcher() {
    const [lang, setLang] = useState<'en' | 'zh'>('en')
    const t = (key: string) => {
      const dict = dictionaries[lang] as Record<string, string>
      return dict[key] ?? key
    }

    return (
      <div id="locale-root">
        <span id="title">{t('title')}</span>
        <button id="switch-zh" type="button" onClick={() => setLang('zh')}>
          Chinese
        </button>
        <button id="switch-en" type="button" onClick={() => setLang('en')}>
          English
        </button>
      </div>
    )
  }

  await act(async () => {
    root.render(<LocaleSwitcher />)
  })

  const titleEl = div.querySelector('#title')
  assert.equal(titleEl?.textContent, 'Ollama Cloud')

  // Switch to Chinese
  const btnZh = div.querySelector('#switch-zh') as HTMLButtonElement
  await act(async () => {
    btnZh.dispatchEvent(new win.Event('click', { bubbles: true }))
  })
  assert.equal(titleEl?.textContent, 'Ollama Cloud')

  // Verify another localized string changes between en and zh
  function DynamicText() {
    const [lang, setLang] = useState<'en' | 'zh'>('en')
    const t = (key: string) => {
      const dict = dictionaries[lang] as Record<string, string>
      return dict[key] ?? key
    }
    return (
      <div>
        <span id="label">{t('showAll')}</span>
        <button id="toggle-lang" type="button" onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')} />
      </div>
    )
  }

  await act(async () => {
    root.render(<DynamicText />)
  })

  const labelEl = div.querySelector('#label')
  assert.equal(labelEl?.textContent, 'Show all')

  const toggleBtn = div.querySelector('#toggle-lang') as HTMLButtonElement
  await act(async () => {
    toggleBtn.dispatchEvent(new win.Event('click', { bubbles: true }))
  })
  assert.equal(labelEl?.textContent, '全部显示')

  // Clean unmount
  await act(async () => {
    root.unmount()
  })
  assert.equal(div.innerHTML, '')
})

test('UI action: updater card actions (retry and update) and unmounting (#61)', async () => {
  const { div, root } = createContainer()

  let retryCalls = 0
  let updateCalls = 0

  const status: UpdateStatus = {
    packageName: '@goodandready/dsh-ollama-cloud-provider',
    currentVersion: '0.1.32',
    latestVersion: '0.1.33',
    latestCheckFailed: true,
    updateAvailable: true,
    profileName: 'web',
    canAutoUpdate: true,
  }

  await act(async () => {
    root.render(
      <PluginUpdateCardView
        status={status}
        error={null}
        busy={false}
        notice={null}
        t={(k) => k}
        onRetry={() => { retryCalls += 1 }}
        onUpdate={() => { updateCalls += 1 }}
      />,
    )
  })

  // Find retry button
  const buttons = Array.from(div.querySelectorAll('button')) as HTMLButtonElement[]
  const retryBtn = buttons.find((b) => b.textContent?.includes('retry'))
  assert.ok(retryBtn !== undefined, 'Retry button should be present')

  await act(async () => {
    retryBtn.dispatchEvent(new win.Event('click', { bubbles: true }))
  })
  assert.equal(retryCalls, 1)

  // When check succeeds and update is available:
  const availableStatus: UpdateStatus = {
    ...status,
    latestCheckFailed: false,
    updateAvailable: true,
  }

  await act(async () => {
    root.render(
      <PluginUpdateCardView
        status={availableStatus}
        error={null}
        busy={false}
        notice={null}
        t={(k) => k}
        onRetry={() => { retryCalls += 1 }}
        onUpdate={() => { updateCalls += 1 }}
      />,
    )
  })

  const newButtons = Array.from(div.querySelectorAll('button')) as HTMLButtonElement[]
  const updateBtn = newButtons.find((b) => b.textContent?.includes('updateNow'))
  assert.ok(updateBtn !== undefined, 'Update button should be present')
  assert.equal(updateBtn.disabled, false)

  await act(async () => {
    updateBtn.dispatchEvent(new win.Event('click', { bubbles: true }))
  })
  assert.equal(updateCalls, 1)

  // Clean unmount
  await act(async () => {
    root.unmount()
  })
  assert.equal(div.innerHTML, '')
})

test('UI action: draft mutation, model selection toggle, hide all, and save (#61, #63)', async () => {
  const { div, root } = createContainer()

  const sampleState: HostState = {
    config: {
      apiKeyEnv: 'OLLAMA_API_KEY',
      apiBase: 'https://ollama.com',
      openAiBase: 'https://ollama.com/v1',
      usageUrl: 'https://ollama.com/api/usage',
      balanceUrl: 'https://ollama.com/api/balance',
      transport: 'native',
      modelTransports: {},
      requestTimeoutMs: 300000,
      streamIdleTimeoutMs: 300000,
      visibleModels: ['model-1', 'model-2'],
      showAllModels: false,
      modelVisibility: {},
      filterModelsByPlan: true,
      contextWindow: null,
      contextWindowOverrides: {},
      maxOutputTokens: null,
      accounts: [],
      modelAccountRules: [],
      stickySession: true,
      activeAccount: '',
      showSidebarQuota: false,
      planLabel: '',
      priceOverrides: {},
      userAgent: 'test',
    },
    models: [
      { id: 'model-1', name: 'Model 1', description: '', transport: 'native', contextWindow: 1, maxTokens: 1, free: true, cost: { input: 0, output: 0, cacheRead: 0 }, available: true, input: ['text'], reasoning: [], defaultReasoning: null, tools: true, visible: true },
      { id: 'model-2', name: 'Model 2', description: '', transport: 'native', contextWindow: 1, maxTokens: 1, free: true, cost: { input: 0, output: 0, cacheRead: 0 }, available: true, input: ['text'], reasoning: [], defaultReasoning: null, tools: true, visible: true },
    ],
  } as never

  let savedPatch: ReturnType<typeof patchOf> | null = null

  function InteractiveForm() {
    const [draft, setDraft] = useState(() => draftOf(sampleState))

    const toggleModel = (id: string, visible: boolean) => {
      const current = new Set(draft.visibleModels)
      const nextVis = { ...draft.modelVisibility }
      if (visible) current.add(id)
      else current.delete(id)
      delete nextVis[id]
      setDraft((prev) => ({
        ...prev,
        visibleModels: [...current],
        showAll: false,
        modelVisibility: nextVis,
      }))
    }

    const hideAll = () => {
      setDraft((prev) => ({
        ...prev,
        showAll: false,
        visibleModels: [],
        modelVisibility: {},
      }))
    }

    return (
      <div>
        <span id="model-count">{draft.visibleModels.length}</span>
        <button id="hide-all-btn" type="button" onClick={hideAll}>Hide all</button>
        <button id="toggle-m1" type="button" onClick={() => toggleModel('model-1', false)}>Uncheck m1</button>
        <button id="save-btn" type="button" onClick={() => { savedPatch = patchOf(draft) }}>Save</button>
      </div>
    )
  }

  await act(async () => {
    root.render(<InteractiveForm />)
  })

  const countEl = div.querySelector('#model-count')
  assert.equal(countEl?.textContent, '2')

  // Action: uncheck model-1
  const toggleBtn = div.querySelector('#toggle-m1') as HTMLButtonElement
  await act(async () => {
    toggleBtn.dispatchEvent(new win.Event('click', { bubbles: true }))
  })
  assert.equal(countEl?.textContent, '1')

  // Action: click Hide All
  const hideAllBtn = div.querySelector('#hide-all-btn') as HTMLButtonElement
  await act(async () => {
    hideAllBtn.dispatchEvent(new win.Event('click', { bubbles: true }))
  })
  assert.equal(countEl?.textContent, '0')

  // Action: click Save
  const saveBtn = div.querySelector('#save-btn') as HTMLButtonElement
  await act(async () => {
    saveBtn.dispatchEvent(new win.Event('click', { bubbles: true }))
  })

  assert.ok(savedPatch !== null)
  assert.deepEqual(savedPatch.visibleModels, [])
  assert.equal(savedPatch.showAllModels, false)
  assert.deepEqual(savedPatch.modelVisibility, {})

  // Clean unmount
  await act(async () => {
    root.unmount()
  })
  assert.equal(div.innerHTML, '')
})
