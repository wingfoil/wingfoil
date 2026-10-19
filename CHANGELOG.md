# Changelog

All notable changes to WingFoil are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every entry ends with the WingFoil Memory element(s) it comes from: a `done` task (`task-NNN`) or a
`closed` bug (`bug-NNN`).

## [0.3.0] - 2026-10-19

The Project Workflow release. WingFoil now deduces where every started workflow stands from the Memory
committed at `HEAD`, names the next step and who must take it, routes approvals to the approver, launches
an AI agent on a Memory element through a declared adapter and records the run. Every commit it writes
names the build that wrote it. No workflow step is executed for you: people and agents carry out the
steps. A project initialised by 0.2.x needs one edit before its workflow commands work: see *Upgrading
from 0.2.x* below.

The test results of the published build — the suites by kind, their counts and the coverage totals — are
attached to the release as
[`test-results.md`](https://github.com/wingfoil/wingfoil/releases/download/v0.3.0/test-results.md).

### Added

#### Workflows

- `wingfoil workflow next [<ref>] [--assigned-to <who>]` prints the next step of an open workflow: its
  verb, role, element, directives and bindings. `wingfoil workflow status [<ref>]` prints every open
  workflow, its pending approvals and who they are routed to, and the documents waiting at a gate as
  "human needed" lines. Both deduce the state from Memory as committed at `HEAD`, including
  `iterate_over`, optional and archived phases, and re-entry after a reject or a park. (task-216,
  task-225, task-198, task-202, task-203)
- `wingfoil workflow start <name> [--element <type:id>] [--title <t>] [--set phase=|scope=]` records a
  run as a `plan` element (`add` + `submit`) and prints its first step; `wingfoil workflow end [<ref>]`
  moves a complete run to `done`. `wingfoil init` installs the `plan` type and its template. (task-217)
- `wingfoil workflow finalize [<ref>] [--step <key>] [--reason <text>]` records that a step nothing else
  completes is done, as an empty commit with phase-record trailers; a phase with `approval:` needs the
  approver and a reason. (task-226)
- `wingfoil workflow create <name>` writes a custom workflow with one phase and includes it in
  `workflows.yaml`; `wingfoil workflow remove <ref>` deletes a custom workflow unless another workflow
  includes it or an open run uses it. (task-211)
- `wingfoil workflow show <ref>` prints one workflow resolved: its phases, roles, directives, actions,
  checks and included workflows. (task-204)
- `wingfoil memory add --workflow <ref> [--step <key>]` links the new element to a step of an open
  workflow, so the step counts it as created by that step. (task-227)
- Workflow files may declare `startable:` / `includable:` (`kind:` stays accepted as their alias), phase
  `mode`, `distinct_from` and `cadence`, typed `produces` entries (`{ type, path }`), selections,
  `awaits`, collections, and an optional `.wingfoil/workflows/bindings.yaml` that binds the project's
  tokens. A workflow file that uses `{ type, path }` is refused by 0.2.x. (task-175, task-185)
- Workflow commands check the workflows against `memory.yaml`, `dna.yaml` and the role set at `HEAD`: an
  undefined role or Memory type, also in typed `set_state` / `sync_state` actions and in a selection's
  `where.type`, is reported (e.g. `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`). (task-194, bug-150, task-264,
  bug-282)

#### Agents

- `wingfoil agent execute` launches an AI agent CLI on one Memory element through an adapter declared in
  `.wingfoil/agents/`: `--element`, `--role`, `--agent`, or `--next` / `--workflow <ref>` /
  `--step <key>` to take them from a workflow's next step. It assembles and validates the element's context and
  refuses every bad case before anything is spawned, writes nothing to stdout, forwards `SIGTERM` and
  `SIGHUP`, and records the run as one JSON Lines line under `paths.runs`, committed as
  `agent: record <run-id>`. (task-218, task-228, task-235, task-176, task-177, task-206)
- `wingfoil agent list [--past|--waiting] [--element <type:id>] [--phase <name>]` lists the recorded
  runs and the workflow steps waiting for an agent, as committed at `HEAD`. (task-240)
- `wingfoil agent show <run-id>` prints one recorded run and the commit that added it. (task-220)
- `wingfoil init` installs the built-in `claude-code` and `codex-cli` adapters under
  `.wingfoil/agents/built-in/` (protected, schema-checked and secret-scanned before writing), with an
  empty `.wingfoil/agents/custom/` for your own. (task-196, task-236, task-237)
- `dna.yaml` gains `team.agents[].adapter` and an optional `team.agents[].email` (`dna add` / `dna
  update --entry-adapter`), and the `paths` categories `runs` (the agent run log; `init` declares
  `docs/runs/`) and `health` (not scaffolded). (task-138, task-256, bug-240, task-222, bug-299)

#### Memory

- `wingfoil memory amend <id> --reason <text>` records an uncommitted correction to a document without
  changing its state, as an approver-gated `wf(<type>): amend` commit. `memory.yaml` declares per type
  whether it is `amendable`; the `init` scaffold makes every type but `release-line` amendable.
  (task-127, task-158)
- `wingfoil memory park <id> --reason <text>` returns a started element along a `returns:` edge its
  state machine declares. A state may also declare a WIP `limits:` count: entering a full state is
  refused, naming the holders, counted across every branch; `reject` and `park` are exempt. (task-180,
  task-274)
- Approving an element whose `supersedes:` names another moves that element to `superseded` in a second
  commit, on types whose state machine declares the edge. (task-162)
- `--dry-run` on every command that writes a commit except `init`: it prints the commit the command would
  make (subject, paths, diff), writes nothing and exits `0`, or exits with the refusal's code. (task-210,
  bug-217)
