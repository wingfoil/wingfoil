/**
 * `wingfoil workflow next [<ref>] [--assigned-to <who>]` (task-216; `spec-017` §6.1–§6.4, §7.3, §8 `Step` /
 * `NextResult`, §10, §11; BDD P4.4; REQ-PERF-03).
 *
 * **Baseline: `HEAD`, gating** (`spec-017` §1.1 item 1). The answer comes from one snapshot of the repository
 * as committed at `HEAD` — `readDeductionSnapshotAtHead`, which also carries `bindings.yaml` and `dna.yaml` —
 * and the deduction computed on it (`deduceWorkflowState`), the one `workflow list` / `show` / `status` and
 * `agent execute --next` answer from. `roles.yaml` and the directive files are read at the snapshot's commit.
 * The working tree only explains (`W_UNCOMMITTED_INPUTS`, §1.2).
 *
 * **What a step reports** (§6): its position (key, trail, scope — the deduction's), its role, the members who
 * hold it and whether an agent executes as it (§6.2, §6.3), the role's directive ids and titles (never their
 * content: `spec-012` §7 is `agent execute`'s; a phase names directives only through its role, `dl-066`
 * option 1), each action with its interpolated text and its binding (§6.1) — a `wingfoil` argv with the step's
 * operands filled, an `agent` argv `wingfoil agent execute --workflow <instance> --step <key>` (ruling R16), a
 * `manual` Memory action's expected commit subject by `spec-003`'s verb rule — the checks with their binding
 * and `evaluated: false`, the evidence, `awaits`, fallback and re-entry, the executor attributes and the
 * cadence (`lastRun: "not-recorded"`, §6.4). Nothing is executed.
 *
 * Approval detection and routing (§5.1–§5.3) are `workflow status`'s (task-225): until it lands, a step's
 * `awaiting` reports only a third party (§5.4), and the console renderer already prints an approval's "human
 * needed" line when one is given.
 */
import type { RolesYaml } from '../directives/schema';
import type { DnaYaml } from '../dna/schema';
import type { MemoryYaml, StateMachine } from '../memory/schema';
import { resolveStateMachine } from '../memory/state-machine';
import type { Diagnostic } from '../validation';
import { resolveToken, tokenName, type BindingsYaml, type TokenBinding } from '../workflow/bindings';
import {
  deduceWorkflowState,
  resolveInstanceRef,
  type Baseline,
  type DeducedAction,
  type DeducedStep,
  type Deduction,
  type ElementRef,
  type EvidenceKind,
  type Instance,
  type ProducesView,
  type ScopeRef,
  type TrailEntry,
} from '../workflow/deduce';
import type { Phase, PhaseMode, Workflow } from '../workflow/schema';

import { resolveRoleDirectives } from './context';
import { readGitIdentity } from './git-identity';
import { loadDirectivesAtRev, loadRolesYamlAtRev, type DirectiveFile } from './loaders';
import { coreErr, coreOk, type CoreResult } from './types';
import { readDeductionSnapshotAtHead } from './workflow-deduction';

/** `NextResult.message` when no instance is open (`spec-017` §7.3). */
export const NO_OPEN_WORKFLOWS = 'no open workflows';

/** `NextResult.message` when the selected instance's frontier is empty and it is complete (BDD P4.4 sc. 3). */
export const noNextStepMessage = (workflow: string): string => `no next step: workflow '${workflow}' is complete`;

/** The `<who>` of `--assigned-to` that stands for the git identity (`spec-017` §7.3, BDD P4.4 sc. 2). */
export const ASSIGNED_TO_ME = 'me';

/** A `team.members[]` entry as `next` reports it (`spec-017` §8); `email` is `''` when the entry has none. */
export interface Member {
  readonly name: string;
  readonly email: string;
}

