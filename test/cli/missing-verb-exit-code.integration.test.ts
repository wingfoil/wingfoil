/**
 * A noun invoked without a verb, routed through the spec-005 §1 exit-code contract
 * (task-103-a-missing-verb-exits-2-with-an-error-line, `bug-103`).
 *
 * `task-101` mapped the nine commander codes raised through `Command#error()`. These invocations
 * never reach one: commander prints the command's help to **stderr** and terminates through
 * `commander.help` — a *non-error* code — so before this task `wingfoil dna` exited `1` with no
 * `error:` token anywhere, breaking two separate rules of `spec-005` §1 at once. The section assigns
 * exit `2` to a malformed invocation ("unknown command/pillar/verb, unknown flag, missing required
 * argument, invalid flag value") and states in absolute terms that *"A non-zero exit code (`1` or
 * `2`) is **always** accompanied by an error message on stderr … a bare non-zero exit with no message
 * is a contract violation."*
 *
 * THE TRAP THIS SUITE EXISTS FOR: `--help`, `--version`, the built-in `help` command and these
 * malformed invocations all terminate through the same non-error path, and two of them share the same
 * `commander.help` code. The discriminator is commander's own **suggested exit code** on that code,
 * measured against commander@15.0.0 rather than recalled:
 *
 * | invocation                | code                        | suggested | means                        |
 * |---------------------------|-----------------------------|-----------|------------------------------|
 * | `wingfoil help`           | `commander.help`            | `0`       | the user asked for help      |
 * | `wingfoil help dna`       | `commander.help`            | `0`       | the user asked for help      |
 * | `wingfoil dna`            | `commander.help`            | `1`       | the invocation was incomplete|
 * | `wingfoil help nosuchnoun`| `commander.help`            | `1`       | the invocation was incomplete|
 * | `wingfoil --help`         | `commander.helpDisplayed`   | `0`       | the user asked for help      |
 * | `wingfoil --version`      | `commander.version`         | `0`       | the user asked for a version |
 *
 * `Command#help(contextOptions)` (`node_modules/commander/lib/command.js`) sets that suggestion to `1`
 * exactly when it was called as `help({ error: true })` — the three call sites that mean "there is
 * nothing here to run": the missing-subcommand branch, the nothing-hooked-up branch, and
 * `_dispatchSubcommand`'s `if (!subCommand)`, which is where `help <unknown>` lands. So "help printed
 * because the user asked" and "help printed because the invocation was incomplete" are separable by
 * the parser's own two fields, with no re-parsing of argv. Both halves are pinned below, because a
 * mapping that got the first half right and the second half wrong would turn `wingfoil --help` into a
 * usage error while every obvious test stayed green.
 *
 * Every assertion here is an **out-of-process** exit code: each case spawns `fixtures/cli-harness.cjs`
 * against the COMPILED `dist/` (built once by jest's `globalSetup`), and the `status` `spawnSync` reports is
 * the real process status. Nothing is measured through a pipe — a pipe reports the last command's
 * status, which is how this class of measurement goes wrong.
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
 * Every noun the production registry derives that carries verbs under it — i.e. every `wingfoil
 * <noun>` that is incomplete on its own. Built from `CORE_MODULES` through the same registrar the CLI
 * uses, so a noun registered later is covered the day it appears and this sweep cannot degenerate into
 * "verified where it cannot fail". A flat, self-named command (`paths` — `spec-008` §1's
 * `wingfoil <noun> [args]` form) has an action handler and is deliberately NOT here: it runs.
 */
const NOUNS_WITH_VERBS: readonly string[] = [
  ...new Set(
    listRegisteredCliCommands(
      buildCliCommands(CORE_MODULES, { resolveRoot: () => CLI_FIXTURE_ROOT, buildParams: (ctx) => ({ root: ctx.root }) }),
    )
      .map((name) => name.split(' '))
      .filter((path) => path.length > 1)
      .map((path) => path[0] ?? ''),
  ),
];

beforeAll(() => {
  // `dist/` is built once by jest's globalSetup (test/global-setup.cjs) — bug-003-cli-integration-dist-race.
  expect(existsSync(join(DIST_DIR, 'cli', 'program.js'))).toBe(true);
  expect(NOUNS_WITH_VERBS.length).toBeGreaterThanOrEqual(4);
});

