/**
 * task-208-enforce-governance-check-ci-hooks-branch-protection-advisory — the rules the governance
 * check (`scripts/check-governance.cjs`, `task-167`) gains before it runs in CI:
 *
 * - **verb ↔ edge pairing** (`bug-192`, `spec-008` §2 "Which verb a `set_state` emits"): `approve` and
 *   `start` move along a forward edge, `start` never into the last state; `finalize` moves into the last
 *   state of the `sequence`; `reject` takes a `gates` reject edge; a `sync` that crosses a reject edge
 *   cites the approver's reject commit by sha (`dl-061` B.1). A document gone at `HEAD` still has its
 *   bracket compared with its frontmatter.
 * - **status changes outside a `wf()` operation** (`dl-139` (a)): a commit that is not a Memory
 *   operation leaves every Memory document's `status` unchanged.
 * - **a `supersedes:` pair left half-done** (`bug-218`): an `approve` into the superseding `waiting`
 *   state whose `supersedes:` names an element that is not `superseded` at `HEAD`.
 * - **config versions over a range** (`bug-249`): with `--base`, each of the four versioned config files
 *   whose bytes differ between the merge-base and `HEAD` declares a numerically greater `version:`.
 * - **no AI co-author on an approval** (`bug-307`, `git-conventions` §7): an `approve` or `reject`
 *   commit carries no `Co-Authored-By:` and no `AI-Model:` trailer; other verbs may.
 * - **per-check introduction**: each check added after the script gates only the commits after the
 *   first-parent commit that brought its marker into the script, so a new rule never fails on commits
 *   pushed before it existed (`dl-103` §1 starting mode, applied per check).
 *
 * Throwaway fixture repositories; identities per command (`dl-094` (ii)).
 */
import { execFileSync } from 'node:child_process';

