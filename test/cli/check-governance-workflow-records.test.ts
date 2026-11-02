/**
 * task-328 (`bug-444`, `bug-391`; `dl-094`, `dl-103` §1, `git-conventions` §8–§9) — the governance check
 * (`scripts/check-governance.cjs`) learns two things about commits it does not treat as Memory operations:
 *
 * - AC 1 (red-first): an `Approver:` line, when present, on a `workflow: finalize`, `workflow: adopt` or
 *   `workflow: rekey` record is held to the `wf()` Approver grammar and to the `authority` rule (the author holds
 *   `approver` in the `dna.yaml` committed at the first parent, and the line names the author), under the gated
 *   check `workflow-record-authority`. Findings reuse the `wf()` rule's messages verbatim. `bug-444`'s
 *   reproduction, run end to end on the compiled CLI, exits 1.
 * - AC 2 (red-first): a `WingFoil-*` trailer line outside a commit's final paragraph, on any non-merge commit, is a
 *   `body` finding under the gated check `trailer-paragraph`, one finding per distinct key per commit.
 *
 * Gating (`dl-103` §1 starting mode, per check): a finding on a commit before the check's marker entered the script
 * is reported and not gated. The marker spellings are written out here and pinned against `CHECKS` in
 * `check-governance-enforcement.test.ts`.
 *
 * Record bodies mirror the real writers (`src/core/workflow-finalize.ts`, `src/core/provenance-record.ts`): the
 * finalize shape is `git show -s --format=%B c4072efe` on `release/0.3` (a real `workflow: finalize`, with the
 * `Approver:` line a finalize of an `approval:` phase adds); the rekey tail is the real CLI output pinned in
 * `workflow-rekey.integration.test.ts` (`MESSAGE_TAIL`); the adopt tail is the one of `check-governance-provenance`.
 * The `agent: record` body is `git log release/0.3 --grep '^agent: record' -n1 --format=%B`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import type { GovernanceFinding, GovernanceReport } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const AUTHORITY_MARKER = 'governance-check:workflow-record-authority';
const TRAILER_MARKER = 'governance-check:trailer-paragraph';

const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

const DNA_YAML = `version: 1.1
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

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, done]
`;

type Identity = { name: string; email: string };

const approverLine = (who: Identity, role = 'approver'): string => `Approver: ${who.name} <${who.email}> (${role})`;

/** The three record subjects with the trailer paragraph their writers produce (the `Approver:` line is added per case). */
type RecordShape = readonly [label: string, subject: string, trailers: string];
const RECORDS: readonly RecordShape[] = [
  [
    'workflow: finalize',
    'workflow: finalize life-1-plan life.close',
    'WingFoil-Phase: life.close completed\nWingFoil-Instance: life-1-plan\nWingFoil-Element: release-line:rl-v1\nWingFoil-Version: 0.3.1 (b3cc5917005cc42a20ce33d7224e608299aefea3)',
  ],
  [
    'workflow: adopt',
    'workflow: adopt life-1-plan life.adr@release-line:rl-v1 adr:adr-1',
    'WingFoil-Instance: life-1-plan\nWingFoil-Step: life.adr@release-line:rl-v1\nWingFoil-Adopted: adr:adr-1\nWingFoil-Version: 0.3.1 (b3cc5917005cc42a20ce33d7224e608299aefea3)',
  ],
  [
    'workflow: rekey',
    'workflow: rekey life-1-plan life.seed life.seed-line',
    'WingFoil-Instance: life-1-plan\nWingFoil-Rekey-From: life.seed\nWingFoil-Rekey-To: life.seed-line\nWingFoil-Version: 0.3.1 (b3cc5917005cc42a20ce33d7224e608299aefea3)',
  ],
];

const FINALIZE = RECORDS[0] as RecordShape;
const REKEY = RECORDS[2] as RecordShape;

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

interface Fixture {
  readonly root: string;
  /** A commit with `message` as one `-m` (so blank lines inside it are paragraph breaks), authored by `author`. */
  commit(message: string, author?: Identity, files?: Readonly<Record<string, string>>): string;
}

