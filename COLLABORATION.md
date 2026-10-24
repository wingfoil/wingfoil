# Contributing to WingFoil — through Memory, not (only) code

**Version:** 1.7 · **Date:** 2026-10-24

WingFoil is a harness for **AI-assisted software development**, built to make it deterministic. It manages its own
development the same way it asks other projects to (dogfooding): every change flows through
**Project Memory** — typed, versioned, git-backed artifacts — under an explicit **Workflow** and
**Directives**. This document explains how *you* contribute to that flow.

The core idea: **you contribute intent and decisions as Memory artifacts, and an AI agent turns them
into delivered work.** You do not need to write the code, the tests, or run `wingfoil` yourself.

> This is the demonstration of WingFoil's thesis: structured, AI-mediated contribution is more
> reproducible than an unstructured pull-request inbox. Decision recorded in
> [`dl-020-contribution-model`](docs/04_memory/design/dls/dl-020-contribution-model.md).

---

## What you can contribute

Instead of a code pull request, you file one of the five **base Memory documents**, each via its
capture (“ingest”) workflow:

| You want to… | File a… | Via workflow | Lands as |
|---|---|---|---|
| report a defect | **Bug** | `bug-ingest` | `docs/04_memory/bugs/{id}.md` |
| propose a product/process decision | **Decision-Log (DL)** | `decision-log-ingest` | `…/design/dls/{id}.md` |
| propose an architectural decision | **ADR** | `adr-ingest` | `…/design/adrs/{id}.md` |
| define a shared format/schema/API | **Tech-Spec** | `release-planning` (`identify-specs`) | `…/design/specs/{id}.md` |
| request a feature, or change the vision | **Change-Proposal** | `vision-change` | `…/change-proposals/{id}.md` |

Each artifact starts at `draft`, then moves to its first working state (`open` / `in-discussion` /
`pending` / `in-analysis`) so there is content to discuss. A change-proposal names its impact on every
layer below the vision (features, user stories, BDD, SARD requirements, delivered work), "no impact"
included, and its work is finished once a release is scheduled to carry it (`dl-132`). From there:

- a **bug, decision-log or ADR** is **triaged, approved, and scheduled** into a release during
  `release-planning` (`dl-016` — `triage-bugs` + `reconcile-governance`);
- a **change-proposal** is accepted at `vision-change`'s impact analysis and **scheduled by its
  `schedule` step**, which names the release; that release's `release-planning` then sweeps it into the
  release's features at `define-scope`.

An AI agent then implements the work under the `dev-loop` (TDD + BDD, `code-review`/`code-quality`
directives).

## How to contribute (today)

The `wingfoil` CLI ships (npm `wingfoil`) and keeps the bookkeeping of a workflow — `wingfoil workflow
start bug-ingest` records the run and `wingfoil workflow next` names its next step — but it does not
carry out the steps, so the ingest workflows are run by a maintainer or an agent. The current path is:

