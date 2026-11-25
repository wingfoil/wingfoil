/**
 * The `CoreModule` registry shape (spec-006-core-domain-api §2, §4 — task-006). `src/cli` and
 * `src/mcp` both import the same `CoreModule[]` array (`./index.ts`'s `CORE_MODULES`) and register
 * every operation they find — neither surface is permitted a hardcoded allow/deny list of operation
 * names (§4.2). This module owns: the registry types themselves, the one mechanical
 * name-derivation function both adapters use to turn an operation's camelCase name into its CLI
 * verb / MCP Tool-and-Resource verb segment (so neither adapter hand-maintains a second name
 * mapping — spec-006 §5), a deterministic (REQ-SYS-07) enumerator, and the generic parity-diff
 * primitive the REQ-SYS-05 fit criterion's "0 unmatched operations" assertion is built on.
 */
import { DRY_RUN_FLAG } from './dry-run';
import type { CoreResult } from './types';

/**
 * The signature every core operation implements (spec-006 §2): an async function from typed params
 * `P` to a `CoreResult<R>` — never a thrown error for an expected domain failure (see {@link CoreResult}).
 */
export type CoreFn<P, R> = (params: P) => Promise<CoreResult<R>>;

/**
 * One value-bearing CLI option an operation accepts (task-020-implement-memory-add) — e.g.
 * `--type <value>`, `--title <value>`, `--tags <value>` for `memory add`. Distinct from
 * {@link CoreOperation.flags}, which are BOOLEAN presence flags (`--list`): an option carries a
 * string VALUE (`.option('--<name> <value>')`). `required` is declarative metadata: the operation's
 * own `CoreFn` enforces it (throwing a `UsageError` → exit 2, consistent with `dna set`'s in-fn arg
 * validation, task-025); it is surfaced here so `src/cli/program.ts` and the MCP Tool input schema
 * ({@link deriveToolInputSchema}, task-364) describe the option without duplicating that knowledge. task-021's
 * `memory submit`/etc. reuse this exact mechanism — the ONE value-option seam, not a parallel one.
 */
export interface CoreOption {
  readonly name: string;
  readonly required?: boolean;
  /**
   * What `--help` says about this option. Optional in the type, so a synthetic registry need not
   * declare it; an option that declares none is shown with no text rather than the generic
   * `"{name} value"` placeholder rendered before task-120 (`bug-128`), and every option in
   * `CORE_MODULES` declares one (`test/cli/help-describes-every-command.test.ts`). It exists because a
   * convention a grammar cannot show must be *stated* somewhere a user reads — `dna add|remove|update
   * --value` means the new entry's identity at a collection and the new value at a leaf
   * (`dl-081-dna-mutation-surface-shape`, task-093), which is exactly the kind of thing that otherwise
   * gets discovered rather than documented.
   */
  readonly description?: string;
  /**
   * Whether the option may be given more than once (task-110 — `memory add --set <name>=<value>`,
   * `spec-008-cli-grammar` §10). A repeatable option reaches {@link ParamsContext.options} as the
   * array of every occurrence, in the order given; a non-repeatable one as a single string (the last
   * occurrence, Commander's default). Absent means not repeatable.
   */
  readonly repeatable?: boolean;
  /**
   * The placeholder `--help` shows for the option's value (`--{name} <{valueName}>`). Absent means
   * `value`, the placeholder every option declared before task-110 renders.
   */
  readonly valueName?: string;
}

/**
 * One boolean presence flag an operation accepts (`--list`), with the text `--help` shows for it
 * (task-120, `bug-128` — before it a flag was a bare name, rendered as the generic `"{name} flag"`).
 */
export interface CoreFlag {
  readonly name: string;
  /** What `--help` says the flag does. */
  readonly description?: string;
}

