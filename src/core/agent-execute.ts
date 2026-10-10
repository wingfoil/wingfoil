/**
 * `wingfoil agent execute` `CoreOperation.fn` (task-218, task-228, `spec-016` §3; P5.3.1, P5.3.2,
 * P5.4.2–P5.4.4): the stepless form, `--element <type>:<id>` with an optional `--role` and `--agent`. It
 * parses the request (§3.3 step 1), runs `src/agent/execute.ts`'s pipeline up to the spawn (steps 2–12),
 * and then:
 * - under `--dry-run` (`spec-008` §2) returns the launch it would make — the record commit's subject and
 *   run-log path, the run's fields known before the spawn, and the §2.4 bootstrap — having written
 *   nothing;
 * - otherwise launches the agent (`src/agent/launch.ts`, steps 13–18) and returns the recorded run,
 *   which the CLI prints on stderr only ({@link renderAgentExecuteStderr}, §3.4).
 *
 * The step forms (`--next`, `--workflow`, `--step`) are task-235's: until then they are not registered,
 * so Commander refuses them as unknown options (exit `2`), as it refuses v0.4's `--resume` and `--ref`.
 */
import { agentExecutePipeline, launchPlan, type AgentExecuteHost, type AgentLaunchPlan } from '../agent/execute';
import { launchAgent, runSummaryLine, type RecordedLaunch } from '../agent/launch';
import { isDryRunActive } from '../storage';
import { parseElementRef } from './element-ref';
import { requireInitializedProject } from './init';
import type { CoreFn, StderrReport } from './registry';
import { coreOk } from './types';
import { UsageError } from './usage-error';

/** `agent execute` params: the value options (`spec-008` §1) ride `options`. */
export interface AgentExecuteParams {
  readonly root: string;
  readonly options?: Readonly<Record<string, string | readonly string[] | undefined>>;
  /**
   * The host facts the pipeline reads (the MCP server to pre-flight, the terminal test, `PATH`), for an
   * in-process caller only: no surface builds it from user input, so the CLI always runs with the
   * process's own (`src/cli.ts`'s `buildParams` sets no such key).
   */
  readonly host?: AgentExecuteHost;
}

/** §3.1: none of `--next`, `--workflow`, `--step`, `--element` → exit `2` with this reason. */
export const AGENT_EXECUTE_MISSING_TARGET = 'missing required argument: --next or --element';

/** A single option value: the last occurrence, as Commander gives a non-repeatable option. */
function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[value.length - 1];
}

/**
 * Parse, check the project is initialized, run the pipeline, then plan (dry run) or launch. A usage
 * error (no target, a malformed element-ref, `spec-008` §7) is thrown as `UsageError` before the project
 * is read.
 */
export const agentExecuteFn: CoreFn<unknown, AgentLaunchPlan | RecordedLaunch> = async (params) => {
  const { root, options, host } = params as AgentExecuteParams;
  const elementOption = single(options?.element);
  if (elementOption === undefined) throw new UsageError(AGENT_EXECUTE_MISSING_TARGET);
  const element = parseElementRef(elementOption);
  if (!element.ok) throw new UsageError(element.error.message);

  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const dryRun = isDryRunActive();
  const launchHost = host ?? {};
  return agentExecutePipeline<AgentLaunchPlan | RecordedLaunch>(
    root,
    { element: element.value, role: single(options?.role), agent: single(options?.agent) },
    launchHost,
    async (prepared, releaseSignals) => (dryRun ? coreOk(launchPlan(prepared)) : launchAgent(root, prepared, launchHost, releaseSignals)),
  );
};

/**
 * §3.4: a recorded run is reported on stderr — the summary line (`console`), `{ "run": <record> }`
 * (`json`/`yaml`) — and stdout is left to the agent. The dry-run plan is an ordinary stdout payload.
 */
export function renderAgentExecuteStderr(value: AgentLaunchPlan | RecordedLaunch): StderrReport | undefined {
  if ('dryRun' in value) return undefined;
  return { document: { run: value.run }, console: runSummaryLine(value.run, value.sha) };
}
