# Changelog

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
