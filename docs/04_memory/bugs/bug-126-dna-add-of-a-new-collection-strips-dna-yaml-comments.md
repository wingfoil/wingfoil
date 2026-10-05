---
id: "bug-126-dna-add-of-a-new-collection-strips-dna-yaml-comments"
type: bug
title: "`dna add` on a collection `dna.yaml` does not declare yet (e.g. the first `team.agents` entry) rewrites the file without a single comment"
status: in-review
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`bug-004` made DNA writes comment-preserving, and every `dna set|add|update|remove` on a path that
already exists in `dna.yaml` keeps the file's comments. Adding the **first** entry of a collection the
file does not contain yet — `team.agents` in a freshly initialised project — rewrites the whole file
through a plain dump instead: all comments disappear, the command exits `0`, and nothing warns.

## Steps to Reproduce

1. A throwaway repository: `git init`, a git identity, then `wingfoil init --template Scrum`, with
`wingfoil` = `node dist/cli.js` built from branch `docs/user-docs-v0.2` at `79a76d6e`.
2. `grep -c '#' .wingfoil/dna.yaml` → `8`.
3. `wingfoil dna add team.agents --value claude --entry-executes_as developer,reviewer --entry-approval_authority false` → exit `0`, commit `wf(dna): add team.agents claude`.
4. `grep -c '#' .wingfoil/dna.yaml` → `0`.

## Expected Behavior

The new `team.agents` key is inserted and the file's existing comments survive, as they do for every
other DNA write.

## Actual Behavior

Every comment is gone. Found while probing for the user-docs phase; bisected over the probe's history
with `for s in $(git log --reverse --format=%h -- .wingfoil/dna.yaml); do git show $s:.wingfoil/dna.yaml | grep -c '#'; done`
— 8 on every commit up to and including a `dna remove`, 0 from `wf(dna): add team.agents claude` on.

## Notes

- Probably the same root cause as `bug-019-dna-set-fallback-silently-strips-comments` (`triaged`): the
  whole-file dump fallback. This is a second, more common way to reach it — any project that declares
  its agents, as the user guide §4.2 now recommends. Triage may merge the two.
- The user guide lists this under *Known limitations in 0.2.0*; remove that line when fixed.

## Triage & Execution Notes

- capture (bug-ingest, `bug-ingest-rel-v0.2-user-docs-findings-plan`): found during the v0.2
  `user-docs` phase probe (`user-docs-rel-v0.2-plan`, *Execution Notes → Findings*); proposed severity
  **medium**. `release: ""` — scheduling belongs to `release-planning`.