/**
 * The one positional argument an operation reads — the identity of its target (`dl-082-cli-parameter-shape`:
 * a positional identifies the target, an option carries an attribute), declared so `--help` can name
 * it (`<id>`, `<path>`, `[section]`) instead of describing a generic list (task-120, `bug-128`).
 *
 * `required` is enforced by the CLI registrar (`src/cli/registrar.ts`, task-179, `bug-168`): an
 * invocation that omits it is refused at exit `2` with {@link missingOperandReason}'s one wording and the
 * command's {@link commandUsage} as the hint, before the project root is resolved. The operation's own
 * `CoreFn` refuses it too, in the same words, for a caller that reaches core without the registrar.
 * `src/cli/program.ts` only renders it — Commander is never told to enforce it, so the refusal keeps
 * WingFoil's message. `test/cli/operand-error-shape.integration.test.ts` drives every command that
 * declares a required positional without it.
 */
export interface CorePositional {
  /** The name `--help` shows, in the placeholder form the CLI reference uses — `id`, `path`, `name`, `section`. */
  readonly name: string;
  /** Whether the operation refuses an invocation that omits it. Absent means optional. */
  readonly required?: boolean;
  /** What `--help` says the argument is. */
  readonly description: string;
  /**
   * A clause the surplus-operand refusal adds after what the command takes, naming what the extra
   * operand should have been (task-179, `bug-180`): the DNA path verbs' `the value travels in --value`,
   * the migration hint of `dl-082`'s move of the value out of a second positional. The registrar refuses
   * a surplus operand for every command alike, before the project root is resolved
   * (`src/cli/registrar.ts`), and appends this through {@link extraOperandsReason}. Absent means none.
   */
  readonly surplusHint?: string;
}

/**
 * The usage error for an invocation carrying more operands than its command declares
 * (`dl-082-cli-parameter-shape`: at most one positional per command; task-129, `bug-171`, `bug-131`):
 * it names the command, what it takes, and how many operands it got —
 * `wingfoil memory approve takes one positional <id> (got 2 positionals)`,
 * `wingfoil workflow list takes no positional (got 1 positional)`. `hint`, when given, follows what the
 * command takes: `dna set`'s migration message is this sentence with `the value travels in --value`
 * (task-093), so the two refusals share one wording. Deterministic — a pure function of its arguments
 * (REQ-SYS-07).
 *
 * @param command - the command as typed after `wingfoil`: `memory approve`, or a flat noun (`paths`).
 * @param positionalName - the declared positional's name, or `undefined` when the command declares none.
 * @param given - how many operands the invocation carried.
 * @param hint - an optional clause naming what the surplus operand should have been.
 */
export function extraOperandsReason(command: string, positionalName: string | undefined, given: number, hint?: string): string {
  const takes = positionalName === undefined ? 'takes no positional' : `takes one positional <${positionalName}>`;
  return `wingfoil ${command} ${takes}${hint === undefined ? '' : `; ${hint}`} (got ${given} positional${given === 1 ? '' : 's'})`;
}

/**
 * The usage error for an invocation that omits a required operand (`spec-008-cli-grammar` §4; task-179,
 * `bug-168`): `missing required argument: <id>` — the positional's placeholder, as `--help` writes it,
 * beside `missing required argument: --<name>` for an option. One wording for every command; the
 * registrar adds the command's usage as the `hint:` line ({@link commandUsage}). Deterministic.
 *
 * @param positionalName - the declared positional's name (`id`, `path`, `name`).
 */
export function missingOperandReason(positionalName: string): string {
  return `missing required argument: <${positionalName}>`;
}

/**
 * The usage line of a command, as the missing-operand refusal's `hint:` shows it (task-179, `bug-168`):
 * `wingfoil <command>`, the declared positional (`<id>` when required, `[section]` when not), then every
 * REQUIRED option with its placeholder — `wingfoil memory approve <id> --reason <text>`. Optional
 * options are left to `--help`. A pure function of the declaration (REQ-SYS-07).
 *
 * @param command - the command as typed after `wingfoil`: `memory approve`, or a flat noun (`paths`).
 * @param operation - the operation whose declaration the line is read from.
 */
