/**
 * REQ-PERF-03's `workflow next` fixture: a clone of this repository checked out at {@link PINNED}.
 *
 * Built by task-216 inside `test/core/workflow-next-latency.test.ts` and moved here unchanged by task-283
 * (`bug-309`), so that the in-process timing (that file) and the spawned-total timing
 * (`test/cli/workflow-next-command-latency.test.ts`) measure the same checkout rather than two look-alikes.
 * The clone is made by `cloneTempRepo` (a local clone, auto-gc off) and detached at the pinned commit; it
 * needs the full history (CI's checkouts use `fetch-depth: 0`). The caller removes it with `removeTempDir`.
 */
import { join } from 'path';

import { cloneTempRepo, git } from '../../storage/helpers/git-fixture';

/** The commit the clone is checked out at: the W3 B4 pre-batch main, with eight open instances. */
export const PINNED = 'b56e8721';

/** The repository the suites run in. */
const REPOSITORY_ROOT = join(__dirname, '..', '..', '..');

/** A fresh clone of this repository, detached at {@link PINNED}. */
export function clonePinnedRepository(): string {
  const clone = cloneTempRepo(REPOSITORY_ROOT);
  git(clone, ['checkout', '--quiet', '--detach', PINNED]);
  return clone;
}
