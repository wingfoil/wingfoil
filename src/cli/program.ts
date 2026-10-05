/**
 * Wires `./registrar.ts`'s Commander-independent command model onto a real `commander` `Command`
 * tree — the only place this module (or any module reachable from a test file) imports `commander`.
 *
 * ENVIRONMENT NOTE (task-006, see the task's Execution Notes for the full write-up): `commander`
 * v15 ships ESM-only (no CJS build — its `package.json` has `"type": "module"` and a single
 * `"default": "./index.js"` export). This project's `tsconfig.json` (`module: Node16`, no
 * top-level `"type": "module"` in `package.json`) compiles `.ts` files as CommonJS by default, and
 * a *static* `import { Command } from 'commander'` from a CJS-resolved file is downleveled to a
 * `require()` call — which `tsc --noEmit` itself refuses to emit for an ESM-only target (TS1479),
 * and which, even if suppressed, would crash at Jest-test runtime (`ts-jest`'s CommonJS test
 * environment cannot `require()` an ESM module; confirmed empirically — this predates task-006, a
 * consequence of task-001's dependency pick, not something in this task's scope to fix
 * project-wide, e.g. by migrating the whole Jest config to ESM or downgrading `commander`).
 *
 * The fix that keeps `commander` as the real, declared CLI dependency (per `dna.yaml` /
 * spec-005/008) without touching the project's Jest/tsconfig setup: a *dynamic* `import('commander')`
 * here, inside an async function. Dynamic `import()` is never downleveled by `tsc` regardless of
 * module target, so it does not trigger TS1479, and it resolves correctly at real `node`/`wingfoil`
 * runtime (Node 22's ESM-aware module loader).
 *
 * TESTING (task-065-fix-commander-esm-jest-harness, `bug-007-commander-esm-jest-untestable`): this
 * file's wiring — construct the global flags, register a noun/verb `Command` per `CliCommand`,
 * forward to `command.run` — used to be verified by hand, because a test importing it hit that same
 * Jest-runtime wall (`module: Node16` *preserves* the dynamic `import()`, and jest's CommonJS runtime
 * has no dynamic-import callback). It is now covered two ways, with no change to this file: in-process
 * by `test/cli/program.test.ts` — jest compiles the test runtime as CommonJS against
 * `tsconfig.test.json` and transforms `commander`'s ESM on the way in, see `jest.config.js` — and
 * black-box by `test/cli/program.integration.test.ts`, which spawns the compiled `dist/` and so
 * exercises the real ESM `import()` this file actually ships with.
 * `buildCliCommands`/`listRegisteredCliCommands` (`./registrar.ts`) still carry the dispatch
 * behaviour. What this file adds of its own is presentation: how `--help` renders the declaration each
 * command carries (task-120 — the positional's name and required-ness, `(required)` on an option, the
 * example and exit-code footer), covered by `test/cli/help-describes-every-command.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Type-only; commander is ESM-only, hence the explicit resolution-mode attribute — see module doc above.
import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { extraOperandsReason, type CoreModule, type CorePositional } from '../core/registry';
// Direct module import, not the `../core` barrel — the same path `./registrar.ts` already uses for the
// other two exit-code mappings (task-101; keeps this file out of the barrel's merge surface).
import { classifyParseOutcome } from '../core/exit-code';
import { TEMPLATE_NAMES } from '../storage';

import { buildCliCommands, type BuildCommandsOptions, type CliCommand } from './registrar';
import { runInit, createReadlinePrompt } from './init-command';
import { runMcp } from './mcp-command';
import { emitError } from './error';
import { exitWith } from './exit';
import { isValidFormat, type OutputFormat } from './output';

/**
 * The CLI version, read from `package.json` deterministically (REQ-SYS-07 — no wall-clock, no
 * inference): the manifest sits two levels up from this module in both the `src/cli/` source layout
 * and the compiled `dist/cli/` layout, and npm always ships `package.json` at the package root, so
 * the same relative path resolves for `wingfoil --version` after a global install.
 */
function readPackageVersion(): string {
  const manifestPath = join(__dirname, '..', '..', 'package.json');
  return (JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version: string }).version;
}

/**
 * Build the root `commander` program: register the global flags, the special `init`/`mcp` bootstrap
 * commands, and one `wingfoil <noun> <verb>` (or flat `<noun>`) command per `CoreModule` operation
 * derived through {@link BuildCommandsOptions}. Async because `commander` is imported dynamically
 * (see the module doc). The command *behaviour* lives in `./registrar.ts`; this only wires it onto
 * Commander.
 */