export function commandUsage(command: string, operation: Pick<CoreOperation, 'positional' | 'options'>): string {
  const positional = operation.positional;
  const operand = positional === undefined ? [] : [positional.required === true ? `<${positional.name}>` : `[${positional.name}]`];
  const options = (operation.options ?? [])
    .filter((option) => option.required === true)
    .map((option) => `--${option.name} <${option.valueName ?? 'value'}>`);
  return ['wingfoil', command, ...operand, ...options].join(' ');
}

/**
 * One domain operation both surfaces derive from (spec-006 §2): its camelCase `name`, whether it
 * `mutates` (Tool vs Resource / write vs read), its `fn`, and its optional declarative CLI `flags`
 * and value-bearing `options`. The single source of truth `src/cli` and `src/mcp` register from.
 */
export interface CoreOperation<P = unknown, R = unknown> {
  /**
   * camelCase, `{module}{Verb}` (spec-006 §5) — e.g. `memoryApprove`, `dnaShow` — or, for a self-named
   * flat operation, exactly the module's name (`paths`; `dl-046` C), from which {@link deriveVerb}
   * derives no verb, so the command is the bare `wingfoil <module>`.
   */
  readonly name: string;
  /** `true` => MCP Tool only; `false` => MCP Resource only. CLI exposes both regardless (§2). */
  readonly mutates: boolean;
  readonly fn: CoreFn<P, R>;
  /**
   * Boolean CLI flags this operation accepts beyond the global flags (spec-008-cli-grammar §2) — e.g.
   * `paths`'s `--list` (task-028-implement-paths-category, P2.5). Additive and optional: an operation
   * that declares none keeps exactly the bare-`{ root }` shape task-026 established. The positional is
   * declared separately ({@link positional}); only extra `--{name}` flags are listed here, since
   * Commander rejects an unknown option so each must be registered explicitly. `src/cli/program.ts`
   * registers one `--{name}` option per entry, described by its {@link CoreFlag.description}
   * (task-120), and threads the parsed boolean into {@link ParamsContext.flags}.
   */
  readonly flags?: readonly CoreFlag[];
  /**
   * Value-bearing CLI options this operation accepts beyond the global options
   * (task-020-implement-memory-add — e.g. `[{name:'type',required:true}, {name:'title',required:true},
   * {name:'tags'}]` for `memory add`). Additive alongside {@link flags}: an operation declaring none
   * keeps exactly the bare shape it had before. `src/cli/program.ts` registers one
   * `--{name} <value>` Commander option per entry and threads the parsed values into
   * {@link ParamsContext.options}; the MCP registrar derives the same entries into the Tool's input
   * schema ({@link deriveToolInputSchema}) and threads a Tool call's arguments into the same record
   * ({@link toolArgumentsToParams}, task-364, `dl-040` option 1). See {@link CoreOption}.
   */
  readonly options?: readonly CoreOption[];
  /**
   * The one-line summary `--help` shows for this command (task-120, `bug-128`) — the first sentence
   * of its `docs/cli-reference.md` entry, which `test/docs/cli-reference.test.ts` holds it to.
   */
  readonly description?: string;
  /** The positional this operation reads, if any (see {@link CorePositional}). Absent means none. */
  readonly positional?: CorePositional;
  /** One complete invocation `--help` shows under `Example:` (`spec-008-cli-grammar` §8), `wingfoil …` included. */
  readonly example?: string;
  /**
   * The command's own `--format console` rendering of a successful `value`, for an operation whose
   * spec defines one (task-220: `agent show`'s `key: value` lines, `spec-016` §6). Absent, `console`
   * prints the indented JSON `spec-008` §2 declares for every other command until P5.1.4. `json` and
   * `yaml` never use it, and the MCP surface never calls it. Pure: the same value and call render the same text.
   *
   * `call` carries the invocation's parsed {@link flags} (`spec-006` §2, from `minor-v0.4`, task-374), for a
   * console-only flag such as `workflow status --full`; every other renderer ignores it.
   */
  readonly renderConsole?: (value: R, call?: { readonly flags: Readonly<Record<string, boolean>> }) => string;
  /**
   * For a command that hands its stdout to a child process (`agent execute`, `spec-016` §3.4, task-228):
   * the report its success prints **on stderr**, with nothing on stdout (`spec-005` §2). `document` is
   * the `json`/`yaml` message (`{ "run": <record> }`), `console` the line `console` prints. `undefined`
   * for a value that is an ordinary stdout payload (the `--dry-run` launch plan). The MCP surface never
   * calls it.
   */
  readonly renderToStderr?: (value: R) => StderrReport | undefined;
  /**
   * `false` for a mutating operation that takes no agent attribution option (`spec-018` §1.1: `agent execute`, whose
   * record commit is WingFoil's own and names the launched agent in its `run`). Absent — every other operation —
   * the CLI registrar derives `--co-author <name>` for each `mutates: true` operation, as it derives `--dry-run`, so
   * an operation added later takes it with no line of its own (`spec-018` §1, §2.3; task-333 design D4). Declared
   * here, never by an operation name in the registrar (`spec-006` §4.2).
   */
  readonly agentAttribution?: false;
  /**
   * `false` for an operation that reads no project (`spec-019` §1: `capabilities`, whose document is a property of the
   * build). Absent — every other operation — the registrars resolve the project root before the call. Declared, the
   * CLI registrar runs `checkProject` (the blank `--project` refusal) in place of `resolveRoot`, the MCP registrar
   * resolves nothing, and the {@link ParamsContext} they build carries no `root`. Declared here, never by an operation
   * name in a registrar (`spec-006` §4.2).
   */
  readonly readsProject?: false;
}

