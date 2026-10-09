/**
 * task-216 AC 4 — REQ-PERF-03 (`docs/02_requirements/03_sard/02_performance-nfr.md`): `workflow next` answers
 * in under 1,000 ms at p95 over >= 20 runs, on this repository's own history (BDD P4.4 sc. 1, "the response is
 * produced in under 1 second"; `spec-017` §4.8 "Cost").
 *
 * **Fixture.** A clone of this repository checked out at {@link PINNED} (`b56e8721`, the W3 B4 pre-batch main):
 * 870 Memory documents, about 5,900 commits, and eight open instances (seven `decision-log-ingest`, one
 * `service-ingest`), so the history walk of §4.8 runs over real open instances, not an empty history (the
 * `task-204` / `task-202` handover). The checkout runs in this file's `beforeAll`, outside the timed region,
 * through the fixture helpers (git is spawned there, never here).
 *
 * **Measurement.** In-process, through the registered `workflowNext` operation — the exact `CoreFn` the CLI
 * dispatches to, with its full `HEAD` snapshot (registry, Memory scan, history walk, `roles.yaml`, directives)
 * redone on each run, nothing cached — timed by `sampleLatency` and judged by `p95` (`bug-012`'s lesson: no
 * wall-clock sample of a spawned CLI). The machine's load average is read before and after and printed with
 * the distribution, so a red names whether the code or the machine moved.
 *
 * **Placement.** The budget presupposes an otherwise idle machine, so this suite runs only in the opt-in
 * latency pass (`test/latency-suites.cjs` `IN_PROCESS_LATENCY_SUITES`; `npm run test:latency`), never inside
 * the parallel `npm test` (the approver's ruling of 2026-10-03, which the spawned-command suite already
 * follows). It needs the full history: CI's checkouts use `fetch-depth: 0`.
 */
import { join } from 'path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { NextResult } from '../../src/core';
import { cloneTempRepo, git, removeTempDir } from '../storage/helpers/git-fixture';
import { describeLoad, describeSamples, P95_BUDGET_MS, p95, readLoadAverage, RUNS, sampleLatency } from './helpers/latency';

/** The commit the clone is checked out at: the W3 B4 pre-batch main, with eight open instances. */
const PINNED = 'b56e8721';

/** The repository this suite runs in. */
const REPOSITORY_ROOT = join(__dirname, '..', '..');

function workflowNextFn(): CoreFn<unknown, NextResult> {
  const operation = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowNext'];
  if (!operation) throw new Error('fixture bug: "workflowNext" operation not registered on the workflow module');
  return operation.fn as CoreFn<unknown, NextResult>;
}

jest.setTimeout(600_000);

describe('REQ-PERF-03 — workflow next on this repository at a pinned commit, in-process', () => {
  let clone: string;

  beforeAll(() => {
    clone = cloneTempRepo(REPOSITORY_ROOT);
    git(clone, ['checkout', '--quiet', '--detach', PINNED]);
  });

  afterAll(() => removeTempDir(clone));

  it('answers with a next step from a real open instance', async () => {
    const outcome = await workflowNextFn()({ root: clone });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.baseline.commit.startsWith(PINNED)).toBe(true);
    expect(outcome.value.instance).not.toBeNull();
    expect(outcome.value.next).not.toBeNull();
  });

  it('stays under 1,000 ms at p95 over >= 20 runs', async () => {
    const fn = workflowNextFn();
    const before = readLoadAverage();
    const samples = await sampleLatency(RUNS, () => fn({ root: clone }));
    const load = { before, after: readLoadAverage() };
    const report = `workflow next: ${describeSamples(samples)}; ${describeLoad(load)}`;
    process.stdout.write(`${report}\n`);
    expect({ report, under: p95(samples) < P95_BUDGET_MS }).toEqual({ report, under: true });
  });
});
