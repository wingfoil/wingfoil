/**
 * task-365 (`spec-020`, `dl-222` (a)) — `wingfoil verify` through the REAL compiled `dist/cli.js`, over throwaway
 * fixture repositories.
 *
 * - AC 1 (red-first): `wingfoil --help` lists `verify`; `verify --help` exits 0 and names `--base <rev>` and
 *   `--introduced-at <rev>` (no width-dependent wrap is asserted).
 * - AC 2 (red-first; T-2 to T-21): each check reports, on the commit it judges, exactly the findings `spec-020` §4's
 *   tables word, `gated: true` in a `--base` range, exit 1 where gated.
 * - AC 3 (red-first; T-7, T-22, and the uncommitted case): `dna.yaml` and `memory.yaml` at the first parent; an edit in
 *   the working tree and a staged file change nothing.
 * - AC 5 (red-first; T-23 to T-26): the starting mode of §5.1 and `W_VERIFY_WHOLE_HISTORY`.
 * - AC 6 (red-first; T-27, T-28): §7's report, its key order and §3's findings order; byte-identical reruns; the yaml
 *   report parses to the json one; the console form is `renderVerifyConsole` of the json report.
 * - AC 7 (red-first; T-28, T-29): §8's exit codes and messages, the structured stderr, `  flag: --base` under a refused
 *   revision; no stdout payload on a refusal.
 * - AC 10 (characterization of the feature file of `task-360`): the six scenarios of
 *   `docs/02_requirements/02_bdd/features/p1-memory/P1.14-verify.feature`, each a test titled with the scenario's name
 *   (T-8, T-9, T-17, T-24, T-28, and T-1 on the fixture of `test/core/helpers/l0-fixture.ts`, the verbs run with the
 *   `spec-018` §1 markers scrubbed). The feature file is committed and unchanged; these tests run the command, so they
 *   are red until green ships it.
 *
 * Fixtures: the `MEMORY_YAML`, `DNA`, `taskDoc` and `env` of `test/cli/check-governance-parent-state.test.ts`, copied
 * (into `test/core/helpers/in-memory-history-reader.ts`, and `env` here), the `task` machine given T-12's `returns`
 * edge and an `adr` machine for T-16; fixed commit dates; identities per commit (`dl-094` (ii)). Every child runs with
 * `withoutAgentMarkers(process.env)`.
 *
 * Expected messages: `spec-020` §4's tables word for word, the interpolated values and the `stateUnchecked` reasons
 * read from real runs of `node scripts/check-governance.cjs --root <fixture> --json [--base <rev>] [--introduced-at
 * <rev>]` on fixtures of the same shape (the red notes list each run); T-22 is §4.1's departure, whose text is the
 * spec's (the script reads the commit's own `memory.yaml` and reports nothing there).
 *
 * Expected red: `error: unknown command 'verify'` (exit 2) on every run of the command, so each case fails on its own
 * assertion; `src/core/governance-check.ts` does not exist (`tsc` TS2307; jest `Cannot find module` in the one case
 * that loads `renderVerifyConsole`). `dist/` is built once by jest's `globalSetup`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load, loadAll } from 'js-yaml';

import type * as GovernanceCheck from '../../src/core/governance-check';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import {
  ADR,
  APPROVER,
  DEVELOPER,
  DNA,
  MEMORY_YAML,
  STRANGER,
  TASK,
  adrDoc,
  approvalBody,
  approverLine,
  dnaYaml,
  taskDoc,
  type Person,
} from '../core/helpers/in-memory-history-reader';
import { buildL0Repo, prepareAmend } from '../core/helpers/l0-fixture';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;
jest.setTimeout(TIMEOUT_MS);

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

/** The copied `env` of `test/cli/check-governance-parent-state.test.ts`: one commit's identity and fixed date. */
function env(time: string, author: Person): NodeJS.ProcessEnv {
  const date = `2026-01-01T${time}:00Z`;
  return {
    ...process.env,
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  };
}

/** A throwaway repository whose commits carry fixed, increasing dates. */
class Fixture {
  readonly root: string;
  private minute = 0;

  constructor() {
    this.root = makeTempGitRepo();
    roots.push(this.root);
  }

  private nextTime(): string {
    if (this.minute > 59) throw new Error('fixture bug: more than 60 commits');
    const time = `08:${String(this.minute).padStart(2, '0')}`;
    this.minute += 1;
    return time;
  }

  /** Write (text) or delete (`null`) `files`, then commit everything with `message` as `author`; returns the sha. */
  commit(message: string, files: Record<string, string | null> = {}, author: Person = DEVELOPER): string {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) git(this.root, ['rm', '--quiet', path]);
      else writeFixtureFile(this.root, path, content);
    }
    git(this.root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], { cwd: this.root, encoding: 'utf-8', env: env(this.nextTime(), author) });
    return this.head();
  }

  /** `git merge --no-ff -m message branch` as `author`; returns the merge's sha. */
  merge(branch: string, message: string, author: Person = DEVELOPER): string {
    execFileSync('git', ['merge', '--quiet', '--no-ff', '-m', message, branch], { cwd: this.root, encoding: 'utf-8', env: env(this.nextTime(), author) });
    return this.head();
  }

  head(): string {
    return git(this.root, ['rev-parse', 'HEAD']).trim();
  }
}

/** The governed base: configure (the two files), `add t-1` (`draft`), `submit t-1` (`pending`, BASE), by the developer. */
function governed(dna = DNA): { f: Fixture; base: string } {
  const f = new Fixture();
  f.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': dna });
  f.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
  const base = f.commit('wf(task): submit t-1', { [TASK('t-1')]: taskDoc('pending') });
  return { f, base };
}

