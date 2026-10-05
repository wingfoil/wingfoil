/**
 * task-172-confine-config-writers-dna-set-directive-create-directive — the four **configuration**
 * writers refuse a target that leads outside the project root, before they write (REQ-SEC-06,
 * `bug-121-config-write-paths-have-no-confinement-pre-flight`).
 *
 * `task-105`/`task-106` confined the Memory write paths and `task-102` confined `directive remove`;
 * none of `dna set` (and the other `dna` verbs, which share `runDnaMutation`), `directive create`,
 * `directive assign` (`updateRoleAssignments`) or `wingfoil init` called `requireConfinedWriteTarget`.
 * `task-131` closed the *symlinked directory* half for the first three (a target beyond a symlink is
 * uninspectable, `bug-118`) and deliberately left the **leaf** alone; a leaf that is itself a link is
 * exactly what `writeFileSync` follows. `init` (`initWingfoilProject`, the real `wingfoil init`) had
 * neither check: an empty `.wingfoil` symlinked elsewhere passes its already-initialized refusal, and
 * the whole scaffold landed at the link's destination before `git add` failed.
 *
 * The cases, one per writer, each with its target symlinked OUTSIDE the root:
 * - `dna set` — `.wingfoil/dna.yaml` is a committed link to a file in a second `mkdtemp`;
 * - `directive create` — `.wingfoil/directives/custom/<name>.md` is a committed DANGLING link
 *   (`existsSync` reads it as free, so the CONFLICT check never fires — `bug-121`'s 216 bytes);
 * - `directive assign` — `.wingfoil/roles.yaml` is a committed link to an outside copy;
 * - `init` — `.wingfoil` itself is a link to an empty outside directory (the only shape a target can
 *   take for `init`: it refuses an initialized `.wingfoil`, so no file can pre-exist under it).
 *
 * The load-bearing assertions are the outside bytes and `git rev-parse HEAD`, never only a message.
 * Every fixture is a throwaway temp repo; "outside" is a second `mkdtemp`. Deterministic
 * (REQ-SYS-07): fixed fixture text and identity, fixed case order, no clock.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, initWingfoilStorage } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

type AnyFn = CoreFn<unknown, unknown>;

function op(module: string, name: string): AnyFn {
  const operation = CORE_MODULES.find((entry) => entry.name === module)?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered on the "${module}" module`);
  return operation.fn as AnyFn;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);
const errorMessage = (result: CoreResult<unknown>): string => (result.ok ? '<result was ok>' : result.error.message);

/** A refusal: not ok, exit 1 (VALIDATION, spec-005 §1), the path named, no child-process text. */
function expectRefusal(result: CoreResult<unknown>, path: string): void {
  expect(errorMessage(result)).toContain(path);
  expect(result.ok).toBe(false);
  expect(exitCodeForResult(result)).toBe(1);
  expect(errorMessage(result)).not.toContain('Command failed');
}

const DNA = '.wingfoil/dna.yaml';
const ROLES = '.wingfoil/roles.yaml';
const CUSTOM_DIR = '.wingfoil/directives/custom';

/** The REAL `wingfoil init` Scrum scaffold in a temp repo. */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

/**
 * Replace the committed file `relativePath` by a committed symlink to `destination` (absolute),
 * which receives the file's current bytes. Returns those bytes.
 */
function linkFileTo(repo: string, relativePath: string, destination: string): string {
  const bytes = readFileSync(join(repo, relativePath), 'utf-8');
  writeFileSync(destination, bytes);
  rmSync(join(repo, relativePath));
  symlinkSync(destination, join(repo, relativePath));
  commitAll(repo, `fixture: link ${relativePath}`);
  return bytes;
}

