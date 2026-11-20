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
import type { CoreFlag, CoreModule, CoreOperation, CoreOption, CorePositional, ParamsBuilder } from '../core/registry';
import { commandUsage, deriveVerb, enumerateOperations, extraOperandsReason, missingOperandReason } from '../core/registry';
import type { CoreResult } from '../core/types';
import { exitCodeForResult, exitCodeForThrow } from '../core/exit-code';
import { errorDetails } from '../core/error-details';
import { DRY_RUN_FLAG, runAsDryRun } from '../core/dry-run';
import {
  AGENT_MODEL_VARIABLE,
  AI_MODEL_OPTION,
  AI_MODEL_WITHOUT_AGENT,
  BLANK_AI_MODEL,
  BLANK_CO_AUTHOR,
  CO_AUTHOR_OPTION,
  hasEnvironmentMarker,
  isMultiLineValue,
  MULTI_LINE_AGENT_MODEL,
  MULTI_LINE_AI_MODEL,
  withAgentInvocation,
} from '../core/agent-context';
import { withNoticeSink, withOutputSink, withWarningSink } from '../validation/warning';

import { emitError } from './error';
import { exitWith } from './exit';
import { invalidFormatReason, isValidFormat, renderSuccess } from './output';
import { emitNotice, emitOutput, emitStderrDocument, emitWarning, emitWarnings } from './warning';

/** Ambient dependencies {@link buildCliCommands} needs: how to resolve the project root and how to shape each operation's params. */
export interface BuildCommandsOptions {
  /**
   * Resolves the project root a core call needs — an ambient/environment concern. `project` is the value of
   * the global `--project <dir>` (spec-008 §2, task-350), which `buildProgram` reads from the root program
   * and binds before handing the resolver here, so the derived commands call it with no argument.
   */
  readonly resolveRoot: (project?: string) => string;
  /** Turns a `ParamsContext` into one operation's typed params (`../core/registry.ts`'s {@link ParamsBuilder}). */
  readonly buildParams: ParamsBuilder;
  /**
   * The global `--project` check an operation that reads no project runs in place of {@link resolveRoot}
   * (`spec-019` §1, `spec-008` §1, task-362): it throws the blank-`--project` `UsageError` (exit `2`) and checks
   * nothing else. `buildProgram` binds it; absent, such an operation runs no check.
   */
  readonly checkProject?: () => void;
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
      // `--dry-run` (task-210, `dl-106` W2, spec-008 §2): every operation that mutates takes it, and
      // none declares it — it is derived here from `mutates`, so an operation added later inherits it.
      flags: operation.mutates ? [...(operation.flags ?? []), DRY_RUN_FLAG] : operation.flags,
      // `--co-author <name>` (task-333, `spec-018` §1 row 2, design D4): derived the same way, for every mutating
      // operation that does not declare `agentAttribution: false` (`agent execute`, `spec-018` §1.1); `--ai-model <id>`
      // (task-334, `spec-018` §2.4, design D7) right after it, on the same operations.
      options: takesCoAuthor(operation) ? [...(operation.options ?? []), CO_AUTHOR_OPTION, AI_MODEL_OPTION] : operation.options,
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

        // The operation's own flags reach `buildParams`; `--dry-run` is the registrar's, not the operation's.
        const dryRun = operation.mutates && flags?.[DRY_RUN_FLAG.name] === true;
        const operationFlags = operation.mutates && flags !== undefined ? withoutDryRun(flags) : flags;
        // `--co-author` likewise (task-333): a usage check first, exit `2` before `resolveRoot()` (`spec-018` §2.5,
        // §2.6), then it reaches the core as part of the agent invocation, never as an operation option.
        const coAuthorValue = takesCoAuthor(operation) ? optionValues?.[CO_AUTHOR_OPTION.name] : undefined;
        const coAuthor = typeof coAuthorValue === 'string' ? coAuthorValue : undefined;
        if (coAuthor !== undefined && coAuthor.trim().length === 0) {
          emitError(BLANK_CO_AUTHOR, { format });
          exitWith(2);
          return;
        }
        // `--ai-model` (task-334, `spec-018` §2.4, design D4): its usage checks right after, also before `resolveRoot()`.
        const aiModelValue = takesCoAuthor(operation) ? optionValues?.[AI_MODEL_OPTION.name] : undefined;
        const aiModel = typeof aiModelValue === 'string' ? aiModelValue : undefined;
        const aiModelRefusal = agentModelRefusal(aiModel, coAuthor !== undefined || hasEnvironmentMarker(process.env), takesCoAuthor(operation));
        if (aiModelRefusal !== undefined) {
          emitError(aiModelRefusal, { format });
          exitWith(2);
          return;
        }
        const operationOptions = takesCoAuthor(operation) && optionValues !== undefined ? withoutAgentOptions(optionValues) : optionValues;

