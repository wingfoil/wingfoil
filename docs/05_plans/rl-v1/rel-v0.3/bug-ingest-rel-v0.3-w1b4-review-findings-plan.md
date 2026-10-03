---
id: bug-ingest-rel-v0.3-w1b4-review-findings-plan
type: plan
title: "Bug-ingest — rel-v0.3 wave 1 B4 review findings"
status: done
version: "1.0"
workflow: "bug-ingest"
phase: "rel-v0.3-w1b4-review-findings"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 260703   # Orignal template version
---

## Context

The independent reviews of wave 1 batch B4 (`dev-loop-rel-v0.3-plan`, 2026-10-02: `task-146`, `task-148`,
`task-151`, `task-152`, `task-168`, `task-247`) left findings outside each task's scope. They are captured
here through `bug-ingest`, with `release-origin: "v0.3"`, against `main` at `243f8f05` (B4 merges up to
`ea637c43`), with the code build (`npm run -s build && node dist/cli.js memory …`). Every finding was
re-run on `main` before filing; each bug's Steps to Reproduce give the command and what it printed.

## Phases / Steps

1. **capture**, done 2026-10-02: `bug-203` … `bug-211` (`open`). One finding was not filed: a Memory
   document committed as a symbolic link is invisible to the HEAD scan (`task-247` review, also
   `task-137`'s). It is already `bug-189` (`planned`, v0.3, absorbed into `task-171`), whose Actual
   Behavior states that at the commit the link parses as a document with empty frontmatter. The
   transition angle (refused only through the filesystem guards, by ordering) is a note for `task-171`,
   not a new bug.
2. **triage** (⛔ approver). Proposals:

   | Bug | Severity | Proposal |
   |---|---|---|
   | `bug-203` `--color`/`NO_COLOR` no-ops | low | v0.3, absorbed into `task-156` (it already declares what `console` prints until `dl-043`/P5.1.4; the colour flags are the same declaration) |
   | `bug-204` stale names in spec-004/008/015 | low | v0.3, absorbed into `task-165` (it already amends `spec-008`; `spec-004`/`spec-015` are one-line renames in the same pass), so the `UNTRIAGED` entries are gone before v0.4 makes them fail |
   | `bug-205` `E_INVALID_*` codes never emitted | medium | v0.4, after a ruling on which side changes (spec rename vs code mapping, a visible `--format json` change); if the ruling is "amend the specs", `task-153` (`spec-001` reconciliation) can carry it in v0.3 |
   | `bug-206` WORKFLOW.md parity matches any occurrence | medium | v0.3, absorbed into `task-187` (enumeration parity tests, the same pattern) |
   | `bug-207` four CLI suites with local `spawnSync` | low | v0.4, unabsorbed (consistency only; no exit-code misreading) |
   | `bug-208` killed-run fixture dirs never swept | low | v0.4, unabsorbed (the leak policy of `bug-064` is still undecided) |
   | `bug-209` spawned npm inherits `npm_config_*` | low | v0.4, unabsorbed (harmless today for `--json`) |
   | `bug-210` `docs/agents.md` lacks B4 refusals | low | v0.3, the release's `user-docs` phase (`align-user-docs`; `agents.md` with the approver's confirmation) — no task |
   | `bug-211` HEAD lookup reads every blob | low | v0.4, unabsorbed (inside every REQ-PERF budget; `task-154` may cite it when it shapes the budgets) |

## Handoff

- **Approver:** the triage.
- **Agent:** capture, and triage mechanics once ruled.
- **Completion criteria:** every captured bug `triaged` or `closed`; this plan `active → done`.

## Execution Notes

- **capture done (2026-10-02)** — nine bugs, each `memory add` then `memory submit` (`draft → open`), one
  commit per operation:

  | Bug | Title | Source | Triage proposal |
  |---|---|---|---|
  | `bug-203` | `--color`, `--no-color` and `NO_COLOR` have no effect because the CLI emits no colour at all | `task-151` review | v0.3 → `task-156` |
  | `bug-204` | spec-004, spec-008 and spec-015 name paths and keys that do not exist | `task-151` review | v0.3 → `task-165` |
  | `bug-205` | spec-001 and spec-009 declare `E_INVALID_*` schema error codes that src never emits | `task-151` review | v0.4 after a ruling (or `task-153` if spec-side) |
  | `bug-206` | The WORKFLOW.md parity test counts any occurrence of a phase name, dotted or unrelated, as its mention | `task-148` review (F3) | v0.3 → `task-187` |
  | `bug-207` | Four CLI suites still spawn the CLI through a local spawnSync instead of the shared spawn-cli helper | `task-152` review | v0.4 |
  | `bug-208` | Fixture directories of a killed jest run are never counted or removed | `task-152` review | v0.4 |
  | `bug-209` | Five suites spawn npm pack with the caller's `npm_config_` environment, and no guard requires a clean one | `task-146` review | v0.4 |
  | `bug-210` | docs/agents.md lists none of the not-applicable or committed-at-HEAD refusals | `task-168` review (+ `task-247` refusals) | v0.3 → `user-docs` phase |
  | `bug-211` | A Memory transition reads every committed document before matching its id | `task-247` review | v0.4 |

- Not filed: the committed-symlink HEAD-scan finding, a duplicate of `bug-189` (see step 1).
- Re-measured for `bug-211`: 694 documents; HEAD lookup median 131.5 ms (early id) / 164.6 ms (missing
  id) vs working tree 2.0 ms / 24.8 ms; `readPathsAtRev` of all paths 118.6 ms (load average ≈ 5).
- `bug-208` evidence also found 670 pre-`task-152` fixture directories (`wf-storage-clone-*`,
  `wf-storage-cwd-*`) in `/tmp` on this machine, which no sweep reaches.
- **triage done (2026-10-03)**, on the approver's instruction, with the proposals accepted:

  | Bug | Outcome |
  |---|---|
  | `bug-203` | `task-156` |
  | `bug-204` | `task-165` |
  | `bug-206` | `task-187` |
  | `bug-210` | `triaged`, v0.3, no task: the release's `user-docs` phase |
  | `bug-205`, `bug-207`, `bug-208`, `bug-209`, `bug-211` | `triaged`, v0.4, unabsorbed |

  Each absorbing task names its bug through `memory amend`. Plan complete.
