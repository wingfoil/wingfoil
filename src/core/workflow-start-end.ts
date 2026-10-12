/**
 * `wingfoil workflow start <name>` and `wingfoil workflow end [<ref>]` (task-217; `spec-017` §3.1–§3.5, §7.1,
 * §7.2, §8 `StartResult` / `EndResult`, §10, §11; BDD P4.2, P4.3; REQ-STATE-03).
 *
 * **The record is a `plan` element** (§3.1, OQ-1). A started workflow is an instance recorded as a Memory
 * element of type `plan` whose `workflow` names the workflow, whose `element` holds the bound element's id
 * (or the context element's, §3.5) and whose `parent` is empty. No other store exists (REQ-SYS-03): the
 * instance is open while its plan is `draft` or `active`, and the most recently started open instance is
 * the active one (§3.3), which the deduction already reads (`src/workflow/deduce.ts`).
 *
 * **Baseline: `HEAD`, gating** (§1.1, §11). Both commands decide from one snapshot of the repository as
 * committed at `HEAD` (`readDeductionSnapshotAtHead`): the registry, `memory.yaml`, the element, the open
 * instances and the deduction. `start`'s id collision check reads the wider baseline `dl-101` names — every
 * local branch, remote-tracking ref, `HEAD` and the working tree — which can only refuse more.
 *
 * **`start`** writes two commits through the Memory verbs, each scoped to the plan file: `wf(plan): add <id>`
 * (`memory add`, with the derived tokens and the `element` field) then `wf(plan): submit <id>` (`memory
 * submit`, `draft → active`). A refused second commit leaves the plan `draft`, the instance open, and the
 * error names `wingfoil memory submit <id>`. Under `--dry-run` the plan of the first commit is printed (the
 * dry run stops at a command's first commit, `spec-008` §2).
 *
 * **`end`** refuses a plan still in `draft` and an instance whose deduction is not complete, then moves the
 * plan `active → done` along the `waiting` edge `memory.yaml` declares, writing `wf(plan): finalize <id>
 * [active → done]` (`dl-079` (A)'s `finalize`).
 */
import {
  expandFieldTokens,
  formatMemoryCommitMessage,
  hasNumericToken,
  idOccupancy,
  parseSetOptions,
  setFrontmatterField,
  slugifyTitle,
} from '../memory';
import { commitFailureSummary, StorageError } from '../storage';
import { generateId, patternTokens } from '../validation';
import { deduceWorkflowState, PLAN_TYPE, resolveInstanceRef, type Baseline, type Deduction, type ElementRef, type Instance, type InstanceDeduction } from '../workflow/deduce';
import { workflowFacts } from '../workflow/schema';

import { parseElementRef } from './element-ref';
import { requireGitIdentity } from './git-identity';
import { requireInitializedProject } from './init';
import { beginMemoryTransition, commitMemoryTransition } from './memory-transition';
import { missingOperandReason, type CoreFn } from './registry';
import { coreErr, coreOk, type CoreResult } from './types';
import { UsageError } from './usage-error';
import { instancePlanIds, readDeductionSnapshotAtHead } from './workflow-deduction';
import { unknownWorkflowMessage } from './workflow-list-show';
import { renderNextConsole, unresolvedRef, workflowNextAtHead, type Step } from './workflow-next';

/** The `--set` names `workflow start` accepts (`spec-017` §7.1): the two derived plan tokens it lets a user override. */
const START_SET_NAMES: readonly string[] = ['phase', 'scope'];

/** The highest `-<n>` suffix `start` tries on a derived `phase` before it gives up (a safeguard; review F1). */
const MAX_PHASE_SUFFIX = 1000;

/** `phase` with no bound and no context element (approver ruling R18). */
const DEFAULT_PHASE = '1';

/** `spec-017` §10's refusal of a project whose `memory.yaml` declares no `plan` type. */
export const NO_PLAN_TYPE_MESSAGE = "memory type 'plan' is not declared in memory.yaml; workflow start records an instance as a plan element";

