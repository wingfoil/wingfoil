/**
 * Commander's own parse outcomes, routed through the spec-005 §1 exit-code contract
 * (task-101-route-commander-parse-errors-through-the-exit-code-contract, `bug-098`).
 *
 * `spec-005-cli-command-contract` §1 assigns exit **2** to usage errors ("unknown command/pillar/verb,
 * unknown flag, missing required argument, invalid flag value") and exit **1** to a well-formed
 * invocation that failed on business logic. Before this task the CLI honoured that only for the errors
 * WingFoil itself raised: Commander detects an unknown command / unknown option / missing option
 * argument *before* any WingFoil code runs and terminated through its own `process.exit(1)`, so two
 * whole classes of usage error reported `1` — the code a script reads as "your request was well-formed
 * and failed".
 *
 * Every assertion here is an **out-of-process** exit code: each case spawns `fixtures/cli-harness.cjs`,
 * which drives the COMPILED `dist/` (built once by jest's `globalSetup`) exactly as the real `wingfoil`
 * bin does, and the `status` `spawnSync` reports is the real process status. Nothing is measured through a
 * pipe — a pipe reports the last command's status, which is how this class of measurement goes wrong.
 *
 * Scope note: the unknown-option sweep is driven from `CORE_MODULES` (AC8) rather than a hand-picked
 * sample, so a command added later is covered the day it is registered; `init` and `mcp` are
 * hand-wired bootstrap commands outside `CORE_MODULES` and are asserted explicitly.
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { buildCliCommands, listRegisteredCliCommands } from '../../src/cli/registrar';
import { CORE_MODULES } from '../../src/core';
import { distBuildStamp } from './helpers/dist-stamp';
import { CLI_FIXTURE_ROOT, DIST_DIR, runCliHarness, type SpawnedRun } from './helpers/spawn-cli';


/** Spawn the compiled CLI against the static fixture root; `status` is the real process exit code. */
function runCli(...args: readonly string[]): SpawnedRun {
  return runCliHarness(CLI_FIXTURE_ROOT, args);
}

/**
 * Every `wingfoil <noun> [verb]` invocation path the production registry derives, as argv token
 * arrays — the AC8 surface. Built from `CORE_MODULES` through the same registrar the CLI uses, so this
 * list cannot drift from what is actually registered.
 */
const DERIVED_COMMAND_PATHS: readonly (readonly string[])[] = listRegisteredCliCommands(
  buildCliCommands(CORE_MODULES, { resolveRoot: () => CLI_FIXTURE_ROOT, buildParams: (ctx) => ({ root: ctx.root }) }),
).map((name) => name.split(' '));

/** The two hand-wired bootstrap commands (`src/cli/program.ts`), which are NOT derived from `CORE_MODULES`. */
const BOOTSTRAP_COMMAND_PATHS: readonly (readonly string[])[] = [['init'], ['mcp']];

beforeAll(() => {
  // `dist/` is built once by jest's globalSetup (test/global-setup.cjs) — bug-003-cli-integration-dist-race.
  expect(existsSync(join(DIST_DIR, 'cli', 'program.js'))).toBe(true);
  // Guard the sweep below against silently degenerating into "verified where it cannot fail".
  expect(DERIVED_COMMAND_PATHS.length).toBeGreaterThanOrEqual(10);
});

