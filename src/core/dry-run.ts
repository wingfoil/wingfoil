/**
 * `--dry-run` for every mutating operation (task-210, `dl-106` W2, `spec-008-cli-grammar` §2).
 *
 * A surface runs an operation through {@link runAsDryRun} instead of calling its `fn` directly. The
 * operation itself never learns of the mode: the commit primitive (`writeAndCommit`, `src/storage`)
 * plans the commit instead of making it (`src/storage/dry-run.ts`). So every operation registered
 * `mutates: true` — those in `CORE_MODULES` today and any added later — takes the flag by construction,
 * and `test/cli/dry-run.integration.test.ts` holds each of them to it.
 */
import { captureDryRun, type DryRunPlan } from '../storage';

import type { CoreFlag } from './registry';
import { coreOk, type CoreResult } from './types';

export type { DryRunPlan } from '../storage';

/**
 * The flag the CLI registrar adds to every command whose operation `mutates` (`src/cli/registrar.ts`).
 * An operation never declares it; a command whose operation writes nothing does not take it.
 */
export const DRY_RUN_FLAG: CoreFlag = {
  name: 'dry-run',
  description: 'print the commit this command would make (subject, paths, diff) and write nothing',
};

/**
 * Run `run` — one operation's `fn` — as a dry run:
 *
 * - it reached its commit → a success whose value is the {@link DryRunPlan} (exit `0`), with no
 *   `commit`, since none was made, and the warnings the operation handed to the commit primitive
 *   (`CommitOptions.warnings`) — the ones the real run would print;
 * - it refused before writing → its own failed result, unchanged, so the exit code is the refusal's;
 * - it threw → the same throw, for the surface to render as it renders any thrown error;
 * - it succeeded without committing (a change that is already in place) → its own result, which is
 *   what the real run would print too.
 *
 * A dry run stops at the operation's first commit (see `src/storage/dry-run.ts`).
 */
export async function runAsDryRun<T>(run: () => Promise<CoreResult<T>>): Promise<CoreResult<T | DryRunPlan>> {
  const outcome = await captureDryRun(run);
  if (outcome.kind === 'planned') return coreOk(outcome.plan, undefined, outcome.warnings);
  if (outcome.kind === 'threw') throw outcome.error;
  return outcome.value;
}
