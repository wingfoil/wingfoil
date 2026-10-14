/**
 * task-241 — the two bugs the task absorbed:
 *
 * - bug-344 (red-first): the bound `release-health.measure` and `release-health.compare` vectors pass `--any-node`
 *   (the toolchain metrics are measured off the pinned Node and record `node` / `node_pinned`, approver ruling D3)
 *   and `--max-workers 2` (`dl-170`'s interim rule); `bindings.yaml` (≥ 1.9) and `release-health.yaml` (≥ 1.1)
 *   record the change in their version history;
 * - bug-332 (red-first): `ajv`, which the release-health tests and `compare.cjs` import, is a declared
 *   devDependency at major 8, the lockfile's root entry agreeing; the installed copy is major 8.
 *
 * Version pins are "at least" (bug-314): a later writer of the same file bumps it again and keeps this entry.
 * Deterministic: reads committed files only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const ROOT = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf-8');

const BINDINGS = '.wingfoil/workflows/bindings.yaml';
const RELEASE_HEALTH = '.wingfoil/workflows/custom/release-health.yaml';

/** The binding of `token`, in whichever section (`checks`, `actions`) declares it. */
function binding(token: string): { run?: string[] } | undefined {
  const doc = yamlLoad(read(BINDINGS)) as Record<string, unknown>;
  for (const value of Object.values(doc)) {
    if (value !== null && typeof value === 'object' && token in (value as Record<string, unknown>)) return (value as Record<string, { run?: string[] }>)[token];
  }
  return undefined;
}

/** The `version:` line of `path`: its number and its history comment. */
function versionLine(path: string): { version: number; history: string } {
  const match = /^version: (\d+(?:\.\d+)?) +# (.*)$/m.exec(read(path));
  expect(match).not.toBeNull();
  return { version: Number(match![1]), history: match![2]! };
}

describe('bug-344 — the bound release-health vectors', () => {
  it.each(['measure', 'compare'])('release-health.%s runs its script with --any-node and --max-workers 2', (step) => {
    expect(binding(`release-health.${step}`)?.run).toEqual(['node', `scripts/release-health/${step}.cjs`, '--release', '{release}', '--any-node', '--max-workers', '2']);
  });

  it('bindings.yaml is at version 1.9 or later, its history naming task-241 and bug-344', () => {
    const { version, history } = versionLine(BINDINGS);
    expect(version).toBeGreaterThanOrEqual(1.9);
    expect(history).toMatch(/task-241/);
    expect(history).toMatch(/bug-344/);
  });

  it('release-health.yaml is at version 1.1 or later, its history naming task-241 and bug-344', () => {
    const { version, history } = versionLine(RELEASE_HEALTH);
    expect(version).toBeGreaterThanOrEqual(1.1);
    expect(history).toMatch(/task-241/);
    expect(history).toMatch(/bug-344/);
  });
});

describe('bug-332 — ajv is a declared devDependency', () => {
  const pkg = JSON.parse(read('package.json')) as { devDependencies?: Record<string, string> };
  const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { devDependencies?: Record<string, string> }> };

  it('package.json declares ajv at major 8, and the lockfile root entry says the same', () => {
    expect(pkg.devDependencies?.['ajv']).toMatch(/^\^8\./);
    expect(lock.packages['']?.devDependencies?.['ajv']).toBe(pkg.devDependencies?.['ajv']);
  });

  it('the installed ajv is major 8 (characterization: hoisted through @modelcontextprotocol/sdk today)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect((require('ajv/package.json') as { version: string }).version).toMatch(/^8\./);
  });
});
