---
id: spec-008-cli-grammar
type: tech-spec
title: "CLI grammar & global options (src/cli)"
status: approved
scope: "src/cli"
supersedes: ""
tmpl_version: 260703
---

## Context

`src/cli` (Commander.js, a `dna.yaml` `stacks.technologies` entry) is one of two surfaces that must expose
**identical behaviour** for every WingFoil operation (REQ-SYS-05 — single behaviour behind CLI and MCP).
Every `CLI-*`/`memory.*` command, every workflow step that shells out to `wingfoil`, and every BDD
scenario under `docs/02_requirements/02_bdd/features/p1-memory/` and `p5-interaction/` assumes a single,
shared grammar: how commands are invoked, which flags are global, how a Memory document is referenced on
the command line, and when the CLI prompts interactively versus fails outright. Without one authoritative
definition, individual command implementations would each reinvent flag parsing, error formatting, and
exit-code conventions — producing divergent, non-deterministic CLI behaviour that breaks REQ-INT-04
(exit-code contract), REQ-INT-05 (machine-readable output), and REQ-INT-08 (consistent error format).

## Specification

### 1. Invocation grammar

Two invocation forms, matching the command map in `docs/01_vision/X_cli-cmds.md` and the `CLI-*` command
surface:

```
wingfoil [global-flags] <noun> <verb> [args] [flags]      # pillar/verb form, e.g. `memory add`
wingfoil [global-flags] <noun> [args] [flags]              # flat command: `init`, `mcp`, `paths`, `audit`
```

- `<noun>` is a pillar namespace (`memory`, `dna`, `directive`, `directives`, `workflow`, `agent`) or a
  flat command (`init`, `mcp`, `paths`, `audit`). `init` and `mcp` are the **bootstrap commands**: they
  are not `CORE_MODULES` operations but are wired directly onto the program (`src/cli/program.ts`),
  because `init` runs before a WingFoil configuration exists and `mcp` hosts the MCP surface itself
  (`spec-014-mcp-server-entry-point` §1). Neither is exposed on MCP (REQ-SYS-05's bootstrap exemption,
  `dl-046-bootstrap-commands-in-spec-006-section-3` A(a)), and both obey this grammar: global flags,
  the at-most-one-positional rule below, and §5's exit codes. `paths` is a self-named `CORE_MODULES`
  operation, and `audit` is planned as one (BDD `P5.1.3-audit.feature`, `dl-046` B(a)). The DNA pillar's verbs are `show`, `set`, and the three
  mutation verbs `add`, `remove` and `update` (§9) — the collection they act on travels in their
  `<path>` argument, not in the verb name, so the verb list does not grow as `spec-002`'s schema does
  (`dl-081-dna-mutation-surface-shape`). The Directives pillar deliberately exposes two nouns —
  singular `directive` (`create`, `assign`, `remove`) and plural `directives` (`list`) — each the
  `CoreModule.name` its operations register under (`spec-006-core-domain-api` §3 `module` column,
  `dl-041-spec-006-module-grouping-vs-core-module-name`).
- Global flags (§2) may appear anywhere after `wingfoil` — before or after `<noun>`/`<verb>`. If a flag is
  repeated, the last occurrence wins.
- Unknown `<noun>` or `<noun> <verb>` tokens produce `E_UNKNOWN_COMMAND` (exit `2`, REQ-INT-04) with a
  closest-match suggestion when Levenshtein distance ≤ 2 (ground-truth BDD:
  `p5-interaction/P5.1.4-cli-ux.feature` — `wingfoil memroy add` → `"unknown command 'memroy'"` suggests
  `"memory"`, exit `2`). The suggestion is matched against the commands at the level the token was
  typed (the nouns, or the verbs of the noun before it) and is `spec-005-cli-command-contract` §3.1's
  `hint:` line, `hint: did you mean "memory"?`, computed by WingFoil (`src/cli/suggest.ts`) rather than
  the argument parser's own `(Did you mean memory?)`.
- `[args]` is **at most one positional**: the identity of the command's target
  (`dl-082-cli-parameter-shape` — a positional identifies the target, an option carries an attribute).
  An operand beyond the one a command declares — any operand at all, for a command that declares none
  (`workflow list`, `directives list`, `memory add`) — is a malformed invocation: exit `2`, with a
  message naming the command, what it takes, and how many operands it got
  (`error: wingfoil memory approve takes one positional <id> (got 2 positionals)`,
  `error: wingfoil workflow list takes no positional (got 1 positional)`). The rule holds for every
  command, present and future, the bootstrap commands included (`error: wingfoil init takes no
  positional (got 1 positional)`). For every command it is enforced where commands are registered,
  before the project root is resolved, so before anything is read or written — the four DNA path
  verbs included: `dna set ..language python` is refused for its surplus, and §5 writes the
  malformed-path case with `--value`. Their surplus message adds the migration hint
  `the value travels in --value`, which each of them declares (`CorePositional.surplusHint`,
  `spec-006-core-domain-api` §2).
- **A missing required operand** is refused at exit `2` in one form for every command:
  `missing required argument: <name>`, with the command's usage on `spec-005` §3.1's `hint:` line
  (§4). It is enforced where commands are registered too, right after the surplus check.
- **One order of usage checks.** Every command, the bootstrap ones included, checks in this order: the
  global `--format` value — it decides how every later error is rendered, so an invalid one is refused
  first, in console text (`spec-005` §2); then the operand count, a surplus before a missing operand;
  then the project root (`E_NOT_AT_GIT_ROOT`, `E_NO_GIT_ROOT`, exit `1`); then the operation's own
  checks.
- **One id per call.** The Memory transition verbs (`memory submit`, `approve`, `reject`, `deprecate`),
  `memory amend` and `memory history` act on exactly one document per invocation; transitioning several documents
  takes one invocation, and one commit, each. The multi-id commit subject `wf({type}): {verb} {id1},
  {id2}, ...` is **historical only**: it records batch operations written by hand before the verbs
  shipped, and no command produces it.

### 2. Global flags

Accepted by every command, in any position, per REQ-INT-04/REQ-INT-05/REQ-INT-08. The one
exception is `--reason`, a flag several `memory` verbs share, whose row names the commands that take
it. A flag a single command declares is not listed here: it is in §12.

