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
 * - A `.wingfoil/<file>` that exists but cannot be read (`bug-251`, task-309): a directory, or a file the
 *   user may not read, is named `.wingfoil/<file>` with the cause, never Node's raw `EISDIR`/`EACCES` text
 *   and never the host path (design gate, 2026-10-30, D4).
 *
 * The MCP Resource half of `bug-245` and `bug-251` is `test/mcp/config-missing-refusal.test.ts`.
 */
import { chmodSync, existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';

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

  beforeAll(() => expect(existsSync(CLI_ENTRY)).toBe(true));
  afterAll(() => repos.forEach(removeTempDir));

  describe('AC 6 — no .wingfoil/ (bug-198)', () => {
    it.each([[['dna', 'show']], [['paths']], [['memory', 'search', 'x']]] as const)('`wingfoil %j`', (args) => {
      const repo = freshRepo();
      const result = runCliEntry(repo, ['--format', 'json', ...args]);
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

      const result = runCliEntry(repo, [...args]);

      expect(result.status).toBe(1);
      expect(result.stderr.split('\n')[0]).toMatch(/^error: \.wingfoil\/dna\.yaml is missing/);
      expectNoHostPath(repo, result.stderr);
    });

    it.each([[['dna', 'show']], [['mcp']]] as const)('an invalid dna.yaml: `wingfoil %j` labels the issues `(.wingfoil/dna.yaml)`', (args) => {
      const repo = freshRepo();
      writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1\nproject:\n  name: x\nmodules: 5\n');
      commitAll(repo, 'invalid configuration');

      const result = runCliEntry(repo, [...args]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('E_VALIDATION modules (.wingfoil/dna.yaml)');
      expectNoHostPath(repo, result.stderr);
    });

    it('a scaffolded project with memory.yaml removed: `memory search x` names `.wingfoil/memory.yaml`', () => {
      const repo = freshRepo();
      const init = runCliEntry(repo, ['init', '--template', 'scrum']);
      if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
      rmSync(join(repo, '.wingfoil', 'memory.yaml'));
      git(repo, ['commit', '--quiet', '-am', 'drop memory.yaml']);

      const result = runCliEntry(repo, ['memory', 'search', 'x']);

      expect(result.status).toBe(1);
      expect(result.stderr.split('\n')[0]).toMatch(/^error: \.wingfoil\/memory\.yaml is missing/);
      expectNoHostPath(repo, result.stderr);
    });

    it('an invalid dna.yaml in the working tree only: `paths` labels it relative too', () => {
      const repo = freshRepo();
      const init = runCliEntry(repo, ['init', '--template', 'scrum']);
      if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
      writeFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'version: 1\nproject: 7\n', 'utf-8');

      const result = runCliEntry(repo, ['paths']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('(.wingfoil/dna.yaml)');
      expectNoHostPath(repo, result.stderr);
    });
  });

  describe('bug-251 — a configuration file that exists but cannot be read (task-309)', () => {
    const RAW_NODE_TEXT = ['EISDIR', 'EACCES', 'illegal operation on a directory', 'permission denied, open'];
    const scaffolded = (): string => {
      const repo = freshRepo();
      const init = runCliEntry(repo, ['init', '--template', 'scrum']);
      if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
      return repo;
    };
    const asDirectory = (repo: string, file: string): void => {
      rmSync(join(repo, '.wingfoil', file));
      mkdirSync(join(repo, '.wingfoil', file));
    };
    const expectNoRawText = (repo: string, text: string): void => {
      expectNoHostPath(repo, text);
      for (const raw of RAW_NODE_TEXT) expect(text).not.toContain(raw);
    };

    it.each([[['dna', 'show']], [['paths']], [['mcp']]] as const)('dna.yaml a directory: `wingfoil %j`', (args) => {
      const repo = scaffolded();
      asDirectory(repo, 'dna.yaml');

      const result = runCliEntry(repo, [...args]);

      expect(result.status).toBe(1);
      expect(result.stderr.split('\n')[0]).toBe('error: .wingfoil/dna.yaml is a directory, not a file');
      expectNoRawText(repo, result.stderr);
    });

    it('dna.yaml a directory: `wingfoil --format json dna show`', () => {
      const repo = scaffolded();
      asDirectory(repo, 'dna.yaml');

      const result = runCliEntry(repo, ['--format', 'json', 'dna', 'show']);

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr)).toEqual({ error: '.wingfoil/dna.yaml is a directory, not a file' });
      expectNoRawText(repo, result.stderr);
    });

    it.each([
      ['memory.yaml', ['memory', 'search', 'x']],
      ['roles.yaml', ['directives', 'list']],
    ] as const)('%s a directory: `wingfoil %j`', (file, args) => {
      const repo = scaffolded();
      asDirectory(repo, file);

      const result = runCliEntry(repo, [...args]);

      expect(result.status).toBe(1);
      expect(result.stderr.split('\n')[0]).toBe(`error: .wingfoil/${file} is a directory, not a file`);
      expectNoRawText(repo, result.stderr);
    });

    // Mode bits do not bind root, so the pin only means something to an unprivileged user.
    const unprivileged = typeof process.getuid === 'function' && process.getuid() !== 0;
    (unprivileged ? it : it.skip)('dna.yaml with mode 000: `wingfoil dna show`', () => {
      const repo = scaffolded();
      const path = join(repo, '.wingfoil', 'dna.yaml');
      chmodSync(path, 0o000);
      try {
        const result = runCliEntry(repo, ['dna', 'show']);

        expect(result.status).toBe(1);
        expect(result.stderr.split('\n')[0]).toBe('error: .wingfoil/dna.yaml cannot be read: permission denied');
        expectNoRawText(repo, result.stderr);
      } finally {
        chmodSync(path, 0o644);
      }
    });

    // task-310 (bug-455), RED-FIRST: a roles.yaml that is a symbolic link to itself used to read as
    // absent (`existsSync` is false on a loop) and list every directive `unassigned`, exit 0; it is now
    // refused as an unreadable file (design gate D5 (a)).
    describe('task-310 (bug-455) — roles.yaml a symbolic link to itself', () => {
      const looped = (): string => {
        const repo = scaffolded();
        rmSync(join(repo, '.wingfoil', 'roles.yaml'));
        symlinkSync('roles.yaml', join(repo, '.wingfoil', 'roles.yaml'));
        return repo;
      };
      const expectNoLoopText = (repo: string, text: string): void => {
        expectNoRawText(repo, text);
        expect(text).not.toContain('ELOOP: too many');
      };

      it('`wingfoil directives list`', () => {
        const repo = looped();

        const result = runCliEntry(repo, ['directives', 'list']);

        expect(result.status).toBe(1);
        expect(result.stderr.split('\n')[0]).toBe('error: .wingfoil/roles.yaml cannot be read (ELOOP)');
        expectNoLoopText(repo, result.stderr);
      });

      it('`wingfoil --format json directives list`', () => {
        const repo = looped();

        const result = runCliEntry(repo, ['--format', 'json', 'directives', 'list']);

        expect(result.status).toBe(1);
        expect(JSON.parse(result.stderr)).toEqual({ error: '.wingfoil/roles.yaml cannot be read (ELOOP)' });
        expectNoLoopText(repo, result.stderr);
      });
    });
  });
});
