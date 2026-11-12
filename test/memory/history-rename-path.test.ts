/**
 * `task-097-memory-history-reads-each-commit-at-its-historical-path` — the two halves of the same
 * function seen twice:
 *
 *  - `bug-080-read-status-at-reads-the-current-path-at-pre-rename-commits`: the walk follows renames
 *    but `readStatusAt` asked `git show <sha>:<currentPath>`, so every commit older than a rename was
 *    read at a path the element did not occupy then and reported `from`/`to` as `null` (P1.10).
 *  - `bug-071-read-status-at-leaks-git-stderr`: that `git show` ran without an `stdio` option, so the
 *    child inherited the parent's stderr and git's `fatal:` went straight to the operator's terminal.
 *
 * Everything here runs against **throwaway fixture repositories built by this file**, never against
 * this repository's own history: a test reading our commits by sha breaks the day someone rewrites
 * them — which has happened in this release. The fixture reproduces the *shape* of the live case
 * (`a353c12` moved the Memory folder's `planning/v1/*`, then under the nested dogfooding root,
 * to `planning/rl-v1/*`, renaming five `release` elements at once because the `release` type's
 * `path` pattern interpolates the release-line id) rather than reading the live case itself.
 */
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';

import { reconstructMemoryTransitions } from '../../src/memory/audit';
import {
  attachHistoricalPaths,
  collectHistoricalPaths,
  getMemoryHistory,
  type MemoryHistoryEntry,
} from '../../src/memory/history';
import {
  commitAll,
  git,
  makeBoundedOutsideDir,
  makeTempGitRepo,
  removeTempDir,
  withGitCeiling,
  writeFixtureFile,
} from '../storage/helpers/git-fixture';
import { spawnCapture } from '../cli/helpers/spawn-cli';

/** Where the element lived before the rename — the pre-`a353c12` shape. */
const OLD_PATH = 'docs/04_memory/planning/v1/minor-v0.1.md';
/** Where it lives now, and the only path a caller of `memory history` can name. */
const NEW_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.1.md';

function writeDoc(repo: string, path: string, status: string): void {
  writeFixtureFile(
    repo,
    path,
    ['---', 'id: minor-v0.1', 'type: release', `status: ${status}`, '---', '', 'Body.', ''].join('\n'),
  );
}

/**
 * A repository whose element was created under `OLD_PATH`, transitioned there, then renamed to
 * `NEW_PATH` in its own commit and transitioned again — four commits, two of them older than the
 * rename. Authored in place rather than copied from a template, so `findElementCreationSha` finds no
 * copy edge and `getMemoryHistory` truncates nothing (that is `task-089`'s concern, not this one).
 */
function makeRenamedElementRepo(): string {
  const repo = makeTempGitRepo();
  writeDoc(repo, OLD_PATH, 'draft');
  commitAll(repo, 'wf(release): add minor-v0.1');
  writeDoc(repo, OLD_PATH, 'planning');
  commitAll(repo, 'wf(release): submit minor-v0.1');
  mkdirSync(join(repo, dirname(NEW_PATH)), { recursive: true });
  git(repo, ['mv', OLD_PATH, NEW_PATH]);
  commitAll(repo, 'wf(release): move minor-v0.1 under rl-v1');
  writeDoc(repo, NEW_PATH, 'in-development');
  commitAll(repo, 'wf(release): approve minor-v0.1 [planning -> in-development]');
  return repo;
}

describe('collectHistoricalPaths — the walk is the source of truth for where the file was (AC1)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  it('maps every commit of the --follow walk to the path the element occupied at that commit', () => {
    repo = makeRenamedElementRepo();

    const paths = collectHistoricalPaths(repo, NEW_PATH);
    const walked = getMemoryHistory(repo, NEW_PATH);

    // One entry per walked commit — the probe and the walk are the same walk, narrowed differently.
    expect(paths.size).toBe(walked.length);
    expect(walked.map((entry) => entry.path)).toEqual([
      OLD_PATH, // add
      OLD_PATH, // submit
      NEW_PATH, // the rename commit itself: the file is at its DESTINATION there
      NEW_PATH, // approve
    ]);
    expect(walked.map((entry) => paths.get(entry.sha))).toEqual(walked.map((entry) => entry.path));
  });

  it('surfaces a failing probe as an error rather than as "this element was never renamed"', () => {
    // task-350 AC 3 (bug-453): a directory outside any repository below a ceiling that is one.
    const { dir, ceiling } = makeBoundedOutsideDir();
    repo = ceiling;

    // Same reasoning as `findElementCreationSha` (task-089): collapsing "git could not answer" into
    // "no rename edges" restores the defect silently, reading every commit at the current path again.
    expect(() => withGitCeiling(ceiling, () => collectHistoricalPaths(dir, NEW_PATH))).toThrow(/--follow --name-status/);
  });
});

