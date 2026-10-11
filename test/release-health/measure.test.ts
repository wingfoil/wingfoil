/**
 * task-231 — `scripts/release-health/measure.cjs`, the history half of `release-health.measure` (`dl-089` §1, §2, §6):
 * the window and snapshot metrics read from git at an immutable measurement point (G01–G16), the process-conformance
 * measures of `REQ-STATE-10` (P01–P07, `dl-131` Decision 3), the external visibility snapshot (E01–E05, `dl-130`
 * Q2 (a)), and the toolchain record.
 *
 * Every figure is a known answer on a throwaway fixture repository whose commits are listed, in order, in the ledger
 * of `historyFixture` below: identities and dates go per command (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`), never through
 * `git config` (`dl-089` §6). The `REQ-STATE-10` scenarios of `P1.2-versioning-audit-trail.feature` (tag
 * `@REQ-STATE-10`) are exercised by the "Process conformance" blocks: a clean range reports nothing, and a range
 * with one injected defect of each kind 1–5 reports exactly that defect.
 *
 * Deterministic: every date is fixed; the external reader is a stub; no clock, no network.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatReportJson, httpDay, main, measureRelease, parseHttp, processConformance, resolveMeasurementPoint } from '../../scripts/release-health/measure.cjs';
import type { ExternalReader, MetricEntry, Report } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { FAKE_AWS_ACCESS_KEY_ID } from '../validation/helpers/secret-fixtures';

const REPO_ROOT = join(__dirname, '..', '..');
const CATALOGUE = readFileSync(join(REPO_ROOT, 'docs', '08_health', 'metrics.yaml'), 'utf-8');

interface Who {
  readonly name: string;
  readonly email: string;
}
const ADA: Who = { name: 'Ada Approver', email: 'ada@wingfoil.dev' };
const DEV: Who = { name: 'Dev Eloper', email: 'dev@wingfoil.dev' };
const OUT: Who = { name: 'Out Sider', email: 'out@wingfoil.dev' };

const DAY1 = '2026-09-01T10:00:00+00:00';
const DAY2 = '2026-09-02T10:00:00+00:00';
const DAY0 = '2026-08-30T10:00:00+00:00';

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
  decision-log:
    path: "docs/memory/dls/{id}.md"
    states:
      sequence: [draft, in-discussion, ready]
      gates:
        in-discussion: { reject: draft }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [draft, active, done]
  release:
    path: "docs/memory/release/{id}.md"
    states:
      sequence: [draft, planning, in-development, releasing, released]
`;

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
    - name: ${ADA.name}
      email: ${ADA.email}
      roles: [ approver, developer ]
    - name: ${DEV.name}
      email: ${DEV.email}
      roles: [ developer ]
  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer, qa ]
      approval_authority: false
  roles:
    - name: approver
    - name: developer
    - name: qa
paths:
  sources: [ src/ ]
  tests: [ test/ ]
  health: [ docs/08_health/ ]
  runs: [ docs/06_runs/ ]
`;

const DEMO_WORKFLOW = `name: demo
kind: sub
version: 1.0
element: release
phases:
  - name: red
    role: qa
  - name: green
    role: developer
    distinct_from: [red]
  - name: build
    role: developer
    produces:
      - "docs/out/rel-{release.version}-report.md"
      - "docs/out/present.md"
      - "docs/{id}.md"
      - { type: task, path: "docs/memory/task/{task.id}.md" }
`;

const PACKAGE_JSON = `${JSON.stringify({ name: 'wingfoil', version: '0.2.1', repository: { type: 'git', url: 'git+https://github.com/wingfoil/wingfoil.git' } }, null, 2)}\n`;
const PACKAGE_LOCK = `${JSON.stringify({ name: 'wingfoil', lockfileVersion: 3, packages: {} }, null, 2)}\n`;

const RELEASE_DOC = '---\nid: "minor-v0.2"\ntype: release\ntitle: "v0.2"\nstatus: released\nversion: "v0.2"\nrelease-line: "v1"\n---\n\nScope.\n';
const DL_DOC = (status: string): string => `---\nid: "dl-117-ai"\ntype: decision-log\ntitle: "AI attribution"\nstatus: ${status}\n---\n\nThe rule.\n`;

/** The base configuration commit: everything the measures read at the point, outside the window. */
const BASE_FILES: Readonly<Record<string, string>> = {
  '.wingfoil/memory.yaml': MEMORY_YAML,
  '.wingfoil/dna.yaml': DNA_YAML,
  '.wingfoil/workflows/custom/demo.yaml': DEMO_WORKFLOW,
  'docs/08_health/metrics.yaml': CATALOGUE,
  'docs/01_vision/06_features.md': '# Features\n\n| P1.1 | Memory |\n| P1.2 | Audit trail |\n',
  'docs/02_requirements/03_sard/01_architecture.md': '# SARD\n\n### REQ-SYS-01 — Git-backed\n',
  'docs/02_requirements/01_user_story_map/01_map.md': '# Map\n\n* US-1-01: As Morgan, I want it.\n',
  'docs/out/present.md': 'Present.\n',
  'docs/02_requirements/02_bdd/features/p1-memory/P1.1-storage.feature': 'Feature: P1.1\n',
  'docs/out/rel-v0.2-report.md': 'Report.\n',
  'docs/memory/release/minor-v0.2.md': RELEASE_DOC,
  'docs/memory/dls/dl-117-ai.md': DL_DOC('in-discussion'),
  'package.json': PACKAGE_JSON,
  'package-lock.json': PACKAGE_LOCK,
};

