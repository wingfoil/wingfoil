/**
 * Test-hygiene gate — every spawn of this repository's `dist/cli.js` under `test/` goes through the
 * shared helper `test/cli/helpers/spawn-cli.ts` (`task-316`, `bug-207`, the residual of `bug-197`;
 * `dl-121` T1).
 *
 * The helper (`spawnCapture`, `runCliEntry`) captures both streams on every path and throws on a
 * signal, so a killed child cannot read back as an exit code. Suites that spawn the CLI with a local
 * `spawnSync` re-grow the shapes the helper exists to remove: `bug-197` counted four such suites in
 * v0.3, and fifteen had appeared by v0.3.2.
 *
 * What it checks, exactly: in every `*.ts` file under `test/` (this file and the helper itself
 * excluded), a call `<helper>(<node>, [<entry>` where `<helper>` is `spawnSync`, `execFileSync`,
 * `execFile` or `spawn`, `<node>` is `process.execPath` or `'node'`, and `<entry>` is `CLI_ENTRY` or a
 * `const` of the same file assigned `join(…'dist', 'cli.js')`. Each such call is an offender, with
 * its `file:line`, except the one declared exception below.
 *
 * Declared exceptions:
 * (i) a spawn of anything other than this repository's `dist/cli.js` — a `scripts/*.cjs`, `bash`,
 *     `npm`, `git`, `tar`, `node -e`, the fake agent, the pinned build
 *     `node_modules/wingfoil-released/dist/cli.js` — is outside the pattern by construction;
 * (ii) a live child: the async `spawn` of `cli/agent-execute-launch.integration.test.ts`, which
 *     signals the running command (`spawnCapture` is synchronous) — the one allowed match;
 * (iii) the CLI inside a shell pipeline (`cli/piped-output-drain.integration.test.ts`, `bash -c …`
 *     with `CLI_ENTRY` as `$0`) — outside the pattern, the first argument being `bash`;
 * (iv) JavaScript fixtures, which cannot import a `.ts` helper (`fixtures/smoke/wingfoil-proxy.cjs`,
 *     `cli/fixtures/cli-harness.cjs`) — outside the walk, which reads `*.ts` only.
 *
 * Not detected — it reads the call text only, so a spawn of the CLI in any other shape passes it:
 * - the entry passed through a variable: `const argv = [CLI_ENTRY]; spawnSync(process.execPath, argv)`;
 * - a node flag before the entry: `spawnSync(process.execPath, ['--no-warnings', CLI_ENTRY])`;
 * - the entry built as one path string: a `const` assigned `join(REPO_ROOT, 'dist/cli.js')`, which is
 *   not the `join(…'dist', 'cli.js')` shape the local-constant pattern reads.
 * Such a spawn is kept out by review, not by this gate.
 *
 * Textual: a matching call in a comment or a string is flagged too. Deterministic: a sorted walk over
 * a fixed source tree and a pure regex scan — no clock, no subprocess.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TEST_ROOT = join(__dirname, '..');

/** The shared helper, the one file allowed to spawn the CLI directly. */
const HELPER_FILE = 'cli/helpers/spawn-cli.ts';

/** A same-file constant naming the compiled entry point: `const CLI = join(…, 'dist', 'cli.js')`. */
const LOCAL_ENTRY = /\bconst\s+(\w+)\s*=\s*join\([^)]*'dist',\s*'cli\.js'\)/g;

/** One call that spawns the compiled CLI. */
interface CliSpawnSite {
  readonly file: string;
  readonly line: number;
  readonly helper: string;
}

/** Declared exception (ii): the live child of `agent-execute-launch`, spawned asynchronously. */
function isAllowed(site: CliSpawnSite): boolean {
  return site.file === 'cli/agent-execute-launch.integration.test.ts' && site.helper === 'spawn';
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

/** Every call in `source` that spawns the compiled CLI with node, with its 1-based line. */
function cliSpawnSites(file: string, source: string): readonly CliSpawnSite[] {
  const entries = ['CLI_ENTRY', ...[...source.matchAll(LOCAL_ENTRY)].map((m) => m[1] ?? '')].filter((n) => n !== '');
  const call = new RegExp(
    String.raw`\b(spawnSync|execFileSync|execFile|spawn)\(\s*(?:process\.execPath|'node')\s*,\s*\[\s*(?:${entries.join('|')})\b`,
    'g',
  );
  return [...source.matchAll(call)].map((m) => ({
    file,
    line: source.slice(0, m.index).split('\n').length,
    helper: m[1] ?? '',
  }));
}

/** The scan of the whole tree, this file and the helper excluded. */
function treeSites(): readonly CliSpawnSite[] {
  const self = relative(TEST_ROOT, __filename).split(sep).join('/');
  return testSources(TEST_ROOT)
    .map((file) => relative(TEST_ROOT, file).split(sep).join('/'))
    .filter((file) => file !== self && file !== HELPER_FILE)
    .flatMap((file) => cliSpawnSites(file, readFileSync(join(TEST_ROOT, file), 'utf-8')));
}

describe('every spawn of dist/cli.js under test/ goes through the shared helper (task-316, bug-207)', () => {
  it('every spawn of dist/cli.js under test/ goes through test/cli/helpers/spawn-cli.ts', () => {
    const offenders = treeSites()
      .filter((site) => !isAllowed(site))
      .map((site) => `${site.file}:${site.line} ${site.helper}`);

    expect(offenders).toEqual([]);
  });

  it('is not vacuous: it finds the one allowed live-child spawn, and walks a suite that spawns through the helper', () => {
    const allowed = treeSites()
      .filter(isAllowed)
      .map((site) => `${site.file} ${site.helper}`);
    const walked = testSources(TEST_ROOT).map((file) => relative(TEST_ROOT, file).split(sep).join('/'));

    expect(allowed).toEqual(['cli/agent-execute-launch.integration.test.ts spawn']);
    expect(walked).toContain('cli/workflow-rekey.integration.test.ts');
  });

  it('can fail: flags a local spawn of a same-file dist/cli.js constant', () => {
    const source = [
      "const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');",
      'const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8" });',
    ].join('\n');

    expect(cliSpawnSites('x.ts', source)).toEqual([{ file: 'x.ts', line: 2, helper: 'spawnSync' }]);
  });

  it("can fail: flags a local spawn of CLI_ENTRY with 'node'", () => {
    expect(cliSpawnSites('x.ts', "spawnSync('node', [CLI_ENTRY, 'x'])")).toEqual([
      { file: 'x.ts', line: 1, helper: 'spawnSync' },
    ]);
  });

  it('does not flag the helper itself, a shell running the CLI, or a script spawn', () => {
    expect(cliSpawnSites('x.ts', "spawnCapture('node', [CLI_ENTRY])")).toEqual([]);
    expect(cliSpawnSites('x.ts', "spawnSync('bash', ['-c', s, CLI_ENTRY])")).toEqual([]);
    expect(cliSpawnSites('x.ts', 'spawnSync(process.execPath, [SCRIPT])')).toEqual([]);
  });
});