/** `wingfoil verify <args>` in `root`, the agent markers scrubbed, plus `extra`. */
function verify(root: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, 'verify', ...args], { cwd: root, env: { ...withoutAgentMarkers(process.env), ...extra } as NodeJS.ProcessEnv });
}

/** Any `wingfoil` command, the markers scrubbed. */
function wingfoil(root: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd: root, env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv });
}

interface ReportFinding {
  readonly sha: string;
  readonly subject: string;
  readonly rule: string;
  readonly check: string;
  readonly message: string;
  readonly gated: boolean;
}

interface Report {
  readonly head: string;
  readonly base: string | null;
  readonly introducedAt: string | null;
  readonly checks: readonly { check: string; rule: string; since: string }[];
  readonly commits: { range: number; memory: number; other: number; gated: number };
  readonly findings: readonly ReportFinding[];
  readonly stateUnchecked: readonly { sha: string; subject: string; reason: string }[];
  readonly verdict: 'pass' | 'fail';
}

/** The json report of a run: exit and stdout checked first, so a refusal reads as one. */
function reportOf(run: SpawnedRun): Report {
  if (run.stdout.trim() === '') throw new Error(`no report on stdout (exit ${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout) as Report;
}

/** `{ sha, rule, check, message, gated }` of every finding, in report order. */
const findings = (report: Report): Omit<ReportFinding, 'subject'>[] =>
  report.findings.map((entry) => ({ sha: entry.sha, rule: entry.rule, check: entry.check, message: entry.message, gated: entry.gated }));

const gatedFinding = (sha: string, rule: string, check: string, message: string): Omit<ReportFinding, 'subject'> => ({ sha, rule, check, message, gated: true });

const DECLARED = 'add, submit, approve, reject, deprecate, start, finalize, sync, amend, park, assign';
const AGENT = 'an approval commit (it has an Approver: line) carries no agent trailer (spec-018 §4, git-conventions §7), yet it has';
const OUTSIDE = (path: string, from: string, to: string): string => `${path}: its status went ${from} → ${to} in a commit that is not a wf() Memory operation (dl-139)`;
const NO_ROLE = (email: string): string => `the author <${email}> holds no approver role in team.members (dl-094)`;
const OTHER = (named: string, author: string): string => `the Approver: line names <${named}>, but <${author}> authored the commit (dl-094)`;
/** `spec-020` §8.2's warning, without the `warning: ` prefix the console adds. */
const VERIFY_WHOLE_HISTORY =
  'W_VERIFY_WHOLE_HISTORY: no --base and no --introduced-at, so every commit reachable from HEAD is judged and gated; pass --base <rev> to judge a range, or --introduced-at <rev> to report older history without failing';
const E_FINDINGS_T6 = 'E_VERIFY_FINDINGS: 2 findings on 1 commits fail the governance check (authority 2)';
const MALFORMED = (rev: string): string =>
  `malformed revision "${rev}": a revision is a non-empty name with no leading '-', no whitespace or control character, no ':' and no '..'`;

/** T-6's repository: the developer authors an approve whose `Approver:` line names the approver. */
function t6(): { f: Fixture; base: string; bad: string } {
  const { f, base } = governed();
  const bad = f.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody('Ready.')}`, { [TASK('t-1')]: taskDoc('backlog') }, DEVELOPER);
  return { f, base, bad };
}

/** T-8's repository: `bug-496`'s forged approval by a non-member. */
function t8(): { f: Fixture; base: string; bad: string } {
  const { f, base } = governed();
  const bad = f.commit('wf(task): approve t-1 [pending → backlog]\n\nApprover: Nobody <nobody@example.invalid> (approver)\nReason: Looks fine.', { [TASK('t-1')]: taskDoc('backlog') }, STRANGER);
  return { f, base, bad };
}

