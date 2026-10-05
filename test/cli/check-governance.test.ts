/**
 * task-167-build-governance-check-over-pushed-wf-commits — `scripts/check-governance.cjs`, the
 * read-only check `dl-103` §1 asks for over a range of `wf()` commits: subject grammar (the closed
 * verb list, `spec-008` §2), the canonical bracket, the `Approver:`/`Reason:` body shape (`dl-067`),
 * authority (the author is a `team.members` approver, `dl-094`) and state legality
 * (`verifyTransitionConsistency`, given the type's machine as `memory.yaml` declared it at the checked
 * commit). Starting mode (`dl-103` §1): a finding on a commit after the check's introduction fails
 * (exit 1); a finding on history before it is reported and does not fail (exit 0).
 *
 * One throwaway fixture repository per rule, each with a violating and a conforming commit. Identities
 * are passed per command (`GIT_AUTHOR_*`), never through `git config` (`dl-094` (ii)).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import type { GovernanceReport, GovernanceRule } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-governance.cjs');

const TASK_SEQUENCE = '[draft, pending, backlog, in-progress, in-review, approved, done]';

function memoryYaml(sequence: string = TASK_SEQUENCE): string {
  return `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: ${sequence}
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
`;
}

const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };
const OUTSIDER = { name: 'Out Sider', email: 'outsider@example.invalid' };

function dnaYaml(extraMember = ''): string {
  return `version: 1.1
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
${extraMember}  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;
}

const OUTSIDER_AS_APPROVER = `    - name: ${OUTSIDER.name}
      email: ${OUTSIDER.email}
      roles: [ approver ]
`;

/** The body an approval-gate commit carries: `Approver:` first, then the `Reason:` block. */
function approval(reason = 'The acceptance criteria are met.', who: { name: string; email: string } = APPROVER): string {
  return `\n\nApprover: ${who.name} <${who.email}> (approver)\nReason: ${reason}`;
}

interface Fixture {
  readonly root: string;
  /** Write `files`, commit them with `message` as `author`, and return the new commit's sha. */
  commit(message: string, files: Readonly<Record<string, string>>, author?: { name: string; email: string }): string;
  /** Write task `id` at `status` (a fresh body each time, so every write is a change) and commit it. */
  task(id: string, status: string, message: string, author?: { name: string; email: string }): string;
  /** `add` then `submit` task `id`, leaving it `pending`. */
  pending(id: string): void;
}

const fixtures: string[] = [];
afterAll(() => fixtures.forEach(removeTempDir));

function fixture(): Fixture {
  const root = makeTempGitRepo();
  fixtures.push(root);
  let counter = 0;
  const commit: Fixture['commit'] = (message, files, author = DEVELOPER) => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
      },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const task: Fixture['task'] = (id, status, message, author) => {
    counter += 1;
    const doc = `---\nid: "${id}"\ntype: task\ntitle: "Task ${id}"\nstatus: ${status}\n---\n\nRevision ${counter}.\n`;
    return commit(message, { [`docs/memory/task/${id}.md`]: doc }, author);
  };
  const pending: Fixture['pending'] = (id) => {
    task(id, 'draft', `wf(task): add ${id}`);
    task(id, 'pending', `wf(task): submit ${id}`);
  };
  commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': memoryYaml(), '.wingfoil/dna.yaml': dnaYaml() });
  return { root, commit, task, pending };
}

function rulesOf(report: GovernanceReport, sha: string): GovernanceRule[] {
  return [...new Set(report.findings.filter((finding) => finding.sha === sha).map((finding) => finding.rule))];
}

function messagesOf(report: GovernanceReport, sha: string, rule: GovernanceRule): string[] {
  return report.findings.filter((finding) => finding.sha === sha && finding.rule === rule).map((finding) => finding.message);
}