interface CommitSpec {
  readonly author?: Who;
  readonly date?: string;
  readonly body?: string;
  readonly files?: Readonly<Record<string, string>>;
}

interface Repo {
  readonly root: string;
  commit(subject: string, spec?: CommitSpec): string;
  rev(rev: string): string;
}

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));

function repo(): Repo {
  const root = makeTempGitRepo();
  repos.push(root);
  const commit: Repo['commit'] = (subject, spec = {}) => {
    const author = spec.author ?? DEV;
    const date = spec.date ?? DAY2;
    for (const [path, content] of Object.entries(spec.files ?? {})) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    const message = spec.body === undefined ? subject : `${subject}\n\n${spec.body}`;
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=verbatim', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_COMMITTER_DATE: date,
      },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const rev: Repo['rev'] = (name) => git(root, ['rev-parse', name]).trim();
  return { root, commit, rev };
}

function taskDoc(id: string, status: string, extra = '', body = 'Revision.'): string {
  return `---\nid: "${id}"\ntype: task\ntitle: "Task ${id}"\nstatus: ${status}\nref: "dl-117"\n${extra}---\n\n${body}\n`;
}

function planDoc(status: string): string {
  return `---\nid: "demo-plan"\ntype: plan\ntitle: "Demo"\nstatus: ${status}\nworkflow: "demo"\nphase: "build"\nelement: "minor-v0.2"\nrelease: "v0.2"\n---\n\nSteps.\n`;
}

