/**
 * `wingfoil dna add | remove | update` — the DNA mutation surface
 * (`dl-081-dna-mutation-surface-shape`, ratified option **(E)**; task-093; closes
 * `bug-083-dna-set-cannot-write-array-valued-fields`).
 *
 * Before this task `dna set` reached **7 of roughly 38 schema fields** — `version` and the six scalars
 * under `project` — while 11 fields were array-valued and 17 more lived inside array entries, none of
 * them reachable for create, update or delete (`dl-081` E2). These three verbs reach all of them:
 * the `<path>` positional carries the FULL path, entries inside a collection are addressed **by `name`**, and
 * `--value` carries the new entry's identity at a collection or the new value at a leaf.
 *
 * Exercises the REAL, registered `CORE_MODULES` operations — the same `CoreFn`s `src/cli`'s commands
 * and the MCP `dna.add`/`dna.remove`/`dna.update` Tools call. Every write lands in a THROWAWAY temp git
 * repo, never this repository's own `.wingfoil/dna.yaml`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, dnaEntryOptionName, loadDnaYaml } from '../../src/core';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { deriveVerb } from '../../src/core/registry';
import type { CoreFn } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';
import { deriveMcpToolName } from '../../src/mcp/registrar';
import { makeTempGitRepo, removeTempDir, writeFixtureFile, commitAll } from '../storage/helpers/git-fixture';

/** A comment-bearing fixture: the provenance annotations are part of what a write must not destroy. */
const DNA_FIXTURE = `# Project DNA (P2.4)
version: 1.1                     # [AUTHORING] config-file format version

project:
  name: Fixture
  license: MIT

# Modules — the parts of the system   [SPEC: P2.4]
modules:
  - name: core
    path: src/core

stacks:
  technologies:
    - name: TypeScript
      category: language
  methodologies: []

team:
  members:
    - name: roberto
      email: r@example.it
      roles: [ approver ]
  roles:
    - name: approver
    - name: developer

# Resource paths   [SPEC: P2.5]
paths:
  sources:
    - src/
`;