export async function buildProgram(modules: readonly CoreModule[], options: BuildCommandsOptions): Promise<Command> {
  const { Command: CommandCtor } = await import('commander');
  const program = new CommandCtor('wingfoil');
  // Route Commander's OWN terminations through the spec-005 §1 exit-code contract
  // (task-101-route-commander-parse-errors-through-the-exit-code-contract, `bug-098`). Commander
  // detects an unknown command / unknown option / missing option argument before any WingFoil code
  // runs and, left alone, ends the process itself at its suggested exit code — `1` for every error it
  // raises, which is the code spec-005 §1 reserves for a well-formed invocation that failed. The
  // callback is the whole interception: the *code* is chosen by `classifyParseOutcome`
  // (`src/core/exit-code.ts`, beside the other two mappings — this file adds no second decision site),
  // and the process ends through `exitWith`, the single exit seam of `./exit.ts`, like every other
  // outcome.
  //
  // COMMANDER'S OWN MESSAGES ARE NOT REPEATED: for every error it raises, Commander has already written
  // its message before calling this — in the active `--format` since task-130, through the
  // `configureOutput` hooks below — so nothing is added on top of it. The ONE outcome where
  // it writes no error message at all is an invocation it found incomplete — a noun with no verb —
  // where it prints help to stderr and nothing else; `spec-005` §1 requires a non-zero exit to carry
  // an error message *always*, so that outcome (and only that one, flagged by `needsErrorLine`) gets
  // the line composed here by `incompleteInvocationReason`
  // (task-103-a-missing-verb-exits-2-with-an-error-line, `bug-103`).
  //
  // ORDER MATTERS: `.command()` copies the parent's `_exitCallback` into each subcommand at
  // *registration* time (`Command#copyInheritedSettings`, commander@15.0.0), so this must be installed
  // before the first `.command()` call below or a subcommand's parse errors would still bypass it.
  // The same fact is why the callback reads `program.args` rather than the erroring command: the
  // *root* program is the one object every copy of this closure shares, and Commander has already put
  // the invocation's operands there (`Command#_parseCommand`'s `this.args = operands.concat(unknown)`,
  // set before it dispatches) with the global options removed.
  program.exitOverride((error) => {
    const termination = classifyParseOutcome(error);
    if (termination.needsErrorLine) emitError(incompleteInvocationReason(program.args), { format: activeFormat(program) });
    exitWith(termination.exitCode);
  });
  // Commander's own refusals in the active `--format` (task-130, `bug-114`, spec-005 §3.2). Commander
  // writes an error through `outputError` and the help it prints for an incomplete invocation through
  // `writeErr`, so these two hooks are the whole parse path's stderr. Under `console` both are what
  // Commander would do anyway, byte for byte. Under `json`/`yaml` the message becomes the same
  // `{error, hint?}` object a WingFoil refusal is (`commanderRefusal`), and the help text — which would
  // bury that object — is not written: `--help` itself writes to stdout and is unaffected.
  // `--format` is read when the error fires; Commander has parsed the root program's options by then,
  // wherever on the command line they stand. Installed before the first `.command()`, like the callback
  // above, because `copyInheritedSettings` copies the output configuration at registration time.
  program.configureOutput({
    writeErr: (text) => {
      if (activeFormat(program) === 'console') process.stderr.write(text);
    },
    outputError: (text, write) => {
      const format = activeFormat(program);
      if (format === 'console') {
        write(text);
        return;
      }
      emitError(...commanderRefusal(text, format));
    },
  });
  // How a command is listed under its parent (task-120, `bug-128`). Commander's own `subcommandTerm`
  // renders each registered argument from the flag Commander ENFORCES, which is why every derived verb
  // used to read `[positionals...]`; this renders the positional the operation declares instead,
  // `<id>` when core refuses its absence and `[section]` when it does not. Installed before the first
  // `.command()` for the same reason as the callback above: `copyInheritedSettings` copies the help
  // configuration at registration time.
  const declaredPositionals = new Map<Command, CorePositional>();
  program.configureHelp({ subcommandTerm: (command) => subcommandTerm(command, declaredPositionals.get(command)) });
  // Register `-V, --version` so `wingfoil --version` prints the version and exits 0
  // (spec-008-cli-grammar §1, bug-001-cli-version-flag) — Commander handles it before any command.
  program.version(readPackageVersion());
  program
    // Until P5.1.4 gives `console` a human rendering (`dl-043`), the help says what the default prints
    // and that no output is coloured (spec-008 §2, task-156, `bug-152`, `bug-203`).
    .option('--format <format>', 'output format (console|json|yaml); console prints indented JSON for now', 'console')
    .option('--verbose', 'emit diagnostic logs to stderr')
    .option('--no-color', 'disable ANSI colors (accepted; no output is colored yet)')
    .option('--no-interactive', 'fail on missing args instead of prompting');

  // `wingfoil init` is a SPECIAL bootstrap command (task-029, P5.1.1): it runs BEFORE config exists,
  // so it is NOT a `CORE_MODULES` noun-verb op — it is wired directly here and drives `runInit`
  // (./init-command.ts). The wizard/`--template`/prompt-matrix logic is fully unit-tested in
  // ./init-command.ts; this registration is a thin `commander` seam, and `test/cli/program.test.ts`
  // pins it (the command is registered and drives `runInit` with the resolved options).
  program
    .command('init')
    .description('scaffold .wingfoil/ in the current git repository and commit it')
    // bug-140: the legal values come from the template registry, the same list `--template` resolves
    // against and the missing-argument error names (./init-command.ts).
    .option(
      '--template <name>',
      `methodology template, one of: ${TEMPLATE_NAMES.join(', ')} (required without a terminal or with --no-interactive)`,
    )
    .addHelpText('after', leafHelpFooter(`wingfoil init --template ${TEMPLATE_NAMES[0] ?? '<name>'}`))
    .allowExcessArguments(true)
    .action(async (localOpts: { template?: string }, command: Command) => {
      if (refusedSurplus(program, 'init', command.args)) return;
      const globalOpts = program.opts<{ format: string; interactive: boolean }>();
      let root: string;
      try {
        root = options.resolveRoot();
      } catch (error) {
        emitError(error instanceof Error ? error.message : String(error), { format: activeFormat(program) });
        exitWith(1);
        return;
      }
      await runInit(
        { template: localOpts.template, interactive: globalOpts.interactive, format: globalOpts.format },
        { root, isTTY: Boolean(process.stdout.isTTY), prompt: createReadlinePrompt() },
      );
    });

  // `wingfoil mcp` is a SPECIAL command (task-030, P5.2.1, spec-014-mcp-server-entry-point §1): it
  // starts the long-running production MCP server over stdio rather than wrapping a `CORE_MODULES`
  // noun-verb op, so — like `init` above — it is wired directly here and drives `runMcp`
  // (./mcp-command.ts). The pre-flight (resolve-root / error / exit 1) is unit-tested in
  // ./mcp-command.ts with an injected server-start; this registration is a thin `commander` seam, and
  // `test/cli/program.test.ts` pins it (the command is registered and drives `runMcp`).
  program
    .command('mcp')
    .description('start the WingFoil MCP server (read-only Resources and role Prompts) over stdio')
    .addHelpText('after', leafHelpFooter('wingfoil mcp'))
    .allowExcessArguments(true)
    .action(async (_localOpts: unknown, command: Command) => {
      if (refusedSurplus(program, 'mcp', command.args)) return;
      const globalOpts = program.opts<{ format: string }>();
      const format = isValidFormat(globalOpts.format) ? globalOpts.format : 'console';
      await runMcp({ resolveRoot: options.resolveRoot, version: readPackageVersion(), format });
    });

  const nounCommands = new Map<string, Command>();
  for (const command of buildCliCommands(modules, options)) {
    const target = resolveCommandTarget(program, nounCommands, command);

    // A flat command IS its noun (`paths`), so only a nested verb's noun takes the module's own line.
    if (command.verb && command.nounDescription !== undefined) nounCommands.get(command.noun)?.description(command.nounDescription);
    if (command.description !== undefined) target.description(command.description);

    // The operand (task-025's `positionals` seam, named by task-120). PARSING is the same for every
    // derived command whatever it declares: Commander accepts any number of operands and WingFoil
    // decides what to refuse, with its own message — `dl-082-cli-parameter-shape` gives each command at
    // most ONE positional, the identity of its target, and `./registrar.ts` refuses a surplus operand
    // at exit `2` before anything is read (task-129, `bug-171`, `bug-131`; the DNA path verbs refuse it
    // themselves, after `resolveRoot()` and their own path check — `CorePositional.refusesExtraItself`),
    // rather than leave it to a Commander arity error, whose wording would differ from command to
    // command. A declared
    // positional is registered as an OPTIONAL variadic argument under its declared name: marking it
    // required to Commander would replace core's `missing required argument: memory submit <id>` with
    // Commander's own refusal, so required-ness is RENDERED (the usage line below, `subcommandTerm`)
    // and never enforced here. A command that declares none registers no argument — so `--help` shows
    // none — and allows excess arguments, so that the surplus reaches the registrar's refusal.
    if (command.positional) {
      target.argument(`[${command.positional.name}...]`, command.positional.description);
      declaredPositionals.set(target, command.positional);
    } else {
      target.allowExcessArguments(true);
    }
    // Plus this command's own `--{flag}` options (task-028-implement-paths-category's
    // `CoreOperation.flags`, e.g. `paths`'s `--list`): Commander rejects an unknown option, so each
    // declared flag must be registered explicitly.
    for (const flag of command.flags ?? []) {
      target.option(`--${flag.name}`, flag.description ?? '');
    }
    // Value-bearing `--{name} <value>` options (task-020-implement-memory-add's `memory add
    // --type/--title/--tags`): Commander rejects an unknown option, so each declared option must be
    // registered explicitly with a `<value>` operand (distinguishing it from a boolean `--flag`).
    // `required` is rendered in the description, not enforced by Commander (`requiredOption` would
    // replace core's refusal, exactly as for the positional above).
    for (const option of command.options ?? []) {
      const flags = `--${option.name} <${option.valueName ?? 'value'}>`;
      const description = [option.description, option.required === true ? '(required)' : undefined].filter(Boolean).join(' ');
      // A repeatable option (task-110, `memory add --set`) collects every occurrence in order;
      // Commander's default for a value option is last-one-wins, which would drop all but one.
      if (option.repeatable === true) {
        target.option(flags, description, (value: string, previous: string[] | undefined) => [...(previous ?? []), value]);
      } else {
        target.option(flags, description);
      }
    }
    target.usage(['[options]', ...positionalTerm(command.positional)].join(' '));
    if (command.example !== undefined) target.addHelpText('after', leafHelpFooter(command.example));

    // The action reads the operands and options off the invoked command itself: Commander passes the
    // declared argument's values first only when one is registered, so the command object — always the
    // LAST callback argument — is the one shape both kinds of command share. Forward the operands
    // (task-025), collapse this command's declared flags into a `{ name: boolean }` record (task-028)
    // and its declared value options into a `{ name: value }` record (task-020) for `run`.
    target.action(async (...actionArgs: unknown[]) => {
      const invoked = actionArgs[actionArgs.length - 1] as Command;
      const globalOpts = program.opts<{ format: string }>();
      const options = invoked.opts<Record<string, unknown>>();
      await command.run(globalOpts.format, invoked.args, buildFlagValues(command, options), buildOptionValues(command, options));
    });
  }

  return program;
}