/** An action's binding as a step reports it (`spec-017` §6.1, §8 `ActionView.binding`). */
export interface StepBinding {
  readonly kind: TokenBinding['kind'];
  /** The command to run, the step's operands filled: a `wingfoil`, `agent` or project `run` binding. */
  readonly argv?: readonly string[];
  /**
   * A `manual` Memory action's expected commit subject(s), by `spec-003`'s verb rule. One subject per line
   * when the targets need different brackets or types (one commit each).
   */
  readonly expectedCommit?: string;
}

/** One action of a step (`spec-017` §8 `ActionView`). */
export interface ActionView {
  readonly token: string;
  readonly text: string;
  readonly unresolved: readonly string[];
  readonly target: DeducedAction['target'];
  readonly binding: StepBinding;
}

/** One check, listed with its binding and never evaluated in v0.3 (`spec-017` §6.1, P4.12 is v1.0). */
export interface CheckView {
  readonly token: string;
  readonly binding: StepBinding;
  readonly evaluated: false;
}

/** What a step waits for (`spec-017` §5.1, §5.4, §8). */
export type Awaiting =
  | {
      readonly kind: 'approval';
      readonly byRole?: string;
      readonly byPerson?: string;
      readonly elements: readonly ElementRef[];
      readonly recordNeeded: boolean;
      readonly routedTo: readonly Member[];
      readonly routingError?: string;
    }
  | { readonly kind: 'party'; readonly party: string; readonly evidence: CheckView };

/** A declared recurring cadence as a step reports it (`spec-017` §6.4): never computed overdue in v0.3. */
export interface CadenceView {
  readonly recurring: unknown;
  readonly lastRun: 'not-recorded';
}

/** A frontier step, as `workflow next` reports it (`spec-017` §8 `Step`). */
export interface Step {
  readonly key: string;
  readonly instance: string;
  readonly trail: readonly TrailEntry[];
  readonly workflow: string;
  readonly phase: string;
  readonly scope: ScopeRef | null;
  readonly role: string | null;
  /** `true` when `dna.yaml` lists the role in some `team.agents[].executes_as` (§6.3, `dl-135` point 1). */
  readonly agentRole: boolean;
  /** The members who hold the role, ascending `(name, email)` (§5.1 ordering). */
  readonly members: readonly Member[];
  /** The role's directives, role-bound and global, ascending by id (`spec-012` §5); content never inlined. */
  readonly directives: readonly { readonly id: string; readonly title: string }[];
  /** That resolution's warnings (§6.2), or why none was made. */
  readonly directiveWarnings: readonly string[];
  readonly actions: readonly ActionView[];
  readonly checks: { readonly pre: readonly CheckView[]; readonly post: readonly CheckView[] };
  readonly produces: readonly ProducesView[];
  readonly created: readonly ElementRef[];
  readonly evidence: { readonly kinds: readonly EvidenceKind[]; readonly missing: readonly EvidenceKind[]; readonly finalizable: boolean };
  readonly optional: boolean;
  readonly awaiting: Awaiting | null;
  readonly fallback: { readonly step: string; readonly setState: string | null } | null;
  readonly reentered: boolean;
  readonly reentryCommit: string | null;
  /** The mode that runs: `fresh` in every v0.3 run (`--resume` / `--ref` are v0.4, §6.3). */
  readonly mode: 'fresh';
  readonly allowedModes: readonly PhaseMode[];
  readonly distinctFrom: readonly string[];
  /** A recurring cadence (§6.4), or `null` for `once`. */
  readonly cadence: CadenceView | null;
}