/** `spec-017` §10: `end` with no open instance (BDD P4.3 sc. 3). */
export const NO_ACTIVE_WORKFLOW_MESSAGE = 'no active workflow to end';

/** `wingfoil workflow start <name> [--element <type>:<id>] [--title <t>] [--set phase=<v>] [--set scope=<v>]` params. */
export interface WorkflowStartParams {
  readonly root: string;
  /** The workflow name (`spec-008` §1: the target is the positional, `dl-082`). */
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string | readonly string[]>>;
}

/** `wingfoil workflow end [<ref>]` params: the `<ref>` rides the bare positional. */
export interface WorkflowEndParams {
  readonly root: string;
  readonly positional?: string;
}

/** `workflow start`'s value (`spec-017` §8): the new instance, its first frontier step, and the two commits. */
export interface StartResult {
  readonly baseline: Baseline;
  readonly instance: Instance;
  readonly next: Step | null;
  /** The add and submit commits, in that order. */
  readonly commits: readonly string[];
}

/** `workflow end`'s value (`spec-017` §8): the ended instance, the instance now active (or `null`), the commit. */
export interface EndResult {
  readonly baseline: Baseline;
  readonly ended: Instance;
  readonly active: Instance | null;
  readonly commit: string;
}

/**
 * The two Memory verbs `start` writes through, handed in by `CORE_MODULES` (`memoryAdd`, `memorySubmit`), so
 * the plan is added and submitted by the very operations `wingfoil memory add` / `submit` run — their
 * checks, their commit subjects and their commit-scope post-conditions — and by no copy of them.
 */
export interface StartVerbs {
  /** `memoryAdd`: `options` as the CLI passes them, `fields` the frontmatter written as given (`element`). */
  readonly add: CoreFn<unknown, { id: string; path: string }>;
  readonly submit: CoreFn<unknown, unknown>;
}

/** A single-valued option: a repeated occurrence keeps the last. */
function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' || value === undefined ? value : value[value.length - 1];
}

/** The usage half of `start` (`spec-008` §1, §5, §7, §10): every spelling fault, exit 2, before any read. */
function startUsage(params: WorkflowStartParams): { name: string; element: { type: string; id: string } | null; title?: string; set: Readonly<Record<string, string>> } {
  const { positional: name, options } = params;
  if (name === undefined || name.trim() === '') throw new UsageError(missingOperandReason('name'));
  const elementOption = single(options?.['element']);
  let element: { type: string; id: string } | null = null;
  if (elementOption !== undefined) {
    const parsed = parseElementRef(elementOption);
    if (!parsed.ok) throw new UsageError(parsed.error.message);
    element = parsed.value;
  }
  const set = parseSetOptions(options?.['set']);
  if (!set.ok) throw new UsageError(set.message);
  for (const key of Object.keys(set.values)) {
    if (!START_SET_NAMES.includes(key)) throw new UsageError(`invalid flag value: --set ${key}: workflow start sets only phase and scope`);
  }
  const title = single(options?.['title']);
  return { name, element, ...(title === undefined ? {} : { title }), set: set.values };
}

/** What `start` decides before it writes: the plan's id, its title and the tokens handed to `memory add`. */
interface StartPlan {
  readonly id: string;
  readonly title: string;
  readonly tokens: Readonly<Record<string, string>>;
}

/**
 * The bound element (§3.4) and the context element (§3.5) of a new instance of `workflow`, or the refusal.
 * A declared element comes from `--element` or, absent it, from the active instance when its bound element
 * is of the declared type; it must exist at `HEAD`. A workflow that declares none takes no `--element`, and
 * records the active instance's bound element, if any, as its context.
 */