- `wingfoil memory history` reads the `amend`, `park`, `start`, `finalize` and `sync` operations, and a
  transition bracket that chains several states. (task-126, bug-155)
- A required frontmatter field may hold `"n/a — <reason>"` where `memory.yaml` lists it under
  `template.frontmatter.not_applicable_allowed`, and an explicit `[]` on a field listed under
  `template.frontmatter.lists`; `template.frontmatter.exempt` names documents that need not carry a
  field. (task-168, bug-147, task-279, bug-342)
- `memory add` fills the `{date}` (UTC `YYYYMMDD` of the add commit), `{author}` and `{n:N}` id tokens;
  `--set date=` and `--set author=` are refused with exit `2`. (task-163, bug-158, bug-176, bug-033,
  bug-157)
- A directive may declare `scope:`; `directives list` reports a directive whose scope disagrees with
  `roles.yaml`'s `global:` list, and no longer warns that `scope` is an unknown field. (task-144,
  bug-109, bug-113, bug-148)

#### Every command

- Every commit WingFoil writes ends with a `WingFoil-Version: <semver> (<sha>)` trailer; `wingfoil
  --version` prints `<semver> (<sha>)`, and `memory history` reports it. (task-192, bug-051)
- Every configuration file, workflow file, directive and Memory template declares a `format:` (`init`
  writes `format: 1`; an absent key reads as 1). A file or Memory element written in a newer format is
  refused with `E_INVALID_FORMAT … this WingFoil reads up to format 1: upgrade WingFoil` (exit `1`).
  (task-251, task-257, bug-241, bug-243)

#### MCP server

- The Resources `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status`, the Resource template
  `wingfoil://session/{role}/{element}/{state}`, and optional `element` / `state` arguments on every
  `<role>-session` Prompt, which then return the element's assembled context at that commit. Resource
  reads carry a `warnings` array. (task-239, bug-258, bug-259, bug-292, task-195, bug-231, bug-263,
  task-255, bug-232, bug-233, task-236)

#### Documentation and distribution

- A documentation site with the API reference and an `llms.txt` index, now the package's `homepage`.
  (task-234)
- The README shows badges and a terminal demo driven by a self-checking example; a comparison page and
  a dogfooding case study. (task-224, task-246)
- A contributing guide, a code of conduct, a security policy, and issue and pull-request templates.
  (task-214)
- Each release gets a GitHub Release with its changelog section, its test results and its coverage.
  (task-229, task-244)
- WingFoil is published to the MCP Registry from CI; a version lower than the highest published one is
  tagged `latest-X.Y` rather than `latest`; a `glama.json` supports the Glama directory listing.
  (task-238, bug-060, bug-173, bug-174, task-266, task-157)

### Changed

- **Breaking:** a phase `include:` is a workflow **name** that must resolve to an includable workflow; a
  file path is refused. A project initialised by 0.2.x keeps `include:
  workflows/custom/scrum-delivery.yaml` in `sw-life-cycle.yaml`, and its workflow commands now fail with
  `E_WORKFLOW_INCLUDE_UNRESOLVED` (exit `1`) until the path is replaced by `scrum-delivery` (the Kanban
  scaffold likewise). Workflow diagnostics are one ordered array. (task-136, bug-144, bug-145)