| Flag              | Type                   | Default   | Behaviour                                                                                             |
|-------------------|------------------------|-----------|---------------------------------------------------------------------------------------------------------|
| `--help`, `-h`    | flag                   | —         | Print context-sensitive help (synopsis, args, flags, example) and exit `0`. Takes precedence over all other flags. |
| `--version`       | flag                   | —         | Print the build stamp `<semver> (<sha>)` and exit `0`: `package.json`'s `version`, then the commit the running `dist/` was built from as `dist/build-info.json` records it, as the full hex object name (`<sha>-dirty` when `git status --porcelain` lists a change, tracked or untracked, under a build input — `src/`, `package.json`, `package-lock.json`, `tsconfig*.json` or the record's writer `scripts/write-build-info.cjs` — so it means "this `dist/` does not match the sha", and a change elsewhere (documentation, Memory) does not set it; `unknown` when no record exists, when the build could not read git, or when the record's commit is malformed or not a hex object name) — the value of every commit's `WingFoil-Version:` trailer (`dl-111` Action 3). Takes precedence over all other flags except `--help`. |
| `--format <fmt>`  | `console\|json\|yaml`  | `console` | Output encoding. `console` for humans; `json`/`yaml` for scripting/CI (REQ-INT-05). **Today, on success, `console` prints the payload `json` prints, indented by two spaces, with no colour** (errors and warnings keep their §6 `error:`/`warning:` lines): its human rendering (colour, `✓`/`⚠`/`✗` prefixes) is P5.1.4's, and how it is built is `dl-043`'s decision, deferred to v0.4. That change will alter the default output, so a script passes `--format json`. An unsupported value exits `2` with `error: invalid --format value "<value>"`. |
| `--reason <text>` | string                 | —         | **Required** on approval-gate commands (`memory approve`, `memory reject`, `memory amend`); optional elsewhere (e.g. `memory deprecate`). Recorded in the resulting git commit body (P1.7) as a `Reason:` **block** — the remainder of the `Reason:` line plus every following body line, up to (exclusive) git's trailing trailer paragraph or the end of the body — in the **declared normal form**, not as the raw argument (`dl-067-reason-trailer-contract`; see the Notes). Omitted where required exits `2` with `error: missing required argument: --reason` (ground-truth BDD `P1.7-memory-approve.feature`). |
| `--reason` (unrecordable value) | —        | —         | A reason that cannot be recorded faithfully in the trailer is refused at the CLI boundary with exit `2`, before anything is read or written, on **every** verb that takes the flag — `memory deprecate` included, where the flag is optional but a declared-and-empty value is still a usage error (`dl-067` S2). Four cases, judged in this order on the declared normal form, each with its own message, none of them `missing required argument: --reason` (which answers the *omitted* case above): blank or whitespace-only → `error: invalid flag value: --reason must not be blank`; a C0 control character other than tab (`U+0009`) and newline (`U+000A`), DEL (`U+007F`), a C1 control (`U+0080` to `U+009F`) or a Unicode line or paragraph separator (`U+2028`, `U+2029`) → `error: invalid flag value: --reason must not contain a control character other than tab or newline (found U+XXXX)`, naming the first one by code point (`dl-078` (A) and its Amendment of 2026-10-01; a carriage return is not refused, because the normal form has already turned it into a newline); a line starting with one of the **reserved trailer keys** `Approver:`, `Reason:` or `WingFoil-Version:`, in any letter case (git reads trailer keys case-insensitively) → `error: invalid flag value: --reason must not contain a line starting with "Approver:", "Reason:" or "WingFoil-Version:"` (`dl-111` Q1 (A) reserves the third); a final paragraph made entirely of `Key: value` lines → `error: invalid flag value: --reason must not end in a paragraph of "Key: value" lines; add a closing sentence after it, or fold those lines into prose` (`dl-070` S4). |
| `--verbose`       | flag                   | `false`   | Emit diagnostic logs to stderr in plain text, even under `--format json`/`yaml`. Never alters stdout.  |
| `--color` (negatable) | boolean flag        | `true`    | ANSI colour on stdout. Pass `--no-color` to disable; also disabled automatically when `NO_COLOR` is set to any non-empty string (https://no-color.org/) — an explicitly empty `NO_COLOR=` does **not** disable colour. **Today no output is coloured** (see `--format`), so `--no-color` and `NO_COLOR` are accepted and change nothing; the rule above is the one the colour P5.1.4 adds must honour. Commander itself already honours `NO_COLOR` (it strips colour from its help, which has none) but not `--no-color`, so that rendering must read both. |
| `--interactive` (negatable) | boolean flag  | `true`    | Whether missing required args may trigger a readline prompt in a TTY (§4). Pass `--no-interactive` to force immediate failure instead. |

Notes:

- `--format` values are `console`/`json`/`yaml`; the fit criterion in REQ-INT-05 calls these out
  explicitly for `wingfoil paths` and `wingfoil workflow status`, but the flag is registered globally so
  every command honours it uniformly (REQ-SYS-05).
- `--color`/`--interactive` are **negatable booleans**, not independent `--no-*` flags with their own
  default — see §3 for why this distinction matters and how Commander.js models it.
- **`--reason`'s declared normal form** (`dl-067-reason-trailer-contract`, ratified), in two parts:
  - **What git already does, and would do whether or not this row existed** — per-line trailing
    whitespace stripped, runs of blank lines collapsed to one, leading and trailing blank lines
    dropped. That is git's own `cleanup=whitespace`, which the commit primitive passes explicitly
    (`git commit --cleanup=whitespace`, `bug-051`), so it holds whatever `commit.cleanup` the
    operator's or the repository's git config sets — under `strip` a reason line opening with `#`
    would otherwise be deleted, under `verbatim` the whitespace kept. Stating it here does not add a
    transformation; it makes the outcome declared instead of incidental.
  - **What WingFoil adds** — the first line's leading whitespace is trimmed. git does **not** do this;
    it is the writer's own step, and it exists because that line sits after `Reason: ` on the same
    physical line and the reader consumes the key with its following whitespace. Without it, a reason
    beginning with spaces would round-trip unequally.

  Interior indentation is preserved by both parts. The rule is enforced once, where the trailer is
  built, and the reader consumes the same grammar, so what is read back out of the commit equals what
  the writer declared rather than approximately equalling what the caller typed.
- **Where the `Reason:` block ends — the terminator rule** (`dl-070-narrow-reason-block-terminator`
  (A), S3). "git's trailing trailer paragraph" is recognised by a **shape rule modelled on git's**,
  not against a list of known trailer keys: it is the body's final paragraph when every line of it
  has the form `Token: value` (a token of letters, digits and `-` starting with a letter, a colon, a
  space or tab, then a non-space character). It is not identical to git's: git also takes a mixed
  final paragraph for trailers when at least a quarter of its lines are trailers and one of them is
  git-generated or configured (e.g. `Signed-off-by:`), which this rule does not. That is why the
  reserved keys are refused on every line of a reason, not only in its final paragraph. The `Reason:` line itself always belongs to the block,
  even when it is alone in such a paragraph. The writer-side refusal of a trailing `Key: value`
  paragraph (the row above) is the corollary: without it, the reader would take that paragraph for
  the trailer and drop it. A `Key: value` line *inside* the block is ordinary prose and ends nothing.
- **The build signature — the trailer paragraph every commit ends with** (`dl-111-tool-signature-in-commits`,
  Q2 (a), Q3 (i)). Every commit the tool writes, on every command, ends with a paragraph of its own
  holding one trailer line, `WingFoil-Version: <semver> (<sha>)` — the stamp `--version` prints, or
  `<semver> (unknown)` when the running build has no `dist/build-info.json`. It is the final paragraph,
  so it is the trailing trailer paragraph at which a `Reason:` block ends, and the one git's
  `%(trailers:key=WingFoil-Version)` reads; `memory history` reports its value as every entry's
  `wingfoil` field, `null` when a commit has no such trailer. A commit without it was not written by
  WingFoil. The key is reserved (the row above), so a reason cannot supply it.
- **Why not "verbatim".** This row said "Recorded verbatim in the resulting git commit body" until
  `dl-067`. That was never achievable for multi-line text — git normalizes on the way in — and the gap
  between the promise and the behaviour was `bug-042`: a blank reason was accepted at exit `0` and
  destroyed the whole approval record, a multi-line one was truncated to its first line on read, and
  one shaped like a trailer could forge a second `Approver:` line into the audit record.

#### The Memory commit subject — the closed `wf()` operation list

The `Reason:` block above lands in the body of a Memory commit. Its subject is a parsed interface too:
`wingfoil memory history` (P1.10) reads the operation back out of it, and the consistency check reads
its bracket. The grammar is:

```
wf({type}): {verb} {id1}, {id2}[ [{s0} → {s1}( → {sN})*]]
```

- `{type}` is a `memory.yaml` type key. `{verb}` is the token after `: ` up to the first whitespace.
- `{verb}` is one of the eleven verbs below and **no other**. The list is closed and declared
  (`dl-079` (A)); a new verb is a change to this table and to `spec-003`'s verb table together.
- The bracket closes the subject. `→` (U+2192) is written; `->` is read as its equal (`bug-137`).

| verb        | emitted by                                                                 | bracket |
|-------------|----------------------------------------------------------------------------|---------|
| `add`       | `memory add`                                                               | none |
| `submit`    | `memory submit`                                                            | none (`dl-054`; kept over `dl-106` W1 (a), ruling R20) |
| `approve`   | `memory approve`; a `set_state` in a phase that declares `approval:`       | `[from → to]` |
| `reject`    | `memory reject`; a `fallback.set_state` routed by a reject                 | `[from → to]` |
| `deprecate` | `memory deprecate`                                                         | `[from → deprecated]` |
| `start`     | a `set_state` that opens work on an element                                | `[from → to]` |
| `finalize`  | a `set_state` into the last state of the type's `sequence`; `workflow end` for a plan; the `supersedes:` trigger of `memory approve` (below) | `[from → to]` |
| `sync`      | `<type>.sync_state` (`bug.sync_state`, `dl-045`)                           | `[from → to]`, or a chain `[s0 → s1 → … → sN]` |
| `amend`     | `memory amend` (`dl-108`)                                                  | `[s → s]` |
| `park`      | `memory park` (`dl-110`)                                                   | `[in-progress → backlog]` |
| `assign`    | `element.set_release` (below)                                              | none |

**Which verb a `set_state` emits** (`spec-003` verb table). `approve` when the phase declares
`approval:`. Otherwise `finalize` when the target is the last state of the type's `sequence`.
Otherwise `start`.

**The `supersedes:` trigger emits `finalize`** (`dl-065` Q1.1; the rule is `spec-001`'s, the field
`spec-010`'s). `memory approve` on an element whose committed `supersedes:` names another element moves
that element into `superseded`, the last state of its type's `sequence`. That is a `set_state` into the
last state, so the commit is a `finalize`, made right after the approve:

```
wf({type}): finalize {id} [{state} → superseded]

Reason: superseded by {approved id} (its supersedes: field), approved in {approve sha}.
```

It carries no `Approver:` line: the approval is the approve commit's, which the `Reason:` cites by
sha (the reasoning `dl-061` B.1 gives for `sync`). Every refusal of the pair runs before the approve
is written (`spec-006` §7).

**`element.set_release` emits `assign`** (approver ruling 2026-10-01, which reverses
`release-planning`'s R20/Q6 on this point). `assign` writes the `release` field and nothing else.
It may be used on every type, `adr` included, and never changes `status`. It is not an approval: the
commit carries no `Approver:` line, and no approver authority is checked. The subject is the
canonical form, the one the four practised `assign` commits already have
(`git log --format=%s | grep -E '^wf\([a-z-]+\): assign '`):

```
wf({type}): assign release {version} to {id1}, {id2}
```

Because `status` does not change, the subject has no bracket. `memory history` reads `assign` only
in this form. Any other `assign` subject reads `operation: null`. `amend` stays as `dl-108` defines
it: approver-gated, with per-type amendability. It is not what `set_release` emits.

**`memory amend` emits `amend`** (`dl-108` A1 (a), A2 (i), A3; `task-127`). It commits the author's
uncommitted edit of one document, as that one path, and moves no state, so its bracket is the
self-loop of the state committed at `HEAD`. It is an approval: the body carries `Approver:` and
`Reason:` exactly as `approve` writes them, and the caller needs the same authority (REQ-SEC-03). What
an amendment may change is `spec-010`'s § Field-write ownership row: the body and every frontmatter
field except `status`, `id`, `type`, `release`, `rejection_reason` and `supersedes`, each of which another operation owns (`release` only on a type whose scaffold committed at `HEAD` declares it, `task-170`). Past the type's initial state, the edit must
also keep `title` and every `template.frontmatter.required` field non-empty (`spec-010` § Validation
rules). Which types may be amended is the type's `amendable` key
(`spec-001`), read from the committed `memory.yaml`; absent means not amendable. Its refusals: a
missing or blank `--reason` exits `2` (§2 above); a type that is not amendable, a document that no
commit holds, a document with no uncommitted change, an edit that changes one of those six fields
(the message names the field), and an edit that empties a required field past the initial state
(`missing required field on amend: <fields>`) exit `1`, as does a caller without approval authority,
with `approve`'s own message, checked as soon as the document is located. Other modified or staged files are not committed and are left as they were.

```
wf({type}): amend {id} [{s} → {s}]

Approver: {name} <{email}> (approver)
Reason: {reason}
```

**A chained bracket** is read from its first state to its last. Those two states are compared with
the frontmatter before and after the commit. Given the type's machine, every hop must be one of its
edges: the forward edge `sequence[i] → sequence[i+1]`, a `gates` reject target, or the implicit edge to
`deprecated`. A hop that is none of these is an `illegal-hop` finding of
`verifyTransitionConsistency` (`src/memory/audit.ts`, `bug-155`). `sync` is the only verb that
emits a chain. The reader reads a chain, and checks its hops, whatever the verb.

**A `sync` that crosses a `gates` reject edge** cites the approver's reject commit by sha in its body.
It carries no `Approver:` line of its own, because the decision is recorded once, on the host task's
reject (`dl-061` B.1).

**Subjects that are not Memory operations.** `memory history` reports `operation: null` for them and
the consistency check reads no bracket in them:
- the configuration scopes `wf(dna): …`, `wf(directive): create|assign|remove …` and
  `wf(workflow): create|remove …` (`spec-017` §7.7–7.8), whatever their verb token;
- the records outside the `wf()` grammar: `workflow: finalize …` (`spec-017` §7.9) and
  `agent: record …` (`spec-016`);
- every verb outside the list. History is not rewritten (`dl-035`), so the practised `start-fix`,
  `schedule`, `plan`, `enter-releasing`, `mark-released`, `deferred` and the early verbless
  `wf(task): {id} [a → b]` stay in the record and read as `null`.

### 3. Commander.js negatable-boolean pattern (`--no-color`, `--no-interactive`)

A naive implementation might register `.option('--no-color', ..., false)` and then read
`flags.noColor`. That is wrong on two counts — Commander's negatable-boolean convention exposes the
**positive** property (`color`, default `true`), so `flags.noColor` is `undefined` and the check never
fires; and passing an explicit `false` default flips the *positive* property's default to disabled,
inverting the intended "colour on unless opted out" contract. This spec mandates the correct pattern
below instead.

**Correct pattern** — register the flag with no default, and read the *positive*, auto-negated property
Commander creates from any `--no-<name>` option:

```ts
import {Command} from 'commander'

const program = new Command('wingfoil')

program
    .option('--format <format>', 'output format (console|json|yaml); console prints indented JSON for now', 'console')
    .option('--verbose', 'emit diagnostic logs to stderr')
    .option('--no-color', 'disable ANSI colors (accepted; no output is colored yet)') // -> opts().color, default true
    .option('--no-interactive', 'fail on missing args instead of prompting') // -> opts().interactive, default true

const opts = program.opts()
// opts.color        === true unless --no-color was passed (then false)
// opts.interactive   === true unless --no-interactive was passed (then false)

const colorEnabled = opts.color && !isNoColorEnvSet()
const interactiveAllowed = opts.interactive
```

```ts
function isNoColorEnvSet(): boolean {
    const env = process.env['NO_COLOR']
    return env !== undefined && env !== ''
}
```

Key rule: **never** declare a manual default on a `--no-*` option and **never** invent a `noColor`/
`noInteractive` property — Commander derives `color`/`interactive` automatically from the flag's name,
defaulting to `true`; only check `opts().color === false` / `opts().interactive === false` (or the
truthy/negated form shown above).

No command reads the colour check yet: no output is coloured until P5.1.4 (§2). The pattern governs
how `--no-color` is registered today, and how it and `NO_COLOR` are read once `console` has a colour
rendering.

### 4. Interactive-prompt rules

| Condition                                                        | Behaviour                                                          |
|--------------------------------------------------------------------|------------------------------------------------------------------------|
| All required args present (flags or positionals)                 | Direct execution; no prompt                                          |
| Required arg missing, stdout is a TTY, `--interactive` (default)  | Readline prompt for each missing arg, one at a time                  |
| Required arg missing, stdout is **not** a TTY (CI/pipe/non-interactive) | Fail immediately: exit `2`, `error: missing required argument: --<name>`; where the argument takes one of a closed set of values, the line ends with ` (one of: <v1>, <v2>, …)`, read from the same registry the command validates against (e.g. `init`: `missing required argument: --template (one of: Scrum, Kanban)`) |
| `--no-interactive` passed (any TTY state)                         | Fail immediately, same as the non-TTY case — no prompt is attempted  |

A missing **positional** is never prompted for, on any terminal: no command collects one interactively.
It is refused at exit `2` as `missing required argument: <name>` — the placeholder `--help` shows,
e.g. `<id>`, `<path>`, `<name>` — followed by the command's usage, its required options included, on
`spec-005` §3.1's `hint:` line (`hint: usage: wingfoil memory approve <id> --reason <text>`). The form
is the same for every command; a noun invoked without its verb is the same case with `<command>`
(§5).

Wizard-style multi-step collection (`wingfoil init` with no `--mode params` flags) is command-specific:
it runs the same present/missing × TTY/non-TTY matrix per field, in the field order the command defines.
Optional flags never trigger a prompt — an omitted optional flag simply keeps its default.

### 5. Exit-code contract (REQ-INT-04)

| Code | Name              | When                                                                                     |
|------|-------------------|-------------------------------------------------------------------------------------------|
| `0`  | Success            | Command completed (including a no-op `--dry-run` simulation)                             |
| `1`  | User/logic error   | Valid invocation, but the operation itself failed: unknown Memory type, illegal state transition, document not found, unauthorized approver |
| `2`  | Usage/argument error | Malformed invocation: unknown command/flag, missing required argument, an operand beyond the one the command declares (§1), invalid `--format` value |

This table is the single source of truth for exit codes; ground-truth BDD scenarios (`P1.3-memory-add`,
`P1.6-memory-submit`, `P1.7-memory-approve`, `P5.1.4-cli-ux`) exercise exactly these three codes and no
others.

A distinction the DNA verbs make visible, and which the table already decides: a **malformed** path is
exit `2` (`dna set ..language --value python` → `error: invalid key path: '..language'`, as
`P2.1-dna-set.feature` pins it) — and so are the two ways §9's quoting can fail, an unterminated
quote and a `"` no delimiter can account for — because the invocation itself is malformed, while a
**well-formed path naming a field the schema does
not declare** is exit `1` — a validation failure, like an unknown Memory type. The same reading is what
`bug-076`'s Correction records the approver ruling for a dirty working tree: the code follows the kind
of failure, not its severity.

A second case the table decides once it is read the same way: a **noun invoked without its verb**
(`wingfoil dna`), `wingfoil` invoked with no command at all, and `wingfoil help <unknown>` are
**"missing required argument"** in the exit-`2` row — the case already enumerated there, not a fourth
one. §1's grammar makes the verb a required argument of the noun, so an invocation that stops at the
noun is malformed, and it exits `2` with an `error: ` line naming what was missing (`spec-005` §1's
rule that a non-zero exit always carries an error message admits no exception for it). An argument
parser that answers such an invocation by printing the command's usage has not thereby emitted the
error message. An **explicit** request for help by name — `wingfoil help`, `wingfoil help <known>` —
is the opposite case and exits `0` alongside `--help`/`--version`, even though it prints the same
text.

### 6. Error format (REQ-INT-08)

Every user-facing error, on stderr, in `--format console` (default):

```
error: <reason>
```

Example:

```
$ wingfoil memory add --type unicorn --title "X"
error: unknown memory type 'unicorn' (not defined in memory.yaml)
```

For `--format json` / `--format yaml`, the same `<reason>` is carried as a structured field:

```json
{"error": "<reason>", "hint": "<optional suggestion>", "details": [{"file": "…", "detail": "…"}]}
```

`hint` and `details` are optional and omitted when empty. In console format a `details` entry is an
indented line after the `error:` line (and after the `hint:` line, when there is one). The shape
applies to every refusal, the argument parser's own (unknown command or option, missing option
argument, missing verb) included. The rules for both fields are `spec-005-cli-command-contract`
§3.1–§3.2's.

`--verbose` appends diagnostic lines (stack trace, underlying git output) to stderr after the error line;
it never changes the error line itself or the exit code.

**Pinned refusal strings.** §6 fixes the format of an error line; these reasons are fixed word for
word, beside the ones the BDD features pin (`dl-062-roles-yaml-unwritable-fallback`, Q1 option 3 and
Q2 option 1):

| Command | Exit | Reason |
|---------|------|--------|
| `directive assign` | `1` | `roles.yaml cannot be updated in place; edit assignments.<role> by hand, or pass --force to rewrite the whole file` — the in-place editor cannot apply the edit and `--force` was not given, whether or not the file has comments. Nothing is written. |
| `directive remove` | `1` | `cannot remove '<id>': still assigned to every role via roles.yaml 'global'` — the directive is bound through `roles.yaml`'s `global` list. A per-role binding gives `P3.3-directive-remove.feature`'s `cannot remove '<id>': still assigned to role '<role>'`. |

**Warnings on a successful command.** A command that succeeds may also have something to tell the
operator (`CoreResult.warnings`, `spec-006` §2). A warning goes to **stderr only**, under every
`--format`, so stdout is byte-identical with and without it (`spec-005` §2). In `console` it is the
line `warning: <text>`, beside the `error: ` prefix; a continuation line of a multi-line warning is
indented. Under `--format json` each warning is one `{"warning": "<text>"}` document on its own
line, and under `--format yaml` one YAML document opened by `---` and closed by `...`. Each is
therefore self-delimiting: warnings followed by an error on the same stderr (`spec-016` §3.4) read as
separate documents, and the error object keeps its `spec-005` §3.2 bytes. These are `spec-016` §3.4's
shapes, used by every command. Warnings are written before the payload, in the order core recorded
them, and never change the exit code. So stderr can be non-empty on exit `0`, and under
`json`/`yaml` a refusal can follow warnings. `spec-005` §3.2 still says stderr under `json`/`yaml`
carries "the one object and nothing else". That sentence is about refusals and predates warnings.
Its amendment, together with §2's, is the task that implements `spec-016` §3.4 (task-218), and this
paragraph is the rule until then. The text of the one warning shipped today is pinned:

| Command | Warning |
|---------|---------|
| `directive assign --force`, when the whole file was rewritten | `roles.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, blank lines, line endings or number formatting (1.0 becomes 1)` |

An MCP Tool has no stderr: its result carries the warnings as `structuredContent` (`spec-004` §4.3
item 5). The shipped `wingfoil mcp` registers no Tools before P5.2.3 (v0.4), so on that surface the
field is not reachable yet.

### 7. Element-ref syntax

A Memory document is referenced on the command line as `<type>:<id>` (colon separator):

```
task:task-101
adr:adr-004
release-line:rl-v1
```

Used consistently in every context that names a document *by type*:

| Context                                    | Syntax        | Example              |
|---------------------------------------------|---------------|-----------------------|
| `--element` flag (`agent execute`)          | `<type>:<id>` | `--element task:202` |

Commands whose noun already scopes the type (`memory submit <id>`, `memory approve <id> --reason ...`,
`memory reject <id> --reason ...`, `memory deprecate <id>`) take the **bare `<id>`** as the positional
argument — the type is not repeated because IDs are globally unique (`id_pattern` per type in
`memory.yaml`) and the type is redundant once written out that way. `memory add` supplies the type via
`--type <type>` instead of an element-ref, since the document does not exist yet.

### 8. Help system

| Invocation                    | Output                                                              |
|--------------------------------|-----------------------------------------------------------------------|
| `wingfoil --help`               | Binary synopsis, noun list (pillars + flat commands), global flags table |
| `wingfoil <noun> --help`        | Noun synopsis, list of verbs with one-line descriptions               |
| `wingfoil <noun> <verb> --help` | Synopsis, argument table, flags table, exit codes, one example        |

Help output always renders as `--format console` regardless of the ambient `--format` flag, and always
exits `0`.

### 9. DNA field paths (`<path>` / `--value`)

The DNA verbs state their parameters the way the other nine `memory`/`paths` commands already do
(`dl-082-cli-parameter-shape`): **the path is a positional, because it identifies the target; every
attribute is an option.** `dl-081-dna-mutation-surface-shape` ratified the surface (option (E)) with
the path in a `--field` option; `dl-082` amended that one point and left its semantics untouched.

```
wingfoil dna set    project.license              --value MIT
wingfoil dna add    team.roles                   --value reviewer --entry-description "reviews changes"
wingfoil dna add    team.members                 --value roberto --entry-email r@example.it --entry-roles approver
wingfoil dna add    team.members.roberto.roles   --value qa
wingfoil dna add    paths.sources                --value "src/**"
wingfoil dna update team.members                 --value roberto --entry-email new@example.it
wingfoil dna update modules.core.path            --value src/core
wingfoil dna remove modules                      --value core
```

| Parameter | Meaning |
|--------|---------|
| `<path>` | **Required**, and the only positional the verb reads. The FULL dotted path to the field, never a bare field name: `team.roles` (the project's role catalogue) and `team.members.<name>.roles` (one member's roles) are different fields, and both must be expressible. A segment may be double-quoted, which makes an entry whose `name` contains a `.` addressable — see *Quoting a segment* below. A second positional is refused at exit `2` naming the new grammar — the migration error for `dna set <key> <value>`. |
| `--value` | The new entry's **identity** when `<path>` ends at a collection; the new **value** when it ends at a leaf. Comma-separated where the field is a list of values. Required for `add` and for `set`; required for `remove`/`update` unless `<path>` already identifies the entry. |
| `--entry-<field>` | One option per field the entry schema declares (`--entry-description`, `--entry-path`, `--entry-email`, `--entry-roles`, `--entry-category`, `--entry-version`, `--entry-notes`, `--entry-phase`, `--entry-executes_as`), the `<field>` spelled exactly as `spec-002` spells it. Accepted by `add` and `update`. The `entry-` prefix is **required**, and is what keeps this derived namespace disjoint from the declared global flags in §2 — see the two outcomes below. |

**What an unprefixed spelling does, which is two different things.** The option set is derived from
`spec-002`'s entry schemas; §2's global flags are declared here. Where the two namespaces overlap, the
global wins silently, which is the whole reason for the prefix:

- A name §2 does **not** declare — `--category`, `--email`, `--notes` — is refused by Commander as an
  unknown option, exit `2`, nothing written.
- A name §2 **does** declare is consumed by the global instead and is never reported. Today the overlap
  is exactly one name, `version` (`TechEntry` declares it), and because `--version` is an *action* flag
  the result is a silent no-op: `wingfoil dna add stacks.technologies --value Go --version 1.22` prints
  the CLI version and exits `0` having written nothing — §1's precedence rule and `spec-005` §1's exit
  code, both working as specified. A global that merely carries a value (`--format`) or sets a boolean
  (`--verbose`) would instead swallow the value and let the command run with that field absent.

The second outcome is what the prefix removes **by construction**, for every present and future name on
both sides: §2 is amendable, so a global flag added later would otherwise silently disable an entry
field that had been writable, and a prefix applied only to the names that happen to collide would make
an option's spelling depend on §2 — adding a flag there would silently *rename* an existing option.

Two rules the shape rests on, both ratified rather than inferred:

- **Entries are addressed by `name`, never by index.** `team.members.roberto.roles` reaches that
  member's list; `team.members.2.roles` is refused. An index shifts the moment an entry is removed, so
  a path written today would address a different entry tomorrow. Name uniqueness per collection is
  therefore a schema constraint (`spec-002`), not an assumption.
- **A path that does not resolve is refused, never created** — exit `1`, naming the path (§5). Under
  add/remove/update semantics one cannot add to a collection that does not exist, and the same rule
  answers the wider question: the DNA pillar accepts unknown keys when *reading* a document and refuses
  to write one (`bug-084-dna-key-alias-writes-unschemad-keys`).

**Quoting a segment** (`dl-083-dotted-entry-names-in-paths`, ratified). Entries are addressed by
`name`, and a `name` may contain a `.` — `stacks.technologies` in this repository's own `dna.yaml`
carries `Node.js` and `Commander.js`, and `team.agents` carries `AI agent (Claude/Cursor/etc.)`. A
path segment may therefore be **double-quoted**, and a quoted segment is taken verbatim, dots
included:

```
wingfoil dna update 'stacks.technologies."Node.js".version'                   --value 22.14+
wingfoil dna add    'team.agents."AI agent (Claude/Cursor/etc.)".executes_as' --value reviewer
wingfoil dna remove  stacks.technologies                                      --value "Node.js"
```

**The two quoting layers overlap, and that is the thing a reader gets wrong.** In the first line the
**outer single quotes are the shell's** — without them the shell would eat the double quotes — and the
**inner double quotes are WingFoil's**. Both are needed. The third line is the other way round: the
double quotes there are the **shell's alone**, because `--value` never takes WingFoil quoting, and
`--value '"Node.js"'` would name an entry whose name literally begins and ends with a quote.

The rules, in full:

- a segment is quoted when it **begins and ends** with `"`; the delimiters are not part of the name,
  and inside them `.` is an ordinary character;
- quoting is **optional** where it is unnecessary: `team."members".roberto` and
  `team.members.roberto` are the same path;
- a quoted segment may **not contain `"`**, and there is **no escape sequence** — a name containing a
  double quote stays unaddressable. `dl-083` accepted that cost deliberately (no plausible technology,
  module, role or person is named that way), so the refusal says the **name** is unaddressable rather
  than that the path is malformed;
- an **unterminated** quote is a usage error at exit `2` (§5), not a name that happens to begin with
  `"`. So is a `"` no delimiter can account for, and so is an empty segment: all three are properties
  of how the argument is spelled, decided before anything is read, which is what separates them from
  the exit-`1` refusal of a path that is well-formed but resolves nowhere;
- quoting applies to the **path only**. `--value` carries an entry's identity directly and never needs
  it.

`--value`'s double duty is a convention the grammar cannot show, so it is stated here and in the
option's own `--help` text (`CoreOption.description`, `src/core/registry.ts`) rather than left to be
discovered. `dna set` is the exception that proves it: it is `update` restricted to a scalar, so its
`--value` carries only the second meaning and its `--help` says so. A `<path>` that names a collection
or a list is refused there with the verb that reaches it.

### 10. Id-pattern token values on `memory add` (`--set <name>=<value>`)

`spec-001-memory-yaml-schema`'s `id_pattern` section (as amended 2026-09-29) gives every token other
than `{n}`, `{slug}`, `{date}` and `{author}` its value from a **frontmatter field of the same name**,
and the context tokens `{workflow}`, `{phase}` and `{scope}` from the workflow engine — "from the CLI
they must be given explicitly" (`dl-107` S2 (a)+(c)). `memory add` carries those values through **one
declared, repeatable option**:

```
wingfoil memory add --type release --title "WingFoil v0.2.3" \
                    --set kind=patch --set version=v0.2.3 --set release-line=v1
wingfoil memory add --type plan --title "Dev-loop — rel-v0.2.3" \
                    --set workflow=dev-loop --set phase=rel-v0.2.3 --set scope=rl-v1/rel-v0.2.3
```

| Part | Meaning |
|------|---------|
| `--set <name>=<value>` | **Repeatable**; one field per occurrence. `<name>` is split from `<value>` at the **first** `=`, so a value may itself contain `=`. `<name>` must name a token of the type's committed `id_pattern` or `path` (other than `{id}`); the value fills that token, and `memory add` also writes it into the frontmatter field of that name, so the id and the field cannot disagree. A context token (`workflow`, `phase`, `scope`) is written only where the type's template declares a field of that name (`plan` declares `workflow` and `phase`, not `scope`); every other token is always written. |

**Why one option, not one per field, and why not `--field`.**
- `--field` is not reused: §9 retired it for DNA paths under `dl-082`, and the same spelling with a
  different meaning on a sibling noun would be a collision the grammar cannot show.
- One option per field (`--version v0.3`, `--kind patch`) is the **derived namespace** §9 had to fence
  off with the `entry-` prefix, here in its worst form: the field names come from the project's own
  `memory.yaml`, not from a WingFoil schema, and the very first one this option exists for, `version`,
  is a §2 global action flag — `--version v0.3` would print the CLI version and exit `0` having
  written nothing. A single declared name with the field inside its value keeps the two namespaces
  disjoint by construction, for every present and future field and every future global.
- It follows `dl-082`: `--type` still identifies what is created and every `--set` names an attribute
  of the action.

**Error cases.** The first five are properties of how the argument is spelled, decided before anything
is read, so they are usage errors (§5, exit `2`), each with its own message:

| Case | Message | Exit |
|------|---------|------|
| No `=`, or nothing before it | `error: invalid flag value: --set expects <name>=<value>, got "<raw>"` | `2` |
| `<name>` outside `[a-z][a-z0-9_-]*` — including a dotted name such as `release.version`, which stays undefined until `dl-090` | `error: invalid flag value: --set name "<name>" is not a field name ([a-z][a-z0-9_-]*)` | `2` |
| Blank or whitespace-only `<value>` | `error: invalid flag value: --set <name> must not be blank` | `2` |
| The same `<name>` given twice | `error: invalid flag value: --set <name> given more than once` | `2` |
| A name `memory add` fills itself or through its own option: `id`, `type`, `status`, `title`, `tags`, `n`, `slug` | `error: invalid flag value: --set cannot set "<name>": memory add fills it itself or through its own option` | `2` |
| `date`, whose value is the add commit's author date (`spec-001`'s `{date}` row) | `error: invalid flag value: --set cannot set "date": memory add fills {date} from the add commit's author date (GIT_AUTHOR_DATE, or the clock)` | `2` |
| `author`, whose value is the git author name (`spec-001`'s `{author}` row) | `error: invalid flag value: --set cannot set "author": memory add fills {author} from the git author name` | `2` |
| A well-formed `<name>` the type's committed `id_pattern` and `path` do not contain | `error: --set <name>: memory type '<type>' has no token {<name>} in its id_pattern or path` | `1` |
| An `id_pattern` token with no `--set` value | `error: missing value for token {<name>}: give it with --set <name>=<value>` | `1` |
| A value that would take the id outside `[a-z0-9-.]` (`spec-009` §1) | `error: value for token {<name>} is not a valid [a-z0-9-.] piece: "<value>"` | `1` |
| An `{author}` token whose git author name has no `[a-z0-9]` character once slugged | `error: value for token {author} is empty once the git author name "<name>" is slugged` | `1` |
| A `{date}` token while `GIT_AUTHOR_DATE` holds a date git cannot parse | `error: E_GIT_READ_FAILED: git var GIT_AUTHOR_IDENT failed in <root>: fatal: invalid date format: <value>` | `1` |

The last three depend on the committed `memory.yaml` (`dl-080` (B): a gating read at `HEAD`), which is
what separates them from the first five — the same malformed-versus-unresolvable line §5 draws for a
DNA path. A `path` token with no value keeps its existing storage refusal (exit `1`, naming the token).
There is no free-form `--id`: an id a type's pattern cannot express is `spec-001`'s per-action
`id_pattern` override on a workflow's `memory.add` action (`dl-107` S3 (a)), not a CLI option.

### 11. Which baseline each command reads

A user who is refused by one command and checks with another must be able to tell which state each
answered from (`dl-084-which-baseline-a-read-only-verb-reports-from`, `ready`, option (A)). The rule
is `spec-006-core-domain-api` §6, which is normative; this section is its per-command form, and the
CLI reference's *Git side effects* says the same to users.

| Baseline | Commands | Why |
|----------|----------|-----|
| **committed at `HEAD`** | `memory add`, `memory submit`, `memory approve`, `memory reject`, `memory deprecate`, `memory amend` (their `memory.yaml`, the document the `<id>` names and its status, and approver authority — the content `submit` and `amend` commit is the working tree's); `dna set`, `dna add`, `dna update`, `dna remove`; `directive assign`; `directive remove`'s referrer check; `workflow next` (v0.3) | a read that can refuse the command or change what it writes (`spec-006` §6 items 1–2). When the working tree defines a type the commit does not, `memory add`'s refusal says the change is not committed (`dl-084` (D), `task-095`); the `dna` verbs first refuse a `dna.yaml` that differs from `HEAD`, so what they then read is `HEAD`'s; `memory add`'s `{n}` counter reads the wider baseline the `command-baseline` directive declares, which can only raise the number |
| **committed at `HEAD`, declared** (v0.3, as each ships) | `workflow status`, `workflow list`, `workflow show`, `agent list`, `agent show` | approver ruling R15: one deduction, one baseline; a working tree that differs is reported as the warning `W_UNCOMMITTED_INPUTS`, and never decides the answer (`spec-006` §6 item 6, `spec-017` §1.2) |
| **working tree** | `dna show`, `paths`, `directives list`, `memory search`, `memory history`; `workflow list` until its v0.3 reshape | a read that gates nothing: a draft you have not committed is what `memory search` exists to find (`spec-006` §6 item 4). `memory history` reads git's log for the entries and the working tree's `memory.yaml` |
| **filesystem** | the confinement and symlink guards of every command that writes or deletes a file; `directive create`'s check that its target does not exist | the read predicts where a syscall will land, which no commit records (`spec-006` §6 item 5, `dl-086`) |
| **working tree, a defect** | `directive remove`'s lookup of the directive it is asked to delete (`bug-108`) | owed to `HEAD` |

`init` and `mcp` read no committed configuration: `init` writes the scaffold, and `mcp` starts the
server, whose Resources and Prompts follow `spec-006` §6 item 4 — except the two v0.3 workflow
Resources, which follow item 6. Before it starts, `mcp`'s pre-flight reads the working tree's
`dna.yaml` role set once, and the Prompts channel serves that set until a restart (`spec-014` §1,
`dl-049` (b)).

### 12. Command-specific flags

A flag one command declares, as opposed to §2's global flags. Each is registered on that command
only (`CoreOperation.flags`, `spec-006` §2), appears in its `--help`, and is documented in its CLI
reference entry. A command that does not declare it refuses it as an unknown option (exit `2`, §5).

| Command | Flag | Behaviour |
|---------|------|-----------|
| `paths` | `--list` | Accepted for the planned drill-down view; it does not change the output yet. |
| `directive assign` | `--force` | Authorizes the whole-file rewrite of `roles.yaml` when the in-place edit cannot apply (`dl-062` Q1 option 3). Without it that case is §6's `CONFLICT` refusal. With it the file is written again from its parsed content in the one `wf(directive): assign …` commit, and the success carries §6's warning. `--force` does not force a rewrite: an edit the in-place editor can make is made in place, with no warning. A missing `roles.yaml` is written whole without the flag, since there is nothing to preserve. |

## Consequences

- Every command implementation under `src/cli` registers global flags exactly once, on the root
  `Command`, using the negatable-boolean pattern in §3 — no per-command `noColor`/`noInteractive`
  re-implementation.
- `src/core` owns exit-code selection and error-message formatting (single behaviour shared with
  `src/mcp`, REQ-SYS-05); `src/cli` only maps `core` results onto stdout/stderr + `process.exit`.
- Any future command (`CLI-01`…`CLI-06` equivalents) inherits this grammar by construction and must not
  redefine flag names, exit codes, or the error format.
- If REQ-INT-04/REQ-INT-05/REQ-INT-08 are revised (e.g. a new global flag or exit code is added), this
  spec must be updated first — command implementations trace back to it.

## Process Notes

Cross-checked every claim against `.wingfoil/dna.yaml` (`tech_stack.cli` = Commander.js +
chalk) and `docs/02_requirements/03_sard/04_integrations.md` (REQ-INT-04, REQ-INT-05, REQ-INT-08).

**Revision (2026-09-17) — `directives` added to §1's noun list, per
`dl-041-spec-006-module-grouping-vs-core-module-name`.** The list named only the singular `directive`,
although `wingfoil directives list` (BDD `P3.4-directives-list.feature`) has shipped on the `directives`
module since `task-006`. Edited in place without a supersede or a state change (the `spec-001`
precedent `dl-041` cites).

**Revision (2026-09-21) — §2's `--reason` contract, per `dl-067-reason-trailer-contract` (`ready`),
carried out by `task-072-fix-reason-trailer-contract` (fixing `bug-042`).** The row promised the value
was "Recorded verbatim in the resulting git commit body (P1.7)" and said nothing about emptiness or
newlines, while the trailer it lands in is read and written as single lines. The row now states the
block extent, the declared normal form, and the narrow refusals, and a second row pins the
unrecordable-value messages and their exit `2`. Ratified by `dl-067`'s approve commit, whose `Reason:`
records the option chosen and the sub-decisions taken with it; edited in place without a supersede or
a state change, per `dl-047-tech-specs-carry-no-version-field` and the same `spec-001` precedent the
2026-09-17 revision cites.

**Revision (2026-09-23) — §1's noun note, §5's malformed-vs-unresolvable distinction, and the new §9
(DNA field paths), per `dl-081-dna-mutation-surface-shape` (`ready`, approve commit `5aaa5af`,
option (E)) and `task-093-dna-mutation-surface-add-remove-update`.** The grammar grew by three verbs
on the `dna` noun, and `dl-081` action 3 requires the grammar spec to record a shape rather than let
it be discovered — "a ratified shape that no spec records is the defect this whole class came from".
§9 pins the option-bearing form, `--value`'s two meanings, entry addressing by name, and the
refuse-rather-than-create rule; §5 gains the sentence separating a malformed path (exit `2`, as
`P2.1-dna-set.feature` pins it) from a path that names nothing the schema declares (exit `1`, per §5's
own kind-of-failure rule and `bug-076`'s Correction). No existing row changed. Edited in place without
a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field` and the same `spec-001`
precedent the 2026-09-17 revision cites.

**Revision (2026-09-24) — §9's per-entry options carry an `entry-` prefix, corrected in the same task
that shipped them.** The 2026-09-23 note above wrote them bare (`--email`, `--version`), which is what
`task-093` first implemented and what its review rejected: the option set is derived from `spec-002`'s
entry schemas while §2's global flags are declared, nothing kept the two namespaces disjoint, and
`TechEntry`'s `version` collided. Measured on a real project, `dna add … --version 4.0` reached
Commander's program-level `-V, --version`, printed the CLI version, exited `0` and wrote nothing,
while `--help` advertised the option as working; `--format` and `--verbose` are swallowed the same way
without even the print.

The prefix is **not** a fix for `version` in particular: it is what makes a **derived** namespace and a
**declared** one disjoint, for every present and future name on both sides. §2 is amendable, so a
global flag added later would otherwise silently disable an entry field that had been writable — and a
prefix applied only to the names that happen to collide would make an option's spelling depend on §2,
so adding a flag there would silently *rename* an existing option. Only the **spelling** of the
per-entry options changes here: `--field`, `--value`, entry addressing by name and the refusal rules
are exactly as ratified, so this corrects what §9 records rather than reopening what it decided.

`spec-002` and `spec-006` were checked for the same staleness and carry none — both mention only
`--field`/`--value`, never a per-entry option, so neither needed a correction.

**Revision (2026-09-24) — §9 is rewritten to `dl-082-cli-parameter-shape`'s grammar, and its
unprefixed-option claim is corrected.** Two changes, one ruled and one a defect, in the pass that
shipped the section.

*The grammar.* `dl-082` (`ready`) states the rule nine of the eleven `dna`/`memory` commands already
followed and no document had written down: **a parameter is positional when it identifies the target
of the command, and an option when it names an attribute of the action.** Applied here, the path
leaves `--field` for a positional `<path>` on `add`/`remove`/`update`, and `dna set`'s second
positional — the value, an attribute in positional clothing — becomes `--value`. Everything `dl-081`
ratified about *semantics* is untouched: entries addressed by name and never by index, a path that
does not resolve refused rather than created, uniqueness as a prerequisite, and `--value` meaning the
entry's identity at a collection and the new value at a leaf. §1's noun note is respelled to match.
`dna set` losing a positional is a **breaking change to a shipped command**; it lands before
`minor-v0.2` is published, must appear in `CHANGELOG.md` (the `user-docs` phase owns it), and
`P2.1-dna-set.feature` still shows the old spelling — `bug-089` rewrites those scenarios and is
sequenced after this, so they are written once.

*The defect.* The 2026-09-23 note's option row ended "an unprefixed spelling is an unknown option
(exit `1`), never a silent no-op". Measured against the build that shipped it,
`wingfoil dna add --field stacks.technologies --value Go --version 1.22` printed `0.1.0` and exited
`0` having written nothing: the sentence was false for the very field §9 uses as its worked example,
and false again for any name §2 declares that carries a value or sets a boolean. The *behaviour* was
correct and specified — §1 gives a global precedence, `spec-005` §1 gives `--version` exit `0` — and
only the claim was wrong, which is worse than a wrong behaviour because nothing goes red. The test
that pinned it drove `--category`, one of the names for which the sentence does hold, so the criterion
was verified where it could not fail. §9 now states both outcomes and names the overlap (today exactly
`version`), and `test/cli/derived-option-namespace.test.ts` derives that overlap from the built
program and drives every member of it.

Edited in place without a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`
and the same `spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-24) — §9 gains the quoted-segment rule, and §5 names the two usage errors it adds,
per `dl-083-dotted-entry-names-in-paths` (`ready`) and `task-099`.** `dl-081` made an entry's `name`
the key it is addressed by, which made two properties of `name` load-bearing: uniqueness, and
expressibility inside a dotted path. The 2026-09-23 revision recorded the first; only `bug-091` noticed
the second, and its first ruling — forbid dots in `name` — was given against a claim that no such entry
existed. Measured at `c2102c87`, three do, in this repository's own `dna.yaml`: `Node.js` and
`Commander.js` in `stacks.technologies`, `AI agent (Claude/Cursor/etc.)` in `team.agents`. A dot
refinement attached where `uniquelyNamed` is attached would have rejected that file **on read**, taking
`dna show`, `paths` and every DNA-reading command with it.

So the grammar carries the cost instead. Quoting stays optional where it is unnecessary and `--value`
is untouched — but this is **not** a change under which every existing path keeps its meaning. Before
the rule, `"` was an ordinary character inside a segment; under it every `"` is a delimiter, so any
path containing one is narrowed. Two measured consequences, neither hypothetical:
`isValidKeyPath('modules.co"re')` was `true` and is now `false`; and where a collection carries an
entry named `"a"` beside one named `a` — the schema permits both, `uniquelyNamed` included —
`stacks.technologies."a".category` resolved to the quote-named entry before and resolves to the
**other** entry now, silently rather than by refusing. `dl-083` accepts that narrowing deliberately
(a name containing `"` becomes unaddressable, with no escape sequence); what it does not do is make
such names impossible, so this is a consequence to know about rather than one to be surprised by —
and a grammar contract is where the next reader will look for it.

What is new is a spelling that reaches names the schema has always permitted,
two usage errors at exit `2` (an unterminated quote; a `"` no delimiter can account for — the latter
refused as an **unaddressable name**, because there is no escape sequence and `dl-083` accepted that),
and the shell-versus-WingFoil quoting overlap stated outright, since the examples are unreadable
without it. `test/dna/path-quoting.test.ts` holds the grammar and carries the three live names as a
fixture, so the dot ban cannot be reintroduced without a failing test.

**Revision (2026-09-24) — §9's unprefixed-option outcome is `2`, not `1`: Commander's own parse errors
now reach §5's table.** §5 has always assigned exit `2` to "unknown command/flag", and the shipped CLI
honoured it only for the errors WingFoil itself raised. Commander detects an unknown command and an
unknown option before any WingFoil code runs and terminated through its own `process.exit(1)`, so
those two classes reported `1` — §5's code for a *valid* invocation whose operation failed. `bug-098`
files the gap and `task-101-route-commander-parse-errors-through-the-exit-code-contract` closes it, by
routing every Commander termination through `exitCodeForParseOutcome` (`src/core/exit-code.ts`), the
same module `task-012` made the single decision site.

Only §9's first unprefixed-option bullet changes text: it recorded the measured `1`, and the measured
value is now `2`. §5's table needed no change — it already said what the CLI now does. The second
bullet is untouched: a name §2 *does* declare is still consumed by the global and still exits `0`,
because `--version` is a successful termination and not a parse error. A noun invoked with no verb
(`wingfoil dna`) kept its exit `1` with help on stderr through this revision; that is Commander's
`commander.help`, not one of its errors, and whether §5 and `spec-005` §1 should claim it was a
separate question this revision did not answer — it is `bug-103`, answered by the revision below,
which is what §5 now says. The closest-match suggestion §1
asks for is likewise untouched: the binary emits Commander's own `(Did you mean memory?)` rather than
`spec-005` §3.1's `hint: ` line, which is `bug-104`. This revision changes exit codes only.

Edited in place without a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`
and the same `spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-25) — §5 settles what a missing verb is, per `bug-103` and
`task-103-a-missing-verb-exits-2-with-an-error-line`.** §5's exit-`2` row has always read "unknown
command/flag, missing required argument, invalid `--format` value", and a *missing* verb is arguably
the second of those and arguably a case of its own. That ambiguity is what made the revision directly
above leave `wingfoil dna` at exit `1`: a judgement, because the table could be read either way, and
one that left the shipped CLI breaking `spec-005` §1 twice at once — a malformed invocation reporting
`1`, and a non-zero exit carrying no error message at all. §5 now names the case in both directions —
a noun without its verb is a missing required argument (exit `2`, with an `error: ` line), an explicit
`wingfoil help` is a success (exit `0`) — and `spec-005` §1's Rules carry the same sentence, since the
two tables state one contract.

The distinction is not one an argument parser draws for free. Measured on commander@15.0.0, both cases
terminate through the *same* non-error identifier, `commander.help`, and are separated only by the
exit code it suggests alongside it: `1` where `Command#help({ error: true })` was reached because there
was nothing to run, `0` where the user asked. `wingfoil dna` → `error: missing required argument:
wingfoil dna <command>` (superseded on 2026-10-05 by `task-179`: `missing required argument: <command>`,
then `hint: usage: wingfoil dna <command>`); `wingfoil help nosuchnoun` → `error: unknown command 'nosuchnoun'`, the line
`wingfoil nosuchnoun` already emitted. The `hint: ` suggestion §1 asks for is still absent from both,
and still `bug-104` (which `task-179` closed for the unknown-command line; the `help <unknown>` path is
`bug-115`'s); this revision changes exit codes and adds error lines, and the wording of that
suggestion is not its to pick.

§9's unprefixed-option bullets are untouched, and so is the second bullet of the revision above: a
name §2 *does* declare is still consumed by the global option and still exits `0`.

Edited in place without a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`
and the same `spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-29) — the new §10, `memory add`'s `--set <name>=<value>`, per
`dl-107-slug-keeps-version-dots` (`ready`, options S1 (a), S2 (a)+(c), S3 (a)) Action 2, carried out by
`task-110-memory-add-keeps-version-dots-and-sources-every-id-token`.** `spec-001`'s 2026-09-29 revision
gives every `id_pattern` token a declared source and leaves the option that carries a frontmatter
field's value on the command line to this spec, with one constraint: not `--field`, which §9 retired
under `dl-082`. §10 names it `--set`, states its repeatable `<name>=<value>` shape and its error cases,
and records why one declared option was chosen over a derived option per field — the `version` field
this exists for is a §2 global action flag, so the derived form would reproduce, for the first field it
served, the silent `--version` no-op §9's 2026-09-24 revisions measured. No existing section changes:
§2's globals, §5's table and §9 are untouched, and §10's exit codes are §5's rows applied. Written by
the implementing task ahead of the approver's sign-off at its review gate; until that sign-off it is a
proposal carried in the task branch, not a ratified revision. Edited in place without a supersede or a
state change, per `dl-047-tech-specs-carry-no-version-field` (tech-specs carry no `version:` field, so
there is nothing to bump) and the same `spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-29) — §4's non-TTY row names the allowed values of a closed-set argument, per
`task-119-init-names-its-templates-and-a-real-remedy` (`bug-140`).** `init`'s missing-template error
now ends with ` (one of: Scrum, Kanban)`, built from the template registry (`TEMPLATE_NAMES`), so a
new template appears without editing the message. The row keeps `missing required argument:
--<name>` as the prefix, so every existing reader of the message still matches, and adds the suffix
for arguments whose values are a closed set. Exit code unchanged (`2`). Edited in place without a
supersede or a state change; signed off by the approver with `task-119`'s approval at its review
gate.

**Revision (2026-09-29) — §Context no longer names `chalk`, per
`task-117-remove-the-unused-anthropic-sdk` (`bug-138`, approver's ruling at its review).** Nothing in
`src/` imports `chalk` (`grep -rn chalk src/` → only a TSDoc line), and `task-117` removes it from
`package.json`. One word in §Context changes; the Process Notes' cross-check sentence is left as the
record of what was checked then. Edited in place without a supersede or a state change, per the same
`spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-30) — §2 gains the Memory commit subject grammar, per
`dl-079-wf-commit-verbs-outside-the-declared-grammar` (`ready`, option (A), approve commit
`3262ad92`), carried out by `task-126-declare-closed-wf-operation-grammar-bracket-set-state` (fixing
`bug-155`).** `spec-003`'s verb table sends the subject grammar and its parser here, and no section
declared them: §2 named only the `--reason` body. The new subsection lists the ten verbs and each
verb's bracket. The list matches `spec-003`'s table row for row. It also states the `set_state` rule
and the chain reading of a bracket (`bug-155`), and it records `dl-061` B.1's convention for a
`sync` that crosses a reject edge. It names the subjects that are not Memory operations, including
`wf(dna)`, which `spec-003` did not list but whose `add` token would otherwise read as one. It
settles `spec-003`'s open item on `element.set_release` as the approver ruled it at
`release-planning` (R20, Q6): the token is rebound to a declared verb. The verb chosen is `amend`,
and the subsection gives the reasons. That choice is the implementing task's and awaits the
approver's confirmation at its review. `src/memory/audit.ts` reads the grammar
(`parseMemoryOperation`, `verifyTransitionConsistency`). No section outside §2 changes. Edited in
place without a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field` (there is
no `version:` field to bump) and the `spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-30) — §1 states that `[args]` is at most one positional, that a surplus operand is
exit `2`, and that the transition verbs take one id per call, per `dl-082-cli-parameter-shape`
(`ready`) and `task-129-refuse-operand-beyond-command-declares-exit-2-before` (`bug-171`,
`bug-131`).** `dl-082` gave each command at most one positional, but only `dna set` refused a second;
every other command acted on the first operand and dropped the rest at exit `0`, and a command
declaring none accepted any. On this repository `memory approve <bug-169> <bug-170> --reason …`
approved the first, left the second `open`, and exited `0`. §1 now records the refusal and its two
message shapes. Every command except the four DNA path verbs refuses at command registration, before
the root is resolved. The DNA path verbs refuse inside the operation and keep their own ordering:
root resolution first, then §9's malformed-path rule (`P2.1-dna-set.feature`), then the surplus.
Their migration wording is unchanged. §1 states that exception precisely. The independent review
found the first wording overclaimed "enforced once, before anything is read". §5's exit-`2` row, the
single source of truth for exit codes, names the new case, so that it stays in step with
`spec-005-cli-command-contract` §1 (the same pairing `task-103`/`bug-103` kept). The multi-id subject
form is marked historical because the choice `bug-171` put — refuse or batch — was taken as refuse;
the commit grammar itself is `dl-079`'s. No other section changed.
Edited in place without a supersede or a state change, per the same `spec-001` precedent the
2026-09-17 revision cites.

**Revision (2026-10-01) — `element.set_release` emits `assign`, per the approver's ruling of
2026-10-01, carried out by `task-126` at its review.** The ruling reverses `release-planning`'s R20/Q6
on this point. The 2026-09-30 revision above rebound the token to `amend`, as R20 asked, but the
independent review found that this conflicts with `amend` as `dl-108`/`task-127` define it.
`amend` is approver-gated and amendability is per type (no `adr`), while `release-planning`'s
`build-backlog` runs as `product-owner`, with no approval, and stamps `adr` elements too. `assign`
therefore joins the closed list as the eleventh verb. It writes only `release`, may be used on every
type, never changes `status`, carries no `Approver:` and has no bracket. Its subject is the canonical
form history already has. The `amend` row loses `element.set_release`, and `assign` leaves the list of
undeclared practised verbs. Edited in place without a supersede or a state change (`dl-047`).

**Revision (2026-10-01) — `memory amend` ships, per `dl-108` (`ready`; A1 (a), A2 (i), A3) and
`task-127-add-memory-amend-id-reason-approver-gated-verb`.** §2's `amend` row already named the verb
and its `[s → s]` bracket (`task-126`). §2 now also states what the command does, its commit, and its
refusals, in the paragraph after the `set_release` rule. The `--reason` row lists `memory amend` among
the commands that require it, and §1's one-id rule names it. The per-type key is `spec-001`'s, and
the fields the verb owns are `spec-010`'s. No other section changed. Edited in place without a
supersede or a state change (`dl-047`); pending the approver's sign-off at `task-127`'s review.
At the review (2026-10-01): an amendment may not change `release`, `rejection_reason` or `supersedes`
either (approver ruling (b)). It must keep `spec-010`'s required fields non-empty past the initial
state (review F1). Authority is checked as soon as the document is located (review F6). The
paragraph above states all three.

**Revision (2026-10-01) — §6 defines the `hint` and `details` slots and says the shape covers the
argument parser's refusals, per `task-130` (`dl-055` option 1, ratified `b410c09f`, whose Actions name
this section; `bug-114`).** §6 defined only `{"error": "<reason>"}`. `spec-005` §3 now owns the
details rule and the parse-path rule, so §6 names the two optional fields and points there rather than
restating them. Edited in place without a supersede or a state change, per
`dl-047-tech-specs-carry-no-version-field`.