function resolveStartElement(
  name: string,
  declared: string | undefined,
  given: { type: string; id: string } | null,
  deduction: Deduction,
  exists: (type: string, id: string) => boolean,
): CoreResult<{ bound: ElementRef | { type: string; id: string } | null; context: ElementRef | null }> {
  const active = deduction.instances[0]?.instance ?? null;
  if (declared === undefined) {
    if (given !== null) return coreErr({ code: 'VALIDATION', message: `workflow '${name}' declares no element: --element is not accepted` });
    return coreOk({ bound: null, context: active?.element ?? null });
  }
  const needs = coreErr({ code: 'VALIDATION', message: `workflow '${name}' needs a ${declared} element: give --element ${declared}:<id>` });
  if (given === null) {
    const inherited = active?.element ?? null;
    return inherited !== null && inherited.type === declared ? coreOk({ bound: inherited, context: null }) : needs;
  }
  if (given.type !== declared) return needs;
  if (!exists(given.type, given.id)) return coreErr({ code: 'NOT_FOUND', message: `element not found: ${given.type}:${given.id}`, details: { element: `${given.type}:${given.id}` } });
  return coreOk({ bound: given, context: null });
}

/**
 * The plan's tokens and id (§7.1, ruling R18): `workflow` = the name; `phase` = the bound element's id, else
 * the context element's, else `1`, with the lowest free `-<n>` (`n ≥ 2`) appended when the id is occupied on
 * any baseline `dl-101` names; `scope` = the name. `--set phase=` / `--set scope=` override them, and a
 * colliding `--set phase=` is `CONFLICT`. Only tokens the committed `id_pattern` or `path` holds are passed
 * on; a `--set` naming none is `memory add`'s refusal. An `id_pattern` with a `{n}` counter is unique by
 * construction and is not checked, nor is a `path` with no `{id}` (one file per other tokens: `memory add`
 * refuses an occupied one). The suffix is tried only when `{phase}` is a token of the `id_pattern` itself —
 * in the `path` alone it cannot change the id — and at most {@link MAX_PHASE_SUFFIX} times.
 */
function planTokens(
  root: string,
  name: string,
  idPattern: string,
  pathPattern: string,
  set: Readonly<Record<string, string>>,
  base: string,
  title: string | undefined,
): CoreResult<StartPlan> {
  const declared = new Set([...patternTokens(idPattern), ...patternTokens(pathPattern)]);
  const derived: Record<string, string> = { workflow: name, phase: base, scope: name };
  const tokens: Record<string, string> = {};
  for (const key of Object.keys(derived).sort()) if (declared.has(key)) tokens[key] = derived[key]!;
  Object.assign(tokens, set);
  const titleOf = (phase: string | undefined): string => title ?? (phase === undefined ? name : `${name} — ${phase}`);
  // The id `memory add` will generate: its `{slug}` comes from the title it is given (review F1 nit).
  const idOf = (values: Readonly<Record<string, string>>): string =>
    generateId(expandFieldTokens(idPattern, values), { slug: slugifyTitle(titleOf(values['phase'])), n: 0 });
  const planned = (values: Readonly<Record<string, string>>): StartPlan => ({ id: idOf(values), title: titleOf(values['phase']), tokens: values });

  // A `{n}` id is unique by construction; a `path` with no `{id}` names one file per other tokens, which
  // `memory add`'s absent-target check decides (`idOccupancy` would read every plan as that one).
  if (hasNumericToken(idPattern) || !patternTokens(pathPattern).includes('id')) return coreOk(planned(tokens));
  // Only a `{phase}` in the id itself can be made unique by the `-<n>` suffix (review F1): otherwise, and for
  // a `--set phase=`, the id is checked once.
  const occupied = idOccupancy(root, pathPattern);
  if (!patternTokens(idPattern).includes('phase') || set['phase'] !== undefined) {
    const plan = planned(tokens);
    if (occupied(plan.id)) return coreErr({ code: 'CONFLICT', message: `plan id already exists: ${plan.id}`, details: { id: plan.id } });
    return coreOk(plan);
  }
  for (let n = 1; n <= MAX_PHASE_SUFFIX; n += 1) {
    const plan = planned({ ...tokens, phase: n === 1 ? base : `${base}-${n}` });
    if (!occupied(plan.id)) return coreOk(plan);
  }
  const last = idOf({ ...tokens, phase: `${base}-${MAX_PHASE_SUFFIX}` });
  return coreErr({ code: 'CONFLICT', message: `plan id already exists: ${last}`, details: { id: last } });
}

