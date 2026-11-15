import { isIP } from 'node:net'

export interface EndpointCheck {
  ok: boolean
  value?: string
  error?: string
}

function isLinkLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === '0.0.0.0' || host === '::') return true
  const family = isIP(host)
  if (family === 4) return host.startsWith('169.254.')
  if (family === 6) return /^fe[89ab]/.test(host)
  return false
}

/**
 * Endpoint URLs carry the API key, so only an absolute http(s) URL without
 * embedded credentials or a fragment is accepted, and link-local/metadata
 * addresses are refused.
 */
export function checkEndpoint(field: string, value: unknown): EndpointCheck {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, error: `${field} must be a non-empty URL` }
  }
  const candidate = value.trim()
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, error: `${field} must be an absolute URL` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: `${field} must use http or https` }
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, error: `${field} must not embed credentials` }
  }
  if (url.hash !== '') {
    return { ok: false, error: `${field} must not contain a fragment` }
  }
  if (isLinkLocalHost(url.hostname)) {
    return { ok: false, error: `${field} must not target a link-local address` }
  }
  return { ok: true, value: candidate }
}

export function endpointOr(value: unknown, field: string, fallback: string): string {
  const checked = checkEndpoint(field, value)
  return checked.ok ? checked.value ?? fallback : fallback
}