/** A success report written on stderr instead of a stdout payload ({@link CoreOperation.renderToStderr}). */
export interface StderrReport {
  /** The `json`/`yaml` message: one document. */
  readonly document: Readonly<Record<string, unknown>>;
  /** The `console` line, without its newline. */
  readonly console: string;
}

/** One pillar's operation group (spec-006 §2) — a `name` (the `wingfoil <noun>` segment) and its operations. */
export interface CoreModule {
  /** e.g. `"memory"`, `"dna"`, `"workflow"`, `"directives"` — the `wingfoil <noun>` segment. */
  readonly name: string;
  /** The one-line summary `wingfoil --help` shows for the noun (task-120, `bug-128`). */
  readonly description?: string;
  /** This module's operations, keyed by camelCase operation name (see {@link CoreOperation}). */
  readonly operations: Readonly<Record<string, CoreOperation>>;
}

/** One operation, paired with the module that declares it — the flat shape both adapters iterate. */
export interface EnumeratedOperation {
  readonly module: CoreModule;
  readonly operation: CoreOperation;
}

/**
 * Flatten `modules` into every declared operation, sorted deterministically by `(module.name,
 * operation.name)` (REQ-SYS-07 — no unordered `Object.values`/iteration in a context-building
 * path). Both `src/cli` and `src/mcp` register from this single enumerator, never from their own
 * ad hoc traversal of `modules`/`Object.keys`.
 */
export function enumerateOperations(modules: readonly CoreModule[]): EnumeratedOperation[] {
  const out: EnumeratedOperation[] = [];
  const sortedModules = [...modules].sort((a, b) => a.name.localeCompare(b.name));
  for (const module of sortedModules) {
    const operationNames = Object.keys(module.operations).sort();
    for (const operationName of operationNames) {
      const operation = module.operations[operationName];
      if (operation) out.push({ module, operation });
    }
  }
  return out;
}