describe('task-365 AC 1 — wingfoil verify is a listed command with its two options (spec-020 §2)', () => {
  it('wingfoil --help lists verify among the commands', () => {
    const run = wingfoil(makeTempGitRepoTracked(), ['--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^ {2}verify\b/m);
  });

  it('wingfoil verify --help exits 0 and names --base <rev> and --introduced-at <rev>', () => {
    const run = wingfoil(makeTempGitRepoTracked(), ['verify', '--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('--base <rev>');
    expect(run.stdout).toContain('--introduced-at <rev>');
  });
});

function makeTempGitRepoTracked(): string {
  const root = makeTempGitRepo();
  roots.push(root);
  return root;
}

describe('task-365 AC 2 — subject and bracket (spec-020 §4.2, §4.3; T-2 to T-4)', () => {
  it('T-2 — an undeclared verb: the declared-verbs message, exit 1', () => {
    const { f, base } = governed();
    const bad = f.commit('wf(task): aprove t-1 [pending → backlog]', { [TASK('t-1')]: taskDoc('backlog') });
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'subject', 'subject', `'aprove' is not one of the declared verbs (${DECLARED})`)]);
  });

  it('T-3 — a type the parent\'s memory.yaml does not declare: the type message, and its state not checked', () => {
    const { f, base } = governed();
    const subject = 'wf(unicorn): add unicorn-1';
    const bad = f.commit(subject, { 'docs/memory/unicorn/unicorn-1.md': '---\nid: "unicorn-1"\ntype: unicorn\ntitle: "U"\nstatus: draft\n---\n\nBody.\n' });
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    const report = reportOf(run);
    expect(findings(report)).toEqual([gatedFinding(bad, 'subject', 'subject', "'unicorn' is not a type of the memory.yaml committed at this commit")]);
    expect(report.stateUnchecked).toEqual([{ sha: bad, subject, reason: "no machine for 'unicorn' in the .wingfoil/memory.yaml at this commit: transitions not judged" }]);
  });

  it('T-4 — one bracket finding per malformed bracket (park\'s also a state finding: no returns edge)', () => {
    const { f, base } = governed();
    const A = `\n\n${approvalBody()}`;
    const s = f.commit('wf(task): submit t-1 [draft → pending]');
    const arrow = f.commit(`wf(task): approve t-1 [pending -> backlog]${A}`, {}, APPROVER);
    const none = f.commit(`wf(task): approve t-1${A}`, {}, APPROVER);
    const chain = f.commit(`wf(task): approve t-1 [pending → backlog → in-progress]${A}`, {}, APPROVER);
    const amend = f.commit(`wf(task): amend t-1 [pending → backlog]${A}`, {}, APPROVER);
    const dep = f.commit('wf(task): deprecate t-1 [pending → backlog]');
    const park = f.commit('wf(task): park t-1 [backlog → backlog]\n\nReason: stop.');
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(s, 'bracket', 'bracket', "'submit' carries no bracket"),
      gatedFinding(arrow, 'bracket', 'bracket', 'the bracket is not canonical: [from → to], with the U+2192 arrow and single spaces, closing the subject'),
      gatedFinding(none, 'bracket', 'bracket', "'approve' needs a [from → to] bracket"),
      gatedFinding(chain, 'bracket', 'bracket', "only 'sync' may chain states; 'approve' brackets one hop"),
      gatedFinding(amend, 'bracket', 'bracket', "'amend' brackets the unchanged state, [s → s]"),
      gatedFinding(dep, 'bracket', 'bracket', "'deprecate' ends in 'deprecated'"),
      gatedFinding(park, 'bracket', 'bracket', "'park' brackets one hop between two different states, [from → to]"),
      gatedFinding(park, 'state', 'state', "backlog → backlog is not a returns edge of the 'task' machine at this commit"),
    ]);
  });
});

