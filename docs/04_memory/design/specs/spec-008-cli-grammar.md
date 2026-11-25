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
wingfoil [global-flags] <noun> [args] [flags]              # flat command: `init`, `mcp`, `paths`, `capabilities`, `verify`, `audit`
```

- `<noun>` is a pillar namespace (`memory`, `dna`, `directive`, `directives`, `workflow`, `agent`) or a
  flat command (`init`, `mcp`, `paths`, `capabilities`, `verify`, `audit`). `init` and `mcp` are the **bootstrap commands**: they
  are not `CORE_MODULES` operations but are wired directly onto the program (`src/cli/program.ts`),
  because `init` runs before a WingFoil configuration exists and `mcp` hosts the MCP surface itself
  (`spec-014-mcp-server-entry-point` §1). Neither is exposed on MCP (REQ-SYS-05's bootstrap exemption,
  `dl-046-bootstrap-commands-in-spec-006-section-3` A(a)), and both obey this grammar: global flags,
  the at-most-one-positional rule below, and §5's exit codes. `paths`, `capabilities` (`spec-019` §1, from
  `minor-v0.4`) and `verify` (`spec-020` §2, from `minor-v0.4`) are self-named `CORE_MODULES` operations, and `audit` is planned as one (BDD `P5.1.3-audit.feature`, `dl-046` B(a)). The DNA pillar's verbs are `show`, `set`, and the three
  mutation verbs `add`, `remove` and `update` (§9) — the collection they act on travels in their
  `<path>` argument, not in the verb name, so the verb list does not grow as `spec-002`'s schema does
  (`dl-081-dna-mutation-surface-shape`). The Directives pillar deliberately exposes two nouns —
  singular `directive` (`create`, `assign`, `remove`) and plural `directives` (`list`) — each the
  `CoreModule.name` its operations register under (`spec-006-core-domain-api` §3 `module` column,
  `dl-041-spec-006-module-grouping-vs-core-module-name`). The Workflow pillar's verbs are `spec-017` §7's: `start <name>`, and
  `end`, `next`, `status`, `finalize`, `list`, `show`, `create`, `remove` — and, from `patch-v0.3.1`, `adopt`
  and `rekey` (`spec-017` §7.11–§7.12, `dl-187`), and from `minor-v0.4` `tree` (`spec-017` §7.13) — each instance or workflow
  named by a positional `<ref>` (a workflow name or an open instance id, `spec-017` §3.3) where it takes
  one; there is no `--name` option. `workflow start` also takes `--element <type>:<id>` (§7), `--title`
  and `--set phase=<v>` / `--set scope=<v>` (§12).
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
  `spec-006-core-domain-api` §2). The argument parser's built-in `help` command is not a command this rule
  counts operands of: its operands are a command path, walked as §8 states.
- **A missing required operand** is refused at exit `2` in one form for every command:
  `missing required argument: <name>`, with the command's usage on `spec-005` §3.1's `hint:` line
  (§4). It is enforced where commands are registered too, right after the surplus check.
- **One order of usage checks.** Every command, the bootstrap ones included, checks in this order: the
  global `--format` value — it decides how every later error is rendered, so an invalid one is refused
  first, in console text (`spec-005` §2); then the operand count, a surplus before a missing operand;
  then a blank `--project` value (exit `2`, §2); then the project root (`E_NOT_AT_GIT_ROOT`, `E_NO_GIT_ROOT`,
  exit `1`) — the directory `--project` names, or the current directory without it; then the operation's own
  checks. A command that reads no project — `capabilities` (`spec-019` §1, `spec-006` §2 `readsProject: false`) —
  keeps every check up to the blank-`--project` refusal and stops there, like `--help` and `--version`: it skips
  the root step, so a non-blank `--project` is accepted and not checked, whatever directory it names, and the
  command runs outside every git repository. `verify`'s own checks come after the root step, in `spec-020` §2.2's
  order: a blank `--base` or `--introduced-at` (exit `2`), then `HEAD`, `--base` and `--introduced-at`, each resolved
  as a revision (§6).
- **One id per call.** The Memory transition verbs (`memory submit`, `approve`, `reject`, `deprecate`),
  `memory amend`, `memory park` and `memory history` act on exactly one document per invocation;
  transitioning several documents takes one invocation, and one commit, each. The multi-id commit subject `wf({type}): {verb} {id1},
  {id2}, ...` is **historical only**: it records batch operations written by hand before the verbs
  shipped, and no command produces it.

### 2. Global flags

Accepted by every command, in any position, per REQ-INT-04/REQ-INT-05/REQ-INT-08. Four exceptions
have rows that name the commands that take them: `--reason`, a flag several `memory` verbs share,
`--dry-run`, which every command that writes takes, and `--co-author` and `--ai-model`, which every command
that writes takes but `agent execute` (`spec-018` §1.1). A flag a single command declares is not listed
here: it is in §12.

| Flag              | Type                   | Default   | Behaviour                                                                                             |
|-------------------|------------------------|-----------|---------------------------------------------------------------------------------------------------------|
| `--help`, `-h`    | flag                   | —         | Print context-sensitive help (synopsis, args, flags, example) and exit `0`. Takes precedence over all other flags. |
| `--version`       | flag                   | —         | Print the build stamp `<semver> (<sha>)` and exit `0`: `package.json`'s `version`, then the commit the running `dist/` was built from as `dist/build-info.json` records it, as the full hex object name (`<sha>-dirty` when `git status --porcelain` lists a change, tracked or untracked, under a build input — `src/`, `package.json`, `package-lock.json`, `tsconfig*.json` or the record's writer `scripts/write-build-info.cjs` — so it means "this `dist/` does not match the sha", and a change elsewhere (documentation, Memory) does not set it; `unknown` when no record exists, when the build could not read git, or when the record's commit is malformed or not a hex object name) — the value of every commit's `WingFoil-Version:` trailer (`dl-111` Action 3). Takes precedence over all other flags except `--help`. |
| `--format <fmt>`  | `console\|json\|yaml`  | `console` | Output encoding. `console` for humans; `json`/`yaml` for scripting/CI (REQ-INT-05). **Today, on success, `console` prints the payload `json` prints, indented by two spaces, with no colour** (errors and warnings keep their §6 `error:`/`warning:` lines): its human rendering (colour, `✓`/`⚠`/`✗` prefixes) is P5.1.4's, and how it is built is `dl-043`'s decision, deferred to v0.4. That change will alter the default output, so a script passes `--format json`. Some commands already have console text of their own, because their spec defines it — `agent show` prints `key: value` lines (`spec-016` §6), `agent list` its sections (`spec-016` §5), and `workflow next`, `status`, `start`, `end` and `finalize` theirs (`spec-017`) — through `CoreOperation.renderConsole` (`spec-006` §2). The readers of a workflow deduction — `workflow next`, `workflow status` and `agent list` — print the answer alone on stdout under every format: each diagnostic of the payload's `diagnostics` is also a success warning on stderr (§6, `dl-176` (a)), and the console text holds no diagnostic and no count of them. An unsupported value exits `2` with `error: invalid --format value "<value>"`. |
| `--reason <text>` | string                 | —         | **Required** on approval-gate commands (`memory approve`, `memory reject`, `memory amend`), on `memory park`, and from `patch-v0.3.1` on `workflow adopt` (except `--plan` alone) and `workflow rekey` (`spec-017` §7.11–§7.12); optional elsewhere (e.g. `memory deprecate`). Recorded in the resulting git commit body (P1.7) as a `Reason:` **block** — the remainder of the `Reason:` line plus every following body line, up to (exclusive) git's trailing trailer paragraph or the end of the body — in the **declared normal form**, not as the raw argument (`dl-067-reason-trailer-contract`; see the Notes). Omitted where required exits `2` with `error: missing required argument: --reason` (ground-truth BDD `P1.7-memory-approve.feature`). |
| `--reason` (unrecordable value) | —        | —         | A reason that cannot be recorded faithfully in the trailer is refused at the CLI boundary with exit `2`, before anything is read or written, on **every** verb that takes the flag — `memory deprecate` included, where the flag is optional but a declared-and-empty value is still a usage error (`dl-067` S2). Six cases, judged in this order on the declared normal form, each with its own message, none of them `missing required argument: --reason` (which answers the *omitted* case above): blank or whitespace-only → `error: invalid flag value: --reason must not be blank`; a C0 control character other than tab (`U+0009`) and newline (`U+000A`), DEL (`U+007F`), a C1 control (`U+0080` to `U+009F`) or a Unicode line or paragraph separator (`U+2028`, `U+2029`) → `error: invalid flag value: --reason must not contain a control character other than tab or newline (found U+XXXX)`, naming the first one by code point (`dl-078` (A) and its Amendment of 2026-10-01; a carriage return is not refused, because the normal form has already turned it into a newline); a reason that states nothing — the whole text one placeholder token, `<` then no `<`, `>` or line break, then `>` (`<the reply>`, a command template copied with its placeholder left in), or text holding no word, no Unicode letter or digit (`...`, `-`) — → `error: invalid flag value: --reason must state a reason: it holds no word, or only a <placeholder>` (`bug-498`, from `minor-v0.4`; judged by shape, not against a list of words, as the other cases are); a line starting with one of the **reserved trailer keys** `Approver:`, `Reason:` or `WingFoil-Version:`, in any letter case (git reads trailer keys case-insensitively) → `error: invalid flag value: --reason must not contain a line starting with "Approver:", "Reason:" or "WingFoil-Version:"` (`dl-111` Q1 (A) reserves the third); on a command that writes an `Approver:` line — `memory approve`, `reject`, `amend`, `workflow finalize` on a phase that declares `approval:`, `workflow adopt --plan --apply`, `workflow rekey` — also a line starting with `Co-Authored-By:` or `AI-Model:`, in any letter case, because an approval never carries an agent trailer (`spec-018` §3.3) → `error: invalid flag value: --reason must not contain a line starting with "Co-Authored-By:" or "AI-Model:" on an approval`, judged after the reserved keys; a final paragraph made entirely of `Key: value` lines → `error: invalid flag value: --reason must not end in a paragraph of "Key: value" lines; add a closing sentence after it, or fold those lines into prose` (`dl-070` S4). |
| `--dry-run`       | flag                   | `false`   | Taken by **every command whose operation is registered `mutates: true`** (`dl-106` W2) — today `memory add`, `submit`, `approve`, `reject`, `deprecate`, `park`, `amend`; `dna set`, `add`, `update`, `remove`; `directive create`, `assign`, `remove`; `workflow start`, `end`, `finalize`, `create`, `remove`, `adopt`, `rekey` (from `patch-v0.3.1`); `agent execute` — and by no other: on a read command, `init` or `mcp` it is an unknown option (exit `2`, §5). It is placed after the verb, like the command's own options. The command runs every read, check and refusal the real run would, then, instead of writing, prints the commit it would make and exits `0`: on success the payload is `{dryRun: true, subject, message, paths, diff}` — the commit subject (the transition, in the bracket a gated verb's subject carries), the full message the commit would record (its `Reason:`/`Approver:` body and the `WingFoil-Version:` trailer included), the root-relative paths it would contain, sorted, and the unified diff of those paths from `HEAD` to the blobs it would commit (`--- a/<path>`/`+++ b/<path>`, `/dev/null` for a created or deleted file). The new blob is computed by git in the repository under the operator's environment, so the conversion the commit applies (`core.autocrlf` at any configuration level, `.gitattributes` `eol`/`text`/`filter`) is applied to it; it is written to a temporary object directory outside the repository, never to the repository. The hunks are a blob-to-blob diff with every hunk-shaping key pinned to git's default by `-c`, over every configuration level (`diff.context=3`, `diff.interHunkContext=0`, `diff.indentHeuristic=true`, `diff.suppressBlankEmpty=false`, `diff.algorithm=myers`), colour, external drivers and textconv off; the rest of the operator's configuration still applies, `safe.directory` included, so a dry run opens every repository the real run opens: they are what `git show` prints for the real commit under git's default diff settings — an operator whose own configuration changes those keys sees `git show` differ from the plan in hunk layout, never in content. Nothing is written: the working tree, the index, `HEAD` and every ref are left as they were. A dry run of a refused command exits with that refusal's code and message (exit `1` or `2`, spec-005 §1); a command that would change nothing prints what the real run prints. The success warnings the command determines before its commit — `--force`'s whole-file rewrite, `W_MEMORY_UNREADABLE` lines — are printed as the real run prints them (§6 "Warnings on a successful command"), except that a warning reporting a rewrite reads as a plan: `dna.yaml would be rewritten as a whole file (--force): …` and `roles.yaml would be rewritten as a whole file (--force): …`, the rest of the text unchanged. It is implemented once, in the commit primitive every mutating operation writes through, so an operation added later takes it by construction. `workflow finalize`'s commit changes no file (`spec-017` §7.9), so its plan has `paths: []` and an empty `diff`; so do `workflow adopt`'s and `workflow rekey`'s (`spec-017` §7.11–§7.12). `workflow adopt --plan` writes nothing and needs no `--dry-run`; `--plan --apply --dry-run` prints the plan of its first adoption commit and stops there, as `workflow start`'s dry run does. Not predicted: what a git hook would do and the second, `finalize` commit of a `memory approve` whose `supersedes:` trigger fires — the dry run stops at the first commit. `workflow start` writes one commit, its plan's `add` (`spec-017` §7.1, from `minor-v0.4`), whose `message` carries the start marker `WingFoil-Start: <workflow>` before the `WingFoil-Version:` line (`spec-017` §3.1). `agent execute` is the one command whose commit follows a process it starts: the record it commits (`spec-016` §4.4) holds the agent's exit status and duration, which no plan can know. Its dry run runs every pre-launch step and refusal (`spec-016` §3.3 steps 1–12, the MCP pre-flight included) but the terminal check, which a dry run needs no terminal for and which prints a `warning:` line where a real run is refused (`bug-392`), starts no agent, and prints the launch plan instead: `{dryRun: true, subject, paths, run, launch, bootstrap}` — the record commit's subject (`agent: record <run-id>`) and run-log path, the record's fields known before the spawn (`id`, `element`, `workflow`, `phase`, `role`, `mode`, `agent`, `adapter`, `state_ref`, in `spec-016` §4.2 order), the launch kind and the permission fragment the launch would append for the run's role (`{kind, permissions}`, `spec-016` §3.3 step 14, `dl-223`) and the `spec-016` §2.4 bootstrap; it has no `message` and no `diff`. |
| `--co-author <name>` | value option | — | From `minor-v0.4` (`spec-018` §1 row 2, §2.3). Taken by every command `--dry-run`'s row lists **but `agent execute`** (`spec-018` §1.1), placed after the verb; on any other command, `init` and `mcp` included, it is an unknown option (exit `2`, §5). It is an agent marker: with it, or with `WINGFOIL_AGENT`, `CLAUDE_CODE_CHILD_SESSION` or `CODEX_SANDBOX` defined in the environment (whatever the value, the empty one included; `CLAUDECODE` is not a marker), the command runs in an agent's session. An approver-gated command (`memory approve`, `reject`, `amend`, `workflow finalize` on an `approval:` phase, `workflow adopt --plan --apply`, `workflow rekey`) then refuses with §6's `E_AGENT_CONTEXT` row, exit `1`, before anything is written. Every other command writes the agent's attribution trailers (the build-signature note below), signed by the `team.agents` entry `spec-018` §2.3 selects: the entry whose `name` is `<name>`, exactly, whatever the environment says. A blank `<name>` → `error: invalid flag value: --co-author must not be blank`, exit `2`, before anything is read. |
| `--ai-model <id>` | value option | — | From `minor-v0.4` (`spec-018` §2.4). Taken by the commands that take `--co-author`, after the verb. The model identifier the agent's `AI-Model:` trailer records; without it the `WINGFOIL_AGENT_MODEL` environment variable's value, and without either the literal `not-reported`. It is not a marker. Usage checks, exit `2`, before anything is read, in this order: a blank or whitespace-only value → `error: invalid flag value: --ai-model must not be blank`; a value holding a line break or another control character (C0 including tab, DEL, C1, `U+2028`, `U+2029`) → `error: invalid flag value: --ai-model must be one line`; given in a session no agent marker marks → `error: invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)`. `WINGFOIL_AGENT_MODEL`, when it is the value used, follows the same one-line rule (`error: invalid environment value: WINGFOIL_AGENT_MODEL must be one line`, exit `2`); a blank one counts as unset. The value is written with its leading and trailing whitespace trimmed. |
| `--verbose`       | flag                   | `false`   | Emit diagnostic logs to stderr in plain text, even under `--format json`/`yaml`. Never alters stdout.  |
| `--no-color` (negatable) | boolean flag     | `true`    | ANSI colour on stdout, on unless `--no-color` is passed; also disabled automatically when `NO_COLOR` is set to any non-empty string (https://no-color.org/) — an explicitly empty `NO_COLOR=` does **not** disable colour. **Today no output is coloured** (see `--format`), so `--no-color` and `NO_COLOR` are accepted and change nothing; the rule above is the one the colour P5.1.4 adds must honour. Commander itself already honours `NO_COLOR` (it strips colour from its help, which has none) but not `--no-color`, so that rendering must read both. The positive form `--color` is not registered: it is an unknown option (exit `2`, with `hint: did you mean "--no-color"?`). |
| `--no-interactive` (negatable) | boolean flag | `true` | Whether missing required args may trigger a readline prompt in a TTY (§4): they may unless `--no-interactive` is passed, which forces immediate failure instead. The positive form `--interactive` is not a global flag: it is an unknown option (exit `2`, with `hint: did you mean "--no-interactive"?`), and on `agent execute` it is that command's own flag (§12), a different option. |
| `--project <dir>` | path                   | the current directory | From `minor-v0.4` (`dl-198` (a)). Names the project root: the command runs on the repository rooted at `<dir>`, resolved against the current directory, instead of on the current directory. `<dir>` must itself be a git root, holding a `.git` entry (a directory in a clone, a file in a worktree); nothing above or below it is examined (`spec-011` § Git-root detection algorithm). Any other directory — a subdirectory of a repository, one outside every repository, a missing path or a file — is refused at §1's root step, so after `--format` and the operand checks and before anything is read or written, at exit `1` with `error: E_NOT_AT_GIT_ROOT: --project is not a git root: <absolute dir>`. A blank value is refused at exit `2` with `error: invalid flag value: --project must not be blank`, just before the root step. Without the flag the root is the current directory, which must be the git root: a subdirectory is still refused with `E_NOT_AT_GIT_ROOT: run wingfoil from the project root`, for read-only commands too, because the root is never resolved upwards (`dl-198` (b) was not taken). The flag changes which repository a command reads and writes, never which baseline it reads there (§11). `init` scaffolds the named repository, `mcp` serves it for the server's whole life, and `agent execute` registers its MCP server with `--project <root>` (`spec-016` §2.5). `--help` and `--version` keep their precedence: with either, the value is not checked. On `capabilities`, which reads no project (`spec-019` §1), a blank value is still refused at exit `2` and a non-blank one is accepted and not checked. Why the root is named rather than inferred is `spec-011`'s. |

Notes:

- `--format` values are `console`/`json`/`yaml`; the fit criterion in REQ-INT-05 calls these out
  explicitly for `wingfoil paths` and `wingfoil workflow status`, but the flag is registered globally so
  every command honours it uniformly (REQ-SYS-05).
- `--no-color`/`--no-interactive` are **negatable booleans**, not independent `--no-*` flags with their own
  default — see §3 for why this distinction matters and how Commander.js models it. Each sets a positive
  property, `color` or `interactive`, `true` unless the flag is passed. Only the negated form is registered,
  so the positive form is refused (`bug-514`): a global `--interactive` would also be taken by the root
  program wherever it stands on the command line (the any-position rule above), so `agent execute`'s own
  `--interactive` would never reach that command.
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
  Q2 (a), Q3 (i)). Every commit the tool writes, on every command, ends with a trailer paragraph whose
  last line is `WingFoil-Version: <semver> (<sha>)` — the stamp `--version` prints, or
  `<semver> (unknown)` when the running build has no `dist/build-info.json` —, followed only, in an agent's
  session, by the two agent trailers of the next bullet. A commit that carries trailers
  of its own — the phase record of `workflow finalize` (`spec-003` § "Evidence", `spec-017` §7.9), and from `patch-v0.3.1` the provenance records of `workflow adopt` and `workflow rekey` (`spec-017` §4.8), the step linkage of `memory add --workflow` (`WingFoil-Instance:`, `WingFoil-Step:`, `spec-017` §4.8, §7.10), and from `minor-v0.4` the start marker of `workflow start`'s add commit (`WingFoil-Start: <workflow>`, `spec-017` §3.1) — writes
  them in that same final paragraph, before the `WingFoil-Version:` line, because git reads trailers from
  the final paragraph only (`%(trailers)`): in a paragraph of their own they would not be read. It is the final paragraph,
  so it is the trailing trailer paragraph at which a `Reason:` block ends, and the one git's
  `%(trailers:key=WingFoil-Version)` reads; `memory history` reports its value as every entry's
  `wingfoil` field, `null` when a commit has no such trailer. A commit without it was not written by
  WingFoil. The key is reserved (the row above), so a reason cannot supply it.
- **The agent's attribution trailers** (`spec-018` §2, from `minor-v0.4`). In an agent's session (the
  `--co-author` row), every commit a command other than `agent execute` and `init` writes, an approver-gated
  command never reaching one, ends that same paragraph with two more lines, **after** `WingFoil-Version:`:
  `Co-Authored-By: <entry name> <<entry email>>` and `AI-Model: <id>` (the `--ai-model` row), the entry being
  the one of the `team.agents` committed at `HEAD` that `spec-018` §2.3 selects. They are written by the commit
  primitive, so `--dry-run`'s `message` shows them. When the entry is the first one by default (`spec-018`
  §2.3 rule 4), the body's first paragraph, before every other body line and so before a `Reason:` block, is
  `Attributed to the first team.agents entry, <name>: no entry is named for this agent.`, and §6's
  `W_AGENT_ENTRY_GUESSED` warning is printed; with no `team.agents` entry the commit carries neither line and
  §6's `W_NO_AGENT_ENTRY` warning is printed. Outside an agent's session the commit is byte for byte what it
  was before `minor-v0.4`. `Co-Authored-By:` and `AI-Model:` are reserved on an approval (the `--reason`
  row), and the commit primitive refuses an approval commit carrying either (§6, `E_AGENT_TRAILER_ON_APPROVAL`).
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
| `add`       | `memory add`; `workflow start` for its plan, the add commit carrying the start marker `WingFoil-Start: <workflow>` in its trailer paragraph (`spec-017` §3.1) — the one difference from a `memory add` of the same plan, and the one that makes the plan an instance | none |
| `submit`    | `memory submit`                                                            | none (`dl-054`; kept over `dl-106` W1 (a), ruling R20); the content it carries is declared in the body (below) |
| `approve`   | `memory approve`; a `set_state` in a phase that declares `approval:`       | `[from → to]` |
| `reject`    | `memory reject`; a `fallback.set_state` routed by a reject                 | `[from → to]` |
| `deprecate` | `memory deprecate`                                                         | `[from → deprecated]` |
| `start`     | a `set_state` that opens work on an element                                | `[from → to]` |
| `finalize`  | a `set_state` into the last state of the type's `sequence`; `workflow end` for a plan; the `supersedes:` trigger of `memory approve` (below) | `[from → to]` |
| `sync`      | `<type>.sync_state` (`bug.sync_state`, `dl-045`)                           | `[from → to]`, or a chain `[s0 → s1 → … → sN]` |
| `amend`     | `memory amend` (`dl-108`)                                                  | `[s → s]` |
| `park`      | `memory park` (`dl-110`)                                                   | `[from → to]`, `to` the type's `returns.<from>` (this repository's `task`: `[in-progress → backlog]`) |
| `assign`    | `element.set_release` (below)                                              | none |

**`memory submit` declares the content it carries** (`dl-106` W1 (a), with `dl-054` kept for the
subject, ruling R20; `task-209`). A submit commits the document as the author left it
(`spec-010` § Field-write ownership), so its commit may carry more than the state move. When it does,
the body is one line naming that content:

```
wf({type}): submit {id}

