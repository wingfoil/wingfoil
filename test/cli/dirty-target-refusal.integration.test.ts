/**
 * task-092-writes-refuse-a-dirty-target / `bug-078-commitpaths-callers-commit-whatever-is-on-disk` —
 * the two things only the PROCESS boundary shows for the non-transition write verbs: the exit code a
 * script keys on (REQ-INT-04) and the message a human reads on stderr.
 *
 * `spec-005-cli-command-contract` § "1. Exit-code contract (REQ-INT-04)" reserves exit `2` for a
 * malformed *invocation* and puts "validation failure, git operation failure" under exit `1`. A
 * target carrying uncommitted modifications is a repository-state precondition — the command line is
 * perfect and re-typing it cannot help — so the refusal is `1`. That is the ruling recorded on
 * `bug-076` and followed by `task-088` for the gated Memory verbs; this pins the same answer for the
 * verbs `dl-080` reaches through `bug-078`.
 *
 * `spawnSync`, not `execFileSync` + `catch`: `task-088`'s `red` notes record that the latter reads
 * back `stderr: ''` for a command that exits `0` while writing to fd 2, which would make an
 * "it printed the reason" assertion vacuous if the exit code ever regressed to `0`. Do not
 * "simplify" it back.
 *
 * Drives the compiled `dist/cli.js` (built once by `test/global-setup.cjs`, `bug-003`) in a
 * throwaway git repository scaffolded by the real `wingfoil init`; nothing here touches this
 * repository (`bug-075`).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');
const DNA = '.wingfoil/dna.yaml';

function runCli(repo: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('CLI — a write verb refuses a dirty target at exit 1 (bug-078, spec-005 §1)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = runCli(repo, ['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
  });

  afterEach(() => removeTempDir(repo));

  it('`dna set` on a dirty dna.yaml exits 1, says what is in the way, and commits nothing', () => {
    const unrelated = '\n# UNRELATED UNCOMMITTED COMMENT — named by no commit subject\n';
    appendFileSync(join(repo, DNA), unrelated, 'utf-8');
    const before = git(repo, ['rev-parse', 'HEAD']).trim();

    const unchanged = snapshotPersistence(repo);
    const result = runCli(repo, ['dna', 'set', 'project.name', '--value', 'Renamed']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(DNA);
    expect(result.stderr).toContain('commit or stash');
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(readFileSync(join(repo, DNA), 'utf-8')).toContain('UNRELATED UNCOMMITTED COMMENT');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('`dna set` on a clean tree still exits 0 and commits exactly its own path', () => {
    const result = runCli(repo, ['dna', 'set', 'project.name', '--value', 'Renamed']);

    expect(result.status).toBe(0);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(dna): set project.name');
    expect(git(repo, ['diff', '--name-only', 'HEAD~1', 'HEAD']).trim()).toBe(DNA);
  });

  it('an unrelated dirty file never blocks the write — the guard is per-path (dl-080 rejected (D))', () => {
    appendFileSync(join(repo, 'unrelated.txt'), 'work in progress\n', 'utf-8');
    const result = runCli(repo, ['dna', 'set', 'project.name', '--value', 'Renamed']);

    expect(result.status).toBe(0);
    expect(git(repo, ['status', '--porcelain']).trim()).toContain('unrelated.txt');
  });
});