        let result: CoreResult<unknown>;
        try {
          // `resolveRoot()` / `buildParams()` run INSIDE the try so an ambient failure — e.g. a
          // `StorageError` from resolving the git root outside a WingFoil project — is rendered
          // through the spec-005 §1 single-exit path (emitError + exitWith), never escaping as an
          // uncaught throw that a top-level handler would stack-dump (bug-002-cli-error-stack-dump).
          // An operation that reads no project (`readsProject: false`, `spec-019` §1) resolves no root: the blank
          // `--project` refusal still runs, in the root step's place, and its context carries no `root` key.
          let project: { root?: string } = {};
          if (operation.readsProject === false) options.checkProject?.();
          else project = { root: options.resolveRoot() };
          const params = options.buildParams({
            moduleName: module.name,
            operationName: operation.name,
            ...project,
            // `positional` stays the first positional (single-positional read ops read it); `positionals`
            // is the full list a multi-input op (`dnaSet`) reads (task-025-implement-dna-set).
            positional: positionals?.[0],
            positionals,
            flags: operationFlags,
            // Value-bearing `--{name} <value>` options a data-mutating op reads (task-020's `memoryAdd`
            // reads `type`/`title`/`tags`). Undefined for every op declaring none.
            options: operationOptions,
          });
          // Every warning raised while the operation runs — a loader's unknown-field warning (`bug-202`),
          // `agent execute`'s context warnings (task-218) — is rendered here, in the active format, the
          // moment it is raised: before the payload or the error that follows it.
          // The agent invocation (`spec-018` §1, design D5): the environment, `--co-author` and `--ai-model`, which the
          // core reads through `currentAgentInvocation()` — the approver-gated operations refuse an agent's session from
          // it, the others write the agent's trailers from it (`spec-018` §2).
          const invocation = {
            env: process.env,
            ...(coAuthor === undefined ? {} : { coAuthor }),
            ...(aiModel === undefined ? {} : { aiModel }),
          };
          const call = (): Promise<CoreResult<unknown>> => withAgentInvocation(invocation, () => operation.fn(params));
          // A notice (`agent execute`'s launch banner, task-228) is rendered the same way, on stderr, and so is each
          // line of a headless agent's forwarded output (task-336, `spec-016` §3.5).
          result = await withOutputSink(
            (line, stream) => emitOutput(line, stream, { format }),
            () =>
              withNoticeSink(
                (text) => emitNotice(text, { format }),
                () => withWarningSink((text) => emitWarning(text, { format }), () => (dryRun ? runAsDryRun(call) : call())),
              ),
          );
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
          // A command that hands its stdout to a child (`agent execute`, spec-016 §3.4, task-228) reports
          // on stderr and writes nothing on stdout (spec-005 §2).
          const report = operation.renderToStderr?.(result.value);
          if (report !== undefined) {
            emitStderrDocument(report.document, report.console, { format });
            exitWith(exitCodeForResult(result));
            return;
          }
          // A command whose spec defines a console rendering (task-220, `agent show`) supplies it;
          // every other command keeps `renderSuccess`'s indented JSON (spec-008 §2).
          process.stdout.write(
            format === 'console' && operation.renderConsole !== undefined
              ? operation.renderConsole(result.value)
              : renderSuccess(result.value, format),
          );
        } else {
          // `details` too (task-130, `dl-055` option 1): the file and the explanation core recorded;
          // and the `hint:` line core suggested, if any (task-220, spec-005 §3.1).
          emitError(result.error.message, { format, hint: result.error.hint, details: errorDetails(result.error) });
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

/** Whether the registrar derives `--co-author` for `operation`: it mutates and does not opt out (`spec-018` §1.1). */
function takesCoAuthor(operation: CoreOperation): boolean {
  return operation.mutates && operation.agentAttribution !== false;
}

/**
 * The usage refusal of the model identifier, or `undefined` (`spec-018` §2.4, `spec-008` §2's `--ai-model` row, design
 * D4), in this order: a blank `--ai-model`, one that is not one line, one given with no agent context, then — with no
 * `--ai-model` and an agent context — a `WINGFOIL_AGENT_MODEL` that is not one line. Outside an agent context the
 * variable is never read.
 */
function agentModelRefusal(aiModel: string | undefined, agentContext: boolean, takesModel: boolean): string | undefined {
  if (aiModel !== undefined) {
    if (aiModel.trim().length === 0) return BLANK_AI_MODEL;
    if (isMultiLineValue(aiModel)) return MULTI_LINE_AI_MODEL;
    if (!agentContext) return AI_MODEL_WITHOUT_AGENT;
    return undefined;
  }
  const variable = process.env[AGENT_MODEL_VARIABLE];
  if (takesModel && agentContext && variable !== undefined && variable.trim().length > 0 && isMultiLineValue(variable)) return MULTI_LINE_AGENT_MODEL;
  return undefined;
}

/**
 * `options` without the registrar's `--co-author` and `--ai-model`, or `undefined` when nothing else is left — the
 * shape an operation that declares no options of its own was always called with.
 */
function withoutAgentOptions(
  options: Readonly<Record<string, string | readonly string[]>>,
): Readonly<Record<string, string | readonly string[]>> | undefined {
  const rest = Object.fromEntries(
    Object.entries(options).filter(([name]) => name !== CO_AUTHOR_OPTION.name && name !== AI_MODEL_OPTION.name),
  );
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * `flags` without the registrar's `--dry-run`, or `undefined` when nothing else is left — the shape an
 * operation that declares no flags of its own was always called with.
 */
function withoutDryRun(flags: Readonly<Record<string, boolean>>): Readonly<Record<string, boolean>> | undefined {
  const rest = Object.fromEntries(Object.entries(flags).filter(([name]) => name !== DRY_RUN_FLAG.name));
  return Object.keys(rest).length > 0 ? rest : undefined;
}