Carries content: {item}, {item}
```

Each item is what `describeDocumentChanges` reports between the document committed at `HEAD` and the
working tree, both first rendered by the submit's own edit, so `status` and a cleared
`rejection_reason` never count, and both with line endings normalized (CRLF → LF), so a working tree
that `core.autocrlf` keeps in CRLF over an LF blob carries nothing: `frontmatter field '<name>'` per
changed field, sorted by name, then `the frontmatter text (comments or formatting)` when only comments
or formatting moved, then `the body`; `the file content` when the two differ in none of those parts
(`describeDocumentChanges`'s fallback). When git, after its own line-ending filters
(`core.autocrlf`, `.gitattributes`), would store the document with line endings other than the
committed copy's, `the line endings` is added after every other item — alone when nothing else
changed, so a CRLF conversion is declared whether or not it comes with a content edit. A pure transition has no body. The key holds a space, so the line is not
trailer-shaped: no reader takes it for an `Approver:`, a `Reason:` or the build signature. Items are
separated by `, `. In an item, a control character or line break, and a comma, are written as the
text `\u{XXXX}`, and a backslash as `\\`, so an item can neither add a line nor read as two items or
as an escape it does not hold. The line is never written next to an `Approver:` or `Reason:` body.
From `minor-v0.4` it is read back where the other declared body lines are (`bug-287`): `memory history` reports each
entry's declaration as its `carries` field, the items unescaped, `null` on a commit with no such line (a pure
transition, every other verb, and a submit written before the line existed); and `wingfoil verify`'s
`carries-content` check reports a line that is missing, malformed or disagrees with what the commit carries
(`spec-020` §4.14).

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

**`memory park` emits `park`** (`dl-110` P1 (a); `task-180`). It takes the declared return edge of the
document's state, `returns.<from>` in the type's machine (`spec-001`), and writes `status` and
nothing else. A park is a scheduling decision, not an approval: the body carries a `Reason:` block,
mandatory as on `approve` (§2 above), and no `Approver:` line, and no authority is checked. Its
refusals: a missing or blank `--reason` exits `2`; a state with no `returns` edge exits `1` with the
illegal-transition message (`dl-032`). A WIP limit on the target state (`spec-001` `limits`) does not
refuse a park: a return along a `returns` edge is exempt (`dl-156` Q2 (i)).

```
wf({type}): park {id} [{from} → {to}]