describe('task-365 AC 2 / AC 3 — body and authority (spec-020 §4.4; T-5 to T-8)', () => {
  it('T-5 — one body finding per malformed approval body (a misplaced line also lands in the Reason: block)', () => {
    const { f, base } = governed();
    const A = approverLine();
    const SUBJECT = 'wf(task): approve t-1 [pending → backlog]';
    const DEFECT = 'the Reason: block must not contain a line starting with "Approver:", "Reason:" or "WingFoil-Version:" (dl-067)';
    const noApprover = f.commit(`${SUBJECT}\n\nReason: ok.`, {}, APPROVER);
    const second = f.commit(`${SUBJECT}\n\nReason: ok.\n${A}`, {}, APPROVER);
    const role = f.commit(`${SUBJECT}\n\n${approvalBody('ok.', APPROVER, 'developer')}`, {}, APPROVER);
    const two = f.commit(`${SUBJECT}\n\n${A}\n${A}\nReason: ok.`, {}, APPROVER);
    const noReason = f.commit(`${SUBJECT}\n\n${A}`, {}, APPROVER);
    const blank = f.commit(`${SUBJECT}\n\n${A}\nReason:`, {}, APPROVER);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(noApprover, 'body', 'body', "'approve' needs an Approver: line"),
      gatedFinding(second, 'body', 'body', 'the Approver: line must be the first body line, as `Approver: Name <email> (role)`'),
      gatedFinding(second, 'body', 'body', DEFECT),
      gatedFinding(role, 'body', 'body', "the Approver: role is 'developer', not 'approver'"),
      gatedFinding(two, 'body', 'body', '2 Approver: lines; an approval records one'),
      gatedFinding(noReason, 'body', 'body', "'approve' needs a Reason: block"),
      gatedFinding(blank, 'body', 'body', 'the Reason: block must not be blank (dl-067)'),
    ]);
  });

  it('T-6 — the developer authors an approval naming the approver: two authority findings, exit 1', () => {
    const { f, base, bad } = t6();
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(bad, 'authority', 'authority', OTHER(APPROVER.email, DEVELOPER.email)),
      gatedFinding(bad, 'authority', 'authority', NO_ROLE(DEVELOPER.email)),
    ]);
  });

  it('AC 3 / T-7 — the approver added to team.members in the approving commit: no approver role (the parent\'s dna.yaml)', () => {
    const { f, base } = governed(dnaYaml([{ ...DEVELOPER, roles: ['developer'] }]));
    const bad = f.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody('Ready.')}`, { [TASK('t-1')]: taskDoc('backlog'), '.wingfoil/dna.yaml': DNA }, APPROVER);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'authority', 'authority', NO_ROLE(APPROVER.email))]);
  });
});

describe('task-365 AC 2 / AC 3 — state, verb-edge, status-outside-wf, supersedes-pair (spec-020 §4.5–§4.8; T-9 to T-16, T-22)', () => {
  it('T-10 — a wf(dna): commit changing a task\'s status is an other commit: status-outside-wf', () => {
    const { f, base } = governed();
    const bad = f.commit('wf(dna): set project.name', { [TASK('t-1')]: taskDoc('backlog') });
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'state', 'status-outside-wf', OUTSIDE(TASK('t-1'), 'pending', 'backlog'))]);
  });

  it('T-11 — the bracket says pending → backlog, the frontmatter went pending → in-progress: the mismatch', () => {
    const { f, base } = governed();
    const bad = f.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody()}`, { [TASK('t-1')]: taskDoc('in-progress') }, APPROVER);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'state', 'state', `${TASK('t-1')}: the bracket declares pending → backlog, the frontmatter went pending → in-progress`)]);
  });

  it('T-12 — park [backlog → in-progress] on a machine whose returns is in-progress: backlog', () => {
    const { f } = governed();
    const base = f.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody()}`, { [TASK('t-1')]: taskDoc('backlog') }, APPROVER);
    const bad = f.commit('wf(task): park t-1 [backlog → in-progress]\n\nReason: Not now.', { [TASK('t-1')]: taskDoc('in-progress') });
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'state', 'state', "backlog → in-progress is not a returns edge of the 'task' machine at this commit")]);
  });

  it('T-13 — a commit changing two tasks\' status, naming one: the other is not named', () => {
    const { f } = governed();
    const base = f.commit('wf(task): add t-2', { [TASK('t-2')]: taskDoc('draft', '', 't-2') });
    const bad = f.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody()}`, { [TASK('t-1')]: taskDoc('backlog'), [TASK('t-2')]: taskDoc('pending', '', 't-2') }, APPROVER);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'state', 'state', `${TASK('t-2')}: the subject does not name it, yet its status went draft → pending`)]);
  });

  it('T-14 — one verb-edge finding per verb on the wrong edge', () => {
    const { f, base } = governed();
    const approve = f.commit(`wf(task): approve t-1 [pending → draft]\n\n${approvalBody('x.')}`, {}, APPROVER);
    const start = f.commit('wf(task): start t-1 [approved → done]');
    const finalize = f.commit('wf(task): finalize t-1 [in-progress → in-review]');
    const reject = f.commit(`wf(task): reject t-1 [pending → backlog]\n\n${approvalBody('x.')}`, {}, APPROVER);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(approve, 'state', 'verb-edge', "'approve' moves along a forward edge; pending → draft is a reject edge of the 'task' machine"),
      gatedFinding(start, 'state', 'verb-edge', "'start' moves along a forward edge not into the last state 'done' (that is 'finalize'); approved → done is a forward edge of the 'task' machine"),
      gatedFinding(finalize, 'state', 'verb-edge', "'finalize' moves along the forward edge into the last state 'done'; in-progress → in-review is a forward edge of the 'task' machine"),
      gatedFinding(reject, 'state', 'verb-edge', "'reject' moves along a gates reject edge; pending → backlog is a forward edge of the 'task' machine"),
    ]);
  });

  it('T-15 — a sync along a reject edge: a finding only without the reject\'s sha in the body', () => {
    const { f, base } = governed();
    const rejected = f.commit(`wf(task): reject t-1 [in-review → in-progress]\n\n${approvalBody('Fix it.')}`, {}, APPROVER);
    f.commit(`wf(task): sync t-1 [in-review → in-progress]\n\nFollows the reject ${rejected.slice(0, 12)}.`);
    const bare = f.commit('wf(task): sync t-1 [in-review → in-progress]');
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(bare, 'state', 'verb-edge', "in-review → in-progress is a reject edge of the 'task' machine: the body must cite the approver's reject commit by sha (dl-061 B.1)"),
    ]);
  });

  it('T-16 — an approve whose supersedes: target is still accepted at HEAD; none once the finalize is added', () => {
    const { f } = governed();
    f.commit('wf(adr): add a-0', { [ADR('a-0')]: adrDoc('a-0', 'draft') });
    f.commit('wf(adr): submit a-0', { [ADR('a-0')]: adrDoc('a-0', 'pending') });
    const base = f.commit(`wf(adr): approve a-0 [pending → accepted]\n\n${approvalBody('Yes.')}`, { [ADR('a-0')]: adrDoc('a-0', 'accepted') }, APPROVER);
    f.commit('wf(adr): add a-1', { [ADR('a-1')]: adrDoc('a-1', 'draft', 'a-0') });
    f.commit('wf(adr): submit a-1', { [ADR('a-1')]: adrDoc('a-1', 'pending', 'a-0') });
    const approve = f.commit(`wf(adr): approve a-1 [pending → accepted]\n\n${approvalBody('Yes.')}`, { [ADR('a-1')]: adrDoc('a-1', 'accepted', 'a-0') }, APPROVER);
    const half = verify(f.root, ['--base', base, '--format', 'json']);
    expect(half.status).toBe(1);
    expect(findings(reportOf(half))).toEqual([
      gatedFinding(
        approve,
        'state',
        'supersedes-pair',
        `${ADR('a-1')}: approved into 'accepted' with supersedes: a-0, but a-0 is 'accepted' at HEAD, not 'superseded': complete the pair with \`wf(adr): finalize a-0 [accepted → superseded]\`, Reason: superseded by a-1 (its supersedes: field), approved in ${approve}.`,
      ),
    ]);
    f.commit(`wf(adr): finalize a-0 [accepted → superseded]\n\nReason: superseded by a-1 (its supersedes: field), approved in ${approve}.`, { [ADR('a-0')]: adrDoc('a-0', 'superseded') });
    const complete = verify(f.root, ['--base', base, '--format', 'json']);
    expect(complete.status).toBe(0);
    expect(findings(reportOf(complete))).toEqual([]);
  });

  it('AC 3 / T-22 — a state added to memory.yaml and used in the same commit: judged against the parent\'s machine', () => {
    const f = new Fixture();
    f.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
    const base = f.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
    const bad = f.commit('wf(task): submit t-1', { '.wingfoil/memory.yaml': MEMORY_YAML.replace('[draft, pending,', '[draft, submitted, pending,'), [TASK('t-1')]: taskDoc('submitted') });
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'state', 'state', `${TASK('t-1')}: 'submit' moved it draft → submitted, not an edge of the 'task' machine at this commit`)]);
  });

  it('AC 3 — an uncommitted status edit and a staged file change nothing: byte-identical stdout, the same exit', () => {
    const { f, base } = t6();
    const before = verify(f.root, ['--base', base, '--format', 'json']);
    writeFileSync(join(f.root, TASK('t-1')), taskDoc('done'));
    writeFixtureFile(f.root, 'staged.md', 'staged\n');
    git(f.root, ['add', 'staged.md']);
    const after = verify(f.root, ['--base', base, '--format', 'json']);
    expect(before.status).toBe(1);
    expect({ status: after.status, stdout: after.stdout }).toEqual({ status: before.status, stdout: before.stdout });
  });
});

