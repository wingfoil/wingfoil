/**
 * task-362 (`spec-019` Task A; feature P5.1.5, `P5.1.5-capabilities.feature` scenarios 1–4) — `wingfoil capabilities`
 * on the compiled CLI.
 *
 * - AC 1 (red-first): `capabilities --help` shows `spec-019` §1's description and example.
 * - AC 2 (red-first; T-9, T-14): the command runs without a project — from a fresh temporary directory outside
 *   every git repository, under another `LANG`, `LC_ALL` and `TZ`, it exits `0` with the bytes it prints at the
 *   repository root; a non-blank `--project` is not checked, a blank one is refused at exit `2`. "Outside every
 *   repository" is decided with `git rev-parse`, never with WingFoil's own walk, which takes a stray `.git` entry
 *   above the temporary directory for a root.
 * - AC 3 (red-first; T-3, T-6, T-11): `--format json` is `JSON.stringify(document)` plus one `\n`, keys in §3.1's
 *   order; `--format yaml` is js-yaml's `dump` of the same document; `--format console` (the default) is
 *   `renderCapabilitiesConsole` of it; `${version} (${commit})` is the `--version` line.
 * - AC 9 (red-first; T-12, T-13): the usage errors exit `2` with `spec-019` §2's texts.
 *
 * Every child runs with `process.env` minus the agent markers (`test/agent-markers.cjs`), through
 * `test/cli/helpers/spawn-cli.ts`. Expected red: today the CLI answers `error: unknown command 'capabilities'`,
 * exit `2`, so every success case fails on its exit status.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const CHILD_TIMEOUT = 60000;
const BLANK = 'error: invalid flag value: --project must not be blank\n';
const DESCRIPTION = 'print the file formats this WingFoil reads, its commands and the capabilities it provides';
const EXAMPLE = 'wingfoil capabilities --format json';

/** Run the compiled CLI in `cwd` with `process.env` minus the agent markers, plus `extra`. */
function wingfoil(cwd: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture(process.execPath, [CLI_ENTRY, ...args], {
    cwd,
    env: { ...withoutAgentMarkers(process.env), ...extra } as NodeJS.ProcessEnv,
    timeout: CHILD_TIMEOUT,
  });
}

