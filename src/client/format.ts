export type Translate = (key: string) => string

export function relativeLabel(deltaMs: number, t: Translate): string {
  if (!Number.isFinite(deltaMs)) return t('now')
  if (deltaMs <= 0) return t('now')
  const minutes = Math.round(deltaMs / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}${t('minutesShort')}`
  const hours = Math.round(deltaMs / 3_600_000)
  if (hours < 24) return `${hours}${t('hoursShort')}`
  return `${Math.round(deltaMs / 86_400_000)}${t('daysShort')}`
}

function activeLocale(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const lang = document.documentElement.getAttribute('lang') ?? ''
  if (lang === '') return undefined
  try {
    const normalized = lang.replace(/_/g, '-')
    Intl.getCanonicalLocales(normalized)
    return normalized
  } catch {
    return undefined
  }
}

export function formatTime(value: string | number): string {
  return new Date(value).toLocaleTimeString(activeLocale())
}

export function formatDate(value: string | number): string {
  return new Date(value).toLocaleDateString(activeLocale())
}

export function formatDateTime(value: string | number): string {
  return new Date(value).toLocaleString(activeLocale(), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function creditsDetail(
  values: { remaining: number; allowance: number; purchased: number },
  t: Translate,
): string {
  const base = `${values.remaining.toFixed(2)} / ${values.allowance.toFixed(2)} ${t('remaining')}`
  return values.purchased > 0
    ? `${base} · ${t('purchased')} ${values.purchased.toFixed(2)}`
    : base
}
