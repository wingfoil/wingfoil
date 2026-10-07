# Contributing to WingFoil — through Memory, not (only) code

**Version:** 1.3 · **Date:** 2026-10-07

WingFoil is a harness for **AI-assisted, deterministic software development**. It manages its own
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

Instead of a code pull request, you file one of the four **base Memory documents**, each via its
capture (“ingest”) workflow:

| You want to… | File a… | Via workflow | Lands as |
|---|---|---|---|
| report a defect | **Bug** | `bug-ingest` | `docs/04_memory/bugs/{id}.md` |
| propose a product/process decision | **Decision-Log (DL)** | `decision-log-ingest` | `…/design/dls/{id}.md` |
| propose an architectural decision | **ADR** | `adr-ingest` | `…/design/adrs/{id}.md` |
| define a shared format/schema/API | **Tech-Spec** | `release-planning` (`identify-specs`) | `…/design/specs/{id}.md` |

Each artifact starts at `draft`, then moves to its first working state (`open` / `in-discussion` /
`pending`) so there is content to discuss. From there it is **triaged, approved, and scheduled** into a
release during `release-planning` (see `dl-016` — `triage-bugs` + `reconcile-governance`), and an AI
agent implements it under the `dev-loop` (TDD + BDD, `code-review`/`code-quality` directives).

## How to contribute (today)

The `wingfoil` CLI ships (npm `wingfoil`), but it cannot run a workflow yet, so the ingest workflows
are still run by a maintainer or an agent. The current path is:

1. **Open a GitHub issue** with one of the two issue forms (`.github/ISSUE_TEMPLATE/`):
   - **Bug report**, for a defect. Its fields are the `bug` element's: the issue title is the bug's
     `title`, then `severity`, the WingFoil version (`release-origin`), Summary, Steps to Reproduce,
     Expected Behavior, Actual Behavior and Notes. `bug-ingest`'s `capture` copies every answer
     except two, which it maps: the title loses its `bug: ` prefix, and the installed version you
     give (`wingfoil --version`, e.g. `0.2.2`) becomes the `release-origin` id of the release that
     published it (`v0.2` for a minor's build such as `0.2.1`, `v0.2.2` for a patch release).
   - **Proposal**, for a product or process decision: the context, the options you see and the one you
     prefer, which `decision-log-ingest`'s `capture` records as the `decision-log`'s Context, Decision
     and Rationale (the title loses its `proposal: ` prefix).

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

Once workflow execution ships, you (or an agent on your behalf) will run the ingest workflow directly.

## Contributor setup — the WingFoil build that manages this repository

WingFoil's own Memory, DNA and workflows are read and written by a **published, pinned** WingFoil
build, never by the code under development
([`dl-095`](docs/04_memory/design/dls/dl-095-which-wingfoil-build-develops-wingfoil.md)). It is
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

- Every ingested artifact (`bug`, `decision-log`, `adr`, `tech-spec`) carries an optional
  **`contributor:`** frontmatter field — your name/handle, set when the artifact originates from
  someone other than the committing git identity — plus an optional **`credit:`** note.
- **An artifact captured from a GitHub issue** records you as `contributor:` (your GitHub handle) and
  the issue URL in `credit:` (e.g. `reported in https://github.com/wingfoil/wingfoil/issues/<n>`). A
  GitHub issue is not a registered feedback inbox, so it never gets a `reported_by:` field: that field
  is only for notes filed in a registered consumer repository's inbox
  ([`dl-163`](docs/04_memory/design/dls/dl-163-consumer-projects-feedback-sources-and-the-feedback-loop.md)).
- When an agent turns your ratified artifact into delivered work (tasks reaching `done`), **you are
  credited** as the source of that AI-generated output. Because a task traces back to the artifact it
  implements, the credit stays attached to the specific `bug`/`DL`/`ADR`/`tech-spec` id.

This keeps credit **machine-visible and git-versioned**, consistent with WingFoil’s single-source-of-
truth model — no external contributor database, no commit rewriting.

## Ground rules

- **Memory artifacts, not code PRs.** Contribute the decision/defect/spec; the agent carries it through
  the review gates. (Maintainers may still make direct code changes; this document is about the
  *contribution* path.)
- **Decisions live in Memory** — `adr` for architectural, `decision-log` for product/process — not
  scattered in prose (the `documentation` directive).
- **Traceability holds** — every artifact cites the requirement/feature it serves (the `traceability`
  directive).

## Pointers

- Project overview & how it all fits together: [`CLAUDE.md`](CLAUDE.md) and
  [`.wingfoil/README.md`](.wingfoil/README.md).
- The decision behind this document: `dl-020-contribution-model`.
- Attribution model: `adr-006-git-identity-role-based-authz`.
