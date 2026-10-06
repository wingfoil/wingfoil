/**
 * task-092-writes-refuse-a-dirty-target / `bug-078-commitpaths-callers-commit-whatever-is-on-disk` —
 * the **non-transition** `commitPaths` callers refuse a target carrying modifications they do not own.
 *
 * `dl-080-which-baseline-each-command-reads` is ratified as option **(B)** (approve commit `333a3c0`):
 * "a read that gates an operation resolves against the repository as committed at HEAD, and a write
 * refuses while its target carries modifications the command does not own". `task-088` landed the
 * write half for the four gated Memory verbs; these six callers were left as they were, and each
 * still committed its target path as it stood in the working tree:
 *
 * - `dna set` and `directive assign` absorb an unrelated uncommitted edit to the config file they
 *   write, under a subject that names only the field or the binding they changed;
 * - `directive remove` silently DESTROYS an uncommitted edit (staging a deletion discards the
 *   working-tree blob, so nothing rides in — the author's work simply reaches no commit anywhere);
 * - `directive create` and `memory add` onto a path that is still at `HEAD` but absent from the
 *   working tree produce a commit whose diff **removes** content, under a subject that says
 *   "create" / "add".
 *
 * `memory add` and `init` are the two that are not like the others, and each is pinned here as the
 * task's `design` notes argue them rather than as the uniform rule would assume:
 *
 * - **`memory add`'s target is new**, so the rule it needs is **absence**, not cleanliness: the path
 *   must not exist at `HEAD`, in the index, or in the working tree. It is reachable because a
 *   slug-only id lands on an occupied path whenever a title repeats (the `note-{slug}` type below),
 *   and a `{n}` id lands on a git-ignored file, which reserves no number. Until task-128 a `{n}` id
 *   could also land on any file, because `nextSequenceNumber` counted the working tree's files, so
 *   a gap reissued a taken number (`bug-087`). It now takes the highest number every ref and the
 *   working tree (as git sees it) hold. Either way the guard refuses and never overwrites.
 * - **`init` is scoped out on the `wingfoil init` path and guarded on the other one.**
 *   `initWingfoilProject` refuses before any write when `.wingfoil/` holds any entry
 *   (`detectInitState`), and every path it writes is under `.wingfoil/`, so no target can pre-exist
 *   — a guard there would be unreachable. `initWingfoilStorage`, the library entry point exported
 *   from `src/core`, ran no such check and did absorb; it is guarded. Since task-135 (`bug-088`) it
 *   also refuses an initialized project, but only AFTER this guard, so a dirty target is still
 *   refused with the message naming it.
 *
 * Refusals exit **`1`**, not `2`: `spec-005-cli-command-contract` § "1. Exit-code contract
 * (REQ-INT-04)" reserves `2` for a malformed *invocation* and puts "validation failure, git
 * operation failure" under `1`. A dirty target is a repository-state precondition; re-typing the
 * command cannot help. That is the ruling recorded on `bug-076` and followed by `task-088`.
 *
 * The guard is deliberately **per-path**, never per-tree: `commitPaths` commits with
 * `git commit --only -- <paths>` (`bug-027`), so an unrelated dirty file cannot ride in anyway. The
 * "unrelated work is untouched" cases below pin that narrowness so a later reader cannot widen the
 * rule into `dl-080`'s rejected option (D).
 *
 * Exercises the REAL, registered `CORE_MODULES` operations — the exact `CoreFn`s the CLI command and
 * the MCP Tool dispatch to — against THROWAWAY temp git repos carrying the real `wingfoil init`
 * scaffold. Nothing here touches this repository's own `.wingfoil/` or Memory (`bug-075`).
 *
 * Deterministic (REQ-SYS-07): fixed fixture text, fixed git identity, fixed case order; nothing
 * asserted depends on a clock, on randomness, or on the temp directory name.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, initWingfoilStorage } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const DNA = '.wingfoil/dna.yaml';
const ROLES = '.wingfoil/roles.yaml';
const MEMORY_YAML = '.wingfoil/memory.yaml';
const NOTE_TEMPLATE = '.wingfoil/memory/templates/note.md';

/**
 * A Memory type whose `id_pattern` carries NO `{n}` token, so two adds of the same title resolve to
 * the same path. The `wingfoil init` scaffold's types all carry `{n}`, which hides the collision
 * behind the sequence counter; `note` exposes it directly. Shape copied from `test/core/memory-add.test.ts`.
 */
