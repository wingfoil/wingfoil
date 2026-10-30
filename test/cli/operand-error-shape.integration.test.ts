/**
 * task-179-give-missing-operand-unknown-command-errors-shape-spec — through the compiled CLI, in a
 * throwaway repository scaffolded by the real `wingfoil init`: the usage refusals a user meets first
 * have ONE shape, the `error:` line plus an optional `hint:` line of `spec-005-cli-command-contract`
 * §3.1, emitted by `src/cli/error.ts`.
 *
 * - A missing required operand (`bug-168`): `error: missing required argument: <name>` and the
 *   command's usage on the `hint:` line, for every command that declares a required positional — the
 *   table is derived from `CORE_MODULES`, never hand-copied, so a verb registered later is covered.
 * - An unknown command (`bug-104`): Commander's `(Did you mean memory?)` becomes
 *   `hint: did you mean "memory"?`, with WingFoil's own Levenshtein-distance-≤-2 match (`spec-008` §1).
 * - `help <unknown>` is the unknown-command refusal of the direct path, `hint:` line included, at the
 *   root and under a noun (task-315, `bug-115`); `help help` asks for the help command's own help and
 *   gets it at exit 0, with no false `unknown command` (task-315, `bug-116`, design gate D1 (b)).
 * - The DNA path verbs refuse a surplus operand at registration like every other command (`bug-180`).
 * - The global `--format` is checked first by every command, the bootstrap ones included (`bug-226`).
 *
 * `runCliEntry` (a `spawnSync` underneath), not `execFileSync` + `catch`: stderr is read back
 * whatever the exit code. `dist/` is built once by `test/global-setup.cjs`.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';

/** HEAD plus the porcelain status: equal before and after means nothing was committed or written. */
function snapshot(repo: string): string {
  return `${git(repo, ['rev-parse', 'HEAD']).trim()}\n${git(repo, ['status', '--porcelain', '--untracked-files=all'])}`;
}

/** Every command whose operation declares a REQUIRED positional, with the usage line it should hint. */
const REQUIRED_OPERAND_COMMANDS = enumerateOperations(CORE_MODULES)
  .filter(({ operation }) => operation.positional?.required === true)
  .map(({ module, operation }) => {
    const verb = deriveVerb(module.name, operation.name);
    const name = verb ? `${module.name} ${verb}` : module.name;
    const requiredOptions = (operation.options ?? [])
      .filter((option) => option.required === true)
      .map((option) => `--${option.name} <${option.valueName ?? 'value'}>`);
    const usage = ['wingfoil', name, `<${operation.positional!.name}>`, ...requiredOptions].join(' ');
    return { name, operand: operation.positional!.name, usage };
  });

