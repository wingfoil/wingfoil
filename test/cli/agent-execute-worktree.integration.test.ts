/**
 * task-353 AC 1 (characterization; `spec-016` §3.1 "The launch directory" and §3.3 step 14, as amended at the design
 * gate `c0ac033df`; `bug-499`; approver ruling D1 (a), D2) — the global `--project <worktree>` (task-350, `dl-198` (a))
 * names a linked worktree of the repository as the project root, and `agent execute` then runs every part of the run
 * there: on the compiled CLI with the fake agent, from the main checkout,
 *
 * - the agent's working directory is the worktree (the fake records `cwd`, `realpath`-compared);
 * - the record `agent: record <task>/adhoc/1` is committed on the worktree's branch, and the main checkout's branch
 *   holds no `agent:` commit;
 * - the record's `state_ref` is the worktree's `HEAD` before the run (a commit `main` does not have);
 * - with `WINGFOIL_FAKE_AGENT_CONNECT=1` the registered MCP server's argv (from the MCP config, as the fake records it)
 *   ends `--project <worktree> mcp` (D2), and the session Resource the fake read through it names that same sha;
 * - `--dry-run` (`--format json` and `--format console`): the plan's `run.state_ref` is the worktree's `HEAD`, nothing
 *   is written;
 * - a `<dir>` that is not a git root (a plain directory) is refused before any side effect: exit `1`, stderr exactly
 *   `error: E_NOT_AT_GIT_ROOT: --project is not a git root: <absolute dir>` (and its JSON form under `--format json`),
 *   no run log, no new commit in either checkout, nothing launched.
 *
 * Every case passes on today's build (D1 (a): no new surface; the design's scratch run, task-353's `### design`).
 * The refusal text is copied from a real run (`node dist/cli.js --project <plain dir> agent execute --element
 * plan:sw-life-cycle-1-plan --role developer`, task-353's red notes).
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { cli, headOf, launchEntry, records, removeRunScratch } from './helpers/agent-execute-cli';

const RUN_1 = `${TASK_ID}/adhoc/1`;
const LOG = `docs/runs/${TASK_ID}.jsonl`;

const repos: string[] = [];
const dirs: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) {
    // The worktrees live outside the main checkout: unregister them, then remove both.
    removeTempDir(repo);
  }
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

interface Checkouts {
  /** The main checkout (branch `main`). */
  readonly main: string;
  /** The linked worktree (branch `task/wt`), one commit ahead of `main`. */
  readonly wt: string;
}

/** `seed()`, then `git worktree add -b task/wt <scratch>/wt` and one commit on `task/wt`. */
function checkouts(): Checkouts {
  const main = seed();
  repos.push(main);
  const parent = mkdtempSync(join(tmpdir(), 'wf-353-wt-'));
  dirs.push(parent);
  const wt = join(parent, 'wt');
  git(main, ['worktree', 'add', '--quiet', '-b', 'task/wt', wt]);
  git(wt, ['commit', '--allow-empty', '--quiet', '-m', 'work on task/wt']);
  return { main, wt };
}

/** `wingfoil --project <project> agent execute <args>`, run from `cwd`. */
const executeIn = (cwd: string, project: string, args: readonly string[], env: Record<string, string> = {}) =>
  cli(cwd, ['--project', project, 'agent', 'execute', ...args], env);

const agentCommits = (repo: string, ref: string): string[] =>
  git(repo, ['log', '--format=%s', ref])
    .split('\n')
    .filter((subject) => subject.startsWith('agent:'));

