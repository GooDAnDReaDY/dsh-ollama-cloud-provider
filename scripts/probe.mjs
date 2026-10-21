/**
 * Live probe for Ollama Cloud. Read-only against the public catalog; the chat,
 * balance and usage probes run only when OLLAMA_API_KEY is set.
 *
 *   node scripts/probe.mjs
 *   OLLAMA_API_KEY=... node scripts/probe.mjs
 */
const base = (process.env.OLLAMA_BASE ?? 'https://ollama.com').replace(/\/+$/, '')
const key = process.env.OLLAMA_API_KEY?.trim() ?? ''
const userAgent = 'dsh-ollama-cloud-provider-probe/0.1.0'

const headers = { accept: 'application/json', 'user-agent': userAgent }
const authHeaders = { ...headers, ...(key === '' ? {} : { authorization: `Bearer ${key}` }) }

async function get(path, withAuth = false) {
  const response = await fetch(`${base}${path}`, { headers: withAuth ? authHeaders : headers })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 300) }
  return { status: response.status, headers: response.headers, body }
}

function show(label, value) {
  console.log(`\n## ${label}`)
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2).slice(0, 4000))
}

const models = await get('/v1/models')
if (models.status !== 200) {
  show('catalog', `HTTP ${models.status}: ${JSON.stringify(models.body)}`)
  process.exit(1)
}
const data = Array.isArray(models.body.data) ? models.body.data : []
const rich = Array.isArray(models.body.models) ? models.body.models : []
show('catalog counts', { ids: data.length, rich: rich.length })
show('catalog sample', rich.filter((entry) => entry.slug === 'gpt-oss:120b' || entry.slug === 'glm-5.3'))
show('reasoning field names', [...new Set(rich.flatMap((entry) =>
  (entry.supported_reasoning_levels ?? []).map((level) => level.effort))) ])

const tags = await get('/api/tags')
show('tags status', tags.status)
if (tags.status === 200) {
  const rows = Array.isArray(tags.body.models) ? tags.body.models : []
  show('tag capabilities', rows.slice(0, 6).map((row) => ({ name: row.name, capabilities: row.capabilities })))
}

if (key === '') {
  console.log('\nNo OLLAMA_API_KEY set: chat, balance and usage probes skipped.')
  process.exit(0)
}

const badKey = await fetch(`${base}/api/balance`, {
  headers: { ...headers, authorization: 'Bearer definitely-invalid' },
})
show('invalid key shape', { status: badKey.status, body: await badKey.text() })

show('balance', await get('/api/balance', true).then((result) => ({ status: result.status, body: result.body })))
show('usage 7d', await get('/api/usage?range=7d&group_by=model', true)
  .then((result) => ({ status: result.status, body: result.body })))
show('show model', await get('/api/show', true).then((result) => ({ status: result.status })))

const chat = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: { ...authHeaders, 'content-type': 'application/json' },
  body: JSON.stringify({
    model: process.env.OLLAMA_PROBE_MODEL ?? 'gpt-oss:120b',
    messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
    stream: true,
    options: { num_predict: 16 },
  }),
})
show('native chat status', { status: chat.status, contentType: chat.headers.get('content-type') })
const chatText = await chat.text()
const lines = chatText.split('\n').filter((line) => line !== '')
show('native chat lines', lines.map((line) => {
  try {
    const parsed = JSON.parse(line)
    return {
      done: parsed.done,
      content: parsed.message?.content,
      thinking: parsed.message?.thinking,
      tool_calls: parsed.message?.tool_calls,
      done_reason: parsed.done_reason,
      prompt_eval_count: parsed.prompt_eval_count,
      eval_count: parsed.eval_count,
    }
  } catch {
    return line.slice(0, 200)
  }
}))

const openai = await fetch(`${base}/v1/chat/completions`, {
  method: 'POST',
  headers: { ...authHeaders, 'content-type': 'application/json' },
  body: JSON.stringify({
    model: process.env.OLLAMA_PROBE_MODEL ?? 'gpt-oss:120b',
    messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
    stream: true,
    max_tokens: 16,
    reasoning_effort: 'low',
    stream_options: { include_usage: true },
  }),
})
show('openai chat status', { status: openai.status, contentType: openai.headers.get('content-type') })
const openaiText = await openai.text()
const deltaKeys = new Set()
for (const line of openaiText.split('\n')) {
  if (!line.startsWith('data:')) continue
  const payload = line.slice(5).trim()
  if (payload === '' || payload === '[DONE]') continue
  try {
    const parsed = JSON.parse(payload)
    for (const choice of parsed.choices ?? []) {
      for (const name of Object.keys(choice.delta ?? {})) deltaKeys.add(name)
    }
  } catch {
    // Ignore malformed probe lines.
  }
}
show('openai delta field names', [...deltaKeys])
show('openai tail', openaiText.slice(-1200))