/** `workflow next`'s payload (`spec-017` §8). */
export interface NextResult {
  readonly baseline: Baseline;
  readonly instance: Instance | null;
  readonly complete: boolean;
  /** The next step — the one `agent execute --next` consumes — or `null`. */
  readonly next: Step | null;
  /** The further ready steps, in frontier order. */
  readonly more: readonly Step[];
  readonly message?: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** What building the steps reads, all at the snapshot's commit. */
export interface NextInputs {
  readonly workflows: readonly Workflow[];
  readonly memoryYaml: MemoryYaml | null;
  readonly dnaYaml: DnaYaml | null;
  readonly bindings: BindingsYaml | null;
  readonly rolesYaml: RolesYaml | null;
  readonly directiveFiles: readonly DirectiveFile[];
}

/** Options of {@link nextWorkflow}. */
export interface NextOptions {
  /** A workflow name or an open instance id (`spec-017` §3.3); absent, the active instance. */
  readonly ref?: string;
  /** `me`, a member name or email, or a role name (§7.3). */
  readonly assignedTo?: string;
  /** The git identity's email, which `me` stands for; `''` when unresolved. */
  readonly identityEmail?: string;
}

/** Code-unit order, as a comparator. */
function compareText(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/** The modes a phase allows (`spec-017` §6.3): `fresh` always, plus the declared non-fresh one. */
function allowedModes(mode: PhaseMode | undefined): PhaseMode[] {
  return mode === undefined || mode === 'fresh' ? ['fresh'] : ['fresh', mode];
}

/** The members of `dna.yaml` holding `role`, ascending `(name, email)` (`spec-017` §1.3, §5.1). */
export function membersHoldingRole(dnaYaml: DnaYaml | null, role: string): Member[] {
  return (dnaYaml?.team?.members ?? [])
    .filter((member) => member.roles.includes(role))
    .map((member) => ({ name: member.name, email: member.email ?? '' }))
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.email, b.email));
}