/**
 * How `--help` shows a declared positional: `<name>` when the operation refuses its absence, `[name]`
 * when it does not — one element or none, so callers can spread it into a list of terms.
 */
function positionalTerm(positional: CorePositional | undefined): string[] {
  if (!positional) return [];
  return [positional.required === true ? `<${positional.name}>` : `[${positional.name}]`];
}

/**
 * A command's line in its parent's command list — Commander's own term (`name`, then `[options]` when
 * it has options of its own, then its arguments), with the DECLARED positional in place of the
 * registered variadic argument (task-120). A command with no declared positional — Commander's own
 * `help [command]` included — keeps Commander's rendering of whatever it registered.
 */
function subcommandTerm(command: Command, positional: CorePositional | undefined): string {
  const argumentTerms = positional
    ? positionalTerm(positional)
    : command.registeredArguments.map((argument) => {
        const name = `${argument.name()}${argument.variadic ? '...' : ''}`;
        return argument.required ? `<${name}>` : `[${name}]`;
      });
  return [command.name(), ...(command.options.length > 0 ? ['[options]'] : []), ...argumentTerms].join(' ');
}

/**
 * The text after a command's own help (`spec-008-cli-grammar` §8, `P5.1.4-cli-ux.feature`): one example
 * invocation, and the three exit codes of `spec-005` §1, the same for every command. Leaf commands
 * only — a noun's help lists its verbs, and each verb carries its own.
 */
