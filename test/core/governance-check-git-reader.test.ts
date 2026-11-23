/**
 * task-365 (`spec-020` §2.3, §3, §4.1, §4.13; design item 1, D1 (a), D4 (a), D9 (a)) — the git half of the rule module
 * and the operation, in-process, over throwaway repositories: `createGitHistoryReader`'s answers, the checks' handling of
 * what it cannot read, and `verifyFn`'s order of refusals. The red suites drive the checks with an in-memory reader
 * (`governance-check.test.ts`) and the command through the compiled CLI (`test/cli/verify.integration.test.ts`); this
 * file is the developer's, for what lies between: the reader's git reads and the branches only a repository reaches.
 *
 * Fixtures: `test/storage/helpers/git-fixture.ts` repositories, fixed commit dates, identities per commit, the
 * `MEMORY_YAML` / `DNA` / `taskDoc` of `./helpers/in-memory-history-reader`.
 */
import { execFileSync } from 'node:child_process';

import { createGitHistoryReader, governanceCheck, VERIFY_WHOLE_HISTORY } from '../../src/core/governance-check';
import { CORE_MODULES } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { withWarningSink } from '../../src/validation/warning';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { ADR, APPROVER, DEVELOPER, DNA, INVALID_MEMORY_YAML, MEMORY_YAML, TASK, adrDoc, approvalBody, taskDoc, type Person } from './helpers/in-memory-history-reader';

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

/** A throwaway repository whose commits carry fixed, increasing dates and the given author. */
class Repo {
  readonly root = makeTempGitRepo();
  private minute = 0;

  constructor() {
    roots.push(this.root);
  }

  /** Write (text), delete (`null`) or rename (`{ from }`) files, then commit everything; returns the sha. */
  commit(message: string, files: Record<string, string | null | { from: string }> = {}, author: Person = DEVELOPER): string {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) git(this.root, ['rm', '--quiet', path]);
      else if (typeof content === 'object') git(this.root, ['mv', content.from, path]);
      else writeFixtureFile(this.root, path, content);
    }
    git(this.root, ['add', '-A']);
    const date = `2026-01-01T09:${String(this.minute).padStart(2, '0')}:00Z`;
    this.minute += 1;
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], {
      cwd: this.root,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    return this.head();
  }

  head(): string {
    return git(this.root, ['rev-parse', 'HEAD']).trim();
  }
}

/** The governed base: configure, `add t-1` (`draft`), `submit t-1` (`pending`); returns the repository and the base sha. */
function governed(): { repo: Repo; base: string } {
  const repo = new Repo();
  repo.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
  repo.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
  const base = repo.commit('wf(task): submit t-1', { [TASK('t-1')]: taskDoc('pending') });
  return { repo, base };
}

const UNPARSEABLE = '---\nid: "t-1"\nstatus: [unclosed\n---\n\nBody.\n';
const NEWER = '---\nid: "t-1"\ntype: task\nformat: 99\nstatus: pending\n---\n\nBody.\n';

