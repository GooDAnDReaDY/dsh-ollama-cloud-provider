# AGENTS.md

This file adds project-specific rules and facts to the root
`../../AGENTS.md`. The root rules still apply; if they conflict with this file,
stop and ask the owner before changing anything.

## Product / Purpose

- Project: `dsh-ollama-cloud-provider`.
- Package: `@goodandready/dsh-ollama-cloud-provider`.
- Purpose: native Ollama Cloud LLM provider for DeepSeek Harness (DSH):
  models catalog, account/key pool, quota and usage cards, analytics, settings
  page, and service status.
- Users: DSH Desktop, DSH Web, and TUI users with an Ollama Cloud key.
- Status: active. 0.1.16 is verified on the production Web host and Desktop
  (DSH 0.2.1-rc.4); it adds the DSH 0.2.2 compatibility range.
- DEV checkout: the repository root; work happens only in a Git worktree.

## Package Policy

- Public package under the `@goodandready` scope from the first commit.
- Do not publish, tag, push a public release, or change the package version
  without an explicit owner instruction.
- Registry installs use the exact published version; `file:` links to a
  worktree and copies of the project are not install sources.
- Keep source, README, docs, examples, and configuration free of API keys,
  tokens, personal data, private hosts, and internal paths.

## Project Index (`index.md`)

- Created and checked: yes, `index.md`.
- Entry points: `src/index.ts` (plugin), `src/client/index.tsx` (settings and
  sidebar UI), `cordis.patch.yml` (plugin manifest).
- `index.md`; detailed design in `@docs/design/DESIGN.md`;
  test-server procedure in `@docs/testing/test-server.md`; private-read role
  policy in `@docs/security/roles.md`.

## Essential Files

- `src/adapter.ts` — provider adapter, routing, retries, request logging.
- `src/transports/native.ts` — default Ollama `/api/chat` NDJSON transport.
- `src/transports/openai-chat.ts` — optional OpenAI-compatible SSE transport.
- `src/catalog.ts` — model catalog and stale-while-revalidate refresh.
- `src/routes.ts` — host HTTP routes and write-route guards.
- `src/client/` — settings page, quota card/panel, analytics, heatmap.
- `src/settings.ts`, `src/config.ts`, `src/keys.ts` — configuration and
  credential handling.
- `tests/` — unit and integration tests using `node:test`.
- `CHANGELOG.md`, `README.md`, `README.ru.md`, `README.zh.md`.

## Key Architecture

- DSH plugin entry registers the provider, tools, settings section, main panel,
  sidebar footer action, CLI command, and host routes.
- The adapter selects an account from `KeyPool`, calls the selected transport,
  streams chunks to DSH, records usage, and rotates accounts on eligible errors.
- Native `/api/chat` is the default transport; OpenAI `/v1/chat/completions` is
  configurable for compatibility.
- The model catalog is persisted and refreshed with stale-while-revalidate.
- Configuration is the source of truth for behavior; credentials live only in
  the DSH credential service.
- The settings page writes only through loopback Host/socket and same-origin or
  verified Desktop requests.

## Compatibility

- `package.json` `compatibility.dsh` defines the accepted DSH range;
  `compatibility.dshReleases` lists only releases actually exercised on the
  approved DSH test server.
- Do not widen the range or add a release to the tested matrix without running
  the applicable checks on the approved test server.
- Peer dependencies are `@deepseek-ai/dsh-*` packages. The plugin does not
  bundle them or ship runtime dependencies.

## Constraints (MUST NOT)

- Do not edit the DEV checkout root; create a Git worktree from `origin/main`
  and perform edits, builds, tests, and commits there.
- Do not run project commands on the local PC. Use the server and the approved
  DSH test server documented in the root rules.
- Do not install plugins into a runtime from a worktree, a project copy, or a
  `file:` dependency. Use a published package or the temporary package
  artifact allowed by the root test-server rules.
- Do not use forced deletion or overwrite operations. Remove only the plugin
  and temporary artifact created by the current test, through the standard DSH
  package commands.
- Do not change another plugin, the test-server profile, or its permanent
  `dsh-lanmode` plugin without a separate owner-approved task.
