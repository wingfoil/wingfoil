/**
 * `workflow adopt --plan`'s walk (task-294; `spec-017` §7.11 `--plan`, `dl-187` rule 6; design D1, D3 as ruled at
 * the design gate, 2026-10-24). Pure: a function of one {@link DeductionSnapshot}, never mutated.
 *
 * - **Recorded first** (D3): the instance's adoptions that own their element — not orphaned, not in a conflict —
 *   oldest first, `recorded: true`, the element as the one candidate. Re-running `--plan --apply` lists them and
 *   writes nothing.
 * - **Then the walk.** From the instance's frontier, every step **blocked on a creation** is listed with its
 *   candidates (`DeducedStep.additions`): its phase adds a type it created none of, and adopting a candidate (its
 *   first, simulated) empties its missing evidence other than `record` — "what an adoption alone completes" (design
 *   D1 as re-ruled for `--plan`, 2026-10-25), which a `produces` path naming the created element (`{id}`) meets; a
 *   step with no candidate is listed when `created` is its only declared evidence besides `record` (D1 as first
 *   ruled). A step with exactly one candidate counts as adopted — a **simulated adoption** appended to a copy of the
 *   instance's history under a synthetic commit that descends from every commit of the walk — and the instance is
 *   deduced again after each one (review finding 2), so two frontier steps sharing a candidate never both get it. A
 *   step with zero or several candidates is listed and adopts nothing; a gate, a `state` or a `record` step is not
 *   blocked on a creation, so the walk stops there (an adoption proves creation only, rule 4).
 *
 * Steps are listed once each, in the order the walk meets them (frontier order within one deduction). The orphans
 * and the `ElementRef`s of the core's payload are the core's (`src/core/workflow-adopt.ts`).
 */
import { deduceWorkflowState, resolveInstanceRef, type DeducedStep, type DeductionSnapshot, type ElementRef, type InstanceHistory, type StepAddition } from './deduce';
import { resolveProvenance, type AdoptionRecord } from './provenance';

/** One entry of the plan (`spec-017` §8 `AdoptPlanResult.steps`). */
export interface PlannedStep {
  readonly step: string;
  readonly type: string;
  readonly candidates: readonly ElementRef[];
  /** `true`: an adoption of the instance already records this pair (D3); `false`: proposed. */
  readonly recorded: boolean;
}

/** What {@link planAdoptions} yields. */
export interface AdoptionPlan {
  readonly instance: string;
  readonly steps: readonly PlannedStep[];
}

/** The prefix of the synthetic commits of simulated adoptions: no git object name starts with it. */
const SIMULATED = 'simulated-adoption-';

/** Design D1 as first ruled, for a step with no candidate to simulate: `created` is its only declared evidence besides `record`. */
function onlyCreatedEvidence(step: DeducedStep): boolean {
  const kinds = step.evidence.kinds.filter((kind) => kind !== 'record');
  return kinds.length === 1 && kinds[0] === 'created' && step.evidence.missing.length === 1 && step.evidence.missing[0] === 'record';
}

/** Whether `candidate`, a frontier step of a later deduction, is `step` again: its workflow and phase, and its key when scoped. */
function sameStep(candidate: DeducedStep, step: DeducedStep): boolean {
  return candidate.workflow === step.workflow && candidate.phase === step.phase && (step.scope === null || candidate.key === step.key);
}

/** `snapshot` with `adoption` appended, newest, to the history of the walk started at `startCommit`. A copy. */
function withAdoption(snapshot: DeductionSnapshot, startCommit: string, adoption: AdoptionRecord, parent: string): DeductionSnapshot {
  const history = new Map(snapshot.history);
  const before: InstanceHistory = history.get(startCommit) ?? { records: [], links: [], reentries: [] };
  history.set(startCommit, { ...before, adoptions: [adoption, ...(before.adoptions ?? [])] });
  const parents = new Map(snapshot.parents);
  parents.set(adoption.commit, [parent]);
  return { ...snapshot, history, parents };
}