describe('task-365 — createGitHistoryReader answers from the repository (spec-020 §4.13)', () => {
  const { repo, base } = governed();
  const renamed = repo.commit('docs: move t-1', { 'docs/memory/task/t-1b.md': { from: TASK('t-1') } });
  const moved = repo.commit('docs: move again', { 'docs/memory/task/t-1c.md': { from: 'docs/memory/task/t-1b.md' } });
  const dropped = repo.commit('docs: note then drop', { 'notes.md': 'a\n' });
  const deleted = repo.commit('docs: drop the note', { 'notes.md': null });
  const broken = repo.commit('chore: broken yaml', { '.wingfoil/dna.yaml': 'team: [unclosed\n' });
  const head = repo.head();
  const reader = createGitHistoryReader(repo.root, { head, base, introducedAt: dropped });

  it('lists the range oldest first, with parents, authors and the body trimmed', () => {
    const commits = reader.commits();
    expect(commits.map((commit) => commit.sha)).toEqual([renamed, moved, dropped, deleted, broken]);
    expect(commits[0]).toEqual({ sha: renamed, parents: [base], authorName: DEVELOPER.name, authorEmail: DEVELOPER.email, subject: 'docs: move t-1', body: '' });
    expect(reader.head).toBe(head);
  });

  it('a rename is two touched paths and one { from, to } change; an addition and a deletion have a null side', () => {
    expect(reader.touchedPaths(renamed)).toEqual(['docs/memory/task/t-1.md', 'docs/memory/task/t-1b.md']);
    expect(reader.fileChanges(renamed)).toEqual([{ from: 'docs/memory/task/t-1.md', to: 'docs/memory/task/t-1b.md' }]);
    expect(reader.fileChanges(dropped)).toEqual([{ from: null, to: 'notes.md' }]);
    expect(reader.fileChanges(deleted)).toEqual([{ from: 'notes.md', to: null }]);
    expect(reader.fileChanges(broken)).toEqual([{ from: '.wingfoil/dna.yaml', to: '.wingfoil/dna.yaml' }]);
    expect(reader.fileChanges('0'.repeat(40))).toEqual([]);
    expect(reader.touchedPaths('0'.repeat(40))).toEqual([]);
  });

  it('follows renames inside the range to the path at HEAD, and answers which paths HEAD holds', () => {
    expect(reader.pathAtHead(TASK('t-1'))).toBe('docs/memory/task/t-1c.md');
    expect(reader.pathAtHead('notes.md')).toBe('notes.md');
    expect(reader.existsAtHead('docs/memory/task/t-1c.md')).toBe(true);
    expect(reader.existsAtHead(TASK('t-1'))).toBe(false);
  });

  it('reads blobs at a revision, null where the path or the revision is absent, and keeps a prefetched answer', () => {
    expect(reader.blob(base, TASK('t-1'))).toBe(taskDoc('pending'));
    expect(reader.blob(`${renamed}^`, TASK('t-1'))).toBe(taskDoc('pending'));
    expect(reader.blob(head, TASK('t-1'))).toBeNull();
    reader.prefetch([{ rev: dropped, path: 'notes.md' }, { rev: base, path: TASK('t-1') }]);
    expect(reader.blob(dropped, 'notes.md')).toBe('a\n');
  });

  it('reads the configuration silently, schema only: absent is null, a YAML error and a schema error are their first line', () => {
    expect(reader.memoryYamlAt(null)).toBeNull();
    expect(reader.memoryYamlAt(base)).toEqual({ ok: true, value: expect.objectContaining({ types: expect.objectContaining({ task: expect.anything() }) }) });
    expect(reader.dnaYamlAt(base)).toEqual({ ok: true, value: expect.objectContaining({ team: expect.anything() }) });
    const broken_ = reader.dnaYamlAt(head);
    expect(broken_?.ok).toBe(false);
    expect(broken_ !== null && !broken_.ok && broken_.error.split('\n')).toHaveLength(1);
    const empty = new Repo();
    const first = empty.commit('chore: start', { 'README.md': 'x\n' });
    const second = empty.commit('chore: invalid memory', { '.wingfoil/memory.yaml': INVALID_MEMORY_YAML });
    const other = createGitHistoryReader(empty.root, { head: second });
    expect(other.memoryYamlAt(first)).toBeNull();
    expect(other.memoryYamlAt(second)).toEqual({ ok: false, error: 'Invalid input: expected record, received number' });
  });

  it('the history set is --introduced-at and its ancestors; empty without it', () => {
    expect(reader.history.has(dropped)).toBe(true);
    expect(reader.history.has(base)).toBe(true);
    expect(reader.history.has(deleted)).toBe(false);
    expect(createGitHistoryReader(repo.root, { head }).history.size).toBe(0);
  });

  it('memoizes the walks: the same answer twice, and a walk that throws throws again', () => {
    const path = 'docs/memory/task/t-1c.md';
    expect(reader.transitions(path)).toBe(reader.transitions(path));
    expect(reader.transitionFindings(path)).toBe(reader.transitionFindings(path));
    const bad = new Repo();
    bad.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
    bad.commit('wf(task): add t-1', { [TASK('t-1')]: UNPARSEABLE });
    const badReader = createGitHistoryReader(bad.root, { head: bad.head() });
    expect(() => badReader.transitions(TASK('t-1'))).toThrow();
    expect(() => badReader.transitions(TASK('t-1'))).toThrow();
  });
});