/** camelCase -> kebab-case (`"setTeam"` -> `"set-team"`), used by {@link deriveVerb}. */
function camelToKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Derive an operation's CLI verb / MCP verb segment from its camelCase `{module}{Verb}` name
 * (spec-006 §5), mechanically — this plus `mutates` is "the one place surface-routing logic
 * lives" (§2): given `moduleName = "memory"` and `operationName = "memoryApprove"`, returns
 * `"approve"`; a multi-word verb (`"workflowSetTeam"`) becomes kebab-case (`"set-team"`) so it
 * renders as a single CLI token / Tool-name segment. Falls back to the full operation name,
 * kebab-cased, when it does not start with the module's name — a config mistake the caller should
 * catch earlier, but this function degrades rather than throwing, so a single bad registration
 * cannot crash an adapter's entire registration pass.
 */
export function deriveVerb(moduleName: string, operationName: string): string {
  // A "self-named" operation — its name is EXACTLY the module name (e.g. module `paths`, operation
  // `paths`) — derives the empty string, not a verb: this is spec-008-cli-grammar §1's flat/no-verb
  // command form (`wingfoil <noun> [args] [flags]`, e.g. `wingfoil paths [category]`), as opposed to
  // the `<noun> <verb>` form every other operation today derives (`wingfoil dna show`). Both
  // `src/cli/program.ts` and `src/mcp/registrar.ts` special-case an empty verb to skip the
  // subcommand/URI-segment nesting they otherwise add (task-028-implement-paths-category).
  if (operationName === moduleName) return '';
  const startsWithModule = operationName.startsWith(moduleName) && operationName.length > moduleName.length;
  const suffix = startsWithModule ? operationName.slice(moduleName.length) : operationName;
  const withLeadingLower = suffix.length > 0 ? suffix[0]!.toLowerCase() + suffix.slice(1) : suffix;
  return camelToKebab(withLeadingLower);
}

/**
 * What a surface adapter (`src/cli`, `src/mcp`) knows about the call it is about to make — enough
 * for a caller-supplied {@link ParamsBuilder} to construct that operation's actual typed params.
 * Neither adapter hardcodes per-operation argv/Tool-input parsing here (that is each future
 * operation's own CLI-command / Tool-input-schema spec, per spec-005's own scope note) — every
 * operation registered through task-006/task-027 took a bare `{ root }`; task-028-implement-paths-category
 * is the first to need more, and does so exactly the way this interface's doc comment always
 * anticipated: a richer `buildParams`, not a registrar change. `positional` is the first
 * operand of the invocation: `src/cli/program.ts` reads the operands of every derived command, whether
 * or not its operation declares a {@link CorePositional} (which only names the operand for `--help`),
 * and threads them through `command.run` into `ctx.positional`/`ctx.positionals`; `flags` is populated from the matching
 * operation's `CoreOperation.flags` declaration (`./registry.ts`). The MCP registrar (`src/mcp/registrar.ts`)
 * populates the same fields for a Tool call, from its arguments, through {@link toolArgumentsToParams}
 * (task-364, `dl-040` option 1); a Resource read populates `positional`/`positionals` from a required
 * positional's URI template variable and nothing else, and a Resource with no template variable serves
 * the call that gives none of the optional parameters (`spec-006` §3).
 */
