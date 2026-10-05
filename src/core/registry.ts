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
 * validation, task-025); it is surfaced here so `src/cli/program.ts` (and, later, the MCP Tool
 * input schema) can describe the option without duplicating that knowledge. task-021's
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
 * `required` is declarative, like {@link CoreOption.required}: the operation's own `CoreFn` refuses a
 * missing positional (a `UsageError`, exit `2`), and `src/cli/program.ts` only renders it — Commander
 * is never told to enforce it, so the refusal keeps core's message. `test/cli/help-positional-required.integration.test.ts`
 * checks that the declaration and the refusal agree.
 */
export interface CorePositional {
  /** The name `--help` shows, in the placeholder form the CLI reference uses — `id`, `path`, `name`, `section`. */
  readonly name: string;
  /** Whether the operation refuses an invocation that omits it. Absent means optional. */
  readonly required?: boolean;
  /** What `--help` says the argument is. */
  readonly description: string;
  /**
   * Whether the operation refuses an operand beyond this one ITSELF, instead of the registrar doing it
   * (task-129, `bug-171`). The registrar refuses a surplus operand for every command, before resolving
   * the project root (`src/cli/registrar.ts`); an operation sets this only when another usage check of
   * its own must come first — the DNA path verbs, where a malformed path is reported before the
   * migration message (`P2.1-dna-set.feature`'s `dna set ..language python`). Such an operation must
   * still refuse the surplus at exit `2` with {@link extraOperandsReason}'s wording:
   * `test/cli/extra-operand-refusal.integration.test.ts` drives every registered command with one
   * operand too many, whoever refuses it. Absent means the registrar refuses.
   */
  readonly refusesExtraItself?: boolean;
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
   * {@link ParamsContext.options}; the MCP surface never populates them (task-030 wires the Tool input
   * schema). See {@link CoreOption}.
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
 * operation's `CoreOperation.flags` declaration (`./registry.ts`). The MCP adapter's own mechanical,
 * zero-argument Resource/Tool registration (`src/mcp/registrar.ts`) never populates either — a
 * `buildParams` that ignores both (every `ParamsBuilder` before this task) keeps working unchanged.
 */
export interface ParamsContext {
  readonly moduleName: string;
  readonly operationName: string;
  readonly root: string;
  /**
   * The bare CLI positional argument following `<noun> <verb>` (or `<noun>` for a flat command),
   * if the invocation supplied one (e.g. `wingfoil dna show tech_stack` -> `"tech_stack"`,
   * `wingfoil paths sources` -> `"sources"`) — task-026-implement-dna-show's generic seam, kept as
   * the single source of truth. Deliberately singular and untyped beyond `string | undefined`: any
   * operation's `buildParams` reads it under whatever param name that operation's own `CoreFn`
   * expects (`dnaShow`'s `section`, `paths`'s `category`), and an operation needing a *required*
   * positional still owns that validation in its own `CoreFn` — this seam only carries the raw
   * value from the CLI adapter through to `buildParams`. The MCP surface has no equivalent
   * mechanical concept today (a zero-argument Resource template can't carry one — spec-004 §2.1's
   * own `wingfoil://dna/{section}` addressing is the MCP-side answer, wired independently in
   * `src/mcp/dna-resource.ts`), so an MCP `buildParams` simply never sets this field.
   */
  readonly positional?: string;
  /**
   * The FULL list of bare CLI positional arguments following `<noun> <verb>` (or `<noun>` for a flat
   * command) — task-025-implement-dna-set's additive extension of the single-`positional` seam, needed
   * by the first operation taking two data inputs (`dna set <key> <value>` -> `['<key>', '<value>']`).
   * Since `dl-082-cli-parameter-shape` (task-093) every command reads at most ONE positional — the
   * identity of its target — and `dna set`'s value travels in `--value`, so the list is now a
   * uniform seam rather than one shaped by a single two-input verb; it stays variadic so an
   * operation declaring {@link CorePositional.refusesExtraItself} can refuse an extra positional after
   * its own checks. For every other operation the registrar refuses a surplus before `buildParams` is
   * called (task-129), so the list it sees never exceeds the declared count.
   * {@link positional} is exactly `positionals?.[0]` and is kept unchanged for the single-positional
   * read ops that predate this (`dna show [section]`, `paths [category]`), so their `buildParams` and
   * `CoreFn`s are untouched; an op that must validate its positional (`dnaSet` and the three mutation
   * verbs, which reject an extra one) reads `positionals`
   * instead. Same additive contract as {@link positional}/{@link flags}: the MCP surface never
   * populates it (a zero-argument Tool/Resource template carries no positional — see {@link positional}),
   * so an MCP `buildParams` simply never sets it.
   */
  readonly positionals?: readonly string[];
  /**
   * This operation's declared {@link CoreOperation.flags} names mapped to their parsed boolean
   * values (task-028-implement-paths-category — e.g. `{ list: true }` for `wingfoil paths sources
   * --list`). Additive alongside `positional`: an operation declaring no flags never has this set,
   * and the MCP surface never populates it (same rationale as `positional`).
   */
  readonly flags?: Readonly<Record<string, boolean>>;
  /**
   * This operation's declared {@link CoreOperation.options} names mapped to their parsed string
   * VALUES (task-020-implement-memory-add — e.g. `{ type: 'decision', title: 'Use PostgreSQL' }` for
   * `wingfoil memory add --type decision --title 'Use PostgreSQL'`). Additive alongside `flags`: an
   * operation declaring no value options never has this set, and the MCP surface never populates it
   * (a zero-argument Tool template carries none — same rationale as `positional`/`flags`; task-030
   * wires the MCP Tool input schema separately). An absent optional option is simply omitted from the
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
