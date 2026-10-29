/**
 * Test-hygiene gate — every `npm` a test spawns is handed an environment stripped of the caller's
 * `npm_config_*` (`task-316`, `bug-209`, after `bug-181`; `dl-121` T1).
 *
 * npm reads every environment variable named `npm_config_<key>`, in either letter case, as
 * configuration, and `npm run …` exports its own configuration that way: a suite started by
 * `npm run -s test` carries `npm_config_loglevel=silent`, and an npm spawned with the inherited
 * environment answers differently from one spawned by `npx jest` (`bug-181`).
 * `test/cli/helpers/npm-env.ts`'s `withoutCallerNpmConfig` strips them.
 *
 * What it checks, exactly: in every `*.ts` file under `test/` (this file excluded), each call
 * `<helper>('npm', …)` — `<helper>` one of `execFileSync`, `spawnSync`, `execFile`, `spawn`,
 * `execSync`, the first argument the literal `'npm'`, a multi-line call included — is read up to its
 * balanced closing parenthesis (parentheses are counted, strings are not parsed). The call passes
 * when that text contains `withoutCallerNpmConfig(`, or when it passes `env: <fn>()` and a function
 * `<fn>` declared in the same file has a body (up to its balanced closing brace) that contains
 * `withoutCallerNpmConfig(`. Every other call is an offender, with its `file:line`.
 *
 * Not detected: the check is that the call text CONTAINS `withoutCallerNpmConfig(` anywhere, not that
 * the `env` the child receives is its result. A call whose text names it without using it passes — a
 * contrived `env: withoutCallerNpmConfig(process.env) ? process.env : process.env`, or the name in a
 * comment inside the call — and is kept out by review, not by this gate.
 *
 * Outside the scan: npm run through a shell string (`bash -c "npm publish …"`), which has no
 * reliable textual shape — such a call must pass the stripped environment by review.
 *
 * Deterministic: a sorted walk over a fixed source tree and a pure text scan — no clock, no subprocess.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TEST_ROOT = join(__dirname, '..');

/** The opening of a direct `npm` spawn: `<helper>('npm'`, across a line break too. */
const NPM_CALL = /\b(?:execFileSync|spawnSync|execFile|spawn|execSync)\(\s*'npm'/g;

/** The stripping call a passing site makes, directly or through a same-file function. */
const STRIP = 'withoutCallerNpmConfig(';

/** One direct `npm` spawn and whether it strips the caller's npm configuration. */
interface NpmSpawnSite {
  readonly file: string;
  readonly line: number;
  readonly strips: boolean;
}

/** Every `*.ts` file under `dir`, in a stable (sorted, depth-first) order. */
function testSources(dir: string): readonly string[] {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...testSources(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

/** `source` from `start` (an opening `open`) up to and including its balanced `close`. */
function balanced(source: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Whether `source` declares a function `name` whose body calls the stripping helper. */
function declaresStrippingFunction(source: string, name: string): boolean {
  const declaration = new RegExp(String.raw`\bfunction\s+${name}\s*\(|\bconst\s+${name}\s*=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]*)?=>`, 'g');
  return [...source.matchAll(declaration)].some((m) => {
    const brace = source.indexOf('{', (m.index ?? 0) + m[0].length);
    return brace !== -1 && balanced(source, brace, '{', '}').includes(STRIP);
  });
}

/** Every direct `npm` spawn in `source`, with its 1-based line and whether it strips. */
function npmSpawnSites(file: string, source: string): readonly NpmSpawnSite[] {
  return [...source.matchAll(NPM_CALL)].map((m) => {
    const index = m.index ?? 0;
    const call = balanced(source, source.indexOf('(', index), '(', ')');
    const viaFunction = [...call.matchAll(/\benv:\s*(\w+)\(\)/g)].some((e) => declaresStrippingFunction(source, e[1] ?? ''));
    return { file, line: source.slice(0, index).split('\n').length, strips: call.includes(STRIP) || viaFunction };
  });
}

/** The scan of the whole tree, this file excluded. */
function treeSites(): readonly NpmSpawnSite[] {
  const self = relative(TEST_ROOT, __filename).split(sep).join('/');
  return testSources(TEST_ROOT)
    .map((file) => relative(TEST_ROOT, file).split(sep).join('/'))
    .filter((file) => file !== self)
    .flatMap((file) => npmSpawnSites(file, readFileSync(join(TEST_ROOT, file), 'utf-8')));
}

describe("every npm a test spawns runs without the caller's npm_config_* (task-316, bug-209)", () => {
  it("every direct npm spawn under test/ passes an environment stripped by withoutCallerNpmConfig", () => {
    const offenders = treeSites()
      .filter((site) => !site.strips)
      .map((site) => `${site.file}:${site.line}`);

    expect(offenders).toEqual([]);
  });

  it('is not vacuous: it finds at least ten npm spawns, the two already-stripping suites among the passing ones', () => {
    const sites = treeSites();
    const passing = sites.filter((site) => site.strips).map((site) => site.file);

    expect(sites.length).toBeGreaterThanOrEqual(10);
    expect(passing).toEqual(expect.arrayContaining(['cli/publish-pipeline.test.ts', 'cli/publish-secrets.test.ts']));
  });

  it('can fail: flags a call without env, and a call whose env keeps the caller configuration', () => {
    expect(npmSpawnSites('x.ts', "execFileSync('npm', ['view', 'wingfoil'], { cwd })")).toEqual([{ file: 'x.ts', line: 1, strips: false }]);
    expect(npmSpawnSites('x.ts', "spawnSync('npm', ['view', 'wingfoil'], { env: { ...process.env } })")).toEqual([
      { file: 'x.ts', line: 1, strips: false },
    ]);
  });

  it('passes a call that strips inline, across lines', () => {
    const source = ['spawnSync(', "  'npm',", "  ['view', 'wingfoil'],", '  { env: withoutCallerNpmConfig(process.env) },', ');'].join('\n');

    expect(npmSpawnSites('x.ts', source)).toEqual([{ file: 'x.ts', line: 1, strips: true }]);
  });

  it('follows env: <fn>() to a same-file function, passing only when that function strips', () => {
    const call = "spawnSync('npm', ['view', 'wingfoil'], { env: npmEnv() });";
    const stripping = 'function npmEnv() { return { ...withoutCallerNpmConfig(process.env) }; }';
    const keeping = 'function npmEnv() { return { ...process.env }; }';

    expect(npmSpawnSites('x.ts', `${stripping}\n${call}`)).toEqual([{ file: 'x.ts', line: 2, strips: true }]);
    expect(npmSpawnSites('x.ts', `${keeping}\n${call}`)).toEqual([{ file: 'x.ts', line: 2, strips: false }]);
  });
});
