/**
 * task-242 (`bug-327`; `spec-017` §5.1, §5.3, §7.9, §10; approver ruling D2 (a)) — the BDD bindings of
 * `wingfoil workflow finalize`:
 *
 * - `docs/02_requirements/02_bdd/features/p4-workflow/P4.13-state-deduction.feature` sc. 4 ("A step completed
 *   only by a record is complete after workflow finalize") and sc. 5 ("Error - finalize a step that is not on
 *   the frontier");
 * - `docs/02_requirements/02_bdd/features/p4-workflow/P4.14-approval-routing.feature` sc. 4 ("An approval no
 *   element carries is routed, then recorded by workflow finalize").
 *
 * Q4 pins the feature text (red until the scenarios are written). Q5 binds each scenario in-process, through
 * the registered `CORE_MODULES` operations `workflowStart`, `workflowNext`, `workflowStatus` and
 * `workflowFinalize`, on a fixture committed at `HEAD` (characterization: the behaviour ships with task-217,
 * task-225, task-226). They overlap task-225 AC 5 and task-226 AC 1–3 on purpose: here they are the scenarios'
 * bindings.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, enumerateOperations, renderStatusConsole } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const FEATURES = join(__dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p4-workflow');
const P4_13 = readFileSync(join(FEATURES, 'P4.13-state-deduction.feature'), 'utf-8');
const P4_14 = readFileSync(join(FEATURES, 'P4.14-approval-routing.feature'), 'utf-8');

describe('task-242 Q4 — the feature files carry the finalize scenarios (bug-327)', () => {
  it('P4.13 gains sc. 4: a step completed only by a record is complete after workflow finalize', () => {
    expect(P4_13).toContain('  Scenario: A step completed only by a record is complete after workflow finalize\n');
  });

  it('P4.13 gains sc. 5: the off-frontier refusal, with its message', () => {
    expect(P4_13).toContain('  Scenario: Error - finalize a step that is not on the frontier\n');
    expect(P4_13).toContain('    And the message is "step \'<key>\' is not on the frontier of <instance>"\n');
  });

  it('the two scenarios follow the three existing ones, in that order (sc. 4, sc. 5)', () => {
    const titles = P4_13.split('\n').filter((line) => line.startsWith('  Scenario: ')).map((line) => line.slice('  Scenario: '.length));
    expect(titles).toEqual([
      'Deduce task progress from frontmatter',
      'Deduced state is validated against the type machine',
      'Error - frontmatter holds a state illegal for the type',
      'A step completed only by a record is complete after workflow finalize',
      'Error - finalize a step that is not on the frontier',
    ]);
  });

  it('P4.14 keeps the uncarried-approval case as sc. 4 (ruling D2 (a))', () => {
    const titles = P4_14.split('\n').filter((line) => line.startsWith('  Scenario: ')).map((line) => line.slice('  Scenario: '.length));
    expect(titles[3]).toBe('An approval no element carries is routed, then recorded by workflow finalize');
    expect(titles).toHaveLength(4);
  });
});

const MEMORY_YAML = `version: 1.0
types:
  plan:
    path: "docs/plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      frontmatter:
        required: [ title, workflow, phase ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const PLAN_TEMPLATE = `---
id: ""
type: plan
title: ""
status: draft
workflow: ""
phase: ""
element: ""
parent: ""
---

## Steps

<!-- placeholder -->
`;

/** `WingFoil Test` (the fixture's `user.*`) holds no `approver` role; Morgan does (P4.14's Background). */
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
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** P4.13 sc. 4–5: two phases with no Memory or file evidence — each step completes only by a record. */
const CHECKLIST = `name: checklist
startable: true
phases:
  - name: tick
    role: developer
  - name: tock
    role: developer
`;

/** P4.14 sc. 4: an approval phase whose actions move no element through a gate. */
const SIGNOFF = `name: signoff
startable: true
phases:
  - name: review
    role: reviewer
    approval: { by_role: approver }
  - name: close
    role: developer
`;

function buildRepo(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/checklist.yaml\n  - workflows/custom/signoff.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/checklist.yaml', CHECKLIST);
  writeFixtureFile(root, '.wingfoil/workflows/custom/signoff.yaml', SIGNOFF);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture');
  return root;
}

function operation(name: 'workflowStart' | 'workflowNext' | 'workflowStatus' | 'workflowFinalize'): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found.operation.fn;
}

async function call(name: 'workflowStart' | 'workflowNext' | 'workflowStatus' | 'workflowFinalize', root: string, positional?: string, options: Record<string, string> = {}): Promise<CoreResult<unknown>> {
  return (await operation(name)({ root, ...(positional === undefined ? {} : { positional }), options })) as CoreResult<unknown>;
}

