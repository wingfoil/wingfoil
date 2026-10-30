/**
 * task-241 — the `measure.cjs` follow-ups the task absorbed from `task-231`'s review (F7, F8) and approver ruling A:
 *
 * - F7 (red-first): the report's `previous` says how the window was chosen — `basis: 'report'` with the previous
 *   report's version and path, or `basis: '--previous'` with the revision as given and `report: null` — and both
 *   shapes validate against `docs/08_health/release-health.schema.json`;
 * - F8 (1) (red-first): `--at <rev>` is `published-tag` on a tag, `released-transition` only on the commit carrying
 *   the release's `[… → released]` transition, else `revision`;
 * - F8 (4) (red-first): P04 resolves an element link by its exact id, or by a short id `<prefix>-<n>` exactly one
 *   element carries; a longer partial id, or a short id two elements carry, fails, named;
 * - F8 (5) (characterization): P05 counts an approval made before `.wingfoil/dna.yaml` existed as `unchecked`, not
 *   failing — the coupling of `UNCHECKABLE_RE` to `check-governance.cjs`'s authority message (P02's half is pinned
 *   by measure.test.ts);
 * - ruling A (red-first): G07 is `not-measurable`, with the reason, at a point with no `team.members`.
 * - task-320 AC1 (red-first, `bug-357` (b)): Q14's fallback, the oldest commit adding a decision-log's file, follows
 *   a move: a decision-log added by a plain commit and later moved with `git mv` is aged from the add, not the move.
 *
 * A compact fixture repository of its own (measure.test.ts's builders are not exported): identities and dates go
 * per command, never through `git config` (`dl-089` §6). Deterministic: fixed dates, offline, no toolchain.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';

import { formatReportJson, measureRelease, processConformance, resolveMeasurementPoint } from '../../scripts/release-health/measure.cjs';
import type { MetricEntry, Report } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { FIXTURES, REPO_ROOT } from './helpers/compare-api';

// Every measure runs the static half (task-233), which loads ESLint and TypeScript: the default 5 s is too short.
jest.setTimeout(60_000);

const CATALOGUE = readFileSync(join(REPO_ROOT, 'docs', '08_health', 'metrics.yaml'), 'utf-8');
const ADA = { name: 'Ada Approver', email: 'ada@wingfoil.dev' };
const DEV = { name: 'Dev Eloper', email: 'dev@wingfoil.dev' };
const DAY0 = '2026-08-30T10:00:00+00:00';
const DAY1 = '2026-09-01T10:00:00+00:00';
const POINT_DAY = '2026-09-05T10:00:00+00:00';

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
  release:
    path: "docs/memory/release/{id}.md"
    states:
      sequence: [draft, planning, in-development, releasing, released]
`;

const DNA_YAML = `version: 1.1
modules:
  - name: core
    path: src/core
team:
  members:
    - name: ${ADA.name}
      email: ${ADA.email}
      roles: [ approver, developer ]
    - name: ${DEV.name}
      email: ${DEV.email}
      roles: [ developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
  tests: [ test/ ]
  health: [ docs/08_health/ ]
`;

const RELEASE_DOC = (status: string): string => `---\nid: "minor-v0.2"\ntype: release\ntitle: "v0.2"\nstatus: ${status}\nversion: "v0.2"\nrelease-line: "v1"\n---\n\nScope.\n`;
const DL_DOC = (id: string): string => `---\nid: "${id}"\ntype: decision-log\ntitle: "${id}"\nstatus: ready\n---\n\nThe decision.\n`;
const TASK_DOC = (id: string, ref: string): string => `---\nid: "${id}"\ntype: task\ntitle: "Task ${id}"\nstatus: draft\nref: "${ref}"\n---\n\nRevision.\n`;
const APPROVAL = `Approver: ${ADA.name} <${ADA.email}> (approver)\nReason: Shipped.`;

/** Everything a measure reads at the point, with or without `.wingfoil/dna.yaml`. */
function baseFiles(withDna: boolean): Record<string, string> {
  return {
    '.wingfoil/memory.yaml': MEMORY_YAML,
    ...(withDna ? { '.wingfoil/dna.yaml': DNA_YAML } : {}),
    'docs/08_health/metrics.yaml': CATALOGUE,
    'docs/memory/release/minor-v0.2.md': RELEASE_DOC('releasing'),
    'package.json': `${JSON.stringify({ name: 'wingfoil', version: '0.2.1' }, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify({ name: 'wingfoil', lockfileVersion: 3, packages: {} }, null, 2)}\n`,
  };
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

interface Repo {
  readonly root: string;
  commit(subject: string, spec?: { author?: typeof ADA; date?: string; body?: string; files?: Record<string, string> }): string;
}

function repo(): Repo {
  const root = makeTempGitRepo();
  roots.push(root);
  return {
    root,
    commit(subject, spec = {}) {
      const who = spec.author ?? DEV;
      const date = spec.date ?? DAY1;
      for (const [path, content] of Object.entries(spec.files ?? {})) writeFixtureFile(root, path, content);
      git(root, ['add', '-A']);
      execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=verbatim', '-m', spec.body === undefined ? subject : `${subject}\n\n${spec.body}`], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date },
      });
      return git(root, ['rev-parse', 'HEAD']).trim();
    },
  };
}

