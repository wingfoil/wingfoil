/**
 * task-184 (bug-194, dl-121 T1) — the shared "writes nothing" check in
 * `./helpers/persistence-snapshot.ts` fails on each kind of write a refused verb could leave behind,
 * and passes when nothing is written. task-147's suite (`test/mcp/channel-enumeration-persistence.test.ts`)
 * plants the same writes behind an MCP read over a COMMITTED fixture; this one plants them directly,
 * over a fixture that is DIRTY at snapshot time, because the core and CLI refusals it now guards are
 * often refusals of a dirty tree (an edited target, a working-tree-only definition).
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from './helpers/persistence-snapshot';

const TRACKED = 'tracked.md';
const DIRTY = 'dirty.md';
const UNTRACKED = 'untracked.md';

/** Snapshot `root`, run `write`, then run the check. */
function check(root: string, write: (r: string) => void, listed: readonly string[] = [TRACKED]): void {
  const snapshot = snapshotPersistence(root, listed);
  write(root);
  assertPersistenceUnchanged(root, snapshot);
}

describe('task-184 — the shared writes-nothing snapshot, over a dirty fixture', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.gitignore', 'ign/\n');
    writeFixtureFile(root, TRACKED, 'tracked\n');
    writeFixtureFile(root, DIRTY, 'committed\n');
    commitAll(root, 'seed');
    writeFixtureFile(root, DIRTY, 'edited, uncommitted\n');
    writeFixtureFile(root, UNTRACKED, 'untracked\n');
  });

  afterEach(() => removeTempDir(root));

  it('control: a call that writes nothing passes, dirty fixture and all', () => {
    expect(() => check(root, () => undefined)).not.toThrow();
  });

  it('a listed tracked file rewritten fails', () => {
    expect(() => check(root, (r) => writeFileSync(join(r, TRACKED), 'x\n'))).toThrow(/file changed .*: tracked\.md/);
  });

  it('an already-dirty file rewritten again — status unchanged — fails on its bytes', () => {
    expect(() => check(root, (r) => writeFileSync(join(r, DIRTY), 'edited again\n'))).toThrow(/file changed .*: dirty\.md/);
  });

  it('an untracked file rewritten fails on its bytes', () => {
    expect(() => check(root, (r) => writeFileSync(join(r, UNTRACKED), 'other\n'))).toThrow(/file changed .*: untracked\.md/);
  });

  it('a listed path that did not exist and is then created fails', () => {
    expect(() => check(root, (r) => writeFixtureFile(r, 'new.md', 'n\n'), ['new.md'])).toThrow(/file changed .*: new\.md/);
  });

  it('a new unlisted file fails', () => {
    expect(() => check(root, (r) => writeFixtureFile(r, 'stray/new.md', 'n\n'))).toThrow(/working tree changed/);
  });

  it('a new file under an ignored path fails', () => {
    expect(() => check(root, (r) => writeFixtureFile(r, 'ign/new.md', 'n\n'))).toThrow(/working tree changed/);
  });

  it('a commit on the current branch fails', () => {
    expect(() => check(root, (r) => git(r, ['commit', '--quiet', '--allow-empty', '-m', 'planted']))).toThrow(/HEAD moved/);
  });

  it('a branch or a tag created fails', () => {
    expect(() => check(root, (r) => git(r, ['branch', 'planted']))).toThrow(/refs changed/);
    expect(() => check(root, (r) => git(r, ['tag', 'planted-tag']))).toThrow(/refs changed/);
  });

  it('a checkout of a new branch at the same commit fails', () => {
    expect(() => check(root, (r) => git(r, ['checkout', '--quiet', '-b', 'planted']))).toThrow(/HEAD switched/);
  });
});

describe('task-184 — the shared writes-nothing snapshot, on an unborn branch', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(root));

  it('a first commit fails, and nothing written passes', () => {
    writeFixtureFile(root, 'a.md', 'a\n');
    expect(() => check(root, () => undefined, [])).not.toThrow();
    expect(() => check(root, (r) => commitAll(r, 'first'), [])).toThrow(/working tree changed|HEAD moved/);
  });
});
