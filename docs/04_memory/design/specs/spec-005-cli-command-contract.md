---
id: spec-005-cli-command-contract
type: tech-spec
title: "CLI command contract — exit codes, output formats, error format"
status: approved
scope: "src/cli"
supersedes: ""
tmpl_version: 260703
---

## Context

Every `wingfoil` command — regardless of pillar (`memory`, `dna`, `directive`, `workflow`, `agent`) or
flat command (`init`, `mcp`, `paths`, `audit`; `init` and `mcp` are the bootstrap commands,
`spec-008-cli-grammar` §1) — is consumed by two audiences that need a **stable, predictable
contract** independent of the specific command's arguments: (1) humans reading console output, and
(2) scripts, CI pipelines, and other tools parsing exit codes and structured output.

Without a single shared definition of exit codes, output-format switching, and error-message shape,
each command implementation would invent its own conventions — divergent exit codes for the same class
of failure, inconsistent `--format json`/`--format yaml` shapes, ad-hoc error strings that can't be
parsed or scripted against. That divergence breaks REQ-INT-04 (exit-code contract), REQ-INT-05
(machine-readable output formats), and REQ-INT-08 (consistent CLI error format), and undermines the
Determinism Index: two agents implementing two different commands must produce output that composes
predictably in CI without either one having read the other's code.

This spec defines that shared contract — the **exit-code / output-format / error-message layer** — as
a single source of truth that every command implementation in `src/cli` and every CLI-* command spec
built on top of it must conform to. It does **not** define the invocation grammar, the command map, the
global-flags surface, or the interactive-prompt layer (see spec-008-cli-grammar); it also does not
define command-specific arguments, flags, or success-output schemas (each command's own spec owns
those, subject to the format rules here).

## Specification

### 1. Exit-code contract (REQ-INT-04)

Every `wingfoil` invocation terminates with exactly one of three exit codes:

| Code | Name                    | When                                                                                                   |
|------|-------------------------|----------------------------------------------------------------------------------------------------------|
| `0`  | Success                 | The command completed successfully; any requested Memory/DNA/Directives/Workflow mutation was applied. |
| `1`  | User / logic error      | The invocation was well-formed but failed on business logic: element not found, illegal state transition, validation failure, git operation failure, missing/invalid credentials. |
| `2`  | Usage / argument error  | The invocation itself is malformed: unknown command/pillar/verb, unknown flag, missing required argument, an operand beyond the one the command declares (`spec-008-cli-grammar` §1), invalid flag value (e.g. `--format` not in `console\|json\|yaml`). |

Rules:

- Exactly one process exit call per invocation; all exits route through a single exit function so the
  mapping above cannot be bypassed by an uncaught code path.
- A non-zero exit code (`1` or `2`) is **always** accompanied by an error message on stderr in the
  format defined in §3 below — a bare non-zero exit with no message is a contract violation.
- A **noun invoked without its verb** (`wingfoil dna`), `wingfoil` invoked with no command at all, and
  `wingfoil help <unknown>` are **"missing required argument"** in the row above — the third case
  already enumerated there, not a fourth one. The verb is a required argument of the noun, so its
  absence makes the invocation malformed: exit `2`, and — because the rule above admits no exception —
  an `error: ` line naming what was missing, even where the argument parser answers such an invocation
  by printing the command's usage. Printing that usage is not itself the error message.
- `--help` and `--version` always exit `0`, even if other arguments on the same invocation are invalid
  (they take precedence and short-circuit the rest of parsing). So does an explicit request for help
  by name (`wingfoil help`, `wingfoil help <known-command>`): a request the CLI satisfied is a success,
  and it is distinct from the incomplete invocation above even when the two print the same text.
- Read-only commands (`memory search`, `dna show`, `workflow status`, `paths`, …) can only exit `0`
  (found/empty result) or `1` (e.g. malformed query); they never exit `2` once argument parsing has
  succeeded.
- This is a **three-code** contract: `0`/`1`/`2` only. There is no dedicated dry-run or interrupt exit
  code reserved by this spec — a command that adds a `--dry-run` mode or handles `SIGINT` still reports
  through `0`/`1`/`2` per the rules above, and defines the exact mapping for its own case in that
  command's own CLI-* spec.

