/**
 * task-185 — the executor attributes `mode` / `distinct_from` and the phase `cadence`
 * (spec-003-workflows-yaml-schema § "Execution independence", § "Recurring phases", § "Diagnostics";
 * `dl-134` §4 (c), `dl-135` points 3–4, `dl-105` R1; spec-003 open questions 3–5, settled by their
 * recommendations at gate 5).
 *
 * The four loader rows fire with their code, severity, file, path and message, on the raw
 * declaration; `cadence` accepts `once` and exactly one recurring trigger (`cron`, a five-field
 * expression, or `on`, a `<memory-type>-<state>` event) and defaults to `once`; the parsed shape is
 * pinned, and no v0.3 code path reads `distinct_from` beyond its validation (spec-003 release
 * boundaries: enforcement is P4.12, v1.0).
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { loadWorkflowsYaml } from '../../src/core/loaders';
import { ValidationError } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

const FILE = 'workflows/custom/main.yaml';

/** Write a one-file manifest whose only workflow is `main` (kind: main) with `phases` (YAML lines). */
function writeMain(root: string, phases: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n');
  writeFixtureFile(root, `.wingfoil/${FILE}`, `name: main\nkind: main\nphases:\n${phases}`);
}

function diagnosticsOf(root: string): Diag[] {
  try {
    loadWorkflowsYaml(root);
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    return (err as { diagnostics?: Diag[] }).diagnostics ?? [];
  }
  throw new Error('expected loadWorkflowsYaml to throw');
}

const err = (path: string, code: string, message: string): Diag => ({ code, severity: 'error', file: FILE, path, message });

describe('spec-003 § Diagnostics — the executor rows (dl-134 §4, dl-135 point 3, OQ4)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('E_PHASE_DISTINCT_FROM_UNKNOWN — an entry naming no phase of the same workflow', () => {
    writeMain(repo, '  - name: red\n    role: qa\n  - name: green\n    role: developer\n    distinct_from: [red, blue]\n');
    expect(diagnosticsOf(repo)).toEqual([
      err('phases[1].distinct_from[1]', 'E_PHASE_DISTINCT_FROM_UNKNOWN', "distinct_from phase 'blue' not found in workflow"),
    ]);
  });

  it('E_PHASE_DISTINCT_FROM_SELF — a phase naming itself', () => {
    writeMain(repo, '  - name: red\n    role: qa\n  - name: green\n    role: developer\n    distinct_from: [red, green]\n');
    expect(diagnosticsOf(repo)).toEqual([
      err('phases[1].distinct_from[1]', 'E_PHASE_DISTINCT_FROM_SELF', "phase 'green' names itself in distinct_from"),
    ]);
  });

  it.each([
    ['reviewer', 'resume'],
    ['reviewer', 'reference'],
    ['qa', 'resume'],
    ['qa', 'reference'],
  ])('E_PHASE_MODE_NOT_INDEPENDENT — role %s declaring mode %s', (role, mode) => {
    writeMain(repo, `  - name: review\n    role: ${role}\n    mode: ${mode}\n`);
    expect(diagnosticsOf(repo)).toEqual([
      err(
        'phases[0].mode',
        'E_PHASE_MODE_NOT_INDEPENDENT',
        `phase 'review' has role '${role}' and must run fresh (mode '${mode}' is not allowed)`,
      ),
    ]);
  });

  it('a reviewer or qa phase may declare mode: fresh, and a developer phase any mode', () => {
    writeMain(
      repo,
      '  - name: red\n    role: qa\n    mode: fresh\n' +
        '  - name: green\n    role: developer\n    mode: resume\n' +
        '  - name: refactor\n    role: developer\n    mode: reference\n' +
        '  - name: review\n    role: reviewer\n    mode: fresh\n    distinct_from: [red, green, refactor]\n',
    );
    expect(() => loadWorkflowsYaml(repo)).not.toThrow();
  });

  it('E_PHASE_EXECUTOR_WITHOUT_ROLE — mode or distinct_from on a phase without role (OQ4), one per field', () => {
    writeMain(
      repo,
      '  - name: build\n    role: developer\n' +
        '  - name: compose\n    mode: fresh\n    distinct_from: [build]\n' +
        '  - name: other\n    distinct_from: [build]\n',
    );
    expect(diagnosticsOf(repo)).toEqual([
      err('phases[1].mode', 'E_PHASE_EXECUTOR_WITHOUT_ROLE', "phase 'compose' declares mode but has no role (it has no executor)"),
      err(
        'phases[1].distinct_from',
        'E_PHASE_EXECUTOR_WITHOUT_ROLE',
        "phase 'compose' declares distinct_from but has no role (it has no executor)",
      ),
      err(
        'phases[2].distinct_from',
        'E_PHASE_EXECUTOR_WITHOUT_ROLE',
        "phase 'other' declares distinct_from but has no role (it has no executor)",
      ),
    ]);
  });

  it('an absent mode never counts as declared (the fresh default is not a declaration)', () => {
    writeMain(repo, '  - name: compose\n  - name: review\n    role: reviewer\n');
    expect(() => loadWorkflowsYaml(repo)).not.toThrow();
  });

  it('per phase, rows come out in table order (unknown, self, not-independent, without-role)', () => {
    writeMain(
      repo,
      '  - name: review\n    role: reviewer\n    mode: resume\n    distinct_from: [review, ghost]\n' +
        '  - name: wrap\n    mode: resume\n    distinct_from: [nowhere]\n',
    );
    expect(diagnosticsOf(repo).map((d) => [d.code, d.path])).toEqual([
      ['E_PHASE_DISTINCT_FROM_UNKNOWN', 'phases[0].distinct_from[1]'],
      ['E_PHASE_DISTINCT_FROM_SELF', 'phases[0].distinct_from[0]'],
      ['E_PHASE_MODE_NOT_INDEPENDENT', 'phases[0].mode'],
      ['E_PHASE_DISTINCT_FROM_UNKNOWN', 'phases[1].distinct_from[0]'],
      ['E_PHASE_EXECUTOR_WITHOUT_ROLE', 'phases[1].mode'],
      ['E_PHASE_EXECUTOR_WITHOUT_ROLE', 'phases[1].distinct_from'],
    ]);
  });
});