export interface ParamsContext {
  readonly moduleName: string;
  readonly operationName: string;
  /**
   * The project root the call reads: present for every operation that reads a project, absent for one that declares
   * {@link CoreOperation.readsProject} `false` (`spec-019` §1, task-362), which no registrar resolves a root for.
   */
  readonly root?: string;
  /**
   * The bare CLI positional argument following `<noun> <verb>` (or `<noun>` for a flat command),
   * if the invocation supplied one (e.g. `wingfoil dna show tech_stack` -> `"tech_stack"`,
   * `wingfoil paths sources` -> `"sources"`) — task-026-implement-dna-show's generic seam, kept as
   * the single source of truth. Deliberately singular and untyped beyond `string | undefined`: any
   * operation's `buildParams` reads it under whatever param name that operation's own `CoreFn`
   * expects (`dnaShow`'s `section`, `paths`'s `category`), and an operation needing a *required*
   * positional still owns that validation in its own `CoreFn` — this seam only carries the raw
   * value from the CLI adapter through to `buildParams`. On the MCP surface a Tool call sets it from
   * the argument named after the declared positional, and a Resource read from the URI template
   * variable of a required positional (task-364); a Resource without one leaves it unset.
   */
  readonly positional?: string;
  /**
   * The FULL list of bare CLI positional arguments following `<noun> <verb>` (or `<noun>` for a flat
   * command) — task-025-implement-dna-set's additive extension of the single-`positional` seam, needed
   * by the first operation taking two data inputs (`dna set <key> <value>` -> `['<key>', '<value>']`).
   * Since `dl-082-cli-parameter-shape` (task-093) every command reads at most ONE positional — the
   * identity of its target — and `dna set`'s value travels in `--value`, so the list is now a
   * uniform seam rather than one shaped by a single two-input verb. The registrar refuses a surplus
   * for every operation before `buildParams` is called (task-129; the DNA path verbs too since
   * task-179, `bug-180`), so the list it sees never exceeds the declared count.
   * {@link positional} is exactly `positionals?.[0]` and is kept unchanged for the single-positional
   * read ops that predate this (`dna show [section]`, `paths [category]`), so their `buildParams` and
   * `CoreFn`s are untouched; the four DNA path verbs (`dnaSet` and the three mutation verbs) read
   * `positionals` instead. On the MCP surface it is set exactly when {@link positional} is, as the
   * one-element list (a Tool call with no positional argument sets `[]`, as the CLI does), see {@link positional}.
   */
  readonly positionals?: readonly string[];
  /**
   * This operation's declared {@link CoreOperation.flags} names mapped to their parsed boolean
   * values (task-028-implement-paths-category — e.g. `{ list: true }` for `wingfoil paths sources
   * --list`). Additive alongside `positional`: an operation declaring no flags never has this set.
   * A Tool call sets it from its boolean arguments, every declared flag present (`false` when not
   * given), as the CLI does; a Resource read never sets it (task-364).
   */
  readonly flags?: Readonly<Record<string, boolean>>;
  /**
   * This operation's declared {@link CoreOperation.options} names mapped to their parsed string
   * VALUES (task-020-implement-memory-add — e.g. `{ type: 'decision', title: 'Use PostgreSQL' }` for
   * `wingfoil memory add --type decision --title 'Use PostgreSQL'`). Additive alongside `flags`: an
   * operation declaring no value options never has this set. A Tool call sets it from its string
   * arguments through {@link toolArgumentsToParams}, in the CLI's shape; a Resource read never sets it
   * (task-364). An absent optional option is simply omitted from the
   * record rather than present-as-`undefined`. A {@link CoreOption.repeatable} option's value is the
   * array of its occurrences (task-110).
   */
  readonly options?: Readonly<Record<string, string | readonly string[]>>;
}

/**
 * A surface-supplied function that turns a {@link ParamsContext} into the typed params one operation's
 * {@link CoreFn} expects — the single per-surface seam where CLI/MCP-specific argument shaping lives,
 * so the registrars stay operation-agnostic (spec-006 §2).
 */
export type ParamsBuilder = (ctx: ParamsContext) => unknown;

/**
 * The one params builder both surfaces use (task-364 design D11): the context's `root`, `positional`,
 * `positionals` and `options` as they are, plus every flag spread under its own name (`paths`'s
 * `--list` → `list: true`). `src/cli.ts` passes it to `buildProgram`, and an MCP server passes it to
 * `registerCoreModules`, so "the params the CLI builds" for an invocation is one function. Pure (REQ-SYS-07).
 */
export function buildCoreParams(ctx: ParamsContext): Record<string, unknown> {
  return { root: ctx.root, positional: ctx.positional, positionals: ctx.positionals, options: ctx.options, ...(ctx.flags ?? {}) };
}

/** One property of a {@link ToolInputSchema}: a string, a boolean, or an array of strings, with the declaration's description. */
export interface ToolInputProperty {
  readonly type: 'string' | 'boolean' | 'array';
  /** Present only on an `array`: its items are strings. */
  readonly items?: { readonly type: 'string' };
  readonly description?: string;
}

