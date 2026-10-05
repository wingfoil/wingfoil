/**
 * Exit-code selection (spec-005-cli-command-contract §1, REQ-INT-04 — task-012-cli-exit-code-contract).
 *
 * The `0`/`1`/`2` contract has a single source of truth here in `core`, not duplicated across the CLI
 * and MCP surfaces: both derive severity from the same `CoreError` model (REQ-SYS-05), so this module
 * owns the mapping from a domain outcome to its exit code and each surface only *applies* it
 * (`src/cli/exit.ts`'s `exitWith`).
 *
 * Parse-level usage errors (`2`) are *detected* by a surface before any core call — an unknown
 * command, an unknown option, a missing required argument — but since
 * task-101-route-commander-parse-errors-through-the-exit-code-contract (`bug-098`) their **code** is
 * decided here too, by {@link classifyParseOutcome}. Before that task the CLI's argument parser
 * terminated through its own `process.exit(1)` and those classes never reached this module at all, so
 * an unknown command reported `1` — the code spec-005 §1 reserves for a *well-formed* invocation that
 * failed. Keeping the parse mapping here is what that task's AC6 protects: one place decides an exit
 * code, not one place per error origin.
 *
 * task-103-a-missing-verb-exits-2-with-an-error-line (`bug-103`) added the second half of the same
 * §1 rule to that one place: the section also states that a non-zero exit is **always** accompanied by
 * an error message on stderr, and one parse outcome — an invocation the parser found incomplete —
 * carries no message of its own. So {@link classifyParseOutcome} answers two questions rather than
 * one, from a single rule: which exit code, and whether the surface still owes the `error:` line.
 */
import { ValidationError } from '../validation';

import type { CoreError, CoreErrorCode, CoreResult } from './types';
import { UsageError } from './usage-error';

/** The three-code exit contract (spec-005 §1). Canonical home for the type; `src/cli` re-exports it. */
export type ExitCode = 0 | 1 | 2;

/**
 * Every `CoreError.code` is a **logic** error — a well-formed invocation that failed on business logic
 * — so all map to exit `1`. Declared as an exhaustive `Record<CoreErrorCode, ExitCode>` on purpose: a
 * future `CoreErrorCode` will not compile until its exit code is chosen here, rather than silently
 * defaulting.
 */
const EXIT_CODE_BY_ERROR: Record<CoreErrorCode, ExitCode> = {
  NOT_FOUND: 1,
  INVALID_TRANSITION: 1,
  VALIDATION: 1,
  CONFLICT: 1,
  IO: 1,
};

/** The exit code a {@link CoreError} maps to (spec-005 §1). */
export function exitCodeForError(error: CoreError): ExitCode {
  return EXIT_CODE_BY_ERROR[error.code];
}

/** The exit code for a whole {@link CoreResult}: `0` on success, else the error's mapped code. */
export function exitCodeForResult(result: CoreResult<unknown>): ExitCode {
  return result.ok ? 0 : exitCodeForError(result.error);
}

/**
 * How a CLI argument parser terminated, reduced to the two fields the exit-code decision needs — the
 * parser's own outcome identifier and the exit code it *suggests*. Commander's `CommanderError` is
 * structurally this (`.code` / `.exitCode`), so `src/cli` hands one straight in; the interface is
 * declared structurally rather than importing `commander` so `core` keeps no dependency on the CLI's
 * parser (REQ-SYS-05 — the same mapping has to be applicable from the MCP surface).
 */
export interface ParseOutcome {
  /** The parser's outcome identifier, e.g. Commander's `'commander.unknownCommand'`. */
  readonly code: string;
  /** The exit code the parser suggests for this outcome — advisory, not the contract's answer. */
  readonly exitCode: number;
}