function leafHelpFooter(example: string): string {
  return [
    '',
    'Example:',
    `  $ ${example}`,
    '',
    'Exit codes:',
    '  0  success',
    '  1  the command line was valid, but the operation failed',
    '  2  the command line is wrong: unknown command or option, missing or invalid argument',
  ].join('\n');
}

/**
 * The surplus-operand refusal of the two hand-wired bootstrap commands (`bug-179`, task-165). `init`
 * and `mcp` declare no positional, so any operand is a surplus (`spec-008-cli-grammar` §1): refused at
 * exit `2` with the same {@link extraOperandsReason} wording the registrar gives every `CORE_MODULES`
 * command (task-129), in the active `--format`, before the project root is resolved — so nothing is
 * read or written. Both commands allow excess arguments so the surplus reaches this check instead of
 * Commander's own `too many arguments` refusal, whose wording differs.
 *
 * @returns `true` when the invocation was refused (the caller returns), `false` when it had no operand.
 */
function refusedSurplus(program: Command, name: string, operands: readonly string[]): boolean {
  if (operands.length === 0) return false;
  emitError(extraOperandsReason(name, undefined, operands.length), { format: activeFormat(program) });
  exitWith(2);
  return true;
}

/**
 * The `--format` an error is rendered in: the parsed global option when it is a valid format, else
 * `console` — an invalid value is itself refused in console text by the registrar (spec-005 §2), and a
 * parse error can fire before `--format` has a usable value at all (task-130, `bug-114`).
 */
