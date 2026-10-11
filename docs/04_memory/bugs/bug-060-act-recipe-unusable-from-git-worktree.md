---
id: "bug-060-act-recipe-unusable-from-git-worktree"
type: bug
title: "The `act` recipe in `publish.yml`'s header cannot work from a git worktree, and says so nowhere"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`.github/workflows/publish.yml` lines 78-90 offer any developer a recipe for running the pipeline
locally under `act`. Run from a **git worktree** — which is how every dev-loop task in this wave is
executed (`dl-014`/`dl-002`) — every git-dependent step inside the container dies with
`fatal: not a git repository: (null)`, because a worktree's `.git` is a *file* naming a path on the host
that the container does not have. The recipe gives no warning.

## Steps to Reproduce

1. `git worktree add -b <branch> <dir> main` and `cd <dir>`.
2. Follow the header recipe verbatim: write the tag event file, then
   `act push --eventpath /tmp/tag-event.json --artifact-server-path /tmp/act-artifacts -j gate`.
3. The job fails at the first git-dependent step with `fatal: not a git repository: (null)`.

## Expected Behavior

The recipe is documentation addressed to "any developer" and is the only sanctioned way to exercise the
pipeline without a throwaway CI-debug commit (`adr-009`). It should either work from a worktree or say
in one line that it does not.

## Actual Behavior

`task-077-first-real-staging-run` ran the recipe verbatim from its worktree (its run #6): exit 1,
`fatal: not a git repository: (null)`. It then re-ran the identical, unmodified workflow from a
throwaway **clone** (run #7) and got past every git step — the tag-on-main and tag-matches-version
checks both passed — which isolates the worktree as the cause rather than the workflow.

The mechanism, verified in this ingest's own worktree:

```
$ cat .git
gitdir: /home/robypomper/Workspaces/WingFoil2/.git/worktrees/ingest-077
```

`.git` is a one-line pointer to an absolute host path. `act` bind-mounts the working directory into the
container; that path is not mounted, so git inside the container has no repository to find.

**Corroborated accidentally during `task-077`'s review**: two *other* suites failed the same way in a
bind-mounted container — the "worktree `.git` is a pointer the container cannot follow" mechanism
showing up a second time, in a different place, without anyone looking for it. Reported by the reviewer
alongside the review rather than in the approve commit `ac10060`, whose text does not mention it; the
reproduction above (`cat .git`) is what this document rests on.

The recipe as it stands, with the only caveat it does carry (which is about `origin`, not worktrees):

```
$ sed -n '88,90p' .github/workflows/publish.yml
#   The gate's "tag is on main" check needs a local `main` pushed to `origin`; for a dry iteration on a
#   branch, run `npm run prepublishOnly` and `npm run publish:staging` directly instead — they are the
#   same commands the gate and stage jobs run.
```

## Notes

**Suggested fix — one line in the recipe.** Add to the header, next to the existing `origin` caveat:
`act` must be run from a real clone, not from a `git worktree`, because a worktree's `.git` is a file
pointing at a host path the container cannot see; `git clone <this repo> <tmp> && cd <tmp>` first. That
is exactly the workaround `task-077` had to discover by failing, and it cost that task a run to find.

Documentation-only, no code change; severity **low**, as proposed. Left to the fix's carrier whether the
same caveat also belongs in `.wingfoil/WORKFLOW.md` — not asserted here, because that file was not read
in this ingest.

## Triage & Execution Notes

Filed from finding **F5** of `task-077-first-real-staging-run` (`done`), at the scheduling act its
approve commit `ac10060` directs. Severity **low** (doc/recipe defect), unchanged by the reviewer. No
fix task filed in this ingest: only the three release blockers (F2, F3, F4) and F1 were given tasks —
this one is a one-line header edit best carried by whoever next touches `publish.yml`.
