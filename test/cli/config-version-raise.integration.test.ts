/**
 * task-299 (`dl-174` (a), `spec-006` §6 item 7, `spec-002`, `spec-011` `roles.yaml` contract item 5,
 * `spec-017` §7.7–§7.8) end to end through the REAL compiled `dist/cli.js`, in a REAL `wingfoil init`-ed
 * throwaway project whose four versioned configuration files say `version: 1`:
 *
 * - AC1: `dna set|add|update|remove` (`--force` included), `directive assign` (`--force` included) and
 *   `workflow create|remove` raise the written file's `version:` by 0.1 read as a number (`1.9 → 2.0`),
 *   keeping the line's spacing and comment, adding no history entry; a file without `version:` gains
 *   none; a file written whole for the first time is written `version: 1.0`; a no-op writes nothing.
 * - AC2: `--dry-run` shows the raised version in its plan's diff, and writes nothing.
 * - AC4: on a scratch branch, two tool writes to one versioned file pass `check:governance`'s `config`
 *   rule over `--base main` (it reports `1 → 1` before the change).
 *
 * Expected values are literal text, never computed with `raiseConfigVersion`. Red-first for every case
 * but those labelled (characterization). Spawned through `./helpers/spawn-cli`; `dist/` is built once by
 * jest's `globalSetup` (`bug-003`). Deterministic (REQ-SYS-07): fixed fixture text, fixed steps.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkGovernance } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

const DNA = '.wingfoil/dna.yaml';
const ROLES = '.wingfoil/roles.yaml';
const WORKFLOWS = '.wingfoil/workflows.yaml';
const MEMORY = '.wingfoil/memory.yaml';

function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

/** Run a command that must succeed; its stderr is part of the failure message when it does not. */
function ok(cwd: string, ...args: readonly string[]): SpawnedRun {
  const run = wingfoil(cwd, ...args);
  expect({ args, status: run.status, stderr: run.status === 0 ? '' : run.stderr }).toEqual({ args, status: 0, stderr: '' });
  return run;
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

const read = (repo: string, path: string): string => readFileSync(join(repo, path), 'utf-8');

/** The first top-level `version:` line of `path` at `rev`, or `undefined` when it declares none. */
function versionLineAt(repo: string, rev: string, path: string): string | undefined {
  return git(repo, ['show', `${rev}:${path}`])
    .split('\n')
    .find((line) => /^version:/.test(line));
}

/** Overwrite `path` with `text` and commit it alone as a fixture commit. */
function commitFixture(repo: string, path: string, text: string, message: string): void {
  writeFileSync(join(repo, path), text, 'utf-8');
  git(repo, ['add', path]);
  git(repo, ['commit', '--quiet', '-m', message]);
}

/** `text` with its `^version: 1$` line replaced by `line` — the guard fails loudly if the scaffold moved. */
function withVersionLine(text: string, line: string): string {
  const edited = text.replace(/^version: 1$/m, line);
  if (edited === text) throw new Error('fixture bug: the scaffold no longer says `version: 1`');
  return edited;
}

/**
 * The newest commit's changes to `path`, split into its `version:` lines and every other changed line
 * (`--unified=0`, file headers dropped).
 */
function changesOf(repo: string, path: string): { removedVersion: string[]; addedVersion: string[]; otherAdded: string[]; otherRemoved: string[] } {
  const lines = git(repo, ['diff', '--unified=0', '--no-color', 'HEAD~1', 'HEAD', '--', path]).split('\n');
  const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1));
  const added = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
  const isVersion = (line: string): boolean => /^version:/.test(line);
  return {
    removedVersion: removed.filter(isVersion),
    addedVersion: added.filter(isVersion),
    otherAdded: added.filter((line) => !isVersion(line)),
    otherRemoved: removed.filter((line) => !isVersion(line)),
  };
}

/**
 * Assert the newest commit replaced `path`'s version line `from` with `to` — one `-`/`+` pair — and that
 * no other added line records the revision (no history entry: nothing else names a version).
 */