describe('subject rule — the closed wf() operation list (spec-008 §2, dl-079 (A))', () => {
  const f = fixture();
  const conforming = f.task('t-1', 'draft', 'wf(task): add t-1');
  const undeclaredVerb = f.task('t-1', 'draft', 'wf(task): schedule t-1');
  const unknownType = f.task('t-1', 'draft', 'wf(widget): add t-1');
  const noIds = f.task('t-1', 'draft', 'wf(task): add');
  const assignNonCanonical = f.task('t-1', 'draft', 'wf(task): assign t-1 to v0.3');
  const assignCanonical = f.task('t-1', 'draft', 'wf(task): assign release v0.3 to t-1');
  const configuration = f.commit('wf(dna): set name', { 'README.md': 'x\n' });
  const report = checkGovernance(f.root);

  it('reports an undeclared verb, an unknown type, a subject with no id, and a non-canonical assign, each with its sha', () => {
    expect(rulesOf(report, undeclaredVerb)).toEqual(['subject']);
    expect(messagesOf(report, undeclaredVerb, 'subject').join()).toMatch(/schedule/);
    expect(rulesOf(report, unknownType)).toEqual(['subject']);
    expect(messagesOf(report, unknownType, 'subject').join()).toMatch(/widget/);
    expect(rulesOf(report, noIds)).toEqual(['subject']);
    expect(rulesOf(report, assignNonCanonical)).toEqual(['subject']);
  });

  it('accepts a declared verb, the canonical assign, and skips a configuration scope', () => {
    expect(rulesOf(report, conforming)).toEqual([]);
    expect(rulesOf(report, assignCanonical)).toEqual([]);
    expect(rulesOf(report, configuration)).toEqual([]);
  });
});

describe('bracket rule — the canonical [from → to] bracket', () => {
  const f = fixture();
  f.pending('t-1');
  const conforming = f.task('t-1', 'backlog', 'wf(task): approve t-1 [pending → backlog]' + approval(), APPROVER);
  f.pending('t-2');
  const asciiArrow = f.task('t-2', 'backlog', 'wf(task): approve t-2 [pending -> backlog]' + approval(), APPROVER);
  f.pending('t-3');
  const missing = f.task('t-3', 'backlog', 'wf(task): approve t-3' + approval(), APPROVER);
  f.task('t-4', 'draft', 'wf(task): add t-4');
  const onSubmit = f.task('t-4', 'pending', 'wf(task): submit t-4 [draft → pending]');
  f.pending('t-5');
  const chainOnApprove = f.task('t-5', 'in-progress', 'wf(task): approve t-5 [pending → backlog → in-progress]' + approval(), APPROVER);
  const deprecateConforming = f.task('t-1', 'deprecated', 'wf(task): deprecate t-1 [backlog → deprecated]\n\nReason: Superseded by t-9.');
  const deprecateWrongTarget = f.task('t-2', 'done', 'wf(task): deprecate t-2 [backlog → done]');
  const amendConforming = f.task('t-3', 'backlog', 'wf(task): amend t-3 [backlog → backlog]' + approval('A typo.'), APPROVER);
  const amendMoving = f.task('t-3', 'in-progress', 'wf(task): amend t-3 [backlog → in-progress]' + approval('A typo.'), APPROVER);
  const report = checkGovernance(f.root);

  it('reports an ASCII arrow, a missing bracket, a bracket on submit, a chain on approve, a deprecate not into deprecated, and an amend that moves state', () => {
    for (const sha of [asciiArrow, missing, onSubmit, chainOnApprove, deprecateWrongTarget, amendMoving]) {
      expect(rulesOf(report, sha)).toContain('bracket');
    }
  });

  it('accepts the canonical approve, deprecate and amend brackets', () => {
    expect(rulesOf(report, conforming)).toEqual([]);
    expect(rulesOf(report, deprecateConforming)).toEqual([]);
    expect(rulesOf(report, amendConforming)).toEqual([]);
  });
});