**Revision (2026-10-01) — §2's `--reason` grammar, per `dl-070-narrow-reason-block-terminator` (A)
with S3 and S4, `dl-078-should-reason-refuse-c0-control-characters` (A) and
`dl-111-tool-signature-in-commits` Q1 (A), all `ready`, carried out by
`task-166-settle-reason-block-grammar-shape-rule-terminator`.** The unrecordable-value row gains a
fourth case (a C0 control character other than tab and newline, named by code point), names
`WingFoil-Version:` among the reserved trailer keys and matches all three in any letter case (the
task's review), and gives the trailing-paragraph refusal its remedy. A new note states the
terminator rule the `--reason` row had left to the implementation, and where it differs from git's.
Edited in place without a supersede or a state change (`dl-047`); recorded with `memory amend`.

**Revision (2026-10-01, `task-170-give-service-set-up-release-field-name-own`) — `release` is
reserved where the scaffold declares it.** Per the approver's ruling of 2026-10-01 (`bug-166`, option
(A)), §2's amend paragraph says that `release` is reserved only on a type whose scaffold committed at
`HEAD` declares a `release` field (`spec-010` § Field-write ownership). Edited in place without a
supersede or a state change (`dl-047`).

**Revision (2026-10-01, `task-161-revise-command-baseline-which-verbs-read-head-filesystem`) — the
new §11 lists which baseline each command reads, per `dl-084-which-baseline-a-read-only-verb-reports-from`
(`ready`, options (A) and (D)) Action 2 and approver ruling R15.** `dl-084` asked that `spec-008` and
the CLI reference record, once, which commands answer from `HEAD` and which from the working tree, so
that the next command added does not rediscover it. §11 is that list, per command; `spec-006` §6,
edited in the same task, is the normative rule it applies. Its defect row records the gating reads
the shipped code still makes on the working tree (`directive remove`'s lookup, `bug-108`; the
transition verbs' document lookup and `memory submit`'s status read, found at the task's
independent review), so the list describes the code rather than the rule. No other section changed. Edited in place
without a supersede or a state change (`dl-047`); recorded with `memory amend`.