function ok<T>(result: CoreResult<unknown>): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}: ${result.error.message}`);
  return result.value as T;
}

interface StepView {
  readonly key: string;
  readonly evidence: { readonly kinds: readonly string[]; readonly missing: readonly string[]; readonly finalizable: boolean };
}
interface NextView {
  readonly complete: boolean;
  readonly next: StepView | null;
}
interface StatusView {
  readonly open: readonly { readonly instance: { readonly id: string }; readonly phases: readonly { readonly phase: string; readonly state: string }[] }[];
  readonly pendingApprovals: readonly {
    readonly step: string | null;
    readonly awaiting: { readonly recordNeeded: boolean; readonly elements: readonly unknown[]; readonly routedTo: readonly { readonly name: string; readonly email: string }[] };
  }[];
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();
const lastMessage = (root: string): string => git(root, ['log', '-1', '--format=%B']).trim();

/** Start `workflow` and answer its instance id. */
async function start(root: string, workflow: string): Promise<string> {
  return ok<{ instance: { id: string } }>(await call('workflowStart', root, workflow)).instance.id;
}

/** Run `fn` with `GIT_AUTHOR_*` naming Morgan, the approver, and restore the environment after. */
async function asMorgan<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { name: process.env.GIT_AUTHOR_NAME, email: process.env.GIT_AUTHOR_EMAIL };
  process.env.GIT_AUTHOR_NAME = 'Morgan';
  process.env.GIT_AUTHOR_EMAIL = 'morgan@example.invalid';
  try {
    return await fn();
  } finally {
    if (saved.name === undefined) delete process.env.GIT_AUTHOR_NAME;
    else process.env.GIT_AUTHOR_NAME = saved.name;
    if (saved.email === undefined) delete process.env.GIT_AUTHOR_EMAIL;
    else process.env.GIT_AUTHOR_EMAIL = saved.email;
  }
}

describe('task-242 Q5 — the scenarios bound in-process (characterization)', () => {
  let root: string;
  beforeEach(() => {
    root = buildRepo();
  });
  afterEach(() => removeTempDir(root));

  it('P4.13 sc. 4: A step completed only by a record is complete after workflow finalize', async () => {
    // Given an open workflow whose next step is a phase with no Memory or file evidence
    const instance = await start(root, 'checklist');
    const before = ok<NextView>(await call('workflowNext', root));
    expect(before.next?.key).toBe('checklist.tick');
    expect(before.next?.evidence).toMatchObject({ missing: ['record'], finalizable: true });
    const baseline = head(root);

    // When "wingfoil workflow finalize" records that step
    ok(await call('workflowFinalize', root));

    // Then one commit with no file change, subject "workflow: finalize <instance> <step>", carries the trailers
    expect(git(root, ['rev-parse', 'HEAD~1']).trim()).toBe(baseline);
    expect(git(root, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('');
    expect(lastMessage(root).split('\n')[0]).toBe(`workflow: finalize ${instance} checklist.tick`);
    expect(git(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Phase,valueonly)']).trim()).toBe('checklist.tick completed');
    expect(git(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Instance,valueonly)']).trim()).toBe(instance);

    // And the step's phase is reported complete
    const status = ok<StatusView>(await call('workflowStatus', root));
    const entry = status.open.find((candidate) => candidate.instance.id === instance);
    expect(entry?.phases.find((phase) => phase.phase === 'tick')?.state).toBe('complete');

    // And "workflow next" reports the following step
    const after = ok<NextView>(await call('workflowNext', root));
    expect(after.next?.key).toBe('checklist.tock');
  });

  it('P4.13 sc. 5: Error - finalize a step that is not on the frontier', async () => {
    // Given an open workflow whose frontier does not hold the step "<key>"
    const instance = await start(root, 'checklist');
    const unchanged = snapshotPersistence(root);

    // When "wingfoil workflow finalize --step <key>" is run
    const result = await call('workflowFinalize', root, undefined, { step: 'checklist.tock' });

    // Then nothing is committed, and the message is "step '<key>' is not on the frontier of <instance>"
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'CONFLICT', message: `step 'checklist.tock' is not on the frontier of ${instance}` });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });

  it('P4.14 sc. 4: An approval no element carries is routed, then recorded by workflow finalize', async () => {
    // Given the step's actions move no element through a gate; When the step's other evidence is satisfied
    const instance = await start(root, 'signoff');

    // Then "workflow status" reports "human needed: finalize <step>" routed to "Morgan"
    const status = ok<StatusView>(await call('workflowStatus', root));
    expect(status.pendingApprovals).toHaveLength(1);
    const pending = status.pendingApprovals[0]!;
    expect(pending.step).toBe('signoff.review');
    expect(pending.awaiting).toMatchObject({ recordNeeded: true, elements: [], routedTo: [{ name: 'Morgan', email: 'morgan@example.invalid' }] });
    expect(renderStatusConsole(status as unknown as Parameters<typeof renderStatusConsole>[0])).toContain(
      'human needed: finalize signoff.review — routed to Morgan <morgan@example.invalid>',
    );

    // And only an identity holding the approver role can record it, with "wingfoil workflow finalize --reason"
    const unchanged = snapshotPersistence(root);
    const refused = await call('workflowFinalize', root, undefined, { reason: 'Signed off.' });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe('VALIDATION');
    expect(refused.error.message).toMatch(/^user not authorized to approve/);
    expect(exitCodeForResult(refused)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);

    // And the record carries "Approver: Morgan <email> (approver)" and the reason
    await asMorgan(async () => ok(await call('workflowFinalize', root, undefined, { reason: 'Signed off.' })));
    const message = lastMessage(root);
    expect(message.split('\n')[0]).toBe(`workflow: finalize ${instance} signoff.review`);
    expect(message).toContain('\n\nApprover: Morgan <morgan@example.invalid> (approver)\nReason: Signed off.\n');
    expect(git(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Phase,valueonly)']).trim()).toBe('signoff.review completed');
    expect(ok<NextView>(await call('workflowNext', root)).next?.key).toBe('signoff.close');
  });
});