describe('body rule — Approver:/Reason: shape (dl-067, as amended by task-166)', () => {
  const f = fixture();
  const ids = ['t-1', 't-2', 't-3', 't-4', 't-5', 't-6', 't-7', 't-8'];
  ids.forEach((id) => f.pending(id));
  const approve = (id: string, body: string): string =>
    f.task(id, 'backlog', `wf(task): approve ${id} [pending → backlog]${body}`, APPROVER);
  const conforming = approve('t-1', approval('Line one.\n\nA second paragraph.\n\nCo-Authored-By: Someone <s@example.invalid>'));
  const noApprover = approve('t-2', '\n\nReason: Looks fine.');
  const blankReason = approve('t-3', `\n\nApprover: ${APPROVER.name} <${APPROVER.email}> (approver)\nReason:`);
  const lowercaseReservedKey = approve('t-4', approval('Fine.\napprover: Someone Else <x@example.invalid> (approver)'));
  const buildSignatureInReason = approve('t-5', approval('Fine.\nWingFoil-Version: 9.9.9\nThat is all.'));
  const controlCharacter = approve('t-6', approval('Fine \u0007 here.'));
  const wrongRole = approve('t-7', `\n\nApprover: ${APPROVER.name} <${APPROVER.email}> (developer)\nReason: Fine.`);
  const trailingKeyValue = approve('t-8', approval('Fine.\n\nAction: none\n\nCo-Authored-By: Someone <s@example.invalid>'));
  const assignWithApprover = f.task('t-1', 'backlog', 'wf(task): assign release v0.3 to t-1' + approval(), APPROVER);
  const amendWithoutApprover = f.task('t-1', 'backlog', 'wf(task): amend t-1 [backlog → backlog]\n\nReason: A typo.', APPROVER);
  const report = checkGovernance(f.root);

  it.each([
    ['no Approver: line on approve', () => noApprover],
    ['a blank Reason:', () => blankReason],
    ['a reserved key in another letter case', () => lowercaseReservedKey],
    ['WingFoil-Version: inside the reason', () => buildSignatureInReason],
    ['a control character in the reason', () => controlCharacter],
    ['an Approver: role other than approver', () => wrongRole],
    ['a reason ending in a Key: value paragraph', () => trailingKeyValue],
    ['an Approver: line on assign', () => assignWithApprover],
    ['no Approver: line on amend', () => amendWithoutApprover],
  ])('reports %s', (_label, sha) => {
    expect(rulesOf(report, sha())).toContain('body');
  });

  it('names the control character by code point', () => {
    expect(messagesOf(report, controlCharacter, 'body').join()).toMatch(/U\+0007/);
  });

  it('accepts a multi-paragraph reason followed by a trailer paragraph', () => {
    expect(rulesOf(report, conforming)).toEqual([]);
  });
});

describe('authority rule — the author is a team.members approver (dl-094)', () => {
  const f = fixture();
  ['t-1', 't-2', 't-3', 't-4'].forEach((id) => f.pending(id));
  const conforming = f.task('t-1', 'backlog', 'wf(task): approve t-1 [pending → backlog]' + approval(), APPROVER);
  const outsider = f.task('t-2', 'backlog', 'wf(task): approve t-2 [pending → backlog]' + approval('Fine.', OUTSIDER), OUTSIDER);
  const borrowedApprover = f.task('t-3', 'backlog', 'wf(task): approve t-3 [pending → backlog]' + approval(), DEVELOPER);
  const selfGranted = f.commit('wf(task): approve t-4 [pending → backlog]' + approval('Fine.', OUTSIDER), {
    '.wingfoil/dna.yaml': dnaYaml(OUTSIDER_AS_APPROVER),
    'docs/memory/task/t-4.md': '---\nid: "t-4"\ntype: task\ntitle: "Task t-4"\nstatus: backlog\n---\n\nGranted.\n',
  }, OUTSIDER);
  const report = checkGovernance(f.root);

  it('reports an author outside team.members, an author borrowing the approver line, and a grant made in the approving commit itself', () => {
    expect(rulesOf(report, outsider)).toEqual(['authority']);
    expect(rulesOf(report, borrowedApprover)).toEqual(['authority']);
    expect(messagesOf(report, borrowedApprover, 'authority').join()).toMatch(/developer@example\.invalid/);
    expect(rulesOf(report, selfGranted)).toEqual(['authority']);
  });

  it('accepts an approval authored by the approver', () => {
    expect(rulesOf(report, conforming)).toEqual([]);
  });
});

