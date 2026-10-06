/**
 * Quoted path segments, end to end through the REAL registered `dna` operations —
 * `dl-083-dotted-entry-names-in-paths` (`ready`), task-099, closing
 * `bug-091-entry-names-containing-a-dot-are-unaddressable`.
 *
 * `test/dna/path-quoting.test.ts` pins the grammar at the parser and the resolver. This suite pins
 * what a caller sees: a write on an entry named `Node.js` lands and commits, the two refusals are
 * **usage errors at exit `2`** (`spec-005-cli-command-contract` §1, as `dl-083`'s Decision requires
 * for the unterminated case), and `--value` is untouched by the quoting rule.
 *
 * **The quoting overlap, stated because it is the thing a reader gets wrong.** At a shell prompt the
 * invocation is
 *
 * ```
 * wingfoil dna update 'stacks.technologies."Node.js".version' --value 22.14+
 * ```
 *
 * where the **outer single quotes belong to the shell** and the **inner double quotes belong to
 * WingFoil**. `argv` — and therefore `positionals[0]`, which is what this suite passes — holds only
 * `stacks.technologies."Node.js".version`, double quotes included. `--value` is the other way round:
 * `--value "Node.js"` quotes for the shell alone, and the operation receives the bare `Node.js`.
 *
 * Every write lands in a THROWAWAY temp git repo, never this repository's own `.wingfoil/dna.yaml`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, loadDnaYaml } from '../../src/core';
import { exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';
import { makeTempGitRepo, removeTempDir, writeFixtureFile, commitAll } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/**
 * A fixture carrying the two dotted `stacks.technologies` names and the dotted `team.agents` name
 * this repository's own `.wingfoil/dna.yaml` carries (transcribed at commit `3a350aa6`),
 * comments included — the provenance annotations are part of what a write must not destroy.
 */
const DNA_FIXTURE = `# Project DNA (P2.4)
version: 1.1                     # [AUTHORING] config-file format version

project:
  name: Fixture
  license: MIT

modules:
  - name: core
    path: src/core

stacks:
  technologies:
    - name: TypeScript
      category: language
    - name: Node.js
      category: runtime
      version: "22.12+"   # [SPEC] Product Brief §Technical Stack
    - name: Commander.js
      category: framework
      notes: CLI command surface (P2 Interaction Layer)
  methodologies:
    - name: TDD

team:
  members:
    - name: roberto
      email: r@example.it
      roles: [ approver ]
  agents:
    - name: AI agent (Claude/Cursor/etc.)
      executes_as: [ developer ]
      approval_authority: false
  roles:
    - name: approver
    - name: developer
    - name: reviewer

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
function technologies(repo: string): Array<{ name: string; version?: string }> {
  return (loadDnaYaml(repo).stacks as { technologies: Array<{ name: string; version?: string }> }).technologies;
}

/** The `UsageError` a verb throws for `path`, or a thrown assertion failure. */
async function usageError(op: string, path: string, value = 'x'): Promise<UsageError> {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
  commitAll(repo, 'seed dna.yaml');
  const before = head(repo);
  const unchanged = snapshotPersistence(repo);
  try {
    await dnaOp(op)({ root: repo, positionals: [path], options: { value } });
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    // A usage error is decided before anything is written: no commit, file byte-identical.
    expect(head(repo)).toBe(before);
    expect(dnaText(repo)).toBe(DNA_FIXTURE);
    assertPersistenceUnchanged(repo, unchanged);
    removeTempDir(repo);
    return error as UsageError;
  }
  removeTempDir(repo);
  throw new Error(`expected 'dna ${op} ${path}' to throw a UsageError, but it returned`);
}

describe('a dotted entry name is addressable, and writable, through a quoted segment (AC1)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  it('`dna update stacks.technologies."Node.js".version --value 22.14+` writes the right entry', async () => {
    const result = await dnaOp('dnaUpdate')({
      root: repo,
      positionals: ['stacks.technologies."Node.js".version'],
      options: { value: '22.14+' },
    });
    expect(result.ok).toBe(true);

    expect(technologies(repo)).toEqual([
      { name: 'TypeScript', category: 'language' },
      { name: 'Node.js', category: 'runtime', version: '22.14+' },
      { name: 'Commander.js', category: 'framework', notes: 'CLI command surface (P2 Interaction Layer)' },
    ]);
    // The neighbouring dotted entry is untouched — the path addressed ONE entry, not a prefix match.
    expect(dnaText(repo)).toContain('name: Commander.js');
    expect(subject(repo)).toBe('wf(dna): update stacks.technologies."Node.js".version 22.14+');
  });

  it('`dna set` reaches the same scalar, and its commit subject quotes the path as it was typed', async () => {
    const result = await dnaOp('dnaSet')({
      root: repo,
      positionals: ['stacks.technologies."Node.js".version'],
      options: { value: '23.0' },
    });
    expect(result.ok).toBe(true);
    expect(technologies(repo)[1]).toEqual({ name: 'Node.js', category: 'runtime', version: '23.0' });
    expect(subject(repo)).toBe('wf(dna): set stacks.technologies."Node.js".version');
  });

  it('the `team.agents` name — dots, parentheses and slashes — is addressable too (AC6)', async () => {
    const result = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['team.agents."AI agent (Claude/Cursor/etc.)".executes_as'],
      options: { value: 'reviewer' },
    });
    expect(result.ok).toBe(true);
    expect((loadDnaYaml(repo).team as { agents: Array<{ executes_as: string[] }> }).agents[0]!.executes_as).toEqual([
      'developer',
      'reviewer',
    ]);
  });

  it('AC2: quoting a dot-free segment changes nothing — the delimiters are not part of the name', async () => {
    const result = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['team."members".roberto.roles'],
      options: { value: 'developer' },
    });
    expect(result.ok).toBe(true);
    expect((loadDnaYaml(repo).team as { members: Array<{ roles: string[] }> }).members[0]!.roles).toEqual([
      'approver',
      'developer',
    ]);
  });

  it('the bare spelling of a dotted name is still refused at exit 1 — quoting is how you reach it', async () => {
    const result = await dnaOp('dnaUpdate')({
      root: repo,
      positionals: ['stacks.technologies.Node.js.version'],
      options: { value: '22.14+' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("no entry named 'Node'");
    expect(dnaText(repo)).toBe(DNA_FIXTURE);
  });
});

describe('the two quoting refusals are usage errors at exit 2 (AC3, AC4)', () => {
  it('AC3: an unterminated quote — exit 2, naming it as unterminated', async () => {
    const error = await usageError('dnaUpdate', 'stacks.technologies."Node.js');
    expect(error.message).toMatch(/unterminated/i);
    expect(exitCodeForThrow(error).exitCode).toBe(2);
  });

  it('AC4: a `"` no delimiter accounts for — exit 2, naming the NAME as unaddressable', async () => {
    const error = await usageError('dnaRemove', 'stacks.technologies."say "hi""');
    expect(error.message).toMatch(/unaddressable/i);
    expect(error.message).toMatch(/escape/i);
    expect(exitCodeForThrow(error).exitCode).toBe(2);
  });

  it('every verb refuses identically — one parser, not one per verb', async () => {
    for (const op of ['dnaSet', 'dnaAdd', 'dnaRemove', 'dnaUpdate']) {
      expect((await usageError(op, 'stacks."Node.js')).message).toMatch(/unterminated/i);
    }
  });

  it('a malformed path still reports `P2.1-dna-set.feature` scenario 3\'s message, verbatim', async () => {
    const error = await usageError('dnaSet', '..language', 'python');
    expect(error.message).toBe("invalid key path: '..language'");
    expect(exitCodeForThrow(error).exitCode).toBe(2);
  });
});

