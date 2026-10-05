/**
 * The Workflow pillar's **loader** checks (spec-003-workflows-yaml-schema § "Diagnostics", rows whose
 * "Runs in" is `loader`; task-136): the checks that need the loaded workflow files and nothing from
 * another pillar, run by `loadWorkflowsYaml` (`./loaders.ts`) as caller-supplied semantic checks
 * (spec-009-validation-strategy §1). Every check here reads only the files `workflows.yaml` lists, so
 * the loader keeps its pillar isolation (REQ-SYS-02).
 *
 * The output is one ordered array (REQ-SYS-07): within a file, workflow-level before phase-level,
 * phases in declared order, and per phase the table's rows in table order. The manifest's own
 * diagnostics and the order of files are the loader's ({@link workflowFileDiagnostics} is called once
 * per file, in `include` order).
 */
import type { Diagnostic } from '../validation';
import { INDEPENDENT_ROLES, RESERVED_PHASE_NAMES, Workflow, WORKFLOW_NAME_RE, workflowFacts } from '../workflow/schema';

/** One included file as the loader saw it, in manifest `include` order. */
export interface LoadedWorkflowFile {
  /** The manifest `include` entry, relative to `.wingfoil/` — the diagnostics' `file`. */
  readonly file: string;
  /** The validated workflow, or `null` when the file failed its structural pass. */
  readonly workflow: Workflow | null;
  /** The raw `name`, when it is a string — kept for a structurally invalid file too. */
  readonly rawName: string | null;
}

/** The registry the cross-file checks resolve names against, built once from every loaded file. */
export interface WorkflowRegistryIndex {
  /** Name → index (into the loaded files) of the **first** file declaring it. */
  readonly byName: ReadonlyMap<string, number>;
  /**
   * `false` when some included file is missing or carries no readable `name`: a phase `include` may
   * then name a workflow the loader could not see, so neither `E_WORKFLOW_INCLUDE_UNRESOLVED` nor
   * `E_NO_MAIN_WORKFLOW` is decidable and neither is reported (the root error is).
   */
  readonly namesComplete: boolean;
}

/** A collection reference (`dna:<path>`, `bindings:<name>`) rather than a Memory type (spec-003 § "Collections"). */
const COLLECTION_REF_RE = /^(dna|bindings):/;

/** A value that reads as a file path rather than a workflow name — the `bug-144` shape. */
function looksLikePath(value: string): boolean {
  return value.includes('/') || /\.ya?ml$/.test(value);
}

function error(file: string, path: string, code: string, message: string): Diagnostic {
  return { code, severity: 'error', file, path, message };
}

/** Index the loaded files by name; `missing` counts manifest entries whose file does not exist. */
export function indexWorkflowFiles(files: readonly LoadedWorkflowFile[], missing: number): WorkflowRegistryIndex {
  const byName = new Map<string, number>();
  let namesComplete = missing === 0;
  files.forEach((loaded, index) => {
    if (loaded.rawName === null) {
      namesComplete = false;
      return;
    }
    if (!byName.has(loaded.rawName)) byName.set(loaded.rawName, index);
  });
  return { byName, namesComplete };
}

/**
 * The include target of `phaseInclude` as a loaded, structurally valid workflow's file index, or
 * `null` when it does not resolve to one.
 */
function resolveInclude(
  files: readonly LoadedWorkflowFile[],
  index: WorkflowRegistryIndex,
  phaseInclude: string,
): number | null {
  const target = index.byName.get(phaseInclude);
  if (target === undefined || files[target]?.workflow === null) return null;
  return target;
}

/**
 * The include edges of file `i`, in phase order, as target file indices. `i` is always a structurally
 * valid workflow: the search starts from one, and {@link resolveInclude} only ever yields valid ones.
 */
function includeEdges(files: readonly LoadedWorkflowFile[], index: WorkflowRegistryIndex, i: number): number[] {
  const workflow = files[i]!.workflow!;
  const edges: number[] = [];
  for (const phase of workflow.phases) {
    if (phase.include === undefined) continue;
    const target = resolveInclude(files, index, phase.include);
    if (target !== null) edges.push(target);
  }
  return edges;
}

/**
 * The shortest include path from `from` back to `to` (breadth-first, neighbours in phase order, so
 * the answer is deterministic), as file indices `[from, …, to]`, or `null` if `to` is unreachable.
 */
