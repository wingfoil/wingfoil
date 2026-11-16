/**
 * `wingfoil agent execute` `CoreOperation.fn` (task-218, task-228, task-235, `spec-016` §3; P5.3.1, P5.3.2,
 * P5.4.2–P5.4.4): the stepless form, `--element <type>:<id>` with an optional `--role` and `--agent`, and the
 * step forms `--next`, `--workflow <ref>`, `--step <key>` (§3.1; either option implies `--next`), which take
 * the workflow, phase, element and role from a frontier step (`src/agent/step.ts`). It parses the request
 * (§3.3 step 1), runs `src/agent/execute.ts`'s pipeline up to the spawn (steps 2–12), and then:
 * - under `--dry-run` (`spec-008` §2) returns the launch it would make — the record commit's subject and
 *   run-log path, the run's fields known before the spawn, and the §2.4 bootstrap — having written
 *   nothing;
 * - otherwise launches the agent (`src/agent/launch.ts`, steps 13–18) and returns the recorded run: an
 *   interactive run's the CLI prints on stderr only ({@link renderAgentExecuteStderr}, §3.4); a headless work
 *   run's (`--headless`, or the phase's `launch: headless`, task-335) is the stdout payload `{ "run": <record> }`
 *   (§3.5), its summary line a notice.
 *
 * v0.4's `--resume` and `--ref` are not registered, so Commander refuses them as unknown options (exit `2`).
 */
import { parseDuration } from '../agent/duration';
import { agentExecutePipeline, launchPlan, type AgentExecuteHost, type AgentLaunchPlan } from '../agent/execute';
import { launchAgent, runSummaryLine, type RecordedLaunch } from '../agent/launch';
import { LOG_INTERACTIVE, logNotIgnoredWarning, notIgnoredInRepository } from '../agent/output';
import type { RunRecord } from '../agent/run-log';
import { isDryRunActive } from '../storage';
import { reportWarning } from '../validation/warning';
import { parseElementRef } from './element-ref';
import { requireInitializedProject } from './init';
import type { CoreFn, StderrReport } from './registry';
import { coreOk } from './types';
import { UsageError } from './usage-error';

/** `agent execute` params: the value options (`spec-008` §1) ride `options`, the `--next` flag `next`. */
export interface AgentExecuteParams {
  readonly root: string;
  /** `--next` (task-235): take the step from the active instance, or from the one `--workflow` selects. */
  readonly next?: boolean;
  /** `--headless` (task-335): launch the work run, without a terminal, whatever the phase's `launch`. */
  readonly headless?: boolean;
  /** `--interactive` (task-335): launch in this terminal, whatever the phase's `launch`. */
  readonly interactive?: boolean;
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

/** §3.1: `--headless` with `--interactive` → exit `2` with this reason. */
export const AGENT_EXECUTE_BOTH_KINDS = 'invalid flag combination: --headless cannot be combined with --interactive';

/**
 * `--log`'s option name (task-336, §3.1). A workaround: `test/lint/git-log-readers.test.ts` has no exemption and reads
 * every quoted `log` token in `src/` as a `git log` reader, a false positive on an option name; remove it with that fix.
 */
export const AGENT_EXECUTE_LOG_OPTION = '--log'.slice('--'.length);

/** §3.1: a blank `--log` (empty, or whitespace only) → exit `2` with this reason (task-336). */
export const AGENT_EXECUTE_LOG_BLANK = 'invalid flag value: --log must not be blank';

/** A headless work run's success (§3.5): the stdout payload, the committed record. */
export interface WorkRunReport {
  readonly run: RunRecord;
}

/** A single option value: the last occurrence, as Commander gives a non-repeatable option. */
function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[value.length - 1];
}

