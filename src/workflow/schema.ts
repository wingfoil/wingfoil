/**
 * `workflows.yaml` manifest (Layer 1) + Workflow DSL (Layer 2) schemas
 * (spec-003-workflows-yaml-schema, P4.1). This is one of the three independent per-pillar schemas
 * task-004-decoupled-pillars keeps decoupled (REQ-SYS-02): neither layer depends on `memory.yaml`'s
 * or `dna.yaml`'s schema. This module holds the **structural** (Zod) shape only, plus the name class
 * and the startable/includable reading the loader's checks share ({@link WORKFLOW_NAME_RE},
 * {@link workflowFacts}). Every check spec-003 § "Diagnostics" runs *in the loader* — names, the
 * startable/includable rules, phase `include` resolution, element compatibility, include cycles,
 * `fallback.step` — needs the other loaded files or emits a named code, so per
 * spec-009-validation-strategy §1 it lives in `src/core/loaders.ts`, not here. The one structural
 * refusal with a named code is an unknown `kind` (`E_WORKFLOW_INVALID_KIND`, BDD P4.1 sc. 3), whose
 * message this schema carries.
 *
 * Every object node is `.passthrough()` per spec-009 §2.
 */
import { z } from 'zod';

import { idPatternIssues } from '../validation/id';

/**
 * Layer 1 — the main manifest (`.wingfoil/workflows.yaml`). `include` (singular) is the canonical
 * key per spec-003's required rename from the legacy plural `includes:`; a document that still uses
 * `includes:` fails Pass 1 here (missing required `include`) and `includes` itself is preserved only
 * as an unknown, passed-through key.
 */
export const WorkflowsYaml = z
  .object({
    version: z.number().positive().optional(),
    include: z.array(z.string()).min(1),
  })
  .passthrough();
export type WorkflowsYaml = z.infer<typeof WorkflowsYaml>;

/** Free-form assertion string, e.g. `tests.coverage(min: 80)`, `frontmatter.required: [title]`. */
const Check = z.string();

const WhereValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

/** A `memory.add(...)` action string (`dl-107` S3 (a)). */
const MEMORY_ADD_ACTION_RE = /^\s*memory\.add\s*\(/;

/** The `id_pattern:` argument of an action, double- or single-quoted. */
const ID_PATTERN_ARG_RE = /\bid_pattern\s*:\s*(?:"([^"]*)"|'([^']*)')/;

/**
 * A phase's `actions` list. Actions stay free-form strings (spec-003), with one checked argument: a
 * `memory.add(...)` action may override its type's `id_pattern` for that one add
 * (`spec-001-memory-yaml-schema` "Per-action override", `dl-107` S3 (a), task-110), and that override
 * is validated like any other pattern — `idPatternIssues` (`src/validation/id.ts`). A dotted token
 * such as `{release.version}` is refused until `dl-090` defines how it resolves. Every other argument,
 * and every other action, is left as it was.
 */
const Actions = z.array(z.string()).superRefine((actions, ctx) => {
  actions.forEach((action, index) => {
    if (!MEMORY_ADD_ACTION_RE.test(action)) return;
    const match = ID_PATTERN_ARG_RE.exec(action);
    if (match === null) return;
    const pattern = match[1] ?? match[2] ?? '';
    for (const issue of idPatternIssues(pattern)) {
      ctx.addIssue({ code: 'custom', path: [index], message: `memory.add id_pattern "${pattern}": ${issue}` });
    }
  });
});

// --- task-175: phase evidence (dl-104 D3, D4; spec-003 § "Evidence") ---

/**
 * One `produces` entry (`dl-104` D3): a path pattern owned by the workflow's `element` (a string), or
 * `{ type: T, path }`, owned by the elements of type `T` the phase creates. Whether each path is a
 * path pattern, and whether the phase creates `T`, are loader checks (`E_PHASE_PRODUCES_NOT_A_PATH`,
 * `E_PHASE_PRODUCES_OWNER_NOT_CREATED`), so the rest of the file is still checked.
 */
export const Produces = z.union([z.string(), z.object({ type: z.string(), path: z.string() }).strict()]);
/** Parsed shape of one {@link Produces} entry. */
export type Produces = z.infer<typeof Produces>;

/**
 * `awaits` (`dl-104` D4): the phase waits on an actor outside the project — `party` names it,
 * `evidence` is a check token (Layer 3) that observes the outcome. Evaluated from v1.0 (P4.12).
 */