**Revision (2026-10-02, `task-169-make-directive-assign-refuse-whole-file-rewrite-unless`) — a home
for command-specific flags, the `directive assign --force` contract, and the warning format, per
`dl-062-roles-yaml-unwritable-fallback` (`ready`; Q1 option 3 with the flag `--force`, approve
`4cd1876`; Q2 option 1).** `dl-062`'s scheduling addendum §3 found that §2 claims to list flags
"accepted by every command" and so could not hold `--force`, and left the replacement home to this
spec. The new §12 lists command-specific flags, `--force` and `paths --list` (the one such flag that
already shipped). §2's lead line now names `--reason` as its one shared, non-global exception and
points to §12. §6 gains the two pinned refusal strings `dl-062` asks for (the `CONFLICT` reason, in
the wording task-169 gives it, and Q2's `global`-binding wording as ratified) and the warning format
of a successful command, which is `spec-016` §3.4's, applied to every command. Under `yaml` each
warning is closed by `...` so that an error after it stays a separate document. §6 also notes where it
departs from `spec-005` §3.2 until task-218 amends that spec. No other section changed. Edited in place
without a supersede or a state change (`dl-047`).

**Revision (2026-10-02, `task-247-decide-every-memory-transition-from-the-element-s-committed-status-and-resolve-its-document-at-head`)
— §11's "working tree, a defect" row no longer lists the Memory transition verbs, per `bug-187`.**
`memory submit`, `approve`, `reject`, `deprecate` and `amend` now find the document their `<id>`
names, and read its current status, at `HEAD` (`spec-006` §6 item 1); a document no commit holds is
refused at exit `1` with a message naming `memory add`. The row keeps `directive remove` alone
(`bug-108`), and the `HEAD` row names what the verbs read there. No other section changed.

**Revision (2026-10-02, `task-162-fire-supersedes-trigger-superseding-element-approval`) — the
`supersedes:` trigger emits `finalize`.** `dl-065` (`ready`, Q1.1) asks for an engine trigger that
moves a superseded element into `superseded` when its successor is approved. The move needs a
subject. It is a `set_state` into the last state of the type's `sequence`, which this section already
maps to `finalize`. The `finalize` row names the trigger, and a paragraph gives the commit. No verb is
added, so `spec-003`'s verb table is unchanged. Edited in place without a supersede or a state change
(`dl-047`); pending the approver's sign-off at `task-162`'s review.

**Revision (2026-10-02, `task-163-implement-date-author-id-tokens-edit-frontmatter-through`) — §10's
refusal of `--set date` and `--set author` says where the value comes from.** The shared refusal said
`memory add` fills both names itself, which was false while neither token was implemented
(`bug-158`). `task-163` implements them (`spec-001`'s `{date}` and `{author}` rows), and the two names
keep their exit-`2` refusal, each with its own message naming its source: `GIT_AUTHOR_DATE` is how a
caller chooses the date, since a `--set date` would let the id disagree with its own commit. The
other reserved names keep the shared message. The error table also gains the two exit-`1` failures
the tokens add: an author name that slugs to nothing, and a `GIT_AUTHOR_DATE` git cannot parse. No
other section changed.

**Revision (2026-10-05, `task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap`) — §1
names `mcp` among the flat commands and says what a bootstrap command is, per
`dl-046-bootstrap-commands-in-spec-006-section-3` (`ready`; A(a), B(a), C), `bug-028`, `bug-179` and
`bug-204`.** `wingfoil mcp` has shipped since `task-030`, and §1's grammar comment and `<noun>` bullet
named only `init`, `paths` and `audit`. Both now list `init`, `mcp`, `paths`, `audit`, the same four
`spec-005`'s Context and `spec-006` §3 list, and the bullet says that `init` and `mcp` are wired outside
`CORE_MODULES`, are not on MCP (REQ-SYS-05's bootstrap exemption), and obey this grammar like every
other command. The surplus-operand rule now holds for them in its own wording: they refused a surplus
at exit `2` in Commander's words (`too many arguments for 'init'`), and give the shared refusal since
`task-165` (`bug-179`). `test/docs/command-surface-specs.test.ts` fails when a flat command the program
registers is missing from §1. Two stale names are corrected (`bug-204`): §Context's `tech_stack.cli` is
now a `stacks.technologies` entry (`spec-002` retired `tech_stack`), and the Consequences name
`src/mcp`, the `mcp-server` module's path, instead of a path with the module's name, which never
existed. The Process Notes keep `tech_stack.cli`, the key `dna.yaml` had when the spec was
cross-checked. No exit code and no other
rule changed. Edited in place without a supersede or a state change (`dl-047`).

**Revision (2026-10-05, `task-156-state-what-format-console-prints-today-until`) — §2 states what
`console` prints today and that the colour switches change nothing, per `bug-152` and `bug-203`.**
The `--format` row promised colour and `✓`/`⚠`/`✗` prefixes, and the `--color` row a colour that
`--no-color` and `NO_COLOR` turn off; on success the CLI prints `json`'s payload indented by two
spaces (errors and warnings keep §6's `error:`/`warning:` lines), and writes no escape sequence. The
approver's planning ruling of 2026-09-30 (R20) fixes this in the documents only and leaves the
rendering to `dl-043`, deferred to v0.4 with P5.1.4. The two rows now say so, and keep the colour and
`NO_COLOR` rules as the contract that rendering must honour; the `--color` row also notes that
Commander honours `NO_COLOR` but not `--no-color`. §3 says
nothing reads the colour check yet, and its example carries the `--help` text the CLI prints. No
other section changed. Edited in place without a supersede or a state change (`dl-047`).

**Revision (2026-10-05, `task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin`) — §2's
`--version` row, the normal form, and the build signature, per `dl-111-tool-signature-in-commits`
(`ready`; Q2 (a), Q3 (i), Action 2) and `bug-051-commit-cleanup-never-pinned`.** `--version` prints
`<semver> (<sha>)`. The normal-form note said `git commit -m` applies `cleanup=whitespace`, which held
only under git's default configuration; the commit primitive now passes `--cleanup=whitespace`, and
the note says so. A new note states the `WingFoil-Version:` trailer paragraph every commit ends with. Per the approver's rulings of 2026-10-05, `-dirty` counts only changes to the build inputs (D4 (c)), and `memory history` reports `wingfoil` on every entry, `null` without the trailer (D5).
No exit code and no other rule changed. Edited in place without a supersede or a state change
(`dl-047`).

**Revision (2026-10-05, `task-174-settle-mcp-prompts-contract-server-preflight-answer-tools`) — §11
names `mcp`'s start-time read.** Per `dl-049` (b), `wingfoil mcp`'s pre-flight reads the DNA role set
from the working tree's `dna.yaml` once and hands it to the server, whose Prompts serve that set until
a restart (`spec-014` §1, `spec-004` §3.1). §11's sentence on `init` and `mcp` now names that read. The
baseline of every Resource and Prompt read is unchanged. Tech-specs carry no `version:` field
(`dl-047`); edited in place without a supersede or a state change.

**Revision (2026-10-05, `task-173-add-whole-project-typecheck-clean-gate-control-character`) — §2's
`--reason` control-character case extends past C0, per `dl-078`'s Amendment of 2026-10-01 (the
approver's ruling at the triage of `bug-185`).** DEL (`U+007F`), the C1 controls (`U+0080` to
`U+009F`) and the Unicode line and paragraph separators (`U+2028`, `U+2029`) are refused like the C0
controls other than tab and newline, with the same message, naming the first one by code point. No
exit code, message or other rule changed. Edited in place without a supersede or a state change
(`dl-047`).

**Revision (2026-10-05, `task-179-give-missing-operand-unknown-command-errors-shape-spec`) — one shape
for the usage refusals a user meets first, per `bug-104`, `bug-168`, `bug-180` and `bug-226`.** §1's
unknown-command bullet now says what the suggestion is: `spec-005` §3.1's `hint:` line, matched at the
level the token was typed, computed by WingFoil at the distance this bullet names, instead of the
argument parser's own suffix (`bug-104`). §1 drops the DNA path verbs' surplus exception: they refuse a
surplus where every other command does, before the root is resolved, with the migration hint each
declares (`bug-180`); `P2.1-dna-set.feature`'s malformed-path scenario is written with `--value`, as §5
already wrote it. §1 gains the missing-operand bullet and the order of usage checks, which the two
bootstrap commands now follow too: they checked the operand count before `--format`, and `mcp` let an
invalid `--format` through (`bug-226`). §4 states the one missing-positional form (`bug-168`), which
had been `memory submit <id>` for the Memory and directive verbs and `wingfoil dna set <path> --value
<value>` for the DNA verbs. A noun invoked without its verb takes the same form, which supersedes the
wording `task-103` ruled in the 2026-09-25 revision (`missing required argument: wingfoil dna
<command>`), for the approver to confirm at the review gate. Three exit codes change, all
toward `2` and all because a usage check now runs before something that used to fail first: the
operand checks (a surplus, then a missing required operand) run before the project root is resolved,
so from a subdirectory or outside a repository `memory submit` or `dna set` with no operand, and
`dna set project.name bogus --value y`, exit `2` instead of `1` (`E_NOT_AT_GIT_ROOT` /
`E_NO_GIT_ROOT`); and the bootstrap commands check `--format` first, so `wingfoil mcp --format bogus`
exits `2` instead of starting the server (`0`) or refusing an uninitialized project (`1`), and
`wingfoil init --format bogus` outside a repository exits `2` instead of `1`. Each is the code §1
already assigns to a malformed invocation; no rule of the exit-code table changed. Edited in place without a
supersede or a state change (`dl-047`).