- Do not log or echo keys, tokens, request bodies, or credential values.
- Do not add Russian UI strings to source code; UI text follows the existing
  localization mechanism.

## Conventions

- TypeScript ESM; `npm` and `node --test`; build with `tsdown`.
- Keep the plugin's four surfaces aligned: provider, settings, sidebar/panel,
  and host routes.
- Prefer explicit, typed data flows; preserve existing naming and formatting.
- Add comments only where the logic is not self-evident.
- Update CHANGELOG and affected docs in the same change.
- UI uses DSH theme tokens and the existing `--ocl-*` roles; follow
  `@docs/design/DESIGN.md`.

## Locked Decisions

- 2026-10-21 — Ollama Cloud only; no local Ollama route.
- 2026-10-21 — native `/api/chat` by default; OpenAI transport is an option.
- 2026-10-21 — settings live in `settings.section` (`ollama`, order 20), in
  parity with the reference plugins.
- 2026-10-22 — write routes require same-origin `Origin`/`Referer`; Desktop has
  no source header and is accepted only after loopback Host/socket checks.
- 2026-11-02 — the Desktop exception verifies the `dsh-auth-*` cookie against
  the host's authenticated `/api/version`; a cookie name and a Desktop
  user-agent are not proof. A 401/403 or a failed probe rejects the write.
- 2026-11-02 — the local multi-version `test:engine` loop was removed because it
  created its own DSH runtime and used forced cleanup. Compatibility checks run
  on the approved DSH test server; see `@docs/testing/test-server.md`.
- 2026-11-02 — `state`, `analytics`, `usage` and `balance` require a
  host-verified session cookie; `health` and `status` stay public. The external
  LAN bridge remains responsible for guest/admin role enforcement.
- 2026-11-02 — an empty `visibleModels` with `showAllModels:false` means none;
  an absent switch keeps the legacy empty-means-all behavior.

## Dependencies

- Node.js >= 22.
- DSH `0.2.0-rc.2` and the `0.2.1`/`0.2.2` RC lines; see `package.json`.
- No runtime npm dependencies; all DSH packages are peers.
- Dev-only `zod` is an exact pin inside the DSH core packages. The plugin has
  no runtime npm dependencies, and the production tree reports no advisories.
  Do not add forced overrides to silence the dev-only advisory.

## Build And Run

- Install: `npm ci`.
- Typecheck: `npm run typecheck`.
- Unit tests: `npm test`.
- Full local gate: `npm run check` (typecheck, tests, build).
- Package: `npm pack` (the `prepare` script builds `lib/`).
- Do not start a local DSH runtime for compatibility testing; use the approved
  test server procedure.

## Testing

- Required before a release: `npm run check`, `npm pack`, installation of the
  exact candidate on the approved DSH test server, applicable health/state/
  model/`test` checks, and production smoke checks after deployment.
- Unit coverage includes route guards, native and OpenAI stream parsing,
  catalog/config/keys, account rotation, usage, analytics, settings, and
  compatibility metadata.
- A truncated native or OpenAI stream must fail; it must not emit success.
- Verify that write routes reject forged Desktop cookies and non-loopback
  requests.

## Security Review

- Write routes enforce POST, loopback Host and socket, JSON content type, and
  either a same-origin source or a host-verified Desktop identity.
- Never trust cookie names, user-agent strings, `Origin` alone, or a loopback
  socket alone as identity.
- API keys are read from stdin and stored only through the DSH credential
  service.
- Do not add unauthenticated write paths.

## Deployment

- Deploy only an exact registry version; install it into the intended DSH
  profile with the standard package command.
- Verify the installed version, service health, `/state`, model count, and
  `/test` on the target before reporting success.
- Never stop or kill the Command Code host process.
- Record the evidence in the issue and release notes.

## Known Issues And Limitations

- DSH core moves through release candidates; the accepted range is in
  `package.json`, and the tested-release list is intentionally explicit.
- The Desktop identity probe depends on the host's `/api/version` auth
  behavior; a host that does not protect that route requires a different
  verifier before widening the exception.
- The dev-only Zod advisory is handled by a direct dev pin; production
  reachability depends on the DSH deployment tree.

## Open Questions

- Which future DSH core releases should be added to the tested matrix after the
  approved test server is upgraded.
