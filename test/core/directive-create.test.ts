/**
 * P3.1 (US-4-02) — `wingfoil directive create` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p3-directives/P3.1-directive-create.feature` (all three
 * scenarios), `spec-006-core-domain-api` §3 (`directiveCreate`, `mutates: true`, CLI
 * `wingfoil directive create`, Tool `directive.create`), `spec-008-cli-grammar` §5 (exit codes:
 * usage/argument -> 2, user/logic -> 1), `spec-011-storage-layout` (`directives/custom/`),
 * `spec-013-directive-frontmatter-schema` (the generated frontmatter), REQ-SEC-01
 * (`requireGitIdentity` pre-flight) — task-050-directive-create.
 *
 * Exercises the REAL, registered `CORE_MODULES` operation — the same `CoreFn` both `src/cli`'s
 * `directive create` command and the MCP `directive.create` Tool call. Every write lands in a
 * THROWAWAY temp git repo, never in this repository's own `.wingfoil/`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, loadDirectives } from '../../src/core';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';
import { deriveMcpResourceUri, deriveMcpToolName } from '../../src/mcp/registrar';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const NAME = 'no-direct-db-access';
const CUSTOM_DIR = join('.wingfoil', 'directives', 'custom');

/** The real, registered `directive.directiveCreate` `CoreFn` — fails loudly if it is ever un-registered. */
function directiveCreateFn(): CoreFn<unknown, unknown> {
  const directiveModule = CORE_MODULES.find((module) => module.name === 'directive');
  const operation = directiveModule?.operations.directiveCreate;
  if (!operation) throw new Error('fixture bug: "directiveCreate" operation not registered on the directive module');
  return operation.fn;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function customDirectiveNames(repo: string): string[] {
  const dir = join(repo, CUSTOM_DIR);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/** A temp git repo with the REAL `wingfoil init` scaffold (incl. its ten `custom/` directives). */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

describe('CORE_MODULES directive.directiveCreate — registration (spec-006 §3 / §4 parity)', () => {
  it('is registered on a `directive` module as a `mutates: true` operation', () => {
    const entry = enumerateOperations(CORE_MODULES).find(
      ({ module, operation }) => module.name === 'directive' && operation.name === 'directiveCreate',
    );
    expect(entry).toBeDefined();
    expect(entry?.operation.mutates).toBe(true);
  });

  it('derives the CLI command `directive create` and the MCP Tool `directive.create` (never a Resource)', () => {
    const verb = deriveVerb('directive', 'directiveCreate');
    expect(verb).toBe('create');
    expect(deriveMcpToolName('directive', verb)).toBe('directive.create');
    // A `mutates: true` op is structurally never a Resource; this pins the URI it would otherwise have.
    expect(deriveMcpResourceUri('directive', verb)).toBe('wingfoil://directive/create');
  });

  it('declares `--name` as a required value-bearing option', () => {
    const operation = CORE_MODULES.find((m) => m.name === 'directive')?.operations.directiveCreate;
    // The `--help` text the option also declares (task-120) is `test/cli/help-describes-every-command.test.ts`'s.
    expect(operation?.options).toEqual([expect.objectContaining({ name: 'name', required: true })]);
  });
});

describe('CORE_MODULES directive.directiveCreate — P3.1 fit criteria (initialized project, configured identity)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  // BDD Scenario 1: "Create a new custom directive".
  it('AC1: creates the file under .wingfoil/directives/custom/, commits it, returns ok + sha (exit 0)', async () => {
    const before = head(repo);
    const result = await directiveCreateFn()({ root: repo, options: { name: NAME } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({ name: NAME, path: `.wingfoil/directives/custom/${NAME}.md` });

    // "a directive file <name> is created under .wingfoil/directives/custom/"
    expect(existsSync(join(repo, CUSTOM_DIR, `${NAME}.md`))).toBe(true);

    // "the change is committed to git" — exactly one new commit, scoped to exactly that one path.
    expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.commit?.sha).toBe(head(repo));
    expect(head(repo)).not.toBe(before);
    expect(result.commit?.message).toBe(`wf(directive): create ${NAME}`);
    const subject = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim();
    expect(subject).toBe(`wf(directive): create ${NAME}`);
    const changed = execFileSync('git', ['-C', repo, 'show', '--name-only', '--format=', 'HEAD'], {
      encoding: 'utf-8',
    }).trim();
    expect(changed).toBe(`.wingfoil/directives/custom/${NAME}.md`);

    // The file is genuinely tracked (not merely present in the working tree).
    const tracked = execFileSync('git', ['-C', repo, 'ls-files', '--', changed], { encoding: 'utf-8' }).trim();
    expect(tracked).toBe(changed);
  });

  // The bug-006 lesson from the other direction: a generated directive must load alongside the ten
  // `wingfoil init` scaffolds, through the real `loadDirectives` pillar loader.
  it('AC1: the created directive loads cleanly alongside the ten scaffolded by `wingfoil init`', async () => {
    const scaffolded = loadDirectives(repo);
    expect(scaffolded).toHaveLength(10);

    const result = await directiveCreateFn()({ root: repo, options: { name: NAME } });
    expect(result.ok).toBe(true);

    const loaded = loadDirectives(repo);
    expect(loaded).toHaveLength(11);
    const created = loaded.find((file) => file.path === `directives/custom/${NAME}.md`);
    expect(created).toBeDefined();
    expect(created?.frontmatter).toMatchObject({
      id: NAME,
      name: NAME,
      type: 'directive',
      kind: 'custom',
      title: 'No direct db access',
    });
  });

  // BDD Scenario 2: "Error - creating a directive whose name already exists".
  it('AC2: a second create with the same name exits 1 with the exact message and overwrites nothing', async () => {
    const first = await directiveCreateFn()({ root: repo, options: { name: NAME } });
    expect(first.ok).toBe(true);

    const filePath = join(repo, CUSTOM_DIR, `${NAME}.md`);
    const contentBefore = readFileSync(filePath, 'utf-8');
    const shaBefore = head(repo);

    const unchanged = snapshotPersistence(repo);
    const second = await directiveCreateFn()({ root: repo, options: { name: NAME } });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toEqual({ code: 'CONFLICT', message: `directive already exists: ${NAME}` });
    expect(exitCodeForResult(second)).toBe(1);

    // "no file is overwritten" — and no second commit was produced.
    expect(readFileSync(filePath, 'utf-8')).toBe(contentBefore);
    expect(head(repo)).toBe(shaBefore);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // task-057: the six P3.8 ids moved to `directives/built-in/`; `determinism` is still an init-scaffolded
  // CUSTOM directive, which is what this collision check is about.
  it('AC2: a name colliding with one of the init-scaffolded custom directives is also a conflict', async () => {
    const result = await directiveCreateFn()({ root: repo, options: { name: 'determinism' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('directive already exists: determinism');
    expect(exitCodeForResult(result)).toBe(1);
  });

  // BDD Scenario 3: "Error - invalid directive name".
  it("AC3: `--name 'bad name!'` throws a UsageError (exit 2) with the exact message and creates no file", async () => {
    const before = customDirectiveNames(repo);
    const shaBefore = head(repo);

    await expect(directiveCreateFn()({ root: repo, options: { name: 'bad name!' } })).rejects.toThrow(UsageError);
    let thrown: unknown;
    try {
      await directiveCreateFn()({ root: repo, options: { name: 'bad name!' } });
    } catch (error) {
      thrown = error;
    }
    expect(exitCodeForThrow(thrown)).toEqual({
      reason: 'invalid directive name (use kebab-case)',
      exitCode: 2,
    });

    // "no file is created" — the custom/ directory is untouched, and nothing was committed.
    expect(customDirectiveNames(repo)).toEqual(before);
    expect(head(repo)).toBe(shaBefore);
  });

  it.each(['../escape', 'sub/dir', '/absolute', '..'])(
    'AC3: rejects the path-traversal-shaped name %p before any path is built (exit 2, nothing written)',
    async (name) => {
      const before = customDirectiveNames(repo);
      await expect(directiveCreateFn()({ root: repo, options: { name } })).rejects.toThrow(
        'invalid directive name (use kebab-case)',
      );
      expect(customDirectiveNames(repo)).toEqual(before);
    },
  );

  // Not a BDD scenario: spec-008 §4's missing-required-argument rule, same wording `memoryAdd` uses.
  it('a missing `--name` is a usage error: exit 2, `missing required argument: --name`', async () => {
    let thrown: unknown;
    try {
      await directiveCreateFn()({ root: repo, options: {} });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    expect(exitCodeForThrow(thrown)).toEqual({ reason: 'missing required argument: --name', exitCode: 2 });
    expect(customDirectiveNames(repo)).toHaveLength(4); // the init-scaffolded custom starters (task-057)
  });

  // REQ-SYS-07: the generated bytes are a pure function of `--name`, not of the repo or the clock.
  it('writes byte-identical content for the same name in two independent repositories', async () => {
    const other = makeInitializedRepo();
    try {
      await directiveCreateFn()({ root: repo, options: { name: NAME } });
      await directiveCreateFn()({ root: other, options: { name: NAME } });
      expect(readFileSync(join(repo, CUSTOM_DIR, `${NAME}.md`), 'utf-8')).toBe(
        readFileSync(join(other, CUSTOM_DIR, `${NAME}.md`), 'utf-8'),
      );
    } finally {
      removeTempDir(other);
    }
  });
});

describe('CORE_MODULES directive.directiveCreate — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-dircreate-noid-'));
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
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message (exit 1) and writes nothing', async () => {
    const unchanged = snapshotPersistence(repo);
    const result = await directiveCreateFn()({ root: repo, options: { name: NAME } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: 'VALIDATION',
      message: 'git identity not configured (user.name/user.email)',
    });
    expect(exitCodeForResult(result)).toBe(1);
    expect(existsSync(join(repo, CUSTOM_DIR))).toBe(false);
    assertPersistenceUnchanged(repo, unchanged);
  });
});