function activeFormat(program: Command): OutputFormat {
  const value: unknown = program.getOptionValue('format');
  return typeof value === 'string' && isValidFormat(value) ? value : 'console';
}

/**
 * Commander's error text as {@link emitError} arguments (task-130, `bug-114`). Commander writes
 * `error: <reason>\n`, and for an unknown command or option the closest match on a line of its own,
 * `(Did you mean <name>?)`. The first line without its `error: ` prefix is the reason; the suggestion,
 * without its parentheses, is the `hint` spec-005 §3.2 gives it a field for. Its WORDING stays
 * Commander's — reconciling it with spec-005 §3.1's `did you mean "<name>"?` is `bug-104`'s. Any other
 * line is kept, joined to the reason, so nothing Commander said is dropped.
 */
function commanderRefusal(text: string, format: OutputFormat): Parameters<typeof emitError> {
  const [first = '', ...rest] = text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const suggestion = /^\((Did you mean .*)\)$/;
  const hint = rest.map((line) => suggestion.exec(line)?.[1]).find((match) => match !== undefined);
  const reason = [first.replace(/^error: /, ''), ...rest.filter((line) => !suggestion.test(line))].join(' ');
  return [reason, { format, ...(hint !== undefined ? { hint } : {}) }];
}

/**
 * The `error: <reason>` text (spec-005 §3.1) for an invocation Commander found incomplete —
 * task-103-a-missing-verb-exits-2-with-an-error-line (`bug-103`). Commander supplies no message on
 * this path, so the wording is a **ruling**, recorded here rather than left to the reader:
 *
 * - `wingfoil dna`, `wingfoil memory`, and `wingfoil` with no arguments at all →
 *   `missing required argument: wingfoil dna <command>` / `missing required argument: wingfoil
 *   <command>`. The key is the one `spec-005` §1 already lists among its malformed invocations, and
 *   the shape is the one WingFoil already emits for a missing positional (`src/core/index.ts`'s
 *   `missing required argument: wingfoil dna set <path> --value <value>`, task-093): the incomplete
 *   invocation echoed back with the token that would complete it. `<command>` rather than `<verb>`
 *   matches Commander's own placeholder in the usage line printed directly above it.
 * - `wingfoil help nosuchnoun` → `unknown command 'nosuchnoun'`, byte-for-byte what `wingfoil
 *   nosuchnoun` already emits (Commander's `unknownCommand()`), because asking about an unknown noun
 *   through `help` is the same mistake and a script should have one shape to grep. The single quotes
 *   are Commander's; `spec-005` §4's example shows double ones, and reconciling the two spellings
 *   (along with the missing `hint:` suggestion) is `bug-104`'s, which owns both lines at once. Picking
 *   a third spelling here would make that reconciliation harder, not easier.
 *
 * @param operands - the root program's `args`: the invocation's operands, global options already
 *   removed by Commander itself. This function never re-parses argv.
 */
