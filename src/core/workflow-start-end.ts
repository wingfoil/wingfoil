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
 * **`start`** writes one commit through the `memory add` verb, scoped to the plan file: `wf(plan): add <id>`, with
 * the derived tokens, the `workflow`, `phase` and `element` fields the patterns hold no token for, and the start
 * marker `WingFoil-Start: <name>` in its trailer paragraph (`dl-217` (a), task-345 — only a marked start, or one
 * no marked start precedes, opens an instance, §3.2). The plan is left `draft` for its author to write: the output
 * names `wingfoil memory submit <id>`, which moves it `draft → active` (task-346, `bug-390`); the instance is open
 * from the add, and `end` refuses it until then. Under `--dry-run` the plan of that commit is printed
 * (`spec-008` §2).
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
import { ambiguousReferenceError, resolveElementReference } from '../memory';
import type { ElementReferenceResolution } from '../memory';
import { generateId, patternTokens } from '../validation';
import { deduceWorkflowState, PLAN_TYPE, resolveInstanceRef, START_TRAILER, type Baseline, type Deduction, type ElementRef, type Instance, type InstanceDeduction } from '../workflow/deduce';
import { workflowFacts, type Workflow } from '../workflow/schema';

import { parseElementRef } from './element-ref';
import { requireGitIdentity } from './git-identity';
import { requireTeamMembership } from './team-membership';
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

/** The `--element` value that clears the context of an element-less main (`spec-017` §3.5, `bug-413` option (c)). */
const NO_ELEMENT = 'none';

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

/**
 * `workflow start`'s value (`spec-017` §8): the new instance, its first frontier step, its one commit, and the
 * command that submits its `draft` plan.
 */
export interface StartResult {
  readonly baseline: Baseline;
  readonly instance: Instance;
  readonly next: Step | null;
  /** The add commit, the one commit `start` writes (task-346). */
  readonly commits: readonly string[];
  /** `wingfoil memory submit <id>`: the command that submits the plan once its author has written it (§7.1, `bug-390`). */
  readonly submit: string;
}

/** `workflow end`'s value (`spec-017` §8): the ended instance, the instance now active (or `null`), the commit. */
export interface EndResult {
  readonly baseline: Baseline;
  readonly ended: Instance;
  readonly active: Instance | null;
  readonly commit: string;
}

/**
 * The Memory verb `start` writes through, handed in by `CORE_MODULES` (`memoryAdd`), so the plan is added by the
 * very operation `wingfoil memory add` runs — its checks, its commit subject and its commit-scope post-condition —
 * and by no copy of it. Its submit is the author's `wingfoil memory submit` (task-346, `bug-390`).
 */
export interface StartVerbs {
  /**
   * `memoryAdd`: `options` as the CLI passes them, `fields` the frontmatter written as given (`workflow`, `phase`
   * where the patterns hold no token for them, `element`), `trailers` the lines added to the add commit's trailer
   * paragraph (the start marker).
   */
  readonly add: CoreFn<unknown, { id: string; path: string }>;
}

/** A single-valued option: a repeated occurrence keeps the last. */
function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' || value === undefined ? value : value[value.length - 1];
}

/** `--element` as `start` reads it: `<type>:<id>`, `none` (§3.5), or absent (`null`). */
type GivenElement = { type: string; id: string } | typeof NO_ELEMENT | null;

