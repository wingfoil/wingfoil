/**
 * task-251 (`dl-149`) AC 2 at the CLI — a configuration file written in a format newer than this
 * build reads is refused with an actionable error at exit `1`, `spec-005` §1's code for a validation
 * failure. Runs the compiled `dist/cli.js` (built once by jest's globalSetup, bug-003) in a fixture
 * repository.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');
const UPGRADE = 'this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil';

const DNA = (format: string) =>
  `version: 1\nformat: ${format}\nmodules: []\nstacks:\n  technologies: []\n  methodologies: []\n` +
  'team:\n  members: []\n  roles:\n    - name: developer\npaths:\n  sources: [ src/ ]\n';

describe('a newer `format` at the CLI — exit 1, the file, the format and "upgrade WingFoil"', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8' });

  it('`dna show` on a format-2 dna.yaml: console', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA('2'));
    const result = run('dna', 'show');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('E_INVALID_FORMAT');
    expect(result.stderr).toContain('.wingfoil/dna.yaml');
    expect(result.stderr).toContain(UPGRADE);
  });

  it('`dna show --format json` on a format-2 dna.yaml: the `error` reason carries the same', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA('2'));
    const result = run('dna', 'show', '--format', 'json');
    expect(result.status).toBe(1);
    const { error } = JSON.parse(result.stderr) as { error: string };
    expect(error).toMatch(/^E_INVALID_FORMAT format \(.*\.wingfoil\/dna\.yaml\): /);
    expect(error).toContain(UPGRADE);
  });

  it('`dna show` on `format: 1.5`: exit 1, a schema error naming the field', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA('1.5'));
    const result = run('dna', 'show');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/E_VALIDATION format \(/);
  });

  it('`workflow list` with a format-2 workflow file: exit 1, the workflow file named', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1\ninclude:\n  - workflows/custom/main.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', 'name: main\nkind: main\nformat: 2\nphases:\n  - name: go\n');
    const result = run('workflow', 'list');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('E_INVALID_FORMAT format (workflows/custom/main.yaml)');
    expect(result.stderr).toContain(UPGRADE);
  });
});
