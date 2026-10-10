/**
 * task-221 — `dev-loop.yaml` v1.6: the v0.3 gates in one revision. Each check comes from a ratified
 * decision-log:
 *
 * - `start.checks.pre` — the stop-the-line check (`dl-133` §3, Q3 (a), Q4 (i)), reading its threshold from
 *   `memory.yaml` `task.stop_the_line` (task-150) rather than restating it;
 * - `design.checks.post` — each acceptance criterion read against the bound directives and the ratified specs
 *   (`dl-102` §4);
 * - `refactor.checks.post` — `typecheck.clean` (`dl-044`), bound to `npm run typecheck` (task-173);
 * - `review.checks.pre` — the claim re-run (`dl-097` (a)), the previous reject's items re-verified on a
 *   re-review (`dl-098`), and the document-parity suites, named (`dl-116` Action 4);
 * - `done.checks.post` — the `### Retrospective` subsection exists (`dl-115` Q2 (a), Action 3: the task's and
 *   each linked bug's the `done` sync closes).
 *
 * The workflow is read **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, task-194), like
 * `test/core/dev-loop-v1-5.test.ts` (task-205) and `test/core/workflow-repository-conformance.test.ts`
 * (task-199), whose zero-error and warning-set tests this file does not replace. The templates, the test
 * sources and `package.json` are read from the working tree, as the other live-configuration suites do.
 *
 * What is NOT asserted here: that any of these checks is evaluated — no check runs before P4.12 (v1.0,
 * `dl-090` Q2 (c)); the unbound ones are `W_WORKFLOW_UNBOUND_TOKEN` warnings until then.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadMemoryYamlAtHead, loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead, type CheckTokenView } from '../../src/core/workflow-list-show';
import { resolveToken, tokenName, type BindingsYaml } from '../../src/workflow/bindings';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';
const BINDINGS_FILE = '.wingfoil/workflows/bindings.yaml';

function registry(): { workflow: Workflow; bindings: BindingsYaml | null; diagnostics: readonly { severity: string; file: string; path: string; code: string }[] } {
  const loaded = loadWorkflowRegistryAtHead(ROOT);
  const workflow = loaded.workflows.find((w) => w.name === 'dev-loop');
  if (workflow === undefined) throw new Error('dev-loop is not in the registry at HEAD');
  return { workflow, bindings: loaded.bindings, diagnostics: loaded.diagnostics as readonly { severity: string; file: string; path: string; code: string }[] };
}

function phase(name: string): Phase {
  const found = registry().workflow.phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`dev-loop has no phase '${name}' at HEAD`);
  return found;
}

/** The phase's `checks.<when>` token whose name is `name`; throws when there is none. */
function check(phaseName: string, when: 'pre' | 'post', name: string): string {
  const found = (phase(phaseName).checks?.[when] ?? []).find((token) => tokenName(token) === name);
  if (found === undefined) throw new Error(`dev-loop.${phaseName} declares no checks.${when} '${name}' at HEAD`);
  return found;
}

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** The raw line of dev-loop.yaml at HEAD that declares `token` inside phase `phaseName`. */
function declaringLine(phaseName: string, token: string): string {
  const text = atHead(DEV_LOOP_FILE);
  const start = text.indexOf(`  - name: ${phaseName}\n`);
  const next = text.indexOf('\n  - name: ', start + 1);
  const block = text.slice(start, next === -1 ? undefined : next);
  const line = block.split('\n').find((l) => l.includes(token));
  if (line === undefined) throw new Error(`no line declaring ${token} in phase ${phaseName}`);
  return line;
}

/** The test suites under `test/docs/` whose source cites `dl-116` (the document-parity suites), ascending. */
function dl116Suites(): string[] {
  return readdirSync(join(ROOT, 'test', 'docs'))
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) => readFileSync(join(ROOT, 'test', 'docs', name), 'utf-8').includes('dl-116'))
    .map((name) => `test/docs/${name}`)
    .sort();
}

