/**
 * task-312 AC 2 (`bug-255`), end to end — the bug's own reproduction through the registered `dna.dnaSet`
 * operation (the `CoreFn` behind `wingfoil dna set` and the MCP `dna.set` Tool), as
 * `test/core/dna-set.test.ts` drives it: a committed `dna.yaml` whose `project.name` line carries a tab
 * before its inline comment, `dna set project.name --value cd`, and the committed line must still hold the
 * tab. Before the fix the commit wrote `name: cd # your project name` — the tab turned into one space.
 *
 * Every write lands in a throwaway temp git repository.
 */
import { execFileSync } from 'node:child_process';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DNA_FIXTURE = `version: 1.1
project:
  name: ab\t# your project name
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The registered `dna.dnaSet` `CoreFn` — fails loudly if it is no longer registered. */
function dnaSetFn(): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'dna')?.operations.dnaSet;
  if (!operation) throw new Error('fixture bug: "dnaSet" operation not registered on the dna module');
  return operation.fn;
}

describe('task-312 AC 2 — `dna set` keeps the tab before an inline comment in the committed file (bug-255)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('the committed project.name line reads `  name: cd<TAB># your project name`', async () => {
    const result = await dnaSetFn()({ root: repo, positionals: ['project.name'], options: { value: 'cd' } });
    expect(result.ok).toBe(true);
    const committed = execFileSync('git', ['-C', repo, 'show', 'HEAD:.wingfoil/dna.yaml'], { encoding: 'utf-8' });
    expect(committed.split('\n')[2]).toBe('  name: cd\t# your project name');
    expect(committed).toBe(DNA_FIXTURE.replace('  name: ab\t', '  name: cd\t'));
  });
});