/**
 * `workflow start <name>` (`spec-017` §7.1). Order: the usage checks (exit 2), the git identity (REQ-SEC-01),
 * an initialized project, then every refusal decided at `HEAD` — a `spec-003` error, an unknown or
 * non-startable workflow, no `plan` type, the element, the id — before the first write.
 *
 * @throws `DiagnosticsError` / `ValidationError` as the snapshot reader and the token expansion throw them;
 *   `CORE_MODULES` maps them (`VALIDATION`, exit 1).
 */
export async function workflowStart(params: WorkflowStartParams, verbs: StartVerbs): Promise<CoreResult<StartResult>> {
  const { root } = params;
  const usage = startUsage(params);

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const snapshot = readDeductionSnapshotAtHead(root);
  const workflow = snapshot.workflows.find((candidate) => candidate.name === usage.name);
  if (workflow === undefined) return coreErr({ code: 'NOT_FOUND', message: unknownWorkflowMessage(usage.name), details: { ref: usage.name } });
  if (!workflowFacts(workflow).startable) return coreErr({ code: 'VALIDATION', message: `cannot start a sub workflow directly: ${usage.name}` });
  const planType = snapshot.memoryYaml?.types[PLAN_TYPE];
  if (planType === undefined) return coreErr({ code: 'VALIDATION', message: NO_PLAN_TYPE_MESSAGE });

  const deduction = deduceWorkflowState(snapshot);
  const exists = (type: string, id: string): boolean =>
    snapshot.documents.some(({ frontmatter }) => frontmatter['type'] === type && frontmatter['id'] === id);
  const resolved = resolveStartElement(usage.name, workflow.element, usage.element, deduction, exists);
  if (!resolved.ok) return resolved;
  const recorded = resolved.value.bound ?? resolved.value.context;
  const base = recorded?.id ?? DEFAULT_PHASE;

  const plan = planTokens(root, usage.name, planType.id_pattern ?? '{workflow}-{phase}-plan', planType.path, usage.set, base, usage.title);
  if (!plan.ok) return plan;
  const { title, tokens } = plan.value;

  const added = await verbs.add({
    root,
    options: { type: PLAN_TYPE, title, set: Object.keys(tokens).sort().map((key) => `${key}=${tokens[key]}`) },
    ...(recorded === null ? {} : { fields: { element: recorded.id } }),
  });
  if (!added.ok) return added;
  // A successful `memoryAdd` / `memorySubmit` always carries its commit (`coreOk(…, { sha, message })`).
  const addCommit = added.commit!.sha;

  let submitted: CoreResult<unknown>;
  try {
    submitted = await verbs.submit({ root, positional: added.value.id });
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    return coreErr(submitFailure(added.value.id, 'IO', commitFailureSummary(error)));
  }
  if (!submitted.ok) return coreErr(submitFailure(added.value.id, submitted.error.code, submitted.error.message));

  const next = workflowNextAtHead(root, added.value.id);
  if (!next.ok) return next;
  return coreOk(
    { baseline: next.value.baseline, instance: next.value.instance!, next: next.value.next, commits: [addCommit, submitted.commit!.sha] },
    submitted.commit,
    [...(added.warnings ?? []), ...(submitted.warnings ?? [])],
  );
}

/** `spec-017` §10's refusal when the plan was added and its submit commit was not made. */
function submitFailure(id: string, code: Parameters<typeof coreErr>[0]['code'], cause: string): Parameters<typeof coreErr>[0] {
  return {
    code,
    message: `plan ${id} was added but not submitted: run wingfoil memory submit ${id}`,
    details: { id, issues: [{ detail: cause }] },
  };
}

