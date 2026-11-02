/**
 * task-332 — a short element reference at the command line, through the REAL compiled `dist/cli.js` in a REAL
 * `wingfoil init --template kanban` project (design D1 (b), D7, D8, D10; `spec-008-cli-grammar` §7; BDD
 * `P1.10-memory-history.feature`, `P1.7-memory-approve.feature`):
 *
 * - `memory history dl-001`, `dl-1` and `dl-001-pick` answer byte for byte what the full id answers (AC 1, 2, 4);
 * - `memory submit dl-1` commits `wf(decision-log): submit <full id>` and prints the full id (AC 4, D10: no echo);
 * - an ambiguous reference exits 1 on stderr with `error:`, `hint:` and one indented line per full id in id order,
 *   or the `{error, hint, details}` object under `--format json`, and writes nothing (AC 3, D7);
 * - a reference nothing names keeps the existing line (D8) — characterization, it passes at red. Those two lines
 *   were copied from a real run of the code build of this worktree: `wingfoil memory history dl-3` and
 *   `wingfoil memory history dl-3 --format json` in a kanban project holding dl-001 and dl-002, which printed
 *   `error: document not found: dl-3` and `{"error":"document not found: dl-3"}`, both exit 1, stdout empty.
 *
 * Red-first for everything but D8: today the three references above are `document not found`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

const DL_1 = 'dl-001-pick-a-storage-layout-for-exports';
const DL_2 = 'dl-002-pick-a-storage-engine';
const DL_1_TWIN = 'dl-001-pick-another-layout';
const DL_1_TWIN_PATH = `docs/memory/decision-log/${DL_1_TWIN}.md`;

const HINT = 'give the full id, or a longer prefix of it';

function wingfoil(cwd: string, args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

function step(repo: string, ...args: string[]): void {
  const run = wingfoil(repo, args);
  if (run.status !== 0) throw new Error(`fixture bug: wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
}

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();

/** A kanban project with dl-001 and dl-002, both in `draft`, committed. */
function buildProject(options: { twin?: boolean } = {}): string {
  const repo = makeTempGitRepo();
  step(repo, 'init', '--template', 'kanban');
  step(repo, 'memory', 'add', '--type', 'decision-log', '--title', 'Pick a storage layout for exports');
  step(repo, 'memory', 'add', '--type', 'decision-log', '--title', 'Pick a storage engine');
  if (options.twin) {
    // A second element with the number 1, written by hand as `memory add` never allocates a number twice.
    writeFileSync(
      join(repo, DL_1_TWIN_PATH),
      ['---', `id: ${DL_1_TWIN}`, 'type: decision-log', 'title: "Pick another layout"', 'status: draft', '---', '', 'Real content.', ''].join('\n'),
    );
    git(repo, ['add', '--', DL_1_TWIN_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'wf(decision-log): add dl-001-pick-another-layout']);
  }
  if (git(repo, ['status', '--porcelain']).trim() !== '') throw new Error('fixture bug: the fixture left the tree dirty');
  return repo;
}

describe('task-332 AC 1, 2 and 4 — memory history answers a short reference as it answers the full id (red-first)', () => {
  let repo: string;
  beforeAll(() => {
    repo = buildProject();
  });
  afterAll(() => removeTempDir(repo));

  it.each(['dl-001', 'dl-1', 'dl-001-pick'])('console: memory history %s is byte-identical to the full id, exit 0', (reference) => {
    const full = wingfoil(repo, ['memory', 'history', DL_1]);
    expect(full.status).toBe(0);

    const short = wingfoil(repo, ['memory', 'history', reference]);

    expect(short).toEqual(full);
    expect(JSON.parse(short.stdout)).toMatchObject({ id: DL_1, path: `docs/memory/decision-log/${DL_1}.md` });
  });

  it.each(['dl-001', 'dl-1', 'dl-001-pick'])('--format json: memory history %s is byte-identical to the full id, exit 0', (reference) => {
    const full = wingfoil(repo, ['memory', 'history', DL_1, '--format', 'json']);
    const short = wingfoil(repo, ['memory', 'history', reference, '--format', 'json']);
    expect(short).toEqual(full);
    expect(short.status).toBe(0);
    expect((JSON.parse(short.stdout) as { id: string }).id).toBe(DL_1);
  });

  it('the second decision-log is its own number: dl-2 names dl-002-pick-a-storage-engine', () => {
    const run = wingfoil(repo, ['memory', 'history', 'dl-2', '--format', 'json']);
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { id: string }).id).toBe(DL_2);
  });
});