/**
 * The JSON Schema of a Tool's arguments (`spec-004` §4.3, task-364): one property per declared parameter
 * under its CLI spelling, the required ones listed, nothing else accepted.
 */
export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, ToolInputProperty>>;
  /** The required parameters, positional first; absent when none is required. */
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

/** One parameter of an operation as a Tool takes it: its name, its property, whether it is required, and what it is. */
interface ToolParameter {
  readonly name: string;
  readonly property: ToolInputProperty;
  readonly required: boolean;
  readonly kind: 'positional' | 'option' | 'flag' | 'dry-run';
}

/** A property with the description, when the declaration has one. */
function property(type: 'string' | 'boolean', description: string | undefined): ToolInputProperty {
  return description === undefined ? { type } : { type, description };
}

/**
 * The parameters a Tool of `operation` takes, in schema order (`spec-004` §4.3, design D2, D3, D6): the
 * positional, each option, each flag, in declaration order, then `dry-run` when the operation mutates.
 * `--co-author` and `--ai-model`, which the CLI derives from `mutates`, are not Tool inputs (W1-R3).
 */
function toolParameters(operation: CoreOperation): ToolParameter[] {
  const out: ToolParameter[] = [];
  const positional = operation.positional;
  if (positional !== undefined) {
    out.push({ name: positional.name, property: property('string', positional.description), required: positional.required === true, kind: 'positional' });
  }
  for (const option of operation.options ?? []) {
    const prop: ToolInputProperty =
      option.repeatable === true
        ? { type: 'array', items: { type: 'string' }, ...(option.description === undefined ? {} : { description: option.description }) }
        : property('string', option.description);
    out.push({ name: option.name, property: prop, required: option.required === true, kind: 'option' });
  }
  for (const flag of operation.flags ?? []) {
    out.push({ name: flag.name, property: property('boolean', flag.description), required: false, kind: 'flag' });
  }
  if (operation.mutates) {
    out.push({ name: DRY_RUN_FLAG.name, property: property('boolean', DRY_RUN_FLAG.description), required: false, kind: 'dry-run' });
  }
  return out;
}

/**
 * Derive the input schema of `operation`'s Tool from its parameter metadata — the `positional`,
 * `options` and `flags` the CLI derives its arguments from (task-364, `dl-040` option 1, `spec-004` §4.3).
 * A positional or an option is a `string`, a repeatable option an `array` of strings, a flag and
 * `dry-run` a `boolean`. An operation that declares nothing takes nothing (plus `dry-run` when it
 * mutates, design D4). Pure (REQ-SYS-07): the same declaration derives the same schema, in the same order.
 */
export function deriveToolInputSchema(operation: CoreOperation): ToolInputSchema {
  const parameters = toolParameters(operation);
  const properties: Record<string, ToolInputProperty> = {};
  for (const parameter of parameters) properties[parameter.name] = parameter.property;
  const required = parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name);
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
}

/** What a Tool call's arguments become (see {@link toolArgumentsToParams}). */
export type ToolArgumentsOutcome =
  | {
      readonly ok: true;
      /** The fields of the {@link ParamsContext} the CLI registrar builds for the same invocation. */
      readonly context: Pick<ParamsContext, 'positional' | 'positionals' | 'flags' | 'options'>;
      /** Whether the call asked for `dry-run` (a mutating operation only). */
      readonly dryRun: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/** The type refusal of `parameter`'s value, or `undefined` when the value has its schema type. */
function typeRefusal(parameter: ToolParameter, value: unknown): string | undefined {
  if (parameter.property.type === 'boolean') {
    return typeof value === 'boolean' ? undefined : `invalid argument: ${parameter.name} must be a boolean`;
  }
  if (parameter.property.type === 'array') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? undefined
      : `invalid argument: ${parameter.name} must be an array of strings`;
  }
  return typeof value === 'string' ? undefined : `invalid argument: ${parameter.name} must be a string`;
}

