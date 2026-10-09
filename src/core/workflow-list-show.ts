/**
 * `wingfoil workflow list [--all]` and `wingfoil workflow show <ref>` (task-204; `spec-017` §7.5, §7.6, §8,
 * §10; BDD P4.6, P4.7).
 *
 * **Baseline: `HEAD`, declared** (`spec-017` §1.1, approver ruling R15; `spec-006` §6 item 6; `spec-008`
 * §11). Both commands answer from one snapshot of the repository as committed at `HEAD` —
 * `readDeductionSnapshotAtHead` — and from the deduction computed on it (`deduceWorkflowState`), the one
 * `workflow next` / `status` answer from, so a workflow "executable now" here is one a frontier step there
 * enters. The working tree only explains: a deduction input that differs from `HEAD` is the warning
 * `W_UNCOMMITTED_INPUTS` (§1.2), never the answer. `show`'s further reads — `workflows/bindings.yaml`,
 * `roles.yaml` and the directive files — are made at the snapshot's commit, so one answer has one baseline.
 *
 * Both payloads carry the `baseline` and the deduction's ordered `diagnostics` (§1.3). A `spec-003` error
 * refuses both: the snapshot reader throws `DiagnosticsError`, which the read-only operations map to
 * `VALIDATION` with every diagnostic in `details` (exit `1`, §10).
 *
 * The MCP Resources `wingfoil://workflows` and `wingfoil://workflows/{name}` are not these operations: they
 * keep their payload and their working-tree baseline in v0.3 (§9, `src/mcp/workflow-resource.ts`).
 */
import type { RolesYaml } from '../directives/schema';
import type { MemoryYaml } from '../memory/schema';
import type { Diagnostic } from '../validation';
import { resolveToken, tokenName, type BindingsYaml, type TokenBinding } from '../workflow/bindings';
import { declaresState, deduceWorkflowState, type Baseline, type Deduction, type EvidenceKind } from '../workflow/deduce';
import { workflowFacts, type Cadence, type Phase, type PhaseMode, type Workflow } from '../workflow/schema';

import { resolveRoleDirectives } from './context';
import { loadDirectivesAtRev, loadRolesYamlAtRev, type DirectiveFile } from './loaders';
import { coreErr, coreOk, type CoreResult } from './types';
import { isImplicitOwnerProduces } from './workflow-diagnostics';
import { readDeductionSnapshotAtHead } from './workflow-deduction';
import { iterationStartState, workflowExitStates, type ExitStart } from './workflow-exit-state';
import { loadWorkflowRegistryAtRev } from './workflow-registry';

/** `ListResult.message` when `HEAD` holds no manifest (BDD P4.6 sc. 4; `spec-003` Layer 1). */
export const NO_WORKFLOWS_DEFINED = 'no workflows defined';

/** The refusal of a `<ref>` that names no workflow (`spec-017` §10, BDD P4.7 sc. 3). */
export const unknownWorkflowMessage = (name: string): string => `unknown workflow: ${name}`;

/** One entry of `workflow list` (`spec-017` §8 `ListResult`). */
export interface ListEntry {
  readonly name: string;
  readonly startable: boolean;
  readonly includable: boolean;
  readonly description: string | null;
  /** Startable, or the sub a phase on an open instance's frontier includes (§7.5). */
  readonly executableNow: boolean;
}