describe('state rule — verifyTransitionConsistency with the machine at the checked commit', () => {
  const f = fixture();
  f.pending('t-1');
  const conforming = f.task('t-1', 'backlog', 'wf(task): approve t-1 [pending → backlog]' + approval(), APPROVER);
  f.pending('t-2');
  const mismatch = f.task('t-2', 'backlog', 'wf(task): approve t-2 [in-review → approved]' + approval(), APPROVER);
  f.pending('t-3');
  const illegalHop = f.task('t-3', 'in-review', 'wf(task): sync t-3 [pending → in-progress → in-review]');
  f.pending('t-4');
  f.task('t-4', 'backlog', 'wf(task): approve t-4 [pending → backlog]' + approval(), APPROVER);
  const illegalEdge = f.task('t-4', 'in-review', 'wf(task): start t-4 [backlog → in-review]');
  f.pending('t-6');
  const slugged = (status: string): string => `---\nid: "t-8-slug"\ntype: task\ntitle: "T8"\nstatus: ${status}\n---\n\n${status}.\n`;
  f.commit('wf(task): add t-8', { 'docs/memory/task/t-8-slug.md': slugged('draft') });
  const shortId = f.commit('wf(task): sync t-8 [backlog → in-progress]', { 'docs/memory/task/t-8-slug.md': slugged('pending') });
  f.pending('t-9');
  f.pending('t-10');
  const doc = (id: string, status: string): string => `---\nid: "${id}"\ntype: task\ntitle: "T"\nstatus: ${status}\n---\n\n${id} ${status}.\n`;
  const sideEffect = f.commit('wf(task): approve t-9 [pending → backlog]' + approval(), {
    'docs/memory/task/t-9.md': doc('t-9', 'backlog'),
    'docs/memory/task/t-10.md': doc('t-10', 'backlog'),
    'README.md': 'not a Memory document\n',
  }, APPROVER);
  const undeclaredVerbDrift = f.task('t-9', 'in-progress', 'wf(task): schedule t-9 [pending → in-progress]');
  const unreadableIdList = f.task('t-6', 'backlog', 'wf(task): sync t-6 [pending -> in-review] and t-7 [-> backlog]');
  f.pending('t-5');
  const legalChainThen = f.task('t-5', 'in-progress', 'wf(task): sync t-5 [pending → backlog → in-progress]');
  // The machine changes after t-5's chain: `backlog` leaves the sequence, so `pending → backlog` is no
  // longer an edge at HEAD. The chain was legal where it was committed, and is judged there.
  f.commit('chore: drop backlog', {
    '.wingfoil/memory.yaml': memoryYaml('[draft, pending, in-progress, in-review, approved, done]'),
  });
  const report = checkGovernance(f.root);

  it('reports a bracket the frontmatter contradicts, an illegal hop in a chain, and an illegal single edge', () => {
    expect(rulesOf(report, mismatch)).toEqual(['state']);
    expect(rulesOf(report, illegalHop)).toEqual(['state']);
    expect(messagesOf(report, illegalHop, 'state').join()).toMatch(/pending → in-progress/);
    expect(rulesOf(report, illegalEdge)).toEqual(['state']);
  });

  it('reports a document the commit moves without naming it, and a bracket under an undeclared verb', () => {
    expect(messagesOf(report, sideEffect, 'state').join()).toMatch(/t-10\.md/);
    expect(messagesOf(report, sideEffect, 'state').join()).not.toMatch(/README/);
    expect(rulesOf(report, undeclaredVerbDrift)).toEqual(['subject', 'state']);
  });

  it('still checks the state of a document its subject names by the short id (the slug left out)', () => {
    expect(rulesOf(report, shortId)).toContain('state');
  });

  it('still checks the state of a document named by a subject whose id list does not parse', () => {
    expect(rulesOf(report, unreadableIdList)).toContain('state');
  });

  it('accepts a legal transition, and judges a chain by the machine at its own commit', () => {
    expect(rulesOf(report, conforming)).toEqual([]);
    expect(rulesOf(report, legalChainThen)).toEqual([]);
  });
});

describe('state rule — commits without a bracket (review)', () => {
  const f = fixture();
  f.task('t-1', 'draft', 'wf(task): add t-1');
  const submitToDone = f.task('t-1', 'done', 'wf(task): submit t-1');
  f.pending('t-2');
  const doc = (id: string, status: string): string => `---\nid: "${id}"\ntype: task\ntitle: "T"\nstatus: ${status}\n---\n\n${id} ${status}.\n`;
  const addMovingAnother = f.commit('wf(task): add t-3', {
    'docs/memory/task/t-3.md': doc('t-3', 'draft'),
    'docs/memory/task/t-2.md': doc('t-2', 'backlog'),
  });
  const addNotInitial = f.task('t-4', 'pending', 'wf(task): add t-4');
  f.task('t-5', 'draft', 'wf(task): add t-5');
  const assignMoving = f.task('t-5', 'pending', 'wf(task): assign release v0.3 to t-5');
  const conformingSubmit = f.task('t-3', 'pending', 'wf(task): submit t-3');
  const report = checkGovernance(f.root);

  it('reports a submit that is not an edge, an add that moves another element, an add not into the initial state, and an assign that changes status', () => {
    expect(rulesOf(report, submitToDone)).toEqual(['state']);
    expect(messagesOf(report, addMovingAnother, 'state').join()).toMatch(/t-2\.md/);
    expect(rulesOf(report, addNotInitial)).toEqual(['state']);
    expect(rulesOf(report, assignMoving)).toEqual(['state']);
  });

  it('accepts a submit along an edge', () => {
    expect(rulesOf(report, conformingSubmit)).toEqual([]);
  });
});