describe('the config writers refuse a target symlinked outside the project root, before writing (bug-121)', () => {
  let repo: string;
  let outside: string;

  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
  });
  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  describe('on an initialized project', () => {
    beforeEach(() => {
      repo = makeInitializedRepo();
    });

    it('dna set — exits 1, the outside dna.yaml is byte-identical, no commit', async () => {
      const target = join(outside, 'dna.yaml');
      const bytes = linkFileTo(repo, DNA, target);
      const before = head(repo);

      const result = (await op('dna', 'dnaSet')({
        root: repo,
        positionals: ['project.name'],
        options: { value: 'Renamed' },
      })) as CoreResult<unknown>;

      expectRefusal(result, DNA);
      expect(errorMessage(result)).toContain('symbolic link');
      expect(readFileSync(target, 'utf-8')).toBe(bytes);
      expect(head(repo)).toBe(before);
    });

    it('dna set — a dna.yaml linked to a file INSIDE the project is refused too: the write would follow the link', async () => {
      const target = join(repo, 'elsewhere-dna.yaml');
      const bytes = linkFileTo(repo, DNA, target);
      const before = head(repo);

      const result = (await op('dna', 'dnaSet')({
        root: repo,
        positionals: ['project.name'],
        options: { value: 'Renamed' },
      })) as CoreResult<unknown>;

      expectRefusal(result, DNA);
      expect(readFileSync(target, 'utf-8')).toBe(bytes);
      expect(head(repo)).toBe(before);
    });

    it('directive create — through a committed DANGLING link: exits 1, nothing is created outside, no commit', async () => {
      const target = join(outside, 'delta.md');
      symlinkSync(target, join(repo, `${CUSTOM_DIR}/delta.md`));
      commitAll(repo, 'fixture: dangling directive link');
      const before = head(repo);

      const result = (await op('directive', 'directiveCreate')({ root: repo, options: { name: 'delta' } })) as CoreResult<unknown>;

      expectRefusal(result, `${CUSTOM_DIR}/delta.md`);
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(outside)).toEqual([]);
      expect(head(repo)).toBe(before);
    });

    it('directive assign — exits 1, the outside roles.yaml is byte-identical, no commit', async () => {
      const target = join(outside, 'roles.yaml');
      const bytes = linkFileTo(repo, ROLES, target);
      const before = head(repo);

      const result = (await op('directive', 'directiveAssign')({
        root: repo,
        options: { directive: 'architecture', role: 'developer' },
      })) as CoreResult<unknown>;

      expectRefusal(result, ROLES);
      expect(errorMessage(result)).toContain('symbolic link');
      expect(readFileSync(target, 'utf-8')).toBe(bytes);
      expect(head(repo)).toBe(before);
    });
  });

  describe('init — `.wingfoil` is a link to an empty directory', () => {
    /** A repo with one commit (so HEAD exists) and `.wingfoil` linked to `destination`, uncommitted. */
    const repoWithLinkedConfig = (destination: string): string => {
      const fresh = makeTempGitRepo();
      writeFixtureFile(fresh, 'README.md', 'fixture\n');
      commitAll(fresh, 'fixture: first commit');
      mkdirSync(destination, { recursive: true });
      symlinkSync(destination, join(fresh, '.wingfoil'));
      return fresh;
    };

    it('initWingfoilProject (`wingfoil init`) — outside: exits 1, the outside directory stays empty, no commit', () => {
      const destination = join(outside, 'cfg');
      repo = repoWithLinkedConfig(destination);
      const before = head(repo);

      const result = initWingfoilProject(repo, 'Scrum');

      expectRefusal(result, '.wingfoil/');
      expect(errorMessage(result)).toContain('outside the project root');
      expect(readdirSync(destination)).toEqual([]);
      expect(head(repo)).toBe(before);
    });

    it('initWingfoilProject — inside (same class, bug-118): exits 1 before writing, no commit', () => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, 'README.md', 'fixture\n');
      commitAll(repo, 'fixture: first commit');
      const destination = join(repo, 'cfg-real');
      mkdirSync(destination);
      symlinkSync(destination, join(repo, '.wingfoil'));
      const before = head(repo);

      const result = initWingfoilProject(repo, 'Scrum');

      expectRefusal(result, '.wingfoil/');
      expect(errorMessage(result)).toContain('symbolic link');
      expect(readdirSync(destination)).toEqual([]);
      expect(head(repo)).toBe(before);
    });

    it('initWingfoilStorage — outside: exits 1, the outside directory stays empty, no commit', () => {
      const destination = join(outside, 'cfg');
      repo = repoWithLinkedConfig(destination);
      const before = head(repo);

      const result = initWingfoilStorage(repo);

      expectRefusal(result, '.wingfoil/');
      expect(readdirSync(destination)).toEqual([]);
      expect(head(repo)).toBe(before);
    });
  });
});

describe('characterization: in-root writes are unchanged (task-172 AC2)', () => {
  let repo: string;

  afterEach(() => {
    removeTempDir(repo);
  });

  it('init, dna set, directive create and directive assign each still write and commit their one path', async () => {
    repo = makeTempGitRepo();
    const init = initWingfoilProject(repo, 'Scrum');
    expect(init.ok).toBe(true);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');

    const set = (await op('dna', 'dnaSet')({
      root: repo,
      positionals: ['project.name'],
      options: { value: 'Renamed' },
    })) as CoreResult<unknown>;
    expect(set.ok).toBe(true);
    expect(gitOut(repo, ['show', `HEAD:${DNA}`])).toContain('Renamed');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(DNA);

    const create = (await op('directive', 'directiveCreate')({ root: repo, options: { name: 'delta' } })) as CoreResult<unknown>;
    expect(create.ok).toBe(true);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(`${CUSTOM_DIR}/delta.md`);

    const assign = (await op('directive', 'directiveAssign')({
      root: repo,
      options: { directive: 'delta', role: 'developer' },
    })) as CoreResult<unknown>;
    expect(assign.ok).toBe(true);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
    expect(gitOut(repo, ['show', `HEAD:${ROLES}`])).toContain('delta');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('initWingfoilStorage still scaffolds and commits on a fresh repository', () => {
    repo = makeTempGitRepo();
    const result = initWingfoilStorage(repo);
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });
});

/**
 * The init entry points' `IO` branch — a commit that fails AFTER every guard passed. Before task-172
 * a linked `.wingfoil` reached it (git's "beyond a symbolic link"); now the guards refuse that case
 * first, so the branch is pinned on the failure it is for: git itself refusing the commit (here a
 * `pre-commit` hook). Characterization: the behaviour is unchanged, only its fixture moved.
 */
describe('characterization: a commit git refuses after the guards pass is still an IO result', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  });
  afterEach(() => {
    removeTempDir(repo);
  });

  it.each([
    ['initWingfoilProject', (root: string) => initWingfoilProject(root, 'Scrum')],
    ['initWingfoilStorage', (root: string) => initWingfoilStorage(root)],
  ] as const)('%s', (_name, run) => {
    const result = run(repo) as CoreResult<unknown>;
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('IO');
  });
});