describe('AC2 — an unknown command exits 2 at every level (spec-005 §1)', () => {
  it('a bare unknown noun exits 2', () => {
    const result = runCli('nosuchpillar');
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('an unknown verb under a known noun exits 2', () => {
    const result = runCli('dna', 'nosuchverb');
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('a plausible-but-unregistered verb under a known noun exits 2 (the typo a script actually hits)', () => {
    expect(runCli('dna', 'infer').status).toBe(2);
    expect(runCli('memory', 'list').status).toBe(2);
    expect(runCli('workflow', 'start').status).toBe(2);
  });
});

describe('AC3 — an unknown option exits 2 on every registered command (AC8: the whole surface)', () => {
  it.each(DERIVED_COMMAND_PATHS.map((path) => [path.join(' '), path] as const))(
    '`wingfoil %s --nosuchoption` exits 2',
    (_label, path) => {
      const result = runCli(...path, '--nosuchoption');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("error: unknown option '--nosuchoption'");
      expect(result.stdout).toBe('');
    },
  );

  it.each(BOOTSTRAP_COMMAND_PATHS.map((path) => [path.join(' '), path] as const))(
    '`wingfoil %s --nosuchoption` exits 2 — the hand-wired bootstrap commands a CORE_MODULES sweep misses',
    (_label, path) => {
      const result = runCli(...path, '--nosuchoption');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("error: unknown option '--nosuchoption'");
    },
  );

  // `commander.excessArguments` was reachable in production through these two only, until task-165
  // (`bug-179`) gave them the shared refusal every derived command gives (task-129): no shipped command
  // raises it now, so the extra operand exits 2 in WingFoil's wording, pinned in full by
  // `./extra-operand-refusal.integration.test.ts`.
  it.each(BOOTSTRAP_COMMAND_PATHS.map((path) => [path.join(' '), path] as const))(
    '`wingfoil %s extra` exits 2 — the shared surplus refusal, not Commander\'s (bug-179)',
    (_label, path) => {
      const result = runCli(...path, 'extra');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('takes no positional (got 1 positional)');
      expect(result.stderr).not.toContain('too many arguments');
    },
  );

  it('an unknown option on a command that carries derived `--entry-<field>` options exits 2', () => {
    // `dna add` is the command whose option set is derived per-field (task-093's `--entry-` namespace),
    // so its unknown-option path runs with a large registered option list rather than an empty one.
    const result = runCli('dna', 'add', 'stacks.technologies', '--value', 'Zod', '--nosuchoption', 'x');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error: unknown option '--nosuchoption'");
  });

  it('an unknown option BEFORE the noun (a global-flag position) exits 2', () => {
    const result = runCli('--nosuchoption', 'dna', 'show');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error: unknown option '--nosuchoption'");
  });
});

describe('AC4 — the messages do not change; only the codes do', () => {
  it("an unknown command still reads `error: unknown command 'x'`", () => {
    expect(runCli('nosuchpillar').stderr).toContain("error: unknown command 'nosuchpillar'");
    expect(runCli('dna', 'nosuchverb').stderr).toContain("error: unknown command 'nosuchverb'");
  });

  it("an unknown option still reads `error: unknown option '--x'`", () => {
    expect(runCli('dna', 'show', '--section', 'project').stderr).toContain("error: unknown option '--section'");
  });

  it("the closest-match suggestion is WingFoil's `hint:` line — `P5.1.4-cli-ux.feature`'s own example", () => {
    // Until task-179 this pinned commander's own `(Did you mean memory?)`, a third party's wording from a
    // Damerau-Levenshtein matcher with `maxDistance = 3`, while `spec-008` §1 asks for `spec-005` §3.1's
    // `hint: did you mean "memory"?` at Levenshtein <= 2 (`bug-104`). The suggestion is now computed by
    // `src/cli/suggest.ts` and written by `src/cli/error.ts`, so this asserts the declared contract:
    // the error line, then the hint line, and nothing else.
    const result = runCli('memroy', 'add');
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(`error: unknown command 'memroy'\nhint: did you mean "memory"?\n`);
  });
});

describe('AC5 — `--help` and `--version` still exit 0 (characterization: the trap)', () => {
  it('`wingfoil --help` exits 0 and prints usage on stdout', () => {
    const result = runCli('--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: wingfoil');
  });

  it('`wingfoil dna --help` (noun level) exits 0', () => {
    const result = runCli('dna', '--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: wingfoil dna');
  });

  it('`wingfoil dna set --help` (verb level) exits 0', () => {
    const result = runCli('dna', 'set', '--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: wingfoil dna set');
  });

  it('`wingfoil init --help` (a hand-wired bootstrap command) exits 0', () => {
    expect(runCli('init', '--help').status).toBe(0);
  });

  it('`wingfoil --version` exits 0 and prints the build stamp `<semver> (<sha>)` (task-192)', () => {
    const result = runCli('--version');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(distBuildStamp());
  });

  it("commander's built-in `help` command exits 0, at both depths", () => {
    expect(runCli('help').status).toBe(0);
    expect(runCli('help', 'dna').status).toBe(0);
  });

  it('a noun invoked bare prints its help AND an `error:` line, at exit 2 — since task-103', () => {
    // This case is why the discriminator has to be finer than "the code alone". Commander reaches it
    // through `commander.help` (`this.help({ error: true })`, suggested exit code 1) — the SAME code
    // as the built-in `help` command in the case directly above, which must keep exiting 0.
    //
    // `task-101` left it at exit 1 with no message, because promoting it meant separating "help
    // printed because the user asked" from "help printed because the invocation was incomplete", and
    // no AC of that task asked for it. `bug-103` recorded the two `spec-005` §1 violations that left
    // standing — a malformed invocation reporting `1`, and a non-zero exit carrying no error message
    // at all — and `task-103` closed them by keying on commander's *suggested exit code* within that
    // one code. So this assertion and the `help` one above must move in opposite directions or not at
    // all: that is what it is doing here, among the `--help` / `--version` / `help` cases, rather than
    // with its own task's suite.
    //
    // The wording of the line, the sibling `wingfoil help <unknown>` case and the per-noun sweep are
    // task-103's and live in `test/cli/missing-verb-exit-code.integration.test.ts`.
    const result = runCli('dna');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage: wingfoil dna');
    expect(result.stderr).toContain('error: ');
  });
});

describe('AC7 — the conformant cases stay conformant (characterization)', () => {
  it('an invalid flag value is still a usage error at exit 2, with its own message', () => {
    const result = runCli('--format', 'nosuchformat', 'dna', 'show', 'project');
    expect(result.status).toBe(2);
    expect(result.stderr).toBe('error: invalid --format value "nosuchformat", expected one of: console, json, yaml\n');
  });

  it("a missing required argument WingFoil itself raises is still exit 2", () => {
    const result = runCli('dna', 'set');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('error: missing required argument');
  });

  it('a value option given without its operand is a usage error at exit 2 (commander.optionMissingArgument)', () => {
    const result = runCli('memory', 'add', '--type');
    expect(result.status).toBe(2);
    // Commander names the option by its help synopsis, so the placeholder is the declared `valueName`
    // (`<type>` since task-120, `<value>` before it); the exit code is what this case pins.
    expect(result.stderr).toContain("error: option '--type <type>' argument missing");
  });

  it('a validation / logic failure is still exit 1 — a well-formed invocation that failed', () => {
    const result = runCli('dna', 'show', 'nosuchsection');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('error: ');
  });

  it('a successful command is still exit 0', () => {
    const result = runCli('dna', 'show', '--format', 'json');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