describe('configuration a gated commit cannot be checked without (review)', () => {
  const f = fixture();
  f.pending('t-1');
  const historyWithoutConfig = (() => {
    git(f.root, ['rm', '--quiet', '.wingfoil/memory.yaml']);
    return f.task('t-1', 'backlog', 'wf(task): approve t-1 [pending → backlog]' + approval(), APPROVER);
  })();
  const introduction = f.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
  const gatedWithoutConfig = f.task('t-1', 'in-progress', 'wf(task): start t-1 [backlog → in-progress]');
  f.commit('chore: broken memory.yaml', { '.wingfoil/memory.yaml': 'types: [\n' });
  const gatedInvalidConfig = f.task('t-1', 'done', 'wf(task): start t-1 [in-progress → done]');
  const report = checkGovernance(f.root, { introducedAt: introduction });

  it('reports a gated commit with no memory.yaml, or one that does not parse, and fails', () => {
    expect(rulesOf(report, gatedWithoutConfig)).toEqual(['state']);
    expect(rulesOf(report, gatedInvalidConfig)).toEqual(['state']);
    expect(exitCodeFor(report)).toBe(1);
  });

  it('keeps history lenient: no finding, listed as state not checked', () => {
    expect(rulesOf(report, historyWithoutConfig)).toEqual([]);
    expect(report.stateUnchecked.some((entry) => entry.sha === historyWithoutConfig)).toBe(true);
  });
});

describe('a document whose frontmatter does not parse at some commit', () => {
  const f = fixture();
  f.pending('t-1');
  const broken = f.commit('wf(task): start t-1 [pending → backlog]', {
    'docs/memory/task/t-1.md': '---\nid: "t-1"\ntitle: "a: "b"\n  bad: [\nstatus: backlog\n---\n',
  });
  f.task('t-1', 'backlog', 'docs: repair t-1');

  it('does not stop the check: the document is reported as state not checked, with the parse error', () => {
    const report = checkGovernance(f.root);
    expect(report.stateUnchecked.some((entry) => entry.sha === broken && /does not parse/.test(entry.reason))).toBe(true);
  });
});

// task-171 review F1: `reconstructMemoryTransitions` became tolerant for `memory history` (bug-188); the
// check must still read strictly, or a revision it cannot read passes as checked (fail open).
describe('a bracketless or unnamed touch whose revision does not parse (task-171 review)', () => {
  const BROKEN = '---\nid: "t-1"\ntype: task\ntitle: "a: "b"\n  bad: [\nstatus: pending\n---\n';
  const f = fixture();
  f.task('t-1', 'draft', 'wf(task): add t-1');
  const brokenSubmit = f.commit('wf(task): submit t-1', { 'docs/memory/task/t-1.md': BROKEN });
  f.task('t-1', 'pending', 'docs: repair t-1');
  const brokenUnnamed = f.commit('wf(task): add t-2', {
    'docs/memory/task/t-2.md': '---\nid: "t-2"\ntype: task\ntitle: "T"\nstatus: draft\n---\n\nt-2.\n',
    'docs/memory/task/t-1.md': BROKEN,
  });
  f.task('t-1', 'pending', 'docs: repair t-1 again');
  const report = checkGovernance(f.root);

  it('reports a bracketless named touch it cannot read as state not checked, never as checked', () => {
    expect(report.stateUnchecked.some((entry) => entry.sha === brokenSubmit && /does not parse/.test(entry.reason))).toBe(true);
    expect(rulesOf(report, brokenSubmit)).toEqual([]);
  });

  it('raises no finding about a status "→ null" on an unnamed document it cannot read', () => {
    expect(report.findings.filter((finding) => finding.sha === brokenUnnamed && /t-1/.test(finding.message))).toEqual([]);
  });
});

