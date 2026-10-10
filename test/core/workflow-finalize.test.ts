/**
 * task-226 — `wingfoil workflow finalize [<ref>] [--step <key>] [--reason <text>]` (`spec-017` §7.9, §4.3
 * `record`, §5.1, §5.4, §10, §11; ruling R11; `dl-104` D1 (b)–(c); REQ-SEC-01, REQ-SEC-03, P1.7), through the
 * registered `CORE_MODULES` operation, on fixture repositories committed at `HEAD`.
 *
 * - AC 1: finalizing a checkpoint writes one commit with no file change, subject `workflow: finalize
 *   <instance> <key>`, and the phase-record trailers (`WingFoil-Phase`, `WingFoil-Instance`, and
 *   `WingFoil-Element` or `WingFoil-Item` for a scoped step) in the final paragraph, where git's
 *   `%(trailers)` — the deduction's reader — finds them; the next deduction moves past the step; the
 *   result is the finalized step and the instance's new next step.
 * - AC 2: `step '<key>' is not on the frontier of <instance>` and `phase '<w>.<p>' completes from its
 *   evidence: <kinds>` (`CONFLICT`, exit 1); no git identity (REQ-SEC-01).
 * - AC 3: on an `approval:` phase, `memory approve`'s authority refusal, the `dl-067` reason refusals at
 *   exit 2, and `Approver:` / `Reason:` written as `memory approve` writes them, by the identity the commit
 *   is authored by (`bug-149`).
 * - AC 4 (characterization): `memory history` does not report the finalize commit.
 *
 * AC 5 (the empty-commit helper, the dirty index) is `test/storage/commit-empty.test.ts` and the last
 * `describe` here.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, deduceWorkflowStateAtHead } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

/** `WingFoil Test` (the fixture's `user.*`) holds no `approver` role; Morgan does. */
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
      roles: [ developer, qa ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: qa
    - name: approver
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
global: []
`;

/**
 * A bound workflow: `start` completes from the task's state, `red` is a checkpoint, `gate` an approval
 * checkpoint (no element carried), `review` completes from the task's state.
 */
const DELIVERY = `name: delivery
startable: true
element: task
phases:
  - name: start
    role: developer
    actions:
      - element.set_state(in-progress)
  - name: red
    role: qa
    actions:
      - agent.execute
  - name: gate
    role: reviewer
    approval: { by_role: approver }
  - name: review
    role: reviewer
    actions:
      - memory.submit
`;

/** An unbound workflow with one checkpoint: its step has no scope, so its record names no element. */
const RETRO = `name: retro
startable: true
phases:
  - name: additional-points
    role: developer
  - name: close
    role: developer
`;

/** A collection iteration (`dl-104` D2 (b)): the sub's checkpoint runs on `bindings:templates#kanban`. */
const SMOKE = `name: smoke
startable: true
phases:
  - name: each
    iterate_over: bindings:templates
    include: per-template
`;
const PER_TEMPLATE = `name: per-template
includable: true
phases:
  - name: check
    role: qa
`;

/** A third party (§5.4): the step completes by a record once its other evidence holds. */
const OUTREACH = `name: outreach
startable: true
element: release
phases:
  - name: announce
    role: developer
    awaits: { party: "the press office", evidence: "press.ack" }
`;

const BINDINGS_YAML = `version: 1.0
collections:
  templates: [ kanban ]
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/delivery.yaml': DELIVERY,
  'workflows/custom/retro.yaml': RETRO,
  'workflows/custom/smoke.yaml': SMOKE,
  'workflows/custom/per-template.yaml': PER_TEMPLATE,
  'workflows/custom/outreach.yaml': OUTREACH,
};

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId?: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\n${elementId === undefined ? '' : `element: "${elementId}"\n`}`);
}

/** The configuration, the elements and one open instance per workflow, committed. */
function buildRepo(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(WORKFLOWS).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  writeFixtureFile(root, 'docs/tasks/task-1.md', element('task', 'task-1', 'in-progress'));
  writeFixtureFile(root, 'docs/releases/rel-1.md', element('release', 'rel-1', 'planning'));
  commitAll(root, 'fixture configuration and elements');
  writeFixtureFile(root, 'docs/plans/plan-delivery.md', plan('plan-delivery', 'delivery', 'task-1'));
  writeFixtureFile(root, 'docs/plans/plan-retro.md', plan('plan-retro', 'retro'));
  writeFixtureFile(root, 'docs/plans/plan-smoke.md', plan('plan-smoke', 'smoke'));
  writeFixtureFile(root, 'docs/plans/plan-outreach.md', plan('plan-outreach', 'outreach', 'rel-1'));
  commitAll(root, 'wf(plan): add plan-delivery, plan-retro, plan-smoke, plan-outreach');
  return root;
}

