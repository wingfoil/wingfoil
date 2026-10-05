/**
 * The CLI adapter's command registrar (spec-006-core-domain-api §2/§4, spec-005-cli-command-contract,
 * spec-008-cli-grammar — task-006). `buildCliCommands` is the "command registrar" spec-006 §4.1
 * refers to: it imports nothing but the `CoreModule[]` it is given, iterates `enumerateOperations`
 * (never a hand-copied operation list), and derives **every** operation it finds into a
 * `wingfoil <noun> <verb>` command descriptor — regardless of `mutates` (§2: "CLI exposes every
 * operation regardless of `mutates`"). No business logic lives outside `run`: it only (a)
 * validates the global `--format` flag, (b) turns the invocation into typed params via the
 * caller-supplied `buildParams`, (c) calls the one core function, (d) renders the resulting
 * `CoreResult` via `renderSuccess` (plus `emitWarnings` for its warnings, task-169)/`emitError` and terminates via `exitWith` — matching spec-005
 * §1's "exactly one process exit call per invocation".
 *
 * Deliberately Commander-independent (see `./program.ts`'s module doc for why): this module owns
 * 100% of the AC-relevant behavior — naming, dispatch, exit codes, output rendering — and is fully
 * unit-testable; wiring this command model onto a real `commander` `Command` tree is a separate,
 * thin, mechanical concern.
 */
import type { CoreFlag, CoreModule, CoreOption, CorePositional, ParamsBuilder } from '../core/registry';
import { commandUsage, deriveVerb, enumerateOperations, extraOperandsReason, missingOperandReason } from '../core/registry';
import type { CoreResult } from '../core/types';
import { exitCodeForResult, exitCodeForThrow } from '../core/exit-code';
import { errorDetails } from '../core/error-details';

import { emitError } from './error';
import { exitWith } from './exit';
import { invalidFormatReason, isValidFormat, renderSuccess } from './output';
import { emitWarnings } from './warning';

/** Ambient dependencies {@link buildCliCommands} needs: how to resolve the project root and how to shape each operation's params. */
export interface BuildCommandsOptions {
  /** Resolves the project root a core call needs — an ambient/environment concern, not a CLI flag. */
  readonly resolveRoot: () => string;
  /** Turns a `ParamsContext` into one operation's typed params (`../core/registry.ts`'s {@link ParamsBuilder}). */
  readonly buildParams: ParamsBuilder;
}

/**
 * One derived `wingfoil <noun> <verb>` command (or, when `verb === ''`, a flat `wingfoil <noun>`
 * command — spec-008-cli-grammar §1, task-028-implement-paths-category): its dispatch is a pure
 * function of the ambient `--format` value plus this operation's own positional/flag values, if any.
 */
export interface CliCommand {
  readonly noun: string;
  readonly verb: string;
  readonly mutates: boolean;
  /** Copied from `CoreModule.description` — the noun's one-line summary (task-120). */
  readonly nounDescription?: string;
  /** Copied from `CoreOperation.description` — the command's one-line summary (task-120). */
  readonly description?: string;
  /** Copied from `CoreOperation.positional` — the operand `--help` names; absent when it reads none (task-120). */
  readonly positional?: CorePositional;
  /** Copied from `CoreOperation.example` — the invocation `--help` shows under `Example:` (task-120). */
  readonly example?: string;
  /** Copied from `CoreOperation.flags` (`../core/registry.ts`) — the boolean flags `program.ts`
   * registers as Commander `--{name}` options for this command (empty/absent for every command
   * before task-028-implement-paths-category; `--list` for `paths`). */
  readonly flags?: readonly CoreFlag[];
  /** Copied from `CoreOperation.options` (`../core/registry.ts`) — the value-bearing `--{name} <value>`
   * options `program.ts` registers for this command (task-020-implement-memory-add; empty/absent for
   * every command before it). */
  readonly options?: readonly CoreOption[];
  /**
   * Execute this command given the resolved `--format` flag value (still unvalidated at this point),
   * the FULL list of bare positional arguments the invocation supplied (task-025-implement-dna-set's
   * additive `positionals` seam — e.g. `wingfoil dna show tech_stack` -> `['tech_stack']`,
   * `wingfoil dna set project.license --value MIT` -> `['project.license']`, one positional per
   * command since `dl-082-cli-parameter-shape`), this command's own parsed `--{flag}`
   * values (task-028, e.g. `{ list: true }`), and its parsed value-bearing `--{name} <value>` OPTIONS
   * (task-020, e.g. `{ type: 'decision', title: 'Use PostgreSQL' }`; a repeatable option's value is
   * the array of its occurrences, task-110). All are additive/optional — a
   * command that reads no positional and declares no flags/options is still called exactly as before:
   * `run(format)`. The single-positional read ops (`dna show`, `paths`) read `positionals[0]` via
   * `ParamsContext.positional`.
   */
  readonly run: (
    formatValue: string,
    positionals?: readonly string[],
    flags?: Readonly<Record<string, boolean>>,
    options?: Readonly<Record<string, string | readonly string[]>>,
  ) => Promise<void>;
}

