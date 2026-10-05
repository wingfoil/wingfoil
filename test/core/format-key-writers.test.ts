/**
 * task-251 (`dl-149`) AC 2 and AC 3 on the two writers that edit a configuration file: `directive
 * assign` (`roles.yaml`) and `dna set` (`dna.yaml`). A file written in a newer format is never
 * rewritten by this build: it is refused, exit 1, with the same "upgrade WingFoil" error a loader gives,
 * and the file and `HEAD` are left as they were. Neither writer may produce a file this build cannot
 * read: `dna set format …` to a newer or a non-integer value is refused by the schema.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const UPGRADE = 'this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil';

function operation(module: string, name: string): CoreFn<unknown, unknown> {
  const found = CORE_MODULES.find((candidate) => candidate.name === module)?.operations[name];
  if (!found) throw new Error(`fixture bug: ${module}.${name} not registered`);
  return found.fn;
}

const head = (repo: string): string => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

describe('writers refuse a newer format and never write one', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = initWingfoilProject(repo, 'Scrum');
    if (!init.ok) throw new Error(`fixture bug: init failed — ${init.error.message}`);
  });
  afterEach(() => removeTempDir(repo));

  /** Rewrite `file`'s `format: 1` line to `format: 2`, commit it, and return the committed text. */
  const bumpFormat = (file: string): string => {
    const text = readFileSync(join(repo, file), 'utf-8').replace(/^format: 1$/m, 'format: 2');
    expect(text).toMatch(/^format: 2$/m);
    writeFixtureFile(repo, file, text);
    commitAll(repo, `fixture: ${file} in format 2`);
    return text;
  };

  const expectRefusedUnchanged = (result: CoreResult<unknown>, file: string, text: string, before: string): void => {
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('E_INVALID_FORMAT');
    expect(result.error.message).toContain(UPGRADE);
    expect(readFileSync(join(repo, file), 'utf-8')).toBe(text);
    expect(head(repo)).toBe(before);
  };

  it('`directive assign` on a format-2 roles.yaml', async () => {
    const text = bumpFormat('.wingfoil/roles.yaml');
    const before = head(repo);
    const result = (await operation('directive', 'directiveAssign')({
      root: repo,
      options: { directive: 'testing', role: 'reviewer' },
    })) as CoreResult<unknown>;
    expectRefusedUnchanged(result, '.wingfoil/roles.yaml', text, before);
  });

  it('`dna set` on a format-2 dna.yaml', async () => {
    const text = bumpFormat('.wingfoil/dna.yaml');
    const before = head(repo);
    const result = (await operation('dna', 'dnaSet')({
      root: repo,
      positionals: ['project.name'],
      options: { value: 'demo' },
    })) as CoreResult<unknown>;
    expectRefusedUnchanged(result, '.wingfoil/dna.yaml', text, before);
  });

  it.each([['2'], ['1.5']])('`dna set format --value %s` is refused: the edit would produce a file this build cannot read', async (value) => {
    const text = readFileSync(join(repo, '.wingfoil/dna.yaml'), 'utf-8');
    const before = head(repo);
    const result = (await operation('dna', 'dnaSet')({ root: repo, positionals: ['format'], options: { value } })) as CoreResult<unknown>;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toMatch(/format/);
    expect(readFileSync(join(repo, '.wingfoil/dna.yaml'), 'utf-8')).toBe(text);
    expect(head(repo)).toBe(before);
  });
});
