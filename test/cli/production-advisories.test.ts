/**
 * task-250-clear-the-production-dependency-advisories-from-the-lockfile-and-raise-the-floors
 * (`bug-223`, REQ-SEC supply chain, `spec-015` §1) — the production dependency tree carries no known
 * high advisory, and a regression fails the build.
 *
 * `bug-223`: `npm audit --omit=dev` on `ccccc227` reported 3 high (`js-yaml`, a direct dependency;
 * `fast-uri`; `ip-address`) and 3 moderate (`hono`, `@hono/node-server`, `qs`) advisories, all but
 * `js-yaml` reached through `@modelcontextprotocol/sdk`, and `package.json`'s caret floors still admitted
 * the advised versions. Nothing in CI ran `npm audit`.
 *
 * The live check is `npm run check:audit` (`npm audit --omit=dev --audit-level=high`), run by
 * `.github/workflows/ci.yml` on every push — it needs the registry's advisory database, so it is a CI
 * step and a named npm script (the one `task-190`'s scheduled workflow calls too), not a Jest assertion:
 * a test that reached the network would make the suite's verdict depend on the day it ran.
 *
 * This suite is the offline half, deterministic and read from committed files only:
 *   1. the script exists with exactly that command, and `ci.yml` runs it;
 *   2. the direct floors in `package.json` exclude the advised versions `bug-223` measured;
 *   3. `package-lock.json` resolves each of the six advised packages above its advised range — the
 *      snapshot of `bug-223`, so the lock cannot silently slide back to it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');

interface Manifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
}

interface Lockfile {
  readonly packages: Readonly<Record<string, { readonly version?: string; readonly dev?: boolean }>>;
}

interface Workflow {
  readonly jobs: Readonly<Record<string, { readonly steps: readonly { readonly run?: string }[] }>>;
}

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as Manifest;
const lockfile = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8')) as Lockfile;

/** `X.Y.Z` as a numeric triple; throws on anything else, so a pre-release cannot compare silently. */
function parse(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) throw new Error(`not an X.Y.Z version: "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `a >= b`. */
function atLeast(a: string, b: string): boolean {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] as number) !== (y[i] as number)) return (x[i] as number) > (y[i] as number);
  }
  return true;
}

/** The floor of a caret range `^X.Y.Z` — the only form the direct dependencies use. */
function caretFloor(range: string): string {
  const match = /^\^(\d+\.\d+\.\d+)$/.exec(range);
  if (match === null || match[1] === undefined) throw new Error(`not a caret range: "${range}"`);
  return match[1];
}

/**
 * The first release outside each advised range `bug-223` recorded (`npm audit --omit=dev --json`,
 * `.vulnerabilities[].range`), in alphabetical order.
 */
const FIRST_FIXED: readonly (readonly [string, string])[] = [
  ['@hono/node-server', '1.19.15'], // advised: <1.19.15
  ['fast-uri', '3.1.8'], // advised: 3.0.0 - 3.1.7
  ['hono', '4.13.7'], // advised: <=4.13.6
  ['ip-address', '10.7.1'], // advised: <=10.7.0
  ['js-yaml', '4.3.2'], // advised: 4.0.0 - 4.3.1
  ['qs', '6.15.4'], // advised: 2.2.5 - 6.15.3
];

describe('production advisories (task-250, bug-223) — the live audit gate', () => {
  it('declares `check:audit` as `npm audit --omit=dev --audit-level=high`', () => {
    expect(manifest.scripts?.['check:audit']).toBe('npm audit --omit=dev --audit-level=high');
  });

  it('runs `npm run check:audit` in ci.yml’s packaging gate, after `npm ci`', () => {
    const ci = yamlLoad(readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')) as Workflow;
    const runs = (ci.jobs['packaging-gate']?.steps ?? []).flatMap((s) => (s.run === undefined ? [] : [s.run.trim()]));
    expect(runs).toContain('npm run check:audit');
    expect(runs.indexOf('npm run check:audit')).toBeGreaterThan(runs.indexOf('npm ci'));
  });
});

describe('production advisories (task-250, bug-223) — the floors package.json publishes', () => {
  it('floors js-yaml at the first fixed 4.x release, 4.3.2', () => {
    expect(atLeast(caretFloor(manifest.dependencies?.['js-yaml'] ?? ''), '4.3.2')).toBe(true);
  });

  it('floors @modelcontextprotocol/sdk at 1.32.0, the release a fresh install resolved to a clean tree', () => {
    expect(atLeast(caretFloor(manifest.dependencies?.['@modelcontextprotocol/sdk'] ?? ''), '1.32.0')).toBe(true);
  });
});

describe('production advisories (task-250, bug-223) — the committed lockfile', () => {
  it.each(FIRST_FIXED)('resolves %s at or above %s, outside its advised range', (name, fixed) => {
    const entry = lockfile.packages[`node_modules/${name}`];
    expect(entry?.version).toBeDefined();
    expect(entry?.dev).not.toBe(true);
    expect({ name, version: entry?.version, fixed: atLeast(entry?.version ?? '0.0.0', fixed) }).toEqual({
      name,
      version: entry?.version,
      fixed: true,
    });
  });
});