function fixture(withDna = true): Fixture {
  const root = makeTempGitRepo();
  roots.push(root);
  const env = (who: Identity): NodeJS.ProcessEnv => ({
    ...process.env,
    GIT_AUTHOR_NAME: who.name,
    GIT_AUTHOR_EMAIL: who.email,
    GIT_COMMITTER_NAME: who.name,
    GIT_COMMITTER_EMAIL: who.email,
  });
  const commit: Fixture['commit'] = (message, author = DEVELOPER, files = {}) => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], { cwd: root, encoding: 'utf-8', env: env(author) });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  commit('chore: configure wingfoil', DEVELOPER, withDna ? { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA_YAML } : { '.wingfoil/memory.yaml': MEMORY_YAML });
  return { root, commit };
}

const of = (report: GovernanceReport, sha: string, check: string): GovernanceFinding[] =>
  report.findings.filter((finding) => finding.sha === sha && finding.check === check);

const view = (findings: readonly GovernanceFinding[]): Array<{ rule: string; message: string; gated: boolean }> =>
  findings.map(({ rule, message, gated }) => ({ rule, message, gated }));

describe('task-328 AC 1 — an Approver: line on a workflow: record is checked (bug-444)', () => {
  describe.each(RECORDS)('%s', (_label, subject, trailers) => {
    const f = fixture();
    const body = (...lines: string[]): string => `${subject}\n\n${lines.join('\n')}\n\n${trailers}`;
    const noApprover = f.commit(`${subject}\n\nReason: checkpoint, no approval needed.\n\n${trailers}`, DEVELOPER);
    const byNonApprover = f.commit(body(approverLine(DEVELOPER), 'Reason: forged by a non-approver.'), DEVELOPER);
    const namesSomeoneElse = f.commit(body(approverLine(DEVELOPER), 'Reason: attributed to another.'), APPROVER);
    const conforming = f.commit(body(approverLine(APPROVER), 'Reason: phase renamed.'), APPROVER);
    const notFirst = f.commit(body('Reason: phase renamed.', approverLine(APPROVER)), APPROVER);
    const wrongRole = f.commit(body(approverLine(APPROVER, 'developer'), 'Reason: phase renamed.'), APPROVER);
    const twoLines = f.commit(body(approverLine(APPROVER), approverLine(APPROVER), 'Reason: phase renamed.'), APPROVER);
    const report = checkGovernance(f.root);
    const check = 'workflow-record-authority';

    it('(d) accepts a record without an Approver: line', () => {
      expect(of(report, noApprover, check)).toEqual([]);
    });

    it('(c) accepts an Approver: line that names its author, who holds approver at the first parent', () => {
      expect(of(report, conforming, check)).toEqual([]);
    });

    it('(a) an Approver: line by an author without the approver role is one authority finding, gated', () => {
      expect(view(of(report, byNonApprover, check))).toEqual([
        { rule: 'authority', message: 'the author <developer@example.invalid> holds no approver role in team.members (dl-094)', gated: true },
      ]);
    });

    it('(b) an Approver: line naming someone other than the author is one authority finding', () => {
      expect(view(of(report, namesSomeoneElse, check))).toEqual([
        { rule: 'authority', message: 'the Approver: line names <developer@example.invalid>, but <approver@example.invalid> authored the commit (dl-094)', gated: true },
      ]);
    });

    it('(e) an Approver: line that is not the first body line is a body finding', () => {
      expect(view(of(report, notFirst, check))).toEqual([
        { rule: 'body', message: 'the Approver: line must be the first body line, as `Approver: Name <email> (role)`', gated: true },
      ]);
    });

    it("(e) an Approver: role other than 'approver' is a body finding", () => {
      expect(view(of(report, wrongRole, check))).toEqual([{ rule: 'body', message: "the Approver: role is 'developer', not 'approver'", gated: true }]);
    });

    it('(e) two Approver: lines are a body finding', () => {
      expect(view(of(report, twoLines, check))).toEqual([{ rule: 'body', message: '2 Approver: lines; an approval records one', gated: true }]);
    });

    it('the run exits 1 for the forged records', () => {
      expect(exitCodeFor(report)).toBe(1);
    });
  });

  it('(f) with no dna.yaml at the parent, no authority can be established', () => {
    const f = fixture(false);
    const sha = f.commit(`${REKEY[1]}\n\n${approverLine(APPROVER)}\nReason: phase renamed.\n\n${REKEY[2]}`, APPROVER);
    expect(view(of(checkGovernance(f.root), sha, 'workflow-record-authority'))).toEqual([
      { rule: 'authority', message: 'no .wingfoil/dna.yaml is committed before this commit, so no approval authority can be established', gated: true },
    ]);
  });

  it('gating: a forged record before the check entered the script is reported and not gated; after it, gated', () => {
    const f = fixture();
    const forged = (n: number): string => `${FINALIZE[1]}\n\n${approverLine(DEVELOPER)}\nReason: forged ${n}.\n\n${FINALIZE[2]}`;
    f.commit('chore: introduce the script', DEVELOPER, { 'scripts/check-governance.cjs': '// placeholder\n' });
    const before = f.commit(forged(1));
    f.commit('chore: add the rule', DEVELOPER, { 'scripts/check-governance.cjs': `// placeholder\n// ${AUTHORITY_MARKER}\n` });
    const after = f.commit(forged(2));
    const report = checkGovernance(f.root);
    const gated = new Map(report.findings.filter((finding) => finding.check === 'workflow-record-authority').map((finding) => [finding.sha, finding.gated]));
    expect(gated.get(before)).toBe(false);
    expect(gated.get(after)).toBe(true);
  });
});

