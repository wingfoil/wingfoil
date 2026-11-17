/**
 * task-335 — running the compiled `wingfoil agent execute` against a fixture repository and reading back what the
 * fake agent (`test/fixtures/agents/fake-agent.cjs`) recorded: the shape of `test/cli/agent-execute-step.integration.test.ts`'s
 * local `cli()` helper, shared by the task's integration suites (the launch kind, the headless work run, the waiting
 * step, the dry-run terminal check). Every run has a private `TMPDIR` and its own fake record file, and inherits no
 * `GIT_AUTHOR_*`/`GIT_COMMITTER_*` or `WINGFOIL_FAKE_AGENT_*` variable from the test process.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git } from '../../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture } from './spawn-cli';

/** What the fake wrote for one invocation (task-200's record line). */
export interface FakeEntry {
  readonly argv: string[];
  /** Its stdin to the end, when `WINGFOIL_FAKE_AGENT_STDIN=1`; `null` otherwise. */
  readonly stdin: string | null;
  /** The fake's own pid, under `WINGFOIL_FAKE_AGENT_REGISTRY=1` (task-336). */
  readonly pid?: number;
  /** Every file under `.wingfoil/run/` while the agent ran, sorted by path, under `WINGFOIL_FAKE_AGENT_REGISTRY=1` (task-336). */
  readonly registry?: { readonly path: string; readonly entry: unknown }[];
}

export interface AgentRun {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Every fake invocation, in order: the launch first, then the post-run lookups. */
  readonly fake: FakeEntry[];
}

const scratch: string[] = [];

/** Remove every scratch directory the runs made (call it from `afterAll`). */
export function removeRunScratch(): void {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
}

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** Run the compiled CLI with `args` in `cwd`; `env` adds variables, `input` is written to its stdin. */
export function cli(cwd: string, args: readonly string[], env: Record<string, string> = {}, input?: string): AgentRun {
  const tmp = scratchDir('wf-335-tmp-');
  const recordFile = join(scratchDir('wf-335-rec-'), 'fake.jsonl');
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
  const run = spawnCapture(process.execPath, [CLI_ENTRY, ...args], {
    cwd,
    env: { ...inherited, TMPDIR: tmp, TMP: tmp, TEMP: tmp, WINGFOIL_FAKE_AGENT_RECORD: recordFile, ...env },
    timeout: 120000,
    ...(input === undefined ? {} : { input }),
  });
  const fake = existsSync(recordFile)
    ? readFileSync(recordFile, 'utf-8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as FakeEntry)
    : [];
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, fake };
}

/** `wingfoil agent execute <args>`. */
export const execute = (repo: string, args: readonly string[], env: Record<string, string> = {}, input?: string): AgentRun =>
  cli(repo, ['agent', 'execute', ...args], env, input);

/** The `warning:` lines of a console-format stderr. */
export const warningLines = (stderr: string): string[] => stderr.split('\n').filter((line) => line.startsWith('warning:'));

/** The first `error:` line of a console-format stderr, or `undefined`. */
export const errorLine = (stderr: string): string | undefined => stderr.split('\n').find((line) => line.startsWith('error:'));

/** The argv flags of the fake's non-launch invocations (`version_args`, the lookups, the conflict probe, the summary). */
const NOT_A_LAUNCH = ['--version', '--lookup', '--mcp-get', '--summary'];

/**
 * The fake's launch entry: its first invocation that is none of {@link NOT_A_LAUNCH}. task-337 (`spec-016` §2.6, as
 * amended at `2d193b318`): `version_args` also runs before the launch, so the launch is no longer `fake[0]`.
 */
export function launchEntry(run: AgentRun): FakeEntry {
  const launch = run.fake.find((entry) => !entry.argv.some((arg) => NOT_A_LAUNCH.includes(arg)));
  if (launch === undefined) throw new Error(`the fake never launched: status ${run.status}, stderr ${run.stderr}`);
  return launch;
}

/** The launch's argv as the fake recorded it (after `node <script>`). */
export function launchArgv(run: AgentRun): string[] {
  return launchEntry(run).argv;
}

/** The records of an element's run log, parsed. */
export function records(repo: string, elementId: string): Record<string, unknown>[] {
  const path = join(repo, 'docs', 'runs', `${elementId}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** The full sha `HEAD` names. */
export const headOf = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();

/** A refusal leaves the repository as it was and spawns nothing. */
export function expectNothingRan(repo: string, run: AgentRun, before: string): void {
  expect(run.fake).toEqual([]);
  expect(run.stdout).toBe('');
  expect(headOf(repo)).toBe(before);
  expect(git(repo, ['status', '--porcelain'])).toBe('');
}
