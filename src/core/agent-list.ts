/**
 * `wingfoil agent list [--past] [--waiting] [--element <type>:<id>] [--phase <name>]` (task-240,
 * `spec-016` §5; P5.3.4): the recorded agent runs, and the workflow steps waiting for an agent.
 *
 * **Two sources, one baseline** (`dl-135` point 1; `spec-016` §5.1, approver ruling R15; `spec-006` §6
 * item 6):
 * - **past** = the run log (task-206's `src/agent/run-log.ts`, read strictly, §4.5) at `HEAD`;
 * - **waiting** = every frontier step of every open instance whose role an agent executes (`Step.agentRole`,
 *   `spec-017` §6.3), in `spec-017` §1.3's frontier order — the steps `workflow status` reports
 *   (`StatusResult.open[].frontier`), built by the same `readNextInputs` + `buildStep` (task-225).
 *
 * When the waiting section is selected, the deduction snapshot is read first and its commit is the one the
 * run logs are read at too, so both sections answer from the one `HEAD` the payload's `baseline` names.
 * The working tree only explains: a run log that differs from `HEAD` is a `W_UNCOMMITTED_INPUTS` diagnostic
 * (`spec-017` §1.2), one per dirty path — the deduction's own when it runs, this module's (through the same
 * builder) when `--past` alone runs none.
 *
 * v0.3 limit (§5): with no active registry, a step an agent is running on right now is still listed as
 * waiting; `--active` is v0.4 and refused as an unknown option.
 */
import { readRunLogsAt, type RunRecord } from '../agent/run-log';
import type { DnaYaml } from '../dna/schema';
import { DiagnosticsError, ValidationError, type Diagnostic } from '../validation';
import { deduceWorkflowState, uncommittedInputDiagnostic, type Baseline } from '../workflow/deduce';
import type { PhaseMode } from '../workflow/schema';
import { parseElementRef } from './element-ref';
import { requireInitializedProject } from './init';
import { DNA_YAML_PATH, loadDnaYamlAtRev } from './loaders';
import type { CoreFn } from './registry';
import { resolveRevision, RevisionError } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';
import { UsageError } from './usage-error';
import { readDeductionSnapshotAtHead, readDirtyPaths } from './workflow-deduction';
import { buildStep, readNextInputs } from './workflow-next';

/** The warning of a project whose `dna.yaml` declares no run log (§5: not an error for `list`). */
export const NO_RUN_LOG_WARNING = 'dna.yaml declares no run log (paths.runs)';

