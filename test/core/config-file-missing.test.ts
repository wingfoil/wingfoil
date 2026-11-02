/**
 * task-179 (`bug-245`) — the working-tree configuration loaders name a missing or invalid file
 * repository-relative, never by the host's absolute path: a missing file is a `ConfigFileMissingError`
 * (still `code: 'ENOENT'`, so `coreErrorOf` maps it to `NOT_FOUND`). Since task-309 (`bug-251`) a file
 * that exists but cannot be read is no longer propagated unchanged: see the second describe below.
 */
import { chmodSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  ConfigFileMissingError,
  coreErrorOf,
  initWingfoilProject,
  loadDnaYaml,
  loadMemoryYaml,
  loadRolesYaml,
  loadWorkflowsYaml,
} from '../../src/core';
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
});

/**
 * task-309 (`bug-251`) — a configuration file that EXISTS but cannot be read is a WingFoil error, not
 * Node's raw one: a `ConfigFileUnreadableError` naming the file repository-relative and the cause, which
 * keeps the original errno as `code` and maps to the `IO` refusal (exit `1`). Design gate (approver,
 * 2026-10-30), D4 as written: `EACCES`/`EPERM` → `<rel> cannot be read: permission denied`; `EISDIR` →
 * `<rel> is a directory, not a file`; any other errno → `<rel> cannot be read (<code>)`. D5 (a): the
 * Workflow pillar's working-tree reader (the manifest and every included file) is mapped the same way.
 *
 * The class is asserted by `name`, `relativePath`, `code` and `message` on the caught error: no new symbol
 * is imported. Every message is checked for the host path (both spellings) and Node's raw text.
 */
const RAW_NODE_TEXT = ['permission denied, open', 'illegal operation on a directory', 'too many symbolic links'];

/** The error `load` throws, checked to name no host path and none of Node's raw text. */
function unreadable(repo: string, load: () => unknown): { name: string; relativePath: string; code: string; message: string } {
  let thrown: unknown;
  try {
    load();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeDefined();
  const error = thrown as { name: string; relativePath: string; code: string; message: string };
  expect(error.message).not.toContain(repo);
  expect(error.message).not.toContain(realpathSync(repo));
  for (const raw of RAW_NODE_TEXT) expect(error.message).not.toContain(raw);
  return error;
}

/** Permission pins only mean something to a user the mode bits bind (`root` reads a `000` file). */
const unprivileged = typeof process.getuid === 'function' && process.getuid() !== 0;
const itUnprivileged = unprivileged ? it : it.skip;

describe('ConfigFileUnreadableError — a configuration file that exists but cannot be read (task-309, bug-251)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/.gitkeep', '');
  });

  afterEach(() => removeTempDir(repo));

  const LOADERS = [
    ['dna.yaml', loadDnaYaml],
    ['memory.yaml', loadMemoryYaml],
    ['roles.yaml', loadRolesYaml],
  ] as const;

  it.each(LOADERS)('%s is a directory: "<rel> is a directory, not a file", IO', (file, load) => {
    mkdirSync(join(repo, '.wingfoil', file));

    const error = unreadable(repo, () => load(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe(`.wingfoil/${file}`);
    expect(error.code).toBe('EISDIR');
    expect(error.message).toBe(`.wingfoil/${file} is a directory, not a file`);
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
  });

  itUnprivileged.each(LOADERS)('%s with mode 000: "<rel> cannot be read: permission denied", IO', (file, load) => {
    const path = join(repo, '.wingfoil', file);
    writeFixtureFile(repo, `.wingfoil/${file}`, 'version: 1\n');
    chmodSync(path, 0o000);
    try {
      const error = unreadable(repo, () => load(repo));

      expect(error.name).toBe('ConfigFileUnreadableError');
      expect(error.relativePath).toBe(`.wingfoil/${file}`);
      expect(error.code).toBe('EACCES');
      expect(error.message).toBe(`.wingfoil/${file} cannot be read: permission denied`);
      expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
    } finally {
      chmodSync(path, 0o644);
    }
  });

  it.each(LOADERS)('%s a symbolic link to itself: "<rel> cannot be read (ELOOP)", IO', (file, load) => {
    symlinkSync(file, join(repo, '.wingfoil', file));

    const error = unreadable(repo, () => load(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe(`.wingfoil/${file}`);
    expect(error.code).toBe('ELOOP');
    expect(error.message).toBe(`.wingfoil/${file} cannot be read (ELOOP)`);
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
  });
});

describe('loadWorkflowsYaml — an unreadable manifest or included file (task-309, bug-251, D5 (a))', () => {
  let repo: string;

  beforeEach(() => {
    // The shipped Scrum layout: the manifest and the workflow files it includes.
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });

  afterEach(() => removeTempDir(repo));

  it('the manifest workflows.yaml is a directory', () => {
    rmSync(join(repo, '.wingfoil', 'workflows.yaml'));
    mkdirSync(join(repo, '.wingfoil', 'workflows.yaml'));

    const error = unreadable(repo, () => loadWorkflowsYaml(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe('.wingfoil/workflows.yaml');
    expect(error.code).toBe('EISDIR');
    expect(error.message).toBe('.wingfoil/workflows.yaml is a directory, not a file');
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
  });

  it('a file the manifest includes (workflows/custom/bug-ingest.yaml) is a directory', () => {
    const included = join(repo, '.wingfoil', 'workflows', 'custom', 'bug-ingest.yaml');
    expect(readFileSync(join(repo, '.wingfoil', 'workflows.yaml'), 'utf-8')).toContain('- workflows/custom/bug-ingest.yaml');
    rmSync(included);
    mkdirSync(included);

    const error = unreadable(repo, () => loadWorkflowsYaml(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe('.wingfoil/workflows/custom/bug-ingest.yaml');
    expect(error.code).toBe('EISDIR');
    expect(error.message).toBe('.wingfoil/workflows/custom/bug-ingest.yaml is a directory, not a file');
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
  });
});