function incompleteInvocationReason(operands: readonly string[]): string {
  const [first, second] = operands;
  // `help <name>` reaches the incomplete-invocation path only when `<name>` matched no command —
  // `Command#_dispatchHelpCommand` falls through to `_dispatchSubcommand`, whose `if (!subCommand)`
  // raises it. `help` alone and `help <known-noun>` exit 0 and never arrive here.
  if (first === 'help' && second !== undefined) return `unknown command '${second}'`;
  return `missing required argument: ${['wingfoil', ...operands].join(' ')} <command>`;
}

/**
 * The Commander `Command` a `CliCommand` registers itself on: a flat, no-verb command
 * (`command.verb === ''` — `deriveVerb`'s self-named-operation case, spec-008-cli-grammar §1's
 * `wingfoil <noun> [args] [flags]` form, e.g. `wingfoil paths [category]` —
 * task-028-implement-paths-category) registers directly on the noun `Command` itself; every other
 * (`<noun> <verb>`) command keeps nesting under it exactly as before task-028.
 */
function resolveCommandTarget(program: Command, nounCommands: Map<string, Command>, command: CliCommand): Command {
  if (!command.verb) return program.command(command.noun);

  let nounCommand = nounCommands.get(command.noun);
  if (!nounCommand) {
    nounCommand = program.command(command.noun);
    nounCommands.set(command.noun, nounCommand);
  }
  return nounCommand.command(command.verb);
}

/**
 * Collapse this command's declared `CoreOperation.flags` names (`./registrar.ts`'s `CliCommand.flags`)
 * into a `{ name: boolean }` record read from Commander's parsed options object, so `command.run`
 * (Commander-independent) never has to know Commander's option-object shape. Returns `undefined` when
 * the command declares no flags (every command before task-028-implement-paths-category), matching
 * `CliCommand.run`'s already-optional `flags` parameter.
 */
function buildFlagValues(
  command: CliCommand,
  options: Record<string, unknown>,
): Readonly<Record<string, boolean>> | undefined {
  const flagNames = (command.flags ?? []).map((flag) => flag.name);
  if (flagNames.length === 0) return undefined;
  const flagValues: Record<string, boolean> = {};
  for (const name of flagNames) {
    flagValues[name] = Boolean(options[name]);
  }
  return flagValues;
}

/**
 * Collapse this command's declared `CoreOperation.options` (`./registrar.ts`'s `CliCommand.options`)
 * into a `{ name: value }` record read from Commander's parsed options object (task-020), so
 * `command.run` never has to know Commander's option-object shape. An option the invocation omitted is
 * simply absent from the record (not present-as-`undefined`), so a core op can distinguish "not given"
 * from an empty string; a repeatable option (task-110) is the array of its occurrences. Returns
 * `undefined` when the command declares no value options (every command
 * before task-020-implement-memory-add), matching `CliCommand.run`'s already-optional `options` param.
 */
function buildOptionValues(
  command: CliCommand,
  options: Record<string, unknown>,
): Readonly<Record<string, string | readonly string[]>> | undefined {
  const declared = command.options ?? [];
  if (declared.length === 0) return undefined;
  const optionValues: Record<string, string | readonly string[]> = {};
  for (const { name } of declared) {
    const value = options[commanderKey(name)];
    if (typeof value === 'string') optionValues[name] = value;
    else if (Array.isArray(value)) optionValues[name] = value.filter((item): item is string => typeof item === 'string');
  }
  return optionValues;
}

/**
 * The property Commander stores a `--{name} <value>` option under: it camel-cases across `-`
 * (`--entry-executes_as` -> `entryExecutes_as`) and leaves every other character alone.
 *
 * `CoreOption.name` is the declared name, and `CliCommand.run` hands core its options keyed by THAT,
 * so this is the one place the two spellings meet. Before task-093 the lookup used the declared name
 * directly, which worked only because every option declared so far happened to be a single word: a
 * dashed name would have been read as `undefined` and dropped in silence — the same failure mode as
 * the shadowing this task fixes, one layer further in. `test/cli/derived-option-namespace.test.ts`
 * drives every dashed option the registry declares through the real CLI, so neither can return
 * unnoticed.
 */
function commanderKey(name: string): string {
  return name.replace(/-([a-zA-Z0-9])/g, (_match, char: string) => char.toUpperCase());
}