- **Breaking:** `wingfoil workflow list` lists the workflows you can run now (`--all` for every one) as
  `{baseline, workflows: [...], diagnostics: [...]}` read at `HEAD`, no longer the raw manifest. (task-204, bug-281)
- **Breaking:** every command refuses an operand beyond the one it declares, with exit `2`, before
  reading or writing anything (`dna show project extra` exited `0` in 0.2.2; `init extra` and `mcp
  extra` too). (task-129, bug-131, bug-171, task-165, bug-179)
- **Breaking:** in a git repository with no `.wingfoil/`, `wingfoil mcp`, `directives list` and the other
  commands that read the configuration fail with `WingFoil not initialized … run 'wingfoil init' first`
  (exit `1`); 0.2.2 started the server and printed an empty directive listing with exit `0`. A dangling
  or unreadable entry under `.wingfoil/directives/` is skipped with a warning naming it, no longer a raw
  `ENOENT`. `tools/list` answers `[]`. (task-174, bug-035, bug-151, bug-184, bug-237, task-143,
  bug-125, bug-154)
- **Breaking:** every Memory transition is decided from the element's status and document committed at
  `HEAD`, not the working tree. A document created by hand and not yet committed can no longer be
  submitted: 0.2.2 exited `0`, 0.3 exits `1` with ``error: document not found: <id> — <path> is not
  committed at HEAD, … register a new element with `memory add`, then retry.`` A document deleted in the
  working tree is refused with a restore hint. (task-247, bug-187)
- Refusal messages have one shape: a missing operand reads `error: missing required argument: <id>` with
  the usage on a `hint:` line, an unknown command's suggestion is a `hint:` line, a missing configuration
  file reads `.wingfoil/<file> is missing: …`; error `details` (e.g. the offending file) are printed on
  every surface, and parse errors honour `--format`. Scripts matching 0.2.2's stderr text must be
  updated. (task-179, bug-104, bug-168, bug-180, bug-198, bug-226, bug-245, task-130, bug-114, bug-123)
- An illegal transition names the attempted move, with `(none)` as the target when the verb has no edge
  from that state, and a reason line (`illegal transition draft -> (none) for type 'task'`). (task-181,
  bug-165)
- `memory submit` still commits your uncommitted edits to the element, and now says so: the commit body
  names the content it carries (`Carries content: …`). The templates' comments describe `add` and
  `submit` as they behave. (task-209, bug-146, bug-219)
- The approver identity is read once, with git's own precedence (`GIT_AUTHOR_*` first), and used for the
  authority check, the `Approver:` line and the commit author. Before anything is written, the identity
  check refuses a set but blank `GIT_AUTHOR_*` / `GIT_COMMITTER_*` variable and a name or email containing
  `<`, `>` or a control character, which 0.2.2 committed. The library's attribution audit
  (`isValidAttribution`) no longer accepts an identity on a reserved domain (`.invalid`, `.example`,
  `.test`, `.localhost`). (task-132, bug-142, bug-149, bug-153)
- A `--reason` containing a control character other than tab or newline is refused with exit `2` naming
  it; a line starting `WingFoil-Version:` is reserved like `Approver:` and `Reason:`. (task-166)
- `dna set`, `dna add`, `dna update`, `dna remove` and `directive assign` edit `dna.yaml` / `roles.yaml`
  in place and keep their comments; when they cannot, they refuse unless `--force`, which rewrites the
  whole file and warns on stderr. Warnings of a successful command go to stderr (and to the MCP result),
  never to stdout. (task-193, bug-019, bug-126, task-169)
- `memory add` allocates `{n}` from the highest number on every branch and in every folder the type's
  path can resolve to, so it no longer reissues an id after a gap. (task-128, bug-087, bug-162)
