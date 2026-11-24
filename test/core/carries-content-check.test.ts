/**
 * task-378 AC 4 (red-first; `bug-287`; `spec-020` §4.14 and T-38 to T-40 as amended at the design gate, `a9fec9ce3`;
 * design item 4, D5 (a)) — the `carries-content` check of `src/core/governance-check.ts`, an exported function of one
 * commit, a `HistoryReader` and `{ gated }`, driven with the in-memory reader of `./helpers/in-memory-history-reader`
 * (its `carriesLineBefore` answers from the model's bodies), and the git reader's `carriesLineBefore` over a throwaway
 * repository.
 *
 * - Each of §4.14's six rows once, with its exact message (`rule` `body`, `check` `carries-content`).
 * - Not judged: a merge; a commit that is no Memory `wf()` operation (an other commit, a configuration scope, a verb that
 *   did not parse); a submit with no line and no ancestor line (`carriesLineBefore` false); a named document absent at
 *   the first parent; a document the subject does not name.
 * - Several named documents: the union of their items in the declared order (fields by name, then the body, …).
 * - The git reader: `carriesLineBefore(sha)` is true exactly when a proper ancestor of `sha` carries a
 *   `Carries content: ` line — false on the line commit itself, on its ancestors and on a side branch forked before it,
 *   true after it and on a merge that brings the line in.
 *
 * Expected messages: `spec-020` §4.14's table word for word at the worktree's head. The computed items rest on
 * `describeSubmitContent`, whose words `test/memory/submit-commit-body.test.ts` pins.
 *
 * Expected red: `checkCarriesContent` is not exported (`tsc` TS2305; jest `TypeError: … is not a function`), the
 * in-memory reader's `carriesLineBefore` is no member of `HistoryReader` (`tsc` TS2353), and the git reader has no
 * `carriesLineBefore` (jest `TypeError: … is not a function`).
 */
import { checkCarriesContent, createGitHistoryReader, type HistoryCommit, type HistoryReader } from '../../src/core/governance-check';
import { APPROVER, TASK, approvalBody, governedModel, taskDoc } from './helpers/in-memory-history-reader';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Finding {
  readonly rule: string;
  readonly check: string;
  readonly message: string;
}

const C = (message: string): Finding => ({ rule: 'body', check: 'carries-content', message });

/** The findings of `checkCarriesContent` on `commit`, in the order the check returns them, on `rule`, `check`, `message`. */
function carriesFindings(commit: HistoryCommit, reader: HistoryReader): Finding[] {
  return checkCarriesContent(commit, reader, { gated: true }).findings.map((entry: Finding) => ({ rule: entry.rule, check: entry.check, message: entry.message }));
}

/** A task document whose title is `title` (a frontmatter field edit), at `status`, with an optional body line. */
function titledDoc(id: string, status: string, title: string, extra = ''): string {
  return ['---', `id: "${id}"`, 'type: task', `title: "${title}"`, `status: ${status}`, '---', '', 'Body.', ...(extra ? [extra] : []), ''].join('\n');
}

/**
 * The governed base, then `t-2` added (`draft`) by a verb-shaped commit; with `line`, a submit of `t-9` that carries a
 * `Carries content:` line first, so every later commit has an ancestor carrying the line.
 */
