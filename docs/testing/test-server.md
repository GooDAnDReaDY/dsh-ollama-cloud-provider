# Test-server compatibility checks

## Why

The project does not create its own DSH runtime for compatibility checks. A
locally assembled DSH home, a worktree `file:` dependency, a project copy in a
runtime profile, and forced cleanup are outside the project rules.

Compatibility is checked on the single approved isolated DSH test server
documented in the root `AGENTS.md`. The DSH home, profile, service, and
permanent `dsh-lanmode` plugin on that server belong to the test contour and
must not be changed without a separate owner-approved task.

## Procedure

1. Build the candidate once and publish or package it through the allowed
   channel. Use the exact same artifact for every check; do not rebuild after a
   check.
2. Install the candidate into the test profile with the standard DSH package
   command. For an unpublished version use the temporary package artifact
   allowed by the root rules; do not use a `file:` link to a worktree.
3. Run the applicable checks: plugin load, settings read/write, `/state`,
   model count, `/test`, a streaming request, and the quota/usage surfaces.
4. Record the DSH core version, plugin version, commands, and observed results
   in the Gitea issue.
5. Remove the tested plugin and its temporary artifact from the test contour
   with the standard package command. Do not use forced recursive deletion.

## Matrix limitations

The approved test server runs one DSH core at a time. `compatibility.dsh` is a
semver range; `compatibility.dshReleases` lists only the releases actually
exercised on that server. A release is not added to the matrix because the
range permits it; it is added after the checks above pass on the server.