describe('task-362 — wingfoil capabilities on the compiled CLI (spec-019 §1–§3)', () => {
  let outside: string;

  beforeAll(() => {
    outside = mkdtempSync(join(tmpdir(), 'wf-capabilities-outside-'));
  });
  afterAll(() => {
    if (outside !== undefined) rmSync(outside, { recursive: true, force: true });
  });

  it('AC 3 — Print the capabilities document as JSON: one line, keys format, wingfoil, formats, commands, capabilities in that order, stderr empty, exit 0', () => {
    const run = wingfoil(REPO_ROOT, ['capabilities', '--format', 'json']);
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(run.stdout.endsWith('\n')).toBe(true);
    expect(run.stdout.split('\n')).toHaveLength(2);
    const document = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(Object.keys(document)).toEqual(['format', 'wingfoil', 'formats', 'commands', 'capabilities']);
    expect(`${JSON.stringify(document)}\n`).toBe(run.stdout);
  });

  it('AC 3 — The YAML output parses to the JSON document, and is js-yaml\'s dump of it', () => {
    const json = wingfoil(REPO_ROOT, ['capabilities', '--format', 'json']);
    const yaml = wingfoil(REPO_ROOT, ['capabilities', '--format', 'yaml']);
    expect([json.status, yaml.status]).toEqual([0, 0]);
    expect(yaml.stderr).toBe('');
    const document = JSON.parse(json.stdout) as unknown;
    expect(load(yaml.stdout)).toEqual(document);
    expect(yaml.stdout).toBe(dump(document));
  });

  it('AC 3 — T-11: --format console is renderCapabilitiesConsole of the JSON document, and is the default format', () => {
    const json = wingfoil(REPO_ROOT, ['capabilities', '--format', 'json']);
    const consoleRun = wingfoil(REPO_ROOT, ['capabilities', '--format', 'console']);
    const bare = wingfoil(REPO_ROOT, ['capabilities']);
    expect([json.status, consoleRun.status, bare.status]).toEqual([0, 0, 0]);
    expect(consoleRun.stderr).toBe('');
    // Imported here, not at the top: the other cases of this file then fail on the CLI's behaviour, not on a missing module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { renderCapabilitiesConsole } = require('../../src/core/capabilities') as typeof import('../../src/core/capabilities');
    expect(consoleRun.stdout).toBe(renderCapabilitiesConsole(JSON.parse(json.stdout)));
    expect(bare.stdout).toBe(consoleRun.stdout);
  });

  it('AC 3 — T-6: `${version} (${commit})` of the document is the --version line of the same build', () => {
    const json = wingfoil(REPO_ROOT, ['capabilities', '--format', 'json']);
    const version = wingfoil(REPO_ROOT, ['--version']);
    expect([json.status, version.status]).toEqual([0, 0]);
    const { wingfoil: build } = JSON.parse(json.stdout) as { wingfoil: { version: string; commit: string } };
    expect(Object.keys(build)).toEqual(['version', 'commit']);
    expect(`${build.version} (${build.commit})\n`).toBe(version.stdout);
  });

  it('AC 2 — T-9: The same output outside a git repository, under another LANG, LC_ALL and TZ: exit 0 both, stdout byte-identical, stderr empty', () => {
    // The precondition by git itself: the directory is in no repository.
    const probe = spawnSync('git', ['-C', outside, 'rev-parse', '--git-dir'], { encoding: 'utf-8', env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv });
    expect(probe.status).not.toBe(0);
    const atRoot = wingfoil(REPO_ROOT, ['capabilities', '--format', 'json']);
    const away = wingfoil(outside, ['capabilities', '--format', 'json'], { LANG: 'C', LC_ALL: 'tr_TR.UTF-8', TZ: 'Pacific/Kiritimati' });
    expect({ status: atRoot.status, stderr: atRoot.stderr }).toEqual({ status: 0, stderr: '' });
    expect({ status: away.status, stderr: away.stderr }).toEqual({ status: 0, stderr: '' });
    expect(away.stdout).toBe(atRoot.stdout);
  });

  it('AC 2 — T-14: a non-blank --project is not checked: --project /nonexistent exits 0 with the same document', () => {
    const atRoot = wingfoil(REPO_ROOT, ['capabilities', '--format', 'json']);
    const named = wingfoil(outside, ['--project', '/nonexistent', 'capabilities', '--format', 'json']);
    expect(atRoot.status).toBe(0);
    expect(named).toEqual({ status: 0, stdout: atRoot.stdout, stderr: '' });
  });

  it('AC 2 — T-14: a blank --project is refused at exit 2', () => {
    expect(wingfoil(outside, ['capabilities', '--project', ''])).toEqual({ status: 2, stdout: '', stderr: BLANK });
  });

  it('AC 9 — T-12: Error - an operand is refused, exit 2', () => {
    expect(wingfoil(REPO_ROOT, ['capabilities', 'extra'])).toEqual({
      status: 2,
      stdout: '',
      stderr: 'error: wingfoil capabilities takes no positional (got 1 positional)\n',
    });
  });

  it('AC 9 — T-13: --dry-run is an unknown option here, exit 2', () => {
    expect(wingfoil(REPO_ROOT, ['capabilities', '--dry-run'])).toEqual({ status: 2, stdout: '', stderr: "error: unknown option '--dry-run'\n" });
  });

  it('AC 9 — T-13: an unsupported --format value is refused, exit 2', () => {
    expect(wingfoil(REPO_ROOT, ['--format', 'text', 'capabilities'])).toEqual({
      status: 2,
      stdout: '',
      stderr: 'error: invalid --format value "text", expected one of: console, json, yaml\n',
    });
  });

  it('AC 1 — capabilities --help shows spec-019 §1\'s description and example, exit 0', () => {
    const run = wingfoil(REPO_ROOT, ['capabilities', '--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(DESCRIPTION);
    expect(run.stdout).toContain(EXAMPLE);
  });
});