- The exit never loses output. The single exit function ends the process only once everything
  written to stdout and stderr has been written to the pipe: a payload larger than a pipe's buffer
  arrives whole, with the command's exit code. When the reader has gone away (`EPIPE`), the process
  still ends with that code. There is no drain timeout, so a reader that stays open without reading
  keeps the CLI waiting — the normal behaviour of a Unix writer, and a change from 0.2.x, which exited
  at once and dropped the rest.

```ts
// src/cli/exit.ts
export type ExitCode = 0 | 1 | 2;

// Ends the process now when nothing is queued; otherwise sets `process.exitCode = code`, calls
// `process.exit(code)` once the queued stdout/stderr writes complete (or fail with EPIPE), and
// returns `true` ("deferred") to its caller.
export function exitWith(code: ExitCode, message?: string): boolean {
  if (message) process.stderr.write(message + '\n');
  const queued = [process.stdout, process.stderr].filter((s) => s.writableLength > 0);
  if (queued.length === 0) {
    process.exit(code);
    return false;
  }
  process.exitCode = code;
  // … one empty write per queued stream; the last one to complete calls process.exit(code)
  return true;
}
```

### 2. Machine-readable output formats (REQ-INT-05)

Every command accepts a `--format` option with three values; `console` is the default when the flag is
omitted.

```
--format console | json | yaml
```

| Value     | Destination | Audience                          | Notes                                                          |
|-----------|-------------|------------------------------------|-------------------------------------------------------------------|
| `console` | stdout      | Humans (default)                  | Free-form, colour-capable, may include prefixes/formatting.       |
| `json`    | stdout      | Scripts, CI, dashboards            | A single JSON value on stdout — must parse with a standard JSON parser (e.g. `JSON.parse`). |
| `yaml`    | stdout      | Scripts, CI, dashboards            | The same logical structure as `json`, serialized as YAML.         |

Contract rules:

- An invalid `--format` value is a **usage error**: exit `2`, message `error: invalid --format value
  "<value>", expected one of: console, json, yaml`.
- For `json`/`yaml`, stdout carries **only** the structured payload — no banners, progress lines, or
  colour codes interleaved with it. Diagnostic/progress output (if any) goes to stderr regardless of
  `--format`.
- The payload *shape* per command (success case) is owned by that command's own spec (e.g. `paths
  --format json`, `workflow status --format json`); this spec only fixes the *envelope* rules that
  apply uniformly: stdout-only, single top-level value, no extraneous output mixed in.
- Error payloads under `--format json`/`--format yaml` follow the structured error shape in §3.2,
  regardless of which command raised the error — this part of the shape is not command-specific.

```ts
// src/cli/output.ts
export type OutputFormat = 'console' | 'json' | 'yaml';