/**
 * The argument-parser outcomes that are **usage errors** under spec-005 §1 ("the invocation itself is
 * malformed: unknown command/pillar/verb, unknown flag, missing required argument, invalid flag
 * value") and therefore exit `2`, whatever the parser itself suggests.
 *
 * The identifiers are Commander's, confirmed against the **installed** version (`commander@15.0.0`,
 * `node_modules/commander/lib/command.js` — `unknownOption()`, `excessArguments()`,
 * `unknownCommand()`, `missingArgument()`, `optionMissingArgument()`, `missingMandatoryOptionValue()`,
 * `conflictingOption()`, each calling `this.error(message, { code })`, plus `commander.error` as
 * `error()`'s own default and `commander.invalidArgument` from `InvalidArgumentError`). They are
 * version surface: a Commander upgrade that renames or adds one must revisit this set, which is why
 * the codes are listed explicitly here rather than inferred from the suggested exit code.
 *
 * One of them, `commander.excessArguments`, is reached by no shipped command: a command derived from
 * `CORE_MODULES` registers a declared positional as an optional variadic list and lets a command
 * without one accept excess operands (task-120), and the two hand-wired bootstrap commands `init` and
 * `mcp` accept them too (task-165, `bug-179`), so a surplus operand is refused by WingFoil's own check
 * (`extraOperandsReason`, task-129), already at exit `2`. The code stays in the set so that a command
 * registered later without that opt-in still exits `2` on Commander's refusal.
 */
const USAGE_ERROR_PARSE_CODES: ReadonlySet<string> = new Set([
  'commander.unknownCommand',
  'commander.unknownOption',
  'commander.excessArguments',
  'commander.missingArgument',
  'commander.optionMissingArgument',
  'commander.missingMandatoryOptionValue',
  'commander.conflictingOption',
  'commander.invalidArgument',
  'commander.error',
]);

/**
 * The parser outcome that reports an **incomplete invocation**: the parser had nothing to run and
 * printed the command's help to stderr instead of an error (task-103, `bug-103`).
 *
 * This is *not* an error code — it is the same identifier Commander uses when the user asks for help
 * with the built-in `help` command, which must keep exiting `0`. The two are separated by the
 * **suggested exit code** carried alongside it: `Command#help(contextOptions)`
 * (`node_modules/commander/lib/command.js`, commander@15.0.0) suggests `1` exactly when it was called
 * as `help({ error: true })`, which is what its three "there is nothing here to run" call sites do —
 * the missing-subcommand branch, the nothing-hooked-up branch, and `_dispatchSubcommand`'s
 * `if (!subCommand)`, where `wingfoil help <unknown>` lands. A user-requested help suggests `0`.
 *
 * That one bit is the whole discriminator, and it is read from the parser's own two fields rather
 * than by re-reading argv — so this module still decides alone, and the surface never re-parses an
 * invocation the parser has already parsed.
 */
const INCOMPLETE_INVOCATION_PARSE_CODE = 'commander.help';

/**
 * How a parse outcome resolves against spec-005 §1: the exit code, and whether the **surface** still
 * owes the `error:` line the section requires of every non-zero exit.
 */
export interface ParseTermination {
  /** The contract's answer, overriding the parser's suggestion. */
  readonly exitCode: ExitCode;
  /**
   * `true` when the parser terminated non-zero having written no error message of its own, so the
   * surface must emit one to satisfy spec-005 §1's "a non-zero exit code is **always** accompanied by
   * an error message on stderr". `false` when the parser already wrote its own `error: …` line (every
   * code in {@link USAGE_ERROR_PARSE_CODES}) or when the exit is `0`. The message *text* is the
   * surface's to compose — only the obligation is decided here.
   */
  readonly needsErrorLine: boolean;
}

