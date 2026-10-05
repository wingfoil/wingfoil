/**
 * task-247 (`bug-187`) — every Memory transition verb decides from the element's **committed**
 * `status` and resolves its `<id>` against the documents **at `HEAD`** (`spec-006-core-domain-api`
 * §6 item 1, `dl-080` option (B)).
 *
 * Before this task `prepareMemoryTransition` (`src/core/memory-transition.ts`) scanned the working
 * tree (`findMemoryDocumentById`) and took `status` from the working-tree frontmatter, so:
 *
 * - an element already past `draft` at `HEAD`, edited back to `draft` on disk, was submitted again;
 * - a hand-made document with no `add` commit was transitioned as though it had been registered;
 * - a document deleted on disk but held by `HEAD` was reported `document not found`;
 * - an uncommitted copy of a document, sorting before the committed one, was the one acted on.
 *
 * The content `memory submit` and `memory amend` commit is still the working tree's: content from the
 * working tree, state from `HEAD`.
 *
 * Every write lands in a throwaway temp git repository, through the REAL registered `CORE_MODULES`
 * operations the CLI and the MCP Tools dispatch to.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const TEST_EMAIL = 'wf-test@example.invalid';
const TEST_NAME = 'WingFoil Test';

/** The bug and task machines of this repository's `.wingfoil/memory.yaml`, plus an amendable flag. */
const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  task:
    path: "docs/memory/{release}/{id}.md"
    amendable: true
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
  bug:
    path: "docs/memory/bugs/{id}.md"
    amendable: true
    template:
      file: "memory/templates/bug.md"
      frontmatter:
        required: [title, severity]
    states:
      sequence: [draft, open, triaged, planned, in-progress, in-review, resolved, closed]
      gates:
        open: { reject: closed }
        triaged: { reject: closed }
        planned: { reject: closed }
        in-review: { reject: in-progress }
        resolved: { reject: in-progress }
      waiting: [triaged, planned]
`;

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

type Verb = 'memorySubmit' | 'memoryApprove' | 'memoryReject' | 'memoryDeprecate' | 'memoryAmend';
const VERBS: readonly Verb[] = ['memorySubmit', 'memoryApprove', 'memoryReject', 'memoryDeprecate', 'memoryAmend'];

function op(verb: Verb): CoreFn<unknown, { from: string; to: string; path: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[verb];
  if (!operation) throw new Error(`fixture bug: "${verb}" is not registered on the memory module`);
  return operation.fn as CoreFn<unknown, { from: string; to: string; path: string }>;
}

function run(verb: Verb, repo: string, id: string): ReturnType<CoreFn<unknown, { from: string; to: string; path: string }>> {
  return op(verb)({ root: repo, positional: id, positionals: [id], options: { reason: 'a reason' } });
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

function bugDoc(id: string, status: string, body = 'Steps.'): string {
  return `---
id: ${id}
type: bug
title: "A bug"
status: ${status}
severity: "high"
---

## Summary

${body}
`;
}

function taskDoc(id: string, status: string, body = 'Real content.'): string {
  return `---
id: ${id}
type: task
title: "A task"
status: ${status}
release: "v0.3"
---

## Description