/**
 * Derive one `CliCommand` per operation in `modules`, in `enumerateOperations`'s deterministic
 * order (REQ-SYS-07). The verb is derived via `deriveVerb` (spec-006 §5).
 */
export function buildCliCommands(modules: readonly CoreModule[], options: BuildCommandsOptions): CliCommand[] {
  return enumerateOperations(modules).map(({ module, operation }) => {
    const verb = deriveVerb(module.name, operation.name);
    return {
      noun: module.name,
      verb,
      mutates: operation.mutates,
      nounDescription: module.description,
      description: operation.description,
      positional: operation.positional,
      example: operation.example,
      flags: operation.flags,
      options: operation.options,
      run: async (
        formatValue: string,
        positionals?: readonly string[],
        flags?: Readonly<Record<string, boolean>>,
        optionValues?: Readonly<Record<string, string | readonly string[]>>,
      ) => {
        if (!isValidFormat(formatValue)) {
          exitWith(2, `error: ${invalidFormatReason(formatValue)}`);
          return;
        }
        const format = formatValue;

        // The operand count, checked HERE for every derived command, present and future, before
        // `resolveRoot()`: so before anything is read or written, and before any check the operation
        // runs, the git-identity pre-flight included (task-129, `bug-171`, `bug-131`). Both are exit `2`
        // (spec-005 §1), and the global `--format` above is checked first, for every command (`bug-226`).
        // - An operand beyond the one the command declares (`dl-082-cli-parameter-shape`: at most one
        //   positional per command), with the declared `surplusHint` appended — the DNA path verbs'
        //   `the value travels in --value` (task-179, `bug-180`: they no longer refuse it themselves).
        // - A required operand that is missing: `missing required argument: <name>`, with the command's
        //   usage as the `hint:` line (task-179, `bug-168`, spec-008 §4).
        const given = positionals?.length ?? 0;
        const declared = operation.positional === undefined ? 0 : 1;
        const commandName = verb ? `${module.name} ${verb}` : module.name;
        if (given > declared) {
          emitError(extraOperandsReason(commandName, operation.positional?.name, given, operation.positional?.surplusHint), { format });
          exitWith(2);
          return;
        }
        if (given === 0 && operation.positional?.required === true) {
          emitError(missingOperandReason(operation.positional.name), { format, hint: `usage: ${commandUsage(commandName, operation)}` });
          exitWith(2);
          return;
        }

        let result: CoreResult<unknown>;
        try {
          // `resolveRoot()` / `buildParams()` run INSIDE the try so an ambient failure — e.g. a
          // `StorageError` from resolving the git root outside a WingFoil project — is rendered
          // through the spec-005 §1 single-exit path (emitError + exitWith), never escaping as an
          // uncaught throw that a top-level handler would stack-dump (bug-002-cli-error-stack-dump).
          const params = options.buildParams({
            moduleName: module.name,
            operationName: operation.name,
            root: options.resolveRoot(),
            // `positional` stays the first positional (single-positional read ops read it); `positionals`
            // is the full list a multi-input op (`dnaSet`) reads (task-025-implement-dna-set).
            positional: positionals?.[0],
            positionals,
            flags,
            // Value-bearing `--{name} <value>` options a data-mutating op reads (task-020's `memoryAdd`
            // reads `type`/`title`/`tags`). Undefined for every op declaring none.
            options: optionValues,
          });
          result = await operation.fn(params);
        } catch (error) {
          // Core owns exit-code selection for a thrown error too (spec-008 Consequences): a UsageError
          // (a malformed argument, e.g. `dna set`'s invalid key path) surfaces as exit 2, everything
          // else as 1 — never a bare crash (bug-002-cli-error-stack-dump). task-025-implement-dna-set.
          const { reason, exitCode } = exitCodeForThrow(error);
          emitError(reason, { format });
          exitWith(exitCode);
          return;
        }

        // Render the outcome, then terminate through the single exit function with the code core
        // selects for this result (`0` success / `1` logic error) — the CLI does not re-decide the
        // `0`/`1` mapping (task-012, spec-005 §1). `2` (usage error) is handled above, pre-core.
        if (result.ok) {
          // The success-warning channel (task-169, `dl-062`): stderr only, before the payload, so stdout
          // is the same bytes with and without warnings under every `--format`.
          emitWarnings(result.warnings, { format });
          process.stdout.write(renderSuccess(result.value, format));
        } else {
          // `details` too (task-130, `dl-055` option 1): the file and the explanation core recorded.
          emitError(result.error.message, { format, details: errorDetails(result.error) });
        }
        exitWith(exitCodeForResult(result));
      },
    };
  });
}

/**
 * Every `"{noun} {verb}"` command derived from `commands`, sorted (REQ-SYS-07) — the CLI-side
 * enumeration the REQ-SYS-05 parity test (`test/core/parity.test.ts`) diffs against the MCP Tool
 * list. A flat, no-verb command (`verb === ''`, task-028-implement-paths-category) renders as the
 * bare noun (`"paths"`), not `"paths "` with a trailing space.
 */
export function listRegisteredCliCommands(commands: readonly CliCommand[]): string[] {
  return commands.map((command) => (command.verb ? `${command.noun} ${command.verb}` : command.noun)).sort();
}