interface FinalizeOutput {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly instance: { readonly id: string; readonly workflow: string };
  readonly finalized: { readonly key: string; readonly evidence: { readonly missing: readonly string[] } };
  readonly next: { readonly key: string } | null;
  readonly commit: string;
}

const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowFinalize'];

/** `workflow finalize` through the registered operation, as the CLI calls it. */
async function finalize(root: string, positional?: string, options: Record<string, string> = {}): Promise<CoreResult<FinalizeOutput>> {
  if (op === undefined) throw new Error('no workflowFinalize operation in CORE_MODULES');
  const value = await op.fn({ root, ...(positional === undefined ? {} : { positional }), options });
  return value as CoreResult<FinalizeOutput>;
}

async function finalizeOk(root: string, positional?: string, options: Record<string, string> = {}): Promise<FinalizeOutput> {
  const result = await finalize(root, positional, options);
  if (!result.ok) throw new Error(`workflow finalize refused: ${result.error.message}`);
  return result.value;
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();
const lastMessage = (root: string): string => git(root, ['log', '-1', '--format=%B']).trim();

/** The frontier step keys of `instance` at `HEAD`. */
function frontier(root: string, instance: string): string[] {
  const entry = deduceWorkflowStateAtHead(root).instances.find((candidate) => candidate.instance.id === instance);
  return (entry?.frontier ?? []).map((step) => step.key);
}

/** Run `fn` with `GIT_AUTHOR_*` naming Morgan, the approver, and restore the environment after. */
async function asApprover<T>(fn: () => Promise<T>): Promise<T> {
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

describe('task-226 — workflow finalize is registered (spec-017 §7, §9)', () => {
  it('workflowFinalize is a mutating operation of the workflow module: optional <ref>, options --step and --reason', () => {
    expect(op).toMatchObject({ name: 'workflowFinalize', mutates: true, positional: { name: 'ref' } });
    expect(op?.positional?.required).not.toBe(true);
    expect((op?.options ?? []).map((option) => option.name).sort()).toEqual(['reason', 'step']);
    expect(typeof op?.renderConsole).toBe('function');
  });
});

describe('task-226 AC 1 — a checkpoint is recorded by an empty commit carrying the phase-record trailers', () => {
  let root: string;
  beforeEach(() => {
    root = buildRepo();
  });
  afterEach(() => removeTempDir(root));

  it('finalizes the instance next step: subject, trailers in the final paragraph, no file change, and the deduction moves past it', async () => {
    expect(frontier(root, 'plan-delivery')).toEqual(['delivery.red@task:task-1']);
    const before = head(root);

    const result = await finalizeOk(root, 'plan-delivery');

    expect(git(root, ['rev-parse', 'HEAD~1']).trim()).toBe(before);
    expect(result.commit).toBe(head(root));
    expect(lastMessage(root)).toBe(
      [
        'workflow: finalize plan-delivery delivery.red@task:task-1',
        '',
        'WingFoil-Phase: delivery.red completed',
        'WingFoil-Instance: plan-delivery',
        `WingFoil-Element: task:task-1\n${STAMP_TRAILER.trim()}`,
      ].join('\n'),
    );
    // git reads the record's trailers: the deduction's reader (`%(trailers:only,unfold)`) sees them.
    expect(git(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Phase,valueonly)']).trim()).toBe('delivery.red completed');
    expect(git(root, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('');
    expect(frontier(root, 'plan-delivery')).toEqual(['delivery.gate@task:task-1']);
    expect(result.baseline).toEqual({ rev: 'HEAD', commit: before });
    expect(result.instance.id).toBe('plan-delivery');
    expect(result.finalized.key).toBe('delivery.red@task:task-1');
    expect(result.finalized.evidence.missing).toEqual(['record']);
    expect(result.next?.key).toBe('delivery.gate@task:task-1');
  });

  it('--step selects a frontier step by key', async () => {
    const result = await finalizeOk(root, 'plan-delivery', { step: 'delivery.red@task:task-1' });
    expect(result.finalized.key).toBe('delivery.red@task:task-1');
  });

  it('an unscoped step names no element; its next step is the following checkpoint', async () => {
    const result = await finalizeOk(root, 'retro');
    expect(lastMessage(root)).toBe(
      ['workflow: finalize plan-retro retro.additional-points', '', 'WingFoil-Phase: retro.additional-points completed', `WingFoil-Instance: plan-retro\n${STAMP_TRAILER.trim()}`].join('\n'),
    );
    expect(result.next?.key).toBe('retro.close');
    expect(frontier(root, 'plan-retro')).toEqual(['retro.close']);
  });

  it('a collection step writes WingFoil-Item; the iteration then completes and the instance has no next step', async () => {
    const result = await finalizeOk(root, 'smoke');
    expect(result.finalized.key).toBe('per-template.check@bindings:templates#kanban');
    expect(lastMessage(root)).toContain('\nWingFoil-Phase: per-template.check completed\nWingFoil-Instance: plan-smoke\nWingFoil-Item: bindings:templates#kanban\nWingFoil-Version: ');
    expect(result.next).toBeNull();
    expect(frontier(root, 'plan-smoke')).toEqual([]);
  });

  it('a third party (awaits) step completes by its record', async () => {
    const result = await finalizeOk(root, 'outreach');
    expect(result.finalized.key).toBe('outreach.announce@release:rel-1');
    expect(frontier(root, 'plan-outreach')).toEqual([]);
  });

  it('an optional --reason on a phase without approval is recorded as a Reason: line, with no Approver: line', async () => {
    await finalizeOk(root, 'retro', { reason: 'Nothing to add.' });
    const message = lastMessage(root);
    expect(message).toContain('\n\nReason: Nothing to add.\n\nWingFoil-Phase: retro.additional-points completed\n');
    expect(message).not.toContain('Approver:');
  });
});

describe('task-226 AC 2 — refusals: not on the frontier, completes from its evidence, no instance, no identity', () => {
  let root: string;
  beforeEach(() => {
    root = buildRepo();
  });
  afterEach(() => removeTempDir(root));

  it("refuses a step that is not on the frontier: CONFLICT, exit 1, nothing committed", async () => {
    const unchanged = snapshotPersistence(root);
    const result = await finalize(root, 'plan-delivery', { step: 'delivery.review@task:task-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'CONFLICT', message: "step 'delivery.review@task:task-1' is not on the frontier of plan-delivery" });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });

  it('refuses a step whose phase completes from its evidence: CONFLICT naming the missing kinds', async () => {
    // Back to backlog: `start` (state evidence) is the frontier step again.
    writeFixtureFile(root, 'docs/tasks/task-1.md', element('task', 'task-1', 'backlog'));
    commitAll(root, 'wf(task): edit task-1');
    expect(frontier(root, 'plan-delivery')).toEqual(['delivery.start@task:task-1']);
    const unchanged = snapshotPersistence(root);
    const result = await finalize(root, 'plan-delivery');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'CONFLICT', message: "phase 'delivery.start' completes from its evidence: state" });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });

  it('refuses a <ref> that names no open instance (spec-017 §10)', async () => {
    const result = await finalize(root, 'nope');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses with no open instance and no <ref>: no active workflow to finalize', async () => {
    const empty = makeTempGitRepo();
    try {
      writeFixtureFile(empty, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/retro.yaml\n');
      writeFixtureFile(empty, '.wingfoil/workflows/custom/retro.yaml', RETRO);
      writeFixtureFile(empty, '.wingfoil/memory.yaml', MEMORY_YAML);
      writeFixtureFile(empty, '.wingfoil/dna.yaml', DNA_YAML);
      commitAll(empty, 'configuration');
      const result = await finalize(empty);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ code: 'NOT_FOUND', message: 'no active workflow to finalize' });
    } finally {
      removeTempDir(empty);
    }
  });

  it('refuses an instance with no next step: CONFLICT, with next\'s message', async () => {
    await finalizeOk(root, 'outreach');
    const result = await finalize(root, 'plan-outreach');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'CONFLICT', message: "no next step: workflow 'outreach' is complete" });
  });
});

describe('task-226 AC 2 — REQ-SEC-01: no git identity, nothing written', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'] as const;
  const saved: Record<string, string | undefined> = {};
  let root: string;
  let scratch: string;

  beforeEach(() => {
    root = buildRepo();
    git(root, ['config', '--unset', 'user.name']);
    git(root, ['config', '--unset', 'user.email']);
    scratch = mkdtempSync(join(tmpdir(), 'wf-finalize-noid-'));
    const emptyConfig = join(scratch, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    for (const key of ISOLATION_KEYS) delete process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(root);
    rmSync(scratch, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message, exit 1, and writes nothing', async () => {
    const unchanged = snapshotPersistence(root);
    const result = await finalize(root, 'plan-delivery');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('git identity not configured (user.name/user.email)');
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });
});

describe('task-226 AC 3 — an approval phase: authority, a dl-067 reason, Approver: and Reason: as memory approve writes them', () => {
  let root: string;
  beforeEach(async () => {
    root = buildRepo();
    await finalizeOk(root, 'plan-delivery'); // `red`: `gate` is next
    expect(frontier(root, 'plan-delivery')).toEqual(['delivery.gate@task:task-1']);
  });
  afterEach(() => removeTempDir(root));

  it("an identity without the approver role gets memory approve's refusal (exit 1), nothing written", async () => {
    const unchanged = snapshotPersistence(root);
    const result = await finalize(root, 'plan-delivery', { reason: 'Looks right.' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'VALIDATION', message: "user not authorized to approve type 'task'" });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });

  it.each([
    ['missing', {}, 'missing required argument: --reason'],
    ['blank', { reason: '   ' }, 'invalid flag value: --reason must not be blank'],
    ['Approver:-leading', { reason: 'Approver: Mallory <m@example.invalid> (approver)' }, 'invalid flag value: --reason must not contain a line starting with "Approver:", "Reason:" or "WingFoil-Version:"'],
  ])('a %s --reason is a usage error (exit 2), nothing written', async (_label, options, message) => {
    const unchanged = snapshotPersistence(root);
    await asApprover(async () => {
      const call = finalize(root, 'plan-delivery', options as Record<string, string>);
      await expect(call).rejects.toThrow(UsageError);
      await expect(finalize(root, 'plan-delivery', options as Record<string, string>)).rejects.toThrow(message);
    });
    assertPersistenceUnchanged(root, unchanged);
  });

  it('a valid reason by the approver writes Approver: and Reason: in the body, the commit authored by that one identity (bug-149)', async () => {
    const result = await asApprover(() => finalizeOk(root, 'plan-delivery', { reason: '  The gate is passed.\nSecond line.  ' }));
    expect(result.finalized.key).toBe('delivery.gate@task:task-1');
    expect(lastMessage(root)).toBe(
      [
        'workflow: finalize plan-delivery delivery.gate@task:task-1',
        '',
        'Approver: Morgan <morgan@example.invalid> (approver)',
        'Reason: The gate is passed.',
        'Second line.',
        '',
        'WingFoil-Phase: delivery.gate completed',
        'WingFoil-Instance: plan-delivery',
        `WingFoil-Element: task:task-1\n${STAMP_TRAILER.trim()}`,
      ].join('\n'),
    );
    expect(git(root, ['log', '-1', '--format=%an <%ae>']).trim()).toBe('Morgan <morgan@example.invalid>');
    expect(frontier(root, 'plan-delivery')).toEqual(['delivery.review@task:task-1']);
  });
});

describe('task-226 AC 4 (characterization) — memory history does not report the finalize commit', () => {
  let root: string;
  beforeEach(() => {
    root = buildRepo();
  });
  afterEach(() => removeTempDir(root));

  it('neither the bound element nor the plan lists it', async () => {
    const { commit } = await finalizeOk(root, 'plan-delivery');
    const history = CORE_MODULES.find((module) => module.name === 'memory')?.operations['memoryHistory'];
    for (const id of ['task-1', 'plan-delivery']) {
      const value = (await history!.fn({ root, positional: id })) as CoreResult<{ entries: { sha: string }[] }> | { entries: { sha: string }[] };
      const entries = 'ok' in value ? (value.ok ? value.value.entries : []) : value.entries;
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.map((entry) => entry.sha)).not.toContain(commit);
    }
  });
});

describe('task-226 AC 5 — a staged change is refused, never swept into the record (dl-106)', () => {
  let root: string;
  beforeEach(() => {
    root = buildRepo();
  });
  afterEach(() => removeTempDir(root));

  it('refuses on a dirty index (exit 1), leaving HEAD and the staged change as they were', async () => {
    writeFixtureFile(root, 'notes.txt', 'staged by the operator\n');
    git(root, ['add', 'notes.txt']);
    const unchanged = snapshotPersistence(root);
    const result = await finalize(root, 'plan-delivery');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/^refusing to commit 'workflow: finalize plan-delivery delivery\.red@task:task-1': the index holds staged changes \(notes\.txt\)/);
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
    expect(git(root, ['diff', '--cached', '--name-only']).trim()).toBe('notes.txt');
  });
});