export function isValidFormat(value: string): value is OutputFormat {
  return value === 'console' || value === 'json' || value === 'yaml';
}
```

### 3. Consistent error format (REQ-INT-08)

#### 3.1 Console format (`--format console`, default)

A single-line, script-greppable prefix, on **stderr**:

```
error: <reason>
```

- `<reason>` is a human-readable, lower-case-initial sentence fragment (no trailing period), e.g.
  `error: element not found: task/task-999`.
- Every error line begins with the literal token `error: ` — this is the invariant other tooling can
  grep for; it is not itself a symbolic code.
- An optional second line may suggest a fix, prefixed `hint: `:
  ```
  error: unknown command 'memorey'
  hint: did you mean "memory"?
  ```
- **Details** (`dl-055` option 1): when the error carries operator-facing details — for each issue
  in `CoreError.details.issues`, the `file` it was found in and/or the `detail` that explains a pinned
  contract message (`dl-032` option (c)) — one line per issue follows, indented by two spaces, as
  `<file>: <detail>` or whichever of the two the issue has; an issue with neither adds no line. A
  `file` the reason already contains verbatim is not repeated (a validation reason usually embeds
  `(<file>)`): the line keeps the `detail`, and an issue left with neither adds no line. The
  `error: ` line stays first and unchanged, and a continuation line of a multi-line detail is
  indented too, so no detail line can begin with `error: ` or `hint: `:
  ```
  error: illegal transition approved -> (none) for type 'task'
    docs/memory/task/task-200.md: illegal `submit` from "approved": a `waiting` state — its forward edge fires only via a Workflow action, not `submit`
  ```
- **Unknown-command suggestion:** when a command token — the first one after `wingfoil` (and any
  recognized global flags), or a verb under its noun — matches no known command at that level, the CLI
  computes the closest command **at that level** and, when one is close enough, writes the `hint:`
  line shown above, in exactly that wording: `did you mean "<name>"?`. If no command is close enough,
  the `hint:` line is omitted. "Close enough" is `spec-008-cli-grammar` §1's Levenshtein distance ≤ 2;
  the nearest command wins, and a tie goes to the one first in code-unit order, so the hint is a
  function of the token and the command set alone. WingFoil computes it (`src/cli/suggest.ts`) and
  writes it through §3.2's `emitError`; the argument parser's own suggestion text is not shown. An
  unknown **option** keeps the parser's closest match, re-worded into the same `hint:` line. A token
  that reaches the CLI through `wingfoil help <unknown>` carries no `hint:` yet (`bug-115`).
- **Missing operand:** a command invoked without the positional it requires is refused at exit `2`
  with `missing required argument: <name>` — the placeholder `--help` shows for it — and the
  command's usage, its required options included, on the `hint:` line. One form for every command:
  ```
  error: missing required argument: <id>
  hint: usage: wingfoil memory approve <id> --reason <text>
  ```
  A noun invoked without its verb is the same case, with `<command>` (§1). A missing **option** keeps
  `spec-008-cli-grammar` §4's `missing required argument: --<name>`.

#### 3.2 Structured format (`--format json` / `--format yaml`)

```json
{
  "error": "<reason>",
  "hint": "<optional corrective suggestion>",
  "details": [{ "file": "<optional path>", "detail": "<optional explanation>" }]
}
```

- `error` is required and carries the same reason text as the console `<reason>`.
- `hint` is present only when a suggestion applies (same condition as §3.1); otherwise the field is
  omitted rather than set to `null`.
- `details` is present only when at least one issue names a `file` or a `detail` (same condition as
  §3.1's detail lines, same order, the same rule for a file the reason already names); each entry
  carries only the fields left to it. The field is
  **additive**: a consumer that reads only `error` is unaffected.
- The `yaml` variant is the same structure serialized as YAML instead of JSON.
- **Every refusal has this shape, whichever layer raises it.** The argument parser's own refusals —
  an unknown command or option, a missing option argument, a missing verb — are written in the active
  `--format` exactly like a refusal raised by WingFoil's core, at the same exit codes (§1). Under
  `json`/`yaml` stderr carries the one object and nothing else: the usage text a parser prints for an
  incomplete invocation is not written (an explicit `--help` still prints it, to stdout). An
  unrecognised `--format` value cannot select a format, so that refusal, and any refusal raised before
  a valid value is known, is console text.
- **One rule, one code.** The structured shape carries no code, but a surface that does expose
  `CoreError.code` (the MCP Tools, a caller of `src/core`) must see one code per rule. The project-root
  confinement refusal (REQ-SEC-06) — a target that resolves outside the project root, or a write target
  that is itself a symbolic link — is `VALIDATION` from every verb that raises it (`memory add`, the
  Memory transition verbs, `directive remove`): the request named a target the rule forbids. `IO` is
  reserved for a failure of the storage itself.
- This structured error object is written to **stderr**, not stdout, even under `--format json` /
  `--format yaml` — the success payload contract in §2 reserves stdout for the command's own result
  shape; keeping errors on stderr lets a caller distinguish "parse stdout for a result" from "parse
  stderr for a failure" without inspecting the exit code first.

```ts
// src/cli/error.ts
export function emitError(
  reason: string,
  opts: { format: OutputFormat; hint?: string; details?: readonly ErrorDetail[] }
): void {
  const details = opts.details ?? [];
  const payload = {
    error: reason,
    ...(opts.hint ? { hint: opts.hint } : {}),
    ...(details.length > 0 ? { details } : {}),
  };
  if (opts.format === 'json') {
    process.stderr.write(JSON.stringify(payload) + '\n');
  } else if (opts.format === 'yaml') {
    process.stderr.write(yamlDump(payload));
  } else {
    process.stderr.write(`error: ${reason}\n`);
    if (opts.hint) process.stderr.write(`hint: ${opts.hint}\n`);
    for (const detail of details) process.stderr.write(`  ${detailLine(detail).replace(/\n/g, '\n    ')}\n`);
  }
}

