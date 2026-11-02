/**
 * `getMemoryHistory` must report the commits that touched the ELEMENT — and only those
 * (`task-089-fix-history-walk-attributes-only-real-commits`, `bug-077-…`).
 *
 * `git log --follow` does not only follow renames: git's path search runs with **copy** detection
 * enabled, so when a path is absent from the parent commit git accepts a source that still exists.
 * Every Memory element is created by copying its type's template, which `wingfoil init` has already
 * committed — so the walk crossed that copy edge and reported the commit that added the TEMPLATE as
 * an entry of the element's history, with a real sha, author and timestamp and every derived field
 * null. It fired for every element in every scaffolded project.
 *
 * The two edges `--follow` can cross are not equivalent, and this suite pins both halves of that
 * distinction rather than only the defect:
 *
 * - a **rename** (`R`) is the element continuing under a new name — keep following it. This is not
 *   hypothetical: the Memory folder's `planning/v1/*` was renamed to `planning/rl-v1/*` in this
 *   repository, moving five `release` elements at once, because the `release` type's `path` pattern
 *   interpolates the release-line id. Dropping `--follow` would cut `minor-v0.1`'s audit trail from
 *   six commits to one.
 * - a **copy** (`C`) is the element being born from a file that outlives it — everything strictly
 *   older belongs to that other file.
 *
 * The fixtures below are built from the REAL `wingfoil init` scaffold (`templateScaffold`) and the
 * real template-copy sequence `wingfoil memory add` performs, not from a synthetic `git mv`: the
 * scaffold-then-add case is the one that fires in the field, so it is the one under test.
 * `test/cli/history-scaffold-phantom.integration.test.ts` runs the same case end to end through the
 * compiled CLI.
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  dropPreCreationAncestry,
  findElementCreationSha,
  getMemoryHistory,
  type MemoryHistoryEntry,
} from '../../src/memory/history';
import { resolveTemplate, templateScaffold } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const SCAFFOLD_SUBJECT = 'chore(wingfoil): initialize .wingfoil/ with the Scrum template';
const ADR_TEMPLATE_PATH = '.wingfoil/memory/templates/adr.md';
const ADR_PATH = 'docs/memory/adr/adr-001-copied-from-template.md';

/** Write and commit the real `wingfoil init --template scrum` scaffold, templates included. */
function commitScaffold(repo: string): void {
  const template = resolveTemplate('scrum');
  if (!template) throw new Error('the scrum template must resolve');
  for (const file of templateScaffold(template)) writeFixtureFile(repo, file.path, file.content);
  commitAll(repo, SCAFFOLD_SUBJECT);
}

/**
 * Copy the committed ADR template into place with its frontmatter skeleton filled in — the exact
 * shape `wingfoil memory add` produces (CLAUDE.md §5.1: "copy the type's `template.file` scaffold
 * verbatim", then fill `id`/`title`/`status`), and the shape git scores as a copy of the template.
 */
function addFromTemplate(repo: string, status: string): void {
  const template = readFileSync(join(repo, ADR_TEMPLATE_PATH), 'utf-8');
  writeFixtureFile(
    repo,
    ADR_PATH,
    template
      .replace('id: ""', 'id: "adr-001-copied-from-template"')
      .replace('title: ""', 'title: "Copied from the template"')
      .replace('status: draft', `status: ${status}`),
  );
}

/** Rewrite only the element's `status:` line, the way every state-transition verb does. */
function setStatus(repo: string, path: string, status: string): void {
  const current = readFileSync(join(repo, path), 'utf-8');
  writeFixtureFile(repo, path, current.replace(/^status: .*$/m, `status: ${status}`));
}

