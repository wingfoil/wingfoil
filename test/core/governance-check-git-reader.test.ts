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

import * as core from '../../src/core';
import { CORE_MODULES } from '../../src/core';
import * as leaf from '../../src/core/governance-check';
import {
  buildGovernanceReport,
  checkAuthority,
  checkBody,
  checkState,
  checkStatusOutsideWf,
  checkSupersedesPair,
  checkVerbEdge,
  checkWorkflowRecordAuthority,
  createGitHistoryReader,
  governanceCheck,
  VERIFY_WHOLE_HISTORY,
  type HistoryCommit,
  type HistoryReader,
} from '../../src/core/governance-check';
import { coreFailed, type CoreResult } from '../../src/core/types';
import { ValidationError } from '../../src/validation';
import { UsageError } from '../../src/core/usage-error';
import { withWarningSink } from '../../src/validation/warning';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { ADR, APPROVER, DEVELOPER, DNA, HistoryModel, INVALID_MEMORY_YAML, MEMORY_YAML, TASK, adrDoc, approvalBody, approverLine, governedModel, taskDoc, type Person } from './helpers/in-memory-history-reader';

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

describe('task-365 — the branches only an unusual history reaches, on the in-memory reader (spec-020 §4.4–§4.8, §3)', () => {
  const DOC = TASK('t-1');
  const state = (commit: HistoryCommit, reader: HistoryReader): string[] => checkState(commit, reader, { gated: true }).findings.map((finding) => finding.message);

  it('a memory commit outside the wf() head is judged by subject only: body, authority, state and verb-edge return nothing', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'wf(task) approve t-1', body: approvalBody(), author: DEVELOPER });
    const reader = model.reader();
    for (const check of [checkBody, checkAuthority, checkState, checkVerbEdge, checkSupersedesPair]) expect(check(commit, reader, { gated: true })).toEqual({ findings: [], stateUnchecked: [] });
  });

  it('state: a legal park, an assign that keeps the status, a named unbracketed approve, a walk finding of another commit', () => {
    const model = governedModel();
    model.commit({ subject: 'docs: set', files: { [DOC]: taskDoc('in-progress') } });
    const park = model.commit({ subject: 'wf(task): park t-1 [in-progress → backlog]', body: 'Reason: Later.', files: { [DOC]: taskDoc('backlog') } });
    const assign = model.commit({ subject: 'wf(task): assign release v1 to t-1', files: { [DOC]: taskDoc('backlog', 'v1') } });
    const bare = model.commit({ subject: 'wf(task): approve t-1', body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('backlog', 'v2') } });
    const reader = model.reader({ transitionFindings: { [DOC]: [{ kind: 'unparseable', sha: assign.sha, subject: assign.subject }] as never } });
    expect([state(park, reader), state(assign, reader), state(bare, reader)]).toEqual([[], [], []]);
  });

  it('state: a walk that throws anything but a ValidationError is not swallowed; an unnamed document\'s unreadable walk is not listed', () => {
    const model = governedModel();
    model.commit({ subject: 'wf(task): add t-2', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
    const named = model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('backlog'), [TASK('t-2')]: taskDoc('pending', '', 't-2') } });
    const base = model.reader();
    const throwing = (error: Error, which: 'transitions' | 'transitionFindings'): HistoryReader => ({ ...base, [which]: () => { throw error; } });
    expect(() => checkState(named, throwing(new Error('boom'), 'transitionFindings'), { gated: true })).toThrow('boom');
    expect(() => checkState(named, throwing(new Error('boom'), 'transitions'), { gated: true })).toThrow('boom');
    const unreadable = new ValidationError([{ code: 'E_YAML_PARSE_ERROR', path: '', file: DOC, message: 'bad yaml' }]);
    expect(checkState(named, throwing(unreadable, 'transitions'), { gated: true })).toEqual({ findings: [], stateUnchecked: [] });
  });

  it('verb-edge: a paired verb on a non-edge is left to state; a hop into deprecated is no reject crossing; a gone document whose bracket agrees, or created or deleted in the commit', () => {
    const model = governedModel();
    model.commit({ subject: 'docs: set', files: { [DOC]: taskDoc('done') } });
    const nonEdge = model.commit({ subject: 'wf(task): approve t-1 [done → pending]', body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('pending') } });
    const deprecated = model.commit({ subject: 'wf(task): sync t-1 [pending → deprecated]', files: { [DOC]: taskDoc('deprecated') } });
    model.commit({ subject: 'wf(task): add t-4', files: { [TASK('t-4')]: taskDoc('draft', '', 't-4') } });
    const agrees = model.commit({ subject: 'wf(task): sync t-4 [draft → pending]', files: { [TASK('t-4')]: taskDoc('pending', '', 't-4') } });
    const created = model.commit({ subject: 'wf(task): sync t-8 [draft → pending]', files: { [TASK('t-8')]: taskDoc('pending', '', 't-8') } });
    model.commit({ subject: 'wf(task): add t-9', files: { [TASK('t-9')]: taskDoc('draft', '', 't-9') } });
    const removed = model.commit({ subject: 'wf(task): sync t-9 [draft → pending]', files: { [TASK('t-9')]: null } });
    model.commit({ subject: 'chore: drop', files: { [TASK('t-4')]: null, [TASK('t-8')]: null } });
    const reader = model.reader();
    const verbEdge = (commit: HistoryCommit): string[] => checkVerbEdge(commit, reader, { gated: true }).findings.map((finding) => finding.message);
    expect(verbEdge(nonEdge)).toEqual([]);
    expect(verbEdge(deprecated)).toEqual([]);
    expect(verbEdge(agrees)).toEqual([]);
    expect(verbEdge(created)).toEqual([`${TASK('t-8')} (gone at HEAD): the bracket declares draft → pending, the frontmatter went null → pending`]);
    expect(verbEdge(removed)).toEqual([`${TASK('t-9')} (gone at HEAD): the bracket declares draft → pending, the frontmatter went draft → null`]);
  });

  it('a rename in a named commit keeps the written path; a machine with no gates or returns reads no such edge', () => {
    const MACHINE_ONLY = `${MEMORY_YAML}  note:\n    path: "docs/memory/note/{id}.md"\n    states:\n      sequence: [draft, done]\n`;
    const model = governedModel({ memoryYaml: MACHINE_ONLY });
    model.commit({ subject: 'wf(note): add n-1', files: { 'docs/memory/note/n-1.md': '---\nid: "n-1"\ntype: note\nstatus: draft\n---\n' } });
    const reject = model.commit({ subject: 'wf(note): reject n-1 [draft → done]', body: approvalBody(), author: APPROVER, files: { 'docs/memory/note/n-1.md': '---\nid: "n-1"\ntype: note\nstatus: done\n---\n' } });
    const moved = model.commit({ subject: 'wf(task): sync t-1 [pending → backlog]', renames: { [DOC]: 'docs/memory/task/t-1z.md' }, files: { 'docs/memory/task/t-1z.md': taskDoc('backlog') } });
    model.commit({ subject: 'chore: drop', files: { 'docs/memory/task/t-1z.md': null } });
    const reader = model.reader();
    expect(checkVerbEdge(reject, reader, { gated: true }).findings.map((finding) => finding.message)).toEqual(["'reject' moves along a gates reject edge; draft → done is a forward edge of the 'note' machine"]);
    expect(checkVerbEdge(moved, reader, { gated: true }).findings.map((finding) => finding.message)).toEqual([
      `${DOC} (gone at HEAD): the bracket declares pending → backlog, the frontmatter went pending → null`,
    ]);
  });

  it('status-outside-wf: no frontmatter, a frontmatter that is no mapping, a status removed, and nothing when the parent\'s memory.yaml does not validate', () => {
    const model = governedModel();
    const plain = model.commit({ subject: 'docs: plain', files: { 'docs/memory/task/readme.md': 'No frontmatter.\n', 'docs/memory/task/scalar.md': '---\njust text\n---\n' } });
    const unstatused = model.commit({ subject: 'docs: drop the status', files: { [DOC]: '---\nid: "t-1"\ntype: task\n---\n' } });
    model.commit({ subject: 'chore: break memory', files: { '.wingfoil/memory.yaml': INVALID_MEMORY_YAML } });
    const after = model.commit({ subject: 'docs: tidy', files: { [DOC]: taskDoc('done') } });
    const reader = model.reader();
    const outside = (commit: HistoryCommit): string[] => checkStatusOutsideWf(commit, reader, { gated: true }).findings.map((finding) => finding.message);
    expect(outside(plain)).toEqual([]);
    expect(outside(unstatused)).toEqual([`${DOC}: its status went pending → (none) in a commit that is not a wf() Memory operation (dl-139)`]);
    expect(outside(after)).toEqual([]);
  });

  it('supersedes-pair: an unnamed touched document is skipped; an approved document with no id is named by its file', () => {
    const model = governedModel();
    model.commit({ subject: 'wf(adr): add a-1', files: { [ADR('a-1')]: '---\ntype: adr\nstatus: pending\nsupersedes: a-0\n---\n', [ADR('x-1')]: adrDoc('x-1', 'pending', 'a-0') } });
    const approve = model.commit({ subject: 'wf(adr): approve a-1 [pending → accepted]', body: approvalBody(), author: APPROVER, files: { [ADR('a-1')]: '---\ntype: adr\nstatus: accepted\nsupersedes: a-0\n---\n', [ADR('x-1')]: adrDoc('x-1', 'accepted', 'a-0') } });
    expect(checkSupersedesPair(approve, model.reader(), { gated: true }).findings.map((finding) => finding.message)).toEqual([
      `${ADR('a-1')}: approved into 'accepted' with supersedes: a-0, but a-0 is missing at HEAD, not 'superseded': complete the pair with \`wf(adr): finalize a-0 [accepted → superseded]\`, Reason: superseded by a-1 (its supersedes: field), approved in ${approve.sha}.`,
    ]);
  });

  it('workflow-record-authority: a record with no parent has no dna.yaml to grant the role', () => {
    const model = new HistoryModel();
    const record = model.commit({ subject: 'workflow: finalize p-1 a.b', body: approverLine(APPROVER), author: APPROVER });
    expect(checkWorkflowRecordAuthority(record, model.reader(), { gated: true }).findings.map((finding) => finding.message)).toEqual([
      'no .wingfoil/dna.yaml is committed before this commit, so no approval authority can be established',
    ]);
  });

  it('the report keeps one of two equal findings, and orders a commit\'s trailer-paragraph findings after its other body findings', () => {
    const model = governedModel();
    const subject = 'wf(task): sync t-1 [pending → draft → pending → draft]';
    const commit = model.commit({ subject, body: 'Reason: a.\nreason: b.\n\nWingFoil-Step: s.b\nWingFoil-Instance: p-1\n\nWingFoil-Version: 0.4.0', files: { [DOC]: taskDoc('draft') } });
    const hop = { kind: 'illegal-hop', sha: commit.sha, subject, hop: { from: 'draft', to: 'pending' } };
    const report = buildGovernanceReport(model.reader({ transitionFindings: { [DOC]: [hop, hop] as never } }), { base: null, introducedAt: null }, new Set());
    const checks = report.findings.map((finding) => `${finding.rule}/${finding.check}`);
    const body = report.findings.filter((finding) => finding.check === 'body').map((finding) => finding.message);
    expect(body.length).toBeGreaterThan(1);
    expect(body).toEqual([...body].sort());
    expect(checks).toEqual([...body.map(() => 'body/body'), 'body/trailer-paragraph', 'body/trailer-paragraph', 'state/state', 'state/verb-edge']);
    expect(report.findings.filter((finding) => finding.check === 'trailer-paragraph').map((finding) => finding.message.split(':')[0])).toEqual(['a WingFoil-Step', 'a WingFoil-Instance']);
    expect(report.findings.filter((finding) => finding.check === 'state').map((finding) => finding.message)).toEqual([`${DOC}: the hop draft → pending is not an edge of the 'task' machine at this commit`]);
  });
});

