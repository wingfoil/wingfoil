/**
 * Layer 3 — the token-binding file `.wingfoil/workflows/bindings.yaml` (spec-003-workflows-yaml-schema
 * § "Layer 3", `dl-090` Q1 (a), Q2 (c), Q3 (a), Q4, Q5 (c), Q6), and the **built-in** binding table
 * (spec-003 § "Action expressions"). Every `actions:` and `checks:` token of a workflow resolves through
 * one of the two: a token WingFoil implements itself is built in and may not be rebound; every other
 * token is bound by the project here, or is unbound (`W_WORKFLOW_UNBOUND_TOKEN`, a warning in v0.3).
 *
 * Like `./schema.ts`, this module holds the **structural** (Zod) shape plus the pure readings the
 * loader's checks and later commands share ({@link tokenName}, {@link isBuiltinToken},
 * {@link resolveToken}, {@link isWholeInterpolation}, {@link runsAgentExecute}). The loader rows
 * themselves are run by `src/core/loaders.ts` with `src/core/workflow-diagnostics.ts`
 * (spec-009-validation-strategy §1). Every object node is `.passthrough()` per spec-009 §2, except
 * where spec-003's shape is strict.
 *
 * Nothing here runs a binding: in v0.3 the loader validates and `workflow show` / `workflow next`
 * display (spec-003 § "What v0.3 does with these fields"); the v1.0 engine executes (P4.10, P4.12).
 */
import { z } from 'zod';

import { RESERVED_SET_NAMES } from '../memory/add';
import type { MemoryYaml } from '../memory/schema';
import { BINDINGS_YAML_FORMAT, formatField } from '../validation/format';
import { ID_CHAR_CLASS, isNumericToken, patternTokens } from '../validation/id';

/** The bindings file, relative to `.wingfoil/` — the `file` of its diagnostics (spec-003 Layer 3). */
export const BINDINGS_FILE = 'workflows/bindings.yaml' as const;

/** spec-009's ID characters, anchored: what a collection entry's key must match (spec-003 § "Collections"). */
const ID_RE = new RegExp(`^[${ID_CHAR_CLASS}]+$`);

/** An argument vector: the first element is the program; never passed to a shell (`dl-090` Q3 (a)). */
const Argv = z.array(z.string()).min(1);

/** `args`: one declared pattern per interpolated placeholder; each must compile as a regular expression. */
const Args = z.record(
  z.string(),
  z.string().superRefine((pattern, ctx) => {
    try {
      new RegExp(pattern);
    } catch (err) {
      ctx.addIssue({ code: 'custom', message: `invalid argument pattern "${pattern}": ${(err as Error).message}` });
    }
  }),
);

/**
 * A check token's binding: exactly one of `run` (a command, with a severity — `dl-090` Q4, default `reject`)
 * or `manual: true` (a human confirms it on purpose — `dl-172` (a)), on which `severity` and `args` do not
 * apply (spec-003 Layer 3). The default severity is filled after these checks, so a `severity` written on a
 * manual binding is still seen and refused.
 */
export const CheckBinding = z
  .object({
    run: Argv.optional(),
    manual: z.literal(true).optional(),
    severity: z.enum(['warn', 'reject']).optional(),
    args: Args.optional(),
  })
  .passthrough()
  .superRefine((binding, ctx) => {
    if ((binding.run === undefined) === (binding.manual === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'a check binding declares exactly one of run or manual' });
    }
    if (binding.manual === true) {
      if (binding.severity !== undefined) ctx.addIssue({ code: 'custom', path: ['severity'], message: 'severity does not apply to a manual check binding' });
      if (binding.args !== undefined) ctx.addIssue({ code: 'custom', path: ['args'], message: 'args does not apply to a manual check binding' });
    }
  })
  .transform((binding) => (binding.run !== undefined && binding.severity === undefined ? { ...binding, severity: 'reject' as const } : binding));
export type CheckBinding = z.infer<typeof CheckBinding>;

/** An action token's binding: exactly one of `run` (a command) or `manual: true` (`dl-090` Q2 (c)). */
export const ActionBinding = z
  .object({
    run: Argv.optional(),
    manual: z.literal(true).optional(),
    args: Args.optional(),
  })
  .passthrough()
  .superRefine((binding, ctx) => {
    if ((binding.run === undefined) === (binding.manual === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'an action binding declares exactly one of run or manual' });
    }
  });
export type ActionBinding = z.infer<typeof ActionBinding>;

