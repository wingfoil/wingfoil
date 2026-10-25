/**
 * task-298 — a workflow check bound `manual: true` (`dl-172` (a); `spec-003-workflows-yaml-schema` Layer 3,
 * `spec-017` §6.1). A check binding declares exactly one of `run` / `manual`, as an action binding does; a manual
 * check raises no `W_WORKFLOW_UNBOUND_TOKEN`, and `workflow next` / `workflow show` report it with binding kind
 * `manual`, `evaluated: false` — as a check token and as an `awaits.evidence` token.
 *
 * - AC 2: one fixture committed at `HEAD` (a `probe` workflow whose checks and awaited evidence mix manual, run and
 *   unbound tokens), read through the `workflowNext` and `workflowShow` operations of `CORE_MODULES`.
 * - AC 3: this repository binds `demo.rendered` `manual: true` in `.wingfoil/workflows/bindings.yaml` (`dl-172`
 *   Action 2), with one version bump carrying a `task-298` history entry (compared "at least", bug-314).
 *
 * The validation rows of `bindings.yaml` (both / neither of `run` and `manual`, `severity` / `args` on a manual
 * check) are pinned in `test/core/workflow-evidence.test.ts`; the resolver in `test/workflow/bindings.test.ts`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, loadWorkflowRegistryAtHead, type NextResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { resolveToken } from '../../src/workflow/bindings';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Zoe
      email: zoe@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const PROBE = `name: probe
startable: true
phases:
  - name: do
    role: developer
    checks:
      pre: [ "demo.ok" ]
      post: [ "demo.ok(note: x)", "report.ok", "prose nobody binds" ]
    awaits: { party: "a vendor", evidence: "vendor.ack" }
`;

const BINDINGS_YAML = `version: 1.0
checks:
  demo.ok: { manual: true }
  vendor.ack: { manual: true }
  report.ok: { run: [node, check.cjs] }
`;

function plan(id: string, workflow: string): string {
  return `---\nid: "${id}"\ntype: plan\ntitle: "${id}"\nstatus: active\nworkflow: "${workflow}"\nphase: "x"\nelement: ""\n---\n\n## Body\n`;
}

function operation(name: 'workflowNext' | 'workflowShow') {
  const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations[name];
  if (op === undefined) throw new Error(`workflow.${name} is not registered in CORE_MODULES`);
  return op;
}

/** Unwrap a `CoreResult`, failing the test with the error's code and message. */
function ok<T>(value: CoreResult<T> | T): T {
  if (typeof value === 'object' && value !== null && 'ok' in value) {
    const result = value as CoreResult<T>;
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
    return result.value;
  }
  return value as T;
}

describe('task-298 AC 2 — workflow next / show report a manual check as kind manual, evaluated: false (spec-017 §6.1)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/probe.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/probe.yaml', PROBE);
    writeFixtureFile(repo, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    commitAll(repo, 'fixture configuration');
    writeFixtureFile(repo, 'docs/plans/probe-1.md', plan('probe-1', 'probe'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'wf(plan): add probe-1']);
  });
  afterAll(() => removeTempDir(repo));

  it('workflow next: the manual check tokens and the manual awaited evidence report binding kind manual', async () => {
    const result = ok((await operation('workflowNext').fn({ root: repo, positional: 'probe-1' })) as CoreResult<NextResult> | NextResult);
    const step = result.next!;
    expect(step.checks).toEqual({
      pre: [{ token: 'demo.ok', binding: { kind: 'manual' }, evaluated: false }],
      post: [
        { token: 'demo.ok(note: x)', binding: { kind: 'manual' }, evaluated: false },
        { token: 'report.ok', binding: { kind: 'run', argv: ['node', 'check.cjs'] }, evaluated: false },
        { token: 'prose nobody binds', binding: { kind: 'unbound' }, evaluated: false },
      ],
    });
    expect(step.awaiting).toEqual({
      kind: 'party',
      party: 'a vendor',
      evidence: { token: 'vendor.ack', binding: { kind: 'manual' }, evaluated: false },
    });
  });

  it('workflow show: the manual check and the manual awaited evidence report { kind: manual, source: project }; only the unbound check warns', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the show payload is asserted field by field
    const value = ok((await operation('workflowShow').fn({ root: repo, positional: 'probe' })) as CoreResult<any>);
    const phase = value.workflow.phases[0];
    expect(phase.checks.pre[0]).toEqual({ token: 'demo.ok', binding: { kind: 'manual', source: 'project' }, evaluated: false });
    expect(phase.awaits.evidence).toEqual({ token: 'vendor.ack', binding: { kind: 'manual', source: 'project' }, evaluated: false });
    expect((value.diagnostics as { code: string; path: string }[]).map((d) => [d.code, d.path])).toEqual([
      ['W_WORKFLOW_UNBOUND_TOKEN', 'phases[0].checks.post[2]'],
    ]);
  });
});

describe("task-298 AC 3 — this repository binds demo.rendered manual: true (dl-172 Action 2)", () => {
  const ROOT = join(__dirname, '..', '..');
  const BINDINGS = '.wingfoil/workflows/bindings.yaml';
  const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
  const versionLine = (): string => /^version:.*$/m.exec(read(BINDINGS))![0];

  /** The version of the `;`-separated history segment of the version line's comment that names `who`, or NaN. */
  function entryVersion(who: string): number {
    const entry = versionLine()
      .split(';')
      .map((segment) => /(\d+\.\d+) [^;]*$/.exec(segment.trim()))
      .find((match) => match !== null && match[0].includes(who));
    return entry ? Number(entry[1]) : Number.NaN;
  }

  it('at HEAD demo.rendered resolves to a manual check, and no diagnostic names it', () => {
    const loaded = loadWorkflowRegistryAtHead(ROOT);
    expect(resolveToken('demo.rendered', 'check', loaded.bindings)).toEqual({ kind: 'manual', source: 'project' });
    const diagnostics = loaded.diagnostics as ReadonlyArray<{ message: string }>;
    expect(diagnostics.filter((d) => d.message.includes('demo.rendered'))).toEqual([]);
  });

  it('bindings.yaml is bumped to at least 2.5, with a task-298 history entry numbered at least 2.5 (bug-314)', () => {
    expect(Number(/^version:\s*([0-9.]+)/m.exec(read(BINDINGS))![1])).toBeGreaterThanOrEqual(2.5);
    expect(entryVersion('task-298')).toBeGreaterThanOrEqual(2.5);
  });
});
