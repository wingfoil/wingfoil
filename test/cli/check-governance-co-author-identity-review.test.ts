/**
 * task-352 review fixes (F1–F3), beside red's `check-governance-co-author-identity.test.ts` (which T4 keeps unchanged):
 *
 * - F1: a MERGE with an `Approver:` line is judged by `co-author-identity` — `approval-agent-trailer` judges only
 *   non-merge commits, so skipping it here would let an unknown co-author escape both checks.
 * - F2: AC 5's duplicate test compares co-authors under D5's equivalence (the name exact, the email in any case), so
 *   `Claude <noreply@anthropic.com>` and `Claude <NoReply@Anthropic.com>` in one final paragraph are one repeated pair
 *   (`bug-535` Expected: "from the same agent"); two different names on one email are not.
 * - F3: AC 5's message text, exactly; and release-health P01 leaves a `co-author-identity` finding out of `raw.unchecked`
 *   as well as out of `failing` (`P01_EXCLUDED_CHECKS`, `scripts/release-health/measure.cjs`).
 *
 * Fixture style of the red suite: a throwaway repository, an identity per commit, no `scripts/check-governance.cjs` in
 * it (every commit gated). Deterministic: fixed text, fixed identities and dates.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { checkGovernance } from '../../scripts/check-governance.cjs';
import type { GovernanceReport } from '../../scripts/check-governance.cjs';
import { processConformance } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const CHECK = 'co-author-identity';
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };
const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DATE = '2026-09-01T10:00:00+00:00';

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    amendable: true
    states:
      sequence: [draft, pending, backlog, in-progress, done]
      gates:
        pending: { reject: draft }
`;

const DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${APPROVER.name}
      email: ${APPROVER.email}
      roles: [ approver, developer ]
    - name: ${DEVELOPER.name}
      email: ${DEVELOPER.email}
      roles: [ developer ]
  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

type Who = { readonly name: string; readonly email: string };

const envOf = (author: Who): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_AUTHOR_NAME: author.name,
  GIT_AUTHOR_EMAIL: author.email,
  GIT_COMMITTER_NAME: author.name,
  GIT_COMMITTER_EMAIL: author.email,
  GIT_AUTHOR_DATE: DATE,
  GIT_COMMITTER_DATE: DATE,
});

function repo(files: Readonly<Record<string, string>>): { root: string; commit: (message: string, extra?: Readonly<Record<string, string>>) => string } {
  const root = makeTempGitRepo();
  roots.push(root);
  const commit = (message: string, extra: Readonly<Record<string, string>> = {}): string => {
    for (const [path, content] of Object.entries(extra)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], { cwd: root, encoding: 'utf-8', env: envOf(DEVELOPER) });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  commit('chore: configure wingfoil', files);
  return { root, commit };
}

const coAuthor = (report: GovernanceReport, sha: string): { rule: string; message: string; gated: boolean }[] =>
  report.findings
    .filter((finding) => finding.sha === sha && (finding.check as string | undefined) === CHECK)
    .map((finding) => ({ rule: finding.rule, message: finding.message, gated: finding.gated }));

describe('task-352 review F1 — a merge with an Approver: line is judged by co-author-identity', () => {
  const r = repo({ '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
  git(r.root, ['checkout', '--quiet', '-b', 'side']);
  r.commit('docs: side work', { 'docs/side.md': 'side\n' });
  git(r.root, ['checkout', '--quiet', 'main']);
  r.commit('docs: main work', { 'docs/main.md': 'main\n' });
  const message = `Merge branch 'side' into main\n\nApprover: ${APPROVER.name} <${APPROVER.email}> (approver)\nCo-Authored-By: Mallory <noreply@anthropic.com>`;
  execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', '--cleanup=whitespace', '-m', message, 'side'], { cwd: r.root, encoding: 'utf-8', env: envOf(APPROVER) });
  const merge = git(r.root, ['rev-parse', 'HEAD']).trim();
  const report = checkGovernance(r.root);

  it('gives one gated co-author-identity finding naming the unknown co-author', () => {
    expect(coAuthor(report, merge)).toEqual([
      {
        rule: 'body',
        message:
          'the co-author Mallory <noreply@anthropic.com> is neither a team.agents nor a team.members entry of the .wingfoil/dna.yaml committed before this commit (name and email both; git-conventions §7, bug-475)',
        gated: true,
      },
    ]);
  });

  it('approval-agent-trailer still leaves the merge alone (it judges non-merge commits only)', () => {
    expect(report.findings.filter((finding) => finding.sha === merge && (finding.check as string | undefined) === 'approval-agent-trailer')).toEqual([]);
  });
});

describe('task-352 review F2, F3 — AC 5 under D5 equivalence, and its exact message', () => {
  const r = repo({ '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
  const emailCase = r.commit('docs: the same agent, email in another case\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By: Claude <NoReply@Anthropic.com>\nAI-Model: claude-opus-5-5');
  const twoNames = r.commit('docs: two names on one email\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By: Mallory <noreply@anthropic.com>\nAI-Model: claude-opus-5-5');
  const twoPairs = r.commit(
    'docs: two pairs\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5',
  );
  const report = checkGovernance(r.root);
  const repeats = (sha: string): string[] => coAuthor(report, sha).map((finding) => finding.message).filter((text) => text.startsWith('the final paragraph repeats'));

  it('the same agent with its email in another case is one repeated pair (F2, bug-535 "from the same agent")', () => {
    expect(repeats(emailCase)).toEqual([
      'the final paragraph repeats the agent attribution: 2 Co-Authored-By: Claude <noreply@anthropic.com> lines (one Co-Authored-By: line per co-author and at most one AI-Model: line; git-conventions §7, bug-535)',
    ]);
    expect(coAuthor(report, emailCase)).toHaveLength(1);
  });

  it('two different names on one email are not a repeated pair (only the unknown name is reported)', () => {
    expect(repeats(twoNames)).toEqual([]);
    expect(coAuthor(report, twoNames)).toHaveLength(1);
  });

  it('the duplicated pair gives exactly the AC 5 message, naming both repeated keys (F3)', () => {
    expect(coAuthor(report, twoPairs)).toEqual([
      {
        rule: 'body',
        message:
          'the final paragraph repeats the agent attribution: 2 Co-Authored-By: Claude <noreply@anthropic.com> lines, 2 AI-Model: lines (one Co-Authored-By: line per co-author and at most one AI-Model: line; git-conventions §7, bug-535)',
        gated: true,
      },
    ]);
  });
});

describe('task-352 review F3 — P01 leaves a co-author-identity finding out of raw.unchecked (P01_EXCLUDED_CHECKS)', () => {
  // This repository's memory.yaml at HEAD and no dna.yaml: the co-authored commit's first parent has none.
  const memoryYaml = execFileSync('git', ['show', 'HEAD:.wingfoil/memory.yaml'], { cwd: REPO_ROOT, encoding: 'utf-8' });
  const r = repo({ '.wingfoil/memory.yaml': memoryYaml });
  const base = git(r.root, ['rev-parse', 'HEAD']).trim();
  const point = r.commit('docs: a note\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5', { 'docs/note.md': 'Note.\n' });

  it('the governance check reports the no-dna co-author finding on the commit (the positive case)', () => {
    expect(coAuthor(checkGovernance(r.root, { base }), point).map((finding) => finding.message)).toEqual([
      'no .wingfoil/dna.yaml is committed before this commit, so the co-author Claude <noreply@anthropic.com> cannot be matched against team.agents or team.members',
    ]);
  });

  it('P01 counts it neither as failing nor as unchecked', () => {
    const p01 = processConformance(r.root, point, base).find((metric) => metric.id === 'P01');
    expect(p01).toBeDefined();
    expect(p01!.failing ?? []).toEqual([]);
    expect((p01!.raw as Record<string, unknown>).unchecked).toBe(0);
  });
});