describe('task-365 AC 2 — approval-agent-trailer, workflow-record-authority, trailer-paragraph (spec-020 §4.9–§4.11; T-17 to T-21)', () => {
  it('T-17 — one finding per agent-trailer line of an approval commit, the second occurrence numbered', () => {
    const { f, base } = governed();
    const other = f.commit(`chore: note\n\n${approverLine()}\nCo-Authored-By: Claude <noreply@anthropic.com>`, {}, APPROVER);
    const amend = f.commit(`wf(task): amend t-1 [pending → pending]\n\n${approvalBody('A fix.')}\n\nAI-Model: m-1`, { [TASK('t-1')]: taskDoc('pending', 'A fix.') }, APPROVER);
    const rekey = f.commit(
      `workflow: rekey p-1 a.old a.new\n\n${approvalBody('Renamed.')}\n\nWingFoil-Instance: p-1\nCo-Authored-By: Claude <noreply@anthropic.com>\nco-authored-by: Claude <noreply@anthropic.com>`,
      {},
      APPROVER,
    );
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(other, 'body', 'approval-agent-trailer', `${AGENT} a Co-Authored-By: line`),
      gatedFinding(amend, 'body', 'approval-agent-trailer', `${AGENT} an AI-Model: line`),
      gatedFinding(rekey, 'body', 'approval-agent-trailer', `${AGENT} a Co-Authored-By: line`),
      gatedFinding(rekey, 'body', 'approval-agent-trailer', `${AGENT} a co-authored-by: line (occurrence 2)`),
    ]);
  });

  it('T-18, T-19 — agent trailers without an Approver: line, and a merge with both: no finding, exit 0', () => {
    const { f, base } = governed();
    f.commit('wf(task): add t-2\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: m-1', { [TASK('t-2')]: taskDoc('draft', '', 't-2') });
    git(f.root, ['checkout', '--quiet', '-b', 'side']);
    f.commit('docs: side note', { 'notes.md': 'x\n' });
    git(f.root, ['checkout', '--quiet', 'main']);
    f.merge('side', `Merge branch 'side'\n\n${approverLine()}\nCo-Authored-By: Claude <noreply@anthropic.com>\n\nWingFoil-Instance: p-1\n\nWingFoil-Version: 0.4.0`);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(0);
    expect(findings(reportOf(run))).toEqual([]);
  });

  it('T-20 — a finalize record whose Approver: names a developer, authored by the developer: body and authority', () => {
    const { f, base } = governed();
    const bad = f.commit(`workflow: finalize p-1 rc.go\n\n${approverLine(DEVELOPER, 'developer')}\n\nWingFoil-Phase: rc.go completed\nWingFoil-Instance: p-1`, {}, DEVELOPER);
    f.commit(`chore: finalize\n\n${approverLine(DEVELOPER, 'developer')}`, {}, DEVELOPER);
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(bad, 'body', 'workflow-record-authority', "the Approver: role is 'developer', not 'approver'"),
      gatedFinding(bad, 'authority', 'workflow-record-authority', NO_ROLE(DEVELOPER.email)),
    ]);
  });

  it('T-21 — WingFoil-Instance: and wingfoil-step: before the final paragraph: two findings, in the order written', () => {
    const { f, base } = governed();
    const bad = f.commit('chore: wire\n\nWingFoil-Instance: p-1\nwingfoil-step: s.one\nWingFoil-Instance: p-2\n\nWingFoil-Version: 0.4.0');
    const tail = "line sits outside the commit's final paragraph, where the workflow deduction does not read it (git-conventions §8, bug-391)";
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(bad, 'body', 'trailer-paragraph', `a WingFoil-Instance: ${tail}`),
      gatedFinding(bad, 'body', 'trailer-paragraph', `a wingfoil-step: ${tail}`),
    ]);
  });
});

describe('task-365 AC 5 — the starting mode (spec-020 §5.1; T-23 to T-26)', () => {
  it('T-23 — the bad commit before --base is out of the range: no finding, exit 0', () => {
    const { f, bad } = t8();
    f.commit('docs: note', { 'notes.md': 'x\n' });
    const run = verify(f.root, ['--base', bad, '--format', 'json']);
    expect(run.status).toBe(0);
    const report = reportOf(run);
    expect(report.findings).toEqual([]);
    expect(report.verdict).toBe('pass');
  });

  it('T-25 — no --base and no --introduced-at: the W_VERIFY_WHOLE_HISTORY warning first on stderr, every finding gated', () => {
    const { f } = t6();
    const run = verify(f.root, []);
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`warning: ${VERIFY_WHOLE_HISTORY}\nerror: ${E_FINDINGS_T6}\n`);
    const json = reportOf(verify(f.root, ['--format', 'json']));
    expect(json.findings.length).toBeGreaterThan(0);
    expect(json.findings.every((entry) => entry.gated)).toBe(true);
  });

  it('T-25 — --base alone and --introduced-at alone print no warning', () => {
    const { f, base } = t6();
    expect(verify(f.root, ['--base', base]).stderr).not.toContain('W_VERIFY_WHOLE_HISTORY');
    expect(verify(f.root, ['--introduced-at', base]).stderr).not.toContain('W_VERIFY_WHOLE_HISTORY');
  });

  it('T-26 — wf() commits before memory.yaml was committed: history with the flag, a gated state finding without it', () => {
    const f = new Fixture();
    f.commit('chore: team', { '.wingfoil/dna.yaml': DNA });
    const early = f.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
    const cfg = f.commit('chore: configure memory', { '.wingfoil/memory.yaml': MEMORY_YAML });

    const introduced = verify(f.root, ['--introduced-at', cfg, '--format', 'json']);
    expect(introduced.status).toBe(0);
    expect(reportOf(introduced).findings).toEqual([]);
    expect(reportOf(introduced).stateUnchecked).toEqual([{ sha: early, subject: 'wf(task): add t-1', reason: 'no .wingfoil/memory.yaml is committed at this commit: transitions not judged' }]);

    const ranged = verify(f.root, ['--base', cfg, '--format', 'json']);
    expect(ranged.status).toBe(0);
    expect(reportOf(ranged).findings).toEqual([]);

    const whole = verify(f.root, ['--format', 'json']);
    expect(whole.status).toBe(1);
    expect(findings(reportOf(whole))).toEqual([gatedFinding(early, 'state', 'state', 'no .wingfoil/memory.yaml is committed at this commit: its state cannot be checked')]);
  });
});