/**
 * Resolve a CLI argument parser's own termination against spec-005 §1 (REQ-INT-04 — task-101 /
 * `bug-098`, extended by task-103 / `bug-103`). The parser reaches this both when it *refuses* an
 * invocation and when it *completes* one without running a command (`--help`, `--version`), so the
 * rule has three branches:
 *
 * - an outcome in {@link USAGE_ERROR_PARSE_CODES} is a malformed invocation → exit **2**, overriding
 *   the parser's suggestion (Commander suggests `1` for every one of them). It wrote its own message,
 *   so the surface owes nothing;
 * - {@link INCOMPLETE_INVOCATION_PARSE_CODE} with a **non-zero** suggestion is an invocation the
 *   parser found incomplete — a noun with no verb, `wingfoil` with no arguments, `help <unknown>`.
 *   §1 lists a "missing required argument" among the malformed invocations, so it is exit **2** as
 *   well; unlike the codes above it printed only help text, so `needsErrorLine` is `true`;
 * - anything else is a *successful* termination or an outcome this contract does not classify, and
 *   keeps the parser's own suggested code, narrowed to the three-code contract: `0` stays `0` (so
 *   `--help`, `--version` and an explicit `help` still exit `0`, as spec-005 §1 requires), any
 *   non-zero suggestion becomes `1`. That default is deliberately the status quo rather than `2`: an
 *   unrecognised outcome must not silently acquire a usage-error meaning it was never shown to have —
 *   and, for the same reason, must not acquire a manufactured error message either. The only code
 *   that reaches it non-zero today is `commander.executeSubCommandAsync`, and WingFoil registers no
 *   executable subcommand.
 */
export function classifyParseOutcome(outcome: ParseOutcome): ParseTermination {
  if (USAGE_ERROR_PARSE_CODES.has(outcome.code)) return { exitCode: 2, needsErrorLine: false };
  if (outcome.code === INCOMPLETE_INVOCATION_PARSE_CODE && outcome.exitCode !== 0) {
    return { exitCode: 2, needsErrorLine: true };
  }
  return { exitCode: outcome.exitCode === 0 ? 0 : 1, needsErrorLine: false };
}

/**
 * The exit code alone for a parse outcome — {@link classifyParseOutcome}'s `exitCode`, kept as a named
 * function for callers (and tests) that care only about the code. It *delegates* rather than repeating
 * the rule, so the code and the error-line obligation can never be decided from two different tables.
 */
export function exitCodeForParseOutcome(outcome: ParseOutcome): ExitCode {
  return classifyParseOutcome(outcome).exitCode;
}

/** A thrown error's surface rendering: the human `reason` (spec-005 §3) and the process exit code. */
export interface ThrownOutcome {
  readonly reason: string;
  readonly exitCode: ExitCode;
}

/**
 * Select the exit code and reason for a core operation that *threw* (the throw-path companion to
 * {@link exitCodeForResult}, which handles the return path). Keeping this in `src/core` is what lets a
 * thrown usage/integrity error stay "core owns exit-code selection" (spec-008-cli-grammar
 * Consequences), so both surfaces apply it identically rather than each re-deciding:
 *
 * - a {@link UsageError} (a malformed argument, e.g. `dna set`'s invalid key path) → exit **2**, with
 *   its already-clean `.message` as the reason (task-025-implement-dna-set);
 * - a {@link ValidationError} carries its own `exitCode` (integrity/cross-field → 2, field-level → 1,
 *   per spec-009-validation-strategy §3), with the reason joined from its issue messages (never the
 *   composite `${code} ${path} (${file}): …` form its `.message` builds);
 * - anything else is a logic error → exit **1**, with the error's message (or its string form).
 */
export function exitCodeForThrow(error: unknown): ThrownOutcome {
  if (error instanceof UsageError) {
    return { reason: error.message, exitCode: 2 };
  }
  if (error instanceof ValidationError) {
    const reason = error.issues.length > 0 ? error.issues.map((issue) => issue.message).join('; ') : error.message;
    return { reason, exitCode: error.exitCode === 2 ? 2 : 1 };
  }
  return { reason: error instanceof Error ? error.message : String(error), exitCode: 1 };
}