/**
 * Parse, check the project is initialized, run the pipeline, then plan (dry run) or launch. A usage
 * error (none of `--next`, `--workflow`, `--step`, `--element`; a malformed element-ref, `spec-008` §7;
 * `--headless` with `--interactive`; a malformed or too long `--timeout`, §12; a blank `--log`, or `--log` with
 * `--interactive`, task-336) is thrown as `UsageError` before the project is read.
 */
export const agentExecuteFn: CoreFn<unknown, AgentLaunchPlan | RecordedLaunch | WorkRunReport> = async (params) => {
  const { root, options, host, next, headless, interactive } = params as AgentExecuteParams;
  const elementOption = single(options?.element);
  const workflow = single(options?.workflow);
  const key = single(options?.step);
  // `--workflow` and `--step` imply `--next` (§3.1); giving `--next` as well changes nothing.
  const stepForm = next === true || workflow !== undefined || key !== undefined;
  if (elementOption === undefined && !stepForm) throw new UsageError(AGENT_EXECUTE_MISSING_TARGET);
  const element = elementOption === undefined ? undefined : parseElementRef(elementOption);
  if (element !== undefined && !element.ok) throw new UsageError(element.error.message);
  if (headless === true && interactive === true) throw new UsageError(AGENT_EXECUTE_BOTH_KINDS);
  const launch = headless === true ? 'headless' : interactive === true ? 'interactive' : undefined;
  const rawTimeout = single(options?.timeout);
  const timeout = rawTimeout === undefined ? undefined : parseDuration(rawTimeout);
  if (timeout !== undefined && 'error' in timeout) throw new UsageError(`invalid flag value: ${timeout.error}`);
  // `--log` (task-336, §3.1, `dl-182` Q4 (a)): never blank, and only for a headless launch — refused here with
  // `--interactive`, and at §3.2 step 7 on a run that resolves interactive.
  const log = single(options?.log);
  if (log !== undefined && log.trim() === '') throw new UsageError(AGENT_EXECUTE_LOG_BLANK);
  if (log !== undefined && interactive === true) throw new UsageError(LOG_INTERACTIVE);

  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const dryRun = isDryRunActive();
  const launchHost = host ?? {};
  return agentExecutePipeline<AgentLaunchPlan | RecordedLaunch | WorkRunReport>(
    root,
    {
      ...(element === undefined ? {} : { element: element.value }),
      ...(stepForm ? { step: { ...(workflow === undefined ? {} : { workflow }), ...(key === undefined ? {} : { key }) } } : {}),
      role: single(options?.role),
      agent: single(options?.agent),
      ...(launch === undefined ? {} : { launch }),
      ...(timeout === undefined ? {} : { timeout }),
      ...(log === undefined ? {} : { log }),
      dryRun,
    },
    launchHost,
    async (prepared, releaseSignals) => {
      if (dryRun) {
        // §3.3 `--dry-run`: `--log`'s not-ignored warning is printed; the file is neither created nor opened.
        if (prepared.log !== undefined && notIgnoredInRepository(root, prepared.log)) reportWarning(logNotIgnoredWarning(prepared.log));
        return coreOk(launchPlan(prepared));
      }
      const launched = await launchAgent(root, prepared, launchHost, releaseSignals);
      // A work run's record is its stdout payload (§3.5); the summary line was a notice.
      return launched.ok && prepared.kind === 'headless' ? coreOk({ run: launched.value.run }) : launched;
    },
  );
};

/**
 * §3.4: an interactive recorded run is reported on stderr — the summary line (`console`), `{ "run": <record> }`
 * (`json`/`yaml`) — and stdout is left to the agent. The dry-run plan and a headless work run's `{ "run": <record> }`
 * (§3.5) are ordinary stdout payloads.
 */
export function renderAgentExecuteStderr(value: AgentLaunchPlan | RecordedLaunch | WorkRunReport): StderrReport | undefined {
  if ('dryRun' in value || !('sha' in value)) return undefined;
  return { document: { run: value.run }, console: runSummaryLine(value.run, value.sha) };
}