/** `workflow list`'s payload (`spec-017` §8). */
export interface ListResult {
  readonly baseline: Baseline;
  readonly workflows: readonly ListEntry[];
  /** `no workflows defined` when `HEAD` holds no manifest; absent otherwise. */
  readonly message?: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** An action or check token with its binding (`spec-017` §6.1); a check is never evaluated in v0.3. */
export interface TokenView {
  readonly token: string;
  readonly binding: TokenBinding;
}

/** A check token: listed with its binding, `evaluated: false` (`spec-017` §6.1, P4.12 is v1.0). */
export interface CheckTokenView extends TokenView {
  readonly evaluated: false;
}

/** One phase of a resolved declaration (`spec-017` §7.6). */
export interface PhaseView {
  readonly name: string;
  readonly description: string | null;
  readonly role: string | null;
  readonly optional: boolean;
  /** The role's directives, role-bound and global, ascending by id (`spec-012` §5); empty without a role. */
  readonly directives: readonly { readonly id: string; readonly title: string }[];
  /** That resolution's warnings (`resolveRoleDirectives`), or why none was made. */
  readonly directiveWarnings: readonly string[];
  readonly actions: readonly TokenView[];
  readonly checks: { readonly pre: readonly CheckTokenView[]; readonly post: readonly CheckTokenView[] };
  /** Each entry with its owner type (`null`: no element, or an implicit owner) and whether it is evidence (§4.3). */
  readonly produces: readonly { readonly pattern: string; readonly owner: string | null; readonly evidence: boolean }[];
  readonly approval: { readonly byRole: string } | { readonly byPerson: string } | null;
  readonly awaits: { readonly party: string; readonly evidence: CheckTokenView } | null;
  readonly fallback: { readonly step: string; readonly setState: string | null } | null;
  /** `iterate_over` and its filter (§4.6). */
  readonly iterate: { readonly over: string; readonly where: Readonly<Record<string, unknown>> | null } | null;
  /** A `where` without `iterate_over` (`spec-003` § "Selections"). */
  readonly selection: { readonly where: Readonly<Record<string, unknown>> } | null;
  /** The declared mode, `fresh` when absent (`spec-003` § "Execution independence"). */
  readonly mode: PhaseMode;
  readonly allowedModes: readonly PhaseMode[];
  readonly distinctFrom: readonly string[];
  readonly cadence: Cadence;
  /** The evidence kinds the phase declares (§4.3), in the deduction's order. */
  readonly evidence: readonly EvidenceKind[];
  readonly include: string | null;
  /** The included workflow, resolved the same way, nested under this phase (P4.7 sc. 2). */
  readonly sub: WorkflowView | null;
}

/** A workflow's declaration resolved (`spec-017` §7.6). */
export interface WorkflowView {
  readonly name: string;
  /** Repository-relative (`.wingfoil/workflows/custom/<name>.yaml`). */
  readonly file: string;
  readonly startable: boolean;
  readonly includable: boolean;
  readonly description: string | null;
  readonly element: string | null;
  readonly phases: readonly PhaseView[];
}

/** `workflow show`'s payload: the resolved declaration with the baseline and the diagnostics (`spec-017` §8). */
export interface ShowResult {
  readonly baseline: Baseline;
  readonly workflow: WorkflowView;
  readonly diagnostics: readonly Diagnostic[];
}

/** Code-unit order, as a comparator (`spec-017` §1.3: workflows by byte-wise ascending name). */
function compareText(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

// --- list ---------------------------------------------------------------------------------------

/**
 * The workflows a phase on some open instance's frontier includes: for each frontier step, every phase of its
 * trail — the plain includes the deduction descends through, and the leaf itself, which is an `iterate_over`
 * phase until task-202 expands it — that declares an `include`.
 */
function frontierSubs(deduction: Deduction, byName: ReadonlyMap<string, Workflow>): Set<string> {
  const subs = new Set<string>();
  for (const { frontier } of deduction.instances) {
    for (const step of frontier) {
      for (const entry of step.trail) {
        const include = byName.get(entry.workflow)?.phases.find((phase) => phase.name === entry.phase)?.include;
        if (include !== undefined) subs.add(include);
      }
    }
  }
  return subs;
}

/**
 * `workflow list`'s answer from one deduction (`spec-017` §7.5): without `all`, the startable workflows and
 * every includable one a frontier enters; with it, every loaded workflow. Pure.
 */
export function listWorkflows(workflows: readonly Workflow[], deduction: Deduction, all: boolean): ListResult {
  const byName = new Map(workflows.map((workflow) => [workflow.name, workflow] as const));
  const subs = frontierSubs(deduction, byName);
  const entries = workflows
    .map((workflow): ListEntry => {
      const { startable, includable } = workflowFacts(workflow);
      return {
        name: workflow.name,
        startable,
        includable,
        description: workflow.description ?? null,
        executableNow: startable || (includable && subs.has(workflow.name)),
      };
    })
    .filter((entry) => all || entry.executableNow)
    .sort((a, b) => compareText(a.name, b.name));
  return {
    baseline: deduction.baseline,
    workflows: entries,
    ...(workflows.length === 0 ? { message: NO_WORKFLOWS_DEFINED } : {}),
    diagnostics: deduction.diagnostics,
  };
}

/**
 * `workflow list [--all]` at `HEAD` (`spec-017` §7.5).
 *
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error;
 *   `StorageError` when git cannot answer.
 */
export function workflowListAtHead(root: string, all: boolean): ListResult {
  const snapshot = readDeductionSnapshotAtHead(root);
  return listWorkflows(snapshot.workflows, deduceWorkflowState(snapshot), all);
}

// --- show ---------------------------------------------------------------------------------------

/** What resolving one declaration reads, all at the snapshot's commit. */
export interface ShowInputs {
  readonly workflows: readonly Workflow[];
  /** Each workflow's file, repository-relative, parallel to `workflows`. */
  readonly workflowFiles: readonly string[];
  readonly memoryYaml: MemoryYaml | null;
  readonly bindings: BindingsYaml | null;
  readonly rolesYaml: RolesYaml | null;
  readonly directiveFiles: readonly DirectiveFile[];
}

/** The modes a phase allows (`spec-017` §6.3): `fresh` always, plus the declared non-fresh one. */
function allowedModes(mode: PhaseMode | undefined): PhaseMode[] {
  return mode === undefined || mode === 'fresh' ? ['fresh'] : ['fresh', mode];
}

/**
 * The evidence kinds `phase` declares (`spec-017` §4.3), by the rules the deduction's leaf step applies
 * (`src/workflow/deduce.ts`), in its order: a plain `include` is `include` alone (§4.5); otherwise
 * `include` for an `iterate_over`, `state` (`declaresState`, shared), `created`, `produces` (string
 * entries with an explicit owner), `selection`, `awaits`, then `record` for an `awaits` or a phase with
 * no kind but `created`.
 */
export function declaredEvidenceKinds(workflow: Workflow, p: number, boundType: string | null): EvidenceKind[] {
  const phase = workflow.phases[p]!;
  if (phase.include !== undefined && phase.iterate_over === undefined) return ['include'];
  const kinds: EvidenceKind[] = [];
  if (phase.iterate_over !== undefined) kinds.push('include');
  if (declaresState(phase, boundType)) kinds.push('state');
  if ((phase.actions ?? []).some((action) => tokenName(action) === 'memory.add')) kinds.push('created');
  if ((phase.produces ?? []).some((entry) => typeof entry === 'string' && !isImplicitOwnerProduces(workflow, p, entry))) kinds.push('produces');
  if (phase.where !== undefined && phase.iterate_over === undefined) kinds.push('selection');
  if (phase.awaits !== undefined) kinds.push('awaits');
  if (phase.awaits !== undefined || !kinds.some((kind) => kind !== 'created')) kinds.push('record');
  return kinds;
}

/** Resolves declarations against one set of inputs. */
class Resolver {
  private readonly byName: Map<string, Workflow>;
  private readonly fileOf: Map<string, string>;

  constructor(private readonly inputs: ShowInputs) {
    this.byName = new Map(inputs.workflows.map((workflow) => [workflow.name, workflow] as const));
    this.fileOf = new Map(inputs.workflows.map((workflow, i) => [workflow.name, inputs.workflowFiles[i]!] as const));
  }

  workflow(name: string): Workflow | undefined {
    return this.byName.get(name);
  }

  /**
   * The bound type of each phase (`spec-017` §4.4, as the core checks compute it): from the exit-state
   * computation when `memory.yaml` is present, otherwise the declared `element` or the includer's.
   */
  private boundTypes(workflow: Workflow, start: ExitStart): (string | null)[] {
    const { memoryYaml } = this.inputs;
    if (memoryYaml === null) return workflow.phases.map(() => workflow.element ?? start.boundType);
    const states = workflowExitStates(workflow, memoryYaml, start, this.byName);
    // A self-creating instance's element is in scope for all of its phases (§3.4).
    const selfType = start.instance ? (states.find((state) => state.boundType !== null)?.boundType ?? null) : null;
    return states.map((state) => state.boundType ?? selfType);
  }

  /** The start of a sub included by phase `p` of `workflow` (§4.4–§4.6; `workflow-core-checks.ts` `contextChecks`). */
  private includeStart(workflow: Workflow, p: number, start: ExitStart, sub: Workflow): ExitStart {
    const { memoryYaml } = this.inputs;
    const phase = workflow.phases[p]!;
    const over = phase.iterate_over;
    if (over !== undefined && over.includes(':')) return { boundType: null, state: null, instance: false };
    if (over !== undefined) return { boundType: over, state: memoryYaml === null ? null : iterationStartState(memoryYaml, over, phase.where), instance: false };
    if (memoryYaml === null) return { boundType: sub.element ?? workflow.element ?? start.boundType, state: null, instance: false };
    const here = workflowExitStates(workflow, memoryYaml, start, this.byName)[p]!;
    const type = sub.element ?? here.boundType;
    return { boundType: type, state: type !== null && type === here.boundType ? here.entry : null, instance: false };
  }

  private directives(role: string | undefined): Pick<PhaseView, 'directives' | 'directiveWarnings'> {
    if (role === undefined) return { directives: [], directiveWarnings: [] };
    if (this.inputs.rolesYaml === null) {
      return { directives: [], directiveWarnings: [`roles.yaml is absent: no directive resolved for role '${role}'`] };
    }
    const resolution = resolveRoleDirectives(this.inputs.directiveFiles, this.inputs.rolesYaml, role);
    return {
      directives: resolution.directives.map((file) => ({ id: file.frontmatter.id, title: file.frontmatter.title })),
      directiveWarnings: resolution.warnings,
    };
  }

  private check(token: string): CheckTokenView {
    return { token, binding: resolveToken(token, 'check', this.inputs.bindings), evaluated: false };
  }

  /**
   * The declaration of `workflow` resolved from `start` (§7.6), its subs nested under their phases. The
   * recursion is finite: the registry refuses an include cycle (`E_WORKFLOW_INCLUDE_CYCLE`).
   */
  view(workflow: Workflow, start: ExitStart): WorkflowView {
    const { startable, includable } = workflowFacts(workflow);
    const bound = this.boundTypes(workflow, start);
    const phases = workflow.phases.map((phase: Phase, p): PhaseView => {
      const sub = phase.include === undefined ? undefined : this.byName.get(phase.include);
      const approval = phase.approval as { by_role?: string; by_person?: string } | undefined; // one of the two (schema union)
      const iterate = phase.iterate_over === undefined ? null : { over: phase.iterate_over, where: phase.where ?? null };
      return {
        name: phase.name,
        description: phase.description ?? null,
        role: phase.role ?? null,
        optional: phase.optional,
        ...this.directives(phase.role),
        actions: (phase.actions ?? []).map((token) => ({ token, binding: resolveToken(token, 'action', this.inputs.bindings) })),
        checks: { pre: (phase.checks?.pre ?? []).map((token) => this.check(token)), post: (phase.checks?.post ?? []).map((token) => this.check(token)) },
        produces: (phase.produces ?? []).map((entry) => {
          if (typeof entry !== 'string') return { pattern: entry.path, owner: entry.type, evidence: false };
          const implicit = isImplicitOwnerProduces(workflow, p, entry);
          return { pattern: entry, owner: implicit ? null : bound[p]!, evidence: !implicit };
        }),
        approval: approval === undefined ? null : approval.by_role !== undefined ? { byRole: approval.by_role } : { byPerson: approval.by_person! },
        awaits: phase.awaits === undefined ? null : { party: phase.awaits.party, evidence: this.check(phase.awaits.evidence) },
        fallback: phase.fallback === undefined ? null : { step: phase.fallback.step, setState: phase.fallback.set_state ?? null },
        iterate,
        selection: phase.where !== undefined && phase.iterate_over === undefined ? { where: phase.where } : null,
        mode: phase.mode ?? 'fresh',
        allowedModes: allowedModes(phase.mode),
        distinctFrom: phase.distinct_from ?? [],
        cadence: phase.cadence,
        evidence: declaredEvidenceKinds(workflow, p, bound[p]!),
        include: phase.include ?? null,
        // The include resolves: the registry refuses one naming no loaded workflow (`E_WORKFLOW_INCLUDE_UNRESOLVED`).
        sub: sub === undefined ? null : this.view(sub, this.includeStart(workflow, p, start, sub)),
      };
    });
    return {
      name: workflow.name,
      file: this.fileOf.get(workflow.name)!,
      startable,
      includable,
      description: workflow.description ?? null,
      element: workflow.element ?? null,
      phases,
    };
  }
}

/** The start a workflow shown on its own resolves from (`workflow-core-checks.ts`'s root visit). */
function rootStart(workflow: Workflow, memoryYaml: MemoryYaml | null): ExitStart {
  const element = workflow.element ?? null;
  return {
    boundType: element,
    state: element === null || memoryYaml === null ? null : iterationStartState(memoryYaml, element, undefined),
    instance: workflowFacts(workflow).startable,
  };
}

/**
 * `workflow show <ref>`'s answer (`spec-017` §7.6, §10): `ref` names a loaded workflow, or an open instance
 * standing for its workflow; anything else is `NOT_FOUND` `unknown workflow: <ref>`. Pure.
 */
export function showWorkflow(inputs: ShowInputs, deduction: Deduction, ref: string): CoreResult<ShowResult> {
  const resolver = new Resolver(inputs);
  const name = resolver.workflow(ref) !== undefined ? ref : (deduction.instances.find((entry) => entry.instance.id === ref)?.instance.workflow ?? ref);
  const workflow = resolver.workflow(name);
  if (workflow === undefined) return coreErr({ code: 'NOT_FOUND', message: unknownWorkflowMessage(name), details: { ref } });
  return coreOk({ baseline: deduction.baseline, workflow: resolver.view(workflow, rootStart(workflow, inputs.memoryYaml)), diagnostics: deduction.diagnostics });
}

/**
 * `workflow show <ref>` at `HEAD` (`spec-017` §7.6): the deduction snapshot, then `bindings.yaml`,
 * `roles.yaml` and the directive files at the snapshot's commit.
 *
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error; a
 *   `ValidationError` for an invalid `roles.yaml` or directive file at `HEAD`; `StorageError` when git
 *   cannot answer.
 */
export function workflowShowAtHead(root: string, ref: string): CoreResult<ShowResult> {
  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const committed = snapshot.commit !== '';
  const inputs: ShowInputs = {
    workflows: snapshot.workflows,
    workflowFiles: snapshot.workflowFiles,
    memoryYaml: snapshot.memoryYaml,
    bindings: committed && snapshot.workflows.length > 0 ? loadWorkflowRegistryAtRev(root, snapshot.commit).bindings : null,
    rolesYaml: committed ? loadRolesYamlAtRev(root, snapshot.commit) : null,
    directiveFiles: committed ? loadDirectivesAtRev(root, snapshot.commit) : [],
  };
  return showWorkflow(inputs, deduction, ref);
}