function expectRaised(repo: string, path: string, from: string, to: string): void {
  const changes = changesOf(repo, path);
  expect({ path, removed: changes.removedVersion, added: changes.addedVersion }).toEqual({ path, removed: [from], added: [to] });
  expect(changes.otherAdded.filter((line) => /version/i.test(line))).toEqual([]);
}

/** The newest commit's paths, sorted. */
const committedPaths = (repo: string): string[] =>
  gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])
    .split('\n')
    .filter((line) => line.length > 0)
    .sort();

interface Plan {
  readonly dryRun: boolean;
  readonly paths: readonly string[];
  readonly diff: string;
}

describe('a tool write raises the configuration file\'s version: (task-299, dl-174 (a))', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    ok(repo, 'init', '--template', 'scrum');
    // Guard: the scaffold's four versioned files say `version: 1` (W1-4: the scaffold is not raised).
    for (const path of [DNA, ROLES, WORKFLOWS, MEMORY]) expect(versionLineAt(repo, 'HEAD', path)).toBe('version: 1');
  });

  afterEach(() => removeTempDir(repo));

  it('AC1: dna set, add, update and remove each raise dna.yaml\'s version — 1.1, 1.2, 1.3, 1.4 — in a commit of that file alone', () => {
    ok(repo, 'dna', 'set', 'project.name', '--value', 'Demo');
    expect(committedPaths(repo)).toEqual([DNA]);
    expectRaised(repo, DNA, 'version: 1', 'version: 1.1');

    ok(repo, 'dna', 'add', 'modules', '--value', 'api', '--entry-path', 'src/api');
    expect(committedPaths(repo)).toEqual([DNA]);
    expectRaised(repo, DNA, 'version: 1.1', 'version: 1.2');

    ok(repo, 'dna', 'update', 'modules.api', '--entry-description', 'd');
    expect(committedPaths(repo)).toEqual([DNA]);
    expectRaised(repo, DNA, 'version: 1.2', 'version: 1.3');

    ok(repo, 'dna', 'remove', 'modules.api');
    expect(committedPaths(repo)).toEqual([DNA]);
    expectRaised(repo, DNA, 'version: 1.3', 'version: 1.4');
    expect(versionLineAt(repo, 'HEAD', DNA)).toBe('version: 1.4');
  });

  it('AC1: dna add --force on a file the in-place editor cannot edit raises the version of the rewritten file', () => {
    const flow = read(repo, DNA).replace(/^paths:\n(?: {2}.*\n)+/m, 'paths: { sources: [src/], runs: [docs/runs/] }\n');
    expect(flow).not.toBe(read(repo, DNA)); // guard: the fixture rewrite matched
    commitFixture(repo, DNA, flow, 'fixture: flow-mapping paths');

    const run = ok(repo, 'dna', 'add', 'paths.tests', '--value', 'test/', '--force');

    expect(run.stderr).toMatch(/^warning: dna\.yaml was rewritten as a whole file \(--force\)/);
    expect(committedPaths(repo)).toEqual([DNA]);
    expect(versionLineAt(repo, 'HEAD', DNA)).toBe('version: 1.1');
  });

  it('AC1: 1.9 → 2.0 read as a number, the spacing and the trailing comment kept, in dna.yaml, roles.yaml and workflows.yaml', () => {
    for (const path of [DNA, ROLES, WORKFLOWS]) {
      writeFileSync(join(repo, path), withVersionLine(read(repo, path), 'version: 1.9   # rev note'), 'utf-8');
    }
    git(repo, ['add', DNA, ROLES, WORKFLOWS]);
    git(repo, ['commit', '--quiet', '-m', 'fixture: version 1.9 with a comment']);

    ok(repo, 'dna', 'set', 'project.name', '--value', 'Demo');
    expectRaised(repo, DNA, 'version: 1.9   # rev note', 'version: 2.0   # rev note');

    ok(repo, 'directive', 'assign', '--directive', 'traceability', '--role', 'qa');
    expectRaised(repo, ROLES, 'version: 1.9   # rev note', 'version: 2.0   # rev note');

    ok(repo, 'workflow', 'create', 'probe-flow', '--kind', 'main');
    expectRaised(repo, WORKFLOWS, 'version: 1.9   # rev note', 'version: 2.0   # rev note');
  });

  it('AC1: directive assign raises roles.yaml\'s version, in place and under --force on a flow-style file', () => {
    ok(repo, 'directive', 'assign', '--directive', 'traceability', '--role', 'qa');
    expect(committedPaths(repo)).toEqual([ROLES]);
    expectRaised(repo, ROLES, 'version: 1', 'version: 1.1');

    commitFixture(repo, ROLES, 'version: 1.0\n\nassignments: {developer: [code-quality]}\nglobal: ["documentation"]\n', 'fixture: flow-style roles.yaml');
    const run = ok(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer', '--force');
    expect(run.stderr).toMatch(/^warning: roles\.yaml was rewritten as a whole file \(--force\)/);
    expect(committedPaths(repo)).toEqual([ROLES]);
    // The dump writes the number YAML read (1.0 → 1), then the write raises it.
    expect(read(repo, ROLES)).toBe('version: 1.1\nassignments:\n  developer:\n    - code-quality\n    - testing\nglobal:\n  - documentation\n');
  });

  it('AC1: workflow create and workflow remove raise workflows.yaml\'s version — 1.1, then 1.2', () => {
    ok(repo, 'workflow', 'create', 'probe-flow', '--kind', 'main');
    expect(committedPaths(repo)).toEqual([WORKFLOWS, '.wingfoil/workflows/custom/probe-flow.yaml']);
    expectRaised(repo, WORKFLOWS, 'version: 1', 'version: 1.1');

    ok(repo, 'workflow', 'remove', 'probe-flow');
    expect(committedPaths(repo)).toEqual([WORKFLOWS, '.wingfoil/workflows/custom/probe-flow.yaml']);
    expectRaised(repo, WORKFLOWS, 'version: 1.1', 'version: 1.2');
  });

  it('AC1: a file without version: gains none (roles.yaml, workflows.yaml); the same command on the file with the line raises it', () => {
    // Positive half first, on the scaffold: the line is raised.
    ok(repo, 'directive', 'assign', '--directive', 'traceability', '--role', 'qa');
    expect(versionLineAt(repo, 'HEAD', ROLES)).toBe('version: 1.1');
    ok(repo, 'workflow', 'create', 'with-version', '--kind', 'main');
    expect(versionLineAt(repo, 'HEAD', WORKFLOWS)).toBe('version: 1.1');

    // Both schemas make `version` optional (dna.yaml requires it): drop the line from both files.
    for (const path of [ROLES, WORKFLOWS]) {
      const text = read(repo, path);
      const without = text.replace(/^version: 1\.1\n/m, '');
      expect(without).not.toBe(text); // guard
      writeFileSync(join(repo, path), without, 'utf-8');
    }
    git(repo, ['add', ROLES, WORKFLOWS]);
    git(repo, ['commit', '--quiet', '-m', 'fixture: no version line']);

    ok(repo, 'directive', 'assign', '--directive', 'traceability', '--role', 'developer');
    expect(committedPaths(repo)).toEqual([ROLES]);
    expect(versionLineAt(repo, 'HEAD', ROLES)).toBeUndefined();
    ok(repo, 'workflow', 'create', 'without-version', '--kind', 'main');
    expect(versionLineAt(repo, 'HEAD', WORKFLOWS)).toBeUndefined();
  });

  it('AC1: directive assign with no roles.yaml writes it whole for the first time as version: 1.0', () => {
    git(repo, ['rm', '--quiet', ROLES]);
    git(repo, ['commit', '--quiet', '-m', 'fixture: no roles.yaml']);

    ok(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer');

    expect(committedPaths(repo)).toEqual([ROLES]);
    expect(git(repo, ['show', `HEAD:${ROLES}`]).startsWith('version: 1.0\n')).toBe(true);
  });

  it('AC1 (characterization): workflow create with no workflows.yaml writes it whole for the first time as version: 1.0', () => {
    git(repo, ['rm', '--quiet', WORKFLOWS]);
    git(repo, ['commit', '--quiet', '-m', 'fixture: no workflows.yaml']);

    ok(repo, 'workflow', 'create', 'probe-flow', '--kind', 'main');

    expect(git(repo, ['show', `HEAD:${WORKFLOWS}`]).startsWith('version: 1.0\n')).toBe(true);
  });

  it('AC1 (characterization): a write that changes nothing makes no commit and leaves the version line alone', () => {
    const sha = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    ok(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'qa'); // already bound in the scaffold
    ok(repo, 'dna', 'set', 'project.methodology', '--value', 'Scrum'); // the scaffold's own value

    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(sha);
    expect(versionLineAt(repo, 'HEAD', ROLES)).toBe('version: 1');
    expect(versionLineAt(repo, 'HEAD', DNA)).toBe('version: 1');
    assertPersistenceUnchanged(repo, unchanged);
  });

  describe('AC2: --dry-run shows the raised version in its diff and writes nothing', () => {
    function planOf(...args: readonly string[]): Plan {
      const before = snapshotPersistence(repo);
      const run = ok(repo, ...args, '--dry-run', '--format', 'json');
      assertPersistenceUnchanged(repo, before, 'dry run');
      const plan = JSON.parse(run.stdout) as Plan;
      expect(plan.dryRun).toBe(true);
      return plan;
    }

    const diffLines = (plan: Plan): string[] => plan.diff.split('\n');

    it.each<[string, readonly string[], string]>([
      ['dna set', ['dna', 'set', 'project.name', '--value', 'Demo'], DNA],
      ['directive assign', ['directive', 'assign', '--directive', 'traceability', '--role', 'qa'], ROLES],
      ['workflow create', ['workflow', 'create', 'dry-flow', '--kind', 'main'], WORKFLOWS],
    ])('%s: the plan\'s diff replaces version: 1 with version: 1.1', (_name, args, path) => {
      const plan = planOf(...args);
      expect(plan.paths).toContain(path);
      expect(diffLines(plan)).toEqual(expect.arrayContaining(['-version: 1', '+version: 1.1']));
    });

    it('workflow remove: the plan\'s diff replaces version: 1 with version: 1.1', () => {
      // A custom workflow nothing includes, added to the manifest by hand so the manifest stays at 1.
      writeFileSync(join(repo, '.wingfoil/workflows/custom/retired.yaml'), 'name: retired\nstartable: true\nphases:\n  - name: one\n    role: developer\n', 'utf-8');
      writeFileSync(join(repo, WORKFLOWS), `${read(repo, WORKFLOWS)}  - workflows/custom/retired.yaml\n`, 'utf-8');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '--quiet', '-m', 'fixture: a removable custom workflow']);
      expect(versionLineAt(repo, 'HEAD', WORKFLOWS)).toBe('version: 1'); // guard

      const plan = planOf('workflow', 'remove', 'retired');
      expect(plan.paths).toContain(WORKFLOWS);
      expect(diffLines(plan)).toEqual(expect.arrayContaining(['-version: 1', '+version: 1.1']));
    });
  });

  it('AC4: on a scratch branch two tool writes to dna.yaml pass the governance check\'s config rule; a hand edit without a bump still fails it', () => {
    git(repo, ['checkout', '--quiet', '-b', 'scratch']);
    ok(repo, 'dna', 'set', 'project.name', '--value', 'Alpha');
    ok(repo, 'dna', 'set', 'project.name', '--value', 'Beta');

    const configFindings = (): Array<{ message: string; gated: boolean }> =>
      checkGovernance(repo, { base: 'main' })
        .findings.filter((finding) => finding.rule === 'config')
        .map(({ message, gated }) => ({ message, gated }));

    expect(configFindings()).toEqual([]);

    // Positive half: a hand edit of memory.yaml's comment with no bump is still one config finding.
    commitFixture(repo, MEMORY, `${read(repo, MEMORY)}# a hand-written comment\n`, 'chore: comment memory.yaml by hand');
    const findings = configFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain(MEMORY);
  });
});