const Awaits = z.object({ party: z.string().min(1), evidence: Check }).strict();

/**
 * A path pattern (spec-003 § "Evidence"): the characters `[A-Za-z0-9._/{}-]`, no whitespace — a
 * repository-relative file or directory path, either with `{…}` tokens. Anything else is prose.
 */
export const PATH_PATTERN_RE = /^[A-Za-z0-9._/{}-]+$/;

/** The path of one `produces` entry, whichever form it takes. */
export function producesPath(entry: Produces): string {
  return typeof entry === 'string' ? entry : entry.path;
}

// --- end task-175 ---

/**
 * One `phases[]` entry of a Layer-2 workflow definition (spec-003) — a named step with its optional
 * `role`, `actions`, `include`, `iterate_over`/`where`, `produces`, `checks`, `approval`, `fallback`
 * and `awaits`. `.passthrough()` per spec-009 §2.
 */
export const Phase = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    role: z.string().optional(),
    optional: z.boolean().default(false),
    actions: Actions.optional(),
    include: z.string().optional(),
    iterate_over: z.string().optional(),
    where: z.record(z.string(), WhereValue).optional(),
    produces: z.array(Produces).optional(), // task-175: string | { type, path } (dl-104 D3)
    awaits: Awaits.optional(), // task-175: dl-104 D4
    checks: z
      .object({ pre: z.array(Check).optional(), post: z.array(Check).optional() })
      .passthrough()
      .optional(),
    approval: z.object({ by_role: z.string() }).passthrough().optional(),
    fallback: z.object({ step: z.string(), set_state: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
/** Parsed shape of the {@link Phase} schema. */
export type Phase = z.infer<typeof Phase>;

/**
 * The name class of workflows and phases (spec-003 § "Names"): `[a-z][a-z0-9-]*`, so
 * `<workflow>.<phase>` splits at its first `.` and a phase name is a legal run-id segment
 * (`spec-016`). Checked by the loader (`E_WORKFLOW_NAME_INVALID`, `E_PHASE_NAME_INVALID`), not by
 * Zod, so a bad name gets its own code and the rest of the file is still checked.
 */
export const WORKFLOW_NAME_RE = /^[a-z][a-z0-9-]*$/;

/** Phase names no workflow may declare: `adhoc` names a run without a step (`spec-016`). */
export const RESERVED_PHASE_NAMES: readonly string[] = ['adhoc'];

/** The message of BDD `P4.1-workflow-config.feature` sc. 3, verbatim (`E_WORKFLOW_INVALID_KIND`). */
export function invalidKindMessage(kind: unknown): string {
  return `invalid workflow kind '${String(kind)}' (allowed: main, sub)`;
}

/** Layer 2 — one workflow-definition file (`.wingfoil/workflows/**\/*.yaml`). */
export const Workflow = z
  .object({
    name: z.string(),
    /** Alias kept readable during v0.3 (`dl-109` K1 (a)): see {@link workflowFacts}. */
    kind: z.enum(['main', 'sub'], { error: (issue) => invalidKindMessage(issue.input) }).optional(),
    startable: z.boolean().optional(),
    includable: z.boolean().optional(),
    description: z.string().optional(),
    version: z.number().positive().optional(),
    element: z.string().optional(),
    phases: z.array(Phase).min(1),
  })
  .passthrough();
export type Workflow = z.infer<typeof Workflow>;

/** Whether a workflow may be started on its own and whether a phase may `include:` it (`dl-109`). */
export interface WorkflowFacts {
  readonly startable: boolean;
  readonly includable: boolean;
}

/**
 * Read a workflow's two facts (spec-003 Layer 2, `dl-109` K1 (a)): `kind: main` is startable only,
 * `kind: sub` includable only; otherwise each boolean as declared, an absent one reading `false`.
 * A workflow that declares `kind` together with a boolean is refused by the loader
 * (`E_WORKFLOW_KIND_CONFLICT`); here `kind` wins, so the reading stays total.
 */
export function workflowFacts(workflow: Pick<Workflow, 'kind' | 'startable' | 'includable'>): WorkflowFacts {
  if (workflow.kind === 'main') return { startable: true, includable: false };
  if (workflow.kind === 'sub') return { startable: false, includable: true };
  return { startable: workflow.startable === true, includable: workflow.includable === true };
}
