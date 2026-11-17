/**
 * task-336 review fix round, F7 (red-first; `spec-016` §3.1 and §3.7's parse row, `spec-008` §12's `agent execute
 * --log` row, as amended at the review fix round, `e998b6346` and `a0eca9d33`) — a `--log` path that resolves, against
 * the current directory, to `.wingfoil/run/` under the project root or beneath it is refused before the project is
 * read: exit `2`, `error: invalid flag value: --log must not name a file under .wingfoil/run/, the active registry`,
 * nothing spawned, no file created, `HEAD` unchanged. A path that only begins with the same letters
 * (`.wingfoil/runx.log`) is not refused.
 *
 * FU2 (review fix round 2, `c9bcaa577`, §3.1): with `--project` given through a symbolic link to the root, a `--log`
 * under the real root's registry is refused as well (red-first), and one under the link's registry (characterization).
 *
 * Today such a path is accepted: the run proceeds and the log is written inside the registry's directory.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { cli, errorLine, execute, expectNothingRan, headOf, records, removeRunScratch } from './helpers/agent-execute-cli';

const repos: string[] = [];
const links: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
  for (const dir of links) rmSync(dir, { recursive: true, force: true });
});

const IN_REGISTRY = 'error: invalid flag value: --log must not name a file under .wingfoil/run/, the active registry';

function fixture(): string {
  const repo = seed();
  repos.push(repo);
  return repo;
}

describe('task-336 F7 — a --log path in the active registry is refused, exit 2 (spec-016 §3.1, §3.7; spec-008 §12)', () => {
  it.each<[string, (repo: string) => string, string]>([
    ['.wingfoil/run/x.log, relative to the current directory', (): string => '.wingfoil/run/x.log', '.wingfoil/run/x.log'],
    ['<root>/.wingfoil/run itself, absolute', (repo: string) => join(repo, '.wingfoil', 'run'), '.wingfoil/run'],
    ['a file under .wingfoil/run/a/b, absolute', (repo: string) => join(repo, '.wingfoil', 'run', 'a', 'b'), '.wingfoil/run/a/b'],
  ])('%s: exit 2, nothing spawned, no file, HEAD unchanged', (_name, logPath, relative) => {
    const repo = fixture();
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--log', logPath(repo)]);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(IN_REGISTRY);
    expectNothingRan(repo, run, before);
    expect(records(repo, TASK_ID)).toEqual([]);
    // The registry's directory itself may exist; a log file under it must not.
    if (relative !== '.wingfoil/run') expect(existsSync(join(repo, relative))).toBe(false);
  });

  it('decided before the project is read (a git repository with no .wingfoil/)', () => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    const run = execute(repo, ['--next', '--headless', '--log', '.wingfoil/run/x.log']);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(IN_REGISTRY);
    expect(run.fake).toEqual([]);
  });

  it('.wingfoil/runx.log is not refused: the run proceeds and the file is written', () => {
    const repo = fixture();
    mkdirSync(join(repo, '.wingfoil'), { recursive: true });
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--log', '.wingfoil/runx.log']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(existsSync(join(repo, '.wingfoil', 'runx.log'))).toBe(true);
  });
});

describe('task-336 FU2 — --project through a symbolic link still meets the refusal (spec-016 §3.1, c9bcaa577)', () => {
  /** A fixture repository and a symbolic link to its root, outside it. */
  function linked(): { repo: string; link: string } {
    const repo = fixture();
    const dir = mkdtempSync(join(tmpdir(), 'wf-336-link-'));
    links.push(dir);
    const link = join(dir, 'root-link');
    symlinkSync(repo, link, 'dir');
    return { repo, link };
  }

  it.each<[string, (repo: string, link: string) => string]>([
    ['the real root (red-first)', (repo) => join(repo, '.wingfoil', 'run', 'x.log')],
    ['the link (characterization)', (_repo, link) => join(link, '.wingfoil', 'run', 'x.log')],
  ])('--project <link> --log <%s>/.wingfoil/run/x.log: exit 2, nothing spawned, no file, HEAD unchanged', (_name, logPath) => {
    const { repo, link } = linked();
    const before = headOf(repo);
    const run = cli(repo, ['--project', link, 'agent', 'execute', '--element', TASK_REF, '--role', 'developer', '--headless', '--log', logPath(repo, link)]);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(IN_REGISTRY);
    expectNothingRan(repo, run, before);
    expect(records(repo, TASK_ID)).toEqual([]);
    expect(existsSync(join(repo, '.wingfoil', 'run', 'x.log'))).toBe(false);
  });
});