describe('task-332 AC 4 and 5 — memory submit takes a short reference and writes the full id (red-first)', () => {
  it('--dry-run --format json: the plan is the full-id plan — same subject, message, paths and diff', () => {
    const repo = buildProject();
    try {
      const unchanged = snapshotPersistence(repo);
      const full = wingfoil(repo, ['memory', 'submit', DL_1, '--dry-run', '--format', 'json']);
      expect(full.status).toBe(0);

      const short = wingfoil(repo, ['memory', 'submit', 'dl-1', '--dry-run', '--format', 'json']);

      expect(short).toEqual(full);
      expect((JSON.parse(short.stdout) as { subject: string }).subject).toBe(`wf(decision-log): submit ${DL_1}`);
      assertPersistenceUnchanged(repo, unchanged, 'dry run');
    } finally {
      removeTempDir(repo);
    }
  });

  it('console: memory submit dl-1 prints the full id and commits wf(decision-log): submit <full id>, no echo of the reference', () => {
    const repo = buildProject();
    try {
      const before = head(repo);

      const run = wingfoil(repo, ['memory', 'submit', 'dl-1']);

      expect(run.status).toBe(0);
      expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual({ id: DL_1, path: `docs/memory/decision-log/${DL_1}.md`, from: 'draft', to: 'pending' });
      expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
      expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`wf(decision-log): submit ${DL_1}`);
      expect(git(repo, ['log', '-1', '--format=%B']).split(/\s+/)).not.toContain('dl-1');
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-332 AC 3 — an ambiguous reference is refused with every candidate and writes nothing (red-first)', () => {
  let repo: string;
  beforeAll(() => {
    repo = buildProject({ twin: true });
  });
  afterAll(() => removeTempDir(repo));

  it('console: error:, hint:, then one indented line per full id in id order — stdout empty, exit 1', () => {
    const run = wingfoil(repo, ['memory', 'history', 'dl-1']);
    expect(run).toEqual({
      status: 1,
      stdout: '',
      stderr: `error: ambiguous reference: dl-1 matches 2 elements\nhint: ${HINT}\n  ${DL_1}\n  ${DL_1_TWIN}\n`,
    });
  });

  it('--format json: one {error, hint, details} object on stderr, stdout empty, exit 1', () => {
    const run = wingfoil(repo, ['memory', 'history', 'dl-1', '--format', 'json']);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(JSON.parse(run.stderr)).toEqual({
      error: 'ambiguous reference: dl-1 matches 2 elements',
      hint: HINT,
      details: [{ detail: DL_1 }, { detail: DL_1_TWIN }],
    });
  });

  it('memory submit dl-1 is refused the same way and the repository is untouched', () => {
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, ['memory', 'submit', 'dl-1']);

    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe(`error: ambiguous reference: dl-1 matches 2 elements\nhint: ${HINT}\n  ${DL_1}\n  ${DL_1_TWIN}\n`);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged, 'ambiguous submit');
  });

  it('a longer prefix settles it: memory history dl-001-pick-an names the twin', () => {
    const run = wingfoil(repo, ['memory', 'history', 'dl-001-pick-an', '--format', 'json']);
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { id: string }).id).toBe(DL_1_TWIN);
  });
});

describe('task-332 D8 (characterization) — a reference nothing names keeps the existing line', () => {
  let repo: string;
  beforeAll(() => {
    repo = buildProject();
  });
  afterAll(() => removeTempDir(repo));

  it('console: error: document not found: dl-3, exit 1, stdout empty', () => {
    expect(wingfoil(repo, ['memory', 'history', 'dl-3'])).toEqual({ status: 1, stdout: '', stderr: 'error: document not found: dl-3\n' });
    expect(wingfoil(repo, ['memory', 'submit', 'dl-3'])).toEqual({ status: 1, stdout: '', stderr: 'error: document not found: dl-3\n' });
  });

  it('--format json: {"error":"document not found: dl-3"}, exit 1, stdout empty', () => {
    expect(wingfoil(repo, ['memory', 'history', 'dl-3', '--format', 'json'])).toEqual({
      status: 1,
      stdout: '',
      stderr: '{"error":"document not found: dl-3"}\n',
    });
  });
});
