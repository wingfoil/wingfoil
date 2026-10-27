/**
 * task-296 (bug-400, patch-v0.3.1) — a project `wingfoil init --template Scrum|Kanban` creates can be driven
 * by the 0.3 workflow commands: `workflow start sw-life-cycle` then `workflow next` names a role, and the
 * delivery workflow's `plan` phase, which adds tasks, cannot be completed by `workflow finalize` alone
 * (bug-400 step 4 no longer reproduces). BDD: `P5.1.1-init.feature`, the scenario the task adds (D6).
 *
 * Also: the scaffold loads with zero workflow diagnostics through `initWingfoilProject` in process (AC 3 (b)),
 * and `docs/examples/01-first-project/run.sh` still passes on the scaffold (AC 4, characterization).
 * The scaffold's own shape is pinned in process by `test/storage/templates-workflows.test.ts`.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

import { initWingfoilProject } from '../../src/core/init';
import { loadWorkflowRegistryAtHead } from '../../src/core/workflow-registry';
import { TEMPLATES } from '../../src/storage/templates';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';

jest.setTimeout(120_000);

const REPO_ROOT = join(__dirname, '..', '..');
const EXAMPLE_01 = join(REPO_ROOT, 'docs', 'examples', '01-first-project', 'run.sh');

/** More than the scaffold's step count: the loop below stops on completion or on a refused finalize. */
const MAX_FINALIZES = 20;

interface NextView {
  complete: boolean;
  next: { key: string; role: string | null } | null;
}

function nextJson(repo: string): NextView {
  const run = runCliEntry(repo, ['workflow', 'next', '--format', 'json']);
  expect([run.status, run.stderr]).toEqual([0, '']);
  return JSON.parse(run.stdout) as NextView;
}

function finalizeSubjects(repo: string): number {
  return git(repo, ['log', '--format=%s'])
    .split('\n')
    .filter((s) => s.startsWith('workflow: finalize')).length;
}

describe('task-296 AC 2 (b) — the scaffold\'s sw-life-cycle is guided, and plan is not finalizable (bug-400 step 4)', () => {
  for (const def of TEMPLATES) {
    describe(def.name, () => {
      let repo: string;

      beforeEach(() => {
        repo = makeTempGitRepo();
        const init = runCliEntry(repo, ['init', '--template', def.name]);
        expect([init.status, init.stderr]).toEqual([0, '']);
      });
      afterEach(() => removeTempDir(repo));

      it('workflow start sw-life-cycle, then workflow next names the role product-owner', () => {
        const start = runCliEntry(repo, ['workflow', 'start', 'sw-life-cycle']);
        expect(start.status).toBe(0);
        expect(nextJson(repo).next?.role).toBe('product-owner');
      });

      it(`finalizing every step stops at ${def.slug}-delivery.plan, which completes only from its produces evidence`, () => {
        expect(runCliEntry(repo, ['workflow', 'start', 'sw-life-cycle']).status).toBe(0);

        let refused: { status: number; stderr: string } | null = null;
        for (let i = 0; i < MAX_FINALIZES && refused === null; i += 1) {
          if (nextJson(repo).complete) break;
          const finalize = runCliEntry(repo, ['workflow', 'finalize']);
          if (finalize.status !== 0) refused = { status: finalize.status, stderr: finalize.stderr };
        }

        expect(refused?.status).toBe(1);
        expect(refused?.stderr).toContain(`phase '${def.slug}-delivery.plan' completes from its evidence: produces`);
        const next = runCliEntry(repo, ['workflow', 'next']);
        expect(next.status).toBe(0);
        expect(next.stdout).not.toContain('is complete');
        // inception and specification are checkpoints; nothing else was recorded by finalize.
        expect(finalizeSubjects(repo)).toBe(2);
      });
    });
  }
});

describe('task-296 AC 3 (b) — the scaffold loads with zero workflow diagnostics (characterization)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: initWingfoilProject, then loadWorkflowRegistryAtHead reports no diagnostic`, () => {
      const repo = makeTempGitRepo();
      try {
        const init = initWingfoilProject(repo, def.name);
        expect(init.ok).toBe(true);
        const registry = loadWorkflowRegistryAtHead(repo);
        expect(registry.diagnostics).toEqual([]);
        expect(registry.workflows.length).toBeGreaterThan(0);
      } finally {
        removeTempDir(repo);
      }
    });
  }
});

describe('task-296 AC 4 — docs/examples/01-first-project runs on the scaffold (characterization)', () => {
  // Example 01 initialises with `--template Scrum` by its own text, so it runs once, not per template.
  it('run.sh exits 0 and prints its OK line, with WINGFOIL set to the built CLI', () => {
    const run = spawnSync('bash', [EXAMPLE_01], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, WINGFOIL: `node ${CLI_ENTRY}` },
    });
    expect(run.error).toBeUndefined();
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('OK: first project: init → add → submit → approve');
  });
});