function runRecord(phase: string, role: string, session: string): string {
  return JSON.stringify({ id: `task-001-alpha/${phase}/1`, element: 'task:task-001-alpha', workflow: 'demo', phase, role, mode: 'fresh', agent: 'Claude', adapter: 'built-in/claude', agent_version: 'not-reported', model: 'not-reported', session, tokens: { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' }, wingfoil: '0.3.0 (abc1234)', state_ref: '0'.repeat(40), duration_ms: 1, exit_status: 0, result: 'PASS', notes: 'none' });
}

const APPROVAL = (reason: string): string => `Approver: ${ADA.name} <${ADA.email}> (approver)\nReason: ${reason}`;
const STAMP = 'WingFoil-Version: 0.3.0 (abc1234)';
const CLAUDE = 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-test';

const TASK_BODY = '**Features:** P1.1, P9.9\n\nImplements REQ-SYS-01 for US-1-01.';
const TASK_EXTRA = 'depends_on: ["task-009-missing"]\n';

interface History {
  readonly repo: Repo;
  readonly base: string;
  readonly point: string;
  /** The window's non-merge commits, by ledger number (1-based). */
  readonly c: readonly string[];
}

/**
 * The history fixture. Ledger of the window's twenty non-merge commits (`base..point`), with what each one is
 * built to show:
 *
 *  1 feat(core) DEV d1  body + pre-ratification Co-Authored-By  src/a.ts +3   code, cites task-001
 *  2 fix        DEV d1  no body                                 src/b.ts +600 code, cites nothing (G05), > 500 (G03)
 *  3 Update…    OUT d1  no body, not conventional (G01)         README.md +1  unknown identity (G07)
 *  4 wf(dl) approve dl-117 [in-discussion → ready] ADA d1       the dl-117 rule's ratification (G08)
 *  5 wf(task) add      DEV d1  trailer only (no body), signed (G16)
 *  6 wf(task) submit   DEV d2  body + signed (G16)
 *  7 wf(task) approve [pending → backlog] ADA d2  well-formed
 *  8 wf(task) start [backlog → in-progress] DEV d2  Claude + AI-Model trailer only (conforming, no body)
 *  9 wf(task) approve [in-progress → in-review] ADA d2  no Approver (G06, P01), Claude trailers (approve with AI)
 * 10 wf(task) schedule  DEV d2  empty, verb outside the grammar (G09, P01), Co-Authored-By Bob (not conforming)
 * 11 wf(task) approve [in-review -> approved] ADA d2  ASCII arrow (G10, P01)
 * 12 feat(core) DEV d2  body, src/d.ts +2 and docs/d.md +1    code touching docs (G12)
 * 13 chore      DEV d2  body, config/keys.txt +1               a secret-shaped line (G14)
 * 14 wf(plan) add       DEV d2
 * 15 wf(plan) submit    DEV d2
 * 16 wf(plan) finalize [active → done] DEV d2  the build phase recorded complete (P03)
 * 17 docs(memory) …     DEV d2  body, subject > 72 (G04)      docs/notes.md +1
 * 18 agent: record      DEV d2  run log: red and green share a session (P05)
 * 19 feat(core) on task/t1  DEV d2  body, src/c.ts +1
 * 20 docs: note on main      DEV d2  docs/note2.md +1
 * then `Merge branch 'main' into task/t1` (G11 back-merge) and `Merge branch 'task/t1'` = the point.
 *
 * Outside the window: branch `stale` (from the base, day 0) allocates task-001 a second time (G15), and
 * `refs/remotes/origin/old` points at it, unmerged and older than the point (G15).
 */
function historyFixture(): History {
  const r = repo();
  const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
  const c: string[] = [];
  c.push(r.commit('feat(core): add the a module (task-001)', { date: DAY1, body: 'Adds a.\n\nCo-Authored-By: Someone <someone@wingfoil.dev>', files: { 'src/a.ts': 'a\nb\nc\n' } }));
  c.push(r.commit('fix: tweak b', { date: DAY1, files: { 'src/b.ts': 'x\n'.repeat(600) } }));
  c.push(r.commit('Update readme', { author: OUT, date: DAY1, files: { 'README.md': 'Readme.\n' } }));
  c.push(r.commit('wf(decision-log): approve dl-117-ai [in-discussion → ready]', { author: ADA, date: DAY1, body: APPROVAL('Ratified.'), files: { 'docs/memory/dls/dl-117-ai.md': DL_DOC('ready') } }));
  const doc = (status: string): Record<string, string> => ({ 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', status, TASK_EXTRA, TASK_BODY) });
  c.push(r.commit('wf(task): add task-001-alpha', { date: DAY1, body: STAMP, files: doc('draft') }));
  c.push(r.commit('wf(task): submit task-001-alpha', { body: `Carries content: the body.\n\n${STAMP}`, files: doc('pending') }));
  c.push(r.commit('wf(task): approve task-001-alpha [pending → backlog]', { author: ADA, body: APPROVAL('Ready.'), files: doc('backlog') }));
  c.push(r.commit('wf(task): start task-001-alpha [backlog → in-progress]', { body: CLAUDE, files: doc('in-progress') }));
  c.push(r.commit('wf(task): approve task-001-alpha [in-progress → in-review]', { author: ADA, body: `Reason: Looks fine.\n\n${CLAUDE}`, files: doc('in-review') }));
  c.push(r.commit('wf(task): schedule task-001-alpha', { body: 'Co-Authored-By: Bob <bob@wingfoil.dev>' }));
  c.push(r.commit('wf(task): approve task-001-alpha [in-review -> approved]', { author: ADA, body: APPROVAL('Done right.'), files: doc('approved') }));
  c.push(r.commit('feat(core): code and docs (task-001)', { body: 'Both.', files: { 'src/d.ts': 'd\ne\n', 'docs/d.md': 'D.\n' } }));
  c.push(r.commit('chore: add credentials', { body: 'Oops.', files: { 'config/keys.txt': `aws_key = ${FAKE_AWS_ACCESS_KEY_ID}\n` } }));
  c.push(r.commit('wf(plan): add demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('draft') } }));
  c.push(r.commit('wf(plan): submit demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('active') } }));
  // The build phase's report goes missing before the plan records the phase complete.
  git(r.root, ['rm', '--quiet', 'docs/out/rel-v0.2-report.md']);
  c.push(r.commit('wf(plan): finalize demo-plan [active → done]', { files: { 'docs/plans/demo-plan.md': planDoc('done') } }));
  c.push(r.commit('docs(memory): a deliberately long subject line that runs well past the seventy-two characters', { body: 'Long.', files: { 'docs/notes.md': 'Notes.\n' } }));
  c.push(r.commit('agent: record task-001-alpha/green/1', { files: { 'docs/06_runs/task-001-alpha.jsonl': `${runRecord('red', 'qa', 's-1')}\n${runRecord('green', 'developer', 's-1')}\n` } }));
  git(r.root, ['checkout', '--quiet', '-b', 'task/t1']);
  c.push(r.commit('feat(core): more (task-001)', { body: 'More.', files: { 'src/c.ts': 'c\n' } }));
  git(r.root, ['checkout', '--quiet', 'main']);
  c.push(r.commit('docs: note', { files: { 'docs/note2.md': 'Note.\n' } }));
  const env = { ...process.env, GIT_AUTHOR_NAME: DEV.name, GIT_AUTHOR_EMAIL: DEV.email, GIT_AUTHOR_DATE: DAY2, GIT_COMMITTER_NAME: DEV.name, GIT_COMMITTER_EMAIL: DEV.email, GIT_COMMITTER_DATE: DAY2 };
  git(r.root, ['checkout', '--quiet', 'task/t1']);
  execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', 'main'], { cwd: r.root, env });
  git(r.root, ['checkout', '--quiet', 'main']);
  execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', 'task/t1'], { cwd: r.root, env });
  const point = r.rev('HEAD');
  // Outside the window: a branch that allocates task-001 again, and a stale remote-tracking ref to it.
  git(r.root, ['checkout', '--quiet', '-b', 'stale', base]);
  const stale = r.commit('wf(task): add task-001-other', { date: DAY0, files: { 'docs/memory/task/task-001-other.md': taskDoc('task-001-other', 'draft') } });
  git(r.root, ['update-ref', 'refs/remotes/origin/old', stale]);
  git(r.root, ['checkout', '--quiet', 'main']);
  return { repo: r, base, point, c };
}

/** A light fixture — the base configuration and two commits — for the tests that do not read the history ledger. */
function lightFixture(): { repo: Repo; base: string; point: string } {
  const r = repo();
  const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
  r.commit('feat(core): add the a module (task-001)', { body: 'Adds a.', files: { 'src/a.ts': 'a\n' } });
  const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
  return { repo: r, base, point };
}

function entry(report: Report, id: string): MetricEntry {
  const found = report.metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} in the report`);
  return found;
}

const OFFLINE = { offline: true } as const;

describe('measureRelease — the history metrics on a fixture with known answers (AC 1, AC 5)', () => {
  const h = historyFixture();
  const report = measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
  const c = (n: number): string => h.c[n - 1]!;

  it('writes one entry per catalogue metric, in catalogue order, each measured or with a reason', () => {
    const ids = [...CATALOGUE.matchAll(/^ {2}- id: ([A-Z][0-9]{2})$/gm)].map((m) => m[1]);
    expect(report.metrics.map((m) => m.id)).toEqual(ids);
    for (const m of report.metrics) {
      if (m.status === 'measured') expect(m).toHaveProperty('value');
      else expect(typeof m.reason).toBe('string');
    }
    expect(report.schema_version).toBe(1);
    expect(report.catalogue_version).toBe(2);
    expect(report.measurement_point).toEqual({ ref: h.point, commit: h.point, basis: 'released-transition' });
    expect(report.release).toEqual({ id: 'minor-v0.2', version: 'v0.2', kind: 'minor' });
  });

  it('G01 — conventional subjects, with raw counts and the failing commit named', () => {
    expect(entry(report, 'G01')).toMatchObject({ status: 'measured', value: 95, raw: { conforming: 19, total: 20 }, items: 20, small_sample: true, failing: [c(3)] });
  });

  it('G02 — commit bodies, trailer lines excluded', () => {
    expect(entry(report, 'G02')).toMatchObject({ value: 50, raw: { with_body: 10, total: 20 }, items: 20, small_sample: true });
  });

  it('G03 — lines changed per non-merge commit: median, p90, share above 500', () => {
    const g03 = entry(report, 'G03');
    expect(g03.raw).toMatchObject({ commits: 20, over_500: 1 });
    expect(g03.value).toMatchObject({ share_over_500: 5 });
    expect(typeof (g03.value as { median: number }).median).toBe('number');
  });

  it('G04 — subject length: mean, share above 72', () => {
    const subjects = git(h.repo.root, ['log', '--no-merges', '--format=%s', `${h.base}..${h.point}`]).trim().split('\n');
    const mean = Math.round((subjects.reduce((sum, s) => sum + [...s].length, 0) / subjects.length) * 100) / 100;
    expect(entry(report, 'G04')).toMatchObject({ value: { mean, share_over_72: 5 }, raw: { over_72: 1, total: 20 }, failing: [c(17)] });
  });

  it('G05 — code commits citing a task or bug id', () => {
    expect(entry(report, 'G05')).toMatchObject({ value: 75, raw: { citing: 3, total: 4 }, failing: [c(2)] });
  });

  it('G06 — approve and reject commits carrying Approver: and a non-blank Reason:', () => {
    expect(entry(report, 'G06')).toMatchObject({ value: 75, raw: { conforming: 3, total: 4 }, failing: [c(9)] });
  });

  it('G07 — commits whose author or committer is not a team.members entry', () => {
    expect(entry(report, 'G07')).toMatchObject({ value: 1, raw: { failing: 1, total: 22 }, failing: [c(3)] });
  });

  it('G08 — AI attribution judged against dl-117\'s rule from its ratification on (AC 5)', () => {
    expect(entry(report, 'G08')).toMatchObject({
      value: {
        conforming_share: 66.67,
        approve_reject_with_ai: 1,
        distinct_trailers: [
          'AI-Model: claude-test',
          'Co-Authored-By: Bob <bob@wingfoil.dev>',
          'Co-Authored-By: Claude <noreply@anthropic.com>',
          'Co-Authored-By: Someone <someone@wingfoil.dev>',
        ],
      },
      raw: { judged: 3, conforming: 2, before_rule: 1, approve_reject_with_ai: 1, ratified_at: c(4) },
      failing: [c(9), c(10)],
    });
  });

  it('G09 — wf() commits using a verb outside the declared grammar', () => {
    expect(entry(report, 'G09')).toMatchObject({ value: 9.09, raw: { outside: 1, total: 11 }, failing: [c(10)] });
  });

  it('G10 — wf() brackets using the canonical arrow', () => {
    expect(entry(report, 'G10')).toMatchObject({ value: 83.33, raw: { canonical: 5, total: 6 }, failing: [c(11)] });
  });

  it('G11 — back-merges per task branch merged', () => {
    expect(entry(report, 'G11')).toMatchObject({ value: 1, raw: { back_merges: 1, task_branches_merged: 1 } });
  });

  it('G12 — code commits that also touch docs/', () => {
    expect(entry(report, 'G12')).toMatchObject({ value: 25, raw: { touching_docs: 1, total: 4 } });
  });

  it('G13 — share of wf() commits; commits per active day', () => {
    expect(entry(report, 'G13')).toMatchObject({ value: { wf_share: 55, per_active_day: 10 }, raw: { wf: 11, total: 20, active_days: 2 } });
  });

  it('G14 — secrets the spec-007 scanner finds in the window\'s diffs', () => {
    const g14 = entry(report, 'G14');
    expect(g14).toMatchObject({ value: 1, raw: { blocking: 1 } });
    expect(g14.failing).toEqual([`${c(13)} config/keys.txt aws-access-key-id`]);
  });

  it('G15 — unmerged remote branches older than the release, and ids allocated twice across refs (AC 5, dl-101)', () => {
    expect(entry(report, 'G15')).toMatchObject({
      value: { stale_branches: 1, duplicate_ids: 1 },
      failing: ['refs/remotes/origin/old', 'task-001: task-001-alpha, task-001-other'],
    });
  });

  it('G16 — wf() commits signed with the WingFoil-Version trailer (AC 5, dl-111)', () => {
    expect(entry(report, 'G16')).toMatchObject({ value: 18.18, raw: { signed: 2, total: 11 } });
  });

  it('P01–P05 — each check counts items and names every failing item', () => {
    expect(entry(report, 'P01')).toMatchObject({ raw: { checked: 11 }, failing: [expect.stringContaining(c(9)), expect.stringContaining(c(10)), expect.stringContaining(c(11))] });
    expect(entry(report, 'P03')).toMatchObject({ value: 1, raw: { checked: 2, failing: 1, unresolved: 1 }, failing: ['demo-plan: docs/out/rel-v0.2-report.md'] });
    expect(entry(report, 'P04')).toMatchObject({ value: 2, raw: { checked: 6, failing: 2 }, failing: ['task-001-alpha: depends_on task-009-missing', 'task-001-alpha: feature P9.9'] });
    expect(entry(report, 'P05')).toMatchObject({ value: 1, failing: ['task-001-alpha/green/1: shares session s-1 with task-001-alpha/red/1 (distinct_from red)'] });
  });

  it('P06 and D01 need the benchmark runs; P07 is the measure\'s own byte-identity', () => {
    expect(entry(report, 'P06')).toMatchObject({ status: 'not-measurable' });
    expect(entry(report, 'D01')).toMatchObject({ status: 'not-measurable' });
    expect(entry(report, 'P07')).toMatchObject({ status: 'measured', value: true });
  });

  it('the quality metrics are left to their owning tasks, each with the reason', () => {
    expect(entry(report, 'Q01')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('task-232') });
    expect(entry(report, 'Q05')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('task-233') });
  });

  it('every percentage carries its raw counts (dl-089 §6)', () => {
    for (const id of ['G01', 'G02', 'G05', 'G06', 'G09', 'G10', 'G12', 'G16']) {
      expect(Object.keys(entry(report, id).raw ?? {}).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is byte-identical on a second run at the same point (REQ-SYS-07)', () => {
    const again = measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
    expect(formatReportJson(again)).toBe(formatReportJson(report));
  });
});

describe('small-sample flag (dl-089 §3)', () => {
  it('is false once a window holds 30 relevant items', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
    for (let i = 0; i < 30; i += 1) r.commit(`docs: note ${i}`, { files: { [`docs/n${i}.md`]: `${i}\n` } });
    const report = measureRelease(r.root, { release: 'v0.2', at: r.rev('HEAD'), previous: base, ...OFFLINE });
    expect(entry(report, 'G01')).toMatchObject({ items: 30, small_sample: false, value: 100 });
  });
});

describe('the measurement point (dl-089 §1)', () => {
  it('is the highest tag of the release\'s version that no other release owns, else the released transition', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
    const tagged0 = r.commit('docs: one', { files: { 'docs/one.md': '1\n' } });
    git(r.root, ['tag', 'v0.2.0', tagged0]);
    const tagged1 = r.commit('docs: two', { files: { 'docs/two.md': '2\n' } });
    git(r.root, ['tag', 'v0.2.1', tagged1]);
    // v0.2.2 is another release's version (a patch), so it is never v0.2's point.
    git(r.root, ['tag', 'v0.2.2', r.commit('docs: three', { files: { 'docs/memory/release/patch-v0.2.2.md': RELEASE_DOC.replace(/minor-v0\.2/g, 'patch-v0.2.2').replace('version: "v0.2"', 'version: "v0.2.2"') } })]);
    expect(base).not.toBe(tagged1);
    expect(resolveMeasurementPoint(r.root, 'v0.2')).toEqual({ ref: 'v0.2.1', commit: tagged1, basis: 'published-tag' });
    expect(resolveMeasurementPoint(r.root, 'v0.2.2')).toEqual({ ref: 'v0.2.2', commit: r.rev('v0.2.2'), basis: 'published-tag' });
  });

  it('falls back to the commit carrying the release\'s released transition when no tag exists', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: { ...BASE_FILES, 'docs/memory/release/minor-v0.2.md': RELEASE_DOC.replace('released', 'releasing') } });
    const released = r.commit('wf(release): approve minor-v0.2 [releasing → released]', { author: ADA, body: APPROVAL('Shipped.'), files: { 'docs/memory/release/minor-v0.2.md': RELEASE_DOC } });
    r.commit('docs: after', { files: { 'docs/after.md': 'a\n' } });
    expect(base).not.toBe(released);
    expect(resolveMeasurementPoint(r.root, 'v0.2')).toEqual({ ref: released, commit: released, basis: 'released-transition' });
    expect(() => resolveMeasurementPoint(r.root, 'v0.9')).toThrow('no release element at HEAD has version v0.9');
  });
});

describe('never writes git configuration (AC 2, dl-089 §6)', () => {
  it('leaves `git config --list --show-origin` byte-identical, and leaves no worktree behind', () => {
    const h = lightFixture();
    const before = git(h.repo.root, ['config', '--list', '--show-origin']);
    const worktreesBefore = git(h.repo.root, ['worktree', 'list', '--porcelain']);
    measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
    expect(git(h.repo.root, ['config', '--list', '--show-origin'])).toBe(before);
    expect(git(h.repo.root, ['worktree', 'list', '--porcelain'])).toBe(worktreesBefore);
  });
});

describe('the toolchain record (AC 4)', () => {
  const h = lightFixture();
  const report = measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });

  it('records the Node and npm versions and the sha256 of the lockfile at the point', () => {
    expect(report.toolchain.node).toBe(process.version);
    expect(report.toolchain.npm).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.toolchain.lockfile_sha256).toBe(createHash('sha256').update(PACKAGE_LOCK).digest('hex'));
  });

  it('the release-health scripts are not in the npm tarball (characterization)', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = (JSON.parse(raw) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
    expect(files.filter((path) => path.startsWith('scripts/'))).toEqual([]);
  });
});

describe('the external snapshot E01–E05 (AC 3, dl-130 Q2 (a))', () => {
  const h = lightFixture();
  const DATE = 'Fri, 09 Oct 2026 10:00:00 GMT';
  const reader: ExternalReader = (source) => {
    if (source.target === 'repos/wingfoil/wingfoil') return { ok: true, date: DATE, body: { stargazers_count: 12, forks_count: 3, subscribers_count: 4 } };
    if (source.target.endsWith('/traffic/views')) return { ok: false, error: 'HTTP 403: Must have push access to repository' };
    if (source.target.endsWith('/traffic/clones')) return { ok: true, date: DATE, body: { count: 7, uniques: 5 } };
    if (source.target.includes('last-week')) return { ok: true, date: DATE, body: { downloads: 40 } };
    return { ok: true, date: DATE, body: { downloads: 150 } };
  };

  it('offline, every E metric is not-measurable with the reason', () => {
    const report = measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, offline: true });
    for (const id of ['E01', 'E02', 'E03', 'E04', 'E05']) expect(entry(report, id)).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('offline') });
  });

  const online = measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, external: reader });

  it('online, each value is recorded with the command and the date it was read (the response\'s Date header)', () => {
    const report = online;
    expect(entry(report, 'E01')).toMatchObject({ status: 'measured', value: 12, evidence: { command: 'gh api repos/wingfoil/wingfoil', read_on: '2026-10-09' } });
    expect(entry(report, 'E02')).toMatchObject({ value: 3 });
    expect(entry(report, 'E03')).toMatchObject({ value: 4 });
    expect(entry(report, 'E05')).toMatchObject({ value: { last_week: 40, last_month: 150 }, evidence: { read_on: '2026-10-09' } });
    expect(entry(report, 'E05').evidence?.command).toContain('https://api.npmjs.org/downloads/point/last-week/wingfoil');
  });

  it('a read that fails is not-measurable with what failed, never a zero', () => {
    const report = online;
    expect(entry(report, 'E04')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('HTTP 403') });
  });
});

/**
 * REQ-STATE-10 (`P1.2-versioning-audit-trail.feature`, `@REQ-STATE-10`): a clean range reports no failing item on
 * any check, and a range with one injected defect of kind 1–5 reports exactly that defect, on its own check.
 */
describe('Process conformance (REQ-STATE-10, P1.2 @REQ-STATE-10 scenarios)', () => {
  /** A clean range: a task through add → submit → approve, a phase plan to done with its produces, clean run records. */
  function clean(): { r: Repo; base: string } {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
    const doc = (status: string, extra = ''): Record<string, string> => ({ 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', status, extra, '**Features:** P1.1') });
    r.commit('wf(task): add task-001-alpha', { files: doc('draft') });
    r.commit('wf(task): submit task-001-alpha', { files: doc('pending') });
    r.commit('wf(task): approve task-001-alpha [pending → backlog]', { author: ADA, body: APPROVAL('Ready.'), files: doc('backlog') });
    r.commit('wf(plan): add demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('draft') } });
    r.commit('wf(plan): submit demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('active') } });
    r.commit('wf(plan): finalize demo-plan [active → done]', { files: { 'docs/plans/demo-plan.md': planDoc('done') } });
    r.commit('agent: record task-001-alpha/green/1', { files: { 'docs/06_runs/task-001-alpha.jsonl': `${runRecord('red', 'qa', 's-1')}\n${runRecord('green', 'developer', 's-2')}\n` } });
    return { r, base };
  }

  function failingByCheck(root: string, base: string): Record<string, readonly string[]> {
    const p = processConformance(root, git(root, ['rev-parse', 'HEAD']).trim(), base);
    return Object.fromEntries(p.map((m) => [m.id, m.failing ?? []]));
  }

  const NONE = { P01: [], P02: [], P03: [], P04: [], P05: [] };

  it('a clean range reports, for every check, the items checked and no failing item', () => {
    const { r, base } = clean();
    const p = processConformance(r.root, r.rev('HEAD'), base);
    expect(p.map((m) => m.id)).toEqual(['P01', 'P02', 'P03', 'P04', 'P05', 'P06']);
    expect(Object.fromEntries(p.map((m) => [m.id, m.failing ?? []]))).toMatchObject(NONE);
    for (const m of p.slice(0, 5)) expect(m.raw).toHaveProperty('checked');
  });

  it('Process conformance names every failing item — kind 1: a wf(task): approve with no Approver: line', () => {
    const { r, base } = clean();
    const bad = r.commit('wf(task): start task-001-alpha [backlog → in-progress]', { author: ADA, files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'in-progress', '', '**Features:** P1.1') } });
    const worse = r.commit('wf(task): approve task-001-alpha [in-progress → in-review]', { author: ADA, body: 'Reason: Fine.', files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'in-review', '', '**Features:** P1.1') } });
    const failing = failingByCheck(r.root, base);
    expect(bad).not.toBe(worse);
    expect(failing['P01']).toEqual([expect.stringMatching(new RegExp(`^${worse} `))]);
    expect({ ...failing, P01: [] }).toMatchObject(NONE);
  });

  it.each([
    ['2', 'an illegal transition', (r: Repo) => r.commit('wf(task): submit task-001-alpha', { files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'in-review', '', '**Features:** P1.1') } }), 'P02'],
    ['3', 'a phase recorded complete with a produces artifact absent', (r: Repo) => { git(r.root, ['rm', '--quiet', 'docs/out/present.md']); return r.commit('docs: drop the produced file'); }, 'P03'],
    ['4', 'a broken traceability link', (r: Repo) => r.commit('wf(task): add task-002-beta', { files: { 'docs/memory/task/task-002-beta.md': taskDoc('task-002-beta', 'draft', '', '**Features:** P7.7') } }), 'P04'],
    ['5', 'a phase run by the same session as one it must be distinct from', (r: Repo) => r.commit('agent: record task-001-alpha/green/2', { files: { 'docs/06_runs/task-001-alpha.jsonl': `${runRecord('red', 'qa', 's-1')}\n${runRecord('green', 'developer', 's-2')}\n${runRecord('green', 'developer', 's-1').replace('/green/1', '/green/2')}\n` } }), 'P05'],
  ])('Process conformance names every failing item — kind %s: %s', (_kind, _what, inject, check) => {
    const { r, base } = clean();
    inject(r);
    const failing = failingByCheck(r.root, base);
    expect(failing[check]).toHaveLength(1);
    expect({ ...failing, [check]: [] }).toMatchObject(NONE);
  });

  it('a frontmatter REQ or feature id resolves as one, and a .feature path resolves from the BDD folder', () => {
    const { r, base } = clean();
    r.commit('wf(task): add task-003-gamma', { files: { 'docs/memory/task/task-003-gamma.md': taskDoc('task-003-gamma', 'draft', '', 'Scenarios in p1-memory/P1.1-storage.feature.').replace('ref: "dl-117"', 'ref: "REQ-SYS-01"') } });
    const p04 = processConformance(r.root, r.rev('HEAD'), base).find((m) => m.id === 'P04')!;
    expect(p04.failing).toEqual([]);
    expect(p04.raw).toMatchObject({ checked: 4 });
  });

  it('a commit made before the configuration existed is unchecked, not failing; a free-text produces entry is unresolved', () => {
    const r = repo();
    const first = r.commit('wf(task): add task-001-alpha', { date: DAY0, files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'draft') } });
    // The configuration alone, no Memory document: a non-wf() commit creating one would be a P02 finding of its own.
    const config = Object.fromEntries(Object.entries(BASE_FILES).filter(([path]) => !path.startsWith('docs/memory/')));
    r.commit('chore: configure wingfoil', { author: ADA, files: { ...config, '.wingfoil/workflows/custom/demo.yaml': DEMO_WORKFLOW.replace('"docs/out/present.md"', '"the release notes, in words"') } });
    r.commit('wf(plan): add demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('draft') } });
    r.commit('wf(plan): submit demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('active') } });
    r.commit('wf(plan): finalize demo-plan [active → done]', { files: { 'docs/plans/demo-plan.md': planDoc('done') } });
    const p = processConformance(r.root, r.rev('HEAD'), null);
    const byId = Object.fromEntries(p.map((m) => [m.id, m]));
    expect(byId['P02']).toMatchObject({ failing: [], raw: { unchecked: 1 } });
    // The plan's element is absent, so the report path keeps its token; the free text and `{id}` are unresolved too.
    expect(byId['P03']).toMatchObject({ failing: [], raw: { checked: 0, unresolved: 3 } });
    expect(first).toMatch(/^[0-9a-f]{40}$/);
  });

  it('Process conformance is byte-identical on a rerun', () => {
    const { r, base } = clean();
    const head = r.rev('HEAD');
    expect(JSON.stringify(processConformance(r.root, head, base))).toBe(JSON.stringify(processConformance(r.root, head, base)));
  });
});

describe('the HTTP reading of the external snapshot', () => {
  it('reads the status, the Date header and the JSON body, skipping an interim 100 response', () => {
    const text = 'HTTP/1.1 100 Continue\r\n\r\nHTTP/2.0 200 OK\r\nDate: Sat, 10 Oct 2026 08:00:00 GMT\r\n\r\n{"downloads": 9}';
    expect(parseHttp(text)).toEqual({ ok: true, date: 'Sat, 10 Oct 2026 08:00:00 GMT', body: { downloads: 9 } });
    expect(httpDay('Sat, 10 Oct 2026 08:00:00 GMT')).toBe('2026-10-10');
  });

  it('a non-2xx status is a failure naming the status; a malformed date is no day', () => {
    expect(parseHttp('HTTP/2.0 404 Not Found\nDate: x\n\n{"message":"Not Found"}')).toEqual({ ok: false, error: 'HTTP 404: {"message":"Not Found"}' });
    expect(httpDay('yesterday')).toBeNull();
    expect(httpDay(null)).toBeNull();
  });
});

describe('the command line (the release-health.measure binding)', () => {
  it('writes the report where --out says and prints its path; a missing --release is exit 2', () => {
    const h = lightFixture();
    const dir = mkdtempSync(join(tmpdir(), 'wf-rh-out-'));
    const out = join(dir, 'report.json');
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(main(['--release', 'v0.2', '--at', h.point, '--previous', h.base, '--offline', '--root', h.repo.root, '--out', out])).toBe(0);
      expect(write).toHaveBeenCalledWith(`${out}\n`);
      const report = JSON.parse(readFileSync(out, 'utf-8')) as Report;
      expect(report.measurement_point.commit).toBe(h.point);
      expect(main(['--offline'])).toBe(2);
      expect(err).toHaveBeenLastCalledWith('release-health measure: missing required argument: --release <vX.Y[.Z]>\n');
      expect(main(['--release', 'v9'])).toBe(2);
    } finally {
      write.mockRestore();
      err.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