const NOTE_TYPE = `
  note:
    path: "docs/memory/note/{id}.md"
    id_pattern: "note-{slug}"
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [id, type, title, status]
`;

const NOTE_TEMPLATE_BODY = `---
id: ""
type: note
title: ""
status: draft
tmpl_version: 260703
tags: []
---

<!-- note body -->
`;

type AnyFn = CoreFn<unknown, unknown>;

/** The real, registered operation — fails loudly if a future change un-registers it. */
function op(module: string, name: string): AnyFn {
  const operation = CORE_MODULES.find((entry) => entry.name === module)?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered on the "${module}" module`);
  return operation.fn as AnyFn;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

/** Root-relative paths the newest commit changed against its parent — the scope observable. */
const committedPaths = (repo: string): string[] =>
  gitOut(repo, ['diff', '--name-only', 'HEAD~1', 'HEAD']).split('\n').filter((line) => line.length > 0);

/** The added content lines of the newest commit against its parent (diff headers dropped). */
const committedAdditions = (repo: string): string[] =>
  gitOut(repo, ['diff', 'HEAD~1', 'HEAD'])
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));

const readFile = (repo: string, path: string): string => readFileSync(join(repo, path), 'utf-8');

/** Append text to a tracked file WITHOUT committing it. */
function dirty(repo: string, path: string, text: string): void {
  writeFileSync(join(repo, path), `${readFile(repo, path)}\n${text}\n`, 'utf-8');
}

const errorMessage = (result: CoreResult<unknown>): string =>
  result.ok ? '<result was ok>' : result.error.message;

/** A temp git repo with the REAL `wingfoil init` Scrum scaffold, plus the `note` Memory type. */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  writeFixtureFile(repo, MEMORY_YAML, `${readFile(repo, MEMORY_YAML)}${NOTE_TYPE}`);
  writeFixtureFile(repo, NOTE_TEMPLATE, NOTE_TEMPLATE_BODY);
  commitAll(repo, 'fixture: add the note Memory type');
  return repo;
}

const UNRELATED = '# UNRELATED UNCOMMITTED EDIT — named by no commit subject';

describe('dna set — refuses a dna.yaml carrying modifications it does not own (bug-078 R1)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeInitializedRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC2/AC5: refuses, exits 1, names the file and what is modified, and writes nothing', async () => {
    dirty(repo, DNA, UNRELATED);
    const before = head(repo);

    const unchanged = snapshotPersistence(repo);
    const result = await op('dna', 'dnaSet')({ root: repo, positionals: ['project.name'], options: { value: 'Renamed' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(DNA);
    expect(errorMessage(result)).toContain('the file content');
    // Nothing committed, and the author's edit is still there to commit or stash.
    expect(head(repo)).toBe(before);
    expect(readFile(repo, DNA)).toContain(UNRELATED);
    expect(readFile(repo, DNA)).not.toContain('Renamed');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC4: on a clean tree it still commits, and the commit carries exactly the field it declares', async () => {
    const result = await op('dna', 'dnaSet')({ root: repo, positionals: ['project.name'], options: { value: 'Renamed' } });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual([DNA]);
    expect(committedAdditions(repo).some((line) => line.includes('Renamed'))).toBe(true);
    expect(committedAdditions(repo).some((line) => line.includes(UNRELATED))).toBe(false);
  });

  it('AC4: the guard is per-path — an unrelated dirty file does not block the write (dl-080 rejected (D))', async () => {
    writeFixtureFile(repo, 'docs/notes.md', 'work in progress, uncommitted');

    const result = await op('dna', 'dnaSet')({ root: repo, positionals: ['project.name'], options: { value: 'Renamed' } });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual([DNA]);
    // git names the untracked DIRECTORY when nothing under it is tracked, so assert on that prefix.
    expect(gitOut(repo, ['status', '--porcelain'])).toContain('?? docs/');
  });
});

describe('dna add|remove|update — the same rule, on the same file (task-093, dl-081 option (E))', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeInitializedRepo();
  });
  afterEach(() => removeTempDir(repo));

  // These three verbs edit `dna.yaml` IN PLACE, exactly as `dna set` does, so they take the plain
  // `requireUnmodifiedTarget` rule rather than either of this task's two exceptions: `memory add`'s
  // absence check is for a target that must be new, and `wingfoil init`'s exemption rests on
  // `detectInitState` refusing an initialized project — while these verbs require one.
  it.each<[string, string, string, Record<string, string>]>([
    ['dnaAdd', 'add', 'paths.sources', { value: 'lib/' }],
    ['dnaRemove', 'remove', 'modules', { value: 'core' }],
    ['dnaUpdate', 'update', 'project.name', { value: 'Renamed' }],
  ])('%s refuses a dirty dna.yaml, exits 1, names the file, and writes nothing', async (operation, _verb, path, options) => {
    dirty(repo, DNA, UNRELATED);
    const before = head(repo);

    const unchanged = snapshotPersistence(repo);
    const result = await op('dna', operation)({ root: repo, positionals: [path], options });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(DNA);
    expect(errorMessage(result)).toContain('the file content');
    expect(head(repo)).toBe(before);
    expect(readFile(repo, DNA)).toContain(UNRELATED);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('on a clean tree `dna add` still commits, and the commit carries exactly what it declares', async () => {
    const result = await op('dna', 'dnaAdd')({ root: repo, positionals: ['paths.sources'], options: { value: 'lib/' } });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual([DNA]);
    expect(committedAdditions(repo).some((line) => line.includes('lib/'))).toBe(true);
  });
});

describe('directive assign — refuses a roles.yaml carrying modifications it does not own (bug-078 R2)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeInitializedRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC2/AC5: refuses, exits 1, names roles.yaml, and writes nothing', async () => {
    dirty(repo, ROLES, UNRELATED);
    const before = head(repo);

    const unchanged = snapshotPersistence(repo);
    const result = await op('directive', 'directiveAssign')({
      root: repo,
      options: { directive: 'architecture', role: 'developer' },
    });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(ROLES);
    expect(head(repo)).toBe(before);
    expect(readFile(repo, ROLES)).toContain(UNRELATED);
    expect(readFile(repo, ROLES)).not.toContain('    - architecture\n    - code-quality');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC4: on a clean tree it still commits, and the commit carries exactly the binding it declares', async () => {
    const result = await op('directive', 'directiveAssign')({
      root: repo,
      options: { directive: 'architecture', role: 'developer' },
    });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual([ROLES]);
    expect(committedAdditions(repo)).toEqual(['    - architecture']);
  });
});

describe('directive create — refuses a target still at HEAD but absent from the working tree (bug-078 R4)', () => {
  let repo: string;
  const DELTA = '.wingfoil/directives/custom/delta.md';
  beforeEach(() => {
    repo = makeInitializedRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC2: refuses, exits 1, and does not turn a "create" into a commit that deletes content', async () => {
    const created = await op('directive', 'directiveCreate')({ root: repo, options: { name: 'delta' } });
    expect(created.ok).toBe(true);
    dirty(repo, DELTA, 'HAND-WRITTEN BODY the author added to delta.');
    commitAll(repo, 'fixture: author the delta body');
    rmSync(join(repo, DELTA)); // an uncommitted deletion — `documentExists` no longer sees the file
    const before = head(repo);

    const result = await op('directive', 'directiveCreate')({ root: repo, options: { name: 'delta' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(DELTA);
    expect(head(repo)).toBe(before);
  });

  it('AC4: on a clean tree it still creates, and the commit carries exactly the new file', async () => {
    const result = await op('directive', 'directiveCreate')({ root: repo, options: { name: 'delta' } });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual([DELTA]);
    expect(existsSync(join(repo, DELTA))).toBe(true);
  });
});

describe('directive remove — refuses rather than destroying an uncommitted edit (bug-078 R3)', () => {
  let repo: string;
  const GAMMA = '.wingfoil/directives/custom/gamma.md';
  const PRECIOUS = 'IMPORTANT UNCOMMITTED PARAGRAPH the author has not saved anywhere else.';
  beforeEach(() => {
    repo = makeInitializedRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC2: refuses, exits 1, and leaves the uncommitted paragraph on disk', async () => {
    const created = await op('directive', 'directiveCreate')({ root: repo, options: { name: 'gamma' } });
    expect(created.ok).toBe(true);
    dirty(repo, GAMMA, PRECIOUS);
    const before = head(repo);

    const result = await op('directive', 'directiveRemove')({ root: repo, positional: 'gamma' });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(GAMMA);
    expect(head(repo)).toBe(before);
    expect(readFile(repo, GAMMA)).toContain(PRECIOUS);
  });

  it('AC4: on a clean tree it still removes, and the commit carries exactly that deletion', async () => {
    const created = await op('directive', 'directiveCreate')({ root: repo, options: { name: 'gamma' } });
    expect(created.ok).toBe(true);

    const result = await op('directive', 'directiveRemove')({ root: repo, positional: 'gamma' });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual([GAMMA]);
    expect(existsSync(join(repo, GAMMA))).toBe(false);
  });
});

describe('memory add — the target must be ABSENT, not merely unmodified (bug-078 R5b, AC3)', () => {
  let repo: string;
  const NOTE_X = 'docs/memory/note/note-x.md';
  beforeEach(() => {
    repo = makeInitializedRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC2/AC3: refuses a target that is clean and tracked, instead of overwriting a committed element', async () => {
    const first = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } });
    expect(first.ok).toBe(true);
    dirty(repo, NOTE_X, 'CONTENT the author wrote into note-x.');
    commitAll(repo, 'fixture: author note-x');
    const before = head(repo);

    const result = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(NOTE_X);
    expect(head(repo)).toBe(before);
    expect(readFile(repo, NOTE_X)).toContain('CONTENT the author wrote into note-x.');
  });

  it('AC2/AC3: refuses a target still at HEAD but deleted in the working tree — no "add" that removes lines', async () => {
    const first = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } });
    expect(first.ok).toBe(true);
    rmSync(join(repo, NOTE_X));
    const before = head(repo);

    const result = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
  });

  it('AC2/AC3: refuses to clobber an UNTRACKED draft sitting at the target path', async () => {
    writeFixtureFile(repo, NOTE_X, 'a hand-started draft, never committed');
    const before = head(repo);

    const result = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
    expect(readFile(repo, NOTE_X)).toBe('a hand-started draft, never committed');
  });

  it('AC4: adding a NEW element still works while ANOTHER element carries uncommitted modifications', async () => {
    const first = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } });
    expect(first.ok).toBe(true);
    dirty(repo, NOTE_X, 'uncommitted work on a DIFFERENT element');

    const result = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'Y' } });

    expect(result.ok).toBe(true);
    expect(committedPaths(repo)).toEqual(['docs/memory/note/note-y.md']);
    // The other element's uncommitted work is neither committed nor disturbed (bug-027's `--only`).
    expect(gitOut(repo, ['status', '--porcelain'])).toContain(NOTE_X);
  });
});

describe('init — scoped out on the wingfoil init path, guarded on the library path (AC3)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('AC4: `wingfoil init` still works in a repository with NOTHING committed and a dirty tree', () => {
    writeFixtureFile(repo, 'README.md', 'work in progress');
    writeFixtureFile(repo, 'src/app.ts', 'const x = 1;\n');

    const result = initWingfoilProject(repo, 'Scrum');

    expect(result.ok).toBe(true);
    // The root commit contains the scaffold and nothing else; the user's untracked work stays untracked.
    const committed = gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter((l) => l.length > 0);
    expect(committed.every((path) => path.startsWith('.wingfoil/'))).toBe(true);
    const porcelain = gitOut(repo, ['status', '--porcelain']);
    expect(porcelain).toContain('README.md');
    expect(porcelain).toContain('src/');
  });

  it('AC3: `initWingfoilStorage` refuses a dirty target, naming it (before its already-initialized refusal)', () => {
    writeFixtureFile(repo, DNA, '# a hand-written dna.yaml, uncommitted');
    writeFixtureFile(repo, 'seed.txt', 'seed');
    commitAll(repo, 'seed: a committed dna.yaml');
    writeFileSync(join(repo, DNA), '# hand-edited since, never committed\n', 'utf-8');
    const before = head(repo);

    const result = initWingfoilStorage(repo);

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(DNA);
    expect(head(repo)).toBe(before);
    expect(readFile(repo, DNA)).toBe('# hand-edited since, never committed\n');
  });

  it('AC4: `initWingfoilStorage` still works when every target it writes is absent', () => {
    writeFixtureFile(repo, 'seed.txt', 'seed');
    commitAll(repo, 'seed');

    const result = initWingfoilStorage(repo);

    expect(result.ok).toBe(true);
    expect(committedPaths(repo).every((path) => path.startsWith('.wingfoil/'))).toBe(true);
  });
});