function schemaErrors(report: Report): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(join(REPO_ROOT, 'docs', '08_health', 'release-health.schema.json'), 'utf-8')) as object);
  validate(JSON.parse(formatReportJson(report)));
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`);
}

function entry(report: Report, id: string): MetricEntry {
  const found = report.metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} in the report`);
  return found;
}

const OFFLINE = { offline: true, toolchain: false } as const;

describe('F8 (1) — the basis of a point named by --at', () => {
  it('revision on an untagged commit that is not the released transition; released-transition on that commit; published-tag on a tag', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: baseFiles(true) });
    const plain = r.commit('docs: one', { files: { 'docs/one.md': '1\n' } });
    const released = r.commit('wf(release): approve minor-v0.2 [releasing → released]', { author: ADA, body: APPROVAL, files: { 'docs/memory/release/minor-v0.2.md': RELEASE_DOC('released') } });
    const after = r.commit('docs: after', { files: { 'docs/after.md': 'a\n' } });
    expect(new Set([base, plain, released, after]).size).toBe(4);
    expect(resolveMeasurementPoint(r.root, 'v0.2', plain)).toEqual({ ref: plain, commit: plain, basis: 'revision' });
    expect(resolveMeasurementPoint(r.root, 'v0.2', after)).toEqual({ ref: after, commit: after, basis: 'revision' });
    expect(resolveMeasurementPoint(r.root, 'v0.2', released)).toEqual({ ref: released, commit: released, basis: 'released-transition' });
    git(r.root, ['tag', 'v0.2.1', after]);
    expect(resolveMeasurementPoint(r.root, 'v0.2', 'v0.2.1')).toEqual({ ref: 'v0.2.1', commit: after, basis: 'published-tag' });
  });
});

describe('F7 — the previous run, as the report records it', () => {
  it('--previous <rev>: the revision as given, no report, basis --previous; the report validates', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: baseFiles(true) });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    const report = await measureRelease(r.root, { release: 'v0.2', at: point, previous: base, ...OFFLINE });
    expect(report.previous).toEqual({ release: base, commit: base, report: null, basis: '--previous' });
    expect(report.measurement_point.basis).toBe('revision');
    expect(entry(report, 'G07')).toMatchObject({ status: 'measured', value: 0 });
    expect(schemaErrors(report)).toEqual([]);
  });

  it('a previous report found under paths.health: its version, its commit, its path, basis report; the report validates', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: baseFiles(true) });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    const v01 = JSON.parse(readFileSync(join(FIXTURES, 'release-health-v0.1.json'), 'utf-8')) as Report;
    mkdirSync(join(r.root, 'docs', '08_health'), { recursive: true });
    writeFileSync(join(r.root, 'docs', '08_health', 'release-health-v0.1.json'), formatReportJson({ ...v01, measurement_point: { ref: base, commit: base, basis: 'released-transition' } }));
    const report = await measureRelease(r.root, { release: 'v0.2', at: point, ...OFFLINE });
    expect(report.previous).toEqual({ release: 'v0.1', commit: base, report: 'docs/08_health/release-health-v0.1.json', basis: 'report' });
    expect(schemaErrors(report)).toEqual([]);
  });
});

describe('ruling A — G07 at a point with no team.members', () => {
  it('is not-measurable, the reason naming team.members, never a count of every commit', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: baseFiles(false) });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    // The configuration arrives after the point: the working tree has it (paths.health), the point does not.
    r.commit('chore: add dna.yaml', { author: ADA, files: { '.wingfoil/dna.yaml': DNA_YAML } });
    const report = await measureRelease(r.root, { release: 'v0.2', at: point, previous: base, ...OFFLINE });
    expect(entry(report, 'G07')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('team.members') });
    expect(entry(report, 'G07')).not.toHaveProperty('value');
  });
});

