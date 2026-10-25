/**
 * task-294 AC 3 (red-first) — `wingfoil workflow adopt` through the REAL compiled `dist/cli.js` (`spec-008` §2
 * `--dry-run`, §12; `spec-017` §7.11, §10; design "The command", D5, D8), on the fixture of
 * `test/core/helpers/adopt-fixture.ts`:
 *
 * - `--dry-run` of the single form plans the empty commit (`paths: []`, `diff: ''`, the full message with the
 *   `Reason:` block and the three trailers before `WingFoil-Version:`) and writes nothing; `--plan --apply
 *   --dry-run` plans the first adoption only; `--plan --dry-run` prints the plan itself;
 * - every usage refusal exits 2 with its `spec-008` §12 text on stderr, writing nothing;
 * - `--plan --apply` by a non-approver is refused even when nothing is left to write (REQ-SEC-03, D8);
 * - the console output, `--plan`'s uncommitted-input warning on stderr (D5), and `--help`.
 *
 * At red the CLI answers `error: unknown command 'adopt'` (exit 2): every exit-2 pin checks its own text, so
 * none passes for that reason.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { malformedElementRefMessage } from '../../src/core/element-ref';
import { buildLifeRepo, element, INSTANCE, RL_V1_PATH, SUBJECT_RL_V1 } from '../core/helpers/adopt-fixture';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const MORGAN_ENV = { GIT_AUTHOR_NAME: 'Morgan', GIT_AUTHOR_EMAIL: 'morgan@example.invalid' };

function wingfoil(cwd: string, args: readonly string[], env: Record<string, string> = {}): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...process.env, ...env } });
}

/** A fixture step that must succeed. */
function step(cwd: string, ...args: string[]): SpawnedRun {
  const run = wingfoil(cwd, args);
  if (run.status !== 0) throw new Error(`fixture bug: wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return run;
}

interface Plan {
  readonly dryRun: boolean;
  readonly subject: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly diff: string;
}

const SINGLE = ['workflow', 'adopt', INSTANCE, '--step', 'life.seed', '--element', 'release-line:rl-v1', '--reason', 'created by hand before the engine'];

describe('task-294 — workflow adopt through dist/cli.js', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function started(options?: Parameters<typeof buildLifeRepo>[0]): string {
    const root = buildLifeRepo(options);
    roots.push(root);
    step(root, 'workflow', 'start', 'life');
    return root;
  }

  describe('--dry-run (spec-008 §2)', () => {
    it('the single form plans the empty commit — paths [], an empty diff, the full message — and writes nothing', () => {
      const root = started();
      const before = snapshotPersistence(root);

      const run = wingfoil(root, [...SINGLE, '--dry-run', '--format', 'json']);

      expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
      assertPersistenceUnchanged(root, before, 'adopt --dry-run');
      const plan = JSON.parse(run.stdout) as Plan;
      expect(plan).toMatchObject({ dryRun: true, subject: SUBJECT_RL_V1, paths: [], diff: '' });
      expect(
        plan.message.startsWith(
          `${SUBJECT_RL_V1}\n\nReason: created by hand before the engine\n\nWingFoil-Instance: ${INSTANCE}\nWingFoil-Step: life.seed\nWingFoil-Adopted: release-line:rl-v1\nWingFoil-Version: `,
        ),
      ).toBe(true);
    });

    it('--plan --apply --dry-run plans the first adoption commit only, with its Approver: line, and writes nothing', () => {
      const root = started({ phases: ['seed', 'adr', 'close'], documents: { 'docs/adrs/adr-1.md': element('adr', 'adr-1', 'accepted') } });
      const before = snapshotPersistence(root);

      const run = wingfoil(root, ['workflow', 'adopt', INSTANCE, '--plan', '--apply', '--reason', 'adoption of the pre-engine state', '--dry-run', '--format', 'json'], MORGAN_ENV);

      expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
      assertPersistenceUnchanged(root, before, 'adopt --plan --apply --dry-run');
      const plan = JSON.parse(run.stdout) as Plan;
      expect(plan).toMatchObject({ dryRun: true, subject: SUBJECT_RL_V1, paths: [], diff: '' });
      expect(plan.message).toContain('\n\nApprover: Morgan <morgan@example.invalid> (approver)\nReason: adoption of the pre-engine state\n\n');
    });

    it('--plan --dry-run prints the plan itself: --plan writes nothing to plan', () => {
      const root = started();
      const before = snapshotPersistence(root);

      const run = wingfoil(root, ['workflow', 'adopt', INSTANCE, '--plan', '--dry-run', '--format', 'json']);

      expect(run.status).toBe(0);
      assertPersistenceUnchanged(root, before, 'adopt --plan --dry-run');
      const value = JSON.parse(run.stdout) as { steps: readonly { step: string }[]; dryRun?: unknown };
      expect(value.dryRun).toBeUndefined();
      expect(value.steps.map((entry) => entry.step)).toEqual(['life.seed']);
    });
  });

  describe('usage refusals: exit 2, the spec-008 §12 text on stderr, nothing written', () => {
    it.each([
      ['--apply without --plan', ['--apply', '--reason', 'x'], 'invalid flag combination: --apply needs --plan'],
      ['--plan with --step', ['--plan', '--step', 'life.seed'], 'invalid flag combination: --plan proposes every step; drop --step and --element'],
      ['--plan with --element', ['--plan', '--element', 'release-line:rl-v1'], 'invalid flag combination: --plan proposes every step; drop --step and --element'],
      ['none of --plan, --step, --element', ['--reason', 'x'], 'missing required argument: --step, --element or --plan'],
      ['a malformed --element', ['--element', 'nocolon', '--reason', 'x'], malformedElementRefMessage('nocolon')],
      ['the single form without --reason', ['--step', 'life.seed', '--element', 'release-line:rl-v1'], 'missing required argument: --reason'],
      ['--plan --apply without --reason', ['--plan', '--apply'], 'missing required argument: --reason'],
      ['a blank --reason', ['--step', 'life.seed', '--element', 'release-line:rl-v1', '--reason', ' '], 'invalid flag value: --reason must not be blank'],
    ])('%s', (_label, args, message) => {
      const root = started();
      const before = snapshotPersistence(root);

      const run = wingfoil(root, ['workflow', 'adopt', INSTANCE, ...args]);

      expect(run.status).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toContain(`error: ${message}`);
      assertPersistenceUnchanged(root, before, message);
    });

    it('a missing <ref>', () => {
      const root = started();
      const before = snapshotPersistence(root);

      const run = wingfoil(root, ['workflow', 'adopt', '--plan']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('error: missing required argument: <ref>');
      assertPersistenceUnchanged(root, before, 'missing ref');
    });
  });

  it('--plan --apply by a non-approver is refused even with nothing left to write (REQ-SEC-03, design D8)', () => {
    const root = started();
    step(root, ...SINGLE);
    const before = snapshotPersistence(root);

    const run = wingfoil(root, ['workflow', 'adopt', INSTANCE, '--plan', '--apply', '--reason', 'again']);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('error: user not authorized to apply adoptions in bulk');
    assertPersistenceUnchanged(root, before, 'bulk without authority, nothing to write');
  });

  it('the single form writes the commit and prints the workflow, the adoption and the next step', () => {
    const root = started();

    const run = wingfoil(root, SINGLE);

    expect(run.status).toBe(0);
    const sha = git(root, ['rev-parse', 'HEAD']).trim();
    expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe(SUBJECT_RL_V1);
    expect(run.stdout.startsWith(`workflow: life (${INSTANCE})\nadopted: release-line:rl-v1 into life.seed (${sha})\n`)).toBe(true);
    expect(run.stdout).toContain('life.close@release-line:rl-v1');
  });

  it('--plan prints one line per listed step', () => {
    const root = started();
    const run = wingfoil(root, ['workflow', 'adopt', INSTANCE, '--plan']);
    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 0, stdout: `workflow: life (${INSTANCE})\nstep life.seed: 1 candidate release-line:rl-v1\n`, stderr: '' });
  });

  it('--plan reports an uncommitted change to what it reads as a warning on stderr, and answers from HEAD (design D5)', () => {
    const root = started();
    writeFileSync(join(root, RL_V1_PATH), element('release-line', 'rl-v1', 'active', { version: 'v1' }));

    const run = wingfoil(root, ['workflow', 'adopt', INSTANCE, '--plan', '--format', 'json']);

    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(/^warning: /m);
    expect(run.stderr).toContain(RL_V1_PATH);
    const value = JSON.parse(run.stdout) as { steps: readonly { candidates: readonly { status: string }[] }[] };
    expect(value.steps[0]!.candidates[0]!.status).toBe('planning');
  });

  it('--help describes the command and lists its options and --dry-run', () => {
    const root = started();
    const run = wingfoil(root, ['workflow', 'adopt', '--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('record which step of an open workflow an existing element counts as created by');
    for (const option of ['--step <key>', '--element <type:id>', '--plan', '--apply', '--reason <text>', '--dry-run']) expect(run.stdout).toContain(option);
  });
});