describe('task-179 — one shape for missing-operand and unknown-command refusals', () => {
  let repo: string;

  beforeAll(() => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
    repo = makeTempGitRepo();
    const init = runCliEntry(repo, ['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
    mkdirSync(join(repo, 'sub'));
  });

  afterAll(() => removeTempDir(repo));

  describe('AC 1 — a missing required operand (bug-168)', () => {
    it('the table covers every verb with a required operand (guard against a vacuous table)', () => {
      expect(REQUIRED_OPERAND_COMMANDS.length).toBeGreaterThanOrEqual(11);
      expect(REQUIRED_OPERAND_COMMANDS.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['memory submit', 'directive remove', 'dna set', 'dna update']),
      );
    });

    it.each(REQUIRED_OPERAND_COMMANDS.map(({ name, operand, usage }) => [name, operand, usage] as const))(
      '`wingfoil %s` with no operand',
      (name, operand, usage) => {
        const before = snapshot(repo);
        const unchanged = snapshotPersistence(repo);

        const result = runCliEntry(repo, name.split(' '));

        expect(result.status).toBe(2);
        expect(result.stderr).toBe(`error: missing required argument: <${operand}>\nhint: usage: ${usage}\n`);
        expect(result.stdout).toBe('');
        expect(snapshot(repo)).toBe(before);
        assertPersistenceUnchanged(repo, unchanged);
      },
    );

    it('the usage hint names the required options: `memory approve` and `dna set`', () => {
      expect(runCliEntry(repo, ['memory', 'approve']).stderr).toBe(
        'error: missing required argument: <id>\nhint: usage: wingfoil memory approve <id> --reason <text>\n',
      );
      expect(runCliEntry(repo, ['dna', 'set']).stderr).toBe(
        'error: missing required argument: <path>\nhint: usage: wingfoil dna set <path> --value <value>\n',
      );
    });

    it('under `--format json` it is one object carrying `error` and `hint`', () => {
      const result = runCliEntry(repo, ['--format', 'json', 'memory', 'submit']);
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stderr)).toEqual({
        error: 'missing required argument: <id>',
        hint: 'usage: wingfoil memory submit <id>',
      });
    });

    it('is refused before the project root is resolved: from a subdirectory too, at exit 2', () => {
      const result = runCliEntry(join(repo, 'sub'), ['memory', 'history']);
      expect([result.status, result.stderr]).toEqual([
        2,
        'error: missing required argument: <id>\nhint: usage: wingfoil memory history <id>\n',
      ]);
    });
  });

  describe('AC 2 — an unknown command gets the spec-005 §3.1 `hint:` line (bug-104)', () => {
    it('`wingfoil memroy add` (P5.1.4-cli-ux.feature)', () => {
      const result = runCliEntry(repo, ['memroy', 'add']);
      expect([result.status, result.stderr]).toEqual([2, `error: unknown command 'memroy'\nhint: did you mean "memory"?\n`]);
    });

    it('an unknown verb is matched against its noun\'s verbs: `wingfoil memory sbmit`', () => {
      const result = runCliEntry(repo, ['memory', 'sbmit', 'x']);
      expect([result.status, result.stderr]).toEqual([2, `error: unknown command 'sbmit'\nhint: did you mean "submit"?\n`]);
    });

    it('no hint beyond Levenshtein distance 2 (spec-008 §1): `wingfoil memxyz` names no suggestion', () => {
      // `memxyz` is 3 edits from `memory`; Commander's own matcher (Damerau–Levenshtein, distance ≤ 3)
      // suggested it, which is the divergence `bug-104` records.
      const result = runCliEntry(repo, ['memxyz']);
      expect([result.status, result.stderr]).toEqual([2, "error: unknown command 'memxyz'\n"]);
    });

    it('an unknown option keeps the parser\'s match, in the same `hint:` wording', () => {
      const result = runCliEntry(repo, ['dna', 'show', '--formt', 'json']);
      expect([result.status, result.stderr]).toEqual([2, `error: unknown option '--formt'\nhint: did you mean "--format"?\n`]);
    });

    it('under `--format json` the hint is the same text', () => {
      const result = runCliEntry(repo, ['--format', 'json', 'memroy', 'add']);
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stderr)).toEqual({ error: "unknown command 'memroy'", hint: 'did you mean "memory"?' });
    });
  });

  describe('AC 3 — task-315: `help <unknown>` gets the closest-command hint, `help help` its own help', () => {
    /** The `error:` and `hint:` lines of a refusal: what follows Commander's help text under `console`. */
    const refusalLines = (stderr: string): string[] =>
      stderr.split('\n').filter((line) => line.startsWith('error: ') || line.startsWith('hint: '));

    it('`wingfoil help memroy` names `memory` on the `hint:` line, at exit 2 (bug-115, AC 1)', () => {
      const result = runCliEntry(repo, ['help', 'memroy']);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.endsWith(`error: unknown command 'memroy'\nhint: did you mean "memory"?\n`)).toBe(true);
    });

    it.each(['memroy', 'nosuchnoun', 'dnaa'])(
      '`wingfoil help %s` refuses with the same `error:`/`hint:` lines as the direct path (AC 1)',
      (name) => {
        const viaHelp = runCliEntry(repo, ['help', name]);
        const direct = runCliEntry(repo, [name]);
        expect(viaHelp.status).toBe(2);
        expect(refusalLines(viaHelp.stderr)).toEqual(refusalLines(direct.stderr));
        expect(refusalLines(viaHelp.stderr).some((line) => line.startsWith('hint: '))).toBe(name !== 'nosuchnoun');
      },
    );

    it('under `--format json` the `help memroy` refusal carries the same `hint` (AC 1)', () => {
      const result = runCliEntry(repo, ['--format', 'json', 'help', 'memroy']);
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stderr)).toEqual({ error: "unknown command 'memroy'", hint: 'did you mean "memory"?' });
    });

    it('one level down, `wingfoil memory help addd` and `memory help memroy` are unknown-command refusals (AC 1, D3)', () => {
      const near = runCliEntry(repo, ['memory', 'help', 'addd']);
      expect(near.status).toBe(2);
      expect(near.stderr.endsWith(`error: unknown command 'addd'\nhint: did you mean "add"?\n`)).toBe(true);
      expect(near.stderr).not.toContain('missing required argument');

      const far = runCliEntry(repo, ['memory', 'help', 'memroy']);
      expect(far.status).toBe(2);
      expect(far.stderr.endsWith("error: unknown command 'memroy'\n")).toBe(true);
      expect(far.stderr).not.toContain('hint:');
      expect(far.stderr).not.toContain('missing required argument');
    });

    // Design gate D1 (b): asking for the help command's help is answered with it, at exit 0. The text is
    // Commander's help of its built-in `help [command]` command (usage + description, measured on the
    // code build through `Command#_getHelpCommand().helpInformation()`); the `wingfoil …` prefix of the
    // usage line is admitted, not required.
    it.each([
      [['help', 'help'], /^Usage: (wingfoil )?help \[command\]$/],
      [['help', 'help', 'help'], /^Usage: (wingfoil )?help \[command\]$/],
      [['memory', 'help', 'help'], /^Usage: (wingfoil memory )?help \[command\]$/],
    ] as const)('`wingfoil %j` prints the help command\'s own help at exit 0 (bug-116, AC 2)', (args, usage) => {
      const result = runCliEntry(repo, [...args]);
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain('unknown command');
      expect(result.stderr).toBe('');
      expect(result.stdout.split('\n')[0]).toMatch(usage);
      expect(result.stdout).toContain('display help for command');
      expect(result.stdout).not.toContain('Usage: wingfoil [options] [command]');
      expect(result.stdout).not.toContain('Usage: wingfoil memory [options] [command]');
    });
  });

  describe('AC 4 — the DNA path verbs refuse a surplus operand at registration (bug-180)', () => {
    it('from a subdirectory, `dna set project.name bogus --value y` is the surplus refusal at exit 2', () => {
      const result = runCliEntry(join(repo, 'sub'), ['dna', 'set', 'project.name', 'bogus', '--value', 'y']);
      expect([result.status, result.stderr]).toEqual([
        2,
        'error: wingfoil dna set takes one positional <path>; the value travels in --value (got 2 positionals)\n',
      ]);
    });

    it('`dna set ..language --value python` still reports the malformed path (P2.1-dna-set.feature)', () => {
      const before = snapshot(repo);
      const unchanged = snapshotPersistence(repo);
      const result = runCliEntry(repo, ['dna', 'set', '..language', '--value', 'python']);
      expect([result.status, result.stderr]).toEqual([2, "error: invalid key path: '..language'\n"]);
      expect(snapshot(repo)).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });
  });

  describe('AC 5 — every command checks the global `--format` first (bug-226)', () => {
    const invalidFormat = 'error: invalid --format value "bogus", expected one of: console, json, yaml\n';

    it.each([[['init', 'extra']], [['mcp', 'extra']], [['paths', 'a', 'b']], [['mcp']]] as const)(
      '`wingfoil --format bogus %j`',
      (args) => {
        const result = runCliEntry(repo, ['--format', 'bogus', ...args]);
        expect([result.status, result.stderr]).toEqual([2, invalidFormat]);
      },
    );
  });
});
