/**
 * task-295 AC 2–3 (P4.21; `spec-017` §7.12, §10; `spec-008` §2, §12; design D6) — `wingfoil workflow rekey` on the
 * compiled CLI (`dist/cli.js`), on the fixture of `test/core/helpers/rekey-fixture` with `GIT_AUTHOR_*` /
 * `GIT_COMMITTER_*` naming Morgan, the approver:
 *
 * - AC 3: `--dry-run --format json` prints `commitEmpty`'s plan — `dryRun: true`, the subject, `paths: []`, an empty
 *   `diff`, the full message — and writes nothing; a refused dry run exits with the refusal; a dry run of a mapping
 *   already recorded prints what the real run prints (the `RekeyResult`, `commit: null`, `spec-008` §2);
 * - AC 2: the usage errors (exit 2, each pinned by its `error:` line, since today's `unknown command 'rekey'` also
 *   exits 2), `--help`, and the D6 console of a real run;
 * - AC 4 (the governance clause): the record a real run writes passes `scripts/check-governance.cjs`.
 *
 * Red until `workflow rekey` is registered: the CLI answers `error: unknown command 'rekey'`.
 */
import { checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { buildRekeyRepo, MORGAN } from '../core/helpers/rekey-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const MORGAN_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: MORGAN.name,
  GIT_AUTHOR_EMAIL: MORGAN.email,
  GIT_COMMITTER_NAME: MORGAN.name,
  GIT_COMMITTER_EMAIL: MORGAN.email,
};

const REKEY = ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed', '--to', 'life.seed-line', '--reason', 'phase renamed'] as const;
const SUBJECT = 'workflow: rekey life-1-plan life.seed life.seed-line';
const MESSAGE_TAIL =
  'Approver: Morgan <morgan@example.invalid> (approver)\nReason: phase renamed\n\n' +
  'WingFoil-Instance: life-1-plan\nWingFoil-Rekey-From: life.seed\nWingFoil-Rekey-To: life.seed-line\nWingFoil-Version: ';

function cli(repo: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd: repo, env: MORGAN_ENV });
}

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();
const firstLine = (text: string): string => text.split('\n')[0] ?? '';

describe('task-295 — wingfoil workflow rekey on the compiled CLI', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await buildRekeyRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC 3 — --dry-run --format json: exit 0, the plan (paths [], empty diff, the full message), nothing written', () => {
    const unchanged = snapshotPersistence(repo);
    const run = cli(repo, [...REKEY, '--dry-run', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const plan = JSON.parse(run.stdout) as { dryRun: boolean; subject: string; message: string; paths: string[]; diff: string };
    expect(plan).toMatchObject({ dryRun: true, subject: SUBJECT, paths: [], diff: '' });
    expect(plan.message).toContain(MESSAGE_TAIL);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC 3 — a refused dry run exits with the refusal: --to life.nope → exit 1, "error: unknown step: life.nope"', () => {
    const unchanged = snapshotPersistence(repo);
    const run = cli(repo, ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed', '--to', 'life.nope', '--reason', 'phase renamed', '--dry-run']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: unknown step: life.nope\n']);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC 3 — a dry run of a mapping already recorded prints what the real run prints: the RekeyResult, commit null', () => {
    const real = cli(repo, [...REKEY]);
    expect([real.status, real.stderr]).toEqual([0, '']);
    const unchanged = snapshotPersistence(repo);
    const run = cli(repo, [...REKEY, '--dry-run', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(Object.keys(value)).toEqual(['baseline', 'instance', 'from', 'to', 'remapped', 'commit', 'next']);
    expect(value).toMatchObject({ from: 'life.seed', to: 'life.seed-line', remapped: 0, commit: null });
    assertPersistenceUnchanged(repo, unchanged);
  });

  it.each<[string, string, readonly string[]]>([
    ['no <ref>', 'error: missing required argument: <ref>', ['workflow', 'rekey', '--from', 'life.seed', '--to', 'life.seed-line', '--reason', 'r']],
    ['no --from', 'error: missing required argument: --from', ['workflow', 'rekey', 'life-1-plan', '--to', 'life.seed-line', '--reason', 'r']],
    ['no --to', 'error: missing required argument: --to', ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed', '--reason', 'r']],
    ['--from with an @<scope> suffix', 'error: invalid flag value: --from must be <workflow>.<phase>', ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed@task:task-1', '--to', 'life.seed-line', '--reason', 'r']],
    ['--to with two dots', 'error: invalid flag value: --to must be <workflow>.<phase>', ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed', '--to', 'life.x.y', '--reason', 'r']],
    ['no --reason', 'error: missing required argument: --reason', ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed', '--to', 'life.seed-line']],
  ])('AC 2 — usage: %s → exit 2, "%s", nothing written', (_label, line, args) => {
    const unchanged = snapshotPersistence(repo);
    const run = cli(repo, args);
    expect([run.status, run.stdout, firstLine(run.stderr)]).toEqual([2, '', line]);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC 2 — --help: exit 0, the usage line names <ref>, and lists --from <key>, --to <key>, --reason <text>, --dry-run', () => {
    const run = cli(repo, ['workflow', 'rekey', '--help']);
    expect(run.status).toBe(0);
    expect(firstLine(run.stdout)).toMatch(/^Usage: wingfoil workflow rekey \[options\] <ref>$/);
    for (const option of ['--from <key>', '--to <key>', '--reason <text>', '--dry-run']) expect(run.stdout).toContain(option);
  });

  it('AC 2 — a real run without --format prints the D6 console: the instance, the rekeyed line with its commit, the next step', () => {
    const run = cli(repo, [...REKEY]);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const lines = run.stdout.split('\n');
    expect(lines[0]).toBe('workflow: life (life-1-plan)');
    expect(lines[1]).toBe(`rekeyed: life.seed -> life.seed-line, 1 record(s) remapped (${head(repo)})`);
    expect(lines[2]).toMatch(/^next step: life\.close(@|$)/);
  });

  it('AC 2 — the no-op console: "already rekeyed: <from> -> <to>, nothing written"', () => {
    expect(cli(repo, [...REKEY]).status).toBe(0);
    const before = head(repo);
    const run = cli(repo, [...REKEY]);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout.split('\n').slice(0, 2)).toEqual(['workflow: life (life-1-plan)', 'already rekeyed: life.seed -> life.seed-line, nothing written']);
    expect(head(repo)).toBe(before);
  });

  it('AC 4 (governance clause) — the record a real run writes passes check-governance: no finding, exit 0', () => {
    const base = head(repo);
    const run = cli(repo, [...REKEY]);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(SUBJECT);
    const report = checkGovernance(repo, { base });
    expect(report.findings).toEqual([]);
    expect(exitCodeFor(report)).toBe(0);
  });
});
