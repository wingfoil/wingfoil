/**
 * task-339 AC 2 (red-first; `spec-016` §3.3 step 14 and its `--dry-run` paragraph, `spec-008` §2's `--dry-run` row,
 * both as amended at the design gate; `dl-223` (b), Action 3; approver rulings D2 (a), D3 (a)) — on the compiled CLI,
 * the run's permission fragment is appended to the launch argv and printed by `--dry-run`.
 *
 * The fixture is `seed()` with a custom `perm` adapter derived inline from the fake's (`manifest('perm', …)`;
 * `fake.yaml` itself is unchanged, D10): `launch.headless.permissions` the map `{ default: D, reviewer: R }`,
 * `launch.interactive.permissions` the fragment `W`, and the agent `Fake Agent` given `adapter: perm`.
 *
 * - (i) a headless reviewer dry run under `--format json`: exit `0`, stderr empty, the plan's keys
 *   `dryRun, subject, paths, run, launch, bootstrap` and `launch: { kind: 'headless', permissions: R }`;
 * - (ii) the same under `--format console`: exit `0`, stderr empty, stdout the same document;
 * - (iii) a role the map does not name (`developer`): the `default` fragment;
 * - (iv) the interactive kind: `launch.interactive.permissions`;
 * - (v) a real headless reviewer run: the fake's recorded argv has `R` between the headless args and
 *   `session.assign_args`;
 * - (vi) the unchanged `fake` adapter: `launch: { kind: 'interactive', permissions: [] }`.
 *
 * Today the strict schema refuses the `perm` manifest (`agent execute --element task:task-202-explicit-override
 * --role reviewer --headless --dry-run --format json` on a replica of this fixture → exit `1`, `adapter 'perm':
 * launch.interactive: Unrecognized key: "permissions"`), and the plan has no `launch` key. The empty stderr of a
 * dry run is copied from a real run of today's build on the unchanged fake (the task's red notes name the command).
 */
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, manifest, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, headOf, launchArgv, records, removeRunScratch } from './helpers/agent-execute-cli';

/** The design's fragments: a reading posture, the default, and a writing one. */
const R = ['--allow', 'read'];
const D = ['--allow', 'none'];
const W = ['--allow', 'write', '--deny', 'push'];

/** `fake.yaml` with the interactive fragment `W` and the headless map `{ default: D, reviewer: R }`. */
const PERMISSIONS = (text: string): string =>
  text
    .replace('    terminal: optional\n', '    terminal: optional\n    permissions: [ --allow, write, --deny, push ]\n')
    .replace('    output: json\n', '    output: json\n    permissions:\n      default: [ --allow, none ]\n      reviewer: [ --allow, read ]\n');

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

function permRepo(): string {
  const repo = seed((root) => {
    writeFixtureFile(root, '.wingfoil/agents/custom/perm.yaml', manifest('perm', PERMISSIONS));
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: perm'));
  });
  repos.push(repo);
  return repo;
}

const PLAN_KEYS = ['dryRun', 'subject', 'paths', 'run', 'launch', 'bootstrap'];

describe('task-339 AC 2 — --dry-run prints the launch kind and the fragment of the run\'s role (dl-223 Action 3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = permRepo();
  });

  it('(i) headless reviewer, --format json: exit 0, stderr empty, the plan gains launch { kind: headless, permissions: R }', () => {
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'reviewer', '--headless', '--dry-run', '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const plan = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(Object.keys(plan)).toEqual(PLAN_KEYS);
    expect(plan['launch']).toEqual({ kind: 'headless', permissions: R });
    expect(plan).toMatchObject({ dryRun: true, run: { role: 'reviewer', adapter: 'custom/perm' } });
    expect(run.fake).toEqual([]);
    expect(headOf(repo)).toBe(before);
  });

  it('(ii) the same with --format console: exit 0, stderr empty, stdout the same document', () => {
    const json = execute(repo, ['--element', TASK_REF, '--role', 'reviewer', '--headless', '--dry-run', '--format', 'json']);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'reviewer', '--headless', '--dry-run', '--format', 'console']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual(JSON.parse(json.stdout));
    expect((JSON.parse(run.stdout) as Record<string, unknown>)['launch']).toEqual({ kind: 'headless', permissions: R });
  });

  it('(iii) a role the map does not name (developer): the default fragment', () => {
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--dry-run', '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as Record<string, unknown>)['launch']).toEqual({ kind: 'headless', permissions: D });
  });

  it('(iv) the interactive kind (no --headless): launch.interactive.permissions', () => {
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--dry-run', '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as Record<string, unknown>)['launch']).toEqual({ kind: 'interactive', permissions: W });
  });
});

describe('task-339 AC 2 — the launch appends the fragment of the run\'s role (spec-016 §3.3 step 14)', () => {
  it('(v) a real headless reviewer run: exit 0, R between the headless args and session.assign_args', () => {
    const repo = permRepo();
    const run = execute(repo, ['--element', TASK_REF, '--role', 'reviewer', '--headless']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    const argv = launchArgv(run);
    expect(argv).toEqual(['--headless', '--mcp-config', expect.any(String), '--prompt', expect.stringContaining(`WingFoil run ${TASK_ID}/adhoc/1:`), ...R, '--session-id', expect.any(String)]);
    expect(records(repo, TASK_ID)).toEqual([expect.objectContaining({ id: `${TASK_ID}/adhoc/1`, role: 'reviewer', adapter: 'custom/perm', result: 'n/a', exit_status: 0 })]);
  });
});

describe('task-339 AC 2 — an adapter with no permissions: an empty fragment in the plan', () => {
  it('(vi) the unchanged fake adapter, --dry-run: launch { kind: interactive, permissions: [] }', () => {
    const repo = seed();
    repos.push(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--dry-run', '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const plan = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(Object.keys(plan)).toEqual(PLAN_KEYS);
    expect(plan['launch']).toEqual({ kind: 'interactive', permissions: [] });
  });
});
