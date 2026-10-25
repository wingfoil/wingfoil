/**
 * task-294 (developer, refactor) — the `workflow adopt` branches the red suites do not reach in-process
 * (`spec-017` §7.11, §10; design "Refusal order", D7): an element in a conflict counts as owned (its first claim
 * named), an adoption that completes the instance (`next: null`), a record orphan (`element: null`), a missing
 * `<ref>` from an in-process caller, the REQ-SEC-01 identity refusal on both writing forms, a `--plan --apply`
 * refused at its first commit (`details.applied`), the console of an in-process adoption with a next step, and
 * `planAdoptions` on an instance that is not open.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { workflowAdoptAtHead } from '../../src/core/workflow-adopt';
import { readDeductionSnapshotAtHead } from '../../src/core/workflow-deduction';
import { planAdoptions } from '../../src/workflow/adopt';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { adopt, adoptionByHand, as, buildLifeRepo, INSTANCE, MORGAN, ok, start, workflowOperation, type AdoptPlanView, type AdoptResultView } from './helpers/adopt-fixture';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(removeTempDir));
function repo(options?: Parameters<typeof buildLifeRepo>[0]): string {
  const root = buildLifeRepo(options);
  roots.push(root);
  return root;
}

function refusal(result: CoreResult<unknown>): { code: string; message: string; details?: unknown } {
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
}

const REASON = { reason: 'created by hand before the engine' };

describe('task-294 — single-form branches', () => {
  it('an element whose claims conflict (two sibling adoptions) is refused as owned, naming its first claim', async () => {
    const root = repo();
    await start(root);
    git(root, ['branch', 'side']);
    adoptionByHand(root, INSTANCE, 'life.seed', 'release-line:rl-v1');
    git(root, ['checkout', '--quiet', 'side']);
    // A different reason, so the sibling is a different commit.
    git(root, ['commit', '--allow-empty', '--quiet', '-m', `workflow: adopt ${INSTANCE} life.seed release-line:rl-v1`, '-m', 'Reason: adopted on the side branch', '-m', `WingFoil-Instance: ${INSTANCE}\nWingFoil-Step: life.seed\nWingFoil-Adopted: release-line:rl-v1`]);
    git(root, ['checkout', '--quiet', 'main']);
    git(root, ['merge', '--quiet', '--no-ff', '--no-edit', 'side']);
    const before = snapshotPersistence(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', ...REASON } });

    expect(refusal(result)).toMatchObject({ code: 'CONFLICT', message: `release-line:rl-v1 is already owned by ${INSTANCE} life.seed; move it with workflow transfer` });
    assertPersistenceUnchanged(root, before, 'conflicted element');
  });

  it('an adoption that completes the instance answers next: null, and the console says "no next step"', async () => {
    const root = repo({ phases: ['seed'] });
    await start(root);
    const value = ok<AdoptResultView>(await adopt(root, { positional: INSTANCE, options: { element: 'release-line:rl-v1', ...REASON } }));
    expect(value.next).toBeNull();
    expect(workflowOperation('workflowAdopt').renderConsole!(value)).toBe(`workflow: life (${INSTANCE})\nadopted: release-line:rl-v1 into life.seed (${value.adopted[0]!.commit})\nno next step\n`);
  });

  it('an adoption with a next step renders it under "next step"', async () => {
    const root = repo();
    await start(root);
    const value = ok<AdoptResultView>(await adopt(root, { positional: INSTANCE, options: { element: 'release-line:rl-v1', ...REASON } }));
    const text = workflowOperation('workflowAdopt').renderConsole!(value);
    expect(text.split('\n')[2]).toContain('life.close@release-line:rl-v1');
  });

  it('an in-process call without <ref> is the usage refusal the CLI gives (exit 2)', () => {
    const root = repo();
    let thrown: unknown;
    try {
      workflowAdoptAtHead(root, { plan: true, apply: false });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as Error).message).toBe('missing required argument: <ref>');
    expect(exitCodeForThrow(thrown).exitCode).toBe(2);
  });
});

describe('task-294 — --plan orphans and --apply refused at its first commit', () => {
  it('a phase record naming an undeclared phase is an orphan with element: null', async () => {
    const root = repo();
    await start(root);
    git(root, ['commit', '--allow-empty', '--quiet', '-m', `workflow: finalize ${INSTANCE} life.gone`, '-m', `WingFoil-Phase: life.gone completed\nWingFoil-Instance: ${INSTANCE}`]);
    const record = git(root, ['rev-parse', 'HEAD']).trim();
    const value = ok<AdoptPlanView>(await adopt(root, { positional: INSTANCE, flags: { plan: true } }));
    expect(value.orphans).toEqual([{ commit: record, key: 'life.gone', element: null }]);
  });

  it('a staged index refuses the first adoption of --plan --apply: the refusal carries details.applied, nothing is written', async () => {
    const root = repo();
    await start(root);
    writeFixtureFile(root, 'notes.txt', 'staged\n');
    git(root, ['add', '--', 'notes.txt']);
    const before = git(root, ['rev-parse', 'HEAD']).trim();

    const result = await as(MORGAN, () => adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'bulk' } }));

    const error = refusal(result);
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toMatch(/^refusing to commit 'workflow: adopt life-1-plan life\.seed release-line:rl-v1': the index holds staged changes/);
    expect((error.details as { applied?: unknown }).applied).toEqual([]);
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });
});

describe('task-294 — REQ-SEC-01: no git identity refuses both writing forms before anything is read', () => {
  const KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  const saved: Record<string, string | undefined> = {};
  let root: string;
  beforeEach(async () => {
    root = repo();
    await start(root);
    git(root, ['config', '--unset', 'user.email']);
    git(root, ['config', '--unset', 'user.name']);
    const empty = join(mkdtempSync(join(tmpdir(), 'wf-adopt-noid-')), 'empty.gitconfig');
    writeFileSync(empty, '');
    for (const key of KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = empty;
    process.env.GIT_CONFIG_SYSTEM = empty;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it.each([
    ['the single form', { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', ...REASON } }],
    ['--plan --apply', { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'bulk' } }],
  ] as const)('%s', async (_label, invocation) => {
    const result = await adopt(root, invocation);
    expect(refusal(result).message).toBe('git identity not configured (user.name/user.email)');
  });
});

describe('task-294 — a spec-003 error at HEAD', () => {
  it('is VALIDATION, exit 1, as every workflow operation maps it', async () => {
    const root = repo();
    await start(root);
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/life.yaml\n  - workflows/custom/missing.yaml\n');
    git(root, ['commit', '--quiet', '-am', 'include a workflow file that does not exist']);
    const result = await adopt(root, { positional: INSTANCE, flags: { plan: true } });
    expect(refusal(result).code).toBe('VALIDATION');
  });
});

describe('task-294 — planAdoptions on an instance that is not open', () => {
  it('proposes nothing', async () => {
    const root = repo();
    await start(root);
    expect(planAdoptions(readDeductionSnapshotAtHead(root), 'nope-1-plan')).toEqual({ instance: 'nope-1-plan', steps: [] });
  });
});
