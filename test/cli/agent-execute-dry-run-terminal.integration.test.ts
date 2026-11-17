/**
 * task-335 AC 7 (red-first) — `--dry-run` with a `terminal: required` adapter succeeds without a terminal and
 * launches nothing (`bug-392`; `spec-016` §3.3 "`--dry-run`", §3.7 `NO_TERMINAL`; `spec-008` §2's `--dry-run` row;
 * approver ruling D9 (a)), on the compiled CLI with `fake-terminal.yaml` and no terminal (under Jest the child's
 * stdin and stdout are pipes).
 *
 * - the dry run exits `0` with the plan on stdout, its keys `{dryRun, subject, paths, run, launch, bootstrap}` (`launch`
 *   from task-339),
 *   and one `warning:` line saying a real run is refused here — under `--format json` and `--format console`;
 * - without `--dry-run` the existing `NO_TERMINAL` refusal is unchanged (also pinned by
 *   `test/cli/agent-execute.integration.test.ts`);
 * - a headless dry run needs no terminal and prints no terminal warning.
 */
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, expectNothingRan, headOf, removeRunScratch, warningLines } from './helpers/agent-execute-cli';

const WARNING = 'interactive launch needs a terminal on stdin and stdout: a run without --dry-run is refused here';

let repo: string;
beforeAll(() => {
  repo = seed((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: fake-terminal')));
});
afterAll(() => {
  removeRunScratch();
  removeTempDir(repo);
});

const ARGS = ['--element', TASK_REF, '--role', 'developer'];

describe('task-335 AC 7 — a dry run needs no terminal (bug-392)', () => {
  it('--format json: exit 0, the plan with its keys, stderr exactly the one warning document, nothing spawned or written', () => {
    const before = headOf(repo);
    const run = execute(repo, [...ARGS, '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`${JSON.stringify({ warning: WARNING })}\n`);
    const plan = JSON.parse(run.stdout) as Record<string, unknown>;
    // task-339 (dl-223 Action 3, approver ruling D3 (a)): the plan gains `launch`, the kind and the role's fragment.
    expect(Object.keys(plan)).toEqual(['dryRun', 'subject', 'paths', 'run', 'launch', 'bootstrap']);
    expect(plan).toMatchObject({ dryRun: true, subject: `agent: record ${TASK_ID}/adhoc/1`, paths: [`docs/runs/${TASK_ID}.jsonl`], run: { adapter: 'custom/fake-terminal' } });
    expect(run.fake).toEqual([]);
    expect(headOf(repo)).toBe(before);
  });

  it('--format console: exit 0, the plan as indented JSON, stderr exactly the warning line', () => {
    const run = execute(repo, [...ARGS, '--dry-run']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`warning: ${WARNING}\n`);
    expect(run.stdout.startsWith('{\n  "dryRun": true,')).toBe(true);
    expect(JSON.parse(run.stdout)).toMatchObject({ dryRun: true });
  });

  it('without --dry-run: the NO_TERMINAL refusal, unchanged', () => {
    const before = headOf(repo);
    const run = execute(repo, ARGS);
    expect(run.status).toBe(1);
    // Copied from a real run of this build (the task's red notes).
    expect(errorLine(run.stderr)).toBe('error: interactive launch needs a terminal on stdin and stdout');
    expectNothingRan(repo, run, before);
  });

  it('a headless dry run: exit 0, no terminal warning', () => {
    const run = execute(repo, [...ARGS, '--headless', '--dry-run']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(run.stderr).not.toContain('terminal');
  });
});