/** The usage half of `start` (`spec-008` §1, §5, §7, §10): every spelling fault, exit 2, before any read. */
function startUsage(params: WorkflowStartParams): { name: string; element: GivenElement; title?: string; set: Readonly<Record<string, string>> } {
  const { positional: name, options } = params;
  if (name === undefined || name.trim() === '') throw new UsageError(missingOperandReason('name'));
  const elementOption = single(options?.['element']);
  let element: GivenElement = null;
  if (elementOption === NO_ELEMENT) {
    element = NO_ELEMENT;
  } else if (elementOption !== undefined) {
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

/**
 * What `start` decides before it writes: the plan's id, its title, the tokens handed to `memory add`, and the
 * `phase` the plan records (a token, or a field when the patterns hold no `{phase}`).
 */
interface StartPlan {
  readonly id: string;
  readonly title: string;
  readonly tokens: Readonly<Record<string, string>>;
  readonly phase: string;
}

/**
 * The bound element (§3.4) and the context element (§3.5) of a new instance of `workflow`, or the refusal.
 * A declared element comes from `--element` or, absent it, from the active instance when its bound element
 * is of the declared type; it must exist at `HEAD`; `--element none` is refused as an absent element is. A
 * workflow that declares none (`bug-413` option (c), task-345) takes its context from `--element <type>:<id>`
 * (it must exist at `HEAD`), records none for `--element none`, and otherwise takes the active instance's bound
 * element only when the active instance's workflow declares `element:` — an element-less active instance, or
 * none open, gives no context.
 */
function resolveStartElement(
  name: string,
  declared: string | undefined,
  given: GivenElement,
  deduction: Deduction,
  workflows: readonly Workflow[],
  resolve: (type: string, reference: string) => ElementReferenceResolution,
): CoreResult<{ bound: ElementRef | { type: string; id: string } | null; context: ElementRef | { type: string; id: string } | null }> {
  const active = deduction.instances[0]?.instance ?? null;
  // `--element <type>:<ref>` takes a short reference (task-332, `spec-008` §7): the plan records the element's full id.
  const lookup = (element: { type: string; id: string }): CoreResult<{ type: string; id: string }> => {
    const resolution = resolve(element.type, element.id);
    if (resolution.kind === 'ambiguous') return coreErr(ambiguousReferenceError(element.id, resolution.candidates));
    if (resolution.kind === 'missing') return coreErr({ code: 'NOT_FOUND', message: `element not found: ${element.type}:${element.id}`, details: { element: `${element.type}:${element.id}` } });
    return coreOk({ type: element.type, id: String(resolution.document.frontmatter['id']) });
  };
  if (declared === undefined) {
    if (given === NO_ELEMENT) return coreOk({ bound: null, context: null });
    if (given !== null) {
      const found = lookup(given);
      return found.ok ? coreOk({ bound: null, context: found.value }) : found;
    }
    const activeDeclares = active !== null && workflows.find((workflow) => workflow.name === active.workflow)?.element !== undefined;
    return coreOk({ bound: null, context: activeDeclares ? active.element : null });
  }
  const needs = coreErr({ code: 'VALIDATION', message: `workflow '${name}' needs a ${declared} element: give --element ${declared}:<id>` });
  if (given === null) {
    const inherited = active?.element ?? null;
    return inherited !== null && inherited.type === declared ? coreOk({ bound: inherited, context: null }) : needs;
  }
  if (given === NO_ELEMENT || given.type !== declared) return needs;
  const found = lookup(given);
  return found.ok ? coreOk({ bound: found.value, context: null }) : found;
}

/**
 * The plan's tokens and id (§7.1, ruling R18): `workflow` = the name; `phase` = the bound element's id, else
 * the context element's, else `1`, with the lowest free `-<n>` (`n ≥ 2`) appended when the id is occupied on
 * any baseline `dl-101` names; `scope` = the name. `--set phase=` / `--set scope=` override them, and a
 * colliding `--set phase=` is `CONFLICT`. Only derived values the committed `id_pattern` or `path` holds are
 * passed on as tokens; `phase` is recorded whatever they hold (task-346, `bug-491`: the caller writes it as a
 * field when it is no token), and the default title is `<workflow> — <phase>` with that phase. A `--set scope=`
 * naming no token is still passed on, so it stays `memory add`'s refusal. An `id_pattern` with a `{n}` counter is unique by
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
  // A `--set phase=` the patterns hold no token for is recorded as a field (task-346, `bug-491`); any other
  // `--set` is a token, so one naming no token stays `memory add`'s refusal.
  for (const key of Object.keys(set).sort()) if (key !== 'phase' || declared.has(key)) tokens[key] = set[key]!;
  const recordedPhase = set['phase'] ?? base;
  const phaseOf = (values: Readonly<Record<string, string>>): string => values['phase'] ?? recordedPhase;
  const titleOf = (phase: string): string => title ?? `${name} — ${phase}`;
  // The id `memory add` will generate: its `{slug}` comes from the title it is given (review F1 nit).
  const idOf = (values: Readonly<Record<string, string>>): string =>
    generateId(expandFieldTokens(idPattern, values), { slug: slugifyTitle(titleOf(phaseOf(values))), n: 0 });
  const planned = (values: Readonly<Record<string, string>>): StartPlan => ({
    id: idOf(values),
    title: titleOf(phaseOf(values)),
    tokens: values,
    phase: phaseOf(values),
  });

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
  const member = requireTeamMembership(root, identity.value);
  if (!member.ok) return member;
  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const snapshot = readDeductionSnapshotAtHead(root);
  const workflow = snapshot.workflows.find((candidate) => candidate.name === usage.name);
  if (workflow === undefined) return coreErr({ code: 'NOT_FOUND', message: unknownWorkflowMessage(usage.name), details: { ref: usage.name } });
  if (!workflowFacts(workflow).startable) return coreErr({ code: 'VALIDATION', message: `cannot start a sub workflow directly: ${usage.name}` });
  const planType = snapshot.memoryYaml?.types[PLAN_TYPE];
  if (planType === undefined || snapshot.memoryYaml === null) return coreErr({ code: 'VALIDATION', message: NO_PLAN_TYPE_MESSAGE });
  const planMemoryYaml = snapshot.memoryYaml;

  const deduction = deduceWorkflowState(snapshot);
  const resolve = (type: string, reference: string): ElementReferenceResolution =>
    resolveElementReference(snapshot.documents, planMemoryYaml, reference, { type });
  const resolved = resolveStartElement(usage.name, workflow.element, usage.element, deduction, snapshot.workflows, resolve);
  if (!resolved.ok) return resolved;
  const recorded = resolved.value.bound ?? resolved.value.context;
  const base = recorded?.id ?? DEFAULT_PHASE;

  const plan = planTokens(root, usage.name, planType.id_pattern ?? '{workflow}-{phase}-plan', planType.path, usage.set, base, usage.title);
  if (!plan.ok) return plan;
  const { title, tokens, phase } = plan.value;

  // The plan names its workflow and phase (§3.1, §7.1) even when the `id_pattern` and `path` hold no token for
  // them (task-346, `bug-491`): a plan naming no loaded workflow is no instance (§3.2, task-345), and a required
  // `phase` left blank would refuse the author's submit.
  const fields = {
    ...(tokens['workflow'] === undefined ? { workflow: usage.name } : {}),
    ...(tokens['phase'] === undefined ? { phase } : {}),
    ...(recorded === null ? {} : { element: recorded.id }),
  };
  const added = await verbs.add({
    root,
    options: { type: PLAN_TYPE, title, set: Object.keys(tokens).sort().map((key) => `${key}=${tokens[key]}`) },
    ...(Object.keys(fields).length === 0 ? {} : { fields }),
    // The start marker (§3.1, `dl-217` (a)): only this commit carries it, so only `start` opens an instance.
    trailers: [`${START_TRAILER}: ${usage.name}`],
  });
  if (!added.ok) return added;
  // A successful `memoryAdd` always carries its commit (`coreOk(…, { sha, message })`). The plan stays `draft`:
  // its author writes the body and submits it (task-346, `bug-390`).
  const { id } = added.value;

  const next = workflowNextAtHead(root, id);
  if (!next.ok) return next;
  return coreOk(
    {
      baseline: next.value.baseline,
      instance: next.value.instance!,
      next: next.value.next,
      commits: [added.commit!.sha],
      submit: `wingfoil memory submit ${id}`,
    },
    added.commit,
    added.warnings ?? [],
  );
}

/**
 * Why an open instance whose deduction is not complete cannot end (§7.2): its current step, or — an empty
 * frontier — its abandonment (§4.11). Every instance's workflow is loaded (§3.2, task-345), so an incomplete
 * instance with no step is an abandoned one, whose bound element is set.
 */
function incompleteReason(selected: InstanceDeduction): string {
  const { instance, frontier } = selected;
  if (frontier.length > 0) return `current step ${frontier[0]!.key}`;
  const element = instance.element!;
  return `it is abandoned: its element ${element.type}:${element.id} is ${element.status}`;
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
  const member = requireTeamMembership(root, identity.value);
  if (!member.ok) return member;
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

/**
 * `workflow start`'s `--format console` rendering (`spec-017` §7.1, §8): the instance, the line naming the submit
 * its `draft` plan owes (task-346), then its first step as `next` prints it. Pure.
 */
export function renderStartConsole(value: StartResult): string {
  if (isDryRunPlan(value)) return `${JSON.stringify(value, null, 2)}\n`;
  const { instance, next } = value;
  const head = `started ${instance.workflow} as ${instance.id} (active)\nplan ${instance.id} is draft: write its body, then run ${value.submit}\n`;
  const message = next === null ? `no next step: workflow '${instance.workflow}' is complete` : undefined;
  return head + renderNextConsole({ baseline: value.baseline, instance: null, complete: next === null, next, more: [], ...(message === undefined ? {} : { message }), diagnostics: [] });
}

/** `workflow end`'s `--format console` rendering (`spec-017` §8): the ended instance and the one now active. Pure. */
export function renderEndConsole(value: EndResult): string {
  if (isDryRunPlan(value)) return `${JSON.stringify(value, null, 2)}\n`;
  const active = value.active === null ? 'none' : `${value.active.workflow} (${value.active.id})`;
  return `ended ${value.ended.workflow} (${value.ended.id})\nactive: ${active}\n`;
}