describe('task-328 AC 1 — bug-444 reproduction on the compiled CLI', () => {
  it('a forged workflow: finalize record by a non-approver exits 1 with both authority messages; the unforged contrast stays as it is', () => {
    const root = makeTempGitRepo();
    roots.push(root);
    git(root, ['config', 'user.name', 'T']);
    git(root, ['config', 'user.email', 't@e.x']);
    const init = spawnCapture('node', [CLI_ENTRY, 'init', '--template', 'Scrum'], { cwd: root, env: process.env });
    expect(init.status).toBe(0);
    const introduced = git(root, ['rev-parse', 'HEAD']).trim();
    git(root, [
      'commit', '-q', '--allow-empty', '--cleanup=whitespace',
      '-m', 'workflow: finalize plan-x demo.step',
      '-m', 'Approver: Mallory <mallory@example.com> (approver)\nReason: forged by a non-approver.',
      '-m', 'WingFoil-Phase: demo.step completed\nWingFoil-Instance: plan-x\nWingFoil-Version: 0.3.1 (deadbeef)',
    ]);
    const run = spawnCapture('node', [join(__dirname, '..', '..', 'scripts', 'check-governance.cjs'), '--root', root, '--introduced-at', introduced], { env: process.env });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('the Approver: line names <mallory@example.com>, but <t@e.x> authored the commit (dl-094)');
    expect(run.stdout).toContain('the author <t@e.x> holds no approver role in team.members (dl-094)');
  });
});

