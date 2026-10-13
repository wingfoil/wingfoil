/**
 * task-215 AC 2 (red-first, reclassified at design from characterization: the declaration does not exist yet) —
 * `release-planning` `reconcile-governance` declares the role-directives sweep (`dl-050` option 1; batch ruling D1:
 * an npm script bound to a token in `reconcile-governance` only, never `dev-loop.yaml`), in the token grammar of
 * `dl-090` / `spec-003`: a `checks.pre` token, `role-directives.clean`, that `workflows/bindings.yaml` binds to
 * `npm run check:role-directives`, the `package.json` script that runs `scripts/check-role-directives.cjs`.
 *
 * - the phase's `checks.pre` is exactly the token; its `post[0]` (`ready-decision-logs.covered`, pinned by the
 *   conformance test) keeps its index;
 * - the binding is an argument vector with no `severity` (reject, the default);
 * - `doc-versioning`: `release-planning.yaml` reaches 2.2 and `bindings.yaml` 1.9 (re-bumped at the gate after
 *   task-241 and task-234, so 2.1 there), each with a history entry naming task-215 whose number is at least that,
 *   compared numerically; versions are "at least" (bug-314);
 * - at `HEAD` the token is bound (no diagnostic names it) and the registry loads with zero errors;
 * - `WORKFLOW.md`'s Release Planning section names the token and the script.
 *
 * The configuration files are read from the working tree with `js-yaml`; the load diagnostics at `HEAD`, like
 * `workflow-repository-conformance.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { loadWorkflowRegistryAtHead } from '../../src/core';

const ROOT = join(__dirname, '..', '..');
const RELEASE_PLANNING = '.wingfoil/workflows/custom/release-planning.yaml';
const BINDINGS = '.wingfoil/workflows/bindings.yaml';

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const version = (path: string): number => Number(/^version:\s*([0-9.]+)/m.exec(read(path))![1]);
const versionLine = (path: string): string => /^version:.*$/m.exec(read(path))![0];

/**
 * The version number of the history entry (one `;`-separated segment of the version line's comment) that names
 * `who`, or NaN when no numbered entry names it. Compared numerically (bug-314): the gate re-bumps an entry when
 * another writer of the same file merges first, so only a lower bound is pinned.
 */
function entryVersion(path: string, who: string): number {
  const entry = versionLine(path)
    .split(';')
    .map((segment) => /(\d+\.\d+) [^;]*$/.exec(segment.trim()))
    .find((match) => match !== null && match[0].includes(who));
  return entry ? Number(entry[1]) : Number.NaN;
}

interface PhaseYaml {
  name: string;
  checks?: { pre?: unknown[]; post?: unknown[] };
}

function reconcileGovernance(): PhaseYaml {
  const workflow = yamlLoad(read(RELEASE_PLANNING)) as { phases: PhaseYaml[] };
  const found = workflow.phases.find((p) => p.name === 'reconcile-governance');
  if (found === undefined) throw new Error('no phase release-planning.reconcile-governance');
  return found;
}

describe('task-215 AC 2 — reconcile-governance declares the role-directives check (dl-050 option 1, D1)', () => {
  it('declares role-directives.clean as its only pre-check, and keeps ready-decision-logs.covered as post[0]', () => {
    const checks = reconcileGovernance().checks ?? {};
    expect(checks.pre).toEqual(['role-directives.clean']);
    expect(String(checks.post?.[0])).toMatch(/^ready-decision-logs\.covered/);
  });

  it('binds role-directives.clean to `npm run check:role-directives` (argument vector, default severity reject)', () => {
    const bindings = yamlLoad(read(BINDINGS)) as { checks: Record<string, unknown> };
    expect(bindings.checks['role-directives.clean']).toEqual({ run: ['npm', 'run', 'check:role-directives'] });
  });

  it('declares the npm script that runs scripts/check-role-directives.cjs', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:role-directives']).toBe('node scripts/check-role-directives.cjs');
  });

  it('bumps release-planning.yaml to at least 2.2 with a task-215 history entry, keeping task-279\'s 2.1', () => {
    expect(version(RELEASE_PLANNING)).toBeGreaterThanOrEqual(2.2);
    expect(entryVersion(RELEASE_PLANNING, 'task-215')).toBeGreaterThanOrEqual(2.2);
    expect(entryVersion(RELEASE_PLANNING, 'task-279')).toBeGreaterThanOrEqual(2.1);
  });

  it('bumps bindings.yaml to at least 1.9 with a task-215 history entry numbered at least 1.9 (re-bumped at the gate)', () => {
    expect(version(BINDINGS)).toBeGreaterThanOrEqual(1.9);
    expect(entryVersion(BINDINGS, 'task-215')).toBeGreaterThanOrEqual(1.9);
  });

  it('at HEAD the token is bound (no diagnostic names it) and the registry loads with zero errors', () => {
    const loaded = loadWorkflowRegistryAtHead(ROOT);
    const diagnostics = loaded.diagnostics as ReadonlyArray<{ code: string; severity: string; message: string }>;
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(diagnostics.filter((d) => d.message.includes('role-directives.clean'))).toEqual([]);
    const rg = loaded.workflows
      .find((w) => w.name === 'release-planning')
      ?.phases.find((p) => p.name === 'reconcile-governance');
    expect(rg?.checks?.pre).toEqual(['role-directives.clean']);
  });

  it("WORKFLOW.md's Release Planning section names the token and the npm script", () => {
    const text = read('.wingfoil/WORKFLOW.md');
    const start = text.indexOf('### Release Planning');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = text.indexOf('\n### ', start + 1);
    const section = text.slice(start, next === -1 ? undefined : next);
    expect(section).toContain('role-directives.clean');
    expect(section).toContain('check:role-directives');
  });
});
