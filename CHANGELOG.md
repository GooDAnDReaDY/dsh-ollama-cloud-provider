# Changelog

## 0.1.2 — 2026-10-21

- Test connection falls back to the reasoning text when a thinking model returns
  no content, and uses a 64-token budget (#17).
- Production acceptance of 0.1.1 confirmed chat, catalog and balance; the probe
  is the only follow-up defect.

## 0.1.1 — 2026-10-21

Audit fixes (Gitea #1–#15):

- A transient transport/timeout/server failure no longer cools down the only
  configured account; the harness retry policy can recover. Credential and quota
  rejections still cool the key (#1).
- Removed the unimplemented `toolUpdate: 'addition-only'` declaration so the
  model always receives the full tool list (#2).
- `/dsh-ollama/key` and `/key/clear` only accept this plugin's credential
  references (`apiKeyEnv`, configured account refs and `OLLAMA_*`) (#3).
- The sidebar quota card honors `showSidebarQuota`, stays unmounted while the
  setting is off and stops polling `/state` (#4).
- The injected stylesheet carries `data-dsh-plugin` so neighbouring plugin
  cleanup cannot strip it (#5).
- Analytics uses the shared `estimateCost` implementation and applies
  `priceOverrides` (#7).
- Empty catch blocks report through `bestEffortFailed` at debug level (#8).
- Removed unused modules and exports (`quota-runway`, `requireImages`,
  `clearAnalyticsCache`, `PLUGIN_PROVIDERS`, `showUrlFor`) (#9).
- Heatmap and theme values no longer hardcode colors (#10).
- Test-connection requests disable thinking and use a 32-token budget (#11).
- The request log is flushed on shutdown (#12).
- Architecture documentation moved to `docs/design/ARCHITECTURE.md`; the
  design contract lives in `docs/design/DESIGN.md` (#13).
- Added wiring, analytics, route-guard and adapter regression tests (#14).
- Account rows show the 7-day spend without a meaningless percentage (#15).

## 0.1.0

Initial release.

- Registers the `ollama-cloud` provider route for DeepSeek Harness.
- Native `/api/chat` transport (NDJSON) with thinking, tool calls, images and usage counters.
- OpenAI-compatible `/v1/chat/completions` transport selectable per model.
- Live model catalog from `/v1/models` enriched with `/api/tags` capabilities, plus an offline snapshot.
- Balance from `/api/balance` (credits and legacy percentage windows) and spend from `/api/usage`
  with 24-hour, 7-day and 30-day windows and per-model groups.
- Multi-account rotation before the first streamed token, persistent cooldowns, sticky sessions and
  model → account glob rules.
- Price estimates including off-peak rates and per-model overrides.
- Settings page, sidebar quota card, quota/analytics panel with a request heatmap, `/ollama` command,
  TUI settings section and one-click plugin update.
