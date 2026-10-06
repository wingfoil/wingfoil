/**
 * The repository half every enumeration-parity gate shares (`task-187`, `dl-116` Q3 (ii)): apply the
 * allowlist to a gate's findings at the repository, report in warn mode, fail what fails in the
 * current {@link PARITY_MODE}. Not a `.test.ts` file, so Jest never runs it on its own.
 */
import { join } from 'node:path';

import { PARITY_ALLOWLIST, PARITY_MODE, UNTRIAGED } from '../enumeration-parity.allowlist';
import { type ParityFinding, checkAllowlist, parityKey, warnReport } from './enumeration-parity';
import { taskStatuses } from './name-resolvability';

const repoRoot = join(__dirname, '..', '..', '..');

/**
 * Assert the repository findings of the gate named `gate`, over the `enumerations` it compares:
 * no unlisted finding and no unknown cited task in either mode; in `fail` mode also no untriaged,
 * stale or exhausted entry, which `warn` mode prints instead.
 */
export function expectAllowlisted(gate: string, findings: readonly ParityFinding[], enumerations: readonly string[]): void {
  const check = checkAllowlist(findings, PARITY_ALLOWLIST, enumerations, taskStatuses(repoRoot));
  const report = warnReport(gate, check, UNTRIAGED);
  if (report !== undefined && PARITY_MODE === 'warn') console.warn(report);

  expect(check.unlisted.map(parityKey)).toEqual([]);
  expect(check.unknownTasks).toEqual([]);
  if (PARITY_MODE === 'fail') {
    expect(check.listed.filter((entry) => entry.reason === UNTRIAGED).map(parityKey)).toEqual([]);
    expect(check.stale.map(parityKey)).toEqual([]);
    expect(check.exhausted.map(parityKey)).toEqual([]);
  }
}