/** One collection entry: a scalar, or a map keyed by its `id` (else its `name`) field. */
const CollectionEntry = z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())]);
/** One entry of a collection (spec-003 § "Collections"): a scalar, or a map keyed by its `id` / `name` field. */
export type CollectionEntry = z.infer<typeof CollectionEntry>;

/**
 * The key of one collection entry (spec-003 § "Collections"): the entry itself for a scalar, the
 * entry's `id` field, else its `name` field, for a map. `null` when a map entry has neither as a
 * scalar.
 */
export function collectionEntryKey(entry: CollectionEntry): string | null {
  if (typeof entry !== 'object' || entry === null) return String(entry);
  const key = entry['id'] ?? entry['name'];
  return typeof key === 'string' || typeof key === 'number' ? String(key) : null;
}

/**
 * A named collection: a list of entries, in declared order. Its key rules (a key per entry, unique,
 * in spec-009's ID characters) are a loader row, not part of this structural pass
 * ({@link collectionKeyIssues}; approver ruling D1 (a), 2026-10-05), so a bad key leaves the rest of
 * the file decided.
 */
const Collection = z.array(CollectionEntry);

/** One collection-key problem: the entry's index and the message (`E_BINDING_COLLECTION_KEY`). */
export interface CollectionKeyIssue {
  readonly index: number;
  readonly message: string;
}

/**
 * The key problems of one collection (spec-003 § "Collections"), in entry order: a map entry with no
 * `id` / `name`, a key outside spec-009's ID characters, a key already used by an earlier entry.
 */
export function collectionKeyIssues(entries: readonly CollectionEntry[]): CollectionKeyIssue[] {
  const issues: CollectionKeyIssue[] = [];
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const key = collectionEntryKey(entry);
    if (key === null) {
      issues.push({ index, message: 'a collection entry map needs an id or name field' });
      return;
    }
    if (!ID_RE.test(key)) issues.push({ index, message: `collection key '${key}' is outside the ID characters [${ID_CHAR_CLASS}]` });
    if (seen.has(key)) issues.push({ index, message: `duplicate collection key '${key}'` });
    seen.add(key);
  });
  return issues;
}

/**
 * Layer 3 — `.wingfoil/workflows/bindings.yaml`. Optional: an absent file is no bindings. A `dl-149` file
 * kind (`dl-153` (A)): `format` is optional (absent = 1), and a newer one is refused by the loader before
 * this structural pass.
 */
export const BindingsYaml = z
  .object({
    version: z.number().positive().optional(),
    format: formatField(BINDINGS_YAML_FORMAT),
    checks: z.record(z.string(), CheckBinding).optional(),
    actions: z.record(z.string(), ActionBinding).optional(),
    collections: z.record(z.string(), Collection).optional(),
  })
  .passthrough();
export type BindingsYaml = z.infer<typeof BindingsYaml>;

/**
 * The name of an action or check token: the text before its first `(` or `:`, trimmed
 * (`memory.add(type: adr)` → `memory.add`; `tests.coverage(min: 80)` → `tests.coverage`;
 * `frontmatter.required: [title]` → `frontmatter.required`). A prose check keeps its prose as its name: a
 * binding key equal to that prose binds it (a check a human confirms on purpose is bound `manual: true` this
 * way, `dl-172` (a)), and a prose no key names stays unbound.
 */