describe('attachHistoricalPaths — pure merge of walk and probe (AC1)', () => {
  const entry = (sha: string, subject: string): MemoryHistoryEntry => ({
    sha,
    authorName: 'A',
    authorEmail: 'a@e.test',
    date: '2026-01-01T00:00:00+00:00',
    subject,
    body: '',
    path: 'unset.md',
  });

  it('gives each entry the path the probe recorded for its own sha', () => {
    const entries = [entry('1'.repeat(40), 'add'), entry('2'.repeat(40), 'approve')];
    const probe = new Map([
      ['1'.repeat(40), OLD_PATH],
      ['2'.repeat(40), NEW_PATH],
    ]);

    expect(attachHistoricalPaths(entries, probe, NEW_PATH).map((e) => e.path)).toEqual([
      OLD_PATH,
      NEW_PATH,
    ]);
  });

  it('falls back to the current path for a sha the probe reported no diff for', () => {
    const entries = [entry('3'.repeat(40), 'merge')];

    expect(attachHistoricalPaths(entries, new Map(), NEW_PATH).map((e) => e.path)).toEqual([NEW_PATH]);
  });
});

describe('reconstructMemoryTransitions across a rename (bug-080, AC2)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  it('reports real states for the transitions that predate the rename', () => {
    repo = makeRenamedElementRepo();

    const transitions = reconstructMemoryTransitions(repo, NEW_PATH);

    expect(transitions.map((t) => [t.fromState, t.toState])).toEqual([
      [null, 'draft'], // creation: `from` is null because there is no prior state, not because of a path
      ['draft', 'planning'],
      ['planning', 'planning'], // the rename moves bytes, not state
      ['planning', 'in-development'],
    ]);
  });

  it('leaves no transition with an unreadable state once the element has been created', () => {
    repo = makeRenamedElementRepo();

    const transitions = reconstructMemoryTransitions(repo, NEW_PATH);

    expect(transitions.filter((t) => t.toState === null)).toEqual([]);
  });
});

describe('a commit where the document genuinely does not exist (AC3)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  /** The rename fixture plus a deletion — the one commit in the walk with no content to read. */
  function makeDeletedElementRepo(): string {
    const created = makeRenamedElementRepo();
    git(created, ['rm', '--quiet', NEW_PATH]);
    commitAll(created, 'chore: remove minor-v0.1');
    return created;
  }

  it('reports null there, and only there — the legitimate null is distinguishable from the defect', () => {
    repo = makeDeletedElementRepo();

    const transitions = reconstructMemoryTransitions(repo, NEW_PATH);

    // Four readable transitions followed by one that genuinely has no document to read. Under
    // bug-080 the first two were null for a different reason entirely (the file existed, at another
    // path); pinning the whole sequence is what keeps the two causes apart for a later reader.
    expect(transitions.map((t) => t.toState)).toEqual([
      'draft',
      'planning',
      'planning',
      'in-development',
      null,
    ]);
    expect(transitions.map((t) => t.subject.startsWith('chore: remove'))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('still reports null when the document exists at the commit but carries no frontmatter', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, NEW_PATH, 'No frontmatter at all.\n');
    commitAll(repo, 'wf(release): add minor-v0.1');

    expect(reconstructMemoryTransitions(repo, NEW_PATH).map((t) => t.toState)).toEqual([null]);
  });
});

describe('bug-071 — git writes to a pipe this process owns, never to the operator (AC4)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  /**
   * Run `reconstructMemoryTransitions` in a **child process** against the compiled `dist/`, so the
   * child's stderr is a stream this test owns and can read back. Nothing in-process can observe the
   * leak: `execFileSync`'s default `stdio` hands the grandchild *this* process's fd 2, and jest
   * neither captures nor fails on what lands there (that is exactly why `bug-071` survived so long —
   * see also `bug-070`, the CLI helpers that fabricate an empty `stderr`).
   *
   * `dist/` is built once by jest's `globalSetup` (bug-003-cli-integration-dist-race) — never here.
   */
  function reconstructOutOfProcess(root: string, relativePath: string): {
    status: number;
    stdout: string;
    stderr: string;
  } {
    const audit = join(__dirname, '..', '..', 'dist', 'memory', 'audit.js');
    const script = [
      `const { reconstructMemoryTransitions } = require(${JSON.stringify(audit)});`,
      `const out = reconstructMemoryTransitions(${JSON.stringify(root)}, ${JSON.stringify(relativePath)});`,
      'process.stdout.write(JSON.stringify(out.map((t) => t.toState)));',
    ].join('\n');
    return spawnCapture(process.execPath, ['-e', script]);
  }

  it('prints nothing on stderr even when a commit in the walk legitimately has no document', () => {
    repo = makeRenamedElementRepo();
    git(repo, ['rm', '--quiet', NEW_PATH]);
    commitAll(repo, 'chore: remove minor-v0.1');

    const run = reconstructOutOfProcess(repo, NEW_PATH);

    // The assertion is only worth anything if the run actually reached the failing read: the trailing
    // null IS git's `fatal: path ... does not exist in ...`, handled in code instead of on fd 2.
    expect(JSON.parse(run.stdout)).toEqual(['draft', 'planning', 'planning', 'in-development', null]);
    expect([run.status, run.stderr]).toEqual([0, '']);
  });

  it('prints nothing on stderr on a clean walk either (AC5 — the exit status is unchanged too)', () => {
    repo = makeRenamedElementRepo();

    const run = reconstructOutOfProcess(repo, NEW_PATH);

    expect([run.status, run.stderr]).toEqual([0, '']);
  });
});

