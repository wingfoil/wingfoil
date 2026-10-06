/**
 * task-088-fix-gated-verbs-commit-only-the-status-change / `bug-076-approve-commits-whatever-is-on-disk`
 * — the **scope** of a Memory transition commit, asserted against the committed tree rather than
 * against the file on disk.
 *
 * `spec-010-memory-frontmatter-schema` § "Field-write ownership" already declares the rule in prose:
 * "`memory.approve` changes **only** the `status` field and no other frontmatter field.
 * `memory.reject` changes `status` plus `rejection_reason` — the one exception to 'status only'
 * among the transition verbs". Nothing enforced it. Every comparison in the write path
 * (`prepareMemoryTransition` → `verifyFrontmatterEdit` → `commitPaths`) used the **working tree** as
 * its zero point, so a modification that was already on disk was invisible at every step and rode
 * into an approval under a subject declaring only a state transition.
 *
 * Two properties are pinned here, and they are different:
 *
 * 1. **The guard (AC2).** `approve`/`reject`/`deprecate` refuse — before writing anything — when the
 *    element file carries modifications that are not theirs. The refusal names them. `submit` does
 *    NOT refuse: its contract is to fill content *and* move state (`spec-010`'s ownership row grants
 *    it "body content"), and that asymmetry is pinned explicitly below so a later reader cannot
 *    conclude the four verbs were meant to behave alike.
 * 2. **The assertion (AC3).** Every happy path here asserts the **diff between the new commit and
 *    its parent**, not the end state of the file. "Does the document now say `approved`?" is true no
 *    matter what else rode along; `git diff HEAD~1 HEAD` is not. Same shape as `task-080`'s lockfile
 *    guard: assert the diff, not the end state.
 *
 * Exercises the REAL, registered `CORE_MODULES` operations — the exact `CoreFn`s the CLI command and
 * the MCP Tool dispatch to. Every write lands in a THROWAWAY temp git repo; nothing here touches this
 * repository (`bug-075` means the verbs cannot be pointed at its Memory in any case, and `AC7`
 * forbids re-verifying its hand-made history against the new rule).
 *
 * Deterministic (REQ-SYS-07): fixed fixture text, fixed git identity, fixed case order; nothing
 * asserted depends on a clock, on randomness, or on the temp directory name.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, verifyCommittedScope } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  task:
    path: "docs/memory/{release}/{id}.md"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [title, release]
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
      waiting: [backlog, approved]
`;

const TEST_NAME = 'WingFoil Test';
const TEST_EMAIL = 'wf-test@example.invalid';

/** `dna.yaml` in which the fixture's git identity holds `approver` (REQ-SEC-03 happy path). */
const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** A complete, submit-ready element: every required field non-empty and a real body. */
function taskDoc(fields: { id: string; status: string; title?: string; body?: string }): string {
  return `---
id: "${fields.id}"
type: task
title: "${fields.title ?? 'A task'}"
status: ${fields.status}
release: "v0.2"
tmpl_version: 260703
---

## Description

${fields.body ?? 'Real content.'}
`;
}

type AnyFn = CoreFn<unknown, unknown>;

/** The real, registered operation — fails loudly if a future change un-registers it. */
function memoryOp(name: string): AnyFn {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as AnyFn;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

/**
 * The added/removed content lines of the newest commit **against its parent** — AC3's observable.
 * Diff headers (`+++`/`---`) are dropped; everything else is reported verbatim, so a line that rode
 * in shows up as itself rather than as a count.
 */
function committedPatch(repo: string): { added: string[]; removed: string[]; paths: string[] } {
  const patch = gitOut(repo, ['diff', 'HEAD~1', 'HEAD']);
  const lines = patch.split('\n');
  return {
    paths: gitOut(repo, ['diff', '--name-only', 'HEAD~1', 'HEAD']).split('\n').filter((line) => line.length > 0),
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1)),
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1)),
  };
}

/** Append text to a document in the working tree WITHOUT committing it. */
function dirtyBody(repo: string, relativePath: string, text: string): void {
  const absolute = join(repo, relativePath);
  writeFileSync(absolute, `${readFileSync(absolute, 'utf-8')}\n${text}\n`, 'utf-8');
}