/**
 * The adoption plan of the open instance `instanceId` at the snapshot's commit (see the module comment). An
 * instance that is not open, or has an empty frontier, has no step to propose.
 */
export function planAdoptions(snapshot: DeductionSnapshot, instanceId: string): AdoptionPlan {
  const deduction = deduceWorkflowState(snapshot);
  const selected = resolveInstanceRef(deduction, instanceId);
  if (selected === null) return { instance: instanceId, steps: [] };
  const { startCommit } = selected.instance;

  const statusOf = new Map<string, ElementRef>();
  for (const entry of deduction.instances) for (const ref of entry.instance.created) statusOf.set(`${ref.type}:${ref.id}`, ref);
  const provenance = resolveProvenance(
    snapshot,
    deduction.instances.map((entry) => ({ id: entry.instance.id, startCommit: entry.instance.startCommit })),
  );
  const recorded: PlannedStep[] = [...provenance.owners.values()]
    .filter((claim) => claim.kind === 'adoption' && claim.instance === instanceId && statusOf.has(`${claim.type}:${claim.id}`))
    .sort((a, b) => b.position - a.position)
    .map((claim) => ({ step: claim.step, type: claim.type, candidates: [statusOf.get(`${claim.type}:${claim.id}`)!], recorded: true }));

  const steps: PlannedStep[] = [];
  const listed = new Set<string>();
  let current = snapshot;
  let tip = snapshot.commit;
  /** `snap` with `element` adopted into `step`, newest, under the synthetic commit `n`. */
  const adopting = (snap: DeductionSnapshot, step: DeducedStep, element: ElementRef, n: number, parent: string): DeductionSnapshot =>
    withAdoption(snap, startCommit, { commit: `${SIMULATED}${n}`, position: -n, instance: instanceId, step: step.key, type: element.type, id: element.id }, parent);
  const frontierOf = (snap: DeductionSnapshot): readonly DeducedStep[] =>
    // Simulated adoptions add no plan: the instance is still open in the copy.
    resolveInstanceRef(deduceWorkflowState(snap), instanceId)!.frontier;
  /**
   * Whether `step` is blocked on a creation (design D1 as re-ruled for `--plan`, 2026-10-25): adopting a candidate
   * (its first, in id order) empties its missing evidence other than `record` — the step leaves the frontier, or
   * stays with nothing but a `record` missing. With no candidate to simulate, D1 as first ruled decides.
   */
  const blocked = (step: DeducedStep, lacking: readonly StepAddition[]): boolean => {
    const probe = lacking.find((addition) => addition.candidates.length > 0);
    if (probe === undefined) return onlyCreatedEvidence(step);
    const after = frontierOf(adopting(current, step, probe.candidates[0]!, steps.length + 1, tip)).find((candidate) => sameStep(candidate, step));
    return after === undefined || after.evidence.missing.every((kind) => kind === 'record');
  };
  // One simulated adoption per deduction (review finding 2): after each, the instance is deduced again, so two
  // frontier steps sharing one candidate never both get it.
  walk: for (;;) {
    for (const step of frontierOf(current)) {
      if (listed.has(step.key)) continue;
      listed.add(step.key);
      const lacking = step.additions.filter((addition) => addition.created.length === 0);
      if (lacking.length === 0 || !blocked(step, lacking)) continue;
      let adopted = false;
      for (const addition of lacking) {
        steps.push({ step: step.key, type: addition.type, candidates: addition.candidates, recorded: false });
        if (adopted || addition.candidates.length !== 1) continue;
        current = adopting(current, step, addition.candidates[0]!, steps.length, tip);
        tip = `${SIMULATED}${steps.length}`;
        adopted = true;
      }
      if (adopted) continue walk;
    }
    break;
  }
  return { instance: instanceId, steps: [...recorded, ...steps] };
}
