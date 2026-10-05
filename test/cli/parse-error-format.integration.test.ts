/**
 * Every refusal the argument parser raises honours `--format` (task-130, `bug-114`; `spec-005` §3.2).
 *
 * Before this task a WingFoil refusal under `--format json` was a `{"error": …}` object while every
 * refusal Commander raised — an unknown command, an unknown option, a missing option argument — and
 * the missing-verb line `task-103` added were console text, so one invocation's stderr changed shape
 * with the layer that refused it. `bug-114`'s counter-argument is answered here too: under a machine
 * format the usage text Commander prints for an incomplete invocation is NOT written, so stderr is the
 * one object and nothing else, rather than an object buried under help text.
 *
 * Exit codes are unchanged (`task-101`/`task-103` own them); this suite re-asserts them only so a
 * shape change that broke a code cannot pass. Console output stays byte-for-byte what it was — the
 * suggestion's wording and spelling are `bug-104`'s, not this task's.
 *
 * BDD: `P5.1.4-cli-ux.feature`, "Error - a refusal has one shape under --format json, whichever layer
 * raises it" (the `memroy` cases below).
 *
 * Every case spawns `fixtures/cli-harness.cjs` against the COMPILED `dist/` (built once by jest's
 * `globalSetup`), so the real ESM `commander` and the real process exit are what is measured.
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { load as yamlLoad } from 'js-yaml';
import { CLI_FIXTURE_ROOT, DIST_DIR, runCliHarness, type SpawnedRun } from './helpers/spawn-cli';

/** Spawn the compiled CLI against the static fixture root; `status` is the real process exit code. */
function runCli(...args: readonly string[]): SpawnedRun {
  return runCliHarness(CLI_FIXTURE_ROOT, args);
}

/** Parse stderr as exactly ONE JSON object on one line — throws (fails the test) on anything else. */
function singleJsonObject(stderr: string): Record<string, unknown> {
  const lines = stderr.split('\n').filter((line) => line !== '');
  expect(lines).toHaveLength(1);
  const parsed: unknown = JSON.parse(lines[0] ?? '');
  expect(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)).toBe(true);
  return parsed as Record<string, unknown>;
}

beforeAll(() => {
  // `dist/` is built once by jest's globalSetup (test/global-setup.cjs) — bug-003-cli-integration-dist-race.
  expect(existsSync(join(DIST_DIR, 'cli', 'program.js'))).toBe(true);
});

/**
 * The parse-path refusals of AC2, plus the missing-verb line `bug-114` names, each with the reason
 * WingFoil's console output carries for it today (the `error: ` prefix removed). The `--format json`
 * flag is placed both before and after the failing token, because Commander reads the global option
 * wherever it appears and a refusal must not depend on where the caller put it.
 */
const PARSE_REFUSALS: readonly { name: string; args: readonly string[]; reason: string; hint?: string }[] = [
  { name: 'an unknown command', args: ['nosuchpillar'], reason: "unknown command 'nosuchpillar'" },
  { name: 'an unknown option', args: ['dna', 'show', '--bogus'], reason: "unknown option '--bogus'" },
  {
    name: 'a missing option argument',
    args: ['memory', 'add', '--type'],
    reason: "option '--type <type>' argument missing",
  },
  // task-179 (`bug-168`): the one missing-operand shape, with the usage as the hint.
  { name: 'a noun with no verb', args: ['dna'], reason: 'missing required argument: <command>', hint: 'usage: wingfoil dna <command>' },
];

describe('AC2 — a parse-path refusal under `--format json` is one JSON object on stderr (bug-114)', () => {
  it.each(PARSE_REFUSALS)('$name: `{"error": <reason>}` and nothing else, exit 2', ({ args, reason, hint }) => {
    const result = runCli('--format', 'json', ...args);
    expect(result.status).toBe(2);
    expect(singleJsonObject(result.stderr)).toEqual({ error: reason, ...(hint !== undefined ? { hint } : {}) });
    expect(result.stdout).toBe('');
  });

  // A missing option argument consumes the next token as its value, so it is the one case the trailing
  // placement cannot express; the others must not depend on placement.
  const TRAILING = PARSE_REFUSALS.filter(({ args }) => args.at(-1) !== '--type');
  it.each(TRAILING)('$name: the same object when `--format json` comes last', ({ args, reason, hint }) => {
    const result = runCli(...args, '--format', 'json');
    expect(result.status).toBe(2);
    expect(singleJsonObject(result.stderr)).toEqual({ error: reason, ...(hint !== undefined ? { hint } : {}) });
  });

  it('the same shape as a core refusal: the keys a WingFoil error carries, and no others', () => {
    // A core refusal under `--format json` (exit 2 from core's own usage check) — the reference shape.
    const core = runCli('--format', 'json', 'memory', 'add');
    expect(core.status).toBe(2);
    const coreObject = singleJsonObject(core.stderr);
    const parse = singleJsonObject(runCli('--format', 'json', 'dna', 'show', '--bogus').stderr);
    expect(Object.keys(parse)).toEqual(Object.keys(coreObject));
  });

  it("an unknown command's closest-match suggestion rides as `hint`, not inside `error`", () => {
    const result = runCli('--format', 'json', 'memroy', 'add');
    expect(result.status).toBe(2);
    expect(singleJsonObject(result.stderr)).toEqual({ error: "unknown command 'memroy'", hint: 'did you mean "memory"?' });
  });

  it('`--format yaml` is the same object, serialized as YAML', () => {
    // The suggestion case on purpose: a one-line console refusal (`error: unknown option '--x'`) is
    // itself valid YAML for `{error: …}`, so only a two-field object tells the formats apart.
    const result = runCli('--format', 'yaml', 'memroy', 'add');
    expect(result.status).toBe(2);
    expect(yamlLoad(result.stderr)).toEqual({ error: "unknown command 'memroy'", hint: 'did you mean "memory"?' });
  });
});

describe('characterization — console output of the parse path', () => {
  it('an unknown command keeps `error:`; its suggestion is the spec-005 §3.1 `hint:` line since task-179 (bug-104)', () => {
    const result = runCli('memroy', 'add');
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(`error: unknown command 'memroy'\nhint: did you mean "memory"?\n`);
  });

  it('an unknown option keeps its single `error:` line', () => {
    const result = runCli('dna', 'show', '--bogus');
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("error: unknown option '--bogus'\n");
  });

  it('a noun with no verb still prints its usage text, then the error line', () => {
    const result = runCli('dna');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage: wingfoil dna');
    expect(result.stderr.endsWith('error: missing required argument: <command>\nhint: usage: wingfoil dna <command>\n')).toBe(true);
  });

  it('`--help` is untouched by a machine format: usage on stdout, exit 0', () => {
    const result = runCli('--format', 'json', 'dna', '--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: wingfoil dna');
  });
});