- `dna.yaml` refuses a `team.agents` entry with a blank `name`, an `email` the attribution audit would
  reject (reserved domains, git's `.(none)`), or an `adapter` without an `email`. (task-260, bug-261)
- A role added with `dna add team.roles` is usable at once; a duplicate is refused with `role already
  defined: <role>`. (task-149)
- `memory.yaml` refuses a Memory type named `directive`, `dna` or `workflow`; the `init` scaffold shows a
  commented `states:` example on `bug`. (task-153, bug-052, bug-053, bug-177, bug-196)
- The `init` scaffold binds the built-in `security` directive to every role. (task-133, bug-112)
- `--help` states that `--format console` prints indented JSON for now and that `--no-color` changes
  nothing yet. (task-156, bug-152, bug-203)
- Memory scans skip archived elements by default and report an unreadable file as `W_MEMORY_UNREADABLE`
  instead of failing the whole search; for library users, `filterRelevantMemoryDocuments` reports what it
  leaves out in `diagnostics`. (task-171, bug-031, bug-164, bug-188, bug-189, bug-201, task-253,
  bug-230)

### Removed

- Library entry point: `prepareMemoryTransition` is no longer exported (use `beginMemoryTransition`), and
  `dist/storage` no longer exports the unconfined `resolveMemoryPath`. (task-132, task-131, bug-122)

### Fixed

- Output piped to another program is no longer cut at 64 KiB (e.g. `memory search --format json | jq`).
  (task-249, bug-222)
- `memory history` takes a transition's from-state from the commit's parent, which corrects the
  from-states it reported on histories with merged branches. (task-278, bug-308)
- `memory history` works with `log.showSignature=true` and signed commits. (task-268, bug-291)
- A `git` that cannot be run is reported as `could not run git: <cause>`, no longer as an unset
  identity. (task-284, bug-377)
- Memory history reads no longer turn a very large history or a git error into an empty answer, and no
  longer leak git's stderr. (task-142, bug-072, bug-093, bug-097, bug-178)
- `workflow next` spawns far fewer git processes, back under its 1 s p95 budget on large repositories.
  (task-283, bug-309)

### Security

- Dependency floors raised to clear the production advisories: `js-yaml ^4.3.2`,
  `@modelcontextprotocol/sdk ^1.32.0`. (task-250, bug-223)
- `dna set`, `directive create`, `directive assign` and `init` no longer write through a symlink to a
  file outside the project root. (task-172, bug-121)
- The guard against overwriting uncommitted edits refuses a path it cannot inspect (e.g. beyond a
  symlink) instead of treating it as clean. (task-131, bug-118, bug-122, bug-124, bug-182)
- `wingfoil init` secret-scans the built-in templates before writing them, and the library's
  `initWingfoilStorage` refuses an initialised project; the scanner sees indented and `export`-ed `.env`
  lines. (task-135, bug-037, bug-038, bug-088)
- A `--set` value containing `..` can no longer place a document outside its type's folder (`memory add`,
  `workflow start`); the same task fixed the deduction inputs and the `workflow is not open: <ref>`
  refusal for a closed run. (task-281, bug-300, bug-301, bug-313, bug-325, bug-326)

### Upgrading from 0.2.x

Each item was checked on a project initialised by 0.2.2, with both versions. The user guide's
*Upgrading from 0.2.x* section gives the same list with the messages in full.

- Replace the path in `sw-life-cycle.yaml`'s `include: workflows/custom/scrum-delivery.yaml` (or
  `kanban-delivery.yaml`) with the workflow name, `scrum-delivery`, and commit: until then every workflow
  command exits `1` with `E_WORKFLOW_INCLUDE_UNRESOLVED`. (task-136)
- A script reading `wingfoil workflow list` gets `{baseline, workflows: [...], diagnostics: [...]}`; the
  phases are in `wingfoil workflow show <name>`. (task-204)
- Create Memory elements with `wingfoil memory add`. A document written by hand must be committed before
  `memory submit` acts on it: an uncommitted one is refused with `document not found: … is not committed
  at HEAD`. (task-247)
- A `memory.yaml` type named `workflow`, `dna` or `directive` now fails every Memory command
  (`E_VALIDATION types.workflow (.wingfoil/memory.yaml): type name 'workflow' is reserved: …`, exit `1`):
  rename the type. (task-153)
- `wingfoil directive assign` to a role whose list is written inline (`qa: [testing]`) exits `1` without
  `--force` (`roles.yaml cannot be updated in place; … or pass --force to rewrite the whole file`); 0.2.2
  rewrote a comment-free `roles.yaml` silently. Write the list as a block, or pass `--force`. (task-169)
- To use `workflow start` and `agent execute`, add what 0.3's `init` scaffolds: the `plan` type and
  `memory/templates/plan.md`, `paths.runs`, and `.wingfoil/agents/`. Without the `plan` type,
  `workflow start` exits `1` naming it. (task-217, task-138, task-196)
- A surplus operand is refused with exit `2` (`wingfoil memory search a b` exited `0` in 0.2.2).
  (task-129, task-165)
- `wingfoil mcp` and `wingfoil directives list` exit `1` in a repository without `.wingfoil/`. (task-174,
  task-143)
- Refusal wordings changed (a missing operand, an illegal transition, a missing configuration file);
  exit codes did not. Scripts matching stderr text must be updated. (task-179, task-130, task-181)
