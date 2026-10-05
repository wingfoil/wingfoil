/**
 * task-007-npm-distribution (REQ-SYS-09) — packaging acceptance tests.
 *
 * The AC (SARD fit criterion, `docs/02_requirements/03_sard/01_architecture.md`) is: `npm install -g
 * wingfoil` resolves the `wingfoil` binary on `PATH`, `wingfoil --help` exits `0`, and the published
 * package includes `README.md` + command docs (not just compiled JS). A real global install isn't
 * practical to exercise in CI, so — mirroring `test/cli/program.integration.test.ts`'s
 * compile-then-spawn pattern — this file:
 *
 * 1. Spawns the compiled `bin` entrypoint (`dist/cli.js`, mapped from `package.json`'s `"bin"` field)
 *    directly with `node`, asserting the real process exit code / stdout, exactly as npm's bin-shim
 *    would invoke it.
 * 2. Runs `npm pack --dry-run --json` — the same file-selection logic `npm publish` uses — and
 *    asserts the resulting tarball file list includes the compiled `dist/` output and `README.md`,
 *    and excludes the dogfooding `.wingfoil/` config and `docs/04_memory/` Memory (spec-011: project-local, not part of
 *    the shipped artifact) and the `test/` tree (source-only, not runtime).
 *
 * `dist/` is built once by jest's `globalSetup` (`test/global-setup.cjs`) before any worker starts.
 * This file used to `rmSync`+rebuild `dist/` in its own `beforeAll` — as did
 * `program.integration.test.ts` — but two suites clean-rebuilding the SAME `dist/` raced across
 * parallel jest workers (bug-003-cli-integration-dist-race); the shared, pre-worker build removes the
 * race and the redundant second build.
 *
 * **Why `npm pack` carries `--ignore-scripts`** (`bug-022`, `dl-056` clause B; the same reason as
 * `publish-metadata.test.ts` and `license-file.test.ts`): `package.json`'s `"prepack": "npm run
 * build"` would otherwise re-run `tsc -p tsconfig.build.json` from inside this test and rewrite the
 * very `dist/` the pre-worker build produced — in place, truncating each file, while sibling workers
 * spawn `node dist/cli.js` from it. Measured during one such pack: `dist/core/index.js` (final 70428
 * bytes) observable at 0 bytes, `dist/validation/secret-scan.js` (final 18152) at 8192; with the flag,
 * none. This is `bug-003` in a different disguise — a rebuild rather than a delete — and since
 * `task-060` put `npm test` inside `prepublishOnly`, which `.github/workflows/publish.yml`'s `gate`
 * job runs, it sits inside the release gate. The flag changes nothing this file asserts: the packed
 * path list is identical with and without it (311 paths, verified), because `globalSetup` has already
 * built `dist/`. `test/lint/pack-ignore-scripts.test.ts` holds that property for the whole suite.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { distBuildStamp } from './helpers/dist-stamp';
import { CLI_ENTRY, runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');

interface PackedFile {
  readonly path: string;
}

interface PackResult {
  readonly files: readonly PackedFile[];
}

/** Spawn the compiled bin entrypoint from `cwd` and capture its real exit code/stdout/stderr. */
function runBinIn(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

/** Spawn the compiled bin entrypoint from the repo root (a valid git root) — the common case. */
function runBin(...args: readonly string[]): SpawnedRun {
  return runBinIn(REPO_ROOT, ...args);
}

describe('npm distribution (task-007) — bin entrypoint + package contents', () => {
  // `dist/` is built once by jest's globalSetup (test/global-setup.cjs) before any worker starts — no
  // per-suite build here anymore (bug-003-cli-integration-dist-race); the first case asserts it exists.
  it('compiles a `dist/cli.js` bin entrypoint', () => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
  });

  it('`node dist/cli.js --help` exits 0 and prints usage', () => {
    const result = runBin('--help');
    expect(result.status).toBe(0);
    expect(result.stdout.toLowerCase()).toContain('wingfoil');
    expect(result.stderr).toBe('');
  });

  it('running a real command outside a git root emits a single `error:` line (no stack, no absolute paths) and exits 1 (bug-002)', () => {
    const outsideGitRoot = mkdtempSync(join(tmpdir(), 'wingfoil-no-git-'));
    try {
      const result = runBinIn(outsideGitRoot, 'dna', 'show');
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      // A single, clean diagnostic line — spec-005 §1/§3 — never a stack dump.
      expect(result.stderr.startsWith('error: ')).toBe(true);
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).not.toContain('    at '); // no stack frame
      expect(result.stderr).not.toContain('StorageError:'); // not the raw dumped error
      expect(result.stderr).not.toContain(REPO_ROOT); // no leaked absolute internal path
    } finally {
      rmSync(outsideGitRoot, { recursive: true, force: true });
    }
  });

  it('`node dist/cli.js --version` prints `<semver> (<sha>)` and exits 0 (bug-001, task-192)', () => {
    const result = runBin('--version');
    expect(result.status).toBe(0);
    // `<semver> (<sha>)`, the sha from the build record dist/ was built with (task-192, dl-111 Action 3).
    expect(result.stdout.trim()).toBe(distBuildStamp());
    expect(result.stderr).toBe('');
  });

  it('`npm pack --dry-run --json` includes the compiled dist/ bin + README.md, and excludes .wingfoil + docs/04_memory + test/', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    const [result] = JSON.parse(raw) as PackResult[];
    const paths = (result?.files ?? []).map((f) => f.path);

    expect(paths).toContain('dist/cli.js');
    expect(paths).toContain('README.md');

    expect(paths.some((p) => p.startsWith('.wingfoil'))).toBe(false);
    expect(paths.some((p) => p.startsWith('docs/04_memory'))).toBe(false);
    expect(paths.some((p) => p.startsWith('test/'))).toBe(false);
  });

  // task-192 AC6 (characterization): `build` writes the record into `dist/`, which `files` already
  // ships, so the `--ignore-scripts` pack `publish.yml` runs carries it — no `prepack` step is needed.
  it('`npm pack --dry-run --ignore-scripts` includes dist/build-info.json, the build record (dl-111 Q2 (a))', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO_ROOT, encoding: 'utf-8' });
    const [result] = JSON.parse(raw) as PackResult[];
    expect((result?.files ?? []).map((f) => f.path)).toContain('dist/build-info.json');
  });
});