describe('task-365 — the barrel, coreFailed\'s warnings and the default options', () => {
  it('src/core re-exports every value of the rule module as the same object', () => {
    const barrel = core as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(leaf)) expect([name, barrel[name]]).toEqual([name, value]);
  });

  it('coreFailed carries warnings when there are some, and no key for none', () => {
    expect(coreFailed(1, 'm', ['w'])).toEqual({ ok: true, value: 1, warnings: ['w'], failed: { message: 'm' } });
    expect('warnings' in coreFailed(1, 'm', [])).toBe(false);
  });

  it('governanceCheck with no options judges the whole history; prefetch skips an other commit after a broken memory.yaml', () => {
    const { repo } = governed();
    repo.commit('docs: seed t-3', { [TASK('t-3')]: taskDoc('draft', '', 't-3') });
    repo.commit('chore: break memory', { '.wingfoil/memory.yaml': INVALID_MEMORY_YAML });
    repo.commit('docs: tidy', { [TASK('t-3')]: taskDoc('done', '', 't-3') });
    const report = governanceCheck(repo.root);
    expect(report.base).toBeNull();
    expect(report.findings.filter((finding) => finding.check === 'status-outside-wf').map((finding) => finding.message)).toEqual([
      `${TASK('t-3')}: its status went (none) → draft in a commit that is not a wf() Memory operation (dl-139)`,
    ]);
  });

  it('headDocumentStatus keeps the first of two documents with one id, in path order, and skips one with no id', () => {
    const { repo } = governed();
    repo.commit('wf(adr): add a-0', { [ADR('a-0')]: adrDoc('a-0', 'accepted'), [ADR('a-0-copy')]: adrDoc('a-0', 'pending'), [ADR('anon')]: '---\ntype: adr\nstatus: draft\n---\n' });
    // `a-0-copy.md` sorts before `a-0.md` ('-' before '.'), so its status is the one kept.
    expect(createGitHistoryReader(repo.root, { head: repo.head() }).headDocumentStatus('a-0')).toBe('pending');
  });
});