- `wingfoil --version` prints `<version> (<sha>)`. (task-192)
- Library users: `prepareMemoryTransition` and `dist/storage`'s `resolveMemoryPath` are gone (see
  *Removed*). (task-132, task-131)

### For contributors

These change how WingFoil itself is developed, not how it behaves in your project.

- A governance check over `wf()` commits (`npm run check:governance`) runs in CI on pushes and pull
  requests, from a tracked pre-push hook, and under branch protection, with an advisory claim lint.
  (task-167, task-208, bug-192, bug-218, bug-249, bug-307)
- CI: a packaging gate on every push and pull request (`ci.yml`, also for pull requests into
  `release/**`), the whole-project typecheck and a control-character gate, a scheduled dependency and
  lockfile check, and an OpenSSF Scorecard workflow. (task-140, task-267, task-173, bug-073, bug-185,
  task-190, bug-225, bug-238, task-160)
- Release process: a release candidate rehearsed in staging with a no-identity suite before the tag, an
  `e2e-smoke` gate that drives a fresh project from the packed tarball (fake agent included) with exact
  exit codes, a strict build-stamp and transcript check, and maintenance lines `release/X.Y` for patches
  (tag gate, version-bump baseline, workflow base branch). (task-219, task-207, bug-132, bug-133,
  bug-134, task-243, task-254, bug-235, task-282, bug-310, bug-311, bug-312, task-265, task-286,
  task-287, task-288)
- Test suite: every source file in coverage, `npm test` independent of concurrent runs, latency budgets
  measured on an idle machine (`npm run test:latency`), parity tests for documented enumerations and
  backticked names, a version-bump gate on the versioned config files, secret fixtures built at runtime,
  a fake agent for `agent execute`, and test-hygiene fixes. (task-134, bug-141, task-146, bug-095,
  bug-167, bug-181, task-154, bug-012, bug-013, bug-014, task-248, task-263, bug-276, task-285, bug-378,
  task-187, bug-206, task-151, task-183, bug-143, task-182, bug-055, bug-190, bug-228, task-200,
  bug-234, bug-242, task-145, bug-070, task-147, bug-036, task-152, bug-064, bug-065, bug-197, task-155,
  bug-046, bug-047, task-184, bug-045, bug-096, bug-194, task-189, bug-161, task-215, task-262,
  bug-273, task-280, bug-343)
- WingFoil's own configuration: new and revised directives (`git-conventions`, `wingfoil-cli`,
  `claim-evidence`, `command-baseline`, `documentation`, `testing`, `traceability`, `code-review`), the
  workflows aligned with the v0.3 schema and their first `bindings.yaml`, `dev-loop` with waves and
  declared gates, a `change-proposal` type with a `vision-change` workflow, retrospective notes and
  consumer-feedback intake, the task `kind` and the stop-the-line threshold. None of it is part of what
  `init` installs. (task-139, task-148, bug-169, bug-170, bug-175, task-150, task-161, task-164,
  bug-163, task-170, bug-166, task-178, task-191, task-197, bug-186, task-199, bug-224, task-201,
  task-205, bug-248, bug-250, task-212, bug-270, task-213, task-221, task-230, task-269, task-270,
  task-271, task-272, task-275, task-276, task-277)
- Release health: `scripts/release-health/` measures the metric catalogue v2 (git history, process
  conformance, external, build, test, coverage, latency, install, static and Memory metrics) and compares
  runs into proposals, with v0.1 and v0.2 baselines. (task-231, task-232, bug-329, task-233, bug-331,
  task-241, bug-344, bug-332)

## [0.2.2] - 2026-09-29

A patch on 0.2: `memory add` can fill every token of an id pattern, every command's `--help`
describes it, `init` names its templates and the technology shape, and the package publishes from
the `wingfoil/wingfoil` repository through npm trusted publishing.

### Added

- `wingfoil memory add --set <name>=<value>`, repeatable, gives the id-pattern or path token `{name}`
  its value and writes the frontmatter field `name`, so the id and the field agree. `{workflow}`,
  `{phase}` and `{scope}` are filled the same way. A token left without a value fails with
  `missing value for token {name}: give it with --set name=<value>` (exit `1`); a `--set` without `=`
  exits `2`. (task-110)
- A `memory.add` action in a workflow file may carry its own `id_pattern`. (task-110)

### Changed

- Every command's `--help` shows a description, its operand, a description of each option, which
  options are `(required)`, an example and the exit codes. A missing option value now reads
  `error: option '--type <type>' argument missing`. (task-120, bug-128)
