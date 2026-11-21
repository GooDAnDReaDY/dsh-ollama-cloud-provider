/** Provider route owned by this plugin. */
export const PROVIDER = 'ollama-cloud'

/** Historical ids kept only for analytics continuity. */
export const LEGACY_PROVIDERS = ['ollama'] as const

export const PLUGIN_AND_LEGACY_PROVIDERS = new Set<string>([PROVIDER, ...LEGACY_PROVIDERS])
