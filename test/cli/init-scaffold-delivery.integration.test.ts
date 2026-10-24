/**
 * task-296 (bug-400, patch-v0.3.1), independent-review fixes F2 and F4 — the developer's own pins, beside the
 * qa agent's red file `init-scaffold-workflows.integration.test.ts`:
 *
 * - F2: the last step of `P5.1.1-init.feature`'s scenario outline "The scaffold's workflows can be driven by the
 *   workflow commands": once the finalize loop stops at `<slug>-delivery.plan`, adding a task through the step
 *   (`memory add --workflow … --step …`) and submitting it moves the workflow on to `<slug>-delivery.build`.
 * - F4: on the unedited scaffold, the first `dna add team.agents …` fills the active `agents: []` and keeps every
 *   comment, the commented example included (design D4, the "fill an empty `[]`" path).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { load as loadYaml } from 'js-yaml';

import { TEMPLATES } from '../../src/storage/templates';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

jest.setTimeout(120_000);

/** More than the scaffold's checkpoint count before `plan`: the loop stops on the refused finalize. */
const MAX_FINALIZES = 20;

const DNA_PATH = join('.wingfoil', 'dna.yaml');

function nextKey(repo: string): string | null {
  const run = runCliEntry(repo, ['workflow', 'next', '--format', 'json']);
  expect([run.status, run.stderr]).toEqual([0, '']);
  return (JSON.parse(run.stdout) as { next: { key: string } | null }).next?.key ?? null;
}

function commentLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trimStart().startsWith('#'));
}

for (const def of TEMPLATES) {
  describe(`task-296 review fixes — ${def.name}`, () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
      const init = runCliEntry(repo, ['init', '--template', def.name]);
      expect([init.status, init.stderr]).toEqual([0, '']);
    });
    afterEach(() => removeTempDir(repo));

    it(`F2: after the finalize loop stops at ${def.slug}-delivery.plan, a task added through the step and submitted moves it to ${def.slug}-delivery.build`, () => {
      expect(runCliEntry(repo, ['workflow', 'start', 'sw-life-cycle']).status).toBe(0);
      const plan = `${def.slug}-delivery.plan`;
      for (let i = 0; i < MAX_FINALIZES && nextKey(repo) !== plan; i += 1) {
        expect(runCliEntry(repo, ['workflow', 'finalize']).status).toBe(0);
      }
      expect(nextKey(repo)).toBe(plan);
      expect(runCliEntry(repo, ['workflow', 'finalize']).status).toBe(1);

      const add = runCliEntry(repo, [
        'memory', 'add', '--type', 'task', '--title', 'Login form',
        '--workflow', 'sw-life-cycle-1-plan', '--step', plan, '--format', 'json',
      ]);
      expect([add.status, add.stderr]).toEqual([0, '']);
      const { id } = JSON.parse(add.stdout) as { id: string };
      // Added but not submitted: plan still waits for the created task to reach its exit state.
      expect(nextKey(repo)).toBe(plan);

      const submit = runCliEntry(repo, ['memory', 'submit', id]);
      expect(submit.status).toBe(0);
      expect(nextKey(repo)).toBe(`${def.slug}-delivery.build`);
    });

    it('F4: the first `dna add team.agents` fills the scaffold\'s `agents: []` and keeps every comment, the example included', () => {
      const before = readFileSync(join(repo, DNA_PATH), 'utf-8');
      expect(before).toMatch(/^ {2}agents: \[\]$/m);
      expect(before).toMatch(/^ {2}# agents:$/m);

      const run = runCliEntry(repo, [
        'dna', 'add', 'team.agents', '--value', 'claude', '--entry-adapter', 'claude-code',
        '--entry-email', 'noreply@anthropic.com', '--entry-executes_as', 'developer,reviewer',
      ]);
      expect([run.status, run.stderr]).toEqual([0, '']);

      const after = readFileSync(join(repo, DNA_PATH), 'utf-8');
      expect(commentLines(after)).toEqual(commentLines(before));
      expect(after).not.toMatch(/^ {2}agents: \[\]$/m);
      const dna = loadYaml(after) as { team: { agents: unknown[] } };
      expect(dna.team.agents).toEqual([
        { name: 'claude', email: 'noreply@anthropic.com', executes_as: ['developer', 'reviewer'], adapter: 'claude-code' },
      ]);
    });
  });
}
