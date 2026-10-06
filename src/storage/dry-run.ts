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
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E_GIT_READ_FAILED, StorageError } from './errors';

/**
 * The commit a dry run would have made. `subject` and `message` are what the commit would record
 * (`message` with the `WingFoil-Version:` trailer paragraph the primitive appends, task-192); `paths` are
 * root-relative POSIX paths, sorted; `diff` is the unified diff of those paths from `HEAD` to the content
 * the commit would carry — the hunks `git show` prints for the real commit.
 */
export interface DryRunPlan {
  readonly dryRun: true;
  readonly subject: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly diff: string;
}

/** The per-run store: the plan, once the primitive has recorded it. */
interface DryRunStore {
  plan?: DryRunPlan;
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
 * Record `plan` as the dry run's outcome and end the operation by throwing. Only the first plan is kept.
 * The throw is a control transfer, not a failure: {@link captureDryRun} reads the store whatever the
 * operation did with the error — rethrew it, or folded it into a failed result.
 */
export function stopWithPlan(plan: DryRunPlan): never {
  const store = context.getStore();
  if (store === undefined) throw new Error('stopWithPlan called outside a dry run');
  store.plan ??= plan;
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

/** What {@link captureDryRun} observed: the plan, or else what `run` returned or threw. */
export type DryRunOutcome<T> =
  | { readonly kind: 'planned'; readonly plan: DryRunPlan }
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
  return store.plan !== undefined ? { kind: 'planned', plan: store.plan } : outcome;
}

/**
 * The unified diff of `path` from `before` to `after` (`null` = absent on that side): `--- a/<path>` /
 * `+++ b/<path>` headers (`/dev/null` for an absent side), then the hunks.
 *
 * The hunks are git's: `git diff --no-index` between two temporary files outside the repository, so
 * nothing is written to the repository (not even an object), and the hunks match what `git show` prints
 * for the real commit. The algorithm and context are pinned (`--diff-algorithm=myers`, `--unified=3`) and
 * colour, external diff drivers and textconv are off, so the operator's git config cannot change them
 * (REQ-SYS-07). Empty when the two sides are equal.
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when git cannot produce the diff.
 */
export function unifiedDiff(path: string, before: string | null, after: string | null, env?: NodeJS.ProcessEnv): string {
  if (before === after) return '';
  const scratch = mkdtempSync(join(tmpdir(), 'wingfoil-dry-run-'));
  try {
    mkdirSync(join(scratch, 'a'));
    mkdirSync(join(scratch, 'b'));
    writeFileSync(join(scratch, 'a', 'file'), before ?? '', 'utf-8');
    writeFileSync(join(scratch, 'b', 'file'), after ?? '', 'utf-8');
    const run = spawnSync(
      'git',
      ['diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--unified=3', '--diff-algorithm=myers', '--', 'a/file', 'b/file'],
      { cwd: scratch, encoding: 'utf-8', env: env ? { ...process.env, ...env } : process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // `--no-index` exits 1 when the files differ, 0 when they do not.
    if (run.error !== undefined || (run.status !== 0 && run.status !== 1)) {
      const detail = run.error !== undefined ? run.error.message : run.stderr.trim();
      throw new StorageError(E_GIT_READ_FAILED, `git diff for the dry run of ${path} failed: ${detail}`);
    }
    const lines = run.stdout.split('\n');
    const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
    const hunks = firstHunk === -1 ? [] : lines.slice(firstHunk);
    return [before === null ? '--- /dev/null' : `--- a/${path}`, after === null ? '+++ /dev/null' : `+++ b/${path}`, ...hunks].join('\n').replace(/\n*$/, '\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