- `wingfoil init` without `--template`, where it cannot ask, fails with
  `error: missing required argument: --template (one of: Scrum, Kanban)`. Running it in an
  initialised project names a real remedy: edit the files under `.wingfoil/` and commit them, or use
  the `dna` and `directive` commands. (task-119, bug-140, bug-129)
- The `dna.yaml` written by `init` shows the `{name, category}` shape of a technology entry as a
  commented example, so the required `category` is visible before the first `dna add`. (task-118,
  bug-139)
- Titles keep a `.` between two letters or digits in the `{slug}` of a new id: `"v0.2 prep"` gives
  `v0.2-prep`, no longer `v0-2-prep`. Existing ids are untouched. (task-110)
- The package metadata names the repository `wingfoil/wingfoil`. The package also carries a new
  description, 15 discovery keywords and the MCP Registry name `io.github.wingfoil/wingfoil`.
  (task-115, task-116)

### Removed

- The runtime dependencies `@anthropic-ai/sdk` and `chalk`, which nothing in WingFoil imported. A
  global install now pulls four runtime dependencies. (task-117, bug-138)

### Security

- Releases are published from GitHub Actions through npm trusted publishing (OIDC) with provenance,
  as a staged publish a maintainer approves with two-factor authentication. No npm token is stored
  in the repository or its CI. (task-113, bug-136)

### For contributors

These change how WingFoil itself is developed, not how it behaves in your project.

- WingFoil's own configuration and Memory moved to the repository root (`.wingfoil/`,
  `docs/04_memory/`), so the Memory verbs run on this repository. (task-111, bug-075; task-123,
  bug-156)
- WingFoil is developed with a pinned, published build: `npm run -s wingfoil -- <command>`, with its
  MCP server registered in `.mcp.json`. (task-112)
- WingFoil's own configuration gained a `service` Memory type and a `service-ingest` workflow, for
  external state such as the npm package and the GitHub organisation. Its bug machine also gained
  decline edges from `triaged` and `planned` to `closed`. Neither is part of what `init` installs.
  (task-124, bug-159; task-114)
- The audit that reads Memory commit subjects accepts `->` as well as `→` in a transition bracket, and
  reports a bracket it cannot parse. (task-109, bug-137)
- Coverage now measures `src/core/index.ts` and `src/mcp/index.ts`. (task-122, bug-021)

## [0.2.1] - 2026-09-28

The Project Directives release: the Memory state-transition verbs, the full Directives pillar, a
mutation surface for Project DNA, and role Prompts on the MCP server.

**0.2.1 is the first published 0.2 version.** The `v0.2.0` tag exists, but 0.2.0 was never published
to npm: the release pipeline's final publish step failed before uploading anything (bug-135). 0.2.1
carries everything listed below for 0.2.0, plus that fix.

### Fixed

- The release pipeline publishes the package tarball by an explicit `./dist-pack/…` path. npm read
  the previous relative path as a GitHub repository, so the 0.2.0 publish failed. (bug-135)

## [0.2.0] - never published

The Project Directives release: the Memory state-transition verbs, the full Directives pillar, a
mutation surface for Project DNA, and role Prompts on the MCP server.

### Added

#### Memory

- `wingfoil memory submit <id>` moves a document from `draft` to its type's post-submit state and
  records the transition as one `wf(<type>): submit <id>` commit. A later submit clears any
  `rejection_reason` left by a reject. (task-045)
- `wingfoil memory approve <id> --reason <text>` advances a document through an approval gate. The
  commit records the approver's identity (`Approver: Name <email> (role)`), the reason, and the
  `[from → to]` transition in its subject; the timestamp is the commit's own. (task-046)
- `wingfoil memory reject <id> --reason <text>` sends a document back to its type's reject target,
  records the same `Approver:`/`Reason:` trailer, and copies the reason into the document's
  `rejection_reason` frontmatter field. (task-047)
- `wingfoil memory deprecate <id> [--reason <text>]` retires a document from any state to
  `deprecated`; the file stays in place. (task-048)
- `wingfoil memory history <id>` returns the document's audit trail in chronological order: one
  entry per commit with sha, author, ISO-8601 timestamp, operation, `from`/`to` state, approver and
  reason. (task-049)
- A reason may span several lines and paragraphs; `memory history` returns it whole. (task-072)
- Only a team member holding the `approver` role in `dna.yaml` can approve or reject; otherwise the
  verb fails with `user not authorized to approve type '<type>'` (exit 1). Approval authority is bound
  to roles, never to named people, and an AI agent's `executes_as: [approver]` grants no authority.
  (task-034, task-040, task-046)