import { CHECKS, checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import type { GovernanceReport, GovernanceRule } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const TASK_MACHINE = `  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
`;
const ADR_MACHINE = `  adr:
    path: "docs/memory/adr/{id}.md"
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
`;

function memoryYaml(version = '1'): string {
  return `version: ${version}\ntypes:\n${TASK_MACHINE}${ADR_MACHINE}`;
}

const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

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

function approval(reason = 'The criteria are met.'): string {
  return `\n\nApprover: ${APPROVER.name} <${APPROVER.email}> (approver)\nReason: ${reason}`;
}

interface Fixture {
  readonly root: string;
  commit(message: string, files: Readonly<Record<string, string>>, author?: { name: string; email: string }): string;
  task(id: string, status: string, message: string, author?: { name: string; email: string }): string;
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
  commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': memoryYaml(), '.wingfoil/dna.yaml': DNA });
  return { root, commit, task };
}

function rulesOf(report: GovernanceReport, sha: string): GovernanceRule[] {
  return [...new Set(report.findings.filter((finding) => finding.sha === sha).map((finding) => finding.rule))];
}

function messagesOf(report: GovernanceReport, sha: string): string {
  return report.findings
    .filter((finding) => finding.sha === sha)
    .map((finding) => finding.message)
    .join('\n');
}

describe('verb ↔ edge pairing (bug-192, spec-008 §2)', () => {
  const f = fixture();
  f.task('t-1', 'pending', 'wf(task): add t-1');
  const rejectForward = f.task('t-1', 'backlog', 'wf(task): reject t-1 [pending → backlog]' + approval(), APPROVER);
  f.task('t-2', 'pending', 'wf(task): add t-2');
  const approveReject = f.task('t-2', 'draft', 'wf(task): approve t-2 [pending → draft]' + approval(), APPROVER);
  f.task('t-3', 'backlog', 'wf(task): add t-3');
  const finalizeNotLast = f.task('t-3', 'in-progress', 'wf(task): finalize t-3 [backlog → in-progress]');
  f.task('t-4', 'approved', 'wf(task): add t-4');
  const startIntoLast = f.task('t-4', 'done', 'wf(task): start t-4 [approved → done]');
  f.task('t-5', 'in-review', 'wf(task): add t-5');
  const startAlongReject = f.task('t-5', 'in-progress', 'wf(task): start t-5 [in-review → in-progress]');

  f.task('t-6', 'pending', 'wf(task): add t-6');
  const rejectConforming = f.task('t-6', 'draft', 'wf(task): reject t-6 [pending → draft]' + approval('Not yet.'), APPROVER);
  f.task('t-7', 'pending', 'wf(task): add t-7');
  const approveConforming = f.task('t-7', 'backlog', 'wf(task): approve t-7 [pending → backlog]' + approval(), APPROVER);
  const startConforming = f.task('t-7', 'in-progress', 'wf(task): start t-7 [backlog → in-progress]');
  f.task('t-8', 'approved', 'wf(task): add t-8');
  const finalizeConforming = f.task('t-8', 'done', 'wf(task): finalize t-8 [approved → done]');

  // A sync that crosses a reject edge: with no sha, with a sha that is not a reject, with the reject's sha.
  f.task('t-9', 'in-review', 'wf(task): add t-9');
  const hostReject = f.task('t-9', 'in-progress', 'wf(task): reject t-9 [in-review → in-progress]' + approval('Fix it.'), APPROVER);
  f.task('t-10', 'in-review', 'wf(task): add t-10');
  const syncNoSha = f.task('t-10', 'in-progress', 'wf(task): sync t-10 [in-review → in-progress]\n\nFollows the host task.');
  f.task('t-11', 'in-review', 'wf(task): add t-11');
  const syncWrongSha = f.task('t-11', 'in-progress', `wf(task): sync t-11 [in-review → in-progress]\n\nFollows ${approveConforming}.`);
  f.task('t-12', 'in-review', 'wf(task): add t-12');
  const syncCited = f.task('t-12', 'in-progress', `wf(task): sync t-12 [in-review → in-progress]\n\nFollows the reject ${hostReject.slice(0, 10)}.`);
  f.task('t-13', 'backlog', 'wf(task): add t-13');
  const syncForward = f.task('t-13', 'in-review', 'wf(task): sync t-13 [backlog → in-progress → in-review]');

  const report = checkGovernance(f.root);

  it.each([
    ['a reject along a forward edge', () => rejectForward],
    ['an approve along a reject edge', () => approveReject],
    ['a finalize that does not enter the last state', () => finalizeNotLast],
    ['a start into the last state', () => startIntoLast],
    ['a start along a reject edge', () => startAlongReject],
    ['a sync across a reject edge citing no sha', () => syncNoSha],
    ['a sync across a reject edge citing a commit that is not a reject', () => syncWrongSha],
  ])('reports %s as a state finding', (_label, sha) => {
    expect(rulesOf(report, sha())).toEqual(['state']);
  });

  it('names the verb and the kind of edge it should take', () => {
    expect(messagesOf(report, rejectForward)).toMatch(/'reject'.*reject edge/);
    expect(messagesOf(report, approveReject)).toMatch(/'approve'.*forward edge/);
    expect(messagesOf(report, finalizeNotLast)).toMatch(/'finalize'.*last state/);
    expect(messagesOf(report, syncNoSha)).toMatch(/reject commit/);
  });

  it('accepts each verb along its own kind of edge, and a sync that cites the reject', () => {
    for (const sha of [rejectConforming, approveConforming, startConforming, finalizeConforming, hostReject, syncCited, syncForward]) {
      expect({ sha, rules: rulesOf(report, sha) }).toEqual({ sha, rules: [] });
    }
  });
});

describe('a document gone at HEAD still has its bracket compared with its frontmatter (bug-192)', () => {
  const f = fixture();
  f.task('t-1', 'pending', 'wf(task): add t-1');
  const mismatch = f.task('t-1', 'in-review', 'wf(task): approve t-1 [pending → backlog]' + approval(), APPROVER);
  f.task('t-2', 'pending', 'wf(task): add t-2');
  const conforming = f.task('t-2', 'backlog', 'wf(task): approve t-2 [pending → backlog]' + approval(), APPROVER);
  git(f.root, ['rm', '--quiet', 'docs/memory/task/t-1.md', 'docs/memory/task/t-2.md']);
  f.commit('wf(task): deprecate t-1, t-2 [backlog → deprecated]\n\nReason: Removed.', {});
  const report = checkGovernance(f.root);

  it('reports the mismatch on the approve', () => {
    expect(rulesOf(report, mismatch)).toEqual(['state']);
    expect(messagesOf(report, mismatch)).toMatch(/pending → backlog.*pending → in-review/);
  });

  it('accepts the matching one', () => {
    expect(rulesOf(report, conforming)).toEqual([]);
  });
});

describe('status changes outside a wf() operation (dl-139 (a))', () => {
  const f = fixture();
  f.task('t-1', 'backlog', 'wf(task): add t-1');
  const moved = f.task('t-1', 'done', 'docs: edit t-1');
  const bodyOnly = f.task('t-1', 'done', 'docs: reword t-1');
  const configScope = f.task('t-1', 'approved', 'wf(dna): set project.name');
  git(f.root, ['mv', 'docs/memory/task/t-1.md', 'docs/memory/task/t-1-renamed.md']);
  const renamed = f.commit('chore: rename t-1', {});
  const notMemory = f.commit('docs: a page with a status', { 'docs/page.md': '---\nstatus: draft\n---\n' });
  const notMemoryMoved = f.commit('docs: the page moves on', { 'docs/page.md': '---\nstatus: final\n---\n' });
  const created = f.commit('docs: create t-2 by hand', {
    'docs/memory/task/t-2.md': '---\nid: "t-2"\ntype: task\ntitle: "T"\nstatus: backlog\n---\n',
  });
  const merge = (() => {
    git(f.root, ['checkout', '--quiet', '-b', 'side']);
    f.task('t-3', 'draft', 'wf(task): add t-3');
    f.task('t-3', 'pending', 'wf(task): submit t-3');
    git(f.root, ['checkout', '--quiet', 'main']);
    execFileSync('git', ['merge', '--quiet', '--no-ff', '-m', 'Merge branch side', 'side'], {
      cwd: f.root,
      env: { ...process.env, GIT_AUTHOR_NAME: DEVELOPER.name, GIT_AUTHOR_EMAIL: DEVELOPER.email, GIT_COMMITTER_NAME: DEVELOPER.name, GIT_COMMITTER_EMAIL: DEVELOPER.email },
    });
    return git(f.root, ['rev-parse', 'HEAD']).trim();
  })();
  const report = checkGovernance(f.root);

  it('reports a non-wf() commit and a configuration-scope commit that change a status, and a document created outside wf()', () => {
    expect(rulesOf(report, moved)).toEqual(['state']);
    expect(messagesOf(report, moved)).toMatch(/backlog → done/);
    expect(messagesOf(report, moved)).toMatch(/dl-139/);
    expect(rulesOf(report, configScope)).toEqual(['state']);
    expect(rulesOf(report, created)).toEqual(['state']);
  });

  it('accepts an edit that keeps the status, a rename, a non-Memory document, and a merge', () => {
    for (const sha of [bodyOnly, renamed, notMemory, notMemoryMoved, merge]) {
      expect({ sha, rules: rulesOf(report, sha) }).toEqual({ sha, rules: [] });
    }
  });

  it('counts the other commits it read in the report', () => {
    expect(report.otherCommits).toBeGreaterThanOrEqual(6);
  });
});

describe('a supersedes: pair left half-done (bug-218)', () => {
  const f = fixture();
  const adr = (id: string, status: string, supersedes = ''): Record<string, string> => ({
    [`docs/memory/adr/${id}.md`]: `---\nid: "${id}"\ntype: adr\ntitle: "${id}"\nstatus: ${status}\nsupersedes: "${supersedes}"\n---\n\n${id} ${status}.\n`,
  });
  f.commit('wf(adr): add adr-1', adr('adr-1', 'pending'));
  f.commit('wf(adr): approve adr-1 [pending → accepted]' + approval(), adr('adr-1', 'accepted'), APPROVER);
  f.commit('wf(adr): add adr-2', adr('adr-2', 'pending', 'adr-1'));
  const halfDone = f.commit('wf(adr): approve adr-2 [pending → accepted]' + approval(), adr('adr-2', 'accepted', 'adr-1'), APPROVER);

  f.commit('wf(adr): add adr-3', adr('adr-3', 'pending'));
  f.commit('wf(adr): approve adr-3 [pending → accepted]' + approval(), adr('adr-3', 'accepted'), APPROVER);
  f.commit('wf(adr): add adr-4', adr('adr-4', 'pending', 'adr-3'));
  const completed = f.commit('wf(adr): approve adr-4 [pending → accepted]' + approval(), adr('adr-4', 'accepted', 'adr-3'), APPROVER);
  f.commit(`wf(adr): finalize adr-3 [accepted → superseded]\n\nReason: superseded by adr-4 (its supersedes: field), approved in ${completed}.`, adr('adr-3', 'superseded'));
  const report = checkGovernance(f.root);

  it('reports the approve whose supersedes: target is not superseded at HEAD, naming the finalize to run', () => {
    expect(rulesOf(report, halfDone)).toEqual(['state']);
    expect(messagesOf(report, halfDone)).toMatch(/adr-1/);
    expect(messagesOf(report, halfDone)).toMatch(/wf\(adr\): finalize adr-1 \[accepted → superseded\]/);
  });

  it('accepts a completed pair', () => {
    expect(rulesOf(report, completed)).toEqual([]);
  });
});

describe('config versions over a --base range (bug-249)', () => {
  const DNA_PATH = '.wingfoil/dna.yaml';
  const MEMORY_PATH = '.wingfoil/memory.yaml';

  function scenario(edit: (f: Fixture) => void): { report: GovernanceReport; last: string } {
    const f = fixture();
    const base = git(f.root, ['rev-parse', 'HEAD']).trim();
    edit(f);
    const last = git(f.root, ['rev-parse', 'HEAD']).trim();
    return { report: checkGovernance(f.root, { base }), last };
  }

  it('reports an edit committed without a bump, on the last commit that touched the file', () => {
    const { report, last } = scenario((f) => {
      f.commit('chore: edit dna', { [DNA_PATH]: DNA.replace('category: language', 'category: lang') });
    });
    expect(rulesOf(report, last)).toEqual(['config']);
    expect(messagesOf(report, last)).toMatch(/\.wingfoil\/dna\.yaml.*1\.1/);
  });

  it('reports a downgrade, and a re-quoting that reads as the same number', () => {
    const down = scenario((f) => f.commit('chore: down', { [MEMORY_PATH]: memoryYaml('0.9') }));
    expect(rulesOf(down.report, down.last)).toEqual(['config']);
    const requote = scenario((f) => f.commit('chore: requote', { [MEMORY_PATH]: memoryYaml('"1.0"') }));
    expect(rulesOf(requote.report, requote.last)).toEqual(['config']);
  });

  it('accepts a numeric increase, once per range however many commits edit the file', () => {
    const { report } = scenario((f) => {
      f.commit('chore: bump', { [MEMORY_PATH]: memoryYaml('1.1') });
      f.commit('chore: edit again', { [MEMORY_PATH]: memoryYaml('1.1') + '# a comment\n' });
    });
    expect(report.findings.filter((finding) => finding.rule === 'config')).toEqual([]);
  });

  it('judges nothing without --base', () => {
    const f = fixture();
    f.commit('chore: edit dna', { [DNA_PATH]: DNA.replace('category: language', 'category: lang') });
    expect(checkGovernance(f.root).findings.filter((finding) => finding.rule === 'config')).toEqual([]);
  });
});

describe('per-check introduction (dl-103 §1 starting mode, per check)', () => {
  it('declares a marker for every check added after the script', () => {
    expect(Object.keys(CHECKS).sort()).toEqual(['approval-ai-trailer', 'config-version', 'status-outside-wf', 'supersedes-pair', 'verb-edge']);
    for (const marker of Object.values(CHECKS)) expect(marker).toMatch(/^governance-check:/);
  });

  it('gates a later check only after the first-parent commit that brought its marker into the script', () => {
    const f = fixture();
    f.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
    f.task('t-1', 'backlog', 'wf(task): add t-1');
    const before = f.task('t-1', 'done', 'docs: edit t-1');
    f.commit('chore: add the rule', { 'scripts/check-governance.cjs': `// placeholder\n// ${CHECKS['status-outside-wf']}\n` });
    const after = f.task('t-1', 'in-review', 'docs: edit t-1 again');
    const report = checkGovernance(f.root);
    const gated = new Map(report.findings.map((finding) => [finding.sha, finding.gated]));
    expect(gated.get(before)).toBe(false);
    expect(gated.get(after)).toBe(true);
    expect(exitCodeFor(report)).toBe(1);
  });

  it('falls back to the script introduction for a check whose marker no commit added', () => {
    const f = fixture();
    f.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
    f.task('t-1', 'backlog', 'wf(task): add t-1');
    const moved = f.task('t-1', 'done', 'docs: edit t-1');
    const report = checkGovernance(f.root);
    expect(report.findings.find((finding) => finding.sha === moved)?.gated).toBe(true);
  });
});

describe('no AI co-author trailer on approve and reject (bug-307, git-conventions §7)', () => {
  const f = fixture();
  const trailers = '\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5';
  f.task('t-1', 'pending', 'wf(task): add t-1');
  const approveWithTrailers = f.task('t-1', 'backlog', 'wf(task): approve t-1 [pending → backlog]' + approval() + trailers, APPROVER);
  f.task('t-2', 'pending', 'wf(task): add t-2');
  const rejectWithModel = f.task('t-2', 'draft', 'wf(task): reject t-2 [pending → draft]' + approval('Not yet.') + '\n\nAI-Model: claude-opus-5-5', APPROVER);
  f.task('t-3', 'pending', 'wf(task): add t-3');
  const approveClean = f.task('t-3', 'backlog', 'wf(task): approve t-3 [pending → backlog]' + approval(), APPROVER);
  const startWithTrailers = f.task('t-3', 'in-progress', 'wf(task): start t-3 [backlog → in-progress]' + trailers);
  const report = checkGovernance(f.root);

  it('reports an approve or a reject that carries an AI co-author or model trailer, naming the trailer', () => {
    expect(rulesOf(report, approveWithTrailers)).toEqual(['body']);
    expect(messagesOf(report, approveWithTrailers)).toMatch(/Co-Authored-By/);
    expect(messagesOf(report, approveWithTrailers)).toMatch(/git-conventions §7/);
    expect(rulesOf(report, rejectWithModel)).toEqual(['body']);
    expect(messagesOf(report, rejectWithModel)).toMatch(/AI-Model/);
  });

  it('accepts an approval without them, and the trailers on any other verb', () => {
    expect(rulesOf(report, approveClean)).toEqual([]);
    expect(rulesOf(report, startWithTrailers)).toEqual([]);
  });

  it('gates only commits after the check was introduced: the earlier ones are history (the 63 since 39885b87 cannot be rewritten)', () => {
    const g = fixture();
    g.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
    g.task('t-1', 'pending', 'wf(task): add t-1');
    const before = g.task('t-1', 'backlog', 'wf(task): approve t-1 [pending → backlog]' + approval() + trailers, APPROVER);
    g.commit('chore: add the rule', { 'scripts/check-governance.cjs': `// placeholder\n// ${CHECKS['approval-ai-trailer']}\n` });
    g.task('t-2', 'pending', 'wf(task): add t-2');
    const after = g.task('t-2', 'backlog', 'wf(task): approve t-2 [pending → backlog]' + approval() + trailers, APPROVER);
    const gated = new Map(checkGovernance(g.root).findings.map((finding) => [finding.sha, finding.gated]));
    expect(gated.get(before)).toBe(false);
    expect(gated.get(after)).toBe(true);
  });
});