/**
 * Check a Tool call's `args` against `operation`'s {@link deriveToolInputSchema} and map them to the
 * {@link ParamsContext} fields the CLI registrar builds for the same invocation (task-364, `bug-272`,
 * `spec-004` §4.3, design D10). The first finding refuses the call, in this order: an argument the
 * schema does not name (`unknown argument: <name>`, the first in sorted order); then, in schema order,
 * a value of the wrong type (`invalid argument: <name> must be a string` / `a boolean` / `an array of
 * strings`) or a required parameter that is absent (`missing required argument: <name>`).
 *
 * The context mirrors `src/cli/registrar.ts`: `positionals` is the positional's one value or `[]`, and
 * `positional` its first element; `flags` holds every declared flag (`false` when not given), or is
 * `undefined` when the operation declares none (`dry-run` goes to `dryRun`, never to `flags`); `options`
 * holds the given declared options (a repeatable one as its array), or is `undefined` when the operation
 * declares none, or when none is given on an operation for which the CLI derives `--co-author`. Pure.
 */
export function toolArgumentsToParams(operation: CoreOperation, args: Readonly<Record<string, unknown>> | undefined): ToolArgumentsOutcome {
  const given = args ?? {};
  const parameters = toolParameters(operation);
  const known = new Set(parameters.map((parameter) => parameter.name));
  const unknown = Object.keys(given).filter((name) => !known.has(name)).sort();
  if (unknown.length > 0) return { ok: false, reason: `unknown argument: ${unknown[0]}` };

  for (const parameter of parameters) {
    const value = given[parameter.name];
    if (value === undefined) {
      if (parameter.required) return { ok: false, reason: `missing required argument: ${parameter.name}` };
      continue;
    }
    const refusal = typeRefusal(parameter, value);
    if (refusal !== undefined) return { ok: false, reason: refusal };
  }

  const positionalName = operation.positional?.name;
  const positionalValue = positionalName === undefined ? undefined : given[positionalName];
  const positionals: readonly string[] = typeof positionalValue === 'string' ? [positionalValue] : [];

  const declaredFlags = operation.flags ?? [];
  const flags =
    declaredFlags.length === 0 ? undefined : Object.fromEntries(declaredFlags.map((flag) => [flag.name, given[flag.name] === true]));

  const declaredOptions = operation.options ?? [];
  let options: Record<string, string | readonly string[]> | undefined;
  if (declaredOptions.length > 0) {
    const values: Record<string, string | readonly string[]> = {};
    for (const option of declaredOptions) {
      const value = given[option.name];
      if (typeof value === 'string' || Array.isArray(value)) values[option.name] = value as string | readonly string[];
    }
    const takesCoAuthor = operation.mutates && operation.agentAttribution !== false;
    options = takesCoAuthor && Object.keys(values).length === 0 ? undefined : values;
  }

  return {
    ok: true,
    context: { positional: positionals[0], positionals, flags, options },
    dryRun: operation.mutates && given[DRY_RUN_FLAG.name] === true,
  };
}

/** The result of {@link computeParityDiff}: entries present on only one side, each sorted. */
export interface ParityDiff {
  readonly onlyInA: readonly string[];
  readonly onlyInB: readonly string[];
}

/**
 * Set-difference both ways between two enumerations of the same kind of key (e.g. `"noun verb"`
 * CLI commands vs. the same keys' MCP Tool names, normalized to a common form by the caller) —
 * the REQ-SYS-05 fit-criterion primitive: "reports 0 [operations] without a matching [counterpart]"
 * in each direction. Both output lists are sorted, independent of input order (REQ-SYS-07).
 */
export function computeParityDiff(a: readonly string[], b: readonly string[]): ParityDiff {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyInA = [...setA].filter((key) => !setB.has(key)).sort();
  const onlyInB = [...setB].filter((key) => !setA.has(key)).sort();
  return { onlyInA, onlyInB };
}