/** The `name: value` arguments of a token's parentheses, unquoted (`git.merge(from: main)` → `{ from: 'main' }`). */
function tokenArguments(text: string): Map<string, string> {
  const args = new Map<string, string>();
  const open = text.indexOf('(');
  if (open === -1 || !text.endsWith(')')) return args;
  for (const match of text.slice(open + 1, -1).matchAll(/([A-Za-z_][\w-]*)\s*:\s*("[^"]*"|'[^']*'|[^,\s)]+)/g)) {
    args.set(match[1]!, match[2]!.replace(/^["']|["']$/g, ''));
  }
  return args;
}

/** The first argument of `….set_state(s)` / `….set_release(v)`, unquoted, or `null`. */
function firstArgument(text: string): string | null {
  const match = /\(\s*["']?([^"'()]+?)["']?\s*\)\s*$/.exec(text);
  return match ? match[1]!.trim() : null;
}

/** One commit subject a target needs: grouped with the others of the same type, verb and bracket (one commit each group). */
interface SubjectEntry {
  readonly type: string;
  readonly verb: string;
  /** `<from> → <to>`; empty for `assign`, whose subject has no bracket. */
  readonly bracket: string;
  readonly id: string;
}

/**
 * `wf(<type>): <verb> <ids> [<bracket>]` per group of entries with the same type, verb and bracket, ids joined
 * by `, `, one subject per line; `assign release <v>` reads `wf(<type>): assign release <v> to <ids>`
 * (`spec-003` verb table). `undefined` when there is no entry.
 */
function renderSubjects(entries: readonly SubjectEntry[]): string | undefined {
  const groups = new Map<string, SubjectEntry[]>();
  for (const entry of entries) {
    const key = `${entry.type}\u0000${entry.verb}\u0000${entry.bracket}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  if (groups.size === 0) return undefined;
  return [...groups.values()]
    .map((group) => {
      const { type, verb, bracket } = group[0]!;
      const ids = group.map((entry) => entry.id).join(', ');
      return bracket === '' ? `wf(${type}): ${verb} to ${ids}` : `wf(${type}): ${verb} ${ids} [${bracket}]`;
    })
    .join('\n');
}

/**
 * The commit subject(s) a built-in `manual` Memory action is expected to produce (`spec-003` § "Action
 * expressions", the verb table and the rule under it; `spec-017` §6.1), or `undefined` when it produces none.
 * A target not known yet is written `<id>` (and its type `<type>`, its state `<from>`):
 * - `set_state(s)`: `approve` when the phase declares `approval:`, else `finalize` when `s` is the last state
 *   of the type's `sequence`, else `start`; bracket `[<from> → s]`, `<from>` the bound element's state before
 *   the action (§4.4) or each other target's status at `HEAD`;
 * - `<T>.sync_state(for_each: <S>.<field>)`: `sync`, each named element moved to the state of the same name
 *   as the source's, or to its own last state when the source's is its type's last; the bracket chains the
 *   states passed forward. An element already there needs no commit;
 * - `set_release(v)`: `assign release <v> to <ids>`, one subject per type.
 */
function expectedCommit(action: DeducedAction, phase: Phase, memoryYaml: MemoryYaml): string | undefined {
  const name = tokenName(action.token);
  const machineOf = (type: string): StateMachine | null => (Object.prototype.hasOwnProperty.call(memoryYaml.types, type) ? resolveStateMachine(memoryYaml, type) : null);
  const lastOf = (machine: StateMachine): string => machine.sequence[machine.sequence.length - 1]!;
  const targets: readonly ElementRef[] =
    action.targets.length > 0 ? action.targets : [{ type: action.targetType ?? '<type>', id: '<id>', status: action.target === 'bound' && action.boundFrom !== null ? action.boundFrom : '<from>' }];
  const argument = firstArgument(action.text) ?? '';

  if (name === 'element.set_release') return renderSubjects(targets.map((target) => ({ type: target.type, verb: `assign release ${argument}`, bracket: '', id: target.id })));
  if (name.endsWith('.set_state')) {
    return renderSubjects(
      targets.map((target) => {
        const machine = machineOf(target.type);
        const verb = phase.approval !== undefined ? 'approve' : machine !== null && lastOf(machine) === argument ? 'finalize' : 'start';
        const from = action.target === 'bound' && action.boundFrom !== null ? action.boundFrom : target.status;
        return { type: target.type, verb, bracket: `${from} → ${argument}`, id: target.id };
      }),
    );
  }
  // `<T>.sync_state(for_each: <S>.<field>)`; a sync whose source is not known yet expects nothing.
  const source = action.source;
  if (!name.endsWith('.sync_state') || source === undefined || source.state === null) return undefined;
  const sourceMachine = machineOf(source.type);
  const sourceLast = sourceMachine !== null && lastOf(sourceMachine) === source.state;
  const entries: SubjectEntry[] = [];
  for (const target of action.targets) {
    const machine = machineOf(target.type)!; // a target was found as a Memory element of its type
    const to = machine.sequence.includes(source.state) ? source.state : sourceLast ? lastOf(machine) : null;
    if (to === null || target.status === to) continue;
    const from = machine.sequence.indexOf(target.status);
    const toIndex = machine.sequence.indexOf(to);
    const chain = from !== -1 && toIndex > from ? machine.sequence.slice(from, toIndex + 1) : [target.status, to];
    entries.push({ type: target.type, verb: 'sync', bracket: chain.join(' → '), id: target.id });
  }
  return renderSubjects(entries);
}

/** Replace each `{name}` element of a project `run` argv with the token's `name:` argument, when it has one. */
function interpolateRun(run: readonly string[], text: string): string[] {
  const args = tokenArguments(text);
  return run.map((element) => element.replace(/^\{([^{}]+)\}$/, (whole, name: string) => args.get(name) ?? whole));
}

/** The binding of one action, with the step's operands filled (`spec-017` §6.1). */
function actionBinding(action: DeducedAction, step: DeducedStep, phase: Phase, inputs: NextInputs): StepBinding {
  const binding = resolveToken(action.token, 'action', inputs.bindings);
  const name = tokenName(action.token);
  switch (binding.kind) {
    case 'wingfoil': {
      const argv = [...binding.argv!]; // a built-in `wingfoil` binding always names its command (`bindings.ts`)
      if (name === 'memory.add') argv.push('--workflow', step.instance, '--step', step.key);
      else if (name.startsWith('memory.')) argv.push(...action.targets.map((target) => target.id));
      return { kind: 'wingfoil', argv };
    }
    case 'agent':
      return { kind: 'agent', argv: ['wingfoil', 'agent', 'execute', '--workflow', step.instance, '--step', step.key] };
    case 'run':
      return { kind: 'run', argv: interpolateRun(binding.argv!, action.text) }; // a `run` binding is its argv
    case 'manual': {
      // A step exists only for an open plan, a Memory element: `memory.yaml` is present.
      const commit = binding.source === 'built-in' ? expectedCommit(action, phase, inputs.memoryYaml!) : undefined;
      return commit === undefined ? { kind: 'manual' } : { kind: 'manual', expectedCommit: commit };
    }
    default:
      return { kind: 'unbound' };
  }
}

/** A check token with its binding, never evaluated (`spec-017` §6.1). */
function checkView(token: string, bindings: BindingsYaml | null): CheckView {
  const binding = resolveToken(token, 'check', bindings);
  return { token, binding: binding.kind === 'run' ? { kind: 'run', argv: interpolateRun(binding.argv!, token) } : { kind: binding.kind }, evaluated: false };
}

/** The role's directives (`spec-017` §6.2): ids and titles, ascending by id, and the resolution's warnings. */
function roleDirectives(role: string | null, inputs: NextInputs): Pick<Step, 'directives' | 'directiveWarnings'> {
  if (role === null) return { directives: [], directiveWarnings: [] };
  if (inputs.rolesYaml === null) return { directives: [], directiveWarnings: [`roles.yaml is absent: no directive resolved for role '${role}'`] };
  const resolution = resolveRoleDirectives(inputs.directiveFiles, inputs.rolesYaml, role);
  return {
    directives: resolution.directives
      .map((file) => ({ id: file.frontmatter.id, title: file.frontmatter.title }))
      .sort((a, b) => compareText(a.id, b.id)),
    directiveWarnings: resolution.warnings,
  };
}

/**
 * Build the reported step from a deduced frontier step (`spec-017` §6, §8 `Step`). Pure: it reads the
 * deduced step and `inputs` only.
 */
export function buildStep(step: DeducedStep, inputs: NextInputs): Step {
  // The step's workflow and phase are loaded: deduction puts only loaded workflows' phases on a frontier.
  const workflow = inputs.workflows.find((candidate) => candidate.name === step.workflow)!;
  const phase = workflow.phases.find((candidate) => candidate.name === step.phase)!;
  const scope = step.scope;
  const role = step.role;
  const agentRole = role !== null && (inputs.dnaYaml?.team?.agents ?? []).some((agent) => agent.executes_as.includes(role));
  const otherMissing = step.evidence.missing.filter((kind) => kind !== 'awaits' && kind !== 'record');
  const awaiting: Awaiting | null =
    phase.awaits !== undefined && otherMissing.length === 0 ? { kind: 'party', party: phase.awaits.party, evidence: checkView(phase.awaits.evidence, inputs.bindings) } : null;
  return {
    key: step.key,
    instance: step.instance,
    trail: step.trail,
    workflow: step.workflow,
    phase: step.phase,
    scope,
    role,
    agentRole,
    members: role === null ? [] : membersHoldingRole(inputs.dnaYaml, role),
    ...roleDirectives(role, inputs),
    actions: step.actions.map((action) => ({
      token: action.token,
      text: action.text,
      unresolved: action.unresolved,
      target: action.target,
      binding: actionBinding(action, step, phase, inputs),
    })),
    checks: {
      pre: (phase.checks?.pre ?? []).map((token) => checkView(token, inputs.bindings)),
      post: (phase.checks?.post ?? []).map((token) => checkView(token, inputs.bindings)),
    },
    produces: step.produces,
    created: step.created,
    evidence: step.evidence,
    optional: step.optional,
    awaiting,
    fallback: phase.fallback === undefined ? null : { step: phase.fallback.step, setState: phase.fallback.set_state ?? null },
    reentered: step.reentered,
    reentryCommit: step.reentryCommit,
    mode: 'fresh',
    allowedModes: allowedModes(phase.mode),
    distinctFrom: phase.distinct_from ?? [],
    cadence: phase.cadence === 'once' ? null : { recurring: phase.cadence.recurring, lastRun: 'not-recorded' },
  };
}

/**
 * The roles `who` stands for (`spec-017` §7.3, BDD P4.4 sc. 2): `me` — the members whose email is the git
 * identity's; otherwise the member whose name or email is `who`; otherwise the role named `who`. Emails
 * compare case-insensitively. An empty set keeps no step.
 */
export function assigneeRoles(dnaYaml: DnaYaml | null, who: string, identityEmail: string): Set<string> {
  const members = dnaYaml?.team?.members ?? [];
  const sameEmail = (a: string | undefined, b: string): boolean => a !== undefined && a !== '' && a.toLowerCase() === b.toLowerCase();
  const matched =
    who === ASSIGNED_TO_ME
      ? members.filter((member) => identityEmail !== '' && sameEmail(member.email, identityEmail))
      : members.filter((member) => member.name === who || sameEmail(member.email, who));
  if (matched.length > 0) return new Set(matched.flatMap((member) => member.roles));
  return who === ASSIGNED_TO_ME ? new Set() : new Set([who]);
}

/**
 * `workflow next`'s answer from one deduction (`spec-017` §7.3, §10). Pure. Exit `0` in every deduced
 * case — `no open workflows`; `no next step: workflow '<name>' is complete`; a filter that keeps nothing — and
 * `NOT_FOUND` `workflow is not open: <ref>` for a `ref` naming no open instance.
 */
export function nextWorkflow(inputs: NextInputs, deduction: Deduction, options: NextOptions): CoreResult<NextResult> {
  const { ref, assignedTo } = options;
  const base = { baseline: deduction.baseline, diagnostics: deduction.diagnostics };
  const selected = resolveInstanceRef(deduction, ref);
  if (selected === null) {
    if (ref !== undefined) return coreErr({ code: 'NOT_FOUND', message: `workflow is not open: ${ref}`, details: { ref } });
    return coreOk({ ...base, instance: null, complete: false, next: null, more: [], message: NO_OPEN_WORKFLOWS });
  }
  const { instance, complete, frontier } = selected;
  if (frontier.length === 0) {
    const message = complete
      ? noNextStepMessage(instance.workflow)
      : instance.abandoned
        ? `no next step: workflow '${instance.workflow}' is abandoned: its element ${instance.element!.type}:${instance.element!.id} is ${instance.element!.status}`
        : `no next step: workflow '${instance.workflow}' is not loaded`;
    return coreOk({ ...base, instance, complete, next: null, more: [], message });
  }
  const roles = assignedTo === undefined ? null : assigneeRoles(inputs.dnaYaml, assignedTo, options.identityEmail ?? '');
  const kept = roles === null ? frontier : frontier.filter((step) => step.role !== null && roles.has(step.role));
  if (kept.length === 0) {
    return coreOk({ ...base, instance, complete, next: null, more: [], message: `no next step of workflow '${instance.workflow}' is assigned to '${assignedTo}'` });
  }
  const steps = kept.map((step) => buildStep(step, inputs));
  return coreOk({ ...base, instance, complete, next: steps[0]!, more: steps.slice(1) });
}

/**
 * `workflow next [<ref>] [--assigned-to <who>]` at `HEAD` (`spec-017` §7.3): the deduction snapshot (with
 * `bindings.yaml` and `dna.yaml`), then `roles.yaml` and the directive files at the snapshot's commit — read
 * only when a step is reported — and, for `--assigned-to me`, the git identity.
 *
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error; a
 *   `ValidationError` for an invalid `roles.yaml` or directive file at `HEAD`; `StorageError` when git
 *   cannot answer.
 */
export function workflowNextAtHead(root: string, ref?: string, assignedTo?: string): CoreResult<NextResult> {
  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const hasSteps = deduction.instances.some((entry) => entry.frontier.length > 0);
  const inputs: NextInputs = {
    workflows: snapshot.workflows,
    memoryYaml: snapshot.memoryYaml,
    dnaYaml: snapshot.dnaYaml ?? null,
    bindings: snapshot.bindings ?? null,
    rolesYaml: hasSteps ? loadRolesYamlAtRev(root, snapshot.commit) : null,
    directiveFiles: hasSteps ? loadDirectivesAtRev(root, snapshot.commit) : [],
  };
  const identityEmail = assignedTo === ASSIGNED_TO_ME ? readGitIdentity(root).email : '';
  return nextWorkflow(inputs, deduction, { ...(ref === undefined ? {} : { ref }), ...(assignedTo === undefined ? {} : { assignedTo }), identityEmail });
}

// --- console --------------------------------------------------------------------------------------

/** One scope as `<type>:<id> (<status>)` or `<collection>#<key>`. */
function describeScope(scope: ScopeRef | null): string {
  if (scope === null) return '(none)';
  if ('item' in scope) return `${scope.item.collection}#${scope.item.key}`;
  return `${scope.element.type}:${scope.element.id} (${scope.element.status})`;
}

/** The "human needed" line of a step that awaits a decision (`spec-017` §5.3), or `null`. */
export function humanNeededLine(step: Step): string | null {
  const awaiting = step.awaiting;
  if (awaiting === null) return null;
  if (awaiting.kind === 'party') return `waiting for ${awaiting.party}: ${awaiting.evidence.token} (complete it with wingfoil workflow finalize)`;
  const action = awaiting.recordNeeded ? 'finalize' : 'approve or reject';
  const what = awaiting.elements.length > 0 ? awaiting.elements.map((element) => element.id).join(', ') : step.key;
  const routed = awaiting.routedTo.length > 0 ? awaiting.routedTo.map((member) => `${member.name} <${member.email}>`).join(', ') : (awaiting.routingError ?? 'nobody');
  return `human needed: ${action} ${what} — routed to ${routed}`;
}

/** The console lines of one step (`spec-017` §8: key, trail, role, scope, actions with bindings, directive ids, human needed). */
function stepLines(step: Step, heading: string): string[] {
  const lines = [`${heading}: ${step.key}`];
  lines.push(`  trail: ${step.trail.map((entry) => `${entry.workflow}.${entry.phase}`).join(' > ')}`);
  lines.push(`  scope: ${describeScope(step.scope)}`);
  const holders = step.members.map((member) => member.name).join(', ');
  lines.push(`  role: ${step.role ?? '(none)'}${step.agentRole ? ' (an agent role)' : ''}${holders === '' ? '' : ` — held by ${holders}`}`);
  lines.push(`  directives: ${step.directives.length === 0 ? '(none)' : step.directives.map((directive) => directive.id).join(', ')}`);
  if (step.actions.length > 0) lines.push('  actions:');
  for (const action of step.actions) {
    const { binding } = action;
    const detail = binding.argv !== undefined ? `: ${binding.argv.join(' ')}` : binding.expectedCommit !== undefined ? `: expects ${binding.expectedCommit.split('\n').join(' | ')}` : '';
    lines.push(`    - ${action.text} [${binding.kind}${detail}]`);
  }
  lines.push(`  evidence missing: ${step.evidence.missing.length === 0 ? '(none)' : step.evidence.missing.join(', ')}${step.evidence.finalizable ? ' (finalizable)' : ''}`);
  if (step.reentered) lines.push(`  re-entered after ${step.reentryCommit}`);
  const human = humanNeededLine(step);
  if (human !== null) lines.push(`  ${human}`);
  return lines;
}

/** `workflow next`'s `--format console` rendering (`spec-017` §8). Pure. */
export function renderNextConsole(result: NextResult): string {
  const lines: string[] = [];
  if (result.instance !== null) lines.push(`workflow: ${result.instance.workflow} (${result.instance.id})`);
  if (result.message !== undefined) lines.push(result.message);
  if (result.next !== null) lines.push(...stepLines(result.next, 'next step'));
  for (const step of result.more) lines.push(...stepLines(step, 'also ready'));
  if (result.diagnostics.length > 0) lines.push(`${result.diagnostics.length} diagnostic(s): --format json lists them`);
  return `${lines.join('\n')}\n`;
}