describe('task-328 AC 2 — a WingFoil-* trailer outside the final paragraph is a finding (bug-391)', () => {
  const outside = (key: string): { rule: string; message: string; gated: boolean } => ({
    rule: 'body',
    message: `a ${key}: line sits outside the commit's final paragraph, where the workflow deduction does not read it (git-conventions §8, bug-391)`,
    gated: true,
  });
  const amendWithParagraph = (root: string, paragraph: string): string => {
    const message = git(root, ['log', '-1', '--format=%B']).trimEnd();
    execFileSync('git', ['commit', '--quiet', '--amend', '--allow-empty', '--cleanup=whitespace', '-m', message, '-m', paragraph], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_NAME: DEVELOPER.name, GIT_AUTHOR_EMAIL: DEVELOPER.email, GIT_COMMITTER_NAME: DEVELOPER.name, GIT_COMMITTER_EMAIL: DEVELOPER.email },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const ATTRIBUTION = 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5';
  const TASK_DOC = '---\nid: "t-2"\ntype: task\ntitle: "T"\nstatus: draft\n---\n\nBody.\n';

  const f = fixture();
  f.commit('wf(task): add t-2\n\nWingFoil-Instance: life-1-plan\nWingFoil-Step: life.tasks@t-2\nWingFoil-Version: 0.3.1 (deadbeef)', DEVELOPER, { 'docs/memory/task/t-2.md': TASK_DOC });
  const wfCommit = amendWithParagraph(f.root, ATTRIBUTION);
  f.commit(`${FINALIZE[1]}\n\nReason: checkpoint.\n\nWingFoil-Phase: life.close completed\nWingFoil-Instance: life-1-plan`);
  const record = amendWithParagraph(f.root, `WingFoil-Version: 0.3.1 (deadbeef)\n${ATTRIBUTION}`);
  f.commit('docs: note the run\n\nWingFoil-Instance: life-1-plan\nWingFoil-Version: 0.3.1 (deadbeef)');
  const plainDocs = amendWithParagraph(f.root, 'Co-Authored-By: Claude <noreply@anthropic.com>');
  // The conforming shape: the attribution joined to the trailer paragraph by git itself (git-conventions §8).
  f.commit(`${FINALIZE[1]}\n\nReason: checkpoint.\n\n${FINALIZE[2]}`);
  execFileSync('git', ['commit', '--quiet', '--amend', '--allow-empty', '--no-edit', '--trailer', 'Co-Authored-By: Claude <noreply@anthropic.com>', '--trailer', 'AI-Model: claude-opus-5-5'], {
    cwd: f.root,
    encoding: 'utf-8',
    env: { ...process.env, GIT_AUTHOR_NAME: DEVELOPER.name, GIT_AUTHOR_EMAIL: DEVELOPER.email, GIT_COMMITTER_NAME: DEVELOPER.name, GIT_COMMITTER_EMAIL: DEVELOPER.email },
  });
  const conforming = git(f.root, ['rev-parse', 'HEAD']).trim();
  // An `agent: record` commit: the trailers are the body's only paragraph (a real body, release/0.3).
  const agentRecord = f.commit('agent: record task-236-ship-verify-hand-builtin-claude-code-adapter-point/adhoc/2\n\nWingFoil-Version: 0.3.1 (7a04ad3303987aeb63a92bfaa1d07fa3b2f0383c)');
  const report = checkGovernance(f.root);
  const check = 'trailer-paragraph';

  it('(a) a wf() commit whose Instance, Step and Version trailers are followed by a separate attribution paragraph: one finding per key', () => {
    expect(view(of(report, wfCommit, check))).toEqual([outside('WingFoil-Instance'), outside('WingFoil-Step'), outside('WingFoil-Version')]);
  });

  it('(b) a workflow: finalize record with the same shape: its Phase and Instance trailers', () => {
    expect(view(of(report, record, check))).toEqual([outside('WingFoil-Phase'), outside('WingFoil-Instance')]);
  });

  it('(c) a plain docs: commit with the shape is a finding too (D2 (a): every non-merge commit)', () => {
    expect(view(of(report, plainDocs, check))).toEqual([outside('WingFoil-Instance'), outside('WingFoil-Version')]);
  });

  it('(d) the attribution joined by `git commit --amend --no-edit --trailer` is no finding', () => {
    expect(of(report, conforming, check)).toEqual([]);
  });

  it('(e) a body whose only paragraph holds the trailers (agent: record) is no finding', () => {
    expect(of(report, agentRecord, check)).toEqual([]);
  });

  it('gating: a commit before the check entered the script is reported and not gated; after it, gated', () => {
    const g = fixture();
    const shape = 'docs: a\n\nWingFoil-Instance: life-1-plan\nWingFoil-Version: 0.3.1 (deadbeef)';
    g.commit('chore: introduce the script', DEVELOPER, { 'scripts/check-governance.cjs': '// placeholder\n' });
    g.commit(shape);
    const beforeSha = amendWithParagraph(g.root, ATTRIBUTION);
    g.commit('chore: add the rule', DEVELOPER, { 'scripts/check-governance.cjs': `// placeholder\n// ${TRAILER_MARKER}\n` });
    g.commit(shape);
    const afterSha = amendWithParagraph(g.root, ATTRIBUTION);
    const gated = new Map(checkGovernance(g.root).findings.filter((finding) => finding.check === 'trailer-paragraph').map((finding) => [finding.sha, finding.gated]));
    expect(gated.get(beforeSha)).toBe(false);
    expect(gated.get(afterSha)).toBe(true);
  });
});
