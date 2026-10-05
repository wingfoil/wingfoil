/**
 * task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin — `dl-111` Q2 (a), Q3 (i), Action 3,
 * and `bug-051-commit-cleanup-never-pinned`.
 *
 * Every commit WingFoil writes goes through one primitive, `commitPaths` (`src/storage/commit.ts`).
 * This file pins the two properties that primitive now owns:
 *
 * 1. **The build signature.** Every commit ends with a trailer paragraph `WingFoil-Version: <semver>
 *    (<sha>)`, read here the way `dl-111` says a reader takes it — through git's own trailer reader,
 *    `git log --format='%(trailers:key=WingFoil-Version,valueonly)'`. These suites run from `src/`
 *    through ts-jest, where no `build-info.json` exists, so the value is `<semver> (unknown)` (Q3 (i)).
 *    The `<sha>` case is pinned against the compiled CLI in `test/cli/build-info.test.ts`. One case per
 *    commit-site family: `init`, Memory (`memory add`, and a transition verb), DNA, directive.
 * 2. **The body normal form is the tool's, not the operator's git config** (`bug-051`): `commitPaths`
 *    passes `--cleanup=whitespace`, so the stored body is the same under each of git's four
 *    `commit.cleanup` modes and under none.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { normalizeReason, parseCommitReason } from '../../src/memory';
import { commitPaths } from '../../src/storage';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';

const PKG_VERSION = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as { version: string }).version;

/** What a run without `build-info.json` stamps (`dl-111` Q3 (i)). */
const UNKNOWN_STAMP = `${PKG_VERSION} (unknown)`;

/** The `WingFoil-Version` trailer of `rev`, as git's own trailer reader returns it. */
function versionTrailer(repo: string, rev = 'HEAD'): string {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%(trailers:key=WingFoil-Version,valueonly)', rev], {
    encoding: 'utf-8',
  }).trim();
}

/** The whole commit message of `rev`, byte for byte as stored in the commit object (`%B` adds a newline). */
function rawBody(repo: string, rev = 'HEAD'): string {
  const object = execFileSync('git', ['-C', repo, 'cat-file', 'commit', rev], { encoding: 'utf-8' });
  return object.slice(object.indexOf('\n\n') + 2);
}

function operation(moduleName: string, name: string): CoreFn<unknown, unknown> {
  const fn = CORE_MODULES.find((module) => module.name === moduleName)?.operations[name]?.fn;
  if (!fn) throw new Error(`fixture bug: "${moduleName}.${name}" is not registered`);
  return fn;
}

/** A temp repo carrying the real `wingfoil init` Scrum scaffold — itself a commit written by `commitPaths`. */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

/** `memory add --type bug --title <title>` through the registered operation; returns the new id. */
async function addBug(repo: string, title: string): Promise<string> {
  const result = (await operation('memory', 'memoryAdd')({ root: repo, options: { type: 'bug', title } })) as {
    ok: boolean;
    value?: { id: string };
    error?: { message: string };
  };
  if (!result.ok || !result.value) throw new Error(`fixture bug: memory add failed — ${result.error?.message}`);
  return result.value.id;
}

