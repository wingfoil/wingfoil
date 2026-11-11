/**
 * task-333 AC 6 (`spec-018` §4, §6 T-23; `git-conventions` §9; design D6) — `scripts/check-governance.cjs`'s
 * `approval-agent-trailer` replaces `approval-ai-trailer`: on every non-merge commit whose message has a line starting
 * `Approver:` (any case), each line matching `^(co-authored-by|ai-model):` (any case) is one finding, naming the key —
 * `wf(…): approve|reject|amend` and every `workflow:` record with an `Approver:` line alike, keyed on the line, not on
 * a verb list. Starting mode: a commit before the rule's marker entered the script is reported, not gated.
 *
 * Fixture style of `test/cli/check-governance-enforcement.test.ts`: a throwaway repository, an identity per commit.
 * Red until the rule exists: today an `amend` and a `workflow: rekey` record are not judged for trailers, and no
 * finding carries `check: 'approval-agent-trailer'`. The marker is written literally (the `CHECKS` pin of the
 * enforcement suite holds the script to the same string).
 */
import { execFileSync } from 'node:child_process';

import { checkGovernance } from '../../scripts/check-governance.cjs';
import type { GovernanceReport } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MARKER = 'governance-check:approval-agent-trailer';
const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    amendable: true
    states:
      sequence: [draft, pending, backlog, in-progress, done]
      gates:
        pending: { reject: draft }
  plan:
    path: "docs/memory/plan/{id}.md"
    states:
      sequence: [draft, active, done]
      waiting: [active]
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
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

const APPROVER_LINE = `Approver: ${APPROVER.name} <${APPROVER.email}> (approver)`;
const CO_AUTHOR = 'Co-Authored-By: Claude <noreply@anthropic.com>';

const fixtures: string[] = [];
afterAll(() => fixtures.forEach(removeTempDir));

interface Fixture {
  readonly root: string;
  commit(message: string, files: Readonly<Record<string, string>>, author?: { name: string; email: string }): string;
  task(id: string, status: string, message: string, author?: { name: string; email: string }): string;
}

function fixture(): Fixture {
  const root = makeTempGitRepo();
  fixtures.push(root);
  let revision = 0;
  const commit: Fixture['commit'] = (message, files, author = DEVELOPER) => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const task: Fixture['task'] = (id, status, message, author) => {
    revision += 1;
    return commit(message, { [`docs/memory/task/${id}.md`]: `---\nid: "${id}"\ntype: task\ntitle: "Task ${id}"\nstatus: ${status}\n---\n\nRevision ${revision}.\n` }, author);
  };
  commit('chore: configure wingfoil', {
    '.wingfoil/memory.yaml': MEMORY_YAML,
    '.wingfoil/dna.yaml': DNA,
    'docs/memory/plan/life-1-plan.md': '---\nid: "life-1-plan"\ntype: plan\ntitle: "life — 1"\nstatus: active\nworkflow: "life"\nphase: "1"\nelement: ""\nparent: ""\n---\n\n## Body\n',
  });
  return { root, commit, task };
}

/** The three approval commits of T-23, each with a `Co-Authored-By:` line in its body; their shas. */
function approvalsWithCoAuthor(f: Fixture, suffix: string): { approve: string; amend: string; rekey: string } {
  f.task(`a-${suffix}`, 'pending', `wf(task): add a-${suffix}`);
  const approve = f.task(`a-${suffix}`, 'backlog', `wf(task): approve a-${suffix} [pending → backlog]\n\n${APPROVER_LINE}\nReason: Ready.\n${CO_AUTHOR}`, APPROVER);
  const amend = f.task(`a-${suffix}`, 'backlog', `wf(task): amend a-${suffix} [backlog → backlog]\n\n${APPROVER_LINE}\nReason: Corrected a line.\n${CO_AUTHOR}`, APPROVER);
  const rekey = f.commit(
    `workflow: rekey life-1-plan life.old-${suffix} life.new-${suffix}\n\n${APPROVER_LINE}\nReason: Phase renamed.\n${CO_AUTHOR}\n\nWingFoil-Instance: life-1-plan\nWingFoil-Rekey-From: life.old-${suffix}\nWingFoil-Rekey-To: life.new-${suffix}`,
    {},
    APPROVER,
  );
  return { approve, amend, rekey };
}

function agentTrailerFindings(report: GovernanceReport, sha: string): { message: string; gated: boolean }[] {
  return report.findings
    .filter((finding) => finding.sha === sha && (finding.check as string | undefined) === 'approval-agent-trailer')
    .map((finding) => ({ message: finding.message, gated: finding.gated }));
}

describe('task-333 AC 6 — approval-agent-trailer (spec-018 §4, T-23)', () => {
  const f = fixture();
  f.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
  const before = approvalsWithCoAuthor(f, 'before');
  f.commit('chore: add the rule', { 'scripts/check-governance.cjs': `// placeholder\n// ${MARKER}\n` });
  const after = approvalsWithCoAuthor(f, 'after');
  f.task('s-1', 'pending', 'wf(task): add s-1');
  f.task('s-1', 'backlog', `wf(task): approve s-1 [pending → backlog]\n\n${APPROVER_LINE}\nReason: Ready.`, APPROVER);
  const startWithTrailers = f.task('s-1', 'in-progress', `wf(task): start s-1 [backlog → in-progress]\n\n${CO_AUTHOR}\nAI-Model: claude-opus-5-5`);
  const report = checkGovernance(f.root);

  it.each(['approve', 'amend', 'rekey'] as const)('after the introduction: the %s commit gives one gated finding, naming Co-Authored-By', (kind) => {
    const findings = agentTrailerFindings(report, after[kind]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.gated).toBe(true);
    expect(findings[0]?.message).toMatch(/Co-Authored-By/);
  });

  it.each(['approve', 'amend', 'rekey'] as const)('before the introduction: the %s commit is reported, not gated (starting mode)', (kind) => {
    const findings = agentTrailerFindings(report, before[kind]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.gated).toBe(false);
  });

  it('a commit with no Approver: line may carry the trailers: a wf(task): start with both gives no finding', () => {
    expect(agentTrailerFindings(report, startWithTrailers)).toEqual([]);
  });

  it('the older rule is gone: no finding carries check approval-ai-trailer', () => {
    expect(report.findings.filter((finding) => (finding.check as string | undefined) === 'approval-ai-trailer')).toEqual([]);
  });
});
