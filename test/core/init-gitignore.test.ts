/**
 * task-336 AC 5 (red-first) — `.wingfoil/run/` is the one git-ignored subpath `wingfoil init` writes (`spec-011`
 * § `.gitignore` policy and § Directory layout, as amended at the design gate; `spec-016` §7; `dl-135` Q1 (a),
 * `dl-181`; approver ruling D2 (a)).
 *
 * For each built-in template, `initWingfoilProject(repo, <template>)`:
 * - writes `.wingfoil/.gitignore` holding exactly a comment line and `/run/`;
 * - commits it in the init commit, with the rest of the scaffold;
 * - so `git check-ignore` reports a registry entry under `.wingfoil/run/` ignored, and nothing else under `.wingfoil/`;
 * - writes no root `.gitignore`: the user's file is never written.
 * `templateScaffold` lists the file, so `wingfoil init`'s one commit holds it.
 *
 * Today the scaffold has no `.wingfoil/.gitignore` (`grep -n gitignore src/core/init.ts src/storage/templates.ts` →
 * nothing).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { initWingfoilProject } from '../../src/core/init';
import { templateScaffold, TEMPLATES } from '../../src/storage/templates';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

const GITIGNORE = "# wingfoil agent execute's registry of running agents: local to this checkout, never committed.\n/run/\n";

describe.each(TEMPLATES.map((def) => [def.name] as const))('task-336 AC 5 — wingfoil init (%s) git-ignores .wingfoil/run/ (spec-011 § .gitignore policy)', (name) => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    const result = initWingfoilProject(repo, name);
    if (!result.ok) throw new Error(result.error.message);
  });
  afterAll(() => removeTempDir(repo));

  it('the scaffold lists .wingfoil/.gitignore with its two lines', () => {
    const def = TEMPLATES.find((candidate) => candidate.name === name)!;
    expect(templateScaffold(def).filter((file) => file.path === '.wingfoil/.gitignore')).toEqual([{ path: '.wingfoil/.gitignore', content: GITIGNORE }]);
  });

  it('.wingfoil/.gitignore holds exactly the comment line and /run/', () => {
    expect(readFileSync(join(repo, '.wingfoil', '.gitignore'), 'utf-8')).toBe(GITIGNORE);
  });

  it('it is in the init commit', () => {
    expect(git(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n')).toContain('.wingfoil/.gitignore');
  });

  it('git check-ignore reports a registry entry ignored, and a config file not', () => {
    expect(spawnSync('git', ['check-ignore', '-q', '.wingfoil/run/x/adhoc/1.json'], { cwd: repo }).status).toBe(0);
    expect(spawnSync('git', ['check-ignore', '-q', '.wingfoil/dna.yaml'], { cwd: repo }).status).toBe(1);
  });

  it('no root .gitignore is written', () => {
    expect(existsSync(join(repo, '.gitignore'))).toBe(false);
  });
});