describe('every commit written through commitPaths carries `WingFoil-Version: <semver> (<sha>)` (dl-111)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('commitPaths itself: the trailer is a paragraph of its own, after the caller message', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'a.txt', 'A');
    commitPaths(repo, ['a.txt'], 'feat: add a\n\nApprover: A <a@example.invalid> (approver)\nReason: one line');

    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);
    expect(rawBody(repo)).toBe(
      `feat: add a\n\nApprover: A <a@example.invalid> (approver)\nReason: one line\n\nWingFoil-Version: ${UNKNOWN_STAMP}\n`,
    );
  });

  it('commitPaths itself: a subject-only message gains the trailer as its body', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'a.txt', 'A');
    commitPaths(repo, ['a.txt'], 'wf(task): add task-1');

    expect(rawBody(repo)).toBe(`wf(task): add task-1\n\nWingFoil-Version: ${UNKNOWN_STAMP}\n`);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(task): add task-1');
  });

  it('init family: the `wingfoil init` commit', () => {
    repo = makeInitializedRepo();
    expect(git(repo, ['rev-list', '--count', 'HEAD']).trim()).toBe('1');
    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);
  });

  it('memory family: `memory add`, then a transition verb (`memory deprecate` with a reason)', async () => {
    repo = makeInitializedRepo();
    const id = await addBug(repo, 'Trailer on add');
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`wf(bug): add ${id}`);
    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);

    const deprecated = (await operation('memory', 'memoryDeprecate')({
      root: repo,
      positional: id,
      options: { reason: 'Filed by mistake.\n\nA second paragraph ends the reason.' },
    })) as { ok: boolean };
    expect(deprecated.ok).toBe(true);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toMatch(/^wf\(bug\): deprecate /);
    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);
    // The trailer paragraph is where the Reason: block stops (dl-067 clause 2): the reason reads back whole.
    expect(parseCommitReason(git(repo, ['log', '-1', '--format=%b']))).toBe('Filed by mistake.\n\nA second paragraph ends the reason.');
  });

  it('dna family: `dna set`', async () => {
    repo = makeInitializedRepo();
    const result = (await operation('dna', 'dnaSet')({
      root: repo,
      positionals: ['project.license'],
      options: { value: 'MIT' },
    })) as { ok: boolean; error?: { message: string } };
    expect(result.error?.message).toBeUndefined();
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toMatch(/^wf\(dna\): set /);
    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);
  });

  it('directive family: `directive create`, then `directive remove`', async () => {
    repo = makeInitializedRepo();
    const created = (await operation('directive', 'directiveCreate')({ root: repo, options: { name: 'trailer-check' } })) as {
      ok: boolean;
    };
    expect(created.ok).toBe(true);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(directive): create trailer-check');
    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);

    const removed = (await operation('directive', 'directiveRemove')({ root: repo, positional: 'trailer-check' })) as {
      ok: boolean;
    };
    expect(removed.ok).toBe(true);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(directive): remove trailer-check');
    expect(versionTrailer(repo)).toBe(UNKNOWN_STAMP);
  });
});

/** git's four `commit.cleanup` modes, plus "not set" (git's own default for `-m`, `whitespace`). */
const CLEANUP_MODES = [null, 'strip', 'whitespace', 'verbatim', 'scissors'] as const;

describe('commitPaths pins `--cleanup=whitespace`: the stored body does not depend on `commit.cleanup` (bug-051)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it.each(CLEANUP_MODES)('commit.cleanup=%s: trailing whitespace stripped, blank-line runs collapsed, a `#` line kept', (mode) => {
    repo = makeTempGitRepo();
    if (mode !== null) git(repo, ['config', 'commit.cleanup', mode]);
    writeFixtureFile(repo, 'a.txt', 'A');
    commitPaths(repo, ['a.txt'], 'feat: subject\n\nline one   \n\n\n\n#1234 at column zero\nline two\t\n\n');

    expect(rawBody(repo)).toBe(`feat: subject\n\nline one\n\n#1234 at column zero\nline two\n\nWingFoil-Version: ${UNKNOWN_STAMP}\n`);
  });

  it.each(CLEANUP_MODES)('commit.cleanup=%s: a deprecate reason reads back in its declared normal form', async (mode) => {
    repo = makeInitializedRepo();
    const id = await addBug(repo, 'Cleanup mode');
    if (mode !== null) git(repo, ['config', 'commit.cleanup', mode]);
    const reason = 'kept because the guard landed   \n#1234 tracks the follow-up\n\n\n\nand the suite is green\t';

    const result = (await operation('memory', 'memoryDeprecate')({ root: repo, positional: id, options: { reason } })) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);
    expect(parseCommitReason(git(repo, ['log', '-1', '--format=%b']))).toBe(normalizeReason(reason));
    expect(normalizeReason(reason)).toContain('\n#1234 tracks the follow-up\n');
  });
});
