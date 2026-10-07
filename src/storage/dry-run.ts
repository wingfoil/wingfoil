/**
 * The dry-run context of the commit primitive (task-210, `dl-106` W2, `spec-008-cli-grammar` §2).
 *
 * A dry run executes an operation exactly as the real run would — every read, every guard, every
 * refusal — up to the moment it would write: there, {@link writeAndCommit} (`./commit`) records the
 * commit it would make as a {@link DryRunPlan} and stops the operation, so nothing reaches the working
 * tree, the index or a ref. The mode travels in an `AsyncLocalStorage` rather than in each operation's
 * params, which is what makes it **inherited**: an operation never sees the flag, so a mutating
 * operation added later is dry-runnable by construction as long as it writes through `writeAndCommit`.
 * One that writes any other way is caught loudly: the raw primitives ({@link refuseDuringDryRun}) throw
 * while a dry run is active instead of writing.
 *
 * A dry run stops at the operation's **first** commit. Every registered operation makes one, except
 * `memory approve` when the `supersedes:` trigger fires a second, `finalize` commit (task-162), whose
 * message names the first commit's sha: that second commit is not planned.
 *
 * The success warnings an operation has collected before its commit point reach the dry run's result
 * (task-210 review, F4): the operation hands them to `writeAndCommit` (`CommitOptions.warnings`), which
 * records them beside the plan.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { E_GIT_READ_FAILED, StorageError } from './errors';

/**
 * The commit a dry run would have made. `subject` and `message` are what the commit would record
 * (`message` with the `WingFoil-Version:` trailer paragraph the primitive appends, task-192); `paths` are
 * root-relative POSIX paths, sorted; `diff` is the unified diff of those paths from `HEAD` to the blobs
 * the commit would record ({@link planDiff}).
 */
export interface DryRunPlan {
  readonly dryRun: true;
  readonly subject: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly diff: string;
}

/** The per-run store: the plan, once the primitive has recorded it, and the warnings handed with it. */
interface DryRunStore {
  plan?: DryRunPlan;
  warnings?: readonly string[];
}

const context = new AsyncLocalStorage<DryRunStore>();

/** Thrown by {@link stopWithPlan} to end the operation where it would have committed. */
class DryRunStop extends Error {
  constructor() {
    super('dry run: stopped where the operation would have committed');
    this.name = 'DryRunStop';
    Object.setPrototypeOf(this, DryRunStop.prototype);
  }
}

/** Whether the calling code runs inside {@link captureDryRun}. */
export function isDryRunActive(): boolean {
  return context.getStore() !== undefined;
}

/**
 * Record `plan`, and the success `warnings` the operation collected before its commit point, as the dry
 * run's outcome, and end the operation by throwing. Only the first plan is kept. The throw is a control
 * transfer, not a failure: {@link captureDryRun} reads the store whatever the operation did with the
 * error — rethrew it, or folded it into a failed result.
 */
export function stopWithPlan(plan: DryRunPlan, warnings: readonly string[] = []): never {
  const store = context.getStore();
  if (store === undefined) throw new Error('stopWithPlan called outside a dry run');
  if (store.plan === undefined) {
    store.plan = plan;
    store.warnings = warnings;
  }
  throw new DryRunStop();
}

/**
 * Throw when a raw write primitive (`writeDocument`, `removeDocument`, `commitPaths`) is called during a
 * dry run. Every mutating operation writes through `writeAndCommit`, which plans instead of writing; a
 * call that reaches a raw primitive is a writer that bypassed it, and must fail rather than write.
 */
export function refuseDuringDryRun(primitive: string): void {
  if (isDryRunActive()) {
    throw new Error(`dry run: ${primitive} was called directly; a mutating operation must write through writeAndCommit`);
  }
}

/** What {@link captureDryRun} observed: the plan and its warnings, or else what `run` returned or threw. */
export type DryRunOutcome<T> =
  | { readonly kind: 'planned'; readonly plan: DryRunPlan; readonly warnings: readonly string[] }
  | { readonly kind: 'returned'; readonly value: T }
  | { readonly kind: 'threw'; readonly error: unknown };

/** Run `run` as a dry run and report how it ended. A recorded plan wins over whatever `run` did after it. */
export async function captureDryRun<T>(run: () => Promise<T>): Promise<DryRunOutcome<T>> {
  const store: DryRunStore = {};
  let outcome: DryRunOutcome<T>;
  try {
    outcome = { kind: 'returned', value: await context.run(store, run) };
  } catch (error) {
    outcome = { kind: 'threw', error };
  }
  return store.plan !== undefined ? { kind: 'planned', plan: store.plan, warnings: store.warnings ?? [] } : outcome;
}

