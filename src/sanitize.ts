const SECRET_QUERY = new Set([
  'api_key', 'apikey', 'key', 'token', 'access_token', 'refresh_token',
  'password', 'passwd', 'secret', 'client_secret', 'sig', 'signature',
  'credential', 'code', 'auth',
])

const MAX_TEXT = 300

export function redactText(value: string, max = MAX_TEXT): string {
  let text = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[redacted]')
    .replace(/\b(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s&,"']+/gi, '$1=[redacted]')
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

export function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY.has(key.toLowerCase())) url.searchParams.delete(key)
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return redactText(raw)
  }
}

export function safeErrorMessage(error: unknown, fallback = 'request failed'): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
  return redactText(text === '' ? fallback : text)
}
