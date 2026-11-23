/**
 * task-380 AC 1, AC 2 and the CLI half of AC 3 (`bug-452`, `bug-456`, `bug-471`) — through the compiled CLI, the help
 * command's operands are a command path (`spec-008-cli-grammar` §8, as amended at the design gate, `a7ff8c07c`; D2 (a)),
 * the help command's own help names the path that answered (D3 (a)), and `paths --help` says that a category of your
 * own is answered too (D4 (a)).
 *
 * BDD: `P5.1.4-cli-ux.feature`, "Help - the help command takes a command path", "Error - a help path operand that names
 * no command is refused" and "Help - the help command's own help names its path".
 *
 * Expected bytes: every refusal line and hint is the one the direct path printed on a real run of the built CLI
 * (`node dist/cli.js memory addd` → exit 2, stderr `error: unknown command 'addd'` / `hint: did you mean "add"?`;
 * `node dist/cli.js --format json memory addd` → the one-object form), and the comparisons below put the two side by
 * side rather than retyping them where the direct path exists. The usage lines of `help help` are spec-008 §8's.
 * A help text read alone is compared with its whitespace runs collapsed (Commander wraps at 80 columns when stdout is
 * not a TTY); two outputs of the same build are compared byte for byte.
 *
 * Unasserted here (T1): the in-process wiring (the renamed built-in, `program.test.ts`) and the `paths` description's
 * derivation from the schema (`test/core/paths-help-categories.test.ts`).
 */
import { existsSync } from 'node:fs';

import { CORE_MODULES } from '../../src/core';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

/** The nouns that carry verbs, read from the registry (never a hand list). */
const NOUNS_WITH_VERBS = [
  ...new Set(
    enumerateOperations(CORE_MODULES)
      .filter(({ module, operation }) => deriveVerb(module.name, operation.name))
      .map(({ module }) => module.name),
  ),
].sort();

/** Whitespace runs collapsed to one space, ends trimmed. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The three things a run is judged on. */
const outcome = (run: SpawnedRun): { status: number; stdout: string; stderr: string } => ({
  status: run.status,
  stdout: run.stdout,
  stderr: run.stderr,
});

/** spec-008 §8: the help command's own help at a level, its usage line naming the path. */
const helpOfHelp = (path: string): string => `Usage: ${path} help [command]\n\ndisplay help for command\n`;

