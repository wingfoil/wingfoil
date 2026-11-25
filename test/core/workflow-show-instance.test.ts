/**
 * task-374 AC 7 (`bug-359`) — `wingfoil workflow show <instance plan id>` (`spec-017` §7.6 "An instance plan's id",
 * §8 `ShowResult.instance`, §10, as amended at the design gate; BDD P4.7 "Show names the workflow of an instance
 * plan's id"), through the registered `CORE_MODULES` operation `workflow.workflowShow` and the compiled CLI.
 *
 * - A closed instance plan's id (`old-1-plan`, `status: done`, of `test/core/helpers/ref-not-open-fixture.ts`) stands
 *   for its workflow and the payload says so: `instance: { id, workflow, open: false }`.
 * - An open instance's id (`sw-life-cycle-1-plan` of `test/core/helpers/held-ungated-fixture.ts`) gives `open: true`.
 * - A workflow name gives no `instance` key; a phase plan's id stays `unknown workflow: <ref>`; an instance plan naming
 *   a workflow the registry does not load is `unknown workflow: <that name>`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { HELD_INSTANCE, writeHeldUngatedProject } from './helpers/held-ungated-fixture';
import { writeRefProject } from './helpers/ref-not-open-fixture';

const FEATURES = join(__dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p4-workflow');
const P4_7 = readFileSync(join(FEATURES, 'P4.7-workflow-show.feature'), 'utf-8');

const showOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowShow'];

interface ShowValue {
  readonly workflow: { readonly name: string };
  readonly instance?: { readonly id: string; readonly workflow: string; readonly open: boolean };
}

async function show(root: string, ref: string): Promise<CoreResult<ShowValue>> {
  if (showOp === undefined) throw new Error('no workflowShow operation in CORE_MODULES');
  const value = await showOp.fn({ root, positional: ref });
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<ShowValue>;
}

function ok(result: CoreResult<ShowValue>): ShowValue {
  if (!result.ok) throw new Error(`workflow show refused: ${result.error.code}: ${result.error.message}`);
  return result.value;
}

describe('task-374 BDD — P4.7 carries "Show names the workflow of an instance plan\'s id" (bug-359)', () => {
  it('the scenario is in the feature file', () => {
    expect(P4_7).toContain("  Scenario: Show names the workflow of an instance plan's id\n");
  });
});

describe('task-374 AC 7 — show takes any instance plan\'s id (spec-017 §7.6)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeRefProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('a closed instance plan\'s id stands for its workflow: release-cycle, instance { id, workflow, open: false }', async () => {
    const value = ok(await show(repo, 'old-1-plan'));
    expect(value.workflow.name).toBe('release-cycle');
    expect(value.instance).toEqual({ id: 'old-1-plan', workflow: 'release-cycle', open: false });
  });

  it('a workflow name gives no instance key', async () => {
    const value = ok(await show(repo, 'release-cycle'));
    expect(value.workflow.name).toBe('release-cycle');
    expect(Object.keys(value)).not.toContain('instance');
  });

  it('a phase plan\'s id stays NOT_FOUND "unknown workflow: phase-1-plan" (spec-017 §10)', async () => {
    expect(await show(repo, 'phase-1-plan')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'unknown workflow: phase-1-plan' } });
  });

  it('CLI: workflow show old-1-plan --format json exits 0 and prints the instance', () => {
    const run = runCliEntry(repo, ['workflow', 'show', 'old-1-plan', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = JSON.parse(run.stdout) as ShowValue;
    expect(value.workflow.name).toBe('release-cycle');
    expect(value.instance).toEqual({ id: 'old-1-plan', workflow: 'release-cycle', open: false });
  });

  it('CLI: a phase plan\'s id still exits 1 with "unknown workflow: phase-1-plan"', () => {
    const run = runCliEntry(repo, ['workflow', 'show', 'phase-1-plan', '--format', 'json']);
    expect([run.status, run.stdout]).toEqual([1, '']);
    expect(JSON.parse(run.stderr)).toEqual({ error: 'unknown workflow: phase-1-plan' });
  });
});

describe('task-374 AC 7 — an open instance\'s id, and an instance plan naming an unloaded workflow', () => {
  it('an open instance\'s id: instance { id, workflow, open: true }', async () => {
    const repo = makeTempGitRepo();
    try {
      writeHeldUngatedProject(repo);
      const value = ok(await show(repo, HELD_INSTANCE));
      expect(value.workflow.name).toBe('sw-life-cycle');
      expect(value.instance).toEqual({ id: HELD_INSTANCE, workflow: 'sw-life-cycle', open: true });
    } finally {
      removeTempDir(repo);
    }
  });

  it('an instance plan naming a workflow the registry does not load: NOT_FOUND "unknown workflow: <that name>"', async () => {
    const repo = makeTempGitRepo();
    try {
      writeRefProject(repo);
      writeFixtureFile(repo, 'docs/plans/gone-1-plan.md', '---\nid: "gone-1-plan"\ntype: plan\ntitle: "gone-1-plan"\nstatus: done\nworkflow: "retired-cycle"\nphase: "x"\nelement: "minor-1"\nparent: ""\n---\n\n## Body\n');
      commitAll(repo, 'a closed plan of a workflow no longer loaded');
      expect(await show(repo, 'gone-1-plan')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'unknown workflow: retired-cycle' } });
    } finally {
      removeTempDir(repo);
    }
  });
});
