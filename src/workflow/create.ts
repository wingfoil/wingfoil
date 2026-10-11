/**
 * The scaffold `wingfoil workflow create` writes (task-211, `spec-017` §7.7, P4.8). The Workflow pillar owns
 * what a new workflow file *contains*; `src/core`'s `workflowCreate` composes it with the identity pre-flight,
 * the uniqueness checks, the manifest edit and the commit. Pure (REQ-SYS-07): the same request always yields
 * byte-identical text.
 *
 * The file is the smallest one `spec-003` Layer 2 accepts: `name`, the startable/includable declaration as the
 * two booleans `dl-109` K1 (a) makes canonical (`--kind` maps onto them before this is called), the optional
 * `description` and `element`, `version: 1.0`, and one phase `step-1` (Layer 2 requires one; it has no role, so
 * it is a checkpoint until the author replaces it).
 */
import { WORKFLOW_NAME_RE } from './schema';

/** What `workflow create` writes, after `--kind` has been read as the two booleans. */
export interface NewWorkflow {
  readonly name: string;
  readonly startable: boolean;
  readonly includable: boolean;
  readonly element?: string;
  readonly description?: string;
}

/** The phase every created workflow starts with (`spec-017` §7.7). */
export const FIRST_PHASE_NAME = 'step-1';

/**
 * A YAML scalar for `value`: plain when it is a name of `spec-003`'s class (nothing YAML could read otherwise),
 * else double-quoted. JSON's string syntax is a subset of YAML's double-quoted scalar, so `JSON.stringify`
 * escapes quotes, backslashes and control characters the way the YAML reader undoes them.
 */
function scalar(value: string): string {
  return WORKFLOW_NAME_RE.test(value) ? value : JSON.stringify(value);
}

/** The text of `.wingfoil/workflows/custom/<name>.yaml` for `workflow`, keys in a fixed order. Pure. */
export function renderCustomWorkflow(workflow: NewWorkflow): string {
  const lines = [`name: ${workflow.name}`];
  if (workflow.startable) lines.push('startable: true');
  if (workflow.includable) lines.push('includable: true');
  if (workflow.description !== undefined) lines.push(`description: ${JSON.stringify(workflow.description)}`);
  if (workflow.element !== undefined) lines.push(`element: ${scalar(workflow.element)}`);
  lines.push('version: 1.0', 'phases:', `  - name: ${FIRST_PHASE_NAME}`);
  return `${lines.join('\n')}\n`;
}
