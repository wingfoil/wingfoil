/**
 * bug-238 (fixed by task-190) — the dev-only dependency tree carries none of the advisories `bug-238`
 * measured, and a scheduled check reports new ones.
 *
 * `bug-238`: `npm audit` over the whole tree on `0b297169` reported 3 high (`brace-expansion`,
 * `browserslist`, the nested `js-yaml@3`) and 2 moderate (`baseline-browser-mapping`, `markdown-it`)
 * advisories, all in packages only the test and documentation toolchain pulls in. task-190 cleared them
 * with `npm audit fix` — a lockfile-only refresh of transitive entries, no `package.json` change — and
 * declared the whole-tree audit as `npm run check:audit:all`, which `.github/workflows/dependency-check.yml`
 * runs on its schedule. It is not a step of `ci.yml`: a push is gated on the production tree
 * (`check:audit`), the dev tree is reported on the schedule (`bug-238` Notes: "a report, not a gate").
 *
 * The live audit needs the registry's advisory database, so it is a workflow step; this suite is the
 * offline half, read from committed files only: the script, its scheduled run, and a snapshot of the
 * lockfile so it cannot slide back into an advised range.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');

interface Manifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

interface Lockfile {
  readonly packages: Readonly<Record<string, { readonly version?: string; readonly dev?: boolean }>>;
}

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as Manifest;
const lockfile = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8')) as Lockfile;

/** `X.Y.Z` as a numeric triple; throws on anything else, so a pre-release cannot compare silently. */
function parse(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) throw new Error(`not an X.Y.Z version: "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative, zero or positive as `a` is below, equal to or above `b`. */
function compare(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    const d = (x[i] as number) - (y[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/** An advised range: `from` inclusive (absent = from 0.0.0) up to `below`, exclusive. */
interface Advised {
  readonly from?: string;
  readonly below: string;
}

/**
 * The advised ranges `bug-238` recorded (`npm audit --json`, `.vulnerabilities[].range`), each written
 * as `[from, below)` where `below` is the first fixed release.
 */
const ADVISED: Readonly<Record<string, readonly Advised[]>> = {
  'baseline-browser-mapping': [{ from: '2.0.0', below: '2.11.0' }], // >=2.0.0 <2.11.0
  'brace-expansion': [
    { below: '1.1.21' }, // <=1.1.20
    { from: '2.0.0', below: '2.1.7' }, // 2.0.0 - 2.1.6
    { from: '4.0.0', below: '5.0.12' }, // 4.0.0 - 5.0.11
  ],
  browserslist: [{ below: '4.28.7' }], // <=4.28.6
  'js-yaml': [{ from: '3.0.0', below: '3.15.2' }], // 3.0.0 - 3.15.1
  'markdown-it': [{ below: '14.3.1' }], // <14.3.1
};

/** Every lock entry (hoisted or nested) of a package name, as `[install path, version]`, sorted. */
function entriesOf(name: string): (readonly [string, string])[] {
  return Object.entries(lockfile.packages)
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([path, entry]) => [path, entry.version ?? ''] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

describe('dev advisories (task-190, bug-238) — the whole-tree audit', () => {
  it('declares `check:audit:all` as `npm audit --audit-level=high` (dev dependencies included)', () => {
    expect(manifest.scripts?.['check:audit:all']).toBe('npm audit --audit-level=high');
  });

  it('runs it on the schedule (dependency-check.yml), not on every push (ci.yml)', () => {
    const runsOf = (file: string): string[] => {
      const wf = yamlLoad(readFileSync(join(REPO_ROOT, '.github', 'workflows', file), 'utf8')) as {
        readonly jobs: Readonly<Record<string, { readonly steps: readonly { readonly run?: string }[] }>>;
      };
      return Object.values(wf.jobs).flatMap((job) => job.steps.map((s) => s.run?.trim() ?? ''));
    };
    expect(runsOf('dependency-check.yml')).toContain('npm run check:audit:all');
    expect(runsOf('ci.yml')).not.toContain('npm run check:audit:all');
  });
});

describe('dev advisories (task-190, bug-238) — the committed lockfile', () => {
  it.each(Object.keys(ADVISED).sort())('resolves every %s entry outside the advised ranges', (name) => {
    const entries = entriesOf(name);
    expect(entries.length).toBeGreaterThan(0);
    const advised = (version: string): boolean =>
      (ADVISED[name] ?? []).some((r) => compare(version, r.from ?? '0.0.0') >= 0 && compare(version, r.below) < 0);
    const inRange = entries.filter(([, version]) => advised(version));
    expect({ name, inRange }).toEqual({ name, inRange: [] });
  });
});