function detailLine(detail: ErrorDetail): string {
  if (detail.file !== undefined && detail.detail !== undefined) return `${detail.file}: ${detail.detail}`;
  return detail.file ?? detail.detail ?? '';
}
```

`ErrorDetail` (`{ file?, detail? }`) and the selection of entries from `CoreError.details.issues` live
in `src/core/error-details.ts`, so the CLI and the MCP surface (`spec-004`) show the same entries.

### 4. Worked examples

**Unknown command (usage error, exit 2):**

```
$ wingfoil memorey add --type task --title "Fix login"
error: unknown command 'memorey'
hint: did you mean "memory"?
```
Exit code: `2`

**Missing required argument (usage error, exit 2):**

```
$ wingfoil memory submit --format json
{"error":"missing required argument: <id>","hint":"usage: wingfoil memory submit <id>"}
```
Exit code: `2`

**Business-logic failure (user/logic error, exit 1):**

```
$ wingfoil memory approve task/task-999 --reason "looks good"
error: element not found: task/task-999
```
Exit code: `1`

**Success with structured output (exit 0):**

```
$ wingfoil paths sources --format json
{"category":"sources","paths":["src/cli","src/core"]}
```
Exit code: `0`

## Consequences

- Every command implementation under `src/cli` routes its process termination through the single
  `exitWith` function and its error rendering through `emitError`, so no command can silently diverge
  from the `0`/`1`/`2` mapping or the `error: <reason>` / `{"error": ...}` shape.
- Each command's own CLI-* spec is responsible only for: its argument/flag surface, its success-output
  payload shape under `--format json`/`--format yaml`, and which of its failure modes map to `1` vs `2`
  — it must not introduce new exit codes or a different error envelope.
- Automated cross-command tests (an "exit-code matrix" per REQ-INT-04's fit criterion) can be written
  once against this contract and reused for every command, asserting: success → `0`, a representative
  logic error → `1`, a missing/invalid argument → `2`.
- If this contract is later revised (e.g. a new exit code is added for a class of error not covered by
  `1`/`2`), every command depends on that revision and must be re-verified against the updated matrix;
  such a revision would supersede this spec.
- `--dry-run`, `--verbose`, `--no-color`, `--no-interactive`, and the rest of the global-flag surface
  are out of scope here and are governed by spec-008-cli-grammar; any interaction between those flags
  and this contract (e.g. how `--dry-run` reports its outcome) is defined there or in the owning
  command's own spec, not here.

## Revision notes

**Revision (2026-09-25) — §1 settles what a missing verb is, per `bug-103` and
`task-103-a-missing-verb-exits-2-with-an-error-line`.** §1's exit-`2` row enumerates "unknown
command/pillar/verb, unknown flag, missing required argument, invalid flag value", and a *missing*
verb is arguably the third of those and arguably a case of its own. The ambiguity was not academic:
it is what made `task-101`'s decision to leave `wingfoil dna` at exit `1` a judgement rather than a
lookup, and it left the shipped CLI breaking the section twice at once — a malformed invocation
reporting `1`, and a non-zero exit carrying no error message at all, which is the one thing §1 states
in absolute terms. §1's Rules now say it outright, in both directions: a noun without its verb is a
missing required argument (exit `2`, with an `error: ` line), and an explicit `wingfoil help` is a
success (exit `0`), even though an argument parser may print the same usage text for both.

No behaviour of this contract changed — the sentences name a case the table already covered. The
measured result is in `task-103`'s Execution Notes; `spec-008-cli-grammar` §5 carries the same
sentence, since its table is the grammar-side statement of the same contract.

Edited in place without a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`.