/** Insert an extra top-level frontmatter field in the working tree WITHOUT committing it. */
function dirtyFrontmatter(repo: string, relativePath: string, line: string): void {
  const absolute = join(repo, relativePath);
  writeFileSync(absolute, readFileSync(absolute, 'utf-8').replace(/^(status: .*)$/m, `$1\n${line}`), 'utf-8');
}

function errorMessage(result: CoreResult<unknown>): string {
  return result.ok ? '<result was ok>' : result.error.message;
}

describe('Memory transition verbs — the commit carries the declared change and nothing else (bug-076)', () => {
  let repo: string;
  const TASK_101 = 'docs/memory/v0.2/task-101.md';
  const TASK_300 = 'docs/memory/v0.2/task-300.md';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, TASK_101, taskDoc({ id: 'task-101', status: 'pending' }));
    writeFixtureFile(repo, TASK_300, taskDoc({ id: 'task-300', status: 'in-review' }));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  // --- AC2 / AC6: the guard, on every gated verb ------------------------------------------------

  it('AC2/AC6: `approve` refuses a document carrying an uncommitted BODY edit, naming it, and writes nothing', async () => {
    dirtyBody(repo, TASK_101, 'INJECTED BODY PARAGRAPH — never mentioned by any commit subject.');
    const before = head(repo);

    const unchanged = snapshotPersistence(repo);
    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'state change only, allegedly' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain(TASK_101);
    expect(errorMessage(result)).toContain('the body');
    // Nothing written, nothing committed: "the state is unchanged" (P1.7 sc.2) holds.
    expect(head(repo)).toBe(before);
    const onDisk = readFileSync(join(repo, TASK_101), 'utf-8');
    expect(onDisk).toContain('status: pending');
    expect(onDisk).toContain('INJECTED BODY PARAGRAPH');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC2: `approve` refuses an uncommitted FRONTMATTER field it does not own, naming the field', async () => {
    dirtyFrontmatter(repo, TASK_101, 'tags: ["INJECTED-BY-A-DIRTY-TREE"]');
    const before = head(repo);

    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'state change only, allegedly' } });

    expect(result.ok).toBe(false);
    expect(errorMessage(result)).toContain("frontmatter field 'tags'");
    expect(head(repo)).toBe(before);
  });

  it('AC2: `approve` refuses when `status` ITSELF was hand-edited but never committed — the subject would declare a transition history does not support', async () => {
    // HEAD says `pending`; the worktree says `in-review`. Today the verb reads the worktree, so it
    // emits `[in-review → approved]` while the committed diff reads `pending → approved`.
    writeFileSync(join(repo, TASK_101), taskDoc({ id: 'task-101', status: 'in-review' }), 'utf-8');
    const before = head(repo);

    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'the from-state came from the worktree' } });

    expect(result.ok).toBe(false);
    expect(errorMessage(result)).toContain("frontmatter field 'status'");
    expect(head(repo)).toBe(before);
  });

  it('AC2: `approve` refuses when the INDEX holds a version of the document the worktree no longer has', async () => {
    dirtyBody(repo, TASK_101, 'STAGED-VERSION-ONLY LINE');
    execFileSync('git', ['-C', repo, 'add', '--', TASK_101], { encoding: 'utf-8' });
    dirtyBody(repo, TASK_101, 'WORKTREE-ONLY LINE (never staged by the user)');
    const before = head(repo);

    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'measuring the index' } });

    expect(result.ok).toBe(false);
    expect(errorMessage(result)).toContain('the body');
    expect(head(repo)).toBe(before);
    // The user's staged version is still staged — it was not silently discarded by a `git add`.
    expect(gitOut(repo, ['show', `:0:${TASK_101}`])).toContain('STAGED-VERSION-ONLY LINE');
  });

  it('AC2: `approve` refuses a document that is not tracked at HEAD at all', async () => {
    writeFixtureFile(repo, 'docs/memory/v0.2/task-777.md', taskDoc({ id: 'task-777', status: 'pending' }));
    const before = head(repo);

    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-777', options: { reason: 'never committed' } });

    expect(result.ok).toBe(false);
    // Since task-247 (bug-187) the preamble refuses it, at HEAD, before the write guard is reached.
    expect(errorMessage(result)).toContain('docs/memory/v0.2/task-777.md is not committed at HEAD');
    expect(errorMessage(result)).toContain('memory add');
    expect(head(repo)).toBe(before);
  });

  it('AC5: `reject` refuses a dirty document too — the guard is on the write path, not on one verb', async () => {
    dirtyBody(repo, TASK_101, 'INJECTED BODY PARAGRAPH.');
    const before = head(repo);

    const result = await memoryOp('memoryReject')({ root: repo, positional: 'task-101', options: { reason: 'needs work' } });

    expect(result.ok).toBe(false);
    expect(errorMessage(result)).toContain('the body');
    expect(head(repo)).toBe(before);
  });

  it('AC5: `deprecate` refuses a dirty document too', async () => {
    dirtyFrontmatter(repo, TASK_101, 'tags: ["INJECTED-BY-A-DIRTY-TREE"]');
    const before = head(repo);

    const result = await memoryOp('memoryDeprecate')({ root: repo, positional: 'task-101', options: { reason: 'retiring' } });

    expect(result.ok).toBe(false);
    expect(errorMessage(result)).toContain("frontmatter field 'tags'");
    expect(head(repo)).toBe(before);
  });

  // --- AC3: the happy paths, asserted against the PARENT COMMIT ---------------------------------

  it('AC3: a clean `approve` commits exactly one line changed, measured against HEAD~1 and not against the file on disk', async () => {
    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'meets standards' } });

    expect(result.ok).toBe(true);
    const patch = committedPatch(repo);
    expect(patch.paths).toEqual([TASK_101]);
    expect(patch.removed).toEqual(['status: pending']);
    expect(patch.added).toEqual(['status: backlog']);
  });

  it('AC5/AC3: a clean `reject` commits exactly its two owned fields — `status` and `rejection_reason` — and is not caught by its own guard', async () => {
    const result = await memoryOp('memoryReject')({ root: repo, positional: 'task-300', options: { reason: 'tests are missing' } });

    expect(result.ok).toBe(true);
    const patch = committedPatch(repo);
    expect(patch.paths).toEqual([TASK_300]);
    expect(patch.removed).toEqual(['status: in-review']);
    expect(patch.added).toEqual(['status: in-progress', 'rejection_reason: "tests are missing"']);
  });

  it('AC5/AC3: a clean `deprecate` commits the status line alone and is not caught by its own guard', async () => {
    const result = await memoryOp('memoryDeprecate')({ root: repo, positional: 'task-101', options: { reason: 'superseded by task-102' } });

    expect(result.ok).toBe(true);
    const patch = committedPatch(repo);
    expect(patch.paths).toEqual([TASK_101]);
    expect(patch.removed).toEqual(['status: pending']);
    expect(patch.added).toEqual(['status: deprecated']);
  });

  it('bug-027 regression: an UNRELATED staged path neither blocks a gated verb nor is swept into its commit', async () => {
    writeFixtureFile(repo, 'unrelated.txt', 'user work in progress\n');
    execFileSync('git', ['-C', repo, 'add', '--', 'unrelated.txt'], { encoding: 'utf-8' });

    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'meets standards' } });

    expect(result.ok).toBe(true);
    expect(committedPatch(repo).paths).toEqual([TASK_101]);
    // Still staged, still uncommitted — neither committed nor unstaged.
    expect(gitOut(repo, ['status', '--porcelain', '--', 'unrelated.txt'])).toBe('A  unrelated.txt');
  });

  // --- AC4: the asymmetry `submit` is entitled to ------------------------------------------------

  it('AC4: `submit` DOES carry uncommitted body and frontmatter content — the gated verbs may not, and that difference is deliberate', async () => {
    // A draft the author has just finished writing: new title, new body, neither committed. This is
    // exactly the fixture shape that makes `approve` refuse two assertions below.
    writeFixtureFile(repo, 'docs/memory/v0.2/task-500.md', taskDoc({ id: 'task-500', status: 'draft' }));
    commitAll(repo, 'add task-500');
    writeFileSync(
      join(repo, 'docs/memory/v0.2/task-500.md'),
      taskDoc({ id: 'task-500', status: 'draft', title: 'A finished title', body: 'The content the author just wrote.' }),
      'utf-8',
    );

    const result = await memoryOp('memorySubmit')({ root: repo, positional: 'task-500' });

    expect(result.ok).toBe(true);
    const patch = committedPatch(repo);
    expect(patch.paths).toEqual(['docs/memory/v0.2/task-500.md']);
    // `submit` is defined as filling content AND moving state (spec-010's ownership row), so the body
    // and the title ride in legitimately, alongside the status change.
    expect(patch.added).toContain('status: pending');
    expect(patch.added).toContain('title: "A finished title"');
    expect(patch.added).toContain('The content the author just wrote.');
    expect(gitOut(repo, ['status', '--porcelain', '--', 'docs/memory/v0.2/task-500.md'])).toBe('');
  });

  it('AC4: the asymmetry, stated as one assertion — the SAME uncommitted edit that `submit` carries makes `approve` refuse', async () => {
    writeFixtureFile(repo, 'docs/memory/v0.2/task-600.md', taskDoc({ id: 'task-600', status: 'draft' }));
    writeFixtureFile(repo, 'docs/memory/v0.2/task-601.md', taskDoc({ id: 'task-601', status: 'pending' }));
    commitAll(repo, 'add task-600 and task-601');

    const edit = 'The very same paragraph, added to both documents and committed to neither.';
    dirtyBody(repo, 'docs/memory/v0.2/task-600.md', edit);
    dirtyBody(repo, 'docs/memory/v0.2/task-601.md', edit);

    const submitted = await memoryOp('memorySubmit')({ root: repo, positional: 'task-600' });
    const approved = await memoryOp('memoryApprove')({ root: repo, positional: 'task-601', options: { reason: 'meets standards' } });

    expect(submitted.ok).toBe(true);
    expect(approved.ok).toBe(false);
    expect(errorMessage(approved)).toContain('the body');
  });
});