- Each transition verb validates the document's current `status` against its type's state machine
  and refuses a state the machine does not declare, or a transition it does not allow (exit 1).
  (task-036)

#### Directives

- `wingfoil directive create --name <name>` creates a custom directive under
  `.wingfoil/directives/custom/` and commits it. (task-050)
- `wingfoil directive assign --directive <id>[,<id>...] --role <role>` binds one or more directives
  to a role in `roles.yaml` and commits the change; an unknown role is refused. (task-051, task-056)
- `wingfoil directive remove <name>` deletes an unassigned custom directive and commits the removal.
  A directive still assigned to a role is refused with
  `cannot remove '<name>': still assigned to role '<role>'`. (task-052)
- `wingfoil directives list [--role <role>]` lists every directive with its role assignments
  (`global (all roles)` for global ones), plus a `warnings` list. (task-053)
- `wingfoil init` now installs six built-in directive templates under
  `.wingfoil/directives/built-in/` — `code-quality`, `testing`, `code-review`, `architecture`,
  `security`, `documentation` — next to a git-tracked `.wingfoil/directives/custom/`.
  (task-054, task-057)
- A custom directive with the same id as a built-in one takes precedence, and the shadowing is
  reported as a warning naming both files and the one in use. (task-055)

#### DNA

- `wingfoil dna add|update|remove <path> --value <v>` edit collections and lists in `dna.yaml`: add a
  team member or a role, update a field of an entry, remove an entry. `add` and `update` accept
  `--entry-<field>` options for the fields the target collection declares (for example
  `--entry-email`, `--entry-roles`). This gives the first CLI path to seed the approver.
  (task-093, bug-083)
- Path segments can be quoted, so entries whose name contains a dot are addressable, e.g.
  `wingfoil dna update 'stacks.technologies."Node.js".version' --value 24`. (task-099, bug-091)

#### Interaction layer (MCP)

- The MCP server (`wingfoil mcp`) now serves one read-only Prompt per role, named `{role}-session`,
  that embeds the role's assigned directives plus the global ones. A request for an undefined role
  is refused. (task-039, task-058, task-037)

#### Packaging

- The npm package ships an MIT `LICENSE` file and declares `repository`, `homepage`, `bugs` and
  `author`; it is published publicly with npm provenance. (task-059, task-070)

### Changed

- **Node.js 22.12.0 or later is now required** (`engines.node: ">=22.12.0"`). 0.1.0 declared
  `>=18`, which its own dependencies did not accept. (task-074, bug-023)
- **Breaking:** `wingfoil dna set` takes its value as an option — `dna set <path> --value <v>` —
  instead of a second positional (`dna set <path> <v>` in 0.1.0): the positional is always the target,
  options are attributes. (task-093)
- `wingfoil dna set <path> --value <v>` writes scalar fields only. For a collection or list it now
  answers with the `dna add|remove|update` command to use. A path that does not resolve to a declared
  field is refused instead of creating an unschema'd key. (task-093, bug-084)
- `wingfoil memory search` leaves out archived documents (`deprecated`, `superseded`) by default;
  ask for them explicitly with `--status deprecated` or `--status superseded`. (task-038, task-069)
- The MCP `wingfoil://memory/{type}` collection Resource leaves out archived documents too, so an
  agent reads the same set as a default `memory search`. (task-069, bug-010)
- Commands resolve their configuration from the last commit (`HEAD`), not from uncommitted edits:
  the state machine and type registry in `memory.yaml` (including `memory add`'s `path` and
  `template`), the role catalogue and approval authority in `dna.yaml`, and the directive inventory
  that `directive assign` and `directive remove` check. Commit configuration changes before relying
  on them. (task-090, task-091, task-095, task-096, bug-079, bug-081, bug-082, bug-085, bug-086)
- Usage errors now all exit `2` with an `error:` line: an unknown command, an unknown option, and a
  command group invoked without a subcommand (for example `wingfoil dna`). (task-101, task-103,
  bug-098, bug-103)

### Fixed

- A project created by `wingfoil init` can run every Memory transition verb: the scaffolded
  `memory.yaml` now carries a state machine. (task-071, bug-030)
- `wingfoil init` writes directive files that pass the directives schema, so `directives list` works
  on a fresh project. (task-064, bug-006)
- `wingfoil dna set` preserves comments in `dna.yaml`. (task-063, bug-004)
- Frontmatter edits made by the transition verbs keep the rest of the YAML intact (inline comments,
  column-0 comments inside sequences, values without a trailing newline). (task-047, bug-041)