describe('F8 (4) — P04 resolves an element link by exact id, or by a short id exactly one element carries', () => {
  it('a short id one element carries and an exact id resolve; a longer partial id and a short id two elements carry fail, named', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', {
      author: ADA,
      date: DAY0,
      files: {
        ...baseFiles(true),
        'docs/memory/dls/dl-117-ai-attribution.md': DL_DOC('dl-117-ai-attribution'),
        'docs/memory/dls/dl-200-alpha.md': DL_DOC('dl-200-alpha'),
        'docs/memory/dls/dl-200-beta.md': DL_DOC('dl-200-beta'),
        'docs/memory/dls/dl-300-solo.md': DL_DOC('dl-300-solo'),
      },
    });
    const tasks: [string, string][] = [
      ['task-002-short', 'dl-300'],
      ['task-003-partial', 'dl-117-ai'],
      ['task-004-ambiguous', 'dl-200'],
      ['task-005-exact', 'dl-117-ai-attribution'],
    ];
    for (const [id, ref] of tasks) r.commit(`wf(task): add ${id}`, { files: { [`docs/memory/task/${id}.md`]: TASK_DOC(id, ref) } });
    const p04 = processConformance(r.root, git(r.root, ['rev-parse', 'HEAD']).trim(), base).find((m) => m.id === 'P04')!;
    expect(p04.raw).toMatchObject({ checked: 4, failing: 2 });
    expect(p04.failing).toEqual([expect.stringMatching(/^task-003-partial: ref dl-117-ai\b/), expect.stringMatching(/^task-004-ambiguous: ref dl-200\b/)]);
  });
});

describe('F8 (5) — P05 and an approval made before dna.yaml existed (characterization)', () => {
  it('is counted unchecked, not failing', () => {
    const r = repo();
    // An approval with no configuration committed before it: no approval authority can be established.
    const first = r.commit('wf(task): approve task-001-alpha [pending → backlog]', { author: ADA, date: DAY0, body: `Approver: ${ADA.name} <${ADA.email}> (approver)\nReason: Ready.`, files: { 'docs/memory/task/task-001-alpha.md': TASK_DOC('task-001-alpha', 'dl-300-solo').replace('status: draft', 'status: backlog') } });
    r.commit('chore: configure wingfoil', { author: ADA, files: { ...baseFiles(true), 'docs/memory/dls/dl-300-solo.md': DL_DOC('dl-300-solo') } });
    const p05 = processConformance(r.root, git(r.root, ['rev-parse', 'HEAD']).trim(), null).find((m) => m.id === 'P05')!;
    expect(p05).toMatchObject({ failing: [], raw: { unchecked: 1, approvals: 1 } });
    expect(first).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('task-320 AC1 — Q14 counts a moved decision-log\'s age from its add, following the rename (bug-357 (b))', () => {
  it('a decision-log added by a plain commit outside the type\'s path, then moved with git mv: aged from the add', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: baseFiles(true) });
    const IN_DISCUSSION = DL_DOC('dl-150-moved').replace('status: ready', 'status: in-discussion');
    // DAY0: added by a plain commit (no `wf(decision-log): add` subject), at a path outside `docs/memory/dls/{id}.md`.
    r.commit('docs: draft dl-150-moved', { date: DAY0, files: { 'docs/drafts/dl-150-moved.md': IN_DISCUSSION } });
    // DAY1: moved into the type's path, content unchanged.
    mkdirSync(join(r.root, 'docs', 'memory', 'dls'), { recursive: true });
    git(r.root, ['mv', 'docs/drafts/dl-150-moved.md', 'docs/memory/dls/dl-150-moved.md']);
    r.commit('docs: move dl-150-moved into the memory', { date: DAY1 });
    const point = r.commit('docs: note', { date: POINT_DAY, files: { 'docs/note.md': 'Note.\n' } });
    expect(git(r.root, ['log', '--format=%s', '--diff-filter=A', point, '--', 'docs/memory/dls/dl-150-moved.md']).trim()).toBe('docs: move dl-150-moved into the memory');
    const report = await measureRelease(r.root, { release: 'v0.2', at: point, previous: base, ...OFFLINE });
    // DAY0 (08-30) → POINT_DAY (09-05) is 6 days; counted from the move (DAY1, 09-01) it would be 4.
    expect(entry(report, 'Q14')).toMatchObject({ status: 'measured', value: { count: 1, median_age_days: 6 }, raw: { in_discussion: 1, oldest_age_days: 6 } });
  });
});
