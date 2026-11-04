# #46 — dev-only Zod advisory

## Finding

`npm audit --package-lock-only` reports 8 high entries. All of them resolve to
one advisory:

- `zod < 4.6.6`
- GHSA-mrhx-c7xc-m3w5, CVE-2023-54404
- memory exhaustion while validating oversized constrained collections

The other seven entries are dependency chains of DSH packages, not separate
vulnerabilities. The plugin itself has no runtime npm dependencies and does not
bundle `zod`.

## Dependency trees

- Development tree: DSH `0.2.1-rc.4` packages pin `zod@4.4.3` exactly.
- `@deepseek-ai/dsh-llm@0.2.1-rc.5`, `0.2.2-alpha.2/3` and `0.2.2-rc.1` also pin `zod@4.4.3`.
- Production tree: `npm audit --omit=dev --package-lock-only` reports
  `high: 0, total: 0`.

Because the DSH packages use an exact version, a root `zod` devDependency and
`npm update` do not change the nested copies. Fixing the audit would require a
forced override or an upstream DSH release that moves off `4.4.3`; the project
does not add forced overrides.

## Decision

- Do not add an override or a workaround.
- Keep the dev-only advisory visible in `npm audit`.
- Re-check after a DSH core release changes its pinned `zod` version.
- Production acceptance relies on the production audit and the fact that the
  plugin has no runtime dependencies.

Status: blocked upstream; production tree clean.
