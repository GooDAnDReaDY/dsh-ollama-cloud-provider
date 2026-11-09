# Changelog

## 0.1.35 — 2026-11-09

- Security: enforce host authentication check (`verifyHost`) across all loopback write routes (`/config`, `/key`), closing unauthenticated mutation bypass on non-desktop browser requests (#111).
- Security: validate request `Referer` when `Origin` is omitted on GET endpoints to reject cross-origin ambient read requests (#112).
- Security: validate URL scheme in `OllamaWebFetchProvider.fetch` to reject non-HTTP schemes (`file:`, `ftp:`) and malformed URLs with structured `WebError` (#115).
- Localization: localized all 11 sampling and generation parameter labels and tokens header in the Chinese dictionary (`const zh`) (#113).
- Accessibility: added explicit `aria-label` attributes to standalone form controls (model selection checkbox, API key inputs, account credentials, model routing rules, model search) in the settings UI for WCAG 2.1 SC 4.1.2 compliance (#114).

## 0.1.34 — 2026-11-07

- Security: patched transient zod memory exhaustion vulnerability (GHSA-mrhx-c7xc-m3w5) in dependencies via package overrides, achieving 0 audit vulnerabilities (#108).
- Component Testing: added automated test coverage for interactive state loading, failure reporting, and unmounting of `OllamaProviderCard` (#109).

## 0.1.33 — 2026-11-07

- Security: closed fake-cookie verification bypass on write routes (`/config`, `/key`) and sensitive read routes (`/state`, `/analytics`, `/usage`, `/balance`) by requiring an anonymous control probe to fail with 401 or 403, failing closed against public or synthetic hosts (#42, #56).
- Localization: localized weekday labels in request heatmap and tooltips/KPI descriptions in usage analytics across English and Chinese interfaces (#55).
- Model Visibility: fixed zero-model selection to persist `showAllModels: false` and clear positive overrides, added "Hide all" UI action, and pruned stale `modelVisibility` overrides (#63).
- Test Hygiene: replaced forbidden `rm(..., { recursive: true, force: true })` calls across all unit tests with safe non-force directory cleanup and graceful ENOENT handling (#106).
- Automated UI Coverage: added automated component action and interaction test suite covering settings loading/saving, updater retry/update flows, language switching, and clean unmounting (#61).

## 0.1.32 — 2026-11-06

- Reliability: handled already-aborted signal check in adapter test mock to prevent hanging promises under load (#102).
- Diagnostics: routed catalog snapshot cleanup and TUI registration errors through `bestEffortFailed` (#103).
- Accessibility: added `aria-expanded` and CSS-rotated chevron indicator to collapsible model groups (#104).

## 0.1.31 — 2026-11-06

- Robustness: wrapped ndjson streaming chunk and tail JSON parsing in try/catch
  to safely discard or report corrupted chunks without aborting the connection abruptly (#97).
- Route Security: restricted `readOnly` check in route handlers to non-GET methods only
  (`req.method !== 'GET'`), avoiding premature rejects on idempotent read probes (#98).
- Deterministic Tests: enforced `--test-concurrency=1` in `package.json` test runner
  to ensure deterministic test order and prevent timer/teardown races under Node 24 (#99).
- UI Defaults: explicitly verified and locked invariant that all on-screen UI badges and
  widgets (specifically `showSidebarQuota`) remain disabled by default (`false`) and must
  be explicitly enabled by user in settings (#100).

## 0.1.30 — 2026-11-05

- Security: credential writes now accept only the configured default/account
  refs; the allowlist no longer falls through to every `OLLAMA_*` name.
- Security: private-read host verification uses the local socket origin instead
  of the request Host and rejects a public 404 probe, closing DNS-rebinding
  cookie/SSRF exposure while preserving DSH's authenticated-404 behavior.
- Security: unsaved-endpoint discovery now requires HTTPS and rejects
  loopback/link-local/private/reserved addresses; test-only private targets are
  explicit.
- Build: declared `react-dom` and `@types/react-dom`; clean `npm ci` now passes
  the full test/build gate. Added host-verification coverage; 132/132.

## 0.1.29 — 2026-11-05

- Made the plugin cloud-only. Removed the local endpoint mode, local model
  management (`/api/tags`, `/api/ps`, pull/remove), local GUI/CLI, `/api/show`
  probes and the empty-key local credential path. `apiKeyEnv` now falls back to
  the cloud credential reference instead of enabling a local endpoint.
- Added the native `settings.models.provider-card` provider card showing
  provider identity, key state, model count, transport and quota bars; the
  existing settings page remains available.
- Removed local tests/docs and added provider-card render coverage; 130/130.

## 0.1.27 — 2026-11-05

- Usage reader keeps the last good snapshot per key/range and returns it as
  `stale` when balance and usage later fail; the card marks stale data instead
  of losing the meters.
- Usage requests retry transient/429/5xx failures with bounded backoff.
- Added session/weekly/monthly aliases and per-window model activity
  (`byWindow`) alongside the existing 24h/7d/30d windows and sidebar meters.
- Added last-good, retry and window tests; 138/138.

## 0.1.26 — 2026-11-05

- Added configurable pre-response retry/backoff (`retryMaxRetries`, base/max
  delay, jitter). Only headers/pre-first-token failures retry; post-token
  streams never retry, and account rotation is not duplicated.
- Sanitized endpoint URLs, provider errors, status errors and web errors:
  userinfo and secret query parameters are stripped, control characters and
  tokens are redacted, and long messages are bounded before logs/UI.
- Added retry/backoff and sanitizer tests, plus a 503 retry adapter test;
  137/137.

## 0.1.25 — 2026-11-05

- Added safe model discovery against an unsaved endpoint with an optional
  one-shot key. The key is used only for that request and is never persisted,
  saved or logged; discovery has no state side effects.
- Discovery returns a draft catalog preview (v1/models with tags fallback),
  rejects invalid/credential-bearing URLs, and keeps the current provider
  settings unchanged.
- Added discovery UI and 401/no-leak/invalid-URL tests; 132/132.

## 0.1.24 — 2026-11-05

- Added per-model capability/thinking overrides (`modelOverrides`) for
  context, vision, thinking, reasoning efforts/default and enabled; the
  override wins over manual entries and live discovery. Disabled models are
  hidden from the picker.
- Added a model override editor exposing context, input/output/cacheRead
  prices, visibility, vision/thinking/enabled tri-state and reset-to-live.
- `/api/show` capability probes remain TTL-cached and are invalidated on local
  pull/remove.
- Added override precedence and validation tests; 129/129.

## 0.1.23 — 2026-11-05

- Richer model catalog rows grouped by effective context, collapsible groups,
  drag reorder persisted as `modelOrder`, and context labels/badges.
- Added manual catalog entries/overrides with id, display name, context,
  max output, vision, thinking, reasoning efforts/default and tools. Entries
  merge over live discovery; disabled entries are hidden from the picker and
  invalid ids are rejected.
- Added model grouping/reorder/render tests and manual merge tests; 128/128.

## 0.1.22 — 2026-11-05

- Added `/ollama-context` with 4k/8k/16k/32k/64k/128k presets, custom token
  values, follow, status and reset. The override is session-scoped and wins
  over configured `num_ctx`; sessions remain isolated.
- Added an independent whole-attempt budget (`attemptTimeoutMs`, default off)
  for chat, catalog and web requests. Each retry gets a fresh budget; caller
  cancellation is distinguished from timeout.
- Added settings for the attempt budget and tests for budget/timeout/session
  isolation; 124/124 tests.

## 0.1.21 — 2026-11-05

- Added local Ollama model management: `/api/tags` disk inventory, `/api/ps`
  running models and VRAM, `/api/show` details, `/api/pull` progress streaming,
  and confirmed `/api/delete`. Cloud endpoints are rejected.
- Added `/ollama local [models|ps|show|pull|remove]` CLI commands; removal
  requires `--yes` and never forces a delete.
- Added the local models settings card with pull progress, disk/running totals,
  details and a two-step remove confirmation.
- Extended the mock Ollama contract with tags sizes, ps, pull and delete;
  119/119 tests.

## 0.1.20 — 2026-11-05

- Persisted the catalog snapshot under `$DSH_HOME/cache/dsh-ollama-cloud/`
  with atomic temp+rename writes, schema/endpoint validation, and corrupt-file
  recovery. Offline starts serve the last snapshot immediately.
- Added `autoRefresh` and `refreshMinutes` controls: mount refresh, periodic
  forced refresh, and a settings UI; turning auto-refresh off leaves the cache
  untouched.
- Retired models explicitly missing from `/api/show` (404/410), while
  transient show failures keep the previous model.
- Added cache, offline, retirement and settings tests; 115/115 tests.

## 0.1.19 — 2026-11-05

- Added configurable native generation defaults: temperature, top_k, top_p,
  min_p, seed, repeat_penalty, repeat_last_n, num_ctx, keep_alive and stop.
  Request options override config; Ollama-only fields are not sent to the
  OpenAI transport. Added settings fields for all values.
- Normalized thinking ladders: boolean switches become off/high, level lists
  are ordered and deduplicated, and known families get a default effort
  (GLM-5.x/Kimi K3 max, Kimi K2/DeepSeek V4/MiniMax M3 high, GPT-OSS medium,
  Nemotron low) only when that level is offered.
- Added generation/reasoning tests; 112/112 tests.

## 0.1.18 — 2026-11-05

- Added local/self-hosted Ollama mode: an explicit empty `apiKeyEnv` means no
  authentication. Native and OpenAI requests omit `Authorization`, the key pool
  returns a synthetic empty credential, and usage/balance requests are skipped.
- `/api/show` probing enriches local model discovery with context window,
  vision, tools and thinking capabilities; successful probes are cached for five
  minutes and cleared with the catalog cache or explicitly.
- Catalog discovery now falls back to `/api/tags` ids when `/v1/models` is
  empty and adopts `/api/show` metadata for local endpoints.
- Added local-mode, probe-cache and no-auth tests; 109/109 tests.

## 0.1.17 — 2026-11-05

- Added Ollama web capabilities behind `ctx.web`: a search provider and a fetch
  provider with id `ollama-cloud`, using `POST /api/web_search` and
  `POST /api/web_fetch` with the configured credential.
- Web requests fail closed on redirects, use a 15s per-attempt timeout, retry
  one pre-response transport/timeout failure, cap search results at 10 and
  bound fetched bodies at 256 KiB with a `truncated` result.
- Registered the providers only when the `web` service exists; selecting them is
  a profile policy (`web.searchProvider` / `web.fetchProvider`).
- Added a deterministic mock Ollama contract server and tests for
  `/api/tags`, `/api/show`, `/api/chat`, `/api/web_search` and `/api/web_fetch`.

## 0.1.16 — 2026-11-04

- Added DSH 0.2.2 support: `0.2.2-alpha.2`, `0.2.2-alpha.3` and `0.2.2-rc.1`
  are in `compatibility.dshReleases`; the accepted range is now
  `0.2.0-rc.2 || >=0.2.1-rc.2 <0.2.3-0` in `engines.dsh`,
  `compatibility.dsh` and every DSH peer dependency.
- Added the Cordis and Schemastery generations used by 0.2.2:
  `~4.0.6-alpha.1`/`~4.1.0` and `~3.18.6-alpha.1`/`~3.19.0`.
- Adapted host route registration to the 0.2.2 `WebRoute | WebResourceRoute`
  union; command handlers use `WebRoute['handler']` without changing runtime
  behavior.
- Verified 0.2.2-alpha.3 and 0.2.2-alpha.2 with typecheck/build and the key
  runtime suites; 0.2.2-rc.1 passes the full 99-test suite, typecheck and build.

## 0.1.15 — 2026-11-02

- Desktop write requests are no longer accepted from a cookie name and a
  Desktop user agent alone. After the loopback Host/socket checks, the plugin
  verifies the `dsh-auth-*` cookie against the host's authenticated
  `/api/version`; a 401/403 or a failed probe rejects the write. Forged
  Desktop headers now return 403 (#42).
- Truncated streams now fail instead of reporting success: the native parser
  rejects EOF before `done:true`, and the OpenAI parser rejects EOF before
  `[DONE]`/`finish_reason` without emitting `block-end` or `finish`. Malformed
  SSE JSON is an error instead of being skipped (#43).
- Added project-specific `AGENTS.md` and `index.md` with architecture,
  constraints, compatibility, testing, security, and deployment facts (#44).
- Investigated the dev-only Zod advisory (#46). DSH core packages pin
  `zod@4.4.3` exactly in rc.4, rc.5, and 0.2.2-alpha, so no in-range
  dependency update exists; forced overrides are not used. The production tree
  (`npm audit --omit=dev`) reports zero because the plugin has no runtime npm
  dependencies. The dev-only advisory remains tracked upstream.
- Removed the local multi-version `test:engine` loop. It created its own DSH
  runtime, installed a `file:` worktree package, and used forced cleanup,
  contrary to the project test-server rules. Compatibility checks now follow
  the approved test-server procedure in `docs/testing/test-server.md` (#47).
- SSE normalization now operates on the accumulated buffer, so CRLF split
  between network chunks and split UTF-8 sequences parse correctly (#48).
- Live catalog metadata is scoped by API base, pruned when models disappear,
  and invalidated together with the cache; a generation guard discards a
  background refresh that finishes after a clear (#49).
- Request analytics no longer deduplicates independent requests by timestamp;
  concurrent requests that start in the same millisecond and their errors are
  counted (#50).
- Per-field price overrides now win over generated off-peak rates; partial
  overrides apply only to the overridden field (#51).
- `/ollama test` disables reasoning, uses 64 tokens, and reports an empty or
  reasoning-only reply as an error instead of `OK` (#52).
- Analytics scans the newest projection files by mtime when the directory
  exceeds 5000 files and marks the report as truncated; the UI shows the
  incompleteness warning (#53).
- The update card distinguishes a failed registry check from “up to date” and
  offers a retry; the install button is disabled while the check has failed
  (#54).
- Quota labels, window labels and credit detail are localized in English and
  Chinese instead of rendering English strings directly (#55).
- Sensitive read routes (`state`, `analytics`, `usage`, `balance`) require a
  host-verified session cookie; `health` and `status` remain public (#56).
- The usage reader honors its 30-second failure cache, caches a total failure,
  and deduplicates concurrent reads (#57).
- Credential config patches and key writes are restricted to the plugin's
  `OLLAMA_*` namespace, closing the two-step `OTHER_PLUGIN_API_KEY` mutation
  path (#60).
- Saving or clearing a key refreshes server state without discarding an
  unsaved settings draft (#62).
- Added an explicit `showAllModels` switch: an empty `visibleModels` list with
  `showAllModels:false` now means “hide all” and survives save/reload; legacy
  configs with an absent switch keep the previous empty-means-all behavior
  (#63).
- Updated the design contract, README install examples and the default user
  agent to the current version (#59).
- Removed the unused SSE event parser and the redundant stored image `base64`
  field; transports keep using the single `dataUrl` representation (#58).

## 0.1.14 — 2026-10-29

- Model-scoped rejections (unsupported model or per-model quota) mark only that
  account+model for five minutes; the key remains usable for other and free
  models. Account-wide quota, credential and rate-limit rejections still cool
  the key.

## 0.1.13 — 2026-10-29

- Account cards now show per-account balance/remaining credits, purchased
  amount, reset date and the time of the last usage read (or the 5-hour/weekly
  bars for legacy accounts).
- Model-scoped rejections (unsupported model or per-model quota) now mark only
  that account+model for five minutes; the key stays usable for other and free
  models. Account-wide quota still cools the key.
- Added `npm run test:engine`: an isolated boot matrix that installs every
  declared `dshReleases` core, composes the plugin, checks `--dump-config` and
  waits for `/dsh-ollama/health` in a real web host. Supports
  `--versions 0.2.1-rc.4` for a single release.

## 0.1.12 — 2026-10-29

- The sidebar quota card and panel now pause polling while the document is
  hidden and refresh immediately when it becomes visible again.
- Settings gained a **Service status** row: a local, keyless probe of the
  public tag endpoint with latency, checked time and an error state. Ollama
  Cloud has no public status page, so this row reports host-to-gateway
  reachability only.
- Error mapping now recognizes context-window overflow (using the harness
  `CONTEXT_WINDOW_EXCEEDED_CODE`), model capability rejections for images/tools
  and oversized request bodies, instead of returning a generic 400 message.

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