describe('task-365 AC 6 — the report (spec-020 §3, §7; T-27, T-28)', () => {
  it('T-27 — two json runs, and runs under LC_ALL=C and log.showSignature=true, print byte-identical stdout', () => {
    const { f } = t6();
    const first = verify(f.root, ['--format', 'json']);
    const second = verify(f.root, ['--format', 'json']);
    const cLocale = verify(f.root, ['--format', 'json'], { LC_ALL: 'C' });
    const signature = verify(f.root, ['--format', 'json'], { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'log.showSignature', GIT_CONFIG_VALUE_0: 'true' });
    expect(first.stdout).not.toBe('');
    expect(second.stdout).toBe(first.stdout);
    expect(cLocale.stdout).toBe(first.stdout);
    expect(signature.stdout).toBe(first.stdout);
  });

  it('T-28 — §7\'s keys in order, the checks list, the counts, verdict fail; findings carry check', () => {
    const { f, bad } = t6();
    const run = verify(f.root, ['--format', 'json']);
    expect(run.status).toBe(1);
    const report = reportOf(run);
    expect(Object.keys(report)).toEqual(['head', 'base', 'introducedAt', 'checks', 'commits', 'findings', 'stateUnchecked', 'verdict']);
    expect(report.head).toBe(bad);
    expect(report.base).toBeNull();
    expect(report.introducedAt).toBeNull();
    expect(report.checks).toEqual([
      { check: 'subject', rule: 'subject', since: '0.4.0' },
      { check: 'bracket', rule: 'bracket', since: '0.4.0' },
      { check: 'body', rule: 'body', since: '0.4.0' },
      { check: 'authority', rule: 'authority', since: '0.4.0' },
      { check: 'state', rule: 'state', since: '0.4.0' },
      { check: 'verb-edge', rule: 'state', since: '0.4.0' },
      { check: 'status-outside-wf', rule: 'state', since: '0.4.0' },
      { check: 'supersedes-pair', rule: 'state', since: '0.4.0' },
      { check: 'approval-agent-trailer', rule: 'body', since: '0.4.0' },
      { check: 'workflow-record-authority', rule: 'body', since: '0.4.0' },
      { check: 'trailer-paragraph', rule: 'body', since: '0.4.0' },
    ]);
    expect(Object.keys(report.commits)).toEqual(['range', 'memory', 'other', 'gated']);
    expect(report.commits).toEqual({ range: 4, memory: 3, other: 1, gated: 4 });
    for (const entry of report.findings) expect(Object.keys(entry)).toEqual(['sha', 'subject', 'rule', 'check', 'message', 'gated']);
    expect(report.findings.map((entry) => entry.subject)).toEqual(['wf(task): approve t-1 [pending → backlog]', 'wf(task): approve t-1 [pending → backlog]']);
    expect(report.verdict).toBe('fail');
  });

  it('§3 — a commit\'s findings by category, then by message, its trailer-paragraph findings after its other body findings in the order written', () => {
    const { f, base } = governed();
    const bad = f.commit(
      `wf(task): approve t-1 [pending -> backlog]\n\n${approvalBody('ok.', DEVELOPER, 'developer')}\n\nWingFoil-Instance: p-1\nwingfoil-step: s.one\n\nWingFoil-Version: 0.4.0`,
      { [TASK('t-1')]: taskDoc('backlog') },
      DEVELOPER,
    );
    const tail = "line sits outside the commit's final paragraph, where the workflow deduction does not read it (git-conventions §8, bug-391)";
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(findings(reportOf(run))).toEqual([
      gatedFinding(bad, 'bracket', 'bracket', 'the bracket is not canonical: [from → to], with the U+2192 arrow and single spaces, closing the subject'),
      gatedFinding(bad, 'body', 'body', "the Approver: role is 'developer', not 'approver'"),
      gatedFinding(bad, 'body', 'body', 'the Reason: block must not end in a paragraph of "Key: value" lines; add a closing sentence after it, or fold those lines into prose (dl-067)'),
      gatedFinding(bad, 'body', 'trailer-paragraph', `a WingFoil-Instance: ${tail}`),
      gatedFinding(bad, 'body', 'trailer-paragraph', `a wingfoil-step: ${tail}`),
      gatedFinding(bad, 'authority', 'authority', NO_ROLE(DEVELOPER.email)),
    ]);
  });

  it('console — the --format console stdout is renderVerifyConsole of the --format json report', () => {
    // Loaded here, not at the top, so the other cases of this file report their own red while the module is missing.
    const { renderVerifyConsole } = jest.requireActual<typeof GovernanceCheck>('../../src/core/governance-check');
    const { f, base } = t6();
    const json = verify(f.root, ['--base', base, '--format', 'json']);
    const consoleRun = verify(f.root, ['--base', base, '--format', 'console']);
    expect(consoleRun.status).toBe(1);
    expect(consoleRun.stdout.replace(/\n$/, '')).toBe(renderVerifyConsole(JSON.parse(json.stdout) as GovernanceCheck.GovernanceReport).replace(/\n$/, ''));
    expect(consoleRun.stderr).toBe(`error: ${E_FINDINGS_T6}\n`);
  });
});

