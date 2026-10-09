/**
 * The one way the CLI suites spawn a child process and read back what it did
 * (`task-145-replace-cli-test-helpers-fabricated-stderr-child-real`, `bug-070`, `dl-121` T1).
 *
 * `spawnSync` captures both streams on every path. The `execFileSync` + `catch` shape eight suites
 * used to copy does not: `execFileSync` returns stdout only, and surfaces stderr only on the thrown
 * error of a non-zero exit, so those helpers returned a literal `stderr: ''` on success and every
 * "a passing command printed nothing to stderr" assertion compared that constant against itself. A
 * command that exits `0` while printing a git `fatal:` — `bug-071`'s shape — passed them.
 * `test/lint/no-fabricated-stderr.test.ts` keeps the literal from coming back.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003-cli-integration-dist-race`) — never here.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** The compiled `dist/` directory the suites spawn. */
export const DIST_DIR = join(REPO_ROOT, 'dist');

/** The published bin entry point, `dist/cli.js` — what `wingfoil` runs. */
export const CLI_ENTRY = join(DIST_DIR, 'cli.js');

/** The out-of-process harness that drives the compiled wiring against a given project root. */
export const CLI_HARNESS = join(REPO_ROOT, 'test', 'cli', 'fixtures', 'cli-harness.cjs');

/** The static project root (a `.wingfoil/` config) most harness-driven suites run against. */
export const CLI_FIXTURE_ROOT = join(REPO_ROOT, 'test', 'cli', 'fixtures', 'wingfoil-root');

/** What a spawned child did: its exit status and everything it wrote to each stream. */
export interface SpawnedRun {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Where to run the child. */
export interface SpawnCaptureOptions {
  readonly cwd?: string;
  /**
   * The child's environment. Absent, the child gets node's own `process.env` — which is NOT the one a
   * test sees: jest gives each test file a copy, so an assignment to `process.env` in a test does not
   * reach a child spawned without `env` (task-268). Pass `process.env` to hand the test's copy on.
   */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Run `command args…` to completion and report its exit status and both streams, exactly as the
 * child wrote them — on a zero exit as on a non-zero one.
 *
 * A child that could not be spawned, or that ended on a signal rather than an exit, has no status to
 * report: both throw, so neither can read back as an ordinary exit code.
 */
export function spawnCapture(command: string, args: readonly string[], options: SpawnCaptureOptions = {}): SpawnedRun {
  const run = spawnSync(command, [...args], { cwd: options.cwd, encoding: 'utf-8', env: options.env });
  if (run.error) throw run.error;
  if (run.status === null) throw new Error(`${command} ended on signal ${run.signal ?? 'unknown'}, not an exit`);
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** Run the compiled CLI wiring through {@link CLI_HARNESS}, with `root` as the CLI's project root. */
export function runCliHarness(root: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_HARNESS, DIST_DIR, root, ...args]);
}

/** Run the published entry point {@link CLI_ENTRY} from `cwd`, the way a user's shell does. */
export function runCliEntry(cwd: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd });
}