function base(line: boolean): ReturnType<typeof governedModel> {
  const model = governedModel();
  if (line) {
    model.commit({ subject: 'wf(task): add t-9', files: { [TASK('t-9')]: taskDoc('draft', '', 't-9') } });
    model.commit({ subject: 'wf(task): submit t-9', body: 'Carries content: the body', files: { [TASK('t-9')]: taskDoc('pending', 'More.', 't-9') } });
  }
  model.commit({ subject: 'wf(task): add t-2', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
  return model;
}

describe('task-378 AC 4 — carries-content: each row of spec-020 §4.14 once, with its exact message', () => {
  it("row 1 — a verb other than submit with a Carries content: line: 'approve' declares no carried content", () => {
    const model = base(true);
    const commit = model.commit({
      subject: 'wf(task): approve t-1 [pending → backlog]',
      body: `${approvalBody()}\nCarries content: the body`,
      author: APPROVER,
      files: { [TASK('t-1')]: taskDoc('backlog') },
    });
    expect(carriesFindings(commit, model.reader())).toEqual([C("'approve' declares no carried content: only a submit writes a Carries content: line (spec-008 §2, bug-287)")]);
  });

  it('row 2 — two Carries content: lines on a submit', () => {
    const model = base(true);
    const commit = model.commit({ subject: 'wf(task): submit t-2', body: 'Carries content: the body\nCarries content: the body', files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([C('2 Carries content: lines; a submit declares one (spec-008 §2, bug-287)')]);
  });

  it('row 3 — the key written carries content: (letter case), on a submit whose items agree', () => {
    const model = base(false);
    const commit = model.commit({ subject: 'wf(task): submit t-2', body: 'carries content: the body', files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([C('the Carries content: key is written `Carries content:` (spec-008 §2, bug-287)')]);
  });

  it("row 4 — an item that is none of the five forms: the first such item, as written (frontmatter fields 'x')", () => {
    const model = base(true);
    const commit = model.commit({ subject: 'wf(task): submit t-2', body: "Carries content: frontmatter fields 'x', the frontmatter fields", files: { [TASK('t-2')]: taskDoc('pending', '', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([C("the Carries content: line names 'frontmatter fields 'x'', which is not an item spec-008 §2 declares (bug-287)")]);
  });

  it('row 5 — a submit with no line that carries the body, after an ancestor carried a line (T-38, second hand submit)', () => {
    const model = base(true);
    const commit = model.commit({ subject: 'wf(task): submit t-2', files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([C("'submit' carries the body but declares no Carries content: line (spec-008 §2, bug-287)")]);
  });

  it('row 6 — the body declared on a pure transition: "nothing beyond its state move"', () => {
    const model = base(true);
    const commit = model.commit({ subject: 'wf(task): submit t-2', body: 'Carries content: the body', files: { [TASK('t-2')]: taskDoc('pending', '', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([
      C('the Carries content: line declares the body, but the commit carries nothing beyond its state move (spec-008 §2, bug-287)'),
    ]);
  });

  it('row 6 — two items declared out of order: the order is part of the declaration', () => {
    const model = base(true);
    const commit = model.commit({
      subject: 'wf(task): submit t-2',
      body: "Carries content: the body, frontmatter field 'title'",
      files: { [TASK('t-2')]: titledDoc('t-2', 'pending', 'A better task', 'More.') },
    });
    expect(carriesFindings(commit, model.reader())).toEqual([
      C("the Carries content: line declares the body, frontmatter field 'title', but the commit carries frontmatter field 'title', the body (spec-008 §2, bug-287)"),
    ]);
  });

  it('a submit whose line agrees with what it carries, in the declared order: no finding', () => {
    const model = base(true);
    const commit = model.commit({
      subject: 'wf(task): submit t-2',
      body: "Carries content: frontmatter field 'title', the body",
      files: { [TASK('t-2')]: titledDoc('t-2', 'pending', 'A better task', 'More.') },
    });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });

  it('a pure submit with no line, after an ancestor carried one: no finding', () => {
    const model = base(true);
    const commit = model.commit({ subject: 'wf(task): submit t-2', files: { [TASK('t-2')]: taskDoc('pending', '', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });
});

describe('task-378 AC 4 — carries-content: what it does not judge (spec-020 §4.14, D5 (a))', () => {
  it('T-38 — a hand submit carrying the body with no line, and no ancestor carrying a line: no finding', () => {
    const model = base(false);
    const commit = model.commit({ subject: 'wf(task): submit t-2', files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });

  it('a merge, whatever its message carries', () => {
    const model = base(true);
    const tip = model.commit({ subject: 'docs: note', files: { 'notes.md': 'a\n' } });
    const side = model.commit({ subject: 'docs: side', files: { 'side.md': 'b\n' }, detached: true, parents: [tip.sha] });
    const merge = model.commit({ subject: 'wf(task): submit t-2', body: "Carries content: frontmatter fields 'x'\nCarries content: x", parents: [tip.sha, side.sha] });
    expect(carriesFindings(merge, model.reader())).toEqual([]);
  });

  it.each<[string, string]>([
    ['an other commit', 'docs: tidy'],
    ['a configuration scope (wf(dna):)', 'wf(dna): set project.name'],
    ['a wf() verb that did not parse', 'wf(task): aprove t-2'],
  ])('%s with a malformed Carries content: line', (_label, subject) => {
    const model = base(true);
    const commit = model.commit({ subject, body: "Carries content: frontmatter fields 'x'\ncarries content: y", files: { [TASK('t-2')]: taskDoc('draft', 'More.', 't-2') } });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });

  it('a named document absent at the first parent is not compared (the state check judges that move)', () => {
    const model = base(true);
    const commit = model.commit({ subject: 'wf(task): submit t-7', files: { [TASK('t-7')]: taskDoc('pending', 'More.', 't-7') } });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });

  it('a document the subject does not name is not compared: only the named one counts', () => {
    const model = base(true);
    const commit = model.commit({
      subject: 'wf(task): submit t-2',
      body: 'Carries content: the body',
      files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2'), [TASK('t-1')]: titledDoc('t-1', 'pending', 'Renamed task') },
    });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });
});

describe('task-378 AC 4 — carries-content: several named documents give the union, in the declared order', () => {
  it('t-1 gains a title edit, t-2 a body edit, no line: the fifth row names the title field, then the body', () => {
    const model = base(true);
    model.commit({ subject: 'docs: reopen t-1', files: { [TASK('t-1')]: taskDoc('draft') } });
    const commit = model.commit({
      subject: 'wf(task): submit t-1, t-2',
      files: { [TASK('t-1')]: titledDoc('t-1', 'pending', 'A better task'), [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') },
    });
    expect(carriesFindings(commit, model.reader())).toEqual([
      C("'submit' carries frontmatter field 'title', the body but declares no Carries content: line (spec-008 §2, bug-287)"),
    ]);
  });

  it('the same union declared in that order: no finding', () => {
    const model = base(true);
    model.commit({ subject: 'docs: reopen t-1', files: { [TASK('t-1')]: taskDoc('draft') } });
    const commit = model.commit({
      subject: 'wf(task): submit t-1, t-2',
      body: "Carries content: frontmatter field 'title', the body",
      files: { [TASK('t-1')]: titledDoc('t-1', 'pending', 'A better task'), [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') },
    });
    expect(carriesFindings(commit, model.reader())).toEqual([]);
  });
});

describe('task-378 AC 4 — the git reader\'s carriesLineBefore (spec-020 §4.14: one git log --grep, one rev-list --ancestry-path)', () => {
  const root = makeTempGitRepo();
  afterAll(() => removeTempDir(root));
  const commit = (message: string, files: Record<string, string> = {}): string => {
    for (const [path, text] of Object.entries(files)) writeFixtureFile(root, path, text);
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '--allow-empty', '-m', message]);
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const first = commit('chore: start', { 'README.md': 'x\n' });
  const fork = commit('docs: before the line', { 'notes.md': 'a\n' });
  git(root, ['branch', 'side']);
  const line = commit('wf(task): submit t-1\n\nCarries content: the body', { 'docs/memory/task/t-1.md': taskDoc('pending', 'More.') });
  const after = commit('docs: after the line', { 'notes.md': 'b\n' });
  git(root, ['checkout', '--quiet', 'side']);
  const side = commit('docs: on the side branch', { 'side.md': 'c\n' });
  git(root, ['checkout', '--quiet', '-']);
  git(root, ['merge', '--quiet', '--no-ff', '-m', "Merge branch 'side'", 'side']);
  const merge = git(root, ['rev-parse', 'HEAD']).trim();
  const reader = createGitHistoryReader(root, { head: merge });

  it.each<[string, () => string, boolean]>([
    ['the root commit', () => first, false],
    ['the fork point, before the line', () => fork, false],
    ['the line commit itself (only a proper ancestor counts)', () => line, false],
    ['a commit after the line', () => after, true],
    ['a side-branch commit forked before the line', () => side, false],
    ['the merge that brings the side branch in', () => merge, true],
  ])('%s', (_label, sha, expected) => {
    expect(reader.carriesLineBefore(sha())).toBe(expected);
  });
});