describe('AC 1 — dev-loop.yaml v1.6 declares the seven v0.3 gates (red-first)', () => {
  it('loads at HEAD with zero errors', () => {
    expect(registry().diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  describe('start — the stop-the-line check (dl-133 §3, Q4 (i))', () => {
    it('`start.checks.pre` declares `stop-the-line.clear`, naming memory.yaml\'s rule instead of restating the threshold', () => {
      const token = check('start', 'pre', 'stop-the-line.clear');
      expect(token).toContain('memory.yaml task.stop_the_line');
      expect(token).not.toMatch(/\d/);
      expect(declaringLine('start', 'stop-the-line.clear')).toMatch(/dl-133/);
    });

    it('the rule it names exists at HEAD and is the one that blocks feature pick-up at dev-loop start (task-150)', () => {
      const memoryYaml = loadMemoryYamlAtHead(ROOT) as unknown as { types: Record<string, { stop_the_line?: Record<string, unknown> }> } | null;
      expect(memoryYaml).not.toBeNull();
      expect(memoryYaml!.types.task!.stop_the_line).toMatchObject({ field: 'kind', counts: 'fix', blocks: 'feature', at: 'dev-loop start' });
    });
  });

  describe('design — each criterion read against the directives and the ratified specs (dl-102 §4)', () => {
    it('`design.checks.post` keeps its three checks and adds `acceptance-criteria.consistent`', () => {
      const names = (phase('design').checks?.post ?? []).map(tokenName);
      expect(names).toEqual(['frontmatter.required', 'tech-spec.approved', 'depends_on.acknowledged', 'acceptance-criteria.consistent']);
      expect(declaringLine('design', 'acceptance-criteria.consistent')).toMatch(/dl-102/);
    });
  });

  describe('refactor — typecheck.clean (dl-044), bound to task-173\'s command', () => {
    it('`refactor.checks.post` appends `typecheck.clean` after task-205\'s checks, which keep their positions', () => {
      expect(phase('refactor').checks?.post).toEqual([
        'tests.passing',
        'tests.coverage(min: 80)',
        'docs.api.public-complete',
        'docs.api.build',
        'lint.clean',
        'tests.unchanged(since: red)',
        'typecheck.clean',
      ]);
    });

    it('binds to `npm run typecheck`, a script package.json declares', () => {
      expect(resolveToken('typecheck.clean', 'check', registry().bindings)).toMatchObject({ kind: 'run', source: 'project', argv: ['npm', 'run', 'typecheck'] });
      const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
      expect(scripts.typecheck).toBeDefined();
    });
  });

  describe('review — claim re-run (dl-097 (a)), re-review (dl-098), parity suites (dl-116)', () => {
    it('`review.checks.pre` keeps `tests.bdd.passing` first and adds the three checks', () => {
      const names = (phase('review').checks?.pre ?? []).map(tokenName);
      expect(names).toEqual(['tests.bdd.passing', 'claims.rerun', 'rereview.previous-reject', 'docs.parity']);
      expect(declaringLine('review', 'claims.rerun')).toMatch(/dl-097/);
      expect(declaringLine('review', 'rereview.previous-reject')).toMatch(/dl-098/);
      expect(declaringLine('review', '"docs.parity"')).toMatch(/dl-116/);
    });

    it('the claim re-run asks for the positive case of every absence claim (dl-097 §1)', () => {
      expect(check('review', 'pre', 'claims.rerun')).toMatch(/absence claim/);
    });

    it('the re-review check reads the previous reject\'s Reason through memory history (dl-098 (a))', () => {
      expect(check('review', 'pre', 'rereview.previous-reject')).toMatch(/memory history/);
    });

    it('`docs.parity` is bound to `npm test -- <suites>`, naming every test/docs suite that cites dl-116, and each named suite exists', () => {
      const binding = resolveToken('docs.parity', 'check', registry().bindings);
      expect(binding.kind).toBe('run');
      const argv = binding.argv ?? [];
      expect(argv.slice(0, 3)).toEqual(['npm', 'test', '--']);
      const suites = argv.slice(3);
      expect(suites.length).toBeGreaterThan(0);
      for (const suite of suites) expect(existsSync(join(ROOT, suite))).toBe(true);
      const cited = dl116Suites();
      expect(cited.length).toBeGreaterThan(0);
      for (const suite of cited) expect(suites).toContain(suite);
      // The model dl-116 names, the allowlist's own gate, and dl-116 Q1 (A)'s first enumeration (spec-005/008/006
      // command lists against the program), which predates dl-116 and does not cite it.
      expect(suites).toContain('test/docs/cli-reference.test.ts');
      expect(suites).toContain('test/docs/command-surface-specs.test.ts');
      expect(suites).toContain('test/docs/enumeration-parity.allowlist.test.ts');
    });
  });

  describe('done — the `### Retrospective` subsection exists (dl-115 Q2 (a))', () => {
    it('`done.checks.post` declares `retrospective.present`, for the task and each bug the sync closes (Action 3)', () => {
      const token = check('done', 'post', 'retrospective.present');
      expect(token).toContain('### Retrospective');
      expect(token).toMatch(/bug/);
      expect(declaringLine('done', 'retrospective.present')).toMatch(/dl-115/);
    });

    it('the task and bug templates carry the heading the check looks for (task-213)', () => {
      for (const type of ['task', 'bug']) {
        expect(readFileSync(join(ROOT, `.wingfoil/memory/templates/${type}.md`), 'utf-8')).toMatch(/^### Retrospective$/m);
      }
    });
  });

  // Version pins are "at least": a later writer of the same file bumps it again (B4: task-212, 219, 222 also
  // bump bindings.yaml), and the history line keeps this task's entry.
  it('dev-loop.yaml is at version 1.6 or later, its history naming task-221 and keeping 1.5\'s', () => {
    expect(registry().workflow.version).toBeGreaterThanOrEqual(1.6);
    expect(atHead(DEV_LOOP_FILE)).toMatch(/^version: \d+\.\d+ +# .*\b1\.6 .*task-221.*\(prev 1\.5 dl-134/m);
  });

  it('bindings.yaml is at version 1.3 or later, its history naming task-221', () => {
    const match = /^version: (\d+(?:\.\d+)?) +# (.*)$/m.exec(atHead(BINDINGS_FILE));
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(1.3);
    expect(match![2]).toMatch(/task-221/);
  });
});

describe('AC 2 — workflow show dev-loop lists each new check with its binding, or unbound (characterization)', () => {
  let checks: Map<string, CheckTokenView>;

  beforeAll(() => {
    const result = workflowShowAtHead(ROOT, 'dev-loop');
    if (!result.ok) throw new Error(`workflow show dev-loop failed: ${result.error.message}`);
    checks = new Map();
    for (const view of result.value.workflow.phases) {
      for (const entry of [...view.checks.pre, ...view.checks.post]) checks.set(`${view.name}:${tokenName(entry.token)}`, entry);
    }
  });

  it.each([
    ['start:stop-the-line.clear', 'unbound'],
    ['design:acceptance-criteria.consistent', 'unbound'],
    ['refactor:typecheck.clean', 'run'],
    ['review:claims.rerun', 'unbound'],
    ['review:rereview.previous-reject', 'unbound'],
    ['review:docs.parity', 'run'],
    ['done:retrospective.present', 'unbound'],
  ])('%s is shown with binding kind %s, never evaluated', (key, kind) => {
    const entry = checks.get(key);
    expect(entry).toBeDefined();
    expect(entry!.binding.kind).toBe(kind);
    expect(entry!.evaluated).toBe(false);
  });
});