describe('task-365 AC 7 — exit codes and messages (spec-020 §8; T-28, T-29)', () => {
  it('T-28 — json: stdout only the report; stderr the warning document, then the error document; exit 1', () => {
    const { f } = t6();
    const run = verify(f.root, ['--format', 'json']);
    expect(run.status).toBe(1);
    expect(() => JSON.parse(run.stdout) as unknown).not.toThrow();
    expect(run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as unknown)).toEqual([{ warning: VERIFY_WHOLE_HISTORY }, { error: E_FINDINGS_T6 }]);
  });

  it('T-28 — yaml: the report parses to the json one; stderr the same warning and error, each one ---/... document; exit 1', () => {
    const { f } = t6();
    const json = verify(f.root, ['--format', 'json']);
    const yaml = verify(f.root, ['--format', 'yaml']);
    expect(yaml.status).toBe(1);
    expect(load(yaml.stdout)).toEqual(JSON.parse(json.stdout));
    expect(yaml.stderr.startsWith('---\n')).toBe(true);
    expect(yaml.stderr.endsWith('...\n')).toBe(true);
    expect(yaml.stderr.match(/^---$/gm)).toHaveLength(2);
    expect(yaml.stderr.match(/^\.\.\.$/gm)).toHaveLength(2);
    expect(loadAll(yaml.stderr).filter((document) => document !== null && document !== undefined)).toEqual([{ warning: VERIFY_WHOLE_HISTORY }, { error: E_FINDINGS_T6 }]);
  });

  describe('T-29 — refusals: exit and message, no stdout payload', () => {
    let root: string;
    beforeAll(() => {
      root = governed().f.root;
    });

    it.each<[string, string[], number, string]>([
      ['an operand', ['extra'], 2, 'error: wingfoil verify takes no positional (got 1 positional)\n'],
      ['a blank --base', ['--base', ''], 2, 'error: invalid flag value: --base must not be blank\n'],
      ['a blank --introduced-at', ['--introduced-at', ''], 2, 'error: invalid flag value: --introduced-at must not be blank\n'],
      ['a --base naming no commit', ['--base', 'nosuchrev'], 1, 'error: revision "nosuchrev" does not name a commit\n  flag: --base\n'],
      ['--base -x', ['--base', '-x'], 1, `error: ${MALFORMED('-x')}\n  flag: --base\n`],
      ["--base 'a b'", ['--base', 'a b'], 1, `error: ${MALFORMED('a b')}\n  flag: --base\n`],
      ['--base HEAD:x', ['--base', 'HEAD:x'], 1, `error: ${MALFORMED('HEAD:x')}\n  flag: --base\n`],
      ['--base a..b', ['--base', 'a..b'], 1, `error: ${MALFORMED('a..b')}\n  flag: --base\n`],
      ['an --introduced-at naming no commit', ['--introduced-at', 'nosuchrev'], 1, 'error: revision "nosuchrev" does not name a commit\n  flag: --introduced-at\n'],
    ])('%s', (_label, args, status, stderr) => {
      const run = verify(root, args);
      expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status, stdout: '', stderr });
    });

    it('--format json: the refused revision is one {error, details} document whose details carry the flag', () => {
      const run = verify(root, ['--base', 'nosuchrev', '--format', 'json']);
      expect(run.status).toBe(1);
      expect(run.stdout).toBe('');
      const document = JSON.parse(run.stderr) as { error: string; details?: unknown };
      expect(document.error).toBe('revision "nosuchrev" does not name a commit');
      expect(document.details).toEqual([{ detail: 'flag: --base' }]);
    });

    it('an empty repository (unborn HEAD): exit 1, `revision "HEAD" does not name a commit`, no warning', () => {
      const run = verify(makeTempGitRepoTracked(), []);
      expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: '', stderr: 'error: revision "HEAD" does not name a commit\n' });
    });

    it('--dry-run is an unknown option: exit 2', () => {
      const run = verify(root, ['--dry-run']);
      expect(run.status).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toContain("unknown option '--dry-run'");
    });
  });
});