/** The real, registered `dna.<name>` `CoreFn` — fails loudly if a future change un-registers it. */
function dnaOp(name: string): CoreFn<unknown, unknown> {
  const dnaModule = CORE_MODULES.find((module) => module.name === 'dna');
  const operation = dnaModule?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the dna module`);
  return operation.fn;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}
function subject(repo: string): string {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim();
}
function dnaText(repo: string): string {
  return readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8');
}

describe('the three verbs are registered, and reach both surfaces mechanically (AC2, AC7)', () => {
  const dnaModule = CORE_MODULES.find((module) => module.name === 'dna');

  it.each(['dnaAdd', 'dnaRemove', 'dnaUpdate'])('%s is registered on the dna module as a mutating operation', (name) => {
    const operation = dnaModule?.operations[name];
    expect(operation).toBeDefined();
    expect(operation!.name).toBe(name);
    expect(operation!.mutates).toBe(true);
  });

  it.each([
    ['dnaAdd', 'add', 'dna.add'],
    ['dnaRemove', 'remove', 'dna.remove'],
    ['dnaUpdate', 'update', 'dna.update'],
  ])('%s derives the CLI verb `%s` and the MCP Tool name `%s` (spec-004 §4.1, spec-006 §3)', (name, verb, tool) => {
    expect(deriveVerb('dna', name)).toBe(verb);
    expect(deriveMcpToolName('dna', deriveVerb('dna', name))).toBe(tool);
  });

  // `dl-082-cli-parameter-shape`: the PATH is the verb's positional, so no operation declares a
  // `--field` option — the registry is asked for the absence as well as for what is there, because a
  // re-added `field` option would be a silent second spelling of the same argument.
  it.each(['dnaAdd', 'dnaRemove', 'dnaUpdate', 'dnaSet'])('%s declares --value and NOT --field (AC2, dl-082)', (name) => {
    const names = (dnaModule?.operations[name]?.options ?? []).map((option) => option.name);
    expect(names).toContain('value');
    expect(names).not.toContain('field');
  });

  it('states --value\'s two meanings in its own option description, rather than leaving it inferred (AC6)', () => {
    for (const name of ['dnaAdd', 'dnaRemove', 'dnaUpdate']) {
      const value = (dnaModule?.operations[name]?.options ?? []).find((option) => option.name === 'value');
      expect(value?.description ?? '').toMatch(/collection/i);
      expect(value?.description ?? '').toMatch(/leaf|value/i);
    }
  });

  it('exposes one option per entry field the schema declares, so every collection is reachable', () => {
    const names = (dnaModule?.operations.dnaAdd?.options ?? []).map((option) => option.name);
    for (const field of ['description', 'path', 'email', 'roles', 'category', 'version', 'notes', 'phase', 'executes_as']) {
      // Under the `entry-` namespace, not bare: a bare `--version` is Commander's program-level flag,
      // which swallowed the value and exited 0 (see `DNA_ENTRY_OPTION_PREFIX` and
      // `test/cli/derived-option-namespace.test.ts`).
      expect(names).toContain(dnaEntryOptionName(field));
      expect(names).not.toContain(field);
    }
  });
});

describe('dna add | remove | update — all four path shapes, end to end (AC3, AC5)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  it('shape 1 — appends to an array of strings at depth 2 (paths.sources), in one scoped commit', async () => {
    const before = head(repo);
    const result = await dnaOp('dnaAdd')({ root: repo, positionals: ['paths.sources'], options: { value: 'lib/' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.commit?.sha).toBe(head(repo));
    expect(head(repo)).not.toBe(before);
    expect(subject(repo)).toBe('wf(dna): add paths.sources lib/');

    expect((loadDnaYaml(repo).paths as { sources: string[] }).sources).toEqual(['src/', 'lib/']);
    const changed = execFileSync('git', ['-C', repo, 'show', '--name-only', '--format=', 'HEAD'], {
      encoding: 'utf-8',
    }).trim();
    expect(changed).toBe('.wingfoil/dna.yaml');
  });

  it('shape 2 — adds, updates and removes an entry of an object array at depth 1 (modules)', async () => {
    const added = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['modules'], options: { value: 'cli', 'entry-path': 'src/cli' },
    });
    expect(added.ok).toBe(true);
    expect(loadDnaYaml(repo).modules).toEqual([
      { name: 'core', path: 'src/core' },
      { name: 'cli', path: 'src/cli' },
    ]);

    const updated = await dnaOp('dnaUpdate')({
      root: repo,
      positionals: ['modules'], options: { value: 'cli', 'entry-description': 'Human interface.' },
    });
    expect(updated.ok).toBe(true);
    expect(loadDnaYaml(repo).modules[1]).toEqual({ name: 'cli', path: 'src/cli', description: 'Human interface.' });

    const removed = await dnaOp('dnaRemove')({ root: repo, positionals: ['modules'], options: { value: 'cli' } });
    expect(removed.ok).toBe(true);
    expect(loadDnaYaml(repo).modules).toEqual([{ name: 'core', path: 'src/core' }]);
    expect(subject(repo)).toBe('wf(dna): remove modules cli');
  });

  it('shape 3 — adds an entry to an object array at depth 2 (team.members, stacks.technologies)', async () => {
    const member = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['team.members'], options: { value: 'ada', 'entry-email': 'ada@example.it', 'entry-roles': 'developer' },
    });
    expect(member.ok).toBe(true);
    expect((loadDnaYaml(repo).team as { members: unknown[] }).members).toHaveLength(2);

    const tech = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['stacks.technologies'], options: { value: 'Node.js', 'entry-category': 'runtime', 'entry-version': '22.12+' },
    });
    expect(tech.ok).toBe(true);
    expect((loadDnaYaml(repo).stacks as { technologies: unknown[] }).technologies[1]).toEqual({
      name: 'Node.js',
      category: 'runtime',
      version: '22.12+',
    });
  });

  it('shape 4 — amends one member\'s roles: the shape only this addressing form can express (dl-081)', async () => {
    const result = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['team.members.roberto.roles'], options: { value: 'developer' },
    });
    expect(result.ok).toBe(true);
    expect((loadDnaYaml(repo).team as { members: Array<{ roles: string[] }> }).members[0]!.roles).toEqual([
      'approver',
      'developer',
    ]);

    const removed = await dnaOp('dnaRemove')({
      root: repo,
      positionals: ['team.members.roberto.roles'], options: { value: 'approver' },
    });
    expect(removed.ok).toBe(true);
    expect((loadDnaYaml(repo).team as { members: Array<{ roles: string[] }> }).members[0]!.roles).toEqual(['developer']);
  });

  it('seeds the first approver — the flow dl-080\'s ratified ergonomics rest on (bug-083)', async () => {
    const role = await dnaOp('dnaAdd')({ root: repo, positionals: ['team.roles'], options: { value: 'qa' } });
    expect(role.ok).toBe(true);
    const member = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['team.members'], options: { value: 'new approver', 'entry-email': 'a@example.it', 'entry-roles': 'approver,qa' },
    });
    expect(member.ok).toBe(true);
    const team = loadDnaYaml(repo).team as { members: Array<{ name: string; roles: string[] }> };
    expect(team.members[1]).toEqual({ name: 'new approver', email: 'a@example.it', roles: ['approver', 'qa'] });
  });

  it('keeps every comment, including the [SPEC]/[AUTHORING] provenance annotations (bug-004 stays fixed)', async () => {
    await dnaOp('dnaAdd')({ root: repo, positionals: ['modules'], options: { value: 'cli', 'entry-path': 'src/cli' } });
    await dnaOp('dnaAdd')({ root: repo, positionals: ['paths.sources'], options: { value: 'lib/' } });
    await dnaOp('dnaUpdate')({ root: repo, positionals: ['project.license'], options: { value: 'Apache-2.0' } });

    const text = dnaText(repo);
    expect(text).toContain('# [AUTHORING] config-file format version');
    expect(text).toContain('# Modules — the parts of the system   [SPEC: P2.4]');
    expect(text).toContain('# Resource paths   [SPEC: P2.5]');
  });

  it('a no-op update writes nothing and makes no commit (idempotent success, as `dna set`)', async () => {
    const before = head(repo);
    const text = dnaText(repo);
    const result = await dnaOp('dnaUpdate')({ root: repo, positionals: ['project.license'], options: { value: 'MIT' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commit).toBeUndefined();
    expect(head(repo)).toBe(before);
    expect(dnaText(repo)).toBe(text);
  });
});

describe('refusals — exit 1 for a path or an entry the document/schema does not carry (AC1, spec-005 §1)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  it.each<[string, string, Record<string, string>]>([
    ['an unknown root key', 'nonsense.at.any.depth', { value: 'x' }],
    ['the tech_stack alias path bug-084 measured', 'tech_stack.cli.framework', { value: 'Commander' }],
    ['an index instead of an entry name', 'modules.0.description', { value: 'x' }],
    ['an entry that is not there', 'team.members.nobody.roles', { value: 'developer' }],
  ])('%s is refused at exit 1, naming the path, leaving the file and HEAD untouched', async (_case, path, options) => {
    const before = head(repo);
    const text = dnaText(repo);
    const result = await dnaOp('dnaAdd')({ root: repo, positionals: [path], options });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain(path);
    expect(head(repo)).toBe(before);
    expect(dnaText(repo)).toBe(text);
  });

  it('a duplicate entry name is refused rather than written (AC4 at the verb)', async () => {
    const result = await dnaOp('dnaAdd')({ root: repo, positionals: ['modules'], options: { value: 'core' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(exitCodeForResult(result)).toBe(1);
  });

  it('an entry missing a field the schema requires is refused, naming the field', async () => {
    const result = await dnaOp('dnaAdd')({ root: repo, positionals: ['team.members'], options: { value: 'ada' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('roles');
  });

  it('a member naming a role the catalogue does not define is refused by the schema re-validation (REQ-SYS-08)', async () => {
    const result = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['team.members'], options: { value: 'ada', 'entry-roles': 'nonexistent-role' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(exitCodeForResult(result)).toBe(1);
  });
});

describe('usage errors — a malformed invocation is exit 2 (spec-005 §1, spec-008 §5)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  it.each(['dnaAdd', 'dnaRemove', 'dnaUpdate'])('%s without a <path> positional is a usage error, in the one missing-operand wording', async (name) => {
    try {
      await dnaOp(name)({ root: repo, options: {} });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      // task-179 (`bug-168`): one wording for every command; the CLI registrar adds the usage as a hint.
      expect((error as UsageError).message).toBe('missing required argument: <path>');
      expect(exitCodeForThrow(error).exitCode).toBe(2);
    }
  });

  // `dl-082` takes a positional away from a SHIPPED command, so the old spelling has to fail loudly
  // rather than silently drop its second word — `dna set project.license MIT` would otherwise refuse
  // for a reason naming neither the word nor the new grammar. Since task-179 (`bug-180`) the CLI
  // registrar refuses the surplus for every command before the root is resolved, so each DNA path verb
  // DECLARES the migration hint the registrar appends (`test/cli/extra-operand-refusal*.test.ts` drive it).
  it.each(['dnaSet', 'dnaAdd', 'dnaRemove', 'dnaUpdate'])('%s declares the dl-082 migration hint for a surplus operand', (name) => {
    const dna = CORE_MODULES.find((module) => module.name === 'dna')!;
    expect(dna.operations[name]!.positional).toEqual(
      expect.objectContaining({ name: 'path', required: true, surplusHint: 'the value travels in --value' }),
    );
  });

  it('`dna set ..language --value python` reports the malformed path (P2.1-dna-set.feature)', async () => {
    try {
      await dnaOp('dnaSet')({ root: repo, positionals: ['..language'], options: { value: 'python' } });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect((error as UsageError).message).toBe("invalid key path: '..language'");
      expect(exitCodeForThrow(error).exitCode).toBe(2);
    }
  });

  it('an option that is not an entry field is a usage error naming the namespace (the MCP surface can send one)', async () => {
    try {
      await dnaOp('dnaAdd')({ root: repo, positionals: ['stacks.technologies'], options: { value: 'Zod', version: '4.0' } });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toContain('--version');
      expect((error as UsageError).message).toContain('entry-');
      expect(exitCodeForThrow(error).exitCode).toBe(2);
    }
  });

  it('add without --value is a usage error (the new entry has no identity)', async () => {
    await expect(dnaOp('dnaAdd')({ root: repo, positionals: ['modules'], options: {} })).rejects.toBeInstanceOf(UsageError);
  });

  it('a malformed dotted path stays exit 2, as `dna set` pins it (P2.1-dna-set.feature)', async () => {
    try {
      await dnaOp('dnaUpdate')({ root: repo, positionals: ['..language'], options: { value: 'python' } });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toBe("invalid key path: '..language'");
      expect(exitCodeForThrow(error).exitCode).toBe(2);
    }
  });
});

describe('REQ-SEC-01 — the git-identity pre-flight refuses before any read or write', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-dnamut-noid-'));
    execFileSync('git', ['-C', repo, 'init', '-q', '--initial-branch=main'], { encoding: 'utf-8' });
    const emptyConfig = join(repo, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeTempDir(repo);
  });

  it.each(['dnaAdd', 'dnaRemove', 'dnaUpdate'])('%s refuses at exit 1 when no git identity is configured', async (name) => {
    const result = await dnaOp(name)({ root: repo, positionals: ['paths.sources'], options: { value: 'src/' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(exitCodeForResult(result)).toBe(1);
  });
});