describe('verifyCommittedScope — the post-condition, applied directly to a commit (AC3)', () => {
  let repo: string;
  const DOC = 'docs/memory/v0.2/task-101.md';

  /** Commit the current working tree wholesale, the way a hand-made `wf(...)` commit would. */
  function commitWorktree(message: string): string {
    commitAll(repo, message);
    return head(repo);
  }

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, DOC, taskDoc({ id: 'task-101', status: 'pending' }));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('passes a commit that changes the declared field and nothing else', () => {
    writeFileSync(join(repo, DOC), taskDoc({ id: 'task-101', status: 'backlog' }), 'utf-8');
    const sha = commitWorktree('wf(task): approve task-101 [pending → backlog]');

    expect(verifyCommittedScope(repo, sha, DOC, { status: 'backlog' }, 'declared-fields-only')).toEqual([]);
  });

  it('fails a commit whose document body changed as well — the exact shape bug-076 produced', () => {
    writeFileSync(
      join(repo, DOC),
      taskDoc({ id: 'task-101', status: 'backlog', body: 'INJECTED BODY PARAGRAPH — never mentioned by any commit subject.' }),
      'utf-8',
    );
    const sha = commitWorktree('wf(task): approve task-101 [pending → backlog]');

    expect(verifyCommittedScope(repo, sha, DOC, { status: 'backlog' }, 'declared-fields-only')).toEqual([
      'the body changed although this operation does not own it',
    ]);
  });

  it('fails a commit that moved a frontmatter field the operation does not own', () => {
    dirtyFrontmatter(repo, DOC, 'tags: ["INJECTED-BY-A-DIRTY-TREE"]');
    writeFileSync(join(repo, DOC), readFileSync(join(repo, DOC), 'utf-8').replace('status: pending', 'status: backlog'), 'utf-8');
    const sha = commitWorktree('wf(task): approve task-101 [pending → backlog]');

    expect(verifyCommittedScope(repo, sha, DOC, { status: 'backlog' }, 'declared-fields-only')).toEqual([
      "field 'tags' changed although this operation does not own it",
    ]);
  });

  it('fails a commit that also carries an unrelated path', () => {
    writeFileSync(join(repo, DOC), taskDoc({ id: 'task-101', status: 'backlog' }), 'utf-8');
    writeFixtureFile(repo, 'unrelated.txt', 'swept in\n');
    const sha = commitWorktree('wf(task): approve task-101 [pending → backlog]');

    expect(verifyCommittedScope(repo, sha, DOC, { status: 'backlog' }, 'declared-fields-only')).toEqual([
      "it also contains 'unrelated.txt'",
    ]);
  });

  it('fails when the document is absent from the commit\'s tree, and stops before comparing content', () => {
    writeFixtureFile(repo, 'unrelated.txt', 'something else entirely\n');
    const sha = commitWorktree('chore: unrelated');
    const missing = 'docs/memory/v0.2/task-999.md';

    // A commit that merely leaves the document UNCHANGED is a different (and detected) failure: the
    // content comparison reports the declared field never moved. Absence is the one case where there
    // is nothing to compare, so the walk stops there rather than diffing against an empty string.
    expect(verifyCommittedScope(repo, sha, DOC, { status: 'backlog' }, 'declared-fields-only')).toEqual([
      "it also contains 'unrelated.txt'",
      'field \'status\' is "pending", expected "backlog"',
    ]);
    expect(verifyCommittedScope(repo, sha, missing, { status: 'backlog' }, 'declared-fields-only')).toEqual([
      "it also contains 'unrelated.txt'",
      `it does not contain '${missing}'`,
    ]);
  });

  it('under `carries-content` the same body and field changes are in scope — only the declared fields are checked (AC4)', () => {
    dirtyFrontmatter(repo, DOC, 'tags: ["written by the author"]');
    writeFileSync(
      join(repo, DOC),
      readFileSync(join(repo, DOC), 'utf-8').replace('status: pending', 'status: backlog').replace('Real content.', 'The content the author just wrote.'),
      'utf-8',
    );
    const sha = commitWorktree('wf(task): submit task-101');

    expect(verifyCommittedScope(repo, sha, DOC, { status: 'backlog' }, 'carries-content')).toEqual([]);
    // …and the declared field is still enforced there: a commit that did NOT move `status` fails.
    expect(verifyCommittedScope(repo, sha, DOC, { status: 'in-review' }, 'carries-content')).toEqual([
      'field \'status\' is "backlog", expected "in-review"',
    ]);
  });

  it('compares a ROOT commit against the empty tree rather than failing to resolve a parent', () => {
    const fresh = makeTempGitRepo();
    try {
      writeFixtureFile(fresh, DOC, taskDoc({ id: 'task-101', status: 'pending' }));
      commitAll(fresh, 'root commit');
      const sha = gitOut(fresh, ['rev-parse', 'HEAD']);

      // The document is ADDED by this commit, so under the strict scope everything in it is new.
      const problems = verifyCommittedScope(fresh, sha, DOC, { status: 'pending' }, 'declared-fields-only');
      expect(problems).toContain('the body changed although this operation does not own it');
      expect(problems).toContain("field 'id' changed although this operation does not own it");
    } finally {
      removeTempDir(fresh);
    }
  });
});