describe('task-365 AC 10 — P1.14-verify.feature (task-360), one test per scenario', () => {
  it('Error - a forged approval fails the check', () => {
    const { f, base, bad } = t8();
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    const report = reportOf(run);
    expect(report.findings.map((entry) => entry.check)).toEqual(['authority', 'authority']);
    expect(findings(report)).toEqual([
      gatedFinding(bad, 'authority', 'authority', OTHER('nobody@example.invalid', STRANGER.email)),
      gatedFinding(bad, 'authority', 'authority', NO_ROLE(STRANGER.email)),
    ]);
    expect(report.findings.filter((entry) => entry.check === 'state')).toEqual([]);
    expect(run.status).toBe(1);
  });

  it('Error - a status changed outside a Memory operation fails the check', () => {
    const { f, base } = governed();
    const bad = f.commit('docs: tidy', { [TASK('t-1')]: taskDoc('backlog') });
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(findings(reportOf(run))).toEqual([gatedFinding(bad, 'state', 'status-outside-wf', OUTSIDE(TASK('t-1'), 'pending', 'backlog'))]);
    expect(run.status).toBe(1);
  });

  it('Error - an approval carrying an agent trailer fails the check', () => {
    const { f, base } = governed();
    const bad = f.commit(
      `wf(task): approve t-1 [pending → backlog]\n\n${approvalBody('Looks fine.')}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By: Other <0+other@users.noreply.github.com>\nAI-Model: m-1`,
      { [TASK('t-1')]: taskDoc('backlog') },
      APPROVER,
    );
    const run = verify(f.root, ['--base', base, '--format', 'json']);
    expect(findings(reportOf(run)).filter((entry) => entry.check === 'approval-agent-trailer')).toEqual([
      gatedFinding(bad, 'body', 'approval-agent-trailer', `${AGENT} a Co-Authored-By: line`),
      gatedFinding(bad, 'body', 'approval-agent-trailer', `${AGENT} a Co-Authored-By: line (occurrence 2)`),
      gatedFinding(bad, 'body', 'approval-agent-trailer', `${AGENT} an AI-Model: line`),
    ]);
    expect(run.status).toBe(1);
  });

  it('Findings before the introduction are history', () => {
    const { f, bad } = t8();
    const gated = verify(f.root, ['--introduced-at', `${bad}^`, '--format', 'json']);
    const gatedReport = reportOf(gated);
    expect(gatedReport.findings.filter((entry) => entry.sha === bad).map((entry) => entry.gated)).toEqual([true, true]);
    expect(gatedReport.verdict).toBe('fail');
    expect(gated.status).toBe(1);

    const history = verify(f.root, ['--introduced-at', bad, '--format', 'json']);
    const historyReport = reportOf(history);
    expect(historyReport.findings.filter((entry) => entry.sha === bad).map((entry) => entry.gated)).toEqual([false, false]);
    expect(historyReport.findings.some((entry) => entry.gated)).toBe(false);
    expect(historyReport.verdict).toBe('pass');
    expect(history.status).toBe(0);
  });

  it('The report under json and yaml', () => {
    const { f } = t6();
    const json = verify(f.root, ['--format', 'json']);
    const report = reportOf(json);
    expect(Object.keys(report)).toEqual(['head', 'base', 'introducedAt', 'checks', 'commits', 'findings', 'stateUnchecked', 'verdict']);
    expect(report.verdict).toBe('fail');
    expect(json.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as unknown)).toEqual([{ warning: VERIFY_WHOLE_HISTORY }, { error: E_FINDINGS_T6 }]);
    expect(json.status).toBe(1);

    const yaml = verify(f.root, ['--format', 'yaml']);
    expect(load(yaml.stdout)).toEqual(report);
    expect(loadAll(yaml.stderr).filter((document) => document !== null && document !== undefined)).toEqual([{ warning: VERIFY_WHOLE_HISTORY }, { error: E_FINDINGS_T6 }]);
    expect(yaml.stderr.match(/^---$/gm)).toHaveLength(2);
    expect(yaml.stderr.match(/^\.\.\.$/gm)).toHaveLength(2);
    expect(yaml.status).toBe(1);
  });

  it('A range written by the verbs passes', () => {
    const root = buildL0Repo();
    roots.push(root);
    // `memory add` needs an id_pattern and a template (`error: memory type 'task' has no id_pattern/template in
    // memory.yaml` on the bare fixture): declared before BASE, so the range holds the verbs' commits only.
    const memoryPath = join(root, '.wingfoil', 'memory.yaml');
    const memoryYaml = readFileSync(memoryPath, 'utf-8');
    const taskType = '  task:\n    path: "docs/tasks/{id}.md"\n';
    if (!memoryYaml.includes(taskType)) throw new Error('fixture bug: the l0 task type moved');
    writeFileSync(memoryPath, memoryYaml.replace(taskType, `${taskType}    id_pattern: "task-{n}-{slug}"\n    template:\n      file: "memory/templates/task.md"\n      frontmatter:\n        required: [title]\n`));
    writeFixtureFile(root, '.wingfoil/memory/templates/task.md', '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\n---\n\n<!-- body -->\n');
    commitAll(root, 'chore: a task template');
    const base = git(root, ['rev-parse', 'HEAD']).trim();
    const step = (args: string[]): void => {
      const run = wingfoil(root, args);
      expect({ args: args.join(' '), status: run.status, stderr: run.stderr }).toEqual({ args: args.join(' '), status: 0, stderr: '' });
    };
    step(['memory', 'add', '--type', 'task', '--title', 'Fresh task']);
    step(['memory', 'submit', 'task-004-deprecate-me']);
    step(['memory', 'approve', 'task-001-approve-me', '--reason', 'Scope is clear.']);
    step(['memory', 'reject', 'task-002-reject-me', '--reason', 'Add acceptance criteria.']);
    step(['memory', 'park', 'task-005-park-me', '--reason', 'Not now.']);
    prepareAmend(root);
    step(['memory', 'amend', 'task-003-amend-me', '--reason', 'A corrected scope paragraph.']);
    step(['memory', 'deprecate', 'task-004-deprecate-me', '--reason', 'Superseded.']);
    step(['workflow', 'finalize', 'rc-1', '--reason', 'Go.']);

    const run = verify(root, ['--base', base, '--format', 'json']);
    const report = reportOf(run);
    expect(report.findings).toEqual([]);
    expect(report.verdict).toBe('pass');
    expect(run.status).toBe(0);
  });
});
