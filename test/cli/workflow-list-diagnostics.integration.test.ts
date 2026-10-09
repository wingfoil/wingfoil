/**
 * task-136 review, finding 4 — the reason `workflow list` prints for a spec-003 error names the first
 * error's code and file (and path), as the pre-task `ValidationError` reason did. Runs the compiled
 * `dist/cli.js` (built once by jest's globalSetup, bug-003) in a fixture repository.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');

describe('`wingfoil workflow list` — a spec-003 error names its code and file', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n  - workflows/custom/bad.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', 'name: main\nkind: main\nphases:\n  - name: go\n');
    // A phase with no `name`: a structural failure whose bare message names no file.
    writeFixtureFile(repo, '.wingfoil/workflows/custom/bad.yaml', 'name: bad\nkind: sub\nphases:\n  - description: nameless\n');
    commitAll(repo, 'the fixture'); // `workflow list` reads HEAD (task-204, spec-017 §1.1)
  });
  afterEach(() => removeTempDir(repo));

  it('console: exit 1, stderr carries the code, the path and the file', () => {
    const result = spawnSync(process.execPath, [CLI, 'workflow', 'list'], { cwd: repo, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('E_VALIDATION');
    expect(result.stderr).toContain('phases[0].name');
    expect(result.stderr).toContain('workflows/custom/bad.yaml');
  });

  it('json: the `error` reason carries the same', () => {
    const result = spawnSync(process.execPath, [CLI, 'workflow', 'list', '--format', 'json'], { cwd: repo, encoding: 'utf8' });
    expect(result.status).toBe(1);
    const { error } = JSON.parse(result.stderr) as { error: string };
    expect(error).toMatch(/^E_VALIDATION phases\[0\]\.name \(workflows\/custom\/bad\.yaml\): /);
  });

  it('json: every further diagnostic reaches `details`, each in the reason form, the reason not repeated (task-130 × task-136)', () => {
    // A second error after bad.yaml's: an include of a file that does not exist.
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n  - workflows/custom/bad.yaml\n  - workflows/custom/missing.yaml\n');
    commitAll(repo, 'include a missing file');
    const result = spawnSync(process.execPath, [CLI, 'workflow', 'list', '--format', 'json'], { cwd: repo, encoding: 'utf8' });
    expect(result.status).toBe(1);
    const { error, details } = JSON.parse(result.stderr) as { error: string; details?: { detail?: string; file?: string }[] };
    // spec-003 order puts the manifest's missing include first: it is the reason …
    expect(error).toMatch(/^E_WORKFLOW_FILE_NOT_FOUND include\[2\] \(workflows\.yaml\): /);
    // … and bad.yaml's error, which no surface showed before, is the one detail.
    const lines = (details ?? []).map((entry) => entry.detail);
    expect(lines).toEqual([expect.stringMatching(/^E_VALIDATION phases\[0\]\.name \(workflows\/custom\/bad\.yaml\): /)]);
    expect(lines).not.toContain(error);
  });

  it('console: the further diagnostic is an indented detail line after the reason', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n  - workflows/custom/bad.yaml\n  - workflows/custom/missing.yaml\n');
    commitAll(repo, 'include a missing file');
    const result = spawnSync(process.execPath, [CLI, 'workflow', 'list'], { cwd: repo, encoding: 'utf8' });
    expect(result.status).toBe(1);
    const lines = result.stderr.split('\n').filter(Boolean);
    expect(lines[0]).toMatch(/^error: E_WORKFLOW_FILE_NOT_FOUND /);
    expect(lines.some((line) => /^ {2}E_VALIDATION phases\[0\]\.name \(workflows\/custom\/bad\.yaml\): /.test(line))).toBe(true);
  });
});