describe('AC2 — a noun invoked with no verb exits 2 and emits an `error:` line (spec-005 §1)', () => {
  it.each(['dna', 'memory', 'workflow', 'directive'])(
    '`wingfoil %s` exits 2 with a `missing required argument` line naming the invocation',
    (noun) => {
      const result = runCli(noun);
      expect(result.status).toBe(2);
      // The WORDING is a ruling, not a lookup: commander supplies no message on this path at all, so
      // the shape is borrowed from the one WingFoil already emits for a missing positional
      // (`src/core/index.ts`'s `missing required argument: wingfoil dna set <path> --value <value>`,
      // task-093) — the same key, and the incomplete invocation echoed back with the token that would
      // complete it. `<command>` rather than `<verb>` is commander's own placeholder for a
      // subcommand, which is what the usage line printed directly above this says.
      expect(result.stderr).toContain(`error: missing required argument: wingfoil ${noun} <command>`);
      expect(result.stdout).toBe('');
    },
  );

  it('every noun that carries verbs behaves the same way — the whole surface, not a sample', () => {
    for (const noun of NOUNS_WITH_VERBS) {
      const result = runCli(noun);
      expect({ noun, status: result.status }).toEqual({ noun, status: 2 });
      expect(result.stderr).toContain(`error: missing required argument: wingfoil ${noun} <command>`);
    }
  });

  it('`wingfoil` with no arguments at all is the same defect one level up, and gets the same answer', () => {
    // Not named in the ACs, and reached through the identical `help({ error: true })` branch: leaving
    // it at exit 1 with no message would leave the rule `spec-005` §1 states in absolute terms broken
    // in this repository the moment the rest of this task landed. A user who wants the help types
    // `wingfoil --help` or `wingfoil help`, and both still exit 0 (AC4 below).
    const result = runCli();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('error: missing required argument: wingfoil <command>');
  });

  it('the usage text commander prints is kept, and the `error:` line closes stderr', () => {
    // The ORDER is a ruling too. Commander writes the help before it calls the exit callback, so the
    // `error:` line can only follow it; suppressing the help would mean intercepting commander's
    // output stream, which would also put the nine already-correct messages `task-101` pinned behind
    // an interception. The help is exactly the right diagnostic here — it lists the verbs that were
    // missing — and `spec-005` §3.1 requires the `error:` line to be ON stderr, not to be alone there.
    const result = runCli('dna');
    const lines = result.stderr.trimEnd().split('\n');
    expect(lines[0]).toContain('Usage: wingfoil dna');
    expect(lines[lines.length - 1]).toBe('error: missing required argument: wingfoil dna <command>');
  });
});

describe('AC3 — `help <unknown>` gets the same treatment (same root, same two violations)', () => {
  it('`wingfoil help nosuchnoun` exits 2 with an unknown-command line', () => {
    const result = runCli('help', 'nosuchnoun');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error: unknown command 'nosuchnoun'");
    expect(result.stdout).toBe('');
  });

  it('it reads byte-for-byte like the same unknown noun typed directly', () => {
    // `wingfoil nosuchnoun` already exits 2 with commander's own `error: unknown command 'nosuchnoun'`
    // (task-101). Asking about the same unknown noun through `help` is the same mistake, so it gets
    // the same line — single quotes included, matching the emitted neighbour rather than `spec-005`
    // §4's double-quoted example, so a script greps ONE shape. That the two spellings differ at all is
    // `bug-104` (commander's messages never pass through `src/cli/error.ts`), which owns reconciling
    // BOTH of these lines; this task must not pick a third spelling in the meantime.
    const direct = runCli('nosuchnoun');
    const viaHelp = runCli('help', 'nosuchnoun');
    expect(direct.status).toBe(2);
    expect(viaHelp.status).toBe(2);
    const line = (stderr: string): string | undefined => stderr.split('\n').find((l) => l.startsWith('error: '));
    expect(line(viaHelp.stderr)).toBe(line(direct.stderr));
  });
});

describe('AC4 — asking for help still exits 0 (characterization: the trap)', () => {
  it.each([
    [['--help'], 'Usage: wingfoil'],
    [['dna', '--help'], 'Usage: wingfoil dna'],
    [['dna', 'set', '--help'], 'Usage: wingfoil dna set'],
    [['init', '--help'], 'Usage: wingfoil init'],
  ])('`wingfoil %s` exits 0 and prints usage on stdout', (args, usage) => {
    const result = runCli(...args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(usage);
    expect(result.stderr).toBe('');
  });

  it('`wingfoil --version` exits 0', () => {
    const result = runCli('--version');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(distBuildStamp());
    expect(result.stderr).toBe('');
  });

  it('the built-in `help` command exits 0 at both depths — the near-miss this whole task walks past', () => {
    // `help` and `help dna` terminate through `commander.help`, the SAME code as `wingfoil dna` and
    // `wingfoil help nosuchnoun`. Only commander's suggested exit code (0 here, 1 there) separates
    // them. If that discriminator is ever weakened to "the code alone", these two are what breaks.
    for (const args of [['help'], ['help', 'dna']]) {
      const result = runCli(...args);
      expect({ args, status: result.status }).toEqual({ args, status: 0 });
      expect(result.stdout).toContain('Usage: wingfoil');
      expect(result.stderr).toBe('');
    }
  });

  it('every noun answers `--help` at exit 0, however many of them there are', () => {
    for (const noun of NOUNS_WITH_VERBS) {
      const result = runCli(noun, '--help');
      expect({ noun, status: result.status }).toEqual({ noun, status: 0 });
      expect(result.stdout).toContain(`Usage: wingfoil ${noun}`);
    }
  });
});
