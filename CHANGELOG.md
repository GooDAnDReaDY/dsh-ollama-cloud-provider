# Changelog

## 0.1.11 — 2026-10-29

- Compatibility declarations now use the same-channel range
  `0.2.0-rc.2 || >=0.2.1-rc.2 <0.2.2-0` in `engines.dsh`,
  `compatibility.dsh` and all DSH peer dependencies. Future `0.2.1-rc.*`
  releases are admitted without a new plugin release; `dshReleases` remains the
  tested engine matrix. A compatibility test guards the range, release list and
  devDependency versions.
- The model catalog is stale-while-revalidate: a cached catalog is returned
  immediately after its TTL and refreshed in the background; only the first
  load waits for the network. A failed background refresh keeps the cached rows.
- Tool schema normalization is memoized per `parameters` object with a
  `WeakMap`, so large MCP tool lists are not re-normalized on every request.

## 0.1.10 — 2026-10-28

- Stabilized the native stream parser tests: a referenced keep-alive holds the
  test event loop until idle/abort rejections settle, a guard timeout turns a
  missed rejection into a readable failure, and the idle-cancel assertion polls
  instead of racing the cancel callback. Production behavior is unchanged; the
  idle timer stays unref'd. Verified with three concurrent `npm test` runs and
  preflight's configured test run.

## 0.1.9 — 2026-10-28

- Support DSH core `0.2.1-rc.4`: `compatibility.dshReleases`, `engines.dsh` and
  every `@deepseek-ai/dsh-*` peer range now include it; devDependencies and the
  lockfile are pinned to rc.4. Verified with `npm run check` (59/59) and an
  isolated rc.4 web profile (activation, settings, catalog and a real request).

## 0.1.8 — 2026-10-26

- Support DSH core `0.2.1-rc.3`: `compatibility.dshReleases`, `engines.dsh` and
  every `@deepseek-ai/dsh-*` peer range now include it; devDependencies and the
  lockfile are pinned to rc.3. Verified with `npm run check` (59/59) and three
  concurrent test runs.

## 0.1.7 — 2026-10-22

- Identify the Desktop renderer by the signed host auth cookie plus the desktop
  user agent when Origin and Referer are absent (the dsh-app protocol strips
  both). Plain LAN clients without either still receive 403 (#28).

## 0.1.6 — 2026-10-22

- Accept the DSH Desktop renderer origin `dsh-app://app` on write routes after
  the loopback Host and socket checks. Without this explicit exception the
  same-origin guard in 0.1.5 rejected every Desktop settings write (#28).

## 0.1.5 — 2026-10-22

- Write routes now require an `Origin` or `Referer` whose host matches `Host`;
  a request with neither is rejected with 403. This closes the LAN-bridge path
  that rewrites both Host and socket to loopback (#28).
- Added route-guard tests for 405, non-loopback Host/socket, cross-origin and
  missing sources, plus native stream parser tests for text, thinking, tool
  calls, in-band quota errors, aborts, idle timeouts, abrupt closes and empty
  streams (#26).
- `prepare` now sends tsdown output to stderr, so `npm pack --json` stays
  parseable and preflight can inspect the package (#25).
- DESIGN.md now records the 64-token Test connection budget and its reason (#27).

## 0.1.4 — 2026-10-21

- Model list rows now use the reference three-column grid: badges live inside
  the name cell, so rows no longer stretch, wrap into empty gaps or truncate the
  model id to a single character (#20).
- The sidebar quota card uses the reference 16px ring and no longer appends the
  internal `default` account label. An optional `planLabel` (for example `PRO`)
  can be shown next to the provider name instead (#21).

## 0.1.3 — 2026-10-21

- Aligned README documentation trio with dsh-documentation-standard: added standardized Hero headers, goodandready.app hub badges, support tables, and Mermaid architecture diagrams across English, Russian, and Chinese documentations.
- Updated installation instructions and package version parity.

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
