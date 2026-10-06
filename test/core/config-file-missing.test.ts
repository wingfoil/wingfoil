/**
 * task-179 (`bug-245`) — the working-tree configuration loaders name a missing or invalid file
 * repository-relative, never by the host's absolute path: a missing file is a `ConfigFileMissingError`
 * (still `code: 'ENOENT'`, so `coreErrorOf` maps it to `NOT_FOUND`), and any other read failure
 * propagates unchanged.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigFileMissingError, coreErrorOf, loadDnaYaml, loadMemoryYaml, loadRolesYaml } from '../../src/core';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

describe('ConfigFileMissingError — a missing configuration file, named from the project root', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/.gitkeep', '');
  });

  afterEach(() => removeTempDir(repo));

  it.each([
    ['dna.yaml', loadDnaYaml],
    ['memory.yaml', loadMemoryYaml],
    ['roles.yaml', loadRolesYaml],
  ] as const)('a missing %s', (file, load) => {
    let thrown: unknown;
    try {
      load(repo);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigFileMissingError);
    const error = thrown as ConfigFileMissingError;
    expect(error.relativePath).toBe(`.wingfoil/${file}`);
    expect(error.code).toBe('ENOENT');
    expect(error.message).toMatch(new RegExp(`^\\.wingfoil/${file.replace('.', '\\.')} is missing: `));
    expect(error.message).not.toContain(repo);
    expect(coreErrorOf(error)).toEqual({ code: 'NOT_FOUND', message: error.message });
  });

  it('any other read failure propagates as it was (a directory where the file should be)', () => {
    mkdirSync(join(repo, '.wingfoil', 'dna.yaml'));
    expect(() => loadDnaYaml(repo)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });
});
