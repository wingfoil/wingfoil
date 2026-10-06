/**
 * task-179 (`bug-198`, `bug-245`) — through the compiled CLI: a read in a project whose configuration is
 * absent, incomplete or invalid is refused in WingFoil's words, naming files repository-relative, and
 * never with a raw `ENOENT` or the host's absolute path.
 *
 * - No `.wingfoil/` at all (`bug-198`): `dna show`, `paths` and `memory search` give the shared
 *   `WINGFOIL_NOT_INITIALIZED` refusal (`requireInitializedProject`, task-143), exit `1`.
 * - A `.wingfoil/` that lacks `dna.yaml` or `memory.yaml`, or holds an invalid `dna.yaml` (`bug-245`):
 *   the missing file is named `.wingfoil/<file>`, and every validation issue is labelled with that
 *   relative path, on the CLI and in `wingfoil mcp`'s pre-flight.
 *
 * The MCP Resource half of `bug-245` is `test/mcp/config-missing-refusal.test.ts`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');

function runCli(cwd: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8', input: '' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Neither spelling of the repository's absolute path may appear in what the user is shown. */
function expectNoHostPath(repo: string, text: string): void {
  expect(text).not.toContain(repo);
  expect(text).not.toContain(realpathSync(repo));
  expect(text).not.toContain('ENOENT');
}

describe('a read on an absent, incomplete or invalid configuration names no host path (bug-198, bug-245)', () => {
  const repos: string[] = [];
  const freshRepo = (): string => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    return repo;
  };

  beforeAll(() => expect(existsSync(CLI)).toBe(true));
  afterAll(() => repos.forEach(removeTempDir));

  describe('AC 6 — no .wingfoil/ (bug-198)', () => {
    it.each([[['dna', 'show']], [['paths']], [['memory', 'search', 'x']]] as const)('`wingfoil %j`', (args) => {
      const repo = freshRepo();
      const result = runCli(repo, ['--format', 'json', ...args]);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr)).toEqual({ error: WINGFOIL_NOT_INITIALIZED });
      expectNoHostPath(repo, result.stderr);
    });
  });

  describe('AC 7 — a .wingfoil/ that lacks a file or holds an invalid one (bug-245)', () => {
    it.each([[['dna', 'show']], [['paths']], [['mcp']]] as const)('`.wingfoil/` holding only a .gitkeep: `wingfoil %j`', (args) => {
      const repo = freshRepo();
      writeFixtureFile(repo, '.wingfoil/.gitkeep', '');
      commitAll(repo, 'empty configuration');

      const result = runCli(repo, [...args]);

      expect(result.status).toBe(1);
      expect(result.stderr.split('\n')[0]).toMatch(/^error: \.wingfoil\/dna\.yaml is missing/);
      expectNoHostPath(repo, result.stderr);
    });

    it.each([[['dna', 'show']], [['mcp']]] as const)('an invalid dna.yaml: `wingfoil %j` labels the issues `(.wingfoil/dna.yaml)`', (args) => {
      const repo = freshRepo();
      writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1\nproject:\n  name: x\nmodules: 5\n');
      commitAll(repo, 'invalid configuration');

      const result = runCli(repo, [...args]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('E_VALIDATION modules (.wingfoil/dna.yaml)');
      expectNoHostPath(repo, result.stderr);
    });

    it('a scaffolded project with memory.yaml removed: `memory search x` names `.wingfoil/memory.yaml`', () => {
      const repo = freshRepo();
      const init = runCli(repo, ['init', '--template', 'scrum']);
      if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
      rmSync(join(repo, '.wingfoil', 'memory.yaml'));
      git(repo, ['commit', '--quiet', '-am', 'drop memory.yaml']);

      const result = runCli(repo, ['memory', 'search', 'x']);

      expect(result.status).toBe(1);
      expect(result.stderr.split('\n')[0]).toMatch(/^error: \.wingfoil\/memory\.yaml is missing/);
      expectNoHostPath(repo, result.stderr);
    });

    it('an invalid dna.yaml in the working tree only: `paths` labels it relative too', () => {
      const repo = freshRepo();
      const init = runCli(repo, ['init', '--template', 'scrum']);
      if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
      writeFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'version: 1\nproject: 7\n', 'utf-8');

      const result = runCli(repo, ['paths']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('(.wingfoil/dna.yaml)');
      expectNoHostPath(repo, result.stderr);
    });
  });
});