/**
 * `task-142` (`bug-093`, `bug-097` item 2) — the same out-of-process harness, aimed at the other git
 * calls of the history path. Each runs against a directory that is not a repository, the case where
 * git has something to say (`fatal: not a git repository …`): whatever the function does with the
 * failure, git's text must reach the caller inside the error, never on the operator's fd 2.
 */
describe('task-142 — no Memory git call writes to the operator\'s stderr (AC2)', () => {
  let dir = '';

  afterEach(() => removeTempDir(dir));

  /**
   * Call `module.fn(root, …args)` from `dist/` in a child; report whether it threw, and its stderr.
   * The child's git stops at `ceiling` (task-350 AC 3, `bug-453`): it gets this test's environment
   * plus `GIT_CEILING_DIRECTORIES`.
   */
  function callOutOfProcess(
    module: string,
    fn: string,
    args: readonly unknown[],
    ceiling: string,
  ): { status: number; stdout: string; stderr: string } {
    const compiled = join(__dirname, '..', '..', 'dist', 'memory', `${module}.js`);
    const script = [
      `const m = require(${JSON.stringify(compiled)});`,
      `try { m[${JSON.stringify(fn)}](...${JSON.stringify(args)}); process.stdout.write('returned'); }`,
      `catch (error) { process.stdout.write('threw: ' + error.message); }`,
    ].join('\n');
    return spawnCapture(process.execPath, ['-e', script], { env: { ...process.env, GIT_CEILING_DIRECTORIES: ceiling } });
  }

  it.each([
    ['git-log', 'walkGitLogFields', (root: string) => [root, ['%H'], [NEW_PATH]]],
    ['history', 'findElementCreationSha', (root: string) => [root, NEW_PATH]],
    ['history', 'collectHistoricalPaths', (root: string) => [root, NEW_PATH]],
  ] as const)('%s.%s reports a failure in its error and leaves stderr empty', (module, fn, args) => {
    // task-350 AC 3 (bug-453): a directory outside any repository below a ceiling that is one.
    const bounded = makeBoundedOutsideDir();
    dir = bounded.ceiling;

    const run = callOutOfProcess(module, fn, args(bounded.dir), bounded.ceiling);

    // The run must have reached git and failed there, or the empty stderr proves nothing.
    expect(run.stdout).toMatch(/^threw: .*not a git repository/s);
    expect([run.status, run.stderr]).toEqual([0, '']);
  });
});

/**
 * `task-142` (`bug-097` item 1) — `core.quotePath=false` is load-bearing: without it git reports a
 * non-ASCII path C-quoted (`"docs/caf\303\251.md"`), the walk hands that spelling to `git show`, and
 * every state reads `null`. A rename makes the probe's path the only one each pre-rename commit can be
 * read at.
 */
describe('task-142 — a non-ASCII element path round-trips through history (AC3)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  const OLD_ACCENTED = 'docs/04_memory/planning/v1/caffè-v0.1.md';
  const NEW_ACCENTED = 'docs/04_memory/planning/rl-v1/caffè-v0.1.md';

  it('reports each commit at its own accented path and reads a real state at every one', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, OLD_ACCENTED, 'draft');
    commitAll(repo, 'wf(release): add caffè');
    mkdirSync(join(repo, dirname(NEW_ACCENTED)), { recursive: true });
    git(repo, ['mv', OLD_ACCENTED, NEW_ACCENTED]);
    commitAll(repo, 'wf(release): move caffè under rl-v1');
    writeDoc(repo, NEW_ACCENTED, 'planning');
    commitAll(repo, 'wf(release): submit caffè');

    expect(getMemoryHistory(repo, NEW_ACCENTED).map((entry) => entry.path)).toEqual([
      OLD_ACCENTED,
      NEW_ACCENTED,
      NEW_ACCENTED,
    ]);
    expect(reconstructMemoryTransitions(repo, NEW_ACCENTED).map((t) => t.toState)).toEqual([
      'draft',
      'draft',
      'planning',
    ]);
  });
});