describe('task-380 — the help command walks a command path (spec-008 §8)', () => {
  let repo: string;

  beforeAll(() => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
    repo = makeTempGitRepo();
  });

  afterAll(() => removeTempDir(repo));

  describe('AC 1 — `help <noun> <verb>` prints that command\'s help (bug-452)', () => {
    it.each([
      ['memory', 'add'],
      ['dna', 'set'],
      ['workflow', 'start'],
    ])('`wingfoil help %s %s` prints byte for byte what `--help` prints for it, at exit 0', (noun, verb) => {
      const direct = runCliEntry(repo, [noun, verb, '--help']);
      expect(direct.status).toBe(0);
      expect(direct.stdout).toContain(`Usage: wingfoil ${noun} ${verb}`);
      expect(direct.stdout).toContain('Example:');
      expect(direct.stdout).toContain('Exit codes:');

      expect(outcome(runCliEntry(repo, ['help', noun, verb]))).toEqual({ status: 0, stdout: direct.stdout, stderr: '' });
    });

    it.each([['memory'], ['paths']])('`wingfoil help %s` (one operand) still prints what `%s --help` prints', (name) => {
      const direct = runCliEntry(repo, [name, '--help']);
      expect(direct.status).toBe(0);
      expect(outcome(runCliEntry(repo, ['help', name]))).toEqual({ status: 0, stdout: direct.stdout, stderr: '' });
    });

    it('`wingfoil help memory help` descends into the noun\'s own help command: what `memory help help` prints', () => {
      const viaNoun = runCliEntry(repo, ['memory', 'help', 'help']);
      expect(outcome(runCliEntry(repo, ['help', 'memory', 'help']))).toEqual({
        status: 0,
        stdout: viaNoun.stdout,
        stderr: '',
      });
      expect(viaNoun.stdout).toBe(helpOfHelp('wingfoil memory'));
    });
  });

  describe('AC 1 — a help path operand that names no command is refused (bug-452, D2 (a))', () => {
    it('`wingfoil help memory addd` is the unknown-command refusal `memory addd` gives, at exit 2, nothing on stdout', () => {
      const direct = runCliEntry(repo, ['memory', 'addd']);
      expect(outcome(direct)).toEqual({
        status: 2,
        stdout: '',
        stderr: `error: unknown command 'addd'\nhint: did you mean "add"?\n`,
      });
      expect(outcome(runCliEntry(repo, ['help', 'memory', 'addd']))).toEqual(outcome(direct));
    });

    it('under `--format json` the refusal is the one JSON object `--format json memory addd` gives', () => {
      const direct = runCliEntry(repo, ['--format', 'json', 'memory', 'addd']);
      expect(outcome(direct)).toEqual({
        status: 2,
        stdout: '',
        stderr: `${JSON.stringify({ error: "unknown command 'addd'", hint: 'did you mean "add"?' })}\n`,
      });
      expect(outcome(runCliEntry(repo, ['--format', 'json', 'help', 'memory', 'addd']))).toEqual(outcome(direct));
    });

    it.each([
      [['help', 'memory', 'add', 'extra'], "error: unknown command 'extra'\n"],
      [['help', 'memory', 'addd', 'extra'], `error: unknown command 'addd'\nhint: did you mean "add"?\n`],
      // Moved here from `operand-error-shape.integration.test.ts` (task-315's row at exit 0): D2 (a) refuses it.
      [['help', 'help', 'help'], "error: unknown command 'help'\n"],
    ] as const)('`wingfoil %j`: the first operand naming no command of the level reached is refused', (argv, stderr) => {
      expect(outcome(runCliEntry(repo, [...argv]))).toEqual({ status: 2, stdout: '', stderr });
    });
  });

  describe('AC 2 — the help command\'s own help names the path that answered (bug-456, D3 (a))', () => {
    it('the nouns with verbs are read from the registry (guard against a vacuous table)', () => {
      expect(NOUNS_WITH_VERBS).toEqual(expect.arrayContaining(['agent', 'directive', 'dna', 'memory', 'workflow']));
    });

    it('`wingfoil help help` prints `Usage: wingfoil help [command]` then the description, at exit 0', () => {
      expect(outcome(runCliEntry(repo, ['help', 'help']))).toEqual({
        status: 0,
        stdout: helpOfHelp('wingfoil'),
        stderr: '',
      });
    });

    it.each(NOUNS_WITH_VERBS.map((noun) => [noun]))(
      '`wingfoil %s help help` and `wingfoil help <noun> help` print `Usage: wingfoil <noun> help [command]`',
      (noun) => {
        const expected = { status: 0, stdout: helpOfHelp(`wingfoil ${noun}`), stderr: '' };
        expect(outcome(runCliEntry(repo, [noun, 'help', 'help']))).toEqual(expected);
        expect(outcome(runCliEntry(repo, ['help', noun, 'help']))).toEqual(expected);
      },
    );
  });

  describe('AC 3 — `paths --help` says that a category of your own is answered too (bug-471, D4 (a))', () => {
    it('the category argument names the seven categories and the declared-by-hand case', () => {
      const result = runCliEntry(repo, ['paths', '--help']);
      expect(result.status).toBe(0);
      expect(collapse(result.stdout)).toContain(
        'category sources, tests, docs, config, governance, runs or health (a category of your own, declared in ' +
          'dna.yaml paths:, is answered too; omit it for the whole map)',
      );
    });
  });
});