describe('OQ5 — mode takes exactly one value', () => {
  it.each([
    ['a list of modes', ['resume', 'reference']],
    ['a single-item list', ['resume']],
    ['an unknown mode', 'replay'],
  ])('refuses %s', (_label, mode) => {
    const result = Workflow.safeParse({ name: 'w', kind: 'main', phases: [{ name: 'p', role: 'developer', mode }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(['phases', 0, 'mode']);
  });

  it.each(['fresh', 'resume', 'reference'])('accepts mode %s', (mode) => {
    const result = Workflow.safeParse({ name: 'w', kind: 'main', phases: [{ name: 'p', role: 'developer', mode }] });
    expect(result.success).toBe(true);
  });

  it('distinct_from is a list of phase names', () => {
    const result = Workflow.safeParse({ name: 'w', kind: 'main', phases: [{ name: 'p', role: 'developer', distinct_from: 'q' }] });
    expect(result.success).toBe(false);
  });
});

describe('cadence — once | { recurring: { cron } | { on } } (dl-105 R1, spec-003 § Recurring phases)', () => {
  const parse = (cadence: unknown) =>
    Workflow.safeParse({ name: 'w', kind: 'main', phases: [{ name: 'p', role: 'developer', cadence }] });

  it.each([
    ['once', 'once'],
    ['a cron trigger', { recurring: { cron: '0 6 * * 1' } }],
    ['a cron trigger with ranges, lists and steps', { recurring: { cron: '*/15 0-6 1,15 * MON-FRI' } }],
    ['an event trigger', { recurring: { on: 'release-released' } }],
    ['an event of a hyphenated type and state (OQ3)', { recurring: { on: 'release-line-in-progress' } }],
  ])('accepts %s', (_label, cadence) => {
    const result = parse(cadence);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phases[0]!.cadence).toEqual(cadence);
  });

  it.each([
    ['two triggers', { recurring: { cron: '0 6 * * 1', on: 'release-released' } }],
    ['no trigger', { recurring: {} }],
    ['an unknown trigger key', { recurring: { every: 'week' } }],
    ['an unknown key beside recurring', { recurring: { on: 'release-released' }, jitter: 5 }],
    ['an unknown literal', 'twice'],
    ['a cron of four fields', { recurring: { cron: '0 6 * *' } }],
    ['a cron of six fields', { recurring: { cron: '0 0 6 * * 1' } }],
    ['a cron with a non-cron character', { recurring: { cron: '0 6 * * $' } }],
    ['an event that is not <memory-type>-<state> (OQ3)', { recurring: { on: 'released' } }],
    ['an event with an empty segment', { recurring: { on: 'release--released' } }],
    ['an event in upper case', { recurring: { on: 'Release-Released' } }],
  ])('refuses %s', (_label, cadence) => {
    const result = parse(cadence);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path.slice(0, 3)).toEqual(['phases', 0, 'cadence']);
  });

  it('names the rule in the message: exactly one trigger', () => {
    const result = parse({ recurring: { cron: '0 6 * * 1', on: 'release-released' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('recurring cadence takes exactly one trigger: cron or on');
    }
  });

  it('defaults to once when absent', () => {
    const result = Workflow.safeParse({ name: 'w', kind: 'main', phases: [{ name: 'p' }] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phases[0]!.cadence).toBe('once');
  });

  it('a structurally invalid cadence is a structural (E_VALIDATION) diagnostic at its path', () => {
    const repo = makeTempGitRepo();
    try {
      writeMain(repo, '  - name: sweep\n    role: developer\n    cadence:\n      recurring:\n        cron: "0 6 * *"\n');
      expect(diagnosticsOf(repo).map((d) => [d.code, d.path])).toEqual([['E_VALIDATION', 'phases[0].cadence.recurring.cron']]);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('characterization — the parsed shape and the v0.3 release boundary', () => {
  it('pins the parsed shape of the three fields (task-204 reports these values)', () => {
    const result = Workflow.safeParse({
      name: 'dev-loop',
      kind: 'sub',
      phases: [
        { name: 'red', role: 'qa' },
        { name: 'green', role: 'developer', distinct_from: ['red'] },
        { name: 'refactor', role: 'developer', mode: 'resume' },
        { name: 'deps', role: 'developer', cadence: { recurring: { cron: '0 6 * * 1' } } },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.phases.map(({ name, mode, distinct_from, cadence }) => ({ name, mode, distinct_from, cadence }))).toEqual([
      { name: 'red', mode: undefined, distinct_from: undefined, cadence: 'once' },
      { name: 'green', mode: undefined, distinct_from: ['red'], cadence: 'once' },
      { name: 'refactor', mode: 'resume', distinct_from: undefined, cadence: 'once' },
      { name: 'deps', mode: undefined, distinct_from: undefined, cadence: { recurring: { cron: '0 6 * * 1' } } },
    ]);
  });

  it("this repository's workflows load unchanged: every phase reads cadence once and declares no mode", () => {
    const loaded = loadWorkflowsYaml(join(__dirname, '..', '..'));
    const phases = loaded.workflows.flatMap((w) => w.phases);
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((p) => p.cadence === 'once' && p.mode === undefined && p.distinct_from === undefined)).toBe(true);
  });

  it('no v0.3 code path reads distinct_from beyond the schema and its loader validation (enforcement is P4.12, v1.0)', () => {
    const srcRoot = join(__dirname, '..', '..', 'src');
    const walk = (dir: string): string[] =>
      readdirSync(dir)
        .sort()
        .flatMap((entry) => {
          const full = join(dir, entry);
          return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
        });
    const readers = walk(srcRoot)
      .filter((file) => readFileSync(file, 'utf-8').includes('distinct_from'))
      .map((file) => relative(srcRoot, file).split('\\').join('/'));
    expect(readers).toEqual(['core/workflow-diagnostics.ts', 'workflow/schema.ts']);
  });
});