describe('task-353 AC 1 — agent execute in a linked worktree through --project (spec-016 §3.1, §3.3 step 14; D1 (a))', () => {
  it('launches the agent in the worktree and commits the record on its branch, state_ref its HEAD; main untouched', () => {
    const { main, wt } = checkouts();
    const wtHead = headOf(wt);
    const mainHead = headOf(main);
    expect(wtHead).not.toBe(mainHead);

    const run = executeIn(main, wt, ['--element', TASK_REF, '--role', 'developer']);
    expect([run.status, run.stdout]).toEqual([0, '']);
    // task-337: the launch entry, no longer fake[0] (version_args runs before the launch too).
    expect((launchEntry(run) as unknown as Record<string, unknown>)['cwd']).toBe(realpathSync(wt));

    expect(git(wt, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    expect(git(wt, ['rev-parse', 'HEAD~1']).trim()).toBe(wtHead);
    expect(git(wt, ['branch', '--show-current']).trim()).toBe('task/wt');
    expect(headOf(main)).toBe(mainHead);
    expect(agentCommits(main, 'main')).toEqual([]);

    const [record, ...rest] = records(wt, TASK_ID);
    expect(rest).toEqual([]);
    expect(record).toMatchObject({ id: RUN_1, element: TASK_REF, state_ref: wtHead });
    expect(records(main, TASK_ID)).toEqual([]);
    expect(git(main, ['status', '--porcelain'])).toBe('');
    expect(git(wt, ['status', '--porcelain'])).toBe('');
  });

  it('the registered MCP server serves the worktree: its argv ends --project <worktree> mcp, and the session Resource the agent read through it names the worktree\'s HEAD', () => {
    const { main, wt } = checkouts();
    const wtHead = headOf(wt);
    const run = executeIn(main, wt, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_CONNECT: '1' });
    expect(run.status).toBe(0);
    const launch = launchEntry(run) as unknown as { mcp: { args?: string[]; resource?: { uri: string }; error?: unknown; text?: string | null } | null; failure?: string };
    expect(launch.failure).toBeUndefined();
    const tail = (launch.mcp?.args ?? []).slice(-3);
    expect([tail[0], tail[2]]).toEqual(['--project', 'mcp']);
    expect(realpathSync(tail[1] ?? '')).toBe(realpathSync(wt));
    expect(launch.mcp?.resource).toEqual({ uri: `wingfoil://session/developer/${TASK_REF}/${wtHead}` });
    expect(launch.mcp?.error).toBeUndefined();
    expect(typeof launch.mcp?.text).toBe('string');
    expect(git(wt, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    expect(agentCommits(main, 'main')).toEqual([]);
  });

  it.each(['json', 'console'])('--dry-run --format %s: run.state_ref is the worktree\'s HEAD, nothing launched or written', (format) => {
    const { main, wt } = checkouts();
    const wtHead = headOf(wt);
    const mainHead = headOf(main);
    const run = executeIn(main, wt, ['--element', TASK_REF, '--role', 'developer', '--dry-run', '--format', format]);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(JSON.parse(run.stdout)).toMatchObject({ dryRun: true, subject: `agent: record ${RUN_1}`, paths: [LOG], run: { id: RUN_1, element: TASK_REF, state_ref: wtHead } });
    expect(run.fake).toEqual([]);
    expect([headOf(wt), headOf(main)]).toEqual([wtHead, mainHead]);
  });

  it.each([
    ['console', (dir: string) => `error: E_NOT_AT_GIT_ROOT: --project is not a git root: ${dir}\n`],
    ['json', (dir: string) => `${JSON.stringify({ error: `E_NOT_AT_GIT_ROOT: --project is not a git root: ${dir}` })}\n`],
  ])('--project naming a directory that is not a git root (--format %s): exit 1, E_NOT_AT_GIT_ROOT, no side effect', (format, expected) => {
    const { main, wt } = checkouts();
    const plain = join(mkdtempSync(join(tmpdir(), 'wf-353-plain-')), 'plain');
    dirs.push(join(plain, '..'));
    mkdirSync(plain);
    const heads = [headOf(main), headOf(wt)];
    const run = executeIn(main, plain, ['--element', TASK_REF, '--role', 'developer', '--format', format]);
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(expected(plain));
    expect(run.stdout).toBe('');
    expect(run.fake).toEqual([]);
    expect([headOf(main), headOf(wt)]).toEqual(heads);
    expect([records(main, TASK_ID), records(wt, TASK_ID)]).toEqual([[], []]);
    expect(git(main, ['status', '--porcelain'])).toBe('');
  });
});
