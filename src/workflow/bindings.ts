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

import { ID_CHAR_CLASS } from '../validation/id';

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

/** A check token's binding: a command and a severity (`dl-090` Q4; default `reject`). */
export const CheckBinding = z
  .object({
    run: Argv,
    severity: z.enum(['warn', 'reject']).default('reject'),
    args: Args.optional(),
  })
  .passthrough();
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
type CollectionEntry = z.infer<typeof CollectionEntry>;

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

/** Layer 3 — `.wingfoil/workflows/bindings.yaml`. Optional: an absent file is no bindings. */
export const BindingsYaml = z
  .object({
    version: z.number().positive().optional(),
    checks: z.record(z.string(), CheckBinding).optional(),
    actions: z.record(z.string(), ActionBinding).optional(),
    collections: z.record(z.string(), Collection).optional(),
  })
  .passthrough();
export type BindingsYaml = z.infer<typeof BindingsYaml>;

/**
 * The name of an action or check token: the text before its first `(` or `:`, trimmed
 * (`memory.add(type: adr)` → `memory.add`; `tests.coverage(min: 80)` → `tests.coverage`;
 * `frontmatter.required: [title]` → `frontmatter.required`). A prose check keeps its prose, which no
 * binding key names, so it stays unbound.
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
  /** A check binding's severity (`dl-090` Q4). */
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
    if (bound) return { kind: 'run', source: 'project', argv: bound.run, severity: bound.severity };
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
