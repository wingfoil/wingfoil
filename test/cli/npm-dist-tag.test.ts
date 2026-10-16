/**
 * task-266 (`dl-159` Decision 6, Action A1.2; approver ruling D4 (a), 2026-10-16) — `scripts/npm-dist-tag.cjs`,
 * the pure choice of the npm dist-tag a release version receives: `latest` only when the version is above every
 * published version (by semver, numerically), otherwise `latest-X.Y` of its own line, so a `0.3.1` published
 * after `0.4.0` never takes `latest` from it. `publish.yml`'s `promote` passes the result to `npm stage publish`
 * with an explicit `--tag` (an explicit tag switches npm's own "Cannot implicitly apply the latest tag" guard off,
 * so this function is the only guard); `pages.yml` deploys the site only when the tag's version gets `latest`
 * (`dl-159` A1.4).
 *
 * The function is tested through its exports; the command line, which both workflows run, through
 * `spawnSync(process.execPath, …)`. Nothing here reaches a registry: the published versions are an argument.
 *
 * T1 classification: red-first — the script does not exist before this task.
 */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { distTagFor, parsePublishedVersions } from '../../scripts/npm-dist-tag.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'npm-dist-tag.cjs');
const USAGE = 'usage: node scripts/npm-dist-tag.cjs <vX.Y.Z> --published <json> [--allow-published]';

/** The message `JSON.parse` gives for `text` on this Node — the parse refusal quotes it. */
function jsonParseMessage(text: string): string {
  try {
    JSON.parse(text);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`fixture ${JSON.stringify(text)} is valid JSON`);
}

function cli(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf-8' });
}

describe('distTagFor (task-266 AC 1) — latest only for the highest published version, else latest-X.Y (dl-159)', () => {
  it('AC 1: 0.3.1 over [0.3.0] → latest', () => {
    expect(distTagFor('0.3.1', ['0.3.0'])).toEqual({
      ok: true,
      distTag: 'latest',
      message: '0.3.1 is above every published version (highest 0.3.0): dist-tag latest (dl-159)',
    });
  });

  it('AC 1: 0.3.1 over [0.3.0, 0.4.0] → latest-0.3', () => {
    expect(distTagFor('0.3.1', ['0.3.0', '0.4.0'])).toEqual({
      ok: true,
      distTag: 'latest-0.3',
      message: '0.3.1 is below the highest published version 0.4.0: dist-tag latest-0.3 (dl-159)',
    });
  });

  it('AC 1: 0.4.0 over [0.3.0, 0.3.1] → latest', () => {
    expect(distTagFor('0.4.0', ['0.3.0', '0.3.1'])).toEqual({
      ok: true,
      distTag: 'latest',
      message: '0.4.0 is above every published version (highest 0.3.1): dist-tag latest (dl-159)',
    });
  });

  it('AC 1: nothing published → latest, with the "none published" message', () => {
    expect(distTagFor('0.1.0', [])).toEqual({
      ok: true,
      distTag: 'latest',
      message: '0.1.0 is above every published version (none published): dist-tag latest (dl-159)',
    });
  });

  it.each([
    ['0.10.0', ['0.9.0'], 'latest'],
    ['1.2.3', ['1.2.10'], 'latest-1.2'],
    ['10.2.3', ['9.9.9'], 'latest'],
    ['0.3.1', ['0.3.0', '0.3.10'], 'latest-0.3'],
    ['2.0.0', ['1.99.99'], 'latest'],
  ] as const)('AC 1: compares numerically, not lexically — %s over %j → %s', (version, published, expected) => {
    const decision = distTagFor(version, published);
    expect(decision.ok).toBe(true);
    expect(decision.ok && decision.distTag).toBe(expected);
  });

  it('AC 1: the order of the published list does not matter', () => {
    const sorted = distTagFor('0.3.1', ['0.2.1', '0.2.2', '0.3.0', '0.4.0']);
    const shuffled = distTagFor('0.3.1', ['0.4.0', '0.2.2', '0.3.0', '0.2.1']);
    expect(shuffled).toEqual(sorted);
    expect(sorted.ok && sorted.distTag).toBe('latest-0.3');
  });

  it('AC 1 (D4 (a)): a published prerelease is ignored when finding the highest version', () => {
    expect(distTagFor('0.3.1', ['0.3.0', '0.4.0-rc.1'])).toEqual({
      ok: true,
      distTag: 'latest',
      message: '0.3.1 is above every published version (highest 0.3.0): dist-tag latest (dl-159)',
    });
  });

  it('AC 1: a version already in the published list is refused, naming it', () => {
    expect(distTagFor('0.3.0', ['0.3.0'])).toEqual({
      ok: false,
      message: '0.3.0 is already published; npm accepts a version once',
    });
  });

  it('AC 1: a prerelease is refused, naming it', () => {
    expect(distTagFor('0.3.1-rc.1', ['0.3.0'])).toEqual({
      ok: false,
      message: '0.3.1-rc.1 is a prerelease: only X.Y.Z versions are promoted (spec-015 §4)',
    });
  });

  it.each(['v0.3.1', '0.3', '01.2.3', '0.3.1.4', ''])('AC 1: %j is refused as not a version of the form X.Y.Z', (version) => {
    expect(distTagFor(version, ['0.3.0'])).toEqual({
      ok: false,
      message: `${version} is not a version of the form X.Y.Z`,
    });
  });

  it('AC 1: a published entry that is not a semantic version is refused, naming it', () => {
    expect(distTagFor('0.3.1', ['0.3.0', 'banana'])).toEqual({
      ok: false,
      message: 'published version banana is not a semantic version',
    });
  });

  it('AC 1: pure — a frozen published list is not mutated, and two calls give equal results', () => {
    const published = Object.freeze(['0.4.0', '0.3.0']);
    const first = distTagFor('0.3.1', published);
    const second = distTagFor('0.3.1', published);
    expect(second).toEqual(first);
    expect(published).toEqual(['0.4.0', '0.3.0']);
  });
});

