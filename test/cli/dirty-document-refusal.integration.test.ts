/**
 * task-088-fix-gated-verbs-commit-only-the-status-change / `bug-076-approve-commits-whatever-is-on-disk`,
 * AC1/AC2/AC6 — the defect and its refusal, end to end through the REAL compiled `dist/cli.js`, in a
 * REAL `wingfoil init`-ed throwaway project.
 *
 * `bug-076` was found by using the v0.2 verbs on a project other than this one, and it could not have
 * been found here: `bug-075` means the verbs cannot be pointed at WingFoil's own Memory, so every
 * transition in this repository is hand-made and this write path has never run against its documents.
 * The in-process suite (`test/core/memory-transition-commit-scope.test.ts`) pins the behaviour at the
 * `CoreFn` seam; this one pins the two things only the process boundary can show:
 *
 * - the **exit code** a script keys on (`spec-005-cli-command-contract` § "1. Exit-code contract
 *   (REQ-INT-04)"), and
 * - the **stderr text** a human reads, in spec-005 §3's `error: <reason>` envelope.
 *
 * Spawned through `./helpers/spawn-cli` (bug-197), which throws on a signal rather than reading it as an
 * exit, and uses `spawnSync`, not `execFileSync` + `catch`: the latter surfaces `stderr` only on the error path, so a
 * command that exits `0` while printing to fd 2 reads back as `stderr: ''` — a false green that cost
 * `task-086` a rewrite of this same helper shape. Do not "simplify" it back.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003-cli-integration-dist-race`) — never rebuilt
 * here. Deterministic (REQ-SYS-07): fixed step list, fixed identity, fixed fixture text.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** Spawn the real published entry point; captures stderr on EVERY run, including a 0-exit one. */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

describe('memory approve through the real CLI — a dirty element file is refused, not absorbed (bug-076)', () => {
  let repo: string;
  const DOC = 'docs/memory/adr/adr-001-repro-target.md';

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);

    // The one hand-edit the scaffold still needs: the fixture's git identity, holding `approver`.
    // (`bug-030`'s fix means `defaults.states` already ships, so nothing else has to be seeded.)
    const dna = join(repo, '.wingfoil', 'dna.yaml');
    writeFileSync(
      dna,
      readFileSync(dna, 'utf-8').replace(
        '  members: []',
        '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [developer, approver]',
      ),
      'utf-8',
    );
    git(repo, ['add', '--', '.wingfoil/dna.yaml']);
    git(repo, ['commit', '--quiet', '-m', 'chore: seed approver identity']);

    expect(wingfoil(repo, 'memory', 'add', '--type', 'adr', '--title', 'Repro target').status).toBe(0);
    expect(wingfoil(repo, 'memory', 'submit', 'adr-001-repro-target').status).toBe(0);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  afterEach(() => removeTempDir(repo));

  it('AC1/AC2/AC6: an uncommitted body paragraph and an unowned frontmatter field make `approve` exit non-zero, naming both, with no new commit', () => {
    const absolute = join(repo, DOC);
    writeFileSync(
      absolute,
      `${readFileSync(absolute, 'utf-8').replace(/^(status: .*)$/m, '$1\ntags: ["INJECTED-BY-A-DIRTY-TREE"]')}
INJECTED BODY PARAGRAPH — never mentioned by any commit subject.
`,
      'utf-8',
    );
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'memory', 'approve', 'adr-001-repro-target', '--reason', 'state change only, allegedly');

    // spec-005 §1: a well-formed invocation that failed on repository state — exit 1, never a silent 0.
    expect(run.status).toBe(1);
    // spec-005 §3's envelope, naming the document and each modification.
    expect(run.stderr).toContain('error: ');
    expect(run.stderr).toContain(DOC);
    expect(run.stderr).toContain("frontmatter field 'tags'");
    expect(run.stderr).toContain('the body');

    // Nothing committed and nothing written: the document is still `pending` and still dirty, so the
    // user's edits are neither lost nor laundered into an approval.
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(absolute, 'utf-8')).toContain('status: pending');
    expect(gitOut(repo, ['status', '--porcelain', '--', DOC])).toBe(`M ${DOC}`);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC3: after committing those edits, the same `approve` succeeds and its commit differs from its parent by the status line alone', () => {
    const absolute = join(repo, DOC);
    writeFileSync(absolute, `${readFileSync(absolute, 'utf-8')}\nA paragraph the author committed on purpose.\n`, 'utf-8');
    git(repo, ['add', '--', DOC]);
    git(repo, ['commit', '--quiet', '-m', 'docs: write the adr body']);

    const run = wingfoil(repo, 'memory', 'approve', 'adr-001-repro-target', '--reason', 'meets standards');

    expect(run.status).toBe(0);
    expect(gitOut(repo, ['diff', '--name-only', 'HEAD~1', 'HEAD'])).toBe(DOC);
    const patch = gitOut(repo, ['diff', 'HEAD~1', 'HEAD']).split('\n');
    expect(patch.filter((line) => line.startsWith('-') && !line.startsWith('---'))).toEqual(['-status: pending']);
    expect(patch.filter((line) => line.startsWith('+') && !line.startsWith('+++'))).toEqual(['+status: approved']);
  });
});