/**
 * The `-c` pins of the diff step: every configuration key that changes which hunks git prints, set to
 * git's default, over whatever the repository's own `.git/config` says (`-c` wins over every file).
 */
const DIFF_CONFIG_PINS = [
  'diff.context=3',
  'diff.interHunkContext=0',
  'diff.indentHeuristic=true',
  'diff.suppressBlankEmpty=false',
  'diff.algorithm=myers',
] as const;

/** One git run for {@link planDiff}; a spawn failure or an exit outside `accepted` is `E_GIT_READ_FAILED`. */
function planGit(
  root: string,
  path: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  accepted: readonly number[],
  input?: string,
): { status: number; stdout: string } {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env, input, stdio: ['pipe', 'pipe', 'pipe'] });
  if (run.error !== undefined || !accepted.includes(run.status as number)) {
    const detail = run.error !== undefined ? run.error.message : run.stderr.trim();
    throw new StorageError(E_GIT_READ_FAILED, `git for the dry run of ${path} failed: ${detail}`);
  }
  return { status: run.status as number, stdout: run.stdout };
}

/**
 * The unified diff the commit of `content` at `path` would carry, from `HEAD` (`content` `null` = the
 * path is deleted): `--- a/<path>` / `+++ b/<path>` headers (`/dev/null` for an absent side), then the
 * hunks. Empty when the commit would record the blob `HEAD` already holds.
 *
 * **The blobs are the commit's.** The new side is hashed by `git hash-object --path=<path>` in the
 * repository, under the caller's environment, so the clean conversion the commit applies — `core.autocrlf`
 * from any configuration level, `.gitattributes` `eol`/`text`/`filter` — is applied here too: a CRLF
 * document that normalizes to a one-line change shows that one line, as `git show` does. The object is
 * written to a temporary object directory outside the repository (`GIT_OBJECT_DIRECTORY`, with the
 * repository's own objects as an alternate), so the repository gains no object.
 *
 * **The hunks are git's defaults.** The blob-to-blob diff runs with no system or global configuration
 * (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`), every hunk-shaping key pinned ({@link DIFF_CONFIG_PINS})
 * over the repository's `.git/config`, and colour, external diff drivers and textconv off: they are what
 * `git show` prints for the real commit under git's default diff settings, on any machine (REQ-SYS-07).
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when git cannot produce the diff.
 */
export function planDiff(root: string, path: string, content: string | null, env: NodeJS.ProcessEnv = process.env): string {
  const scratch = mkdtempSync(join(tmpdir(), 'wingfoil-dry-run-'));
  try {
    const objects = join(scratch, 'objects');
    mkdirSync(objects);
    const repositoryObjects = resolve(root, planGit(root, path, ['rev-parse', '--git-path', 'objects'], env, [0]).stdout.trim());
    const planned = { ...env, GIT_OBJECT_DIRECTORY: objects, GIT_ALTERNATE_OBJECT_DIRECTORIES: repositoryObjects };
    // `--verify --quiet` exits 1 for a path `HEAD` does not hold, 128 when there is no `HEAD` at all.
    const head = planGit(root, path, ['rev-parse', '--verify', '--quiet', `HEAD:${path}`], env, [0, 1, 128]);
    const before = head.status === 0 ? head.stdout.trim() : null;
    const after = content === null ? null : planGit(root, path, ['hash-object', '-w', `--path=${path}`, '--stdin'], planned, [0], content).stdout.trim();
    if (before === after) return '';
    const empty = planGit(root, path, ['hash-object', '-w', '--stdin'], planned, [0], '').stdout.trim();
    const pinned = { ...planned, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull };
    const diff = planGit(
      root,
      path,
      [...DIFF_CONFIG_PINS.flatMap((pin) => ['-c', pin]), 'diff', '--no-color', '--no-ext-diff', '--no-textconv', before ?? empty, after ?? empty],
      pinned,
      [0],
    ).stdout;
    const lines = diff.split('\n');
    const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
    const hunks = firstHunk === -1 ? [] : lines.slice(firstHunk);
    return [before === null ? '--- /dev/null' : `--- a/${path}`, after === null ? '+++ /dev/null' : `+++ b/${path}`, ...hunks].join('\n').replace(/\n*$/, '\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
