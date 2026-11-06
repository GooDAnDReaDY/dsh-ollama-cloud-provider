# dsh-ollama-cloud-provider

## Purpose

Native Ollama Cloud provider for DeepSeek Harness: models catalog, account and
key pool, quota/usage cards, analytics, settings page, and service status.

## Status

Active. 0.1.31 is cloud-only and verified on the production Web host and Desktop;
0.1.30 is the previous release.

## Entry Points

- `src/index.ts` — plugin registration.
- `src/client/index.tsx` — settings page, quota card, panel.
- `cordis.patch.yml` — plugin manifest.

## Commands

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run check`
- `npm pack`

## Documentation

- `@AGENTS.md` — project rules and constraints.
- `@docs/design/DESIGN.md` — design contract.
- `@docs/testing/test-server.md` — approved DSH test-server checks.
- `@docs/security/roles.md` — private-read host/role policy.
- `@README.md` — user-facing setup and usage.

## Deployment

Install the exact published package into the intended DSH profile, then verify
version, health, `/state`, model count, and `/test`. The production targets are
the DSH Web host and DSH Desktop; the Command Code host process is never
restarted or killed.