**Revision (2026-09-30) — §1's exit-`2` row names an operand beyond the one the command declares, per
`task-129-refuse-operand-beyond-command-declares-exit-2-before` (`bug-171`, `bug-131`) and
`dl-082-cli-parameter-shape`.** Every command takes at most one positional (`spec-008-cli-grammar`
§1), and a surplus is now refused at exit `2` for every command. The exception is the four DNA path
verbs. They resolve the project root before they refuse, so a run outside the root fails on that
first, at exit `1` (`spec-008-cli-grammar` §1 states the ordering). The row enumerates the malformed
invocations, so the new one is named there rather than left to be read into "missing required
argument", its opposite. No other row or rule changed. Edited in place without a supersede or a state
change, per `dl-047-tech-specs-carry-no-version-field`.

**Revision (2026-10-01) — §3 gives refusal details a slot, makes every refusal one shape under
`--format`, and names one code for the confinement refusal, per `task-130` (`dl-055` option 1,
`bug-114`, `bug-123`).** Three gaps in the error contract, all measured on `main` before the change.
First, `CoreError.details` had no place in §3, so `dl-032`'s explanation of the pinned
illegal-transition message reached no operator, and neither did the file that refusal concerns — its
message is the bare contract string. (A validation reason already embeds `(<file>)`, so for most
refusals the file was visible; the rule therefore does not repeat a file the reason names.) §3.1 now
adds indented detail lines after the `error:` line and §3.2 an additive `details` array, and the code
listing follows.
Second, §2 already said error payloads follow §3.2 "regardless of which command raised the error", yet
the argument parser's refusals were console text under `--format json`: §3.2 now says the shape holds
whichever layer refuses, and that under a machine format the usage text of an incomplete invocation is
not written, so stderr is parseable as one object. Third, the confinement refusal was `IO` from
`memory add` and `VALIDATION` from the transition verbs; §3.2 now names `VALIDATION` as its one code.
No exit code changed, and the console `error:` line of every existing refusal is unchanged. Edited in
place without a supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`.

**Revision (2026-10-05, `task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap`) —
§Context names `mcp` among the flat commands, per `bug-028` and
`dl-046-bootstrap-commands-in-spec-006-section-3` (`ready`).** `wingfoil mcp` has shipped since
`task-030` and is bound by this contract like every other command, but §Context listed only `init`,
`audit` and `paths`. It now lists `init`, `mcp`, `paths`, `audit`, the same four `spec-008-cli-grammar`
§1 and `spec-006-core-domain-api` §3 list, and points to `spec-008` §1 for what a bootstrap command is.
`test/docs/command-surface-specs.test.ts` fails when a flat command the program registers is missing
from the list. No exit code, format or rule changed: §1's exit-`2` row already covers a surplus operand
on `init` and `mcp`, whose wording is now the shared one (`bug-179`). Edited in place without a
supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`.

**Revision (2026-10-05, `task-249-let-piped-cli-output-drain-before-the-process-exits`) — §1's exit
function lets queued output drain before the process ends, per `bug-222`.** The listing called
`process.exit(code)` right after the last write. A write to a pipe is asynchronous in Node: the kernel
takes what fits in the pipe buffer (64 KiB on Linux) and the rest stays queued. So `memory search
--format json | jq` received truncated JSON while the process exited `0` — the code no longer described
what the reader got. §1 gains a rule that the exit never loses output, with no drain timeout (a reader that stays open
without reading keeps the CLI waiting, as any Unix writer does), and the listing shows the mechanism. It is still the single exit function and still the one `process.exit` call. When nothing is
queued (a file, a TTY, a pipe that took everything) it ends the process at once, as before. Otherwise it
sets `process.exitCode` and exits with the same code once the queued writes complete or fail with
`EPIPE`. It no longer returns `never`: in that case it returns `true` to its caller, and every caller returns
right after it. The argument parser's exit callback cannot simply return (the parser would then exit
with its own code), so on `true` it throws a marker the entry point recognises, and the deferred exit
proceeds. The entry point's last-resort handler for an escaped error now ends through the same
function. No exit code, format or other rule changed. Edited in place without a supersede or a state
change, per `dl-047-tech-specs-carry-no-version-field`.

