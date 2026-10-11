/**
 * task-217 review F2 — the arms of `workflow start` / `workflow end` that only the compiled CLI reached
 * (uninstrumented): the usage errors, a thrown non-storage failure, `end`'s transition refusals, the console
 * rendering of a real first step, the `-<n>` safeguard, `refusalOf`'s rethrow in `CORE_MODULES`, and
 * `resolveWaitingTarget` on a machine with no `waiting` edge. Characterization: the behaviour exists.
 */
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, enumerateOperations, renderStartConsole, type StartResult } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { workflowStart } from '../../src/core/workflow-start-end';
import { MemoryYaml } from '../../src/memory/schema';
import { resolveWaitingTarget } from '../../src/memory/state-machine';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const MEMORY_YAML = `version: 1.0
types:
  plan:
    path: "docs/plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      frontmatter:
        required: [ title ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/tidy.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/tidy.yaml', 'name: tidy\nstartable: true\nphases:\n  - name: check\n    role: developer\n    produces: [ "README.md" ]\n');
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', '---\nid: ""\ntype: plan\ntitle: ""\nstatus: draft\nworkflow: ""\nphase: ""\n---\n\n## Steps\n');
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  commitAll(root, 'fixture');
}

function operation(name: string): CoreFn<unknown, unknown> {
  return enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name)!.operation.fn;
}

const PLAN = 'docs/plans/tidy/tidy-1-plan.md';

describe('workflow start — usage errors, in process (task-217 review F2)', () => {
  it.each([
    ['no <name>', {}, 'missing required argument: <name>'],
    ['a blank <name>', { positional: '  ' }, 'missing required argument: <name>'],
    ['a malformed --element', { positional: 'tidy', options: { element: 'nope' } }, 'malformed element-ref "nope": expected <type>:<id>'],
    ['a --set with no =', { positional: 'tidy', options: { set: ['phase'] } }, 'invalid flag value: --set expects <name>=<value>, got "phase"'],
    ['a --set name start does not take', { positional: 'tidy', options: { set: ['workflow=x'] } }, 'invalid flag value: --set workflow: workflow start sets only phase and scope'],
  ])('%s → UsageError', async (_label, params, message) => {
    await expect(operation('workflowStart')({ root: '/nonexistent', ...params })).rejects.toEqual(new UsageError(message));
  });
});

describe('workflow start / end — refusals and rendering past the acceptance cases (task-217 review F2)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it('a submit that throws something other than a storage failure propagates', async () => {
    const add = enumerateOperations(CORE_MODULES).find((entry) => entry.operation.name === 'memoryAdd')!.operation.fn;
    await expect(
      workflowStart({ root: repo, positional: 'tidy', options: {} }, { add: add as never, submit: async () => { throw new Error('boom'); } }),
    ).rejects.toThrow('boom');
  });

  it('the console rendering of a real start names the instance and its first step', async () => {
    const result = (await operation('workflowStart')({ root: repo, positional: 'tidy', options: {} })) as CoreResult<StartResult>;
    if (!result.ok) throw new Error(result.error.message);
    // `tidy` completes from README.md at once, so its first step is none: the complete line is printed.
    expect(renderStartConsole(result.value)).toBe("started tidy as tidy-1-plan (active)\nno next step: workflow 'tidy' is complete\n");
    const step = { ...result.value, next: { key: 'tidy.check', trail: [{ workflow: 'tidy', phase: 'check', scope: null }], scope: null, role: 'developer', agentRole: false, members: [], directives: [], actions: [], evidence: { kinds: [], missing: [], finalizable: false }, reentered: false, reentryCommit: null, awaiting: null } } as unknown as StartResult;
    expect(renderStartConsole(step)).toMatch(/^started tidy as tidy-1-plan \(active\)\nnext step: tidy\.check\n/);
  });

  it('end: a plan deleted in the working tree is refused by the transition preamble', async () => {
    expect((await operation('workflowStart')({ root: repo, positional: 'tidy', options: {} })).ok).toBe(true);
    unlinkSync(join(repo, PLAN));
    const result = await operation('workflowEnd')({ root: repo });
    expect(result.ok ? null : result.error.message).toMatch(/held by HEAD but deleted in the working tree/);
  });

  it('end: a plan modified in the working tree is refused before the commit', async () => {
    expect((await operation('workflowStart')({ root: repo, positional: 'tidy', options: {} })).ok).toBe(true);
    writeFileSync(join(repo, PLAN), `${git(repo, ['show', `HEAD:${PLAN}`])}\nAn uncommitted line.\n`);
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    const result = await operation('workflowEnd')({ root: repo });
    expect(result.ok).toBe(false);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(head);
  });

  it('the -<n> suffix gives up after 1000 tries with CONFLICT', async () => {
    mkdirSync(join(repo, 'docs/plans/tidy'), { recursive: true });
    for (let n = 1; n <= 1000; n += 1) writeFileSync(join(repo, `docs/plans/tidy/tidy-${n === 1 ? '1' : `1-${n}`}-plan.md`), '');
    const result = await operation('workflowStart')({ root: repo, positional: 'tidy', options: {} });
    expect(result.ok ? null : result.error).toMatchObject({ code: 'CONFLICT', message: 'plan id already exists: tidy-1-1000-plan' });
    rmSync(join(repo, 'docs/plans'), { recursive: true, force: true });
  });

  it("CORE_MODULES rethrows a failure that is not a configuration refusal (refusalOf)", async () => {
    // A branch naming a blob, not a commit: the plan-id check reads every branch's tree, and git fails on it
    // (a StorageError, which is no configuration refusal).
    const blob = git(repo, ['rev-parse', 'HEAD:README.md']).trim();
    writeFileSync(join(repo, '.git', 'refs', 'heads', 'not-a-commit'), `${blob}\n`);
    await expect(operation('workflowStart')({ root: repo, positional: 'tidy', options: {} })).rejects.toThrow();
  });
});

describe('resolveWaitingTarget on a machine with no waiting edge (task-217 review F2)', () => {
  it('refuses with (none)', () => {
    const memory = MemoryYaml.parse({ version: 1, types: { plan: { path: 'p/{id}.md', states: { sequence: ['draft', 'active', 'done'] } } } });
    expect(() => resolveWaitingTarget(memory, 'plan', 'active', 'p/x.md')).toThrow("illegal transition active -> (none) for type 'plan'");
  });
});