describe('getMemoryHistory — the walk stops at the element, not at the template it was copied from', () => {
  let repo = '';

  afterEach(() => {
    if (repo) removeTempDir(repo);
    repo = '';
  });

  it('reports only the commits that touched the element, not the commit that added the template it was copied from', () => {
    repo = makeTempGitRepo();
    commitScaffold(repo);
    addFromTemplate(repo, 'draft');
    commitAll(repo, 'wf(adr): add adr-001-copied-from-template');
    setStatus(repo, ADR_PATH, 'pending');
    commitAll(repo, 'wf(adr): submit adr-001-copied-from-template');
    setStatus(repo, ADR_PATH, 'accepted');
    commitAll(repo, 'wf(adr): approve adr-001-copied-from-template [pending → accepted]');

    // The fixture really is the defect's shape: git followed the element back into the template.
    expect(git(repo, ['log', '--follow', '--format=%s', '--', ADR_PATH]).trim().split('\n')).toContain(
      SCAFFOLD_SUBJECT,
    );

    const history = getMemoryHistory(repo, ADR_PATH);

    expect(history.map((entry) => entry.subject)).toEqual([
      'wf(adr): add adr-001-copied-from-template',
      'wf(adr): submit adr-001-copied-from-template',
      'wf(adr): approve adr-001-copied-from-template [pending → accepted]',
    ]);
    // Stated the other way round too: no reported commit may be one whose tree lacks the element.
    for (const entry of history) {
      expect(git(repo, ['ls-tree', '--name-only', entry.sha, ADR_PATH]).trim()).toBe(ADR_PATH);
    }
  });

  it("keeps a renamed element's pre-rename history — the reason the walk follows at all", () => {
    const renamed = 'docs/memory/adr/renamed/adr-001-copied-from-template.md';
    repo = makeTempGitRepo();
    commitScaffold(repo);
    addFromTemplate(repo, 'draft');
    commitAll(repo, 'wf(adr): add adr-001-copied-from-template');
    setStatus(repo, ADR_PATH, 'pending');
    commitAll(repo, 'wf(adr): submit adr-001-copied-from-template');
    mkdirSync(join(repo, 'docs', 'memory', 'adr', 'renamed'), { recursive: true });
    git(repo, ['mv', ADR_PATH, renamed]);
    commitAll(repo, 'config: move the adr under its release-line directory');
    setStatus(repo, renamed, 'accepted');
    commitAll(repo, 'wf(adr): approve adr-001-copied-from-template [pending → accepted]');

    // A plain `git log -- <path>` sees only the two commits at or after the rename; the element's
    // creation and submission are exactly what rename-following exists to recover.
    expect(git(repo, ['log', '--format=%s', '--', renamed]).trim().split('\n')).toHaveLength(2);

    expect(getMemoryHistory(repo, renamed).map((entry) => entry.subject)).toEqual([
      'wf(adr): add adr-001-copied-from-template',
      'wf(adr): submit adr-001-copied-from-template',
      'config: move the adr under its release-line directory',
      'wf(adr): approve adr-001-copied-from-template [pending → accepted]',
    ]);
  });

  it('leaves a document that was never copied from anything exactly as the plain walk reports it', () => {
    const path = 'docs/04_memory/v0.1/task-900-authored.md';
    repo = makeTempGitRepo();
    writeFixtureFile(repo, path, ['---', 'id: task-900-authored', 'status: draft', '---', '', 'Body.', ''].join('\n'));
    commitAll(repo, 'wf(task): add task-900-authored');
    writeFixtureFile(repo, path, ['---', 'id: task-900-authored', 'status: pending', '---', '', 'Body.', ''].join('\n'));
    commitAll(repo, 'wf(task): submit task-900-authored');

    expect(findElementCreationSha(repo, path)).toBeNull();
    expect(getMemoryHistory(repo, path).map((entry) => entry.subject)).toEqual([
      'wf(task): add task-900-authored',
      'wf(task): submit task-900-authored',
    ]);
  });

  it('is deterministic — repeated calls over unchanged state produce the exact same result', () => {
    repo = makeTempGitRepo();
    commitScaffold(repo);
    addFromTemplate(repo, 'draft');
    commitAll(repo, 'wf(adr): add adr-001-copied-from-template');

    expect(getMemoryHistory(repo, ADR_PATH)).toEqual(getMemoryHistory(repo, ADR_PATH));
  });
});

describe('the truncation never stands in for a failure (AC5) — a real error stays an error', () => {
  let repo = '';

  afterEach(() => {
    if (repo) removeTempDir(repo);
    repo = '';
  });

  it('surfaces a failing creation probe as an error, never as "this element was never copied"', () => {
    repo = mkdtempSync(join(tmpdir(), 'wf-not-a-repo-'));
    // A git failure and "no copy edge" are different answers. Folding the first into the second is
    // how the phantom entry would come back silently, so the probe must not swallow it.
    expect(() => findElementCreationSha(repo, ADR_PATH)).toThrow(/git log --follow --diff-filter=C/);
  });

  it('surfaces a disagreement between the two walks as an error rather than skipping the truncation', () => {
    const entries: MemoryHistoryEntry[] = [
      { sha: 'a'.repeat(40), authorName: 'A', authorEmail: 'a@e.test', date: '2026-01-01T00:00:00+00:00', subject: 'one', body: '', path: ADR_PATH },
    ];

    expect(() => dropPreCreationAncestry(entries, 'b'.repeat(40))).toThrow(/not present in the history walk/);
  });

  it('drops exactly the ancestry that precedes the element, keeping the creation commit itself', () => {
    const entry = (sha: string, subject: string): MemoryHistoryEntry => ({
      sha,
      authorName: 'A',
      authorEmail: 'a@e.test',
      date: '2026-01-01T00:00:00+00:00',
      subject,
      body: '',
      path: ADR_PATH,
    });
    const entries = [entry('1'.repeat(40), 'template'), entry('2'.repeat(40), 'add'), entry('3'.repeat(40), 'submit')];

    expect(dropPreCreationAncestry(entries, '2'.repeat(40)).map((e) => e.subject)).toEqual(['add', 'submit']);
    expect(dropPreCreationAncestry(entries, null)).toEqual(entries);
  });
});