- Memory commits contain only the element's own file; files you had already staged no longer ride
  into a `wf(...)` commit. (task-045, bug-027)
- `wingfoil memory history` no longer reports the commit of the type's template as an entry of the
  element. (task-089, bug-077)
- `wingfoil memory history` reports correct states for an element that was renamed, and no longer
  prints git's `fatal:` output to the terminal. (task-097, bug-080, bug-071)

### Security

- `approve`, `reject` and `deprecate` commit the status change and nothing else. If the document has
  uncommitted edits, the verb refuses (exit 1) and asks you to commit or stash them first.
  (task-088, bug-076)
- `init`, `memory add`, `dna` and `directive` commands refuse a target file that has uncommitted
  changes they did not make, so an unrelated edit cannot enter the audit trail under their commit.
  (task-092, bug-078)
- `--reason` has a declared shape: it may not be blank, and no line may start with `Approver:` or
  `Reason:`. Violations exit `2`. This stops a reason from forging an approval record, which matters
  most on `deprecate` because it writes no `Approver:` line. (task-041, task-072, bug-042)
- A reason containing git-log framing control characters can no longer fabricate a
  `memory history` entry. (task-086, bug-050)
- Memory writes stay inside the project root. A Memory directory that is a symlink leaving the
  project is refused with `E_PATH_ESCAPES_ROOT`, and a symlinked document file is not followed.
  (task-105, task-106, bug-117, bug-120)
- `wingfoil directive remove` refuses before deleting anything when the directive resolves outside
  the project root, for example through a symlinked `directives/custom/`. (task-102, bug-044)
- Built-in directives cannot be removed (`built-in directives cannot be removed`), and `init` checks
  the integrity of the built-in templates on every write path before installing them.
  (task-042, task-044, task-054, bug-018)

## [0.1.0]

The Project Memory + DNA release. It was completed but not published to npm.

### Added

#### Command line

- The `wingfoil` CLI, installed from npm as the `wingfoil` bin, with global options
  `--format console|json|yaml`, `--verbose`, `--no-color` and `--no-interactive`. (task-001,
  task-006, task-007, task-013)
- Exit-code contract: `0` success, `1` operation or validation failure, `2` usage or integrity error.
  (task-012)
- `wingfoil init [--template Scrum|Kanban]` scaffolds `.wingfoil/` (`dna.yaml`, `memory.yaml`,
  Memory templates, `roles.yaml`, workflows) in the current git repository and commits it; without
  `--template` it asks interactively. (task-029)

#### Memory

- Git-backed Memory: every document is a Markdown file whose state lives in its frontmatter, and
  every mutation is a git commit with author and timestamp. (task-003, task-018, task-019, task-022)
- `memory.yaml` declares the element types, their paths, id patterns, templates and per-type state
  machines, with a default machine for types that declare none. (task-005, task-010, task-024)
- `wingfoil memory add --type <type> --title <title> [--tags ...]` creates a document from its type's
  template and commits it. Mutating commands require a configured git identity (`user.name` and
  `user.email`). (task-014, task-020)
- `wingfoil memory search [query] [--tag] [--status] [--type]` keyword search over Memory.
  (task-021, task-023, task-008)

#### DNA

- `dna.yaml`, the Project DNA: modules, stacks (technologies and methodologies), team and roles, and
  resource paths, validated on read. (task-027, task-002)
- `wingfoil dna show [section]` and `wingfoil dna set <path> <value>`. (task-025, task-026)
- `wingfoil paths [category] [--list]` returns the resource paths by category (`sources`, `tests`,
  `docs`, `config`, `governance`). (task-028)

#### Directives and Workflow

- `wingfoil directives list` and `wingfoil workflow list`, read-only. (task-006)

#### Interaction layer (MCP)

- `wingfoil mcp` starts an MCP server over stdio exposing read-only Resources:
  `wingfoil://dna`, `wingfoil://dna/{section}`, `wingfoil://memory/{type}`,
  `wingfoil://memory/{type}/{id}`, `wingfoil://workflows`, `wingfoil://workflows/{name}`. The server
  exposes no write path. (task-009, task-011, task-016, task-030)

### Fixed

- `wingfoil --version` prints the version and exits `0`. (bug-001)
- Running outside a git repository fails with an `error:` line and the documented exit code instead
  of a stack trace. (bug-002)
- `wingfoil init` scaffolds a `dna.yaml` and `memory.yaml` that pass their own schemas, so
  `dna show`, `dna set`, `paths` and `memory add` work on a fresh project. (bug-005)
