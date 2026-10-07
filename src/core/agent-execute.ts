/**
 * `wingfoil agent execute` `CoreOperation.fn` (task-218, `spec-016` §3; P5.3.1, P5.3.2, P5.4.2–P5.4.4):
 * the stepless form, `--element <type>:<id>` with an optional `--role` and `--agent`. It parses the
 * request (§3.3 step 1) and runs `src/agent/execute.ts`'s pipeline up to the spawn (steps 2–12).
 *
 * **What follows the pipeline in this build.** The launch (steps 13–18) is task-228's. Until it lands:
 * - under `--dry-run` (`spec-008` §2) the command prints the launch it would make — the record commit's
 *   subject and run-log path, the run's fields known before the spawn, and the §2.4 bootstrap — and
 *   exits `0`, having written nothing;
 * - otherwise it refuses, exit `1`, once every pre-launch check has passed, naming the run id.
 *
 * The step forms (`--next`, `--workflow`, `--step`) are task-235's: until then they are not registered,
 * so Commander refuses them as unknown options (exit `2`), as it refuses v0.4's `--resume` and `--ref`.
 */
import { agentExecutePipeline, launchPlan, type AgentLaunchPlan } from '../agent/execute';
import { isDryRunActive } from '../storage';
import { parseElementRef } from './element-ref';
import { requireInitializedProject } from './init';
import type { CoreFn } from './registry';
import { coreErr, coreOk } from './types';
import { UsageError } from './usage-error';

/** `agent execute` params: the value options (`spec-008` §1) ride `options`. */
export interface AgentExecuteParams {
  readonly root: string;
  readonly options?: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** §3.1: none of `--next`, `--workflow`, `--step`, `--element` → exit `2` with this reason. */
export const AGENT_EXECUTE_MISSING_TARGET = 'missing required argument: --next or --element';

/** A single option value: the last occurrence, as Commander gives a non-repeatable option. */
function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[value.length - 1];
}

/**
 * Parse, check the project is initialized, run the pipeline, then plan (dry run) or stop before the
 * spawn. A usage error (no target, a malformed element-ref, `spec-008` §7) is thrown as `UsageError`
 * before the project is read.
 */
export const agentExecuteFn: CoreFn<unknown, AgentLaunchPlan> = async (params) => {
  const { root, options } = params as AgentExecuteParams;
  const elementOption = single(options?.element);
  if (elementOption === undefined) throw new UsageError(AGENT_EXECUTE_MISSING_TARGET);
  const element = parseElementRef(elementOption);
  if (!element.ok) throw new UsageError(element.error.message);

  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const dryRun = isDryRunActive();
  return agentExecutePipeline(root, { element: element.value, role: single(options?.role), agent: single(options?.agent) }, {}, async (prepared) =>
    dryRun
      ? coreOk(launchPlan(prepared))
      : coreErr({
          code: 'IO',
          message: `agent execute cannot launch an agent yet: run ${prepared.runId} passed every pre-launch check (spec-016 §3.3 steps 1-12)`,
          hint: 'run it with --dry-run to see the launch it would make',
        }),
  );
};