1. **Open a GitHub issue** with one of the two issue forms (`.github/ISSUE_TEMPLATE/`):
   - **Bug report**, for a defect. Its fields are the `bug` element's: the issue title is the bug's
     `title`, then `severity`, the WingFoil version (`release-origin`), Summary, Steps to Reproduce,
     Expected Behavior, Actual Behavior and Notes. `bug-ingest`'s `capture` copies every answer
     except two, which it maps: the title loses its `bug: ` prefix, and the installed version you
     give (`wingfoil --version`, e.g. `0.3.0 (<commit>)`; the commit part is dropped) becomes the
     `release-origin` id of the release that published it (`v0.3` for a minor's build such as `0.3.0`,
     `v0.2.2` for a patch release).
   - **Proposal**, for a product or process decision: the context, the options you see and the one you
     prefer, which `decision-log-ingest`'s `capture` records as the `decision-log`'s Context, Decision
     and Rationale (the title loses its `proposal: ` prefix).
     A feature request uses this form too: it changes the vision, so the maintainer captures it as a
     `change-proposal` through `vision-change` instead (`dl-132`, `dl-163`).

   Blank issues are off. Questions go to
   [Discussions](https://github.com/wingfoil/wingfoil/discussions/categories/q-a), and a vulnerability
   goes through [`SECURITY.md`](SECURITY.md), never into a public issue.
2. A maintainer or agent **captures it as the matching Memory artifact** through the ingest workflow,
   recording you as its `contributor` and the issue's URL beside it (*Credit*, below).
3. You are kept in the loop as it is ratified and delivered.

A pull request is welcome too: its template (`.github/PULL_REQUEST_TEMPLATE.md`) asks for the Memory
element the change implements, as the `traceability` directive requires. Everyone follows the
[Code of Conduct](CODE_OF_CONDUCT.md). [`CONTRIBUTING.md`](CONTRIBUTING.md) is the short pointer to
this document that GitHub shows contributors (`dl-127`).

You (or an agent on your behalf) can start an ingest workflow yourself with
`wingfoil workflow start <name>` and follow it with `wingfoil workflow next`; its steps are still
carried out by hand.

## Contributor setup — the WingFoil build that manages this repository

WingFoil's own Memory, DNA and workflows are read through a **published, pinned** WingFoil build
([`dl-095`](docs/04_memory/design/dls/dl-095-which-wingfoil-build-develops-wingfoil.md)); the Memory
operations that write a commit run on the code build compiled from your checkout (`npm run build`, then
`node dist/cli.js …`), as the `wingfoil-cli` directive
([`.wingfoil/directives/custom/wingfoil-cli.md`](.wingfoil/directives/custom/wingfoil-cli.md)) states. It is
declared in `package.json` as the devDependency `"wingfoil-released": "npm:wingfoil@<version>"`, so a
clone needs one command and no build step:

```bash
git clone <this repository> && cd <it>
npm ci                                   # installs the pinned build with everything else
npm run -s wingfoil -- --version         # prints the pinned version
npm run -s wingfoil -- memory search --type bug
```

Run it as `npm run -s wingfoil -- …`, not `npx wingfoil`: this package is itself named `wingfoil`, and
once `npm run build` has produced `dist/`, `npx wingfoil` runs *that* build instead. `-s` keeps npm's
own banner off standard output, so `--format json` stays parseable.

**The MCP server.** The repository's [`.mcp.json`](.mcp.json) registers the pinned build's server
([`dl-026`](docs/04_memory/design/dls/dl-026-repo-versioned-mcp-server-config.md)), so an agent
session opened at the repository root reads DNA, Memory and workflows through it with no setup:

```json
{ "mcpServers": { "wingfoil": { "command": "node", "args": ["node_modules/wingfoil-released/dist/cli.js", "mcp"] } } }
```

`.mcp.json` is the Claude Code format. The server itself is plain MCP over stdio, so any other MCP
client registers the same thing: command `node`, arguments
`node_modules/wingfoil-released/dist/cli.js mcp`, working directory the repository root (the server
resolves the configuration from the git root). Use an absolute path to `cli.js` if your client starts
servers from another directory. `npm run check:mcp` starts the registered server and checks that it is
the pinned version and advertises the expected channels.

The pin moves forward only, to published builds, one commit per switch (`dl-095` Q3): at the start of
each release's planning (`release-planning`'s `advance-pinned-build` step) and after every published
patch.

## Credit — you are credited for the AI-generated work derived from your contribution

Attribution in WingFoil rides on **git identity**: every state-change commit records its author and
timestamp as the audit trail
([`adr-006-git-identity-role-based-authz`](docs/04_memory/design/adrs/adr-006-git-identity-role-based-authz.md)).
That records *who made the change*. It does **not**, by itself, capture *whose idea it was* when an AI
agent — not the contributor — authors the commits.

So the contribution model **layers** a credit convention on top of git identity (it does not replace
it, and it never rewrites git history):

- Every ingested artifact (`bug`, `decision-log`, `adr`, `tech-spec`, `change-proposal`) carries an optional
  **`contributor:`** frontmatter field — your name/handle, set when the artifact originates from
  someone other than the committing git identity — plus an optional **`credit:`** note.
- **An artifact captured from a GitHub issue** records you as `contributor:` (your GitHub handle) and
  the issue URL in `credit:` (e.g. `reported in https://github.com/wingfoil/wingfoil/issues/<n>`). A
  GitHub issue is not a registered feedback inbox, so it never gets a `reported_by:` field: that field
  is only for notes filed in a registered consumer repository's inbox
  ([`dl-163`](docs/04_memory/design/dls/dl-163-consumer-projects-feedback-sources-and-the-feedback-loop.md)).