Reason: {reason}
```

**A WIP limit binds every verb that enters the state, except the two that send an element back**
(`dl-110` P3 (a), `task-180`; `dl-156`, `task-274`). When the type's machine declares
`limits: { <state>: N }` and N documents of the type hold `<state>` — counted in the commit the
transition is decided at **and** at the tip of every local branch and remote-tracking ref, each
document once — in the state a ref records only when that ref changed its `status` since its
merge-base with the decided commit, otherwise in the decided commit's (`spec-001` `limits`, `dl-156`
Q1 (a), the approver's ruling of 2026-10-11) — a verb that would
move another one there — `add` for the initial state, `submit`, `approve`, and the `supersedes:`
trigger — refuses with `CONFLICT` (exit `1`) before anything is written. `reject` (a `gates` reject
edge) and `park` (a `returns` edge) are not refused, and may leave the state above its limit
(`dl-156` Q2 (i)):

```
WIP limit reached for '<state>' on type '<type>' (limit <N>): held by <id1>, <id2>. Move one of them out of '<state>', then retry. The holders are counted at HEAD and on every local and remote-tracking branch that changed them since it forked from HEAD, so the count depends on which refs were last fetched; a holder another branch records is moved out on that branch.
```

**A chained bracket** is read from its first state to its last. Those two states are compared with
the frontmatter before and after the commit. Given the type's machine, every hop must be one of its
edges: the forward edge `sequence[i] → sequence[i+1]`, a `gates` reject target, a `returns` target
(`task-180`), or the implicit edge to `deprecated`. A hop that is none of these is an `illegal-hop` finding of
`verifyTransitionConsistency` (`src/memory/audit.ts`, `bug-155`). `sync` is the only verb that
emits a chain. The reader reads a chain, and checks its hops, whatever the verb.

**A `sync` that crosses a `gates` reject edge** cites the approver's reject commit by sha in its body.
It carries no `Approver:` line of its own, because the decision is recorded once, on the host task's
reject (`dl-061` B.1).

**Subjects that are not Memory operations.** `memory history` reports `operation: null` for them and
the consistency check reads no bracket in them:
- the configuration scopes `wf(dna): …`, `wf(directive): create|assign|remove …` and
  `wf(workflow): create|remove …` (`spec-017` §7.7–7.8), whatever their verb token;
- the records outside the `wf()` grammar: `workflow: finalize …` (`spec-017` §7.9), from `patch-v0.3.1`
  `workflow: adopt …` and `workflow: rekey …` (`spec-017` §7.11–§7.12), and `agent: record …` (`spec-016`);
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
    .option('--format <format>', 'output format (console|json|yaml); console prints indented JSON for now, unless the command defines its own', 'console')
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
| Required arg missing, stdout is a TTY, no `--no-interactive` (the default) | Readline prompt for each missing arg, one at a time                  |
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
(`wingfoil dna`) and `wingfoil` invoked with no command at all are **"missing required argument"** in
the exit-`2` row — the case already enumerated there, not a fourth one; `wingfoil help <unknown>` is the
row's **unknown command**, with the closest-command `hint:` line of §1 (`spec-005` §3.1), and so is any
operand of a help command path that names no command of the level the path has reached (§8,
`wingfoil help memory addd`).
§1's grammar makes the verb a required argument of the noun, so an invocation that stops at the
noun is malformed, and it exits `2` with an `error: ` line naming what was missing (`spec-005` §1's
rule that a non-zero exit always carries an error message admits no exception for it). An argument
parser that answers such an invocation by printing the command's usage has not thereby emitted the
error message. An **explicit** request for help by name — `wingfoil help`, `wingfoil help <known>`,
`wingfoil help <noun> <verb>` — is the opposite case and exits `0` alongside `--help`/`--version`, even though it prints the same
text.

A third: a **refused option value** — a `--reason` that cannot be recorded (§2's unrecordable-value row), a blank
`--co-author`, `--ai-model` or `--project`, an `--ai-model` or `WINGFOIL_AGENT_MODEL` that is not one line, a
malformed `--timeout` (§12) — is exit `2`, the row's **usage error**, like a malformed command line, and never exit `1`
(`dl-199` (b)). The rule holds for every refused value, present and future: a script tells the two apart by the
message, not the code. An MCP Tool has no exit code: it reports either as an `isError` result (`spec-004` §4.3 item 4),
so no client needs the code to change.

A fourth: a **completed check whose verdict fails** — `verify` (`spec-020` §8.1) — is exit `1`, the row's
**user/logic error**, although the operation succeeded: it prints its whole report on stdout, as on a pass, then the
`error:` line on stderr (§6), so the report is never lost on the run that needs it (`spec-006` §2's `failed`). A reader
tells the two exit-`1` cases of `verify` apart by stdout: a report whose `verdict` is `fail`, or nothing. A revision
that names no commit, or a malformed one (`--base`, `--introduced-at`), is `resolveRevision`'s refusal (`spec-020`
§8.2), exit `1` like a document not found: the value is read as a revision, by the resolver every revision reader
uses, and that resolver decides it, as it does where a revision reaches the MCP surface (`spec-004` §3.4); a blank
value stays the third case's exit `2`.

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
| `dna set`, `dna add`, `dna update`, `dna remove` | `1` | `dna.yaml cannot be updated in place; edit <path> by hand, or pass --force to rewrite the whole file` — the in-place editor cannot express the change and `--force` was not given, whether or not the file has comments (task-193, ruling R20/Q9: `dl-062`'s rule applied to `dna.yaml`). Nothing is written. A change the schema refuses is reported as that validation failure first. |
| every command that writes (§2 `--dry-run`'s list, and `init`) | `1` | `E_COMMIT_FAILED: git did not commit <paths>: <explanation> — nothing was committed, and the working tree and the index are as they were` — git refused or failed the command's commit (a `pre-commit` hook, a full disk, a held `index.lock`). Before the refusal, every path the command wrote is put back: its bytes, or its absence together with every directory the write created, and its index entry as it was, whatever the operator had staged. `<paths>` are repository-relative, comma-separated; `<explanation>` is git's stderr (or, when git wrote none, its own failure message) on one line, `; `-joined, with every spelling of the project root removed (`<root>/x` → `x`, `<root>` → `.`). When the index entries cannot be put back, the clause after `—` reads `nothing was committed and the working tree is as it was, but the index entries of <paths> could not be put back (<git's explanation>): check them with git status`. `memory approve`'s supersede recovery quotes the first part only, up to `<explanation>`, because it writes the finalized status back on purpose. |
| every command that writes (§2 `--dry-run`'s list, and `init`) | `1` | `could not run git: <cause>` — the git identity check (REQ-SEC-01, `requireGitIdentity`) could not start git at all: it is not on `PATH`, not executable, or a sandbox forbids the spawn. `<cause>` is the spawn error's message, e.g. `spawnSync git ENOENT`; the `CoreError.code` is `IO`. Nothing is read past the check and nothing is written. One exception: `agent execute` reads `HEAD` (`spec-016` §3.3 step 2) before its identity check (step 5), so it reports an unrunnable git as that read's failure, `E_GIT_READ_FAILED: git rev-parse HEAD failed in <root>: spawnSync git <code>`, exit `1`, nothing written. A git that runs and finds no identity (exit `1`) still gives REQ-SEC-01's `git identity not configured (user.name/user.email)` (task-284, `bug-377`). |
| every command that writes (§2 `--dry-run`'s list, and `init`) | `1` | `could not read git configuration: <git's message>` — the git identity check (`requireGitIdentity`) ran `git config` and it exited with anything other than `0` or `1` (in practice `128`: a config file it cannot parse, or a root it cannot enter; or a signal). `<git's message>` is git's stderr, each line trimmed, empty lines dropped, a leading `fatal: ` removed, the lines joined with `; ` (e.g. `bad config line 9 in file .git/config`); with nothing on stderr it is `git config exited <status>`, or `git config was terminated by <signal>`. The `CoreError.code` is `IO`. Nothing is read past the check and nothing is written. One exception: `agent execute` reads `HEAD` first, so it reports the same git failure as `E_GIT_READ_FAILED: git rev-parse HEAD failed in <root>: fatal: bad config line …`, exit `1`, nothing written (task-324, `bug-379`). |
| `memory history`, `submit`, `approve`, `reject`, `amend`, `deprecate`, `park`; `workflow start`, `workflow adopt`, `agent execute` (`--element`) | `1` | `ambiguous reference: <ref> matches <N> elements` — `CONFLICT` (§7's short element references); `hint:` `give the full id, or a longer prefix of it`; one `details` line per candidate, its full id, in id order; nothing is written. For `--element` the reference is the `<id>` part. |
| `directive remove` | `1` | `cannot remove '<id>': still assigned to every role via roles.yaml 'global'` — the directive is bound through `roles.yaml`'s `global` list. A per-role binding gives `P3.3-directive-remove.feature`'s `cannot remove '<id>': still assigned to role '<role>'`. |
| every `mutates: true` operation of `CORE_MODULES` (§2 `--dry-run`'s list, `agent execute` included), not `init` | `1` | `E_NOT_A_MEMBER: the git identity <name> <email> is not a team member: no team.members entry of the dna.yaml committed at HEAD has the email <email>, and only a member changes this project (dl-220)`, with the `hint:` line `a member adds you with 'wingfoil dna add team.members --value "<name>" --entry-email <email> --entry-roles <role>', or run the command as a member's git identity` (`spec-006` §7 "Membership", `dl-220` Q2 (b)): `<name>` and `<email>` the git identity REQ-SEC-01's check resolved. Right after that check, before anything else is read; nothing is written. Not raised when no `dna.yaml` is committed at `HEAD`, nor when its `team.members` is empty (the `init` scaffold). |
| `memory approve`, `reject`, `amend`; `workflow finalize` on an `approval:` phase, `workflow adopt --plan --apply`, `workflow rekey` | `1` | `E_AGENT_CONTEXT: '<command>' needs the approver and does not run in an agent's session (<markers>): an approval is recorded only from the approver's own session, never from an agent's (dl-212)`, with the `hint:` line `run '<command>' yourself, from a terminal no agent started — not through an agent's shell` (`spec-018` §3.2): `<command>` as the grammar names it, `<markers>` each present marker's phrase (`WINGFOIL_AGENT is set`, `--co-author was given`, `CLAUDE_CODE_CHILD_SESSION is set`, `CODEX_SANDBOX is set`) in that order, `, `-joined; no value is printed. Before the authority check, after transition legality. |
| `memory approve`, `reject`, `amend`; `workflow finalize` on an `approval:` phase, `workflow adopt --plan --apply`, `workflow rekey` | `1` | The authority refusal (REQ-SEC-03) keeps its reason word for word — `user not authorized to approve type '<type>'`, `user not authorized to apply adoptions in bulk`, `user not authorized to rekey` — and, when **no** `team.members` entry of the `dna.yaml` committed at `HEAD` holds the `approver` role, gains a `hint:` line saying how to grant it (`dl-071` (B), S3: an appended hint, the pinned string untouched): with `team.members` empty (the `init` scaffold), `no team member holds the 'approver' role yet: add one with 'wingfoil dna add team.members --value "<name>" --entry-email <email> --entry-roles approver', then retry`, `<name>` and `<email>` the git identity the check judged; with members, none an approver, `no team member holds the 'approver' role yet: add approver to the roles of a team.members entry with 'wingfoil dna update', then retry`. The hint is the `hint` field of the error object under `--format json`/`yaml` (`spec-005` §3.2). There is no hint when a member holds `approver` (the refusal is then a denial), nor when the working tree's `dna.yaml` would grant it to the identity, whose reason already names the remedy (commit it). Nothing is written. |
| every command that writes (§2 `--dry-run`'s list) | `1` | `E_AGENT_TRAILER_ON_APPROVAL: the commit '<subject>' records an approval and would carry an agent trailer (<key>:), which an approval never carries (dl-212, git-conventions §7); nothing was written` — the commit primitive's backstop (`spec-018` §3.3): a message with an `Approver:` line and a `Co-Authored-By:` or `AI-Model:` line, any case. |
| the commands that take `--co-author` (§2) | `1` | `unknown team.agents entry '<name>' (from <--co-author\|WINGFOIL_AGENT>): the committed dna.yaml declares <comma-separated names, or "none">` — `--co-author`, or a non-blank `WINGFOIL_AGENT`, names no entry of `team.agents` at `HEAD` (`spec-018` §2.5); nothing is written. Not on an approver-gated command, which is refused with `E_AGENT_CONTEXT` first (`spec-018` §2.6). |
| `verify` | `1` | `E_VERIFY_FINDINGS: <n> findings on <m> commits fail the governance check (<rule> <count>, …)` — the run completed and at least one finding is gated; written after the report, which stdout carries in every verdict (§5, `spec-020` §7, §8.2). Under `json` / `yaml` it is the error document of `spec-005` §3.2 |
| `verify` | `1` | `revision "<rev>" does not name a commit` and `malformed revision "<rev>": a revision is a non-empty name with no leading '-', no whitespace or control character, no ':' and no '..'` — `resolveRevision`'s two messages, word for word, for `HEAD` (an unborn `HEAD`) and for the values of `--base` and `--introduced-at`; `details` carries `rev` and, for a flag's value, `flag` (`--base` or `--introduced-at`) (`spec-020` §8.2) |
| `verify` | `2` | `invalid flag value: --base must not be blank`, or `--introduced-at` — before any revision is resolved (`spec-020` §8.2) |
| the commands that take `--co-author` (§2) | `1` | `team.agents entry '<name>' has no email, and a commit it co-authors must name one; declare it first (wingfoil dna update team.agents.<name> --entry-email <address>), then retry` — the signing entry declares no `email` (`spec-018` §2.5, `dl-158` Rule 2 (ii)); nothing is written. |

**Warnings on a successful command.** A command that succeeds may also have something to tell the
operator (`CoreResult.warnings`, `spec-006` §2). A warning goes to **stderr only**, under every
`--format`, so stdout is byte-identical with and without it (`spec-005` §2). In `console` it is the
line `warning: <text>`, beside the `error: ` prefix; a continuation line of a multi-line warning is
indented. Under `--format json` each warning is one `{"warning": "<text>"}` document on its own
line, and under `--format yaml` one YAML document opened by `---` and closed by `...`. Each is
therefore self-delimiting: warnings followed by an error on the same stderr (`spec-016` §3.4) read as
separate documents, and the error object keeps its `spec-005` §3.2 bytes. These are `spec-016` §3.4's
shapes, used by every command. Warnings are written before the payload, in the order core recorded
them, and never change the exit code. A warning raised while the command runs — through the warning
sink of `src/validation/warning.ts`, which the CLI registrar installs around every operation, and
`init` and `mcp` around their own core calls (`mcp`: its pre-flight, before the server starts) — is
written at the moment it is raised, so it also precedes a refusal that follows it (`spec-009` §2's
unknown-field warning, `spec-016` §3.3's warnings; `bug-202`). So stderr can be non-empty on exit
`0`, and under `json`/`yaml` a refusal can follow warnings, as `spec-005` §3.2 states. **One console
prefix:** a warning raised outside any sink — the MCP server while it serves, whose stderr is outside
the protocol, or a library caller — is written as the same console line, `warning: <text>`, its
continuation lines indented; the prefix and that line are defined once, in `src/validation/warning.ts`
(`WARNING_PREFIX`, `formatWarningLine`), and the CLI's renderer writes its `console` line through them
(`bug-304`). The text of each warning in this table is pinned; `agent execute`'s other warnings — its
context and adapter-tree diagnostics, the workflow deduction's diagnostics (`W_UNCOMMITTED_INPUTS` among
them), the run log's symbolic-link warning (`W_RUN_LOG_SYMLINK`), the MCP conflict probe, the launch kind
and dry-run terminal warnings, the run registry's and `--log`'s, the start-up hint — are worded by
`spec-016` and are outside this claim (`bug-548`):

| Command | Warning |
|---------|---------|
| `directive assign --force`, when the whole file was rewritten | `roles.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, blank lines, line endings or number formatting (1.0 becomes 1)` |
| `dna set\|add\|update\|remove --force`, when the whole file was rewritten | `dna.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, blank lines, line endings or number formatting (1.0 becomes 1)` |
| `agent execute` without `--role` (`spec-016` §3.2 step 3) | `no --role given and no workflow step to take one from: running as the default role 'developer'` |
| `agent execute`, per entry of the adapter tree that is not an adapter (`spec-016` §2.1) | `W_ADAPTER_IGNORED (<path>): not an adapter: an adapter is a .yaml file directly inside .wingfoil/agents/built-in/ or .wingfoil/agents/custom/ (spec-016 §2.1)`, or, for a basename outside the ID class, `W_ADAPTER_IGNORED (<path>): not an adapter: its name '<name>' is not an id, characters [a-z0-9-.] only (spec-009 §1), so no agent can select it` |
| `workflow next`, `workflow status`, `agent list`, per entry of the payload's `diagnostics`, in its order (`dl-176` (a); `spec-017` §7.3, §7.4; `spec-016` §5) | `<code> (<file>): <message>`, or `<code>: <message>` for an entry with an empty `file` — the entry's own `code`, `file` and `message`; only the form is pinned here, each message is worded by `spec-017` §2 and `spec-016`; the payload keeps every field of the entry |
| any command, per configuration file with a key its schema does not declare (`spec-009` §2) | `<file>: unknown field(s) ignored: <paths>` — a `<file>` label naming a commit the command resolved from `HEAD` reads `HEAD:`, never the sha (`bug-317`); `agent execute` prints each distinct one once (`spec-016` §3.3) |
| `agent execute`, per post-run lookup that fails or reports a value of the wrong type, and per `version_args` read before the launch (`spec-016` §2.6) | `adapter '<name>': the usage lookup failed (<cause>): model and tokens not read from it`, `adapter '<name>': the session lookup failed (<cause>): session recorded as not-reported`, `adapter '<name>': version_args <read> before the launch: agent_version recorded as not-reported`, `adapter '<name>': version_args <read> after the run: agent_version_after recorded as not-reported` (`<read>` is `failed (<cause>)` or `printed nothing`), `adapter '<name>': the session lookup's session id is not a non-empty string: recorded as not-reported`, or `adapter '<name>': the usage lookup's <field> is not a non-negative integer: not read from it` (`model`: `is not a non-empty string`). A usage source's warning says what was not read from that source, never what the record holds, since a later source of `usage.from` may supply the value (`spec-016` §2.6); `<cause>` is `exited <n>`, `timed out after <ms> ms`, `ended by <signal>`, `printed more than 1 MiB on stdout or stderr`, `could not start: <code>` or `printed no JSON` |
| `agent execute`, when `version_args` read before the launch and after the run print different versions (`spec-016` §2.6) | `adapter '<name>': the agent CLI changed during the run: version_args printed '<before>' before the launch and '<after>' after it` |
| `agent execute`, per headless output that `usage.from` names `output` for and that yields no usage (`spec-016` §2.6) | `adapter '<name>': <reason>: model and tokens not read from it`, `<reason>` being `the headless output is not one JSON document` or `the headless output is over 1 MiB`; or `adapter '<name>': the headless output's <key> is not a non-negative integer: not read from it` (`model`: `the headless output's model is not a non-empty string: not read from it`) |
| `agent execute`, per headless output that `session.id: output` reads and that yields no session id (`spec-016` §2.6) | `adapter '<name>': <reason>: session recorded as not-reported`, `<reason>` being `the headless output carries no session id`, `the headless output is not one JSON document` or `the headless output is over 1 MiB` |
| `agent execute`, per transcript source (`usage.from` names `transcript`) that yields no usage or a value of the wrong type (`spec-016` §2.6) | `adapter '<name>': usage.transcript: ` followed by `the session id is not-reported: the transcript is not read`, `the path does not render as an absolute path: the transcript is not read`, `the transcript of session <session> <reason>` (`<reason>` is `is absent`, `is unreadable (<code>)` or `was not read within <ms> ms`), `<key> is not a non-negative integer in a message: not read from it` or `model is not a string in a message: not read from it` |
| `verify` with neither `--base` nor `--introduced-at` (`spec-020` §5.1, §8.2) | `W_VERIFY_WHOLE_HISTORY: no --base and no --introduced-at, so every commit reachable from HEAD is judged and gated; pass --base <rev> to judge a range, or --introduced-at <rev> to report older history without failing` — raised once `HEAD` is resolved and before the range is read, so it precedes the report and the `E_VERIFY_FINDINGS` line; an unborn `HEAD` is refused without it |
| the commands that take `--co-author` (§2), in an agent's session, when no entry is named for the agent (`spec-018` §2.3 rule 4) | `W_AGENT_ENTRY_GUESSED: Attributed to the first team.agents entry, <name>: no entry is named for this agent.` — the same text the commit body's first paragraph carries |
| the commands that take `--co-author` (§2), in an agent's session, when `team.agents` at `HEAD` is empty or absent (`spec-018` §2.3) | `W_NO_AGENT_ENTRY: this command runs in an agent's session (<markers>) but dna.yaml declares no team.agents entry, so its commit names no AI co-author; declare one (wingfoil dna add team.agents …)` — `<markers>` as in §6's `E_AGENT_CONTEXT` row |

`verify` reads `dna.yaml` and `memory.yaml` blobs from the history it judges (`spec-020` §4.1): it validates each
against its schema and writes **no** unknown-field warning for one, so its stderr does not depend on what an old
blob holds; the "any command" row above does not apply to those reads.

**Notices and a payload on stderr** (`spec-016` §3.4, task-228). A command that hands its stdout to a
child process — `agent execute`, whose agent owns the terminal — writes nothing on stdout (`spec-005`
§2). Besides its warnings and errors it prints a **notice**, the launch banner
(`run <run-id>: launching <agent> (<adapter>) as <role> on <type>:<id>`), and on success its report, the
post-run summary (`run <run-id>: agent exited 0 after <s> s (recorded in <sha7>)`), both on stderr: in
`console` as the bare line, under `--format json` as one `{"notice": "<text>"}` or `{"run": <record>}`
document per line, under `--format yaml` as one `---` … `...` document each — the shapes a warning
takes. A notice, like a warning, is written when raised (the registrar installs a notice sink beside
the warning sink), so the banner precedes the agent's own output.

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
| `element` argument (`{role}-session` MCP Prompt, `spec-004` §3.1) | `<type>:<id>` | `element="task:task-202"` |
| `--element` flag (`workflow start`, `spec-017` §3.4, §3.5) | `<type>:<id>`, or `none` | `--element release:minor-v1` |

An element-ref has exactly one `:`, a non-empty `<type>` before it and a non-empty `<id>` after it, and
holds no whitespace, no control character and no `-->` (the `spec-012` §7 payload header and markers
could not carry one). Anything else is refused as `malformed element-ref "<ref>": expected <type>:<id>`,
the ref written as a JSON string. The one exception is `workflow start`'s `--element`, which also takes the
literal `none` — no element-ref, since it has no `:` — to clear the context of a workflow that declares no element
(`spec-017` §3.5; from `minor-v0.4`). Whether `<type>` is a declared type and `<id>` an existing element is
decided by the command that resolves the ref, not by the grammar. One parser applies it everywhere
(`parseElementRef`, `src/core`).

Commands whose noun already scopes the type (`memory submit <id>`, `memory approve <id> --reason ...`,
`memory reject <id> --reason ...`, `memory deprecate <id>`) take the **bare `<id>`** as the positional
argument — the type is not repeated because IDs are globally unique (`id_pattern` per type in
`memory.yaml`) and the type is redundant once written out that way. `memory add` supplies the type via
`--type <type>` instead of an element-ref, since the document does not exist yet. The `<id>` need not be a
full id: see **Short element references** below.

**Short element references** (`task-332`, `patch-v0.3.2`). The `<id>` of `memory history`, `submit`,
`approve`, `reject`, `amend`, `deprecate`, `park` and the `<id>` part of `--element <type>:<id>` of `workflow
start`, `workflow adopt` and `agent execute` is resolved in this order (`resolveElementReference`,
`src/memory`), over the documents the command's exact lookup reads (§11's baseline; archived elements are
candidates): (1) an exact frontmatter `id`; (2) a reference `<literal><digits>` where `<literal>` is the head of
a type's `id_pattern` (in the `memory.yaml` the command reads, §11) beginning `<literal>{n}`: the elements of that type whose number equals
`<digits>` by value (`task-12` names `task-012-…`), decided by this rule alone, never falling through to (3);
(3) otherwise the elements whose id starts with the reference. Case-sensitive. Exactly one element resolves; none
keeps the existing `document not found: <id>` / `element not found: <type>:<id>`; several is §6's
`ambiguous reference` refusal (`CONFLICT`, exit `1`, nothing written). For `--element` only the documents of
`<type>` are candidates. Every output, commit subject and commit body carries the full id, never the reference,
and no warning echoes it. A short reference never names an element the tool cannot read (one whose frontmatter
does not parse, or in a newer `format`): the scan skips and reports it, so a short reference never resolves to
it (a readable sibling matching the same reference is the one that resolves, if it is the only one); the full id
gives the reason. Internal lookups (the `supersedes:` field, a plan's finalize, step keys) and `agent list
--element`, the session Prompt and Resources, the workflow `<ref>`, run ids and `--set` stay exact; `--step` takes no
prefix either, and only drops a step's scope by `spec-017` §4.9's rule for an unscoped key (`bug-468`).

### 8. Help system

| Invocation                    | Output                                                              |
|--------------------------------|-----------------------------------------------------------------------|
| `wingfoil --help`               | Binary synopsis, noun list (pillars + flat commands), global flags table |
| `wingfoil <noun> --help`        | Noun synopsis, list of verbs with one-line descriptions               |
| `wingfoil <noun> <verb> --help` | Synopsis, argument table, flags table, exit codes, one example        |
| `wingfoil help [<noun> [<verb>]]`, or `help [<verb>]` after a noun | The help `--help` prints for the command the path names: `wingfoil help memory add` prints what `wingfoil memory add --help` prints |
| `wingfoil help help`, or `help help` after a noun | The help command's own help, its usage line naming the path that answered — `Usage: wingfoil help [command]`, `Usage: wingfoil memory help [command]` — then `display help for command` |

**The help command's operands are a command path.** They are walked from the level the help command was
typed at: each operand names a command of the level the walk has reached — by name or alias, the level's
own help command included — and the walk descends into it. The help of the command reached is printed. A
command with nothing below it, the help command included, ends the walk. The first operand that names no
command of the level reached is refused as §5's unknown command, at exit `2`, with nothing on stdout:
`error: unknown command '<operand>'`, and §1's closest-command `hint:` line matched against the commands of
that level. A command with nothing below it offers no candidate, so an operand after it gets no `hint:`
line. `wingfoil help memory addd` → `error: unknown command 'addd'`, `hint: did you mean "add"?`;
`wingfoil help memory add extra` and `wingfoil help help help` → `error: unknown command 'extra'`,
`error: unknown command 'help'`. The path ends at the first option token, and an option there is ignored, since an
explicit request for help takes precedence (`spec-005` §1): the help path `memory --bogus add` shows `memory`'s help.

Help output always renders as `--format console` regardless of the ambient `--format` flag, and every help
request answered exits `0`; a refused help path is the refusal above, rendered in the active `--format`.

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
  the CLI version and exits `0` having written nothing — §1's placement rule (a global may appear
  anywhere after `wingfoil`), §2's `--version` precedence and `spec-005` §1's exit code, all three
  working as specified. A global that merely carries a value (`--format`) or sets a boolean
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

**Error cases.** The rows with exit `2` are properties of how the argument is spelled, decided before
anything is read, so they are usage errors (§5), each with its own message:

| Case | Message | Exit |
|------|---------|------|
| No `=`, or nothing before it | `error: invalid flag value: --set expects <name>=<value>, got "<raw>"` | `2` |
| `<name>` outside `[a-z][a-z0-9_-]*` — including a dotted name such as `release.version`, which stays undefined until `dl-090` | `error: invalid flag value: --set name "<name>" is not a field name ([a-z][a-z0-9_-]*)` | `2` |
| Blank or whitespace-only `<value>` | `error: invalid flag value: --set <name> must not be blank` | `2` |
| The same `<name>` given twice | `error: invalid flag value: --set <name> given more than once` | `2` |
| A name `memory add` fills itself or through its own option: `id`, `type`, `status`, `title`, `tags`, `n`, `slug` | `error: invalid flag value: --set cannot set "<name>": memory add fills it itself or through its own option` | `2` |
| `date`, whose value is the add commit's author date (`spec-001`'s `{date}` row) | `error: invalid flag value: --set cannot set "date": memory add fills {date} from the add commit's author date (GIT_AUTHOR_DATE, or the clock)` | `2` |
| `author`, whose value is the git author name (`spec-001`'s `{author}` row) | `error: invalid flag value: --set cannot set "author": memory add fills {author} from the git author name` | `2` |
| A `<value>` that, read as a path, is absolute — it starts with `/` or `\`, or a drive letter and `:` — for every `<name>`, since which names are `path` tokens is known only from the committed `memory.yaml` (`bug-325`) | `error: invalid flag value: --set <name> must be a relative path, got "<value>"` | `2` |
| A `<value>` with an empty segment (split on `/` and `\`: `a//b`, a trailing `/`) | `error: invalid flag value: --set <name> holds an empty path segment: "<value>"` | `2` |
| A `<value>` with a `.` or `..` segment | `error: invalid flag value: --set <name> holds a '.' or '..' path segment: "<value>"` | `2` |
| A well-formed `<name>` the type's committed `id_pattern` and `path` do not contain | `error: --set <name>: memory type '<type>' has no token {<name>} in its id_pattern or path` | `1` |
| An `id_pattern` token with no `--set` value | `error: missing value for token {<name>}: give it with --set <name>=<value>` | `1` |
| A value that would take the id outside `[a-z0-9-.]` (`spec-009` §1) | `error: value for token {<name>} is not a valid [a-z0-9-.] piece: "<value>"` | `1` |
| An `{author}` token whose git author name has no `[a-z0-9]` character once slugged | `error: value for token {author} is empty once the git author name "<name>" is slugged` | `1` |
| A `{date}` token while `GIT_AUTHOR_DATE` holds a date git cannot parse | `error: E_GIT_READ_FAILED: git var GIT_AUTHOR_IDENT failed in <root>: fatal: invalid date format: <value>` | `1` |
| The committed `path`, rendered and normalized, leaves the type's folder — the part of `path` up to the last `/` before its first `{` — while staying in the project root (a token value that carries the rendered path out of the folder; a `path` holding a literal `..` is refused when `memory.yaml` loads, `spec-001`) | `error: E_PATH_OUTSIDE_TYPE_FOLDER: Memory entries must reside in their type's folder: '<rendered>' resolves to '<normalized>', outside '<folder>' (path '<path>': {<token>}="<value>", …)` | `1` |

The rows with exit `1` depend on the committed `memory.yaml` (`dl-080` (B): a gating read at `HEAD`), which
is what separates them from the rows with exit `2` — the same malformed-versus-unresolvable line §5 draws for a
DNA path. A `path` token with no value keeps its existing storage refusal (exit `1`, naming the token), and a
document outside the project root keeps `E_PATH_ESCAPES_ROOT` (REQ-SEC-06, exit `1`), checked before the
type's folder. `workflow start --set` applies the same spelling rows (§12).
There is no free-form `--id`: an id a type's pattern cannot express is `spec-001`'s per-action
`id_pattern` override on a workflow's `memory.add` action (`dl-107` S3 (a)), not a CLI option.

### 11. Which baseline each command reads

A user who is refused by one command and checks with another must be able to tell which state each
answered from (`dl-084-which-baseline-a-read-only-verb-reports-from`, `ready`, option (A)). The rule
is `spec-006-core-domain-api` §6, which is normative; this section is its per-command form, and the
CLI reference's *Git side effects* says the same to users.

| Baseline | Commands | Why |
|----------|----------|-----|
| **committed at `HEAD`** | `memory add`, `memory submit`, `memory approve`, `memory reject`, `memory deprecate`, `memory park`, `memory amend` (their `memory.yaml`, the document the `<id>` names and its status, and approver authority — the content `submit` and `amend` commit is the working tree's); `dna set`, `dna add`, `dna update`, `dna remove`; `directive assign`; `directive remove` (the directive its `<name>` names, and its referrer check; the working tree only words a refusal, `task-311`); `workflow next` (v0.3); `workflow start` and `workflow end` (v0.3: the workflow registry, `memory.yaml`, the element, the open instances and their deduction — `start`'s plan-id collision check reads the wider baseline `dl-101` names, which can only refuse more, `spec-017` §7.1, §11); `workflow finalize` (v0.3: the deduction and approver authority, `spec-017` §11); `workflow adopt` and `workflow rekey` (`patch-v0.3.1`: the deduction, the candidates' frontmatter and approver authority, `spec-017` §11); `workflow create` and `workflow remove` (v0.3: the workflow registry — `create` for its name's uniqueness, `remove` for the workflow, its referrers and its open instances, with their deduction — and the registry the commit would leave, which both load before writing, `spec-017` §7.7–§7.8, §11); `agent execute` (v0.3: `dna.yaml`, `memory.yaml`, the element, the adapter, the run log's count and the context — with a step form also `workflow next`'s deduction, whose commit is the `HEAD` the rest is read at (task-235) — all at the one `HEAD` that becomes the run's `state_ref`, `spec-016` §3.2–§3.3 — with one declared exception: the MCP pre-flight starts `wingfoil mcp`, whose own start-up check reads the working tree's `dna.yaml` (`spec-014` §1), so an uncommitted change there can refuse the pre-flight, `spec-016` §3.3 step 11) | a read that can refuse the command or change what it writes (`spec-006` §6 items 1–2). When the working tree defines a type the commit does not, `memory add`'s refusal says the change is not committed (`dl-084` (D), `task-095`); the `dna` verbs first refuse a `dna.yaml` that differs from `HEAD`, so what they then read is `HEAD`'s; `memory add`'s `{n}` counter reads the wider baseline the `command-baseline` directive declares, which can only raise the number; the WIP-limit holder count of `add`, `submit` and `approve` reads the decided commit plus every local and remote-tracking branch tip and its merge-base with that commit, the second baseline that directive declares (`dl-156` Q1 (a)) |
| **committed at `HEAD`, declared** (v0.3, as each ships) | `workflow status`, `workflow list`, `workflow show`, `workflow tree` (`minor-v0.4`; a closed run read at its end commit's first parent too, `spec-017` §7.13, §11), `workflow adopt --plan` (`patch-v0.3.1`), `agent list` (its `--active` section excepted: from v0.4 it reads the git-ignored active registry in the working tree, `spec-016` §5.1, §7), `agent show` | approver ruling R15: one deduction, one baseline; a working tree that differs is reported as the warning `W_UNCOMMITTED_INPUTS`, and never decides the answer (`spec-006` §6 item 6, `spec-017` §1.2) |
| **working tree** | `dna show`, `paths`, `directives list`, `memory search`, `memory history` | a read that gates nothing: a draft you have not committed is what `memory search` exists to find (`spec-006` §6 item 4). `memory history` reads git's log for the entries and the working tree's `memory.yaml`; its unverified mark, and `memory search --verify`'s, is the committed-history read below |
| **filesystem** | the confinement and symlink guards of every command that writes or deletes a file; `directive create`'s and `workflow create`'s check that its target does not exist | the read predicts where a syscall will land, which no commit records (`spec-006` §6 item 5, `dl-086`) |
| **committed history** (from `minor-v0.4`) | `verify`; the unverified mark of `memory history` and `memory search --verify` (`spec-020` §4.13) | a check of the history judges each commit against the state committed when it was written: the commit objects of the range and, per commit, the blobs at it, at its first parent and at `HEAD`; never the working tree or the index, so an uncommitted edit neither causes nor hides a finding (`spec-020` §2.3, `spec-006` §6 item 9) |
| **the build, no project** (from `minor-v0.4`) | `capabilities` | the document is a property of the build: it reads `CORE_MODULES`, the format constants, `package.json` and `dist/build-info.json`, and no project, git or current directory, so it answers the same anywhere (`spec-019` §3.2, `spec-006` §6 item 8) |

`init` and `mcp` read no committed configuration: `init` writes the scaffold, and `mcp` starts the
server, whose Resources and Prompts follow `spec-006` §6 item 4 — except the two v0.3 workflow
Resources, which follow item 6. Before it starts, `mcp`'s pre-flight reads the working tree's
`dna.yaml` role set once, and the Prompts channel serves that set until a restart (`spec-014` §1,
`dl-049` (b)).

`--project <dir>` (§2) changes which repository each row reads, never the row: a command given it reads the
baseline its row names in the repository rooted at `<dir>` — that repository's `HEAD`, working tree and
filesystem — the identity and `team.members` pre-flight of every mutating verb included (`spec-006` §7).

### 12. Command-specific flags

A flag one command declares, as opposed to §2's global flags. Each is registered on that command
only (`CoreOperation.flags`, `spec-006` §2), appears in its `--help`, and is documented in its CLI
reference entry. A command that does not declare it refuses it as an unknown option (exit `2`, §5).
The table also lists a command's **value options** (`--<name> <value>`, `CoreOperation.options`), under
the same rules, and rows **declared here but not registered yet**, each saying so and naming the task
that registers it: until then the option is refused as unknown (exit `2`), appears in no `--help`, and
has no reference entry.

| Command | Flag | Behaviour |
|---------|------|-----------|
| `paths` | `--list` | Accepted for the planned drill-down view; it does not change the output yet. |
| `verify` | `--base <rev>`, `--introduced-at <rev>` | From `minor-v0.4` (`spec-020` §2.2): value options, each one revision resolved by `resolveRevision` (§6's `verify` rows). `--base` judges `<rev>..HEAD`, the commits reachable from `HEAD` and not from `<rev>`; without it every commit reachable from `HEAD` is judged. `--introduced-at` makes `<rev>` and its ancestors history, reported and not failing; without it every finding of the range is gated, and without either the command warns (`W_VERIFY_WHOLE_HISTORY`, §6). No positional (§1's surplus refusal); `--dry-run`, `--reason`, `--co-author` and `--ai-model` are not taken (unknown option, exit `2`). |
| `memory history` | — | No flag: one required positional, `<id>`. From `minor-v0.4` (`task-378`): every entry carries `carries` (§2's `Carries content:` declaration, or `null`), and an entry whose commit the checks of `spec-020` §4 flag, through the reader of `spec-020` §4.13, carries `unverified`: those findings, each `{rule, check, message}`, in `spec-020` §3's order. An entry no check flags has no `unverified` key and reads as before (`bug-496`). |
| `memory search` | `--type <type>` | A value option: keeps the documents whose frontmatter `type` equals `<type>` exactly, and scopes the `W_MEMORY_UNREADABLE` warnings to the files that type could hold (`task-314`, `bug-283`). Optional, no default (every type). A value `memory.yaml` does not declare, or an empty one, is no error: nothing matches, exit `0` with `no documents matched the query`. Given twice, the last value counts. Without a value, exit `2`, `option '--type <type>' argument missing`. |
| `memory search` | `--status <status>` | A value option: keeps the matches whose frontmatter `status` equals `<status>` exactly. Optional, no default. An archived status (`deprecated`, `superseded`) also lifts the default exclusion of archived documents (REQ-STATE-06, `dl-028`); any other value leaves it. A state no machine declares, or an empty value, is no error: nothing matches, exit `0`. Given twice, the last value counts. Without a value, exit `2`, `option '--status <status>' argument missing`. |
| `memory search` | `--tag <tag>` | A value option: keeps the documents whose frontmatter `tags` list holds `<tag>` exactly. Optional, no default. An empty value filters nothing; a tag no document carries matches nothing, exit `0`. Given twice, the last value counts (one tag per search). Without a value, exit `2`, `option '--tag <tag>' argument missing`. |
| `memory search` | `--verify` | From `minor-v0.4` (`task-378`, `bug-496`): a flag. A match whose history holds an entry `memory history` would mark carries `unverified`, the shas of those entries, oldest first; a match with none reads as without the flag. It reads one history per match, so it costs what `memory history` costs on each. |
| `capabilities` | — | No flag, no option and no positional (`spec-019` §1, from `minor-v0.4`): an operand is refused at exit `2` (§1), and so is any option §2 does not list for it. |
| `workflow start` | `--element <type>:<id>\|none`, `--title <t>`, `--set <name>=<value>` | `spec-017` §7.1, §3.4, §3.5: `--element` names the element a workflow that declares `element:` runs on (§7's element-ref; default: the active instance's bound element of that type; `none` is refused, exit `1`, `workflow '<name>' needs a <type> element: give --element <type>:<id>`). On a workflow that declares none it names the plan's context element, of any type, which must exist at `HEAD`, and `--element none` records no context (default: the active instance's bound element when that instance's workflow declares `element:`, else none; from `minor-v0.4`, `bug-413`). `--title` is the plan's title (default `<workflow> — <phase>`). `--set` is repeatable and overrides a derived plan value: only `phase=<v>` and `scope=<v>` are accepted — `phase` whether or not the plan type's patterns hold a `{phase}` token (written as a field when they do not), `scope` only as a token (`spec-017` §7.1, from `minor-v0.4`); any other name is a usage error (exit `2`, `invalid flag value: --set <name>: workflow start sets only phase and scope`), and §10's spelling errors apply unchanged. The `<id>` of `--element` may be a short reference (§7); the plan binds the full id. |
| `memory add` | `--workflow <ref>` | A value option: links the added document to a step of the open instance `<ref>` names — an instance id, or a workflow name (its most recently started open instance) — through the add commit's trailers `WingFoil-Instance: <instance-id>` and `WingFoil-Step: <key>` (`spec-017` §4.8, §7.10, ruling R16). The step is the one frontier step whose phase declares `memory.add` of the `--type` given; none, or several without `--step`, is refused (`CONFLICT`, exit `1`, `spec-017` §10). Without it, `memory add` links nothing and its commit is unchanged. |
| `memory add` | `--step <key>` | A value option: the frontier step to link to, by its key (`spec-017` §4.9), when several steps of the instance add the type. Needs `--workflow`: alone it is exit `2`, `missing required argument: --workflow`. A key not on the instance's frontier is refused (`CONFLICT`, exit `1`). A key without its scope names the one frontier step of that workflow and phase; several are refused, listing their keys (`CONFLICT`, exit `1`, `spec-017` §4.9, §10). |
| `workflow next` | `--assigned-to <who>` | An option with a value: keeps the frontier steps whose role `<who>` holds — `me` (the `team.members[]` entry whose email is the git identity's), a member's name or email, or a role name (`spec-017` §7.3, BDD P4.4 sc. 2). |
| `workflow finalize` | `--step <key>` | An option with a value: the frontier step to record, by its key (`<workflow>.<phase>[@<scope>]`, `spec-017` §4.9; without its scope, the one frontier step of that workflow and phase); without it, the instance's next step (`spec-017` §7.9). `--reason` on this command is §2's row, required only on a phase that declares `approval:`. |
| `workflow create` | `--kind main\|sub`, `--startable`, `--includable`, `--element <type>`, `--description <t>` | `spec-017` §7.7: the declaration is `--kind` (an option with a value, `main` or `sub`, else exit `2`, `invalid workflow kind '<k>' (allowed: main, sub)`) or one or both of the two flags `--startable` / `--includable`, never both forms (exit `2`, `--kind cannot be combined with --startable or --includable (declare one or the other)`) and never neither (exit `2`, `missing required argument: --kind, --startable or --includable`); `--kind main` is written `startable: true`, `--kind sub` `includable: true` (`dl-109` K1 (a)). `--element <type>` is the Memory type the workflow runs on, written as its `element:`; a type `memory.yaml` does not declare is refused because the result would not load (exit `1`, `spec-017` §10). `--description <t>` is its `description:`. The positional `<name>` must match `[a-z][a-z0-9-]*` (exit `2`, `invalid workflow name '<name>' (allowed: [a-z][a-z0-9-]*)`). |
| `workflow remove` | — | No flag: one required positional, `<ref>` — a workflow name, or an open instance id standing for its workflow (`spec-017` §7.8). |
| `workflow adopt` | `--step <key>`, `--element <type>:<id>`, `--plan`, `--apply` | From `patch-v0.3.1` (`spec-017` §7.11, `dl-187` rules 5–7). Two forms, never mixed; with neither `--plan` nor one of `--step` / `--element` it is exit `2`, `missing required argument: --step, --element or --plan`. **Single:** `--step` (a value option, a frontier step key, `spec-017` §4.9; default the one frontier step whose phase adds `--element`'s type) and `--element` (§7's element-ref; default the step's one candidate); `--reason` (§2's row) is required. **Plan:** `--plan` (a flag) proposes the adoptions and writes nothing; `--plan --apply` (`--apply`, a flag) writes them, one commit per step, and requires `--reason`. `--apply` without `--plan` is exit `2`, `invalid flag combination: --apply needs --plan`; `--plan` with `--step` or `--element` is exit `2`, `invalid flag combination: --plan proposes every step; drop --step and --element`. The positional `<ref>` is required. The `<id>` of `--element` may be a short reference (§7); the record names the full id. |
| `workflow rekey` | `--from <key>`, `--to <key>` | From `patch-v0.3.1` (`spec-017` §7.12): value options, both required (exit `2`, `missing required argument: --from` / `--to`), each a `<workflow>.<phase>` — two `spec-003` names (`[a-z][a-z0-9-]*`) joined by one `.`, with no `@<scope>` suffix (else exit `2`, `invalid flag value: --from must be <workflow>.<phase>`, or `--to`); `--reason` is required. The positional `<ref>` is required. |
| `workflow list` | `--all` | Lists every workflow the registry loads, not only the ones executable now: the includable workflows no open instance's frontier enters are listed too, with `executableNow: false` (`spec-017` §7.5, BDD P4.6 sc. 3). |
| `workflow status` | `--full` | From `minor-v0.4` (`spec-017` §7.4, `bug-341`): the console lists the ungated elements one line each instead of the summary line counting them per type. The `json` and `yaml` payloads are the same with or without it. |
| `workflow tree` | `--preview`, `--element <type>:<id>\|none` | From `minor-v0.4` (`spec-017` §7.13, `bug-485`): one required positional, `<ref>` — an open instance (a workflow name or an instance id) or a closed instance plan's id. `--preview` reads `<ref>` as a startable workflow's name and answers what `workflow start <ref>` would deduce, writing nothing; `--element` is `workflow start`'s (§7, `spec-017` §3.4, §3.5) and needs `--preview`: alone it is exit `2`, `invalid flag combination: --element needs --preview`. |
| `directive assign` | `--force` | Authorizes the whole-file rewrite of `roles.yaml` when the in-place edit cannot apply (`dl-062` Q1 option 3). Without it that case is §6's `CONFLICT` refusal. With it the file is written again from its parsed content in the one `wf(directive): assign …` commit, and the success carries §6's warning. `--force` does not force a rewrite: an edit the in-place editor can make is made in place, with no warning. A missing `roles.yaml` is written whole without the flag, since there is nothing to preserve. |
| `agent execute` | `--element <type>:<id>` | The target element (`spec-016` §3.1, §7's element-ref). With a step form it overrides the step's element and keeps the step's phase and role. The `<id>` may be a short reference (§7); the run records the full id. |
| `agent execute` | `--role <role>` | The role, a `team.roles` name; default the step's role, else `developer` with §6's warning. |
| `agent execute` | `--agent <name>` | The `team.agents` entry to launch; default the first, in declared order, with an `adapter` whose `executes_as` holds the role. |
| `agent execute` | `--next`, `--workflow <ref>`, `--step <key>` | The step forms (`spec-016` §3.1, `spec-017` §3.3, §4.9; task-235): take workflow, phase, element and role from the next step of the selected instance — `--next` a flag, `--workflow` and `--step` value options that imply it. At least one of `--next`, `--workflow`, `--step`, `--element` is required, else exit `2`, `missing required argument: --next or --element`. Without `--element`, a selected step that only waits for an approval, an approval record or another party is refused (exit `1`, `spec-016` §3.2 step 1, `dl-171` (c)). `--resume <run-id>` and `--ref <run-id>` are v0.4 (`spec-016` §7) and unknown options in v0.3. |
| `agent execute` | `--headless`, `--interactive` | From v0.4 (`dl-183` Q2 (a), `spec-016` §3.1, §3.2 step 7): flags choosing the launch kind over the step's phase `launch` (`spec-003` Layer 2), with a `warning:` line when the flag contradicts a declared kind. Both together are a usage error: exit `2`, `invalid flag combination: --headless cannot be combined with --interactive`, before the project is read. `--interactive` is this command's own flag, read from the command's options only: §2's global `--no-interactive` has no positive form, and `--no-interactive` keeps §2's meaning on this command (an `agent execute` collects no argument by prompt). A step whose role is human-only (`approver` always, `spec-002` § "Role binding") is never launched, whichever flag is given (`spec-016` §3.7 `HUMAN_ONLY_ROLE`). |
| `agent execute` | `--timeout <duration>` | From v0.4 (`dl-181` Q4 (a), `spec-016` §3.1, §3.3 step 15): a value option bounding the agent's run, `<n>s`, `<n>m` or `<n>h`, `<n>` a positive integer without a leading zero, at most `24h`; at expiry `SIGTERM`, then `SIGKILL` 10 s later, the run still recorded, exit `1` with `agent timed out after <duration>; run <run-id> recorded`. Spelling errors are usage errors decided before anything is read, in §10's `invalid flag value:` form: exit `2`, `invalid flag value: --timeout expects <n>s, <n>m or <n>h, got "<raw>"`, and `invalid flag value: --timeout must be at most 24h, got "<raw>"`. Under `--dry-run` it is checked and launches nothing. |
| `agent execute` | `--log <path>` | From v0.4 (`dl-182` Q2 (a), Q4 (a), `spec-016` §3.1, §3.5): a value option appending a copy of a headless run's output to the file `<path>`, resolved against the current directory and created owner-only when absent; the output still reaches stderr, and a `warning:` line names a `<path>` inside the project root that `git check-ignore` does not report ignored. The output may hold secrets and WingFoil never commits it. Usage errors, exit `2`, in §10's forms: a blank value, `invalid flag value: --log must not be blank`; a path that resolves into the active registry's directory under the project root (`spec-016` §3.1, §7), `invalid flag value: --log must not name a file under .wingfoil/run/, the active registry`, before the project is read; and `--log` on an interactive launch, `invalid flag combination: --log needs a headless launch, and this run launches interactive` — before the project is read when `--interactive` is given, otherwise once the launch kind is resolved (`spec-016` §3.2 step 7). A file that cannot be opened is exit `1`, `cannot write the log <path>: <cause>`, before the agent is spawned. Under `--dry-run` it is checked and the file is not created. |
| `agent list` | `--past`, `--waiting`, `--active`, `--element <type>:<id>`, `--phase <name>` | `spec-016` §5: `--past`, `--waiting` and `--active` select the past, waiting and active sections (none, or all three, select all three; `--active` from v0.4, `dl-181`, the running launches of the active registry, `spec-016` §7); `--element` and `--phase` are value options that filter every section (task-240). A malformed `--element` is exit `2`. |
| `agent show` | — | No flag: one required positional, `<run-id>` (`spec-016` §6). |
| `dna set`, `dna add`, `dna update`, `dna remove` | `--force` | Authorizes the whole-file rewrite of `dna.yaml` when the in-place edit cannot express the change (task-193, ruling R20/Q9, as `dl-062`). Without it that case is §6's `CONFLICT` refusal. With it the file is written again from its parsed content in the verb's one `wf(dna): …` commit, and the success carries §6's warning. As for `directive assign`, `--force` does not force a rewrite: an edit the in-place editor can make is made in place, with no warning. `dna.yaml` always exists when these verbs run, so there is no unflagged whole-file write. |

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

**Revision (2026-10-05, `task-180-add-memory-park-declared-returns-edge-optional-per`) — `memory park`
and WIP limits, per `dl-110` (`ready`; P1 (a), P3 (a), approve `6d12740d`).** §2's `park` row names its
bracket by rule — the type's `returns` target — rather than by this repository's one edge. The
paragraph after the `amend` rule declares the verb: its subject and body, no `Approver:`, and its
refusals. A second paragraph declares the WIP-limit refusal and the verbs it binds, and the chained
bracket's edge list gains the `returns` edge. The `--reason` row names `park` among the commands that
require it; §1's one-document sentence and §11's committed-baseline row name `memory park`. No other
rule changed. Edited in place without a supersede or a state change (`dl-047`); pending the approver's
`memory amend` at `task-180`'s review.

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

**Revision (2026-10-05, `task-193-keep-dna-yaml-comments-when-dna-set-dna`) — the four DNA write verbs
take `--force`, per approver ruling R20/Q9 (`release-planning-rel-v0.3-plan`: "`dna.yaml` refuses the
whole-file rewrite unless `--force` (as `dl-062`)").** §6 gains the `dna.yaml` refusal, pinned word for
word beside `directive assign`'s, and the `dna.yaml` warning beside the `roles.yaml` one; §12 gains the
`--force` row for `dna set`, `dna add`, `dna update` and `dna remove`. The behaviour is
`directive assign --force`'s, applied to the file `bug-019` and `bug-126` found rewritten without a
warning. No other section changed. Edited in place without a supersede or a state change (`dl-047`).

**Revision (2026-10-06, `task-184-bring-test-guard-prose-overclaims-line-what-asserts`) — the citation
behind §9's second outcome (`bug-096`).** §9 credited "§1's precedence rule" for `--version` winning
over an unprefixed entry field. §1 says only that a global may appear anywhere after `wingfoil`; the
word *precedence* is §2's, in the `--version` row ("Takes precedence over all other flags except
`--help`"). §9 now cites the two clauses separately. The same mis-citation stands in the second
2026-09-24 revision note above (§9 rewritten to `dl-082`'s grammar), which says "§1 gives a global
precedence"; that note is left as written, and is corrected here: §1 gives a global its placement and
§2 gives `--version` its precedence. No behaviour or rule changed. Edited in place without a supersede
or a state change (`dl-047`).

**Revision (2026-10-06, `task-210-add-dry-run-mutating-verb-through-commit-primitive`) — §2 gains
`--dry-run`, per `dl-106-memory-writes-on-a-dirty-tree` (`ready`) W2, and the intro's single exception
becomes two.** The flag is not registered on the root command like the other rows: it is added by the
command registrar to every command whose operation mutates, so a read command, `init` and `mcp` refuse
it as an unknown option rather than accept a flag that would mean nothing there — or, on `init`, run
for real. That is why its row, like `--reason`'s, names the commands that take it. A dry run prints the
success warnings the real run would (a rewrite warning worded as a plan), and its diff is computed from the
blobs the commit would record, with the hunk-shaping diff settings pinned (§2's row). The same task fixed
`bug-217`: a write whose commit git refuses (a hook, a full disk) now leaves the working tree and the
index of every path it wrote as they were, and fails with
`error: E_COMMIT_FAILED: git did not commit <paths>: <git's explanation> — nothing was committed, and
the working tree and the index are as they were` (exit `1`; the normative row is §6 "Pinned refusal
strings"), with the project root removed from git's text, where it used to print git's raw `Command failed: git -C <absolute path> commit …`. Edited in
place without a supersede or a state change (`dl-047`).

**Revision (2026-10-06, `task-195-role-session-mcp-prompt-accepts-element-state-returns`) — §7 states
the element-ref grammar.** §7 gave the form `<type>:<id>` and examples, but not what makes a ref
malformed. The `{role}-session` Prompt's `element` argument (`spec-004` §3.1, approver ruling R18) is a
second surface that takes one, beside `agent execute --element` (`spec-016`); §7 now lists it, states
the grammar (one `:`, both sides non-empty, no whitespace, control character or `-->`) and the refusal
text, and names the one core parser both surfaces use, so `task-218` inherits the same rules. No command,
flag or exit code changed. Edited in place without a supersede or a state change, as this file's
earlier Revision notes are.

**Revision (2026-10-06, `task-209-declare-submit-commit-what-content-carries-make-templates`) — the
`submit` body.** `dl-106` W1 (a), Action 1: §2's operation list gains the paragraph "`memory submit`
declares the content it carries", and the `submit` row of the verb table points to it. The subject is
unchanged and keeps no bracket (`dl-054`, release-planning ruling R20). Edited in place without a
supersede or a state change (`dl-047`), pending the approver's `memory amend` at `task-209`'s review.

**Revision (2026-10-07, `task-220-wingfoil-agent-show-run-id-prints-recorded-run`) — §2's `--format`
row names the one command whose `console` output is its own.** `agent show` ships, and `spec-016` §6
defines its console output as `key: value` lines in the record's key order, not the indented JSON §2
declares for every command until P5.1.4. §2 now states that exception in a sentence of its own and
names the seam it goes through (`CoreOperation.renderConsole`, `spec-006` §2), and §3's `--format`
help text (the one `src/cli/program.ts` registers) says `console prints indented JSON for now, unless
the command defines its own`. `agent show` was already in §1's noun list
and in §11's declared-`HEAD` row, so neither changes; nor do the flags, the exit codes or §6's error
format (its `hint:` line is the one §6 already allows). Edited in place without a supersede or a state
change (`dl-047`).

**Revision (2026-10-07, `task-204-reshape-workflow-list-add-workflow-show-both-answering`) — `workflow list`
reads `HEAD`; its `--all` flag.** `task-204` moves `workflow list` to the `HEAD` baseline `spec-017` §1.1
declares (ruling R15) and ships `workflow show` beside it, so §11's working-tree row loses "`workflow list`
until its v0.3 reshape" (both commands already sit in the declared-`HEAD` row), and §12 gains the one
command-specific flag the reshape adds, `workflow list --all`. No other row changes. Edited in place without a
supersede or a state change (`dl-047`); pending the approver's `memory amend` at `task-204`'s review.

**Revision (2026-10-07, `task-218-agent-execute-element-resolves-role-agent-adapter-assembles`) —
`agent execute` takes `--dry-run`, §11 names its baseline, and §6 pins its warnings.** The command ships registered
`mutates: true` (`spec-016` §8), so §2's `--dry-run` row lists it, and the row states its one
departure: the commit it would make records the agent's exit, so its plan is the launch, without
`message` or `diff`. §11's committed-`HEAD` row gains it (`spec-016` §3.2–§3.3: every gating read at
the one `HEAD` that is the run's `state_ref`), with its one declared exception: the MCP pre-flight's
server reads the working tree's `dna.yaml` at start-up (`spec-014` §1). §6's warnings paragraph drops
its interim sentence — `spec-005` §3.2 is amended in the same task — and says a warning raised while
a command runs is written when raised, through the registrar's warning sink (`bug-202`); its table
pins the default-role warning, `W_ADAPTER_IGNORED` and the unknown-field warning. No flag, exit code or error format changes: the command's
own grammar and the `agent list` / `agent show` rows are `task-228`'s amendment. Edited in place without
a supersede or a state change (`dl-047`).

**Revision (2026-10-10, `task-216-add-workflow-next-naming-next-step-verb-role`) — `workflow next
--assigned-to`.** `task-216` ships `workflow next`, already in §11's committed-`HEAD` row; §12 gains its one
command-specific option, `--assigned-to <who>` (a value, not a boolean flag). No other
row changes. Edited in place without a supersede or a state change (`dl-047`); pending the approver's
`memory amend` at `task-216`'s review.

**Revision (2026-10-10, `task-228-agent-execute-launches-agent-forwards-right-signals-records`) — §12
carries `agent execute`'s grammar and the `agent list` / `agent show` rows; §6 names the notice and the
stderr payload.** `agent execute` launches the agent (`spec-016` §3.3 steps 13–18): §12's preamble now
covers value options and rows declared before they are registered, and the table lists `agent execute`'s
value options as `spec-016` §3.1 states them, with the step forms marked as not registered before
task-235, and the `agent list` (task-240) and `agent show` rows. §6 gains the launch's warning texts and a paragraph on
the notice (the launch banner) and on the success report a command that hands its stdout to a child
prints on stderr, in the shapes a warning takes; the unknown-field row says `agent execute` prints each
once with a `HEAD:` label. No exit code changes. Edited in place without a supersede or a state change
(`dl-047`).

**Revision (2026-10-10, `task-274-count-wip-limit-holders-across-every-ref-and-exempt-reject-and-returns-edges-from-the-limit`) —
the WIP-limit refusal counts across refs and no longer binds `reject` or `park`.** `dl-156` (`ready`,
approve `f3354102`) Q2 (i): §2's WIP-limit paragraph lists the verbs the refusal binds without `reject`
and `park`, and the `park` paragraph drops its WIP refusal. Q1 (a): the holders are counted at the
decided commit and on every local and remote-tracking branch tip, a tip's copy counting only when
that ref changed the element's `status` since its merge-base with the decided commit (the approver's
ruling of 2026-10-11, option (a), at `task-274`'s review), and the refusal gains a closing sentence
saying so and where a holder another branch records is moved out; its first two sentences keep the
text `task-180` wrote, which `test/core/memory-wip-limits.test.ts` pins verbatim. §11's
committed-`HEAD` row names the count, merge-bases included, as the second declared baseline
(`command-baseline` 1.5). No flag or exit code changes. Edited in
place without a supersede or a state change (`dl-047`); pending the approver's `memory amend` at
`task-274`'s review.

**Revision (2026-10-10, `task-217-add-workflow-start-workflow-end-recording-instance-plan`) — the
`workflow` grammar of `spec-017` §7 and `workflow start --element`.** `task-217` ships `workflow start` and
`workflow end` (`spec-017` Consequences, "`spec-008` §1/§7"). §1 names the Workflow pillar's verbs and their
positional `<ref>`, with no `--name`; §7's table gains `workflow start --element`; §12 gains `workflow
start`'s three options, with the two refusals the implementation needed (`--element` on a workflow that
declares none, exit `1`; a `--set` name other than `phase` / `scope`, exit `2`); §2's `--dry-run` list gains
both commands and says the dry run of `workflow start` plans its first (`add`) commit only; §11's
committed-`HEAD` row gains both. `memory add --workflow` / `--step` stay `task-227`'s and `agent execute
--step` `task-235`'s. No exit code changes. Edited in place without a supersede or a state change
(`dl-047`); pending the approver's `memory amend` at `task-217`'s review.

**Revision (2026-10-10, `task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried`) — `workflow
finalize`.** `task-226` ships `workflow finalize`: §2's `--dry-run` list gains it, with its empty plan
(`paths: []`, no diff); §2's build-signature bullet now says every commit ends with a trailer paragraph
whose last line is `WingFoil-Version:`, and that a commit's own trailers — the phase record — open that
paragraph, because git reads trailers from the final paragraph
only (measured: a record in a paragraph of its own before the signature is not returned by
`%(trailers:only)`); §11's committed-`HEAD` row and §12 (`--step <key>`) gain the command. No exit code or
error format changes. Edited in place without a supersede or a state change (`dl-047`); pending the
approver's `memory amend` at `task-226`'s review.

**Revision (2026-10-10, `task-227-link-added-element-workflow-step-memory-add-workflow`) — `memory add
--workflow <ref> [--step <key>]`.** `task-227` ships the two value options `spec-017` §7.10 requires of
`memory add` (ruling R16); §12 gains a row for each, with `--step`'s dependency on `--workflow` (exit `2`)
and the refusals' exit `1`. The command already reads `HEAD` (§11), and the deduction that picks the step
reads it too (`spec-017` §11). No global flag, exit code or error format changes. Edited in place without a
supersede or a state change (`dl-047`), pending the approver's `memory amend` at `task-227`'s review.

**Revision (2026-10-10, `task-235-agent-execute-next-workflow-ref-step-key-take`) — §12's step-form row is
registered; §11 names the step forms' baseline.** `agent execute --next`, `--workflow <ref>` and `--step
<key>` ship (`spec-016` §3.1, §3.2 steps 1–3): §12's row no longer says the step forms are unregistered, and
`--element`'s row no longer says it is required until they ship; with a step form it overrides the step's
element and keeps the step's phase and role. §11's `agent execute` entry adds `workflow next`'s deduction,
whose commit is the one `HEAD` every other read of the run takes. No exit code changes. Edited in place
without a supersede or a state change (`dl-047`).

**Revision (2026-10-11, `task-211-add-workflow-create-workflow-remove-req-sec`) — `workflow create` and
`workflow remove`.** `task-211` ships both (`spec-017` §7.7–§7.8): §2's `--dry-run` list gains them (each plans
one commit of two paths, the workflow file and `workflows.yaml`); §11's committed-`HEAD` row gains both, with
the registry the commit would leave, which they load before writing, and the filesystem row gains `workflow
create`'s target-existence check (`dl-086`); §12 gains `workflow create`'s option `--kind`, flags
`--startable` / `--includable` and options `--element` / `--description`, with the usage refusals (exit `2`),
and `workflow remove`'s positional. No exit code or error format changes. Edited in place without a supersede
or a state change (`dl-047`); pending the approver's `memory amend` at `task-211`'s review.

**Revision (2026-10-11, `task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs`) — §12's `agent
list` row is registered; §2's `--format` row names every command with its own console text.** `agent
list` ships (`spec-016` §5): §12's row no longer says it is unregistered, and says that neither or both
section flags select both and that `--element` and `--phase` are value options. §2's `--format` row said one
command had console text of its own; `workflow next`, `status`, `start`, `end` and `finalize` had already
gained one (`spec-017`), and `agent list` adds another, so the sentence lists them. §11 already names `agent
list`'s baseline. No global flag, exit code or error format changes. Edited in place without a supersede or
a state change (`dl-047`).

**Revision (2026-10-13, `task-281-fix-workflow-deduction-inputs-not-open-refs-and-the-dev-loop-done-order-and-confine-path-tokens-to-the-type-s-folder`)
— §10: a `--set` value is confined to its type's folder.** `bug-325`: a `--set` value with `..` segments moved a new
document out of its type's folder to anywhere inside the project root, `.wingfoil/` included, for `memory add` and
`workflow start` alike. Three spelling rows (exit `2`: an absolute value, an empty segment, a `.` or `..` segment,
approver rulings 2026-10-12 D3) and one row decided by the committed `path` (exit `1`, `E_PATH_OUTSIDE_TYPE_FOLDER`,
ruling D1, keeping this section's line between spelling and committed state). The paragraph's "first five" / "last
three" counts, stale since the `date` and `author` rows, now say "the rows with exit `2` / `1`". Edited in place
without a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-10-15, `task-284-report-a-git-that-cannot-be-run-as-could-not-run-git-keeping-req-sec-01-s-message-for-an-unset-identity`)
— §6: a git that cannot be run has its own pinned refusal.** `bug-377`: the identity check swallowed every failure of
its `git config` spawn, so a git that never ran (`ENOENT`, `EACCES`, `EPERM` in an agent sandbox) was reported as
`git identity not configured (user.name/user.email)`. One row in "Pinned refusal strings": `could not run git:
<cause>`, exit `1`, code `IO`; REQ-SEC-01's message stays for a git that ran, whatever its non-zero exit (approver
rulings 2026-10-15 D1, D2). `agent execute` is the one exception the row names: it reads `HEAD` (`spec-016` §3.3
step 2) before its identity check (step 5), so an unrunnable git reaches it as `E_GIT_READ_FAILED: git rev-parse HEAD
failed in <root>: spawnSync git <code>` (the task's independent review, finding F1). Edited in place without a supersede or a state change (`dl-047`), pending the approver's
`memory amend`.

**Revision (2026-10-21, `release-planning-rel-v0.3.1-plan`, identify-specs) — `workflow adopt` and `workflow
rekey`.** For `patch-v0.3.1` (P4.21, `cp-002`, REQ-STATE-11, `dl-187`, `spec-017` §7.11–§7.12): the Workflow verbs (§1), `--dry-run`'s
command list and the empty-commit plan (§2), the provenance records in the build-signature paragraph and among the
subjects that are not Memory operations (§2), the baselines (§11), and the two commands' flags (§12). Approver ruling
of 2026-10-21: `--plan` proposes, `--plan --apply` writes — the BDD's form, read for `dl-187` rule 6's "`--plan` …
`--apply`". Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-10-26, `task-295-add-workflow-rekey-p4.21`) — §12's `workflow rekey` row.** As the approver ruled at
`task-295`'s design gate (D2, 2026-10-24) and review (finding 3, 2026-10-26): `--from` and `--to` are each two
`spec-003` names (`[a-z][a-z0-9-]*`) joined by one `.`, with no `@<scope>` suffix; the refusal names the option it
refuses. Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-10-29, `task-311-resolve-directive-remove-against-head-not-the-working-tree-dl-080`) — §11's
"working tree, a defect" row is removed.** `directive remove` resolves the directive its `<name>` names at `HEAD`
(`bug-108`, `dl-080` (B)), so it joins the committed-at-`HEAD` row beside its referrer check: a directive no commit
records is `unknown directive: <name>`, and the working tree only words that refusal; a directive `HEAD` records but
the working tree deleted or edited meets the write guard. No command is left on the working tree as a defect. Edited
in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-10-30, `task-315-give-help-a-closest-command-hint-and-a-true-message-for-help-help`) — §5's
exit-`2` reading of `wingfoil help <unknown>` is corrected, per `bug-115` and `task-315`'s review.** §5 classed it as a
missing required argument, beside a noun invoked without its verb; the CLI has emitted `unknown command '<name>'` for it
since `task-103`, and since `task-315` with the same closest-command `hint:` line as the direct path. §5 now names it an
unknown command. The exit code (`2`) and every other rule are unchanged; `wingfoil help help` stays an explicit request
for help by name, at exit `0`. Edited in place without a supersede or a state change (`dl-047`), pending the approver's
`memory amend`.

**Revision (2026-10-30, `task-313`, the task validating `memory.yaml` id patterns and type paths)
— §10's `E_PATH_OUTSIDE_TYPE_FOLDER` row no longer names a literal `..` as its cause.** `bug-360`: a type `path`
that is absolute or holds a `.`/`..` segment is now refused when `memory.yaml` loads (`spec-001`, `E_VALIDATION`,
exit `1`), before `memory add` renders anything, so it never reaches this row. The row keeps the guard as defence
in depth and names the cause that can still reach it: a token value that carries the rendered path out of the
folder, which the `--set` spelling rows above refuse first for a value given on the command line (approver design
gate 2026-10-30, D5 (a)). Its message and exit code are unchanged. Edited in place without
a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-10-31, `task-324-tell-an-unparseable-git-config-apart-from-a-missing-git-identity`) — §6's pinned
refusal strings gain `could not read git configuration: <git's message>`, per `bug-379`.** The identity check read every
non-zero exit of `git config` as an unset identity, so an unparseable `.git/config` (exit `128`) was reported as
"git identity not configured". Only exit `1` (no key matches) now keeps REQ-SEC-01's message; any other outcome is the
new `IO` refusal, exit `1`, naming git's own message (approver design gate 2026-10-31, D1 yes, D2 (a), D3 yes). The
`could not run git` row's last sentence is narrowed to exit `1` accordingly. Edited in place without a supersede or a
state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-01, `task-332-resolve-a-short-element-reference-prefix-and-number-or-a-unique-prefix-of-the-full-id-in-the-memory-verbs`) — §7 gains
"Short element references"; §6's pinned refusal strings gain the `ambiguous reference` row; §12's `workflow start`,
`workflow adopt` and `agent execute` rows name it.** The Memory verbs and `--element` took a full id only, and ids with
descriptive titles are long. A reference `<type prefix>-<n>` or a unique prefix now resolves, an ambiguous one is
`CONFLICT` and lists every candidate (approver design gate 2026-11-01, D1 (b), D2 (a), D3 (a), D4 (a), D5 (a), D6 (a),
D7 (a), D8 (a), D9 (a), D10 (a), D11 (a)). Edited in place without a supersede or a state change (`dl-047`), pending the
approver's `memory amend`.

**Revision (2026-11-07, `task-354-remove-the-import-cycles-between-src-core-and-src-agent-and-the-surface-imports-bypassing-src-core`)
— §6's unknown-field row says every command that resolved `HEAD` labels the file `HEAD:`.** The readers at a revision
labelled a file with whatever revision their caller passed, so `workflow list`, `show`, `next` and `status`, `agent list`
and `agent show` printed the warning under the 40-hex sha they had resolved, while `agent execute` rewrote its own
warnings to `HEAD:` after the fact (`bug-317`). The readers take the label from their caller now, every caller that
resolved `HEAD` passes `HEAD`, and the rewrite is gone. No exit code and no other text changes. Edited in place without a
supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-07, `task-345-open-an-instance-only-from-a-plan-workflow-start-marked-and-fix-the-element-less-start-context`)
— §2 (`--dry-run`, the commit subject list, the build-signature note), §7 and §12's `workflow start` row.** `workflow
start`'s add commit carries the start marker `WingFoil-Start: <workflow>` in its final trailer paragraph, which makes
its plan an instance (`spec-017` §3.1–§3.2, `dl-217` (a)); the build-signature note also lists the step linkage of
`memory add --workflow`, a trailer of the same kind it did not name. `workflow start --element` takes `none`, and on a
workflow that declares no element names its context instead of being refused (`spec-017` §3.5, `bug-413` option (c)).
Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend` at `task-345`'s
design gate.

**Revision (2026-11-07, `task-335-add-the-headless-work-run-the-launch-phase-key-headless-interactive-timeout-next-on-a-waiting-step`)
— §2's `--dry-run` row and §12's `agent execute` rows.** `agent execute` gains the flags `--headless` and
`--interactive` (`dl-183` Q2 (a)) and the value option `--timeout <duration>` (`dl-181` Q4 (a)), each with its usage
errors, and its step forms refuse a step that only waits (`dl-171` (c)). `--interactive` is a command flag distinct
from §2's negatable global; the `--timeout` spelling errors take §10's `invalid flag value:` form, and §10 itself does
not change. A dry run of `agent execute` warns at the terminal check instead of refusing (`bug-392`). Edited in place
without a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-08, `task-346-fix-workflow-start-s-plan-leave-it-to-be-written-fill-workflow-and-phase-always-and-make-the-dead-test-fail`)
— §2 (`--dry-run`) and §12's `workflow start` row.** `spec-017` §7.1 as `task-346` amends it: `workflow start` writes
one commit, the plan's `add`, and leaves the plan `draft` for its author to write and submit (`bug-390`), so §2 no
longer lists its `submit` commit among what a dry run does not predict; `--set phase=` is accepted whether or not the
plan type's patterns hold a `{phase}` token, written as a field when they do not (`bug-491`), and `--set scope=` stays
a token only. Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend`
at `task-346`'s design gate.

**Revision (2026-11-08, `task-356-pin-codex-s-c-override-behaviour-record-codex-cli-session-ids-and-resolve-an-unscoped-step-key`)
— §7 and §12: an unscoped `--step` key.** `spec-017` §4.9 now resolves a `--step` key given without its scope to the
one frontier step of that workflow and phase, and refuses several (`bug-468`). §7's closing sentence, which listed
`--step` among the exact values, says that `--step` takes no prefix and drops a scope only by that rule; §12's
`memory add --step` and `workflow finalize --step` rows say so (the `workflow adopt` and `agent execute` rows cite
`spec-017` §4.9 already). No exit code changes. Edited in place without a supersede or a state change (`dl-047`),
pending the approver's `memory amend`.

**Revision (2026-11-11, `task-339-declare-an-adapter-s-launch-permissions-per-role-and-print-the-selected-fragment-in-dry-run`)
— §2.** The `--dry-run` row's `agent execute` plan gains `launch: {kind, permissions}`, the launch kind and the
permission fragment the launch would append for the run's role (`spec-016` §3.3, `dl-223` Action 3). No flag, exit code
or other plan changes. Edited in place without a supersede or a state change (`dl-047`), pending the approver's
`memory amend`.

**Revision (2026-11-12, `task-334-write-the-agent-attribution-trailers-from-the-mutating-verbs-and-restate-agents.md-5.1-for-l0-spec-018-2`)
— §2 and §6: the agent markers and the attribution trailers.** `spec-018` Consequences asks §2 for the `--co-author`
and `--ai-model` rows (every `mutates: true` command but `agent execute`, like `--dry-run`), the two keys reserved on
an approval in the `--reason` row, and the agent trailers in the build-signature note; and §6 for the `E_AGENT_CONTEXT`,
`E_AGENT_TRAILER_ON_APPROVAL` and `spec-018` §2.5 rows. The `--ai-model` row also states what `spec-018` §2.4 leaves
open, as ruled at the design gate: a blank value, the one-line rule applied to `WINGFOIL_AGENT_MODEL`, and the
trimming. The two warnings of `spec-018` §2.3 join §6's warning table. No exit code changes. Edited in place without
a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-12, `task-350-add-the-global-project-dir-option-naming-the-project-root-documenting-why-it-is-not-inferred`)
— §1, §2 and §11: the global `--project <dir>`.** `dl-198` (a), ratified with (c)'s documentation: §2 gains the
`--project <dir>` row, a global flag every command accepts, `init` and `mcp` included, which names the project root
instead of the current directory and is refused with `E_NOT_AT_GIT_ROOT` when `<dir>` is not itself a git root; §1's
order of usage checks places its blank-value refusal (exit `2`) just before the root step; §11 says the flag changes
the repository, never the baseline. Without the flag nothing changes: the root is still the current directory and is
never resolved upwards (`dl-198` (b) was not taken). No other flag, exit code or message changes. Edited in place
without a supersede or a state change (`dl-047`), pending the approver's `memory amend` at `task-350`'s design gate.

**Revision (2026-11-14, `task-340`)
— §5 `agent execute` row: the human-only refusal.** `dl-202` item 1 generalizes `spec-016` §3.7's `APPROVER_ROLE` row to
`HUMAN_ONLY_ROLE` (`spec-016`, the same task): the `--headless`/`--interactive` row now says a step whose role is
human-only, `approver` always, is never launched whichever flag is given. The message for `approver` is unchanged; no
flag, exit code or other message changes. Edited in place without a supersede or a state change (`dl-047`), pending the
approver's `memory amend` at `task-340`'s review.

**Revision (2026-11-16, `task-336-forward-a-launched-agent-s-output-to-the-caller-with-an-optional-log-copy-and-keep-the-active-run-registry`)
— § 12 command flags: `agent execute --log`, `agent list --active`; § 11: the active section's baseline.** `dl-182`
Q2 (a), Q4 (a): §12 gains the `agent execute` row for `--log <path>`, a copy of a headless run's output, with its two
usage errors in §10's `invalid flag value:` / `invalid flag combination:` forms and its exit-`1` refusal; `dl-181`:
the `agent list` row registers `--active` (none, or all three section flags, select all three) instead of calling it
an unknown option. §11's declared-`HEAD` row says that `agent list`'s active section reads the git-ignored registry in
the working tree (`spec-016` §5.1). §10 is unchanged: `--log`'s errors only reuse its message forms, and nothing of
`memory add --set` changes. No other flag, exit code or message changes. Edited in place without a supersede or a
state change (`dl-047`), pending the approver's `memory amend` at `task-336`'s design gate.

**Revision (2026-11-16, `task-336-forward-a-launched-agent-s-output-to-the-caller-with-an-optional-log-copy-and-keep-the-active-run-registry`,
review) — § 12 command flags: `agent execute --log` in the active registry's directory.** The independent review found that a `--log`
path in the active registry's directory is git-ignored, so no warning names it, and the next reader of the active registry prunes
it as no entry (`spec-016` §7). `spec-016` §3.1 now refuses such a path; §12's `--log` row gains that usage error, exit
`2`, in §10's `invalid flag value:` form, decided before the project is read. No other flag, exit code or message
changes. Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend` at
`task-336`'s review fix round.

**Revision (2026-11-17, `task-337-record-token-counts-result-n-a-and-the-agent-version-before-and-after-in-a-claude-code-run-record`,
review fix round 2) — §2's warnings table, the `agent execute` post-run lookup row.** `spec-016` §2.6 (the same task)
makes `usage.from` a list of sources tried in order, the first that yields a value winning, so a usage source that fails
or carries a value of the wrong type may be followed by one that supplies the model and the counts: the failed usage
lookup's warning ends `model and tokens not read from it` (the form the headless output's warning has) and the usage
lookup's wrong-type warning ends `not read from it`, in place of `recorded as not-reported`. The row also follows that
task's version reads: `version_args` is read before the launch and after the run, each failure naming its side and
its field (`agent_version`, `agent_version_after`). The session lookup's texts are unchanged: no other source supplies
the session. No exit code or other message changes. Edited in place without a supersede or a state change (`dl-047`),
pending the approver's `memory amend` at `task-337`'s review fix round 2.

**Revision (2026-11-19, `task-375-tell-an-operator-with-no-approver-how-to-grant-it-and-render-every-error-detail-with-one-warning-prefix-dl-071`)
— §6: the authority refusal's hint, `E_NOT_A_MEMBER`, one warning prefix, and the `agent execute` warnings the table
left out.** Four changes, each a defect or a ruled decision. *The hint* (`dl-071` (B), `ready`, sub-question S3): the
pinned-refusal table gains the authority refusal's row, its REQ-SEC-03 reasons unchanged and a `hint:` line, when no
member of the committed `dna.yaml` holds `approver`, naming `team.members` and the role, so an operator of a freshly
initialized project is told how to grant it instead of meeting a bare denial. *`E_NOT_A_MEMBER`* (`bug-536`): the
membership refusal `task-333` shipped, with its exit code and the operations that raise it, which only `spec-006` §7 and
`spec-017` §10 named. *The prefix* (`bug-304`): `init` and `mcp` install the warning sink the registrar installs, and a
warning raised outside any sink is written with the same `warning: ` prefix, defined once, where it used to read
`Warning: `. *The claim* (`bug-548`): the table pinned part of `agent execute`'s post-run warnings while the sentence
above it claimed them all; it gains four rows (the version change, the headless output's usage and session reasons, the
transcript source), and the sentence now names the warnings it leaves to `spec-016`. No exit code changes; no reason
changes. Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend` at
`task-375`'s design gate.

**Revision (2026-11-20, `task-375-tell-an-operator-with-no-approver-how-to-grant-it-and-render-every-error-detail-with-one-warning-prefix-dl-071`)
— §6: two more `agent execute` warning families named outside the claim.** `task-375`'s review found that the sentence
before the warnings table still left two families of `agent execute` warnings neither pinned nor named (`bug-548`'s
Expected Behavior): the workflow deduction's diagnostics, written one `warning:` line each (`src/agent/execute.ts`,
`W_UNCOMMITTED_INPUTS` among them), and the run log's symbolic-link warning (`src/agent/run-log.ts`,
`W_RUN_LOG_SYMLINK`). The sentence now names both among the warnings `spec-016` words. No table row, exit code or
reason changes. Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory
amend` at `task-375`'s review.

**Revision (2026-11-20, `task-362-add-wingfoil-capabilities-and-the-wingfoil-capabilities-resource-spec-019-task-a`)
— `capabilities`, the command that reads no project.** `spec-019` (`approved`, "Amendments owed") adds the flat
command `wingfoil capabilities` (P5.1.5). §1 names it in the grammar comment, the `<noun>` bullet and beside `paths`
as a self-named operation, and "one order of usage checks" says that a command that reads no project keeps the
checks up to the blank-`--project` refusal and skips the root step; §2's `--project` row says the same for the
value; §11 gains the row "the build, no project"; §12 states that `capabilities` declares no flag. No §6 row: the
command adds no refusal or warning text of its own (`spec-019` §2). The command count is not written here; the
`user-docs` phase writes it once the release's commands are known. Edited in place without a supersede or a state
change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-20, `task-367-register-the-memory-tools-on-the-production-mcp-server-and-refuse-the-approver-gated-verbs-over-mcp`)
— §5: a refused option value keeps exit `2`, per `dl-199` (b).** `dl-199` (`ready`) ratified (b): a refused value stays a
usage error, documented as the rule for every refused value, because the v0.4 MCP Tools report a refusal as an `isError`
result. §5 gains the paragraph that states it and lists the refused values of today. No exit code, message or command
changes. Edited in place without a supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-20, `task-373-report-the-deduction-readers-diagnostics-as-stderr-warning-lines-dl-176`)
— §2 and §6: the deduction readers' diagnostics.** `dl-176` (a) (`ready`): the `--format` row says that `workflow
next`, `workflow status` and `agent list` keep stdout to the answer, and §6's warnings table gains the row of their
diagnostics, one success warning per entry of the payload's `diagnostics`, `<code> (<file>): <message>`, the form
`agent list` and `agent execute` already print (`spec-016` §3.3, §5). This builds on the one console prefix of
`task-375`'s revision (`2f30562d6`). No exit code, payload or reason changes. Edited in place without a supersede or a
state change (`dl-047`), pending the approver's `memory amend` at `task-373`'s design gate.

**Revision (2026-11-21, `task-380-fix-help-with-a-second-operand-help-help-and-paths-help-s-category-list`)
— §1, §2, §4, §5 and §8: the help command's path, and the negatable globals as registered.** `bug-452`: the help
command took one operand and dropped the rest, so `wingfoil help memory add` printed `memory`'s help and
`wingfoil help memory addd` exited `0`; §8 now states that its operands are a command path, walked level by level,
the first operand naming no command of the level reached being §5's unknown command with §1's `hint:` line, and §1
says that the at-most-one-positional rule does not count them. `bug-456`: §8 gives the usage line of the help
command's own help at each level. `bug-514`: §2 named the globals `--color` and `--interactive` and called their
positive forms legal, while the program registers only `--no-color` and `--no-interactive` (§3's pattern), so the
positive forms exit `2` as unknown options; §2's two rows and its Note now name the registered forms, say the
positive form is refused, and say why `--interactive` is not registered globally: it would take `agent execute`'s
own `--interactive` (`task-335`'s revision). `--color` is the same defect as `bug-514`, fixed with it. §4's TTY row
names the default without the positive form. This builds on `task-315`'s revision of §5 (the help command's unknown
command and `help help` at exit `0`). The exit codes of §5 do not change; what changes is which invocations
reach the exit-`2` row: a help path with an operand naming no command, `wingfoil help memory addd` and
`wingfoil help help help` (which printed a help at exit `0`) among them. Edited in place without a supersede or a
state change (`dl-047`), pending the approver's `memory amend` at `task-380`'s design gate. At `task-380`'s review,
§8 also states that the help command's path ends at the first option token, and §12's `agent execute --interactive`
row says that §2's global `--no-interactive` has no positive form.

**Revision (2026-11-21, `task-365-ship-wingfoil-verify-with-the-generic-authority-and-state-checks-spec-020`)
— `verify`, the check of committed history.** `spec-020` (`approved`, OQ-1 to OQ-7 ruled as recommended, "Amendments
owed") adds the flat command `wingfoil verify` (P1.14). §1 names it in the grammar comment, the `<noun>` bullet and
beside `paths` and `capabilities` as a self-named operation, and "one order of usage checks" places its own checks
after the root step; §5 gains the fourth case, a completed check whose verdict fails exits `1` after its report, and
says that its revision values are `resolveRevision`'s (exit `1`), a blank one exit `2`; §6 gains `verify`'s three
refusal rows and its warning `W_VERIFY_WHOLE_HISTORY`, and the sentence that it prints no unknown-field warning for a
configuration blob read from history; §11 gains the row "committed history"; §12 the row of `--base` and
`--introduced-at`. The command count is not written here; the `user-docs` phase writes it. Edited in place without a
supersede or a state change (`dl-047`), pending the approver's `memory amend`.

**Revision (2026-11-23, `task-374-read-a-workflow-run-closed-runs-an-instance-s-phase-tree-what-a-start-would-deduce-bug-485-bug-487-w1-r12`)
— §1, §11 and §12: `workflow tree` and `workflow status --full`.** `spec-017` §7.4 and §7.13, amended at the same
gate: §1's list of the Workflow pillar's verbs gains `tree`; §11 puts it with `workflow status` among the declared
`HEAD` reads, naming the one other commit a closed run is read at; §12 gains the rows of `workflow status --full`
(`bug-341`, a console flag) and of `workflow tree`'s `--preview` and `--element` (`bug-485`), with the usage error of
`--element` alone. No global flag, exit code or message of another command changes. Edited in place without a
supersede or a state change (`dl-047`), pending the approver's `memory amend` at `task-374`'s design gate.

**Revision (2026-11-24, `task-378-mark-the-memory-history-entries-no-check-verified-and-check-carries-content`) — §2's
reason rule refuses a reason that states nothing; `memory history` reads the `Carries content:` line and marks what no
check verified.** As `task-378`'s design gate rules: §2's unrecordable-value row gains a sixth case, judged after the
control characters — the whole reason one `<…>` placeholder, or text holding no word — refused at exit `2` on every
verb that takes `--reason` with `invalid flag value: --reason must state a reason: it holds no word, or only a
<placeholder>` (`bug-498`); `memory submit`'s declaration paragraph says where the line is read back (`bug-287`,
`spec-020` §4.14); §11 names the committed-history read of the mark; §12 gains the `memory history` row (its `carries`
and `unverified` fields) and `memory search`'s `--verify` (`bug-496`), and, as the approver ruled at that gate (W0-R10), the
rows of `memory search`'s three shipped value options `--type`, `--status` and `--tag`, which the table, by its own
opening, lists and had left out (worded from `memorySearchFn` and `searchMemoryDocuments` at `8c1ed9aa7`). Edited in place without a supersede or a state
change (`dl-047`), pending the approver's `memory amend`.