describe('task-365 — the sync citation and the documents at HEAD, through git', () => {
  const { repo } = governed();
  const rejected = repo.commit(`wf(task): reject t-1 [pending → draft]\n\n${approvalBody('Rework.')}`, { [TASK('t-1')]: taskDoc('draft') }, APPROVER);
  repo.commit('wf(adr): add a-0', { [ADR('a-0')]: adrDoc('a-0', 'accepted'), [ADR('a-2')]: '---\nid: "a-2"\ntype: adr\n---\n\nBody.\n' });
  const reader = createGitHistoryReader(repo.root, { head: repo.head() });

  it('isRejectCommit: a token naming a reject commit, another commit, nothing at all', () => {
    expect(reader.isRejectCommit(rejected.slice(0, 12))).toBe(true);
    expect(reader.isRejectCommit(rejected.slice(0, 12))).toBe(true);
    expect(reader.isRejectCommit(repo.head().slice(0, 12))).toBe(false);
    expect(reader.isRejectCommit('deadbeefdeadbeef')).toBe(false);
  });

  it('headDocumentStatus: a status, no status (null), no such id (undefined)', () => {
    expect(reader.headDocumentStatus('a-0')).toBe('accepted');
    expect(reader.headDocumentStatus('a-2')).toBeNull();
    expect(reader.headDocumentStatus('a-9')).toBeUndefined();
  });

  it('headDocumentStatus: no document is read when HEAD\'s memory.yaml does not validate', () => {
    repo.commit('chore: break memory', { '.wingfoil/memory.yaml': INVALID_MEMORY_YAML });
    expect(createGitHistoryReader(repo.root, { head: repo.head() }).headDocumentStatus('a-0')).toBeUndefined();
  });
});