/** `agent list` params: the two section flags, and the two filters as value options (`spec-008` §12). */
export interface AgentListParams {
  readonly root: string;
  readonly past?: boolean;
  readonly waiting?: boolean;
  readonly options?: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** One step waiting for an agent (`spec-016` §5's `waiting[]` item). */
export interface WaitingStep {
  /** The open instance the step belongs to. */
  readonly instance: string;
  /** The step key (`spec-017` §4.9). */
  readonly key: string;
  readonly workflow: string;
  readonly phase: string;
  /** `<type>:<id>`: the step's scope element, else its instance's bound element; `null` when it has neither. */
  readonly element: string | null;
  readonly role: string;
  readonly allowedModes: readonly PhaseMode[];
  /** The `team.agents[]` names, in DNA order, that execute the role and declare an adapter. */
  readonly agents: readonly string[];
}

/**
 * `agent list`'s payload (`spec-016` §5): `baseline` and `diagnostics` always, and only the selected source
 * keys, in that order.
 */
export interface AgentListResult {
  readonly baseline: Baseline;
  readonly past?: readonly RunRecord[];
  readonly waiting?: readonly WaitingStep[];
  readonly diagnostics: readonly Diagnostic[];
}

/** A single option value: the last occurrence, as Commander gives a non-repeatable option. */
function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[value.length - 1];
}

/** A diagnostic as the console's `warning:` line: `<code> (<file>): <message>` (`spec-008` §6's form). */
export function diagnosticWarning(diagnostic: Diagnostic): string {
  return diagnostic.file === undefined || diagnostic.file === '' ? `${diagnostic.code}: ${diagnostic.message}` : `${diagnostic.code} (${diagnostic.file}): ${diagnostic.message}`;
}

/** The agents of `dna.yaml`, in declared order, that execute `role` and declare an adapter (§5). */
function agentsFor(dnaYaml: DnaYaml | null, role: string): string[] {
  return (dnaYaml?.team?.agents ?? []).filter((agent) => agent.adapter !== undefined && agent.executes_as.includes(role)).map((agent) => agent.name);
}

/** The run log directory `dna.yaml` declares, or `undefined` for none (absent, empty, or blank). */
function runLogDir(dnaYaml: DnaYaml | null): string | undefined {
  const dir = (dnaYaml?.paths as Record<string, readonly string[] | undefined> | undefined)?.['runs']?.[0];
  return dir === undefined || dir.trim() === '' ? undefined : dir;
}

/** What the request selects, parsed before the project is read. */
interface Selection {
  readonly past: boolean;
  readonly waiting: boolean;
  readonly element?: string;
  readonly phase?: string;
}

/** The waiting section from one deduction (§5): agent-role frontier steps, filtered, in frontier order. */
function waitingSteps(root: string, snapshot: ReturnType<typeof readDeductionSnapshotAtHead>, deduction: ReturnType<typeof deduceWorkflowState>, selection: Selection): WaitingStep[] {
  const inputs = readNextInputs(root, snapshot, deduction);
  const steps: WaitingStep[] = [];
  for (const entry of deduction.instances) {
    for (const deduced of entry.frontier) {
      const step = buildStep(deduced, inputs);
      if (!step.agentRole) continue;
      // `spec-016` §3.2 step 2 (task-235's `stepTargetElement`): the scope element, else the bound element.
      const target = step.scope !== null && 'element' in step.scope ? step.scope.element : entry.instance.element;
      const element = target === null ? null : `${target.type}:${target.id}`;
      if (selection.element !== undefined && element !== selection.element) continue;
      if (selection.phase !== undefined && step.phase !== selection.phase) continue;
      const role = step.role!; // an agent role is a role: `agentRole` is false for a step with none
      steps.push({ instance: step.instance, key: step.key, workflow: step.workflow, phase: step.phase, element, role, allowedModes: step.allowedModes, agents: agentsFor(inputs.dnaYaml, role) });
    }
  }
  return steps;
}

/**
 * `agent list` at `HEAD` (`spec-016` §5, §5.1).
 *
 * @returns the payload and its success warnings (each diagnostic, and the missing-run-log warning); a §4.5
 *   violation of a committed run log is `VALIDATION` (exit `1`); `dna.yaml` not committed when the past
 *   section is selected is `NOT_FOUND`, as `agent show`.
 * @throws `DiagnosticsError` / `ValidationError` from the deduction (mapped by {@link agentListFn}).
 */
export function agentListAtHead(root: string, selection: Selection): CoreResult<AgentListResult> {
  let commit: string;
  let dnaYaml: DnaYaml | null;
  let waiting: WaitingStep[] | undefined;
  const diagnostics: Diagnostic[] = [];

  if (selection.waiting) {
    const snapshot = readDeductionSnapshotAtHead(root);
    if (snapshot.commit === '') resolveRevision(root, 'HEAD'); // no commit: the RevisionError agent show gives
    const deduction = deduceWorkflowState(snapshot);
    commit = snapshot.commit;
    dnaYaml = snapshot.dnaYaml ?? null;
    waiting = waitingSteps(root, snapshot, deduction, selection);
    diagnostics.push(...deduction.diagnostics);
  } else {
    commit = resolveRevision(root, 'HEAD');
    dnaYaml = loadDnaYamlAtRev(root, commit);
  }

  let past: RunRecord[] | undefined;
  const warnings: string[] = [];
  if (selection.past) {
    if (dnaYaml === null) {
      return coreErr({ code: 'NOT_FOUND', message: `${DNA_YAML_PATH} is not committed at HEAD, which agent list reads: commit it first` });
    }
    const dir = runLogDir(dnaYaml);
    if (dir === undefined) {
      past = [];
      warnings.push(NO_RUN_LOG_WARNING);
    } else {
      const records = readRunLogsAt(root, commit, dir);
      if (!records.ok) return records;
      past = records.value.filter(
        (record) => (selection.element === undefined || record.element === selection.element) && (selection.phase === undefined || record.phase === selection.phase),
      );
      // §5: with no deduction, `agent list` emits the deduction's code itself, once per dirty path.
      if (!selection.waiting) diagnostics.push(...readDirtyPaths(root, [dir]).map(uncommittedInputDiagnostic));
    }
  }

  return coreOk(
    {
      baseline: { rev: 'HEAD', commit },
      ...(past === undefined ? {} : { past }),
      ...(waiting === undefined ? {} : { waiting }),
      diagnostics,
    },
    undefined,
    [...warnings, ...diagnostics.map(diagnosticWarning)],
  );
}

/**
 * `agent list` `CoreOperation.fn` (`mutates: false`; `spec-006` §3, `spec-016` §8).
 *
 * 1. The selection: `--past`, `--waiting`; neither or both select both sections. A malformed `--element`
 *    (`spec-008` §7) is a usage error (exit `2`), refused before the project is read.
 * 2. {@link agentListAtHead}; a `spec-003` error in the registry at `HEAD` is `VALIDATION` with every
 *    diagnostic in `details`, an invalid committed file `VALIDATION` with its issues, as `workflow status`.
 */
export const agentListFn: CoreFn<unknown, AgentListResult> = async (params) => {
  const { root, past, waiting, options } = params as AgentListParams;
  const elementOption = single(options?.element);
  const phase = single(options?.phase);
  if (elementOption !== undefined) {
    const parsed = parseElementRef(elementOption);
    if (!parsed.ok) throw new UsageError(parsed.error.message);
  }
  const both = past !== true && waiting !== true;
  const selection: Selection = {
    past: both || past === true,
    waiting: both || waiting === true,
    ...(elementOption === undefined ? {} : { element: elementOption }),
    ...(phase === undefined ? {} : { phase }),
  };

  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  try {
    return agentListAtHead(root, selection);
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    if (error instanceof DiagnosticsError) return coreErr({ code: 'VALIDATION', message: error.message, details: { diagnostics: error.diagnostics } });
    if (error instanceof ValidationError) return coreErr({ code: 'VALIDATION', message: error.message, details: { issues: error.issues } });
    throw error;
  }
};

// --- console --------------------------------------------------------------------------------------

/** `<duration>`: seconds with one decimal, as `agent execute`'s run summary prints it (`0.5s`). */
function duration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** `<tokens>`: `in/out`, or `not-reported` when the agent reported neither (§5). */
function tokens(record: RunRecord): string {
  const { input, output } = record.tokens;
  return input === 'not-reported' && output === 'not-reported' ? 'not-reported' : `${input}/${output}`;
}

/**
 * `agent list`'s `--format console` (`spec-016` §5): one section per selected source, past first — a
 * heading with the count, then one line per item, or `no past runs` / `no waiting steps` for an empty one.
 * Diagnostics are not here: they print on stderr as `warning:` lines (the success warnings).
 */
export function renderAgentListConsole(value: unknown): string {
  const { past, waiting } = value as AgentListResult;
  const lines: string[] = [];
  if (past !== undefined) {
    if (past.length === 0) lines.push('no past runs');
    else lines.push(`past runs: ${past.length}`, ...past.map((record) => [record.id, record.role, record.agent, String(record.exit_status), duration(record.duration_ms), tokens(record)].join('  ')));
  }
  if (waiting !== undefined) {
    if (waiting.length === 0) lines.push('no waiting steps');
    else lines.push(`waiting steps: ${waiting.length}`, ...waiting.map((step) => [step.key, step.role, step.agents.length === 0 ? 'none' : step.agents.join(', ')].join('  ')));
  }
  return `${lines.join('\n')}\n`;
}