- **A note filed in a registered consumer inbox** — the `feedback_inbox` of a consumer repository
  registered here as an `active` `service` of kind `repository` — is cited in the artifact's optional
  **`reported_by:`** list, one entry per note, as `<service id>/F-<nnn>@<sha>`: the service's full id,
  the note's id in that inbox, and the full sha of the consumer commit read. `contributor:` says **who**
  originated the contribution; `reported_by:` says **where** it was reported, in a form
  `test/docs/reported-by.test.ts` checks against the registered services. It is provenance only: the
  artifact restates the defect or request in its own words and reads on its own, a defect is reproduced
  in this repository before it is filed, and the note's text is never copied. The `bug`,
  `decision-log`, `adr`, `tech-spec` and `change-proposal` templates carry the field. How a consumer
  keeps its inbox, writes a note and reads WingFoil's answer is in *Consumer feedback*, below.
- **A consumer's feature request** is filed as a `change-proposal` through `vision-change`
  ([`dl-132`](docs/04_memory/design/dls/dl-132-vision-change-and-feature-ingest.md)); a `decision-log`
  is for input about the process or a decision.
- **Review rule: `reported_by:` survives an amendment.** `memory amend` may rewrite the field like any
  other content field, so a reviewer refuses an amendment that drops or changes a `reported_by:` entry
  unless its `Reason:` says why (for example, the entry cited the wrong note or commit).
- When an agent turns your ratified artifact into delivered work (tasks reaching `done`), **you are
  credited** as the source of that AI-generated output. Because a task traces back to the artifact it
  implements, the credit stays attached to the specific `bug`/`DL`/`ADR`/`tech-spec`/`change-proposal` id.

This keeps credit **machine-visible and git-versioned**, consistent with WingFoil’s single-source-of-
truth model — no external contributor database, no commit rewriting.

## Consumer feedback — notes from projects that use WingFoil

A project that uses WingFoil to govern its own development (a *consumer*) meets WingFoil's defects,
gaps and missing features while it works. It writes them down in its own repository, WingFoil reads
them at its retrospective, and WingFoil publishes its answer in this repository, where the consumer
reads it. WingFoil never commits into a consumer's repository, and the consumer never commits into
this one: each side pulls
([`dl-163`](docs/04_memory/design/dls/dl-163-consumer-projects-feedback-sources-and-the-feedback-loop.md)
R1–R6).

### The feedback inbox

- **Where.** A consumer keeps its notes in `docs/wingfoil-feedback/` in its own repository, committed
  on its `main`, one file per note (*The note format*, below). The folder holds a `README.md` too: it
  must exist on `main`, because the registration's `verify` reads it; its content is the consumer's
  (for example, a pointer to this section). Notes that are not committed on `main` are not read.
- **Registration.** WingFoil reads the inbox of a consumer repository only once it is registered here
  as an `active` `service` of kind `repository` whose `feedback_inbox` names that folder
  (`docs/04_memory/services/`; `dl-163` S3b). A maintainer registers it through the `service-ingest`
  workflow, after the inbox is committed; the approver runs the service's `verify`
  (`git ls-remote <url> refs/heads/main`, plus a read of `<feedback_inbox>README.md` on that
  repository) before approving it. The service's full id is the source key every cite of a note uses.
- **Asking to be registered.** A project asks through the **Proposal** issue form (*How to contribute*,
  above), naming its repository and its inbox. Until it is registered, its feedback goes through the
  issue forms like anyone else's: it is credited as `contributor` with the issue URL, not by a cite
  of a note (*Credit*, above).

### The note format

One Markdown file per note, named `F-<nnn>-<slug>.md`: `F-` and a number of three digits or more,
unique in that inbox, then a short slug. A note has one identifier, one status and one history (`dl-163`
R4). Its frontmatter has six fields:

| Field | Value |
|---|---|
| `id` | `F-<nnn>`, the number of the file name, without the slug |
| `title` | one line saying what the note is about |
| `kind` | `defect` (WingFoil does something wrong), `gap` (it does not cover a case it should) or `request` (a new capability) |
| `status` | one of the six below |
| `wingfoil_version` | the WingFoil build the note was observed on, as `wingfoil --version` prints it |
| `answered_by` | the ids of the WingFoil elements that answer the note; empty until the consumer fills it at a sync |