export function tokenName(token: string): string {
  const cut = token.search(/[(:]/);
  return (cut === -1 ? token : token.slice(0, cut)).trim();
}

/** The `type:` argument of a `memory.add(...)` token, or `null` (`memory.add(type: tech-spec)` → `tech-spec`). */
export function memoryAddType(token: string): string | null {
  if (tokenName(token) !== 'memory.add') return null;
  const match = /\btype\s*:\s*["']?([^"',)\s]+)/.exec(token);
  return match ? match[1]! : null;
}

/** `text` split at its top-level commas: a comma inside quotes, brackets or braces does not split. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const char of text) {
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** `value` without the pair of quotes around it, when it has one. */
export function unquoted(value: string): string {
  return /^(["'])(.*)\1$/s.exec(value)?.[2] ?? value;
}

/**
 * The `key: value` arguments of a token's parenthesised list, in order, quotes and brackets kept
 * (`memory.add(type: bug, tags: [a, b])` → `[['type', 'bug'], ['tags', '[a, b]']]`). A token with no list has none;
 * a part with no `:` is no argument.
 */
export function tokenArguments(token: string): [string, string][] {
  const open = token.indexOf('(');
  const close = token.lastIndexOf(')');
  if (open === -1 || close < open) return [];
  return splitTopLevel(token.slice(open + 1, close)).flatMap((part): [string, string][] => {
    const colon = part.indexOf(':');
    return colon === -1 ? [] : [[part.slice(0, colon).trim(), part.slice(colon + 1).trim()]];
  });
}

/** One argument a `memory.add` action declares, its `type` aside (`spec-017` §6.1). */
export interface MemoryAddArgument {
  readonly name: string;
  /** The value to print, a list joined by commas; `null` when it can only be a placeholder. */
  readonly value: string | null;
}

/**
 * The arguments a `memory.add` token declares, each value read through `interpolate`, which answers `null` for a
 * value that cannot be printed (`dl-090` Q3 (a)). One element of a list that cannot makes the whole list a placeholder.
 */
export function memoryAddArguments(token: string, interpolate: (raw: string) => string | null): MemoryAddArgument[] {
  return tokenArguments(token)
    .filter(([name]) => name !== 'type')
    .map(([name, raw]) => {
      if (!raw.startsWith('[')) return { name, value: interpolate(unquoted(raw)) };
      const values = splitTopLevel(raw.slice(1, raw.lastIndexOf(']'))).map((entry) => interpolate(unquoted(entry.trim())));
      return { name, value: values.includes(null) ? null : values.join(',') };
    });
}

/** The tokens of `type`'s `id_pattern` and `path`, in that order, each once; none for a type `memory.yaml` does not hold. */
export function memoryAddPatternTokens(memoryYaml: MemoryYaml | null, type: string | null): string[] {
  if (memoryYaml === null || type === null || !Object.prototype.hasOwnProperty.call(memoryYaml.types, type)) return [];
  const entry = memoryYaml.types[type]!;
  return [...new Set([...patternTokens(entry.id_pattern ?? ''), ...patternTokens(entry.path)])];
}

/**
 * The operands of `memory add` after `--type` (`spec-017` §6.1): `--title`, `--tags`, one `--set` per declared argument
 * naming a token of `tokens` ({@link memoryAddPatternTokens}) that can be passed, in declared order, then one placeholder
 * `--set` per such token the action does not give. A name `--set` reserves and a numeric token, which the verb generates,
 * cannot be passed: an argument naming one is left out.
 */
export function memoryAddOperands(args: readonly MemoryAddArgument[], tokens: readonly string[]): string[] {
  return memoryAddOperandParts(args, tokens).map((part) => part.text);
}

/** One operand of `memory add`, and whether it holds a value the action gave rather than a placeholder (`spec-017` §6.1). */
export interface MemoryAddOperandPart {
  readonly text: string;
  readonly given: boolean;
}

/** {@link memoryAddOperands}, each operand saying where it comes from: a value and a placeholder may be spelled alike. */
export function memoryAddOperandParts(args: readonly MemoryAddArgument[], tokens: readonly string[]): MemoryAddOperandPart[] {
  const flag = (text: string): MemoryAddOperandPart => ({ text, given: false });
  const isGiven = ({ value }: MemoryAddArgument): boolean => value !== null && value !== '';
  const shown = (arg: MemoryAddArgument): string => (isGiven(arg) ? arg.value! : `<${arg.name}>`);
  const settable = tokens.filter((token) => !RESERVED_SET_NAMES.has(token) && !isNumericToken(token));
  const tags = args.find((arg) => arg.name === 'tags');
  const declared = args.filter((arg) => settable.includes(arg.name));
  const title = args.find((arg) => arg.name === 'title') ?? { name: 'title', value: null };
  return [
    flag('--title'),
    { text: shown(title), given: isGiven(title) },
    ...(tags === undefined ? [] : [flag('--tags'), { text: shown(tags), given: isGiven(tags) }]),
    ...declared.flatMap((arg) => [flag('--set'), { text: `${arg.name}=${shown(arg)}`, given: isGiven(arg) }]),
    ...settable.filter((token) => !declared.some((arg) => arg.name === token)).flatMap((token) => [flag('--set'), flag(`${token}=<${token}>`)]),
  ];
}

/** What fills a built-in command: the step's values for `workflow next`, placeholders for `workflow show`. */
export interface BuiltinOperands {
  /** The element a Memory verb acts on. */
  readonly id: string;
  /** The instance and the step a `memory add` or an `agent execute` names. */
  readonly instance: string;
  readonly step: string;
  /** `memory add`'s operands ({@link memoryAddOperands}). */
  readonly add: readonly string[];
}

/** The operands `workflow show` prints, no instance being involved (`spec-017` §7.6). */
export const SHOWN_OPERANDS: Omit<BuiltinOperands, 'add'> = { id: '<id>', instance: '<instance-id>', step: '<key>' };

/**
 * The whole command of a built-in binding (`spec-017` §6.1, §7.6), from the prefix {@link resolveToken} names: the one
 * form `workflow next` and `workflow show` print, so that the two cannot diverge. Pure.
 */
export function builtinCommand(token: string, prefix: readonly string[], operands: BuiltinOperands): string[] {
  const name = tokenName(token);
  const link = ['--workflow', operands.instance, '--step', operands.step];
  if (name === 'memory.add') return [...prefix, ...operands.add, ...link];
  if (name === 'memory.approve' || name === 'memory.reject') return [...prefix, operands.id, '--reason', '<reason>'];
  if (name.startsWith('memory.')) return [...prefix, operands.id];
  return name.startsWith('agent.') ? [...prefix, ...link] : [...prefix];
}

/** The Memory verbs a workflow action may emit (spec-003 § "Action expressions", `dl-079` (A)). */
export type ActionMemoryVerb = 'add' | 'submit' | 'approve' | 'reject' | 'deprecate' | 'start' | 'finalize' | 'sync' | 'assign';

/** How a token resolves: the binding kind spec-003's built-in table and Layer 3 name. */
export type BindingKind = 'wingfoil' | 'manual' | 'agent' | 'run' | 'unbound';

/** A token's resolved binding — what `workflow show` / `workflow next` report (task-216). */
export interface TokenBinding {
  readonly kind: BindingKind;
  /** `built-in` for spec-003's table, `project` for `bindings.yaml`, `none` when unbound. */
  readonly source: 'built-in' | 'project' | 'none';
  /**
   * The command, as an argument vector, when the binding names one: the built-in command prefix
   * (`wingfoil memory add --type <T>`, `wingfoil init`, `wingfoil agent execute`), or the project's
   * `run`. The step's own operands (element id, `--workflow`, `--step`) are the caller's.
   */
  readonly argv?: readonly string[];
  /**
   * The Memory commit the step is expected to produce: the element type when the token names it
   * (`null` for the workflow's own element), and the candidate verbs. A `set_state` lists three;
   * which one applies follows spec-003's rule under the verb table (approval, last state, else start).
   */
  readonly expectedCommit?: { readonly type: string | null; readonly verbs: readonly ActionMemoryVerb[] };
  /** A `run` check binding's severity (`dl-090` Q4); a manual check (`dl-172` (a)) has none. */
  readonly severity?: 'warn' | 'reject';
}

const MEMORY_VERB_TOKENS: Readonly<Record<string, ActionMemoryVerb>> = {
  'memory.add': 'add',
  'memory.submit': 'submit',
  'memory.approve': 'approve',
  'memory.reject': 'reject',
  'memory.deprecate': 'deprecate',
};

/** `<type>.set_state` / `<type>.sync_state` — `element` included, as the workflow's own element. */
const TYPED_STATE_RE = /^([a-z][a-z0-9-]*)\.(set_state|sync_state)$/;

/**
 * The Memory type a typed state action names — the `T` of `<T>.set_state(…)` / `<T>.sync_state(…)` —
 * or `null` for `element.set_state` / `element.sync_state` (the workflow's own element, not a type) and
 * for any other token. The core check `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN` (spec-003, `bug-282`) checks it
 * against `memory.yaml`.
 */
export function typedStateType(token: string): string | null {
  const typed = TYPED_STATE_RE.exec(tokenName(token));
  return typed && typed[1] !== 'element' ? typed[1]! : null;
}

/**
 * Whether `name` (a {@link tokenName}) is a **built-in** token (spec-003's built-in table):
 * `memory.add|submit|approve|reject|deprecate`, `element.set_state`, `<type>.set_state`,
 * `<type>.sync_state`, `element.set_release`, `config.init` and every `agent.*`. A project may not
 * rebind one (`E_BINDING_BUILTIN_TOKEN`).
 */
export function isBuiltinToken(name: string): boolean {
  return (
    name in MEMORY_VERB_TOKENS ||
    TYPED_STATE_RE.test(name) ||
    name === 'element.set_release' ||
    name === 'config.init' ||
    name.startsWith('agent.')
  );
}

/** The built-in binding of an action token, or `null` when `name` is not built in. */
function builtinBinding(token: string, name: string): TokenBinding | null {
  const verb = MEMORY_VERB_TOKENS[name];
  if (verb !== undefined) {
    const type = memoryAddType(token);
    const argv = ['wingfoil', 'memory', verb, ...(verb === 'add' && type !== null ? ['--type', type] : [])];
    return { kind: 'wingfoil', source: 'built-in', argv, expectedCommit: { type: verb === 'add' ? type : null, verbs: [verb] } };
  }
  const typed = TYPED_STATE_RE.exec(name);
  if (typed) {
    const type = typed[1] === 'element' ? null : typed[1]!;
    const verbs: readonly ActionMemoryVerb[] = typed[2] === 'set_state' ? ['approve', 'finalize', 'start'] : ['sync'];
    return { kind: 'manual', source: 'built-in', expectedCommit: { type, verbs } };
  }
  if (name === 'element.set_release') return { kind: 'manual', source: 'built-in', expectedCommit: { type: null, verbs: ['assign'] } };
  if (name === 'config.init') return { kind: 'wingfoil', source: 'built-in', argv: ['wingfoil', 'init'] };
  if (name.startsWith('agent.')) return { kind: 'agent', source: 'built-in', argv: ['wingfoil', 'agent', 'execute'] };
  return null;
}

/**
 * Resolve one token to its binding (spec-003 § "Action expressions" built-in table, Layer 3): an
 * action resolves through the built-in table first, then `bindings.actions`; a check only through
 * `bindings.checks` (no check is built in, and none may be bound to an agent). An unresolved token is
 * `{ kind: 'unbound', source: 'none' }`. Pure and total: the same inputs give the same answer.
 *
 * @param token - The token as written in `actions:` / `checks:` / `awaits.evidence`, arguments included.
 * @param role - Whether the token is an action or a check.
 * @param bindings - The validated `bindings.yaml`, or `null` when the project has none.
 */
export function resolveToken(token: string, role: 'action' | 'check', bindings: BindingsYaml | null): TokenBinding {
  const name = tokenName(token);
  if (role === 'action') {
    const builtin = builtinBinding(token, name);
    if (builtin) return builtin;
    const bound = bindings?.actions?.[name];
    if (bound) return bound.manual === true ? { kind: 'manual', source: 'project' } : { kind: 'run', source: 'project', argv: bound.run! };
  } else {
    const bound = bindings?.checks?.[name];
    if (bound) {
      // A manual check (`dl-172` (a)) is a binding, as a manual action is: no command and no severity.
      if (bound.manual === true) return { kind: 'manual', source: 'project' };
      return { kind: 'run', source: 'project', argv: bound.run!, severity: bound.severity ?? 'reject' }; // exactly one of run / manual
    }
  }
  return { kind: 'unbound', source: 'none' };
}

/** A `{…}` placeholder anywhere in a string. */
const PLACEHOLDER_RE = /\{[^{}]*\}/;
/** A string that is one whole placeholder and nothing else. */
const WHOLE_PLACEHOLDER_RE = /^\{[^{}]+\}$/;

/** Whether one `run` element interpolates only as a whole element (`dl-090` Q3 (a)). */
export function isWholeInterpolation(element: string): boolean {
  return !PLACEHOLDER_RE.test(element) || WHOLE_PLACEHOLDER_RE.test(element);
}

/** The basename of a program path (`/usr/bin/wingfoil` → `wingfoil`; `dist/cli.js` → `cli.js`). */
function basename(program: string): string {
  return program.slice(program.lastIndexOf('/') + 1);
}

/**
 * Whether an argument vector runs `wingfoil agent execute` (`E_BINDING_AGENT_CHECK`, `dl-090` Q6): an
 * `agent`, `execute` pair after a `wingfoil` program — called directly, through `npx`, or as the
 * built `cli.js`.
 */
export function runsAgentExecute(run: readonly string[]): boolean {
  const wingfoilAt = run.findIndex((element) => basename(element) === 'wingfoil' || basename(element) === 'cli.js');
  if (wingfoilAt === -1) return false;
  for (let i = wingfoilAt + 1; i < run.length - 1; i += 1) {
    if (run[i] === 'agent' && run[i + 1] === 'execute') return true;
  }
  return false;
}