/** Why an open instance whose deduction is not complete cannot end (§7.2): its current step, or why it has none. */
function incompleteReason(selected: InstanceDeduction): string {
  const { instance, frontier } = selected;
  if (frontier.length > 0) return `current step ${frontier[0]!.key}`;
  if (instance.abandoned && instance.element !== null) return `it is abandoned: its element ${instance.element.type}:${instance.element.id} is ${instance.element.status}`;
  return `workflow '${instance.workflow}' is not loaded`;
}

/**
 * `workflow end [<ref>]` (`spec-017` §7.2). Order: the git identity (REQ-SEC-01), an initialized project, the
 * instance `<ref>` selects at `HEAD` (or the active one), a plan still `draft` (`INVALID_TRANSITION`), an
 * incomplete deduction (`CONFLICT`, with the `memory deprecate` hint), then the `active → done` transition,
 * through the transition verbs' own preamble and commit (`beginMemoryTransition`, `commitMemoryTransition`).
 *
 * @throws as {@link readDeductionSnapshotAtHead}.
 */
export async function workflowEnd(params: WorkflowEndParams): Promise<CoreResult<EndResult>> {
  const { root, positional: ref } = params;
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const selected = resolveInstanceRef(deduction, ref);
  if (selected === null) {
    if (ref === undefined) return coreErr({ code: 'NOT_FOUND', message: NO_ACTIVE_WORKFLOW_MESSAGE });
    return unresolvedRef({ workflows: snapshot.workflows, plans: instancePlanIds(snapshot.documents) }, ref);
  }
  const { instance } = selected;
  if (instance.planStatus === 'draft') {
    return coreErr({ code: 'INVALID_TRANSITION', message: `workflow '${instance.workflow}' was not submitted: run wingfoil memory submit ${instance.id}` });
  }
  if (!selected.complete) {
    return coreErr({
      code: 'CONFLICT',
      message: `workflow '${instance.workflow}' is not complete: ${incompleteReason(selected)}`,
      hint: `wingfoil memory deprecate ${instance.id} abandons it`,
      details: { instance: instance.id },
    });
  }

  const prepared = beginMemoryTransition(root, instance.id, 'finalize');
  if (!prepared.ok) return prepared;
  const { type, from, to, content } = prepared.value;
  const message = formatMemoryCommitMessage({ type, op: 'finalize', ids: [instance.id], transition: { from, to } });
  const committed = commitMemoryTransition(root, prepared.value, setFrontmatterField(content, 'status', to), message);
  if (!committed.ok) return committed;

  const after = deduceWorkflowState(readDeductionSnapshotAtHead(root));
  return coreOk(
    { baseline: after.baseline, ended: instance, active: after.instances[0]?.instance ?? null, commit: committed.value },
    { sha: committed.value, message },
    prepared.value.warnings,
  );
}

/** Whether `value` is a dry run's plan rather than the command's own result (`spec-008` §2). */
function isDryRunPlan(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { dryRun?: unknown }).dryRun === true;
}

/** `workflow start`'s `--format console` rendering (`spec-017` §8): the instance, then its first step as `next` prints it. Pure. */
export function renderStartConsole(value: StartResult): string {
  if (isDryRunPlan(value)) return `${JSON.stringify(value, null, 2)}\n`;
  const { instance, next } = value;
  const head = `started ${instance.workflow} as ${instance.id} (active)\n`;
  const message = next === null ? `no next step: workflow '${instance.workflow}' is complete` : undefined;
  return head + renderNextConsole({ baseline: value.baseline, instance: null, complete: next === null, next, more: [], ...(message === undefined ? {} : { message }), diagnostics: [] });
}

/** `workflow end`'s `--format console` rendering (`spec-017` §8): the ended instance and the one now active. Pure. */
export function renderEndConsole(value: EndResult): string {
  if (isDryRunPlan(value)) return `${JSON.stringify(value, null, 2)}\n`;
  const active = value.active === null ? 'none' : `${value.active.workflow} (${value.active.id})`;
  return `ended ${value.ended.workflow} (${value.ended.id})\nactive: ${active}\n`;
}
