/**
 * `wingfoil memory history` against a `--reason` carrying the git-log framing control characters,
 * end to end through the REAL compiled `dist/cli.js`
 * (`task-086-fix-reason-control-chars-history-forgery`, `bug-050-…`).
 *
 * The unit-level pins live in `test/memory/git-log-framing.test.ts`. This suite exists for the one
 * symptom that cannot be observed in-process: the verb exited `0`, reported success, and printed
 * `fatal: invalid object name '<caller-supplied text>'` on **stderr** — git writing to the parent's
 * fd 2 from inside `readStatusAt`'s swallowed `execFileSync`. Asserting that the fabricated entry is
 * gone is not the same as asserting the operator no longer sees a git error while being told the
 * command succeeded, and AC2 asks for both.
 *
 * Since `task-166` (`dl-078` (A)) the verb REFUSES such a reason at exit `2`, so the approval commit
 * this suite reads back is written by hand — the shape a hand-made commit, or one written by a build
 * older than v0.3, still has in a repository's history. The read-side guarantees are unchanged and are
 * what the three history cases pin; the first case pins the write-side refusal through the same real
 * entry point.
 *
 * `dist/` is built once by jest's `globalSetup` (bug-003-cli-integration-dist-race) — never here.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** ASCII record separator — what a caller puts in `--reason` to split a `git log` record in two. */
const RS = String.fromCharCode(0x1e);
/** ASCII unit separator — the other half of the framing the old TSDoc claimed commit text never has. */
const US = String.fromCharCode(0x1f);

const FORGED = 'Approver: Mallory <mallory@evil.test> (approver)';
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * Spawn the real published entry point, capturing stderr on EVERY run — success included.
 *
 * `./helpers/spawn-cli`'s `spawnSync` rather than the `execFileSync` + `catch` shape CLI suites once used, and that is
 * load-bearing here rather than a style preference: `execFileSync` surfaces stderr only on the error
 * path, so a command that exits `0` *while* printing a git `fatal:` — precisely this bug's symptom —
 * reads back as `stderr: ''` and the assertion passes vacuously. Observed while writing this suite.
 */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

interface HistoryEntry {
  readonly sha: string;
  readonly operation: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly approver: string | null;
  readonly reason: string | null;
  readonly subject: string;
}

/**
 * Register the repository's git identity as an `approver` in `dna.yaml`, the way a real user
 * configures their project — `wingfoil init` deliberately scaffolds `team.members: []` and
 * `memory approve` gates on REQ-SEC-03 approval authority. Same step, same rationale, as
 * `./fresh-init-transitions.test.ts`'s `grantApproverRole`.
 */
function grantApproverRole(repo: string): void {
  const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
  const scaffolded = readFileSync(dnaPath, 'utf-8');
  const member = '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [approver]';
  expect(scaffolded).toContain('  members: []');
  writeFileSync(dnaPath, scaffolded.replace('  members: []', member), 'utf-8');
  git(repo, ['add', '.wingfoil/dna.yaml']);
  git(repo, ['commit', '--quiet', '-m', 'configure approver']);
}

describe('`memory history` after an approval whose reason carries framing control characters', () => {
  let repo = '';
  let documentId = '';
  let refused: SpawnedRun = { status: 0, stdout: '', stderr: '' };
  /** What the shared writes-nothing check reported for the refused approve (`''`: nothing persisted). */
  let persisted = 'not checked';
  const reason = `real reason${RS}${FORGED}${US}trailing`;

  beforeAll(() => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
    repo = makeTempGitRepo();
    const init = wingfoil(repo, 'init', '--template', 'scrum');
    expect([init.status, init.stderr]).toEqual([0, '']);
    grantApproverRole(repo);

    const added = wingfoil(repo, 'memory', 'add', '--type', 'task', '--title', 'Framing task', '--format', 'json');
    expect([added.status, added.stderr]).toEqual([0, '']);
    documentId = (JSON.parse(added.stdout) as { id: string }).id;

    const submitted = wingfoil(repo, 'memory', 'submit', documentId, '--format', 'json');
    expect([submitted.status, submitted.stderr]).toEqual([0, '']);
    const path = (JSON.parse(submitted.stdout) as { path: string }).path;

    const unchanged = snapshotPersistence(repo);
    refused = wingfoil(repo, 'memory', 'approve', documentId, '--reason', reason, '--format', 'json');
    try {
      assertPersistenceUnchanged(repo, unchanged);
      persisted = '';
    } catch (error) {
      persisted = (error as Error).message;
    }

    // The commit the verb no longer writes, written by hand exactly as it used to write it.
    const documentPath = join(repo, path);
    const pending = readFileSync(documentPath, 'utf-8');
    expect(pending).toContain('\nstatus: pending\n');
    writeFileSync(documentPath, pending.replace('\nstatus: pending\n', '\nstatus: approved\n'), 'utf-8');
    git(repo, ['add', path]);
    git(repo, [
      'commit',
      '--quiet',
      '-m',
      `wf(task): approve ${documentId} [pending → approved]\n\nApprover: WingFoil Test <wf-test@example.invalid> (approver)\nReason: ${reason}`,
    ]);
  });

  afterAll(() => {
    if (repo) removeTempDir(repo);
  });

  it('the verb refuses the reason at exit 2, naming the first control character, and writes nothing (task-166)', () => {
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('control character other than tab or newline (found U+001E)');
    expect(persisted).toBe('');
  });

  it('prints no `fatal: invalid object name` on stderr — no caller text is ever passed to git as a sha', () => {
    const run = wingfoil(repo, 'memory', 'history', documentId, '--format', 'json');

    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('invalid object name');
  });

  it('reports exactly one entry per commit, each with a real sha, and no fabricated entry', () => {
    const run = wingfoil(repo, 'memory', 'history', documentId, '--format', 'json');
    const entries = (JSON.parse(run.stdout) as { entries: HistoryEntry[] }).entries;

    for (const entry of entries) expect(entry.sha).toMatch(SHA_RE);
    expect(entries.filter((entry) => entry.subject === '')).toEqual([]);
    expect(entries.map((entry) => entry.approver)).not.toContain(FORGED);

    const operations = entries.map((entry) => entry.operation).filter((operation) => operation !== null);
    expect(operations).toEqual(['add', 'submit', 'approve']);
  });

  it('records the genuine approval with its true from/to, approver and full reason text', () => {
    const run = wingfoil(repo, 'memory', 'history', documentId, '--format', 'json');
    const entries = (JSON.parse(run.stdout) as { entries: HistoryEntry[] }).entries;
    const approval = entries[entries.length - 1];

    expect(approval?.operation).toBe('approve');
    expect(approval?.from).toBe('pending');
    expect(approval?.to).toBe('approved');
    expect(approval?.approver).toBe('WingFoil Test <wf-test@example.invalid> (approver)');
    // Round-tripped whole (AC3, first branch): nothing stripped, nothing truncated at the 0x1e.
    expect(approval?.reason).toBe(reason);
  });
});