describe('task-365 — what the checks cannot read becomes state not checked (spec-020 §4.5, §4.6)', () => {
  it('a named, bracketed document whose revision does not parse; and one written in a newer format', () => {
    const { repo, base } = governed();
    const bad = repo.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody()}`, { [TASK('t-1')]: UNPARSEABLE }, APPROVER);
    const report = governanceCheck(repo.root, { base });
    expect(report.stateUnchecked.map((entry) => ({ sha: entry.sha, reason: entry.reason.replace(/ \(.*$/s, '') }))).toEqual([
      { sha: bad, reason: `${TASK('t-1')}: a revision's frontmatter does not parse` },
    ]);
    const newer = governed();
    const later = newer.repo.commit('wf(task): add t-2', { [TASK('t-2')]: NEWER.replace('"t-1"', '"t-2"').replace('pending', 'draft') });
    const newerReport = governanceCheck(newer.repo.root, { base: newer.base });
    expect(newerReport.stateUnchecked.map((entry) => entry.sha)).toEqual([later]);
    expect(newerReport.stateUnchecked[0]?.reason).toMatch(/^docs\/memory\/task\/t-2\.md: a revision is written in a newer format \(/);
  });

  it('a named document gone at HEAD whose revision does not parse, or is in a newer format', () => {
    const { repo, base } = governed();
    repo.commit('wf(task): add t-4', { [TASK('t-4')]: UNPARSEABLE.replace('t-1', 't-4') });
    const unparsed = repo.commit('wf(task): sync t-4 [draft → pending]', { [TASK('t-4')]: taskDoc('pending', '', 't-4') });
    repo.commit('wf(task): add t-5', { [TASK('t-5')]: taskDoc('draft', '', 't-5') });
    const newer = repo.commit('wf(task): sync t-5 [draft → pending]', { [TASK('t-5')]: NEWER.replace('"t-1"', '"t-5"') });
    repo.commit('chore: drop', { [TASK('t-4')]: null, [TASK('t-5')]: null });
    const reasons = governanceCheck(repo.root, { base }).stateUnchecked.filter((entry) => entry.sha === unparsed || entry.sha === newer);
    expect(reasons.map((entry) => entry.reason)).toEqual([
      `${TASK('t-4')}: a revision's frontmatter does not parse`,
      expect.stringMatching(/^docs\/memory\/task\/t-5\.md: a revision is written in a newer format \(E_INVALID_FORMAT: /),
    ]);
  });

  it('a named document gone at HEAD under a verb whose bracket cannot be compared: it does not exist at HEAD', () => {
    const { repo, base } = governed();
    repo.commit('wf(task): add t-6', { [TASK('t-6')]: taskDoc('draft', '', 't-6') });
    const amend = repo.commit(`wf(task): amend t-6 [draft → draft]\n\n${approvalBody('Fix.')}`, { [TASK('t-6')]: taskDoc('draft', 'Fix.', 't-6') }, APPROVER);
    repo.commit('chore: drop', { [TASK('t-6')]: null });
    expect(governanceCheck(repo.root, { base }).stateUnchecked.filter((entry) => entry.sha === amend).map((entry) => entry.reason)).toEqual([
      `${TASK('t-6')} does not exist at HEAD`,
    ]);
  });

  it('status-outside-wf skips a change whose frontmatter does not parse, and judges a rename into the content roots', () => {
    const { repo, base } = governed();
    repo.commit('docs: garble', { [TASK('t-1')]: UNPARSEABLE });
    repo.commit('docs: draft elsewhere', { 'drafts/t-7.md': taskDoc('draft', '', 't-7') });
    const moved = repo.commit('docs: file it', { [TASK('t-7')]: { from: 'drafts/t-7.md' } });
    const report = governanceCheck(repo.root, { base });
    expect(report.findings.filter((finding) => finding.check === 'status-outside-wf').map((finding) => [finding.sha, finding.message])).toEqual([]);
    expect(report.commits.other).toBe(3);
    expect(moved).toBe(repo.head());
  });

  it('supersedes-pair skips an approved document whose frontmatter does not parse', () => {
    const { repo, base } = governed();
    repo.commit('wf(adr): add a-1', { [ADR('a-1')]: adrDoc('a-1', 'pending', 'a-0') });
    repo.commit(`wf(adr): approve a-1 [pending → accepted]\n\n${approvalBody()}`, { [ADR('a-1')]: '---\nid: "a-1"\nstatus: [\n---\n' }, APPROVER);
    expect(governanceCheck(repo.root, { base }).findings.filter((finding) => finding.check === 'supersedes-pair')).toEqual([]);
  });

  it('a root commit is judged with no parent: no memory.yaml, no dna.yaml; its bracket is still compared, with no machine', () => {
    const repo = new Repo();
    const root = repo.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody()}`, { [TASK('t-1')]: taskDoc('backlog'), 'notes.md': 'x\n' }, APPROVER);
    const report = governanceCheck(repo.root, {});
    expect(report.findings.filter((finding) => finding.sha === root).map((finding) => [finding.rule, finding.message])).toEqual([
      ['authority', 'no .wingfoil/dna.yaml is committed before this commit, so no approval authority can be established'],
      // The consistency walk runs without a machine, as the script's does: the endpoints are compared, the hops are not.
      ['state', `${TASK('t-1')}: the bracket declares pending → backlog, the frontmatter went null → backlog`],
      ['state', 'no .wingfoil/memory.yaml is committed at this commit: its state cannot be checked'],
    ]);
  });
});

describe('task-365 — verifyFn, in-process: the order of refusals and the whole-history warning (spec-020 §2.2, §5.1, §8.2)', () => {
  const operation = CORE_MODULES.find((module) => module.name === 'verify')?.operations.verify;
  const run = async (params: Record<string, unknown>): Promise<CoreResult<unknown>> => (await operation!.fn(params as never)) as CoreResult<unknown>;

  it('a blank --introduced-at is the UsageError, exit 2', async () => {
    const { repo } = governed();
    await expect(run({ root: repo.root, options: { 'introduced-at': '  ' } })).rejects.toThrow(new UsageError('invalid flag value: --introduced-at must not be blank'));
  });

  it('an unborn HEAD is NOT_FOUND with details { rev: \'HEAD\' } and no flag, before any warning', async () => {
    const root = makeTempGitRepo();
    roots.push(root);
    const warnings: string[] = [];
    const result = await withWarningSink((text) => warnings.push(text), () => run({ root, options: {} }));
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'revision "HEAD" does not name a commit', details: { rev: 'HEAD' } } });
    expect(warnings).toEqual([]);
  });

  it('a malformed --base is VALIDATION with the flag; a directory git cannot read is thrown, not a revision error', async () => {
    const { repo } = governed();
    expect(await run({ root: repo.root, options: { base: 'a..b' } })).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringMatching(/^malformed revision "a\.\.b"/), details: { rev: 'a..b', flag: '--base' } },
    });
    const outside = makeTempGitRepo();
    roots.push(outside);
    removeTempDir(outside);
    await expect(run({ root: outside, options: {} })).rejects.toThrow();
  });

  it('with neither option the warning is raised once, then the report; with --introduced-at alone none is', async () => {
    const { repo, base } = governed();
    const warnings: string[] = [];
    const whole = await withWarningSink((text) => warnings.push(text), () => run({ root: repo.root }));
    expect(warnings).toEqual([VERIFY_WHOLE_HISTORY]);
    expect(whole.ok).toBe(true);
    const quiet: string[] = [];
    const introduced = await withWarningSink((text) => quiet.push(text), () => run({ root: repo.root, options: { 'introduced-at': base } }));
    expect(quiet).toEqual([]);
    expect(introduced.ok && (introduced.value as { introducedAt: string }).introducedAt).toBe(base);
  });
});