describe('AC5 — `--value` is untouched by the quoting rule (characterization)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  /**
   * `dna remove stacks.technologies --value "Node.js"` at a shell prompt: those double quotes are the
   * SHELL's, and the operation receives the bare `Node.js`. Passing a WingFoil-quoted `"Node.js"`
   * here would be asking to remove an entry whose name literally begins and ends with a quote — so
   * the two spellings must behave differently, and that is what this pins.
   */
  it('an entry with a dotted name is removed by its bare name in --value', async () => {
    const result = await dnaOp('dnaRemove')({
      root: repo,
      positionals: ['stacks.technologies'],
      options: { value: 'Node.js' },
    });
    expect(result.ok).toBe(true);
    expect(technologies(repo).map((entry) => entry.name)).toEqual(['TypeScript', 'Commander.js']);
    expect(subject(repo)).toBe('wf(dna): remove stacks.technologies Node.js');
  });

  it('a --value carrying WingFoil quotes names an entry that does not exist, rather than being stripped', async () => {
    const result = await dnaOp('dnaRemove')({
      root: repo,
      positionals: ['stacks.technologies'],
      options: { value: '"Node.js"' },
    });
    expect(result.ok).toBe(false);
    expect(technologies(repo).map((entry) => entry.name)).toEqual(['TypeScript', 'Node.js', 'Commander.js']);
  });

  it('a dotted name added through --value is immediately addressable through a quoted segment', async () => {
    const added = await dnaOp('dnaAdd')({
      root: repo,
      positionals: ['stacks.technologies'],
      options: { value: 'Vue.js', 'entry-category': 'framework' },
    });
    expect(added.ok).toBe(true);

    const updated = await dnaOp('dnaUpdate')({
      root: repo,
      positionals: ['stacks.technologies."Vue.js".notes'],
      options: { value: 'front end' },
    });
    expect(updated.ok).toBe(true);
    expect(technologies(repo)[3]).toEqual({ name: 'Vue.js', category: 'framework', notes: 'front end' });
  });
});