${body}
`;
}

describe('task-247 — a transition decides from the status committed at HEAD (bug-187)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, 'docs/memory/bugs/bug-001.md', bugDoc('bug-001', 'open'));
    writeFixtureFile(repo, 'docs/memory/v0.3/task-001.md', taskDoc('task-001', 'draft'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('AC1: HEAD at `open`, working tree edited back to `draft` — submit is refused as illegal from `open`, exit 1, nothing written', async () => {
    const path = join(repo, 'docs/memory/bugs/bug-001.md');
    const edited = bugDoc('bug-001', 'draft');
    writeFileSync(path, edited);
    const before = head(repo);

    const result = await run('memorySubmit', repo, 'bug-001');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('illegal transition open -> ');
    expect(head(repo)).toBe(before);
    expect(readFileSync(path, 'utf-8')).toBe(edited);
  });

  it('AC3: submit commits the working-tree content, with the state decided from HEAD (an uncommitted status edit does not decide `from`)', async () => {
    const path = join(repo, 'docs/memory/v0.3/task-001.md');
    // A hand edit of `status` to a waiting state, plus a body edit. The committed status is `draft`.
    writeFileSync(path, taskDoc('task-001', 'backlog', 'Real content, finished.'));

    const result = await run('memorySubmit', repo, 'task-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'draft', to: 'pending' });
    const committed = gitOut(repo, ['show', 'HEAD:docs/memory/v0.3/task-001.md']);
    expect(committed).toContain('status: pending');
    expect(committed).toContain('Real content, finished.');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(task): submit task-001');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('AC3: amend commits the working-tree content and keeps the state committed at HEAD', async () => {
    const path = join(repo, 'docs/memory/bugs/bug-001.md');
    writeFileSync(path, bugDoc('bug-001', 'open', 'Steps, clarified.'));

    const result = await run('memoryAmend', repo, 'bug-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'open', to: 'open' });
    expect(gitOut(repo, ['show', 'HEAD:docs/memory/bugs/bug-001.md'])).toContain('Steps, clarified.');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(bug): amend bug-001 [open → open]');
  });

  it('AC3: an uncommitted copy of the document that sorts first is not the one resolved — the id resolves at HEAD', async () => {
    // HEAD holds task-002 at `pending` under v0.4/. An untracked copy at `draft` under v0.1/ sorts
    // first in the working-tree scan; resolving there would submit the copy.
    writeFixtureFile(repo, 'docs/memory/v0.4/task-002.md', taskDoc('task-002', 'pending'));
    commitAll(repo, 'task-002 at pending');
    writeFixtureFile(repo, 'docs/memory/v0.1/task-002.md', taskDoc('task-002', 'draft'));
    const before = head(repo);

    const result = await run('memorySubmit', repo, 'task-002');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(result.error.message).toContain('illegal transition pending -> ');
    expect(head(repo)).toBe(before);
  });

  // Resolved at HEAD, the document is a regular file; the working tree swapped it for a link out of
  // the project. The write-side confinement guard (REQ-SEC-06, bug-120) still answers on the disk.
  it.each([
    ['memorySubmit', 'task-001', 'docs/memory/v0.3/task-001.md', taskDoc('task-001', 'draft', 'Elsewhere.')],
    ['memoryAmend', 'bug-001', 'docs/memory/bugs/bug-001.md', bugDoc('bug-001', 'open', 'Steps, elsewhere.')],
  ] as const)(
    '%s: a committed document replaced by a symbolic link out of the project in the working tree is refused before the write',
    async (verb, id, path, planted) => {
      const outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
      try {
        const target = join(outside, 'doc.md');
        writeFileSync(target, planted);
        unlinkSync(join(repo, path));
        symlinkSync(target, join(repo, path));
        const before = head(repo);

        const result = await run(verb, repo, id);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(exitCodeForResult(result)).toBe(1);
        expect(result.error.message).toContain(path);
        expect(readFileSync(target, 'utf-8')).toBe(planted);
        expect(head(repo)).toBe(before);
      } finally {
        removeTempDir(outside);
      }
    },
  );

  // Review fix 1 (task-247 review): the hint must work when the index lacks the path too.
  it.each([
    ['a staged deletion (git rm)', ['rm', '-q', 'docs/memory/bugs/bug-001.md']],
    ['a staged rename (git mv)', ['mv', 'docs/memory/bugs/bug-001.md', 'docs/memory/bugs/bug-001-renamed.md']],
  ])('review: after %s, the refusal names a restore command that works', async (_label, args) => {
    gitOut(repo, args);
    const result = await run('memoryApprove', repo, 'bug-001');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const hint = 'git restore --source=HEAD --staged --worktree -- docs/memory/bugs/bug-001.md';
    expect(result.error.message).toContain(hint);
    gitOut(repo, hint.split(' ').slice(1));
    expect(readFileSync(join(repo, 'docs/memory/bugs/bug-001.md'), 'utf-8')).toBe(bugDoc('bug-001', 'open'));
  });

  // Review fix 2: a dangling symlink in place of the committed file is a symlink, not a deletion.
  it('review: a dangling symbolic link in place of the committed document is refused as a symbolic link, not as deleted', async () => {
    unlinkSync(join(repo, 'docs/memory/bugs/bug-001.md'));
    symlinkSync(join(repo, 'no-such-target.md'), join(repo, 'docs/memory/bugs/bug-001.md'));
    const before = head(repo);
    const result = await run('memorySubmit', repo, 'bug-001');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('symbolic link');
    expect(result.error.message).not.toContain('deleted in the working tree');
    expect(head(repo)).toBe(before);
  });

  // Review fix 5 (task-247), amended by task-171 (bug-031): a malformed document committed at HEAD,
  // sorting before the target, no longer refuses the transition of ANOTHER element. It is reported as
  // a W_MEMORY_UNREADABLE warning naming its repository-relative path.
  it('task-171: a committed document that does not parse no longer refuses another element; it is a warning', async () => {
    writeFixtureFile(repo, 'docs/memory/bugs/bug-000.md', '---\nid: [unclosed\n---\n');
    commitAll(repo, 'a malformed document');
    const before = head(repo);
    const result = await run('memorySubmit', repo, 'task-001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(head(repo)).not.toBe(before);
    expect(result.warnings).toEqual([expect.stringMatching(/^W_MEMORY_UNREADABLE \(docs\/memory\/bugs\/bug-000\.md\): unreadable frontmatter in docs\/memory\/bugs\/bug-000\.md: /)]);
  });

  // The id may be in the unreadable document, so a miss says so — after the pinned P1.6 sentence.
  it('task-171: an id not found while a committed document was unreadable is NOT_FOUND naming HEAD:<path>, exit 1', async () => {
    writeFixtureFile(repo, 'docs/memory/bugs/bug-000.md', '---\nid: [unclosed\n---\n');
    commitAll(repo, 'a malformed document');
    const before = head(repo);
    const result = await run('memorySubmit', repo, 'bug-000');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message.startsWith('document not found: bug-000')).toBe(true);
    expect(result.error.message).toContain('HEAD:docs/memory/bugs/bug-000.md');
    expect(head(repo)).toBe(before);
  });

  it.each(VERBS)('AC3: %s on a document HEAD holds but the working tree deleted is not "document not found"', async (verb) => {
    unlinkSync(join(repo, 'docs/memory/bugs/bug-001.md'));
    const before = head(repo);

    const result = await run(verb, repo, 'bug-001');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).not.toContain('document not found');
    expect(result.error.message).toContain('docs/memory/bugs/bug-001.md');
    expect(result.error.message).toContain('deleted in the working tree');
    expect(head(repo)).toBe(before);
    expect(existsSync(join(repo, 'docs/memory/bugs/bug-001.md'))).toBe(false);
  });
});

describe('task-247 — a document with no commit at HEAD is refused by every transition verb (bug-187)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  // A status from which each verb would otherwise be legal, so only the missing commit can refuse it.
  const legalFrom: Record<Verb, string> = {
    memorySubmit: 'draft',
    memoryApprove: 'open',
    memoryReject: 'open',
    memoryDeprecate: 'open',
    memoryAmend: 'open',
  };

  it.each(VERBS)('AC2: %s refuses a hand-made, untracked document, naming `memory add`, exit 1, nothing written', async (verb) => {
    const content = bugDoc('bug-009', legalFrom[verb]);
    writeFixtureFile(repo, 'docs/memory/bugs/bug-009.md', content);
    const before = head(repo);

    const result = await run(verb, repo, 'bug-009');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('memory add');
    expect(result.error.message).toContain('docs/memory/bugs/bug-009.md');
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, 'docs/memory/bugs/bug-009.md'), 'utf-8')).toBe(content);
  });

  it('AC2: a hand-made document that is staged but not committed is refused the same way', async () => {
    writeFixtureFile(repo, 'docs/memory/bugs/bug-009.md', bugDoc('bug-009', 'draft'));
    gitOut(repo, ['add', 'docs/memory/bugs/bug-009.md']);
    const before = head(repo);

    const result = await run('memorySubmit', repo, 'bug-009');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('memory add');
    expect(head(repo)).toBe(before);
  });

  it('an unparsable working-tree document elsewhere cannot change the refusal: the explaining scan is best-effort', async () => {
    writeFixtureFile(repo, 'docs/memory/bugs/bug-500.md', '---\nid: [unclosed\n---\n');
    const result = await run('memorySubmit', repo, 'bug-404');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe('document not found: bug-404');
  });

  it('a working-tree edit that renames the id of a committed document is refused naming the field, not as a missing commit', async () => {
    writeFixtureFile(repo, 'docs/memory/bugs/bug-001.md', bugDoc('bug-001', 'draft'));
    commitAll(repo, 'bug-001');
    writeFixtureFile(repo, 'docs/memory/bugs/bug-001.md', bugDoc('bug-002', 'draft'));
    const before = head(repo);
    const result = await run('memorySubmit', repo, 'bug-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain("frontmatter field 'id'");
    expect(result.error.message).toContain("'bug-001'");
    expect(head(repo)).toBe(before);
  });

  it('an id that no commit and no working-tree document carries keeps the P1.6 sc.3 message', async () => {
    const result = await run('memorySubmit', repo, 'bug-404');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe('document not found: bug-404');
  });
});