The body states what was observed and what was expected, with the commands that show it. The statuses:

- `open` — written, not yet answered by WingFoil;
- `needs-info` — WingFoil asked for what a reproduction needs; the consumer answers in the note;
- `captured` — WingFoil filed or named an element that answers it (`answered_by`);
- `resolved` — every element in `answered_by` has shipped in a release the consumer reads, or the build
  already behaves as the note asks;
- `declined` — WingFoil does not take it up;
- `duplicate` — the consumer's own status for a note that repeats another note of the same inbox.

A WingFoil element that answers a note cites it, in the provenance field *Credit* describes, as
`<service id>/F-<nnn>@<sha>`: the full id of the consumer's `service`, the note's `id`, and the full
sha of the consumer commit WingFoil read (the form
[`spec-010`](docs/04_memory/design/specs/spec-010-memory-frontmatter-schema.md) owns). The cite is
provenance only: the element restates the note in its own words, a defect is reproduced in this
repository first, and the note's text is never copied (*Credit*, above). A later edit of the note does
not change a cite, which names the commit read.

### The sync points

A consumer syncs at two points (`dl-163` R5):

- at its own release-planning, before it fixes its scope;
- at every pin bump, whenever it moves the WingFoil build it uses to another published version.

What it reads, all of it published by this repository:

- the pushed `origin/main`, where the retrospectives and the elements live;
- the release tags: `vX.Y.Z` on `main` for a minor, and a patch's tag on its maintenance branch
  `release/X.Y`;
- the npm dist-tags of the `wingfoil` package: `latest` for the newest version, and `latest-X.Y` for a
  patch of an older line published after a newer minor, so that patch does not take `latest`.

WingFoil reads every registered inbox at each minor release's retrospective; a patch release has none.
Between two retrospectives, a note answered by a patch appears only in that patch's release document
(`dl-163` R6).

### The sync procedure

At a sync point the consumer runs, in its own repository and at its own pace:

1. Fetch this repository (`git fetch origin --tags`) and read at `origin/main` (or at the tag of the
   version it moves to).
2. Read the newest retrospective's record: the `## Consumer feedback` table of `retro-<version>`
   (`docs/04_memory/design/dls/`), one row per note with WingFoil's decision, the element and the target
   release, and the read record beside it,
   `docs/09_retrospectives/rl-<release-line>/rel-<version>-feedback-triage.md`, which restates each note
   and says which commit of the inbox was read. A patch released since then lists the notes it took up
   in its release document's `## Scope changes`
   (`docs/04_memory/planning/rl-<release-line>/`).
3. Find every element that cites one of its notes, with its own service's full id:
   `git grep -n "<service id>/F-" origin/main -- docs/04_memory`.
4. Update each note's `status` and `answered_by` from WingFoil's decision:

   | Decision in the record | The note becomes |
   |---|---|
   | `needs-info` | `needs-info`, and the consumer adds what is asked |
   | `declined` | `declined` |
   | `covered`, `element` or `restated`, with an element named | `captured`, with the element's id in `answered_by` |
   | `restated`, with no element named | stays `open`: the next retrospective reads it again |
   | `superseded` (the build already changed it) | `resolved` |

   A `captured` note becomes `resolved` once every element in its `answered_by` has shipped in a
   release tag the consumer reads.
5. Commit the updated notes on its own `main`, so the next retrospective reads them.

WingFoil never commits into a consumer's repository: the answer is published here, and only the
consumer changes its notes (`dl-163` R3).

## Ground rules

- **Memory artifacts, not code PRs.** Contribute the decision/defect/spec; the agent carries it through
  the review gates. (Maintainers may still make direct code changes; this document is about the
  *contribution* path.)
- **Decisions live in Memory** — `adr` for architectural, `decision-log` for product/process — not
  scattered in prose (the `documentation` directive).
- **Traceability holds** — every artifact cites the requirement/feature it serves (the `traceability`
  directive).

## Pointers

- Project overview & how it all fits together: [`AGENTS.md`](AGENTS.md) and
  [`.wingfoil/README.md`](.wingfoil/README.md).
- The decision behind this document: `dl-020-contribution-model`.
- Attribution model: `adr-006-git-identity-role-based-authz`.