function shortestIncludePath(
  files: readonly LoadedWorkflowFile[],
  index: WorkflowRegistryIndex,
  from: number,
  to: number,
): number[] | null {
  if (from === to) return [from];
  const parent = new Map<number, number>([[from, from]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of includeEdges(files, index, current)) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      if (next === to) {
        const path = [to];
        let step = current;
        while (step !== from) {
          path.unshift(step);
          step = parent.get(step)!;
        }
        path.unshift(from);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** `E_WORKFLOW_ELEMENT_MISMATCH`'s message, or `null` when the include binds the element legally. */
function elementMismatch(including: Workflow, phase: Workflow['phases'][number], included: Workflow): string | null {
  const element = included.element;
  const over = phase.iterate_over;
  if (element === undefined) return null;
  if (over !== undefined && COLLECTION_REF_RE.test(over)) {
    return `workflow '${included.name}' declares element '${element}' and cannot be iterated over collection '${over}'`;
  }
  if (over !== undefined) {
    return over === element ? null : `workflow '${included.name}' declares element '${element}', but this phase iterates over '${over}'`;
  }
  if (including.element === element) return null;
  return `workflow '${included.name}' declares element '${element}', but this phase neither iterates over '${element}' nor runs in a workflow bound to '${element}'`;
}

// ---- task-185: executor attributes (spec-003 § "Execution independence") ---------------------------
/**
 * The executor rows of spec-003 § "Diagnostics" for one phase, in table order:
 * `E_PHASE_DISTINCT_FROM_UNKNOWN` and `E_PHASE_DISTINCT_FROM_SELF` (`dl-134` §4),
 * `E_PHASE_MODE_NOT_INDEPENDENT` (`dl-135` point 3) and `E_PHASE_EXECUTOR_WITHOUT_ROLE` (spec-003
 * open question 4). Every rule reads the raw declaration: the schema gives `mode` no default, so an
 * absent `mode` is never a declared one. Validation only — no v0.3 command enforces `distinct_from`
 * at run time (P4.12, v1.0).
 */
function executorDiagnostics(
  file: string,
  phase: Workflow['phases'][number],
  p: number,
  phaseNames: ReadonlySet<string>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const at = (field: string): string => `phases[${p}].${field}`;
  const distinct = phase.distinct_from ?? [];
  distinct.forEach((target, k) => {
    if (!phaseNames.has(target)) {
      out.push(
        error(file, at(`distinct_from[${k}]`), 'E_PHASE_DISTINCT_FROM_UNKNOWN', `distinct_from phase '${target}' not found in workflow`),
      );
    }
  });
  distinct.forEach((target, k) => {
    if (target === phase.name) {
      out.push(error(file, at(`distinct_from[${k}]`), 'E_PHASE_DISTINCT_FROM_SELF', `phase '${phase.name}' names itself in distinct_from`));
    }
  });
  if (phase.role !== undefined && INDEPENDENT_ROLES.includes(phase.role) && phase.mode !== undefined && phase.mode !== 'fresh') {
    out.push(
      error(
        file,
        at('mode'),
        'E_PHASE_MODE_NOT_INDEPENDENT',
        `phase '${phase.name}' has role '${phase.role}' and must run fresh (mode '${phase.mode}' is not allowed)`,
      ),
    );
  }
  if (phase.role === undefined) {
    for (const field of ['mode', 'distinct_from'] as const) {
      if (phase[field] === undefined) continue;
      out.push(
        error(file, at(field), 'E_PHASE_EXECUTOR_WITHOUT_ROLE', `phase '${phase.name}' declares ${field} but has no role (it has no executor)`),
      );
    }
  }
  return out;
}
// ---- end task-185 -----------------------------------------------------------------------------------

/**
 * Every loader diagnostic of file `i` (spec-003 § "Diagnostics"), in spec-003's order. A file that
 * failed its structural pass contributes nothing here — its structural diagnostics are the loader's.
 */
export function workflowFileDiagnostics(
  files: readonly LoadedWorkflowFile[],
  index: WorkflowRegistryIndex,
  i: number,
): Diagnostic[] {
  const { file, workflow } = files[i]!;
  if (!workflow) return [];
  const out: Diagnostic[] = [];
  const name = workflow.name;

  // Workflow level, table order.
  if (!WORKFLOW_NAME_RE.test(name)) {
    out.push(error(file, 'name', 'E_WORKFLOW_NAME_INVALID', `invalid workflow name '${name}' (allowed: [a-z][a-z0-9-]*)`));
  }
  const first = index.byName.get(name);
  if (first !== undefined && first !== i) {
    out.push(
      error(file, 'name', 'E_WORKFLOW_DUPLICATE_NAME', `duplicate workflow name '${name}' (already declared in ${files[first]!.file})`),
    );
  }
  const declaresBoolean = workflow.startable !== undefined || workflow.includable !== undefined;
  if (workflow.kind !== undefined && declaresBoolean) {
    out.push(
      error(file, 'kind', 'E_WORKFLOW_KIND_CONFLICT', `workflow '${name}' declares kind together with startable/includable (declare one or the other)`),
    );
  } else if (workflow.kind === undefined && workflow.startable !== true && workflow.includable !== true) {
    out.push(
      error(
        file,
        'startable',
        'E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE',
        `workflow '${name}' is neither startable nor includable (set startable: true or includable: true)`,
      ),
    );
  }

  // Phase level: phases in declared order, rows in table order.
  const phaseNames = new Set(workflow.phases.map((phase) => phase.name));
  const seen = new Set<string>();
  workflow.phases.forEach((phase, p) => {
    const at = (field: string): string => `phases[${p}].${field}`;
    if (!WORKFLOW_NAME_RE.test(phase.name)) {
      out.push(error(file, at('name'), 'E_PHASE_NAME_INVALID', `invalid phase name '${phase.name}' (allowed: [a-z][a-z0-9-]*)`));
    }
    if (RESERVED_PHASE_NAMES.includes(phase.name)) {
      out.push(error(file, at('name'), 'E_PHASE_NAME_RESERVED', `phase name '${phase.name}' is reserved (a run without a step)`));
    }
    if (seen.has(phase.name)) {
      out.push(error(file, at('name'), 'E_PHASE_DUPLICATE_NAME', `duplicate phase name '${phase.name}' in workflow '${name}'`));
    }
    seen.add(phase.name);

    if (phase.include !== undefined) {
      const target = index.byName.get(phase.include);
      if (target === undefined) {
        if (index.namesComplete) {
          const hint = looksLikePath(phase.include) ? ' (a phase include is a workflow name, not a file path)' : '';
          out.push(
            error(file, at('include'), 'E_WORKFLOW_INCLUDE_UNRESOLVED', `include '${phase.include}' names no loaded workflow${hint}`),
          );
        }
      } else {
        const included = files[target]!.workflow;
        if (included) {
          if (!workflowFacts(included).includable) {
            out.push(error(file, at('include'), 'E_WORKFLOW_NOT_INCLUDABLE', `workflow '${included.name}' is not includable`));
          }
          const mismatch = elementMismatch(workflow, phase, included);
          if (mismatch !== null) out.push(error(file, at('include'), 'E_WORKFLOW_ELEMENT_MISMATCH', mismatch));
          // A cycle is reported once, at the phase of its lowest-indexed member that closes it.
          const cycle = shortestIncludePath(files, index, target, i);
          if (cycle !== null && cycle.every((member) => member >= i)) {
            const names = [i, ...cycle].map((member) => files[member]!.workflow!.name);
            out.push(error(file, at('include'), 'E_WORKFLOW_INCLUDE_CYCLE', `include cycle: ${names.join(' -> ')}`));
          }
        }
      }
    }

    if (phase.fallback !== undefined && !phaseNames.has(phase.fallback.step)) {
      out.push(
        error(file, at('fallback.step'), 'E_PHASE_FALLBACK_STEP_UNKNOWN', `fallback step '${phase.fallback.step}' not found in workflow`),
      );
    }

    out.push(...executorDiagnostics(file, phase, p, phaseNames));
  });

  return out;
}

/**
 * `E_NO_MAIN_WORKFLOW` (spec-003 Layer 1; `dl-109` Action 1): a present manifest whose loaded files
 * hold no startable workflow. Not decided while some file is missing or unreadable (see
 * {@link WorkflowRegistryIndex.namesComplete}) or failed its structural pass.
 */
export function noStartableDiagnostic(files: readonly LoadedWorkflowFile[], index: WorkflowRegistryIndex): Diagnostic | null {
  if (!index.namesComplete || files.some((loaded) => loaded.workflow === null)) return null;
  if (files.some((loaded) => workflowFacts(loaded.workflow!).startable)) return null;
  return error(
    'workflows.yaml',
    'include',
    'E_NO_MAIN_WORKFLOW',
    'no startable workflow: at least one included workflow must be startable (startable: true or kind: main)',
  );
}
