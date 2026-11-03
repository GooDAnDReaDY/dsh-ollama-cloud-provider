# Private read authorization

## Plugin boundary

`/dsh-ollama/state`, `/dsh-ollama/analytics`, `/dsh-ollama/usage` and
`/dsh-ollama/balance` require a host-verified session cookie. The cookie is
checked against the host's authenticated `/api/version`; a missing cookie,
401/403, redirect or failed probe is rejected. `/dsh-ollama/health` and
`/dsh-ollama/status` remain public for monitoring.

## LAN role boundary

The plugin cannot read the LAN bridge's admin/guest role: `dsh-lanmode`
resolves roles at the proxy and does not expose a role service to plugins.
Deployments that expose DSH through that bridge must add the four sensitive
paths to the bridge's guest-deny/privileged-extra policy. This is an
operational profile configuration, not a plugin change; the bridge package is
not modified by this project.

## Verification

- Unit test: no cookie and a forged cookie are rejected; a host-verified cookie
  is accepted.
- Deployment smoke: WEB with a valid session returns 200 for `/state`; without
  a cookie it returns 403.
