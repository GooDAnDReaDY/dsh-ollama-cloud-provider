import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'

const LOOPBACK_NAMES = new Set(['localhost', 'localhost.'])

function normalize(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.+$/, '')
}

/**
 * A DNS name is never loopback: only a literal IPv4/IPv6 loopback address is.
 * Prefix matching on the raw string would accept `127.0.0.1.attacker.example`,
 * which is exactly the host a DNS-rebinding page presents.
 */
export function isLoopbackAddress(value: string | undefined): boolean {
  if (value === undefined) return false
  const address = normalize(value)
  const family = isIP(address)
  if (family === 4) return address.startsWith('127.')
  if (family === 6) return address === '::1' || address.startsWith('::ffff:127.')
  return false
}

export function isLoopbackHostname(value: string): boolean {
  const hostname = normalize(value)
  if (LOOPBACK_NAMES.has(hostname)) return true
  return isLoopbackAddress(hostname)
}

function localAddresses(): Set<string> {
  const addresses = new Set<string>()
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      addresses.add(normalize(entry.address))
    }
  }
  return addresses
}

export function isLocalHostname(value: string): boolean {
  const hostname = normalize(value)
  if (isLoopbackHostname(hostname)) return true
  if (isIP(hostname) === 0) return false
  return localAddresses().has(hostname)
}

export function authorityHostname(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  try {
    return normalize(new URL(`http://${value}`).hostname)
  } catch {
    return undefined
  }
}
