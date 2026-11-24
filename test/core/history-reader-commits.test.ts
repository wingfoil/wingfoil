/**
 * task-378 (green, developer; `spec-020` §4.13 and §4.14) — the git reader's list-of-commits mode and the pieces of the
 * mark and the `carries-content` check the red suites reach only through their main paths:
 *
 * - `createGitHistoryReader(root, { head, commits, paths })`: the commits in the given order; `touchedPaths`,
 *   `fileChanges` and `pathAtHead` limited to the given paths, a rename followed; an empty list reads nothing;
 * - `carriesLineBefore` over two line commits on one line of history (the second inside the first's descendants);
 * - `unverifiedFindings` with no entry: an empty map;
 * - `checkCarriesContent` on a submit that is a root commit, on a subject whose id list is malformed, and when a named
 *   document's blob cannot be read.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { checkCarriesContent, createGitHistoryReader, unverifiedFindings, type HistoryCommit, type HistoryReader } from '../../src/core/governance-check';
import { TASK, governedModel, taskDoc } from './helpers/in-memory-history-reader';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

describe('task-378 — createGitHistoryReader reading a list of commits (spec-020 §4.13)', () => {
  const root = makeTempGitRepo();
  afterAll(() => removeTempDir(root));
  const commit = (message: string, files: Record<string, string> = {}, move?: [string, string]): string => {
    for (const [path, text] of Object.entries(files)) writeFixtureFile(root, path, text);
    if (move) {
      mkdirSync(dirname(join(root, move[1])), { recursive: true });
      git(root, ['mv', move[0], move[1]]);
    }
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '--allow-empty', '-m', message]);
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const a = commit('wf(task): add t-1', { 'docs/old/t-1.md': taskDoc('draft'), 'other.md': 'x\n' });
  const b = commit('docs: move t-1', { 'other.md': 'y\n' }, ['docs/old/t-1.md', 'docs/new/t-1.md']);
  const c = commit('wf(task): submit t-1\n\nCarries content: the body', { 'docs/new/t-1.md': taskDoc('pending', 'More.'), 'other.md': 'z\n' });
  const d = commit('wf(task): submit t-1\n\nCarries content: the body', { 'docs/new/t-1.md': taskDoc('pending', 'More and more.') });
  const head = d;

  it('lists the commits in the order given, not in history order', () => {
    const reader = createGitHistoryReader(root, { head, commits: [c, a, b] });
    expect(reader.commits().map((entry) => entry.sha)).toEqual([c, a, b]);
  });

  it('limits touchedPaths, fileChanges and pathAtHead to the given paths, a rename followed', () => {
    const paths = new Map([
      [a, ['docs/old/t-1.md']],
      [b, ['docs/new/t-1.md', 'docs/old/t-1.md']],
      [c, ['docs/new/t-1.md']],
    ]);
    const reader = createGitHistoryReader(root, { head, commits: [a, b, c], paths });
    expect(reader.touchedPaths(a)).toEqual(['docs/old/t-1.md']);
    expect([...reader.touchedPaths(b)].sort()).toEqual(['docs/new/t-1.md', 'docs/old/t-1.md']);
    expect(reader.fileChanges(b)).toEqual([{ from: 'docs/old/t-1.md', to: 'docs/new/t-1.md' }]);
    expect(reader.fileChanges(c)).toEqual([{ from: 'docs/new/t-1.md', to: 'docs/new/t-1.md' }]);
    expect(reader.pathAtHead('docs/old/t-1.md')).toBe('docs/new/t-1.md');
    expect(reader.fileChanges(a)).toEqual([{ from: null, to: 'docs/old/t-1.md' }]);
  });

  it('follows a rename when only its target is a given path', () => {
    const reader = createGitHistoryReader(root, { head, commits: [b], paths: new Map([[b, ['docs/new/t-1.md']]]) });
    expect(reader.pathAtHead('docs/old/t-1.md')).toBe('docs/new/t-1.md');
    expect(reader.fileChanges(b)).toEqual([{ from: 'docs/old/t-1.md', to: 'docs/new/t-1.md' }]);
  });

  it('reads nothing for an empty list (git log with no revision would read HEAD)', () => {
    const reader = createGitHistoryReader(root, { head, commits: [] });
    expect(reader.commits()).toEqual([]);
    expect(reader.touchedPaths(head)).toEqual([]);
    expect(reader.fileChanges(head)).toEqual([]);
    expect(reader.pathAtHead('docs/old/t-1.md')).toBe('docs/old/t-1.md');
  });

  it('carriesLineBefore: after the first line commit, the second line commit included', () => {
    const reader = createGitHistoryReader(root, { head });
    expect([a, b, c, d].map((sha) => reader.carriesLineBefore(sha))).toEqual([false, false, false, true]);
  });

  it('unverifiedFindings with no entry is an empty map', () => {
    expect(unverifiedFindings(root, { head, path: 'docs/new/t-1.md', entries: [] }).size).toBe(0);
  });
});

describe('task-378 — checkCarriesContent: what it cannot compare (spec-020 §4.14)', () => {
  const findings = (commit: HistoryCommit, reader: HistoryReader): string[] => checkCarriesContent(commit, reader, { gated: true }).findings.map((entry) => entry.message);

  it('a submit that is a root commit has no first parent to compare against', () => {
    const model = governedModel();
    const root = model.commit({ subject: 'wf(task): submit t-5', body: 'Carries content: the body', parents: [], detached: true, files: { [TASK('t-5')]: taskDoc('pending', 'x', 't-5') } });
    expect(findings(root, model.reader())).toEqual([]);
  });

  it('a subject whose id list is malformed still names its document by its tokens', () => {
    const model = governedModel();
    model.commit({ subject: 'wf(task): add t-2', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
    const commit = model.commit({ subject: 'wf(task): submit t-2,', body: 'Carries content: the body', files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') } });
    expect(findings(commit, model.reader())).toEqual([]);
  });

  it('a named document whose blob cannot be read is not compared', () => {
    const model = governedModel();
    model.commit({ subject: 'wf(task): add t-2', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
    const commit = model.commit({ subject: 'wf(task): submit t-2', body: 'Carries content: the body', files: { [TASK('t-2')]: taskDoc('pending', '', 't-2') } });
    const reader: HistoryReader = { ...model.reader(), blob: () => null };
    expect(findings(commit, reader)).toEqual([]);
  });
});