describe('starting mode — hard-fail after the introduction commit, report history before it (dl-103 §1)', () => {
  const f = fixture();
  const before = f.task('t-1', 'draft', 'wf(task): schedule t-1');
  const introduction = f.commit('chore: introduce the governance check', { 'scripts/check-governance.cjs': '// placeholder\n' });
  const after = f.task('t-1', 'draft', 'wf(task): schedule t-1 again');

  it('fails (exit 1) on a violation after the introduction commit, and still reports the one before it', () => {
    const report = checkGovernance(f.root, { introducedAt: introduction });
    const byHash = new Map(report.findings.map((finding) => [finding.sha, finding.gated]));
    expect(byHash.get(before)).toBe(false);
    expect(byHash.get(after)).toBe(true);
    expect(exitCodeFor(report)).toBe(1);
  });

  it('exits 0 with a report when every violation is history', () => {
    const report = checkGovernance(f.root, { introducedAt: after });
    expect(report.findings.map((finding) => finding.sha).sort()).toEqual([before, after].sort());
    expect(report.findings.every((finding) => !finding.gated)).toBe(true);
    expect(exitCodeFor(report)).toBe(0);
  });

  it('defaults the introduction commit to the one that added scripts/check-governance.cjs', () => {
    const report = checkGovernance(f.root);
    expect(report.introducedAt).toBe(introduction);
    expect(exitCodeFor(report)).toBe(1);
  });

  it('takes the introduction where the script landed on the first-parent line (the merge), so commits merged with it are history', () => {
    const g = fixture();
    git(g.root, ['checkout', '--quiet', '-b', 'side']);
    g.commit('chore: add the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
    git(g.root, ['checkout', '--quiet', 'main']);
    const parallel = g.task('t-1', 'draft', 'wf(task): schedule t-1');
    execFileSync('git', ['merge', '--quiet', '--no-ff', '-m', 'Merge branch side', 'side'], {
      cwd: g.root,
      env: { ...process.env, GIT_AUTHOR_NAME: DEVELOPER.name, GIT_AUTHOR_EMAIL: DEVELOPER.email, GIT_COMMITTER_NAME: DEVELOPER.name, GIT_COMMITTER_EMAIL: DEVELOPER.email },
    });
    const merge = git(g.root, ['rev-parse', 'HEAD']).trim();
    const after = g.task('t-1', 'draft', 'wf(task): schedule t-1 again');
    const report = checkGovernance(g.root);
    expect(report.introducedAt).toBe(merge);
    const gated = new Map(report.findings.map((finding) => [finding.sha, finding.gated]));
    expect(gated.get(parallel)).toBe(false);
    expect(gated.get(after)).toBe(true);
  });

  it('as a command: exit 2 with a message, never 1, when it cannot run', () => {
    const outside = mkdtempSync(join(tmpdir(), 'wf-governance-outside-'));
    fixtures.push(outside);
    const notARepository = spawnCapture('node', [SCRIPT], { cwd: outside });
    expect(notARepository.status).toBe(2);
    expect(notARepository.stderr).toMatch(/^error: /);
    const empty = makeTempGitRepo();
    fixtures.push(empty);
    const noCommit = spawnCapture('node', [SCRIPT, '--root', empty]);
    expect(noCommit.status).toBe(2);
    expect(noCommit.stderr).toMatch(/has no commit/);
  });

  it('checks only the commits after --base when one is given', () => {
    const report = checkGovernance(f.root, { base: introduction });
    expect(report.findings.map((finding) => finding.sha)).toEqual([after]);
  });

  it('as a command: prints each finding with sha and rule, exit 1 when gated, exit 0 for history, exit 2 on a bad option', () => {
    const run = (args: string[]) => spawnCapture('node', [SCRIPT, '--root', f.root, ...args]);
    const gated = run([]);
    expect(gated.status).toBe(1);
    expect(gated.stdout).toContain(after);
    expect(gated.stdout).toContain('subject');
    const history = run(['--introduced-at', after]);
    expect(history.status).toBe(0);
    expect(history.stdout).toContain(before);
    const json = run(['--introduced-at', after, '--json']);
    expect((JSON.parse(json.stdout) as GovernanceReport).findings).toHaveLength(2);
    expect(run(['--no-such-option']).status).toBe(2);
  });
});

describe('packaging — the check is not shipped (spec-015)', () => {
  it('is wired as `npm run check:governance`', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['check:governance']).toBe('node scripts/check-governance.cjs');
  });

  it('`npm pack --dry-run` lists nothing under scripts/', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO_ROOT, encoding: 'utf-8' });
    const [result] = JSON.parse(raw) as { files: { path: string }[] }[];
    expect((result?.files ?? []).some((file) => file.path.startsWith('scripts/'))).toBe(false);
  });
});