describe('parsePublishedVersions (task-266 AC 2) — the `npm view wingfoil versions --json` output', () => {
  it('reads a JSON array of strings', () => {
    expect(parsePublishedVersions('["0.2.1","0.2.2"]')).toEqual({ ok: true, versions: ['0.2.1', '0.2.2'] });
  });

  it('reads a lone JSON string (npm prints one for a one-version package) as a one-element list', () => {
    expect(parsePublishedVersions('"0.2.1"')).toEqual({ ok: true, versions: ['0.2.1'] });
  });

  it.each(['', 'nope'])('refuses %j, quoting the JSON parse error', (text) => {
    expect(parsePublishedVersions(text)).toEqual({
      ok: false,
      message: `could not read the published versions: ${jsonParseMessage(text)}`,
    });
  });

  it.each(['[1]', '{}', 'null'])('refuses %s as not a JSON array of strings', (text) => {
    expect(parsePublishedVersions(text)).toEqual({
      ok: false,
      message: 'the published versions are not a JSON array of strings',
    });
  });
});

describe('npm-dist-tag command line (task-266 AC 2, A1.4) — what promote and pages run', () => {
  it('exists and requires nothing but node: built-ins (promote runs no npm ci)', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const source = readFileSync(SCRIPT, 'utf-8');
    const required = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] as string);
    for (const name of required) expect([name, name.startsWith('node:')]).toEqual([name, true]);
  });

  it('a lower patch: exit 0, stdout exactly `latest-0.3\\n`, the message on stderr', () => {
    const result = cli(['v0.3.1', '--published', '["0.3.0","0.4.0"]']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('latest-0.3\n');
    expect(result.stderr).toContain('0.3.1 is below the highest published version 0.4.0: dist-tag latest-0.3 (dl-159)');
  });

  it('the newest version: exit 0, stdout exactly `latest\\n`', () => {
    const result = cli(['v0.4.0', '--published', '["0.3.0","0.3.1"]']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('latest\n');
    expect(result.stderr).toContain('0.4.0 is above every published version (highest 0.3.1): dist-tag latest (dl-159)');
  });

  it('a version already published: exit 1, nothing on stdout, the refusal on stderr', () => {
    const result = cli(['v0.3.0', '--published', '["0.3.0"]']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('0.3.0 is already published; npm accepts a version once');
  });

  it('--allow-published (pages, a re-run after the version went live) drops the version itself: latest', () => {
    const result = cli(['v0.3.0', '--published', '["0.3.0"]', '--allow-published']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('latest\n');
  });

  it('--allow-published keeps the rule: a live lower patch is still latest-0.3', () => {
    const result = cli(['v0.3.1', '--published', '["0.3.1","0.4.0"]', '--allow-published']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('latest-0.3\n');
  });

  it('a tag without the leading `v`: exit 1, naming the tag', () => {
    const result = cli(['0.3.1', '--published', '["0.3.0"]']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('tag 0.3.1 is not of the form vX.Y.Z (spec-015 §4)');
  });

  it('a prerelease tag: exit 1 with the prerelease refusal', () => {
    const result = cli(['v0.3.1-rc.1', '--published', '["0.3.0"]']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('0.3.1-rc.1 is a prerelease: only X.Y.Z versions are promoted (spec-015 §4)');
  });

  it('unreadable published versions: exit 1 with the parse refusal', () => {
    const result = cli(['v0.3.1', '--published', 'nope']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('could not read the published versions: ');
  });

  it.each([
    ['no --published', ['v0.3.1']],
    ['--published without a value', ['v0.3.1', '--published']],
    ['no tag', []],
    ['an unknown option', ['v0.3.1', '--published', '["0.3.0"]', '--bogus']],
  ] as const)('usage error (%s): exit 2 with the usage line, nothing on stdout', (_label, args) => {
    const result = cli(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(USAGE);
  });
});
