/**
 * task-208 (`dl-097` §2 (b), warn-only) — `scripts/lint-claims.cjs`, the claim-shape lint over Memory
 * documents: a state-claim phrase with no command in the same paragraph, list item or table row, and an
 * empty-output claim ("printed nothing") with no positive case beside it. It checks the shape of a claim,
 * never its truth (`claim-evidence`; the truth is the reviewer's, `code-review` "Claims are re-run").
 * Warn-only until its false-positive rate is measured over one release: exit 0 with its warnings, 2
 * only when it cannot run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lintClaims, lintMarkdown } from '../../scripts/lint-claims.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'lint-claims.cjs');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'claim-lint');

const fixtures: string[] = [];
afterAll(() => fixtures.forEach(removeTempDir));

describe('claim lint (dl-097 (b))', () => {
  it('flags a state claim with no command, and an empty-output claim with no positive case, one per item and kind', () => {
    const text = readFileSync(join(FIXTURES, 'flagged.md'), 'utf-8');
    expect(lintMarkdown(text).map((w) => [w.line, w.kind])).toEqual([
      [9, 'state-claim'],
      [10, 'empty-output'],
      [11, 'empty-output'],
      [13, 'state-claim'],
      [18, 'state-claim'],
    ]);
  });

  it('names the phrase it matched', () => {
    const text = readFileSync(join(FIXTURES, 'flagged.md'), 'utf-8');
    expect(lintMarkdown(text)[0]?.message).toMatch(/"unchanged"/);
  });

  it('accepts a claim with its command, an absence with its positive case, and ignores code blocks and comments', () => {
    const text = readFileSync(join(FIXTURES, 'clean.md'), 'utf-8');
    expect(lintMarkdown(text)).toEqual([]);
  });

  it('as a command: exit 0 with GitHub annotations, warn-only', () => {
    const run = spawnCapture('node', [SCRIPT, '--format', 'github', join(FIXTURES, 'flagged.md'), join(FIXTURES, 'clean.md')], { cwd: REPO_ROOT });
    expect(run.status).toBe(0);
    const annotations = run.stdout.split('\n').filter((line) => line.startsWith('::warning '));
    expect(annotations).toHaveLength(5);
    expect(annotations[0]).toMatch(/^::warning file=test\/fixtures\/claim-lint\/flagged\.md,line=9,title=claim-lint::/);
    expect(run.stdout).toMatch(/claim lint: 5 warnings in 1 file \(warn-only\)/);
  });

  it('as a command: exit 2 on a bad option or a missing file', () => {
    expect(spawnCapture('node', [SCRIPT, '--no-such-option'], { cwd: REPO_ROOT }).status).toBe(2);
    expect(spawnCapture('node', [SCRIPT, join(FIXTURES, 'missing.md')], { cwd: REPO_ROOT }).status).toBe(2);
  });

  it('with --base: lints only the Memory documents the range changed, and only the items with added lines', () => {
    const root = makeTempGitRepo();
    fixtures.push(root);
    writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1\ntypes:\n  task:\n    path: "docs/memory/{id}.md"\n');
    writeFixtureFile(root, 'docs/memory/t-1.md', '---\ntype: task\n---\n\n- Old note: the code is unchanged.\n');
    writeFixtureFile(root, 'docs/other.md', '- Outside Memory: unchanged.\n');
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@example.com' } });
    const base = git(root, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(root, 'docs/memory/t-1.md', '---\ntype: task\n---\n\n- Old note: the code is unchanged.\n- New note: the flag does not exist.\n');
    writeFixtureFile(root, 'docs/other.md', '- Outside Memory: unchanged.\n- Still outside: does not exist.\n');
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '-m', 'edit'], { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@example.com' } });
    const report = lintClaims(root, { base });
    expect(report.warnings.map((w) => [w.file, w.line])).toEqual([['docs/memory/t-1.md', 6]]);
  });
});