**Revision (2026-10-05, `task-179-give-missing-operand-unknown-command-errors-shape-spec`) — §3.1
fixes the unknown-command suggestion and the missing-operand form, per `bug-104` and `bug-168`.** The
binary wrote the argument parser's own `(Did you mean memory?)`, from a Damerau–Levenshtein matcher
at distance ≤ 3, while §3.1 declared a `hint:` line and `spec-008` §1 a distance ≤ 2; a test pinned
the parser's wording. The suggestion is now WingFoil's, at `spec-008` §1's distance, written as the
`hint:` line, and §3.1 states its wording, its tie-break and that it is matched at the level the token
was typed. The rule that the distance function is an implementation detail is replaced by that
reference. The missing-operand refusal had two shapes (`memory submit <id>` for Memory and directive
verbs, `wingfoil dna set <path> --value <value>` for the DNA verbs); §3.1 now states one, with the
usage on the `hint:` line. §3.1's and §4's examples now quote the token as the parser does
(`'memorey'`), and §4's missing-argument example, which showed a `--reason` that `memory submit` does
not take, shows the missing `<id>`. A noun invoked without its verb takes the same form
(`missing required argument: <command>`, `hint: usage: wingfoil dna <command>`), which supersedes the
wording `task-103` ruled (`missing required argument: wingfoil dna <command>`), for the approver to
confirm at the review gate. Three exit codes change, all
toward `2` and all because a usage check now runs before something that used to fail first: the
operand checks (a surplus, then a missing required operand) run before the project root is resolved,
so from a subdirectory or outside a repository `memory submit` or `dna set` with no operand, and
`dna set project.name bogus --value y`, exit `2` instead of `1` (`E_NOT_AT_GIT_ROOT` /
`E_NO_GIT_ROOT`); and the bootstrap commands check `--format` first, so `wingfoil mcp --format bogus`
exits `2` instead of starting the server (`0`) or refusing an uninitialized project (`1`), and
`wingfoil init --format bogus` outside a repository exits `2` instead of `1`. Each is the code §1
already assigns to a malformed invocation; no rule of the exit-code table changed. Edited in place without a supersede or a state change, per
`dl-047-tech-specs-carry-no-version-field`.

## Process Notes

Authored proactively during rl-v1 `initial-design` (`seed-specs`), not in response to a dev-loop gap.
Grounded directly in the ground-truth requirements `docs/02_requirements/03_sard/04_integrations.md`
(REQ-INT-04, REQ-INT-05, REQ-INT-08) and the feature description of P5.1.4 in
`docs/01_vision/06_features.md`. This document follows REQ-INT-04's three-code exit contract (`0`
success / `1` user-or-logic error / `2` usage-or-argument error) with no dedicated dry-run or interrupt
code. Its error-format prefix (`error: <reason>`, all-lowercase, no symbolic `E_*` code) follows
REQ-INT-08's literal fit criterion.

**Revision (2026-10-06, `task-181-name-attempted-move-not-verb-canonical-edge-illegal`) — §3.1's
details example names `(none)` as `<to>`, per `dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge` (option A, `ready`), which
replaces `dl-053`, and REQ-STATE-01 as it now reads (`bug-165`).** The
example's contract line was `illegal transition approved -> pending for type 'task'`, where `pending`
was `submit`'s canonical edge (reached from `draft`), not a state `submit` reaches from `approved`. A
refused verb has no edge from the current state, so `<to>` is now `(none)` and the indented detail
line, unchanged, says why. No exit code, format or other rule changed. Edited in place without a
supersede or a state change, per `dl-047-tech-specs-carry-no-version-field`.
