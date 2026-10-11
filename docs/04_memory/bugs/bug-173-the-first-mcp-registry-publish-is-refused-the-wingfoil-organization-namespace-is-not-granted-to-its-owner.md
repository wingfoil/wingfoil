---
id: bug-173-the-first-mcp-registry-publish-is-refused-the-wingfoil-organization-namespace-is-not-granted-to-its-owner
type: bug
title: "The first MCP Registry publish is refused: the wingfoil organization namespace is not granted to its owner"
status: in-review
severity: "medium"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P5.2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`wingfoil@0.2.2` is the first published version carrying `mcpName: io.github.wingfoil/wingfoil`, so it
is the first that can be listed in the MCP Registry (`dl-093`). The approver ran the listing with
`mcp-publisher`, and the registry refused it with a 403. The approver is an active owner of the
`wingfoil` GitHub organization and the membership is public, but the registry grants only the
personal namespace `io.github.robypomper/*`. The listing, and the `service` element that records it
(`dl-093` Actions, `dl-088`), are not delivered in v0.2.2.

## Steps to Reproduce

1. From the repository root at `main` (after `wingfoil@0.2.2` was published, 2026-09-29), with
   `server.json` naming `io.github.wingfoil/wingfoil` at version `0.2.2`:
   `mcp-publisher login github`, then `mcp-publisher publish`.
2. Repeat after `mcp-publisher logout` and a fresh `mcp-publisher login github`.

## Expected Behavior

The server `io.github.wingfoil/wingfoil` 0.2.2 is published, and
`curl -s 'https://registry.modelcontextprotocol.io/v0/servers?search=io.github.wingfoil/wingfoil'`
lists it.

## Actual Behavior

Both runs printed, as reported by the approver:

```
Publishing to https://registry.modelcontextprotocol.io...
Error: publish failed: server returned status 403: {"title":"Forbidden","status":403,"detail":"You do not have permission to publish this server. You have permission to publish: io.github.robypomper/*. Attempting to publish: io.github.wingfoil/wingfoil. If you're trying to publish to a GitHub organization, you may need to make your organization membership public in your GitHub settings: …"}
```

What the membership looks like on GitHub (2026-09-29):
- `gh api orgs/wingfoil/public_members --jq '[.[].login]'` → `["robypomper"]`: the membership is
  public;
- `gh api user/memberships/orgs/wingfoil --jq '{state, role}'` → `{"role":"admin","state":"active"}`:
  the approver is an active owner.

## Notes

- **Suspected cause (not verified).** The registry's GitHub handler (`modelcontextprotocol/registry`,
  `internal/api/handlers/v0/auth/github_at.go` on `main`, read 2026-09-29) grants `io.github.<org>/*`
  only to an organization Owner with an `active` membership. It reads the membership through
  `GET /user/memberships/orgs`, and when the token cannot see the organization it falls back silently
  to the personal namespace. The approver meets the Owner and `active` conditions. The likely blocker
  is therefore that the registry's OAuth app has no access to the `wingfoil` organization: GitHub's
  third-party OAuth app restrictions hide the organization from the app's token. Making the
  membership public does not lift that. The deployed registry may also differ from `main`.
- **Candidate fixes**, in order of cost:
  - grant the registry's OAuth app access to `wingfoil`, from github.com/settings/applications →
    Authorized OAuth Apps → Organization access, or the org's OAuth application policy; then log in
    again and publish;
  - authenticate from GitHub Actions (`mcp-publisher login github-oidc`), which needs a workflow in
    this repository and is therefore a planned change.
- **Approver ruling, 2026-09-29:** the registry listing is paused; the bug is filed; the release goes
  on to `mark-released` without it. The npm publish is complete and does not depend on the listing.
- **Duplicate search:** `grep -il "mcp registry\|registry.modelcontextprotocol\|mcp-publisher"
  docs/04_memory/bugs/*.md` → nothing.
- **Related:** `dl-093` (point 6 and its Actions), `dl-130` (the registry publish as a recurring
  release step, v0.3), `dl-088` (the `service` record), `dl-091` (the `io.github.wingfoil` namespace),
  `release-publishing-rel-v0.2.2-plan` S8.

## Triage & Execution Notes

<!-- Filled at triage. -->