describe('the post-condition as an alarm — a commit that grew after every pre-write check passed (AC3)', () => {
  let repo: string;
  const DOC = 'docs/memory/v0.2/task-101.md';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, DOC, taskDoc({ id: 'task-101', status: 'pending' }));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  /**
   * The one realistic way a commit can carry more than the verb wrote: a repository-local
   * `pre-commit` hook — a formatter, or a linter run with `--fix` — that rewrites the element file
   * and re-stages it. It runs AFTER `requireUnmodifiedDocument` (the tree was clean), AFTER the
   * rendering post-condition, and inside `git commit` itself, so nothing before the commit can see
   * it. Only a check that reads the committed tree can.
   *
   * POSIX-only by construction (a shebang plus the executable bit). CI is `ubuntu-24.04` on all
   * three jobs (`.github/workflows/publish.yml`), and the case is skipped elsewhere rather than
   * failing for a reason that has nothing to do with the behaviour under test.
   */
  const itOnPosix = process.platform === 'win32' ? it.skip : it;

  itOnPosix('a pre-commit hook that rewrites the element file is caught by the committed-tree check, and the commit is REPORTED rather than rewritten', async () => {
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(
      hook,
      `#!/bin/sh\nprintf 'INJECTED BY A PRE-COMMIT HOOK\\n' >> "${DOC}"\ngit add -- "${DOC}"\n`,
      'utf-8',
    );
    chmodSync(hook, 0o755);
    const before = head(repo);

    const result = await memoryOp('memoryApprove')({ root: repo, positional: 'task-101', options: { reason: 'meets standards' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain('carries more than the change it declares');
    expect(errorMessage(result)).toContain('the body changed although this operation does not own it');

    // The alarm cannot un-commit: by the time it can run, the commit exists. It names the sha and
    // leaves history alone — rewriting it behind the user's back is the worse failure (dl-035).
    const after = head(repo);
    expect(after).not.toBe(before);
    expect(errorMessage(result)).toContain(after);
    expect(gitOut(repo, ['show', `${after}:${DOC}`])).toContain('INJECTED BY A PRE-COMMIT HOOK');
  });
});
