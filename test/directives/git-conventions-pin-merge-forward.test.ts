/**
 * task-305 review fixes (R1, R2) — a review-fix test, outside red's frozen files (T4).
 *
 * R1: `git-conventions` §1 rule 5 states that the `dl-095` pin keeps `main`'s value in a merge forward even when the
 * merge brings no conflict on it, restored and recorded in the merge commit; `release-planning.yaml`'s
 * `advance-pinned-build` cites rule 5 for both cases. R2: the pin switch belongs to the release's integration branch
 * and is committed on the phase branch cut from it, not on the integration branch itself.
 *
 * Pins are substrings of whitespace-flattened text (task-276); each absence sits beside its positive.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

const ROOT = join(__dirname, '..', '..');
const flat = (s: string): string => s.replace(/\s+/g, ' ');

const GIT = readFileSync(join(ROOT, '.wingfoil', 'directives', 'custom', 'git-conventions.md'), 'utf-8');

function rule5(): string {
  const start = GIT.indexOf('\n  5. The merge forward');
  if (start < 0) throw new Error('git-conventions §1 has no rule 5');
  const end = GIT.indexOf('\n  6. ', start);
  return flat(GIT.slice(start, end < 0 ? undefined : end));
}

function advancePinnedBuild(): string {
  const wf = load(readFileSync(join(ROOT, '.wingfoil', 'workflows', 'custom', 'release-planning.yaml'), 'utf-8')) as {
    phases: { name: string; description?: string }[];
  };
  const phase = wf.phases.find((p) => p.name === 'advance-pinned-build');
  if (phase === undefined) throw new Error('release-planning has no advance-pinned-build');
  return flat(phase.description ?? '');
}

describe('task-305 review fixes — the pin in a merge forward with no conflict, and where the switch is committed', () => {
  it('R1: rule 5 keeps main’s dl-095 pin even when the merge brings no conflict, restored and recorded in the merge commit', () => {
    const text = rule5();
    expect(text).toContain('even when the merge brings no conflict on it');
    expect(text).toContain("it is restored to `main`'s in the merge commit itself and recorded there");
    expect(text).toContain('`package-lock.json`');
    expect(text).toContain("the resolution keeps `main`'s values");
  });

  it('R1: advance-pinned-build cites rule 5 for the merge forward with or without a conflict', () => {
    expect(advancePinnedBuild()).toContain(
      "the merge forward keeps `main`'s pin, with or without a conflict on it (git-conventions §1 rule 5)",
    );
  });

  it('R2: the switch belongs to the integration branch and is committed on the phase branch cut from it', () => {
    const text = advancePinnedBuild();
    expect(text).toContain("the switch belongs to the release's integration branch");
    expect(text).toContain('committed on the phase branch cut from it and merged into it');
    expect(text).not.toContain("the switch is committed on the release's integration branch");
  });
});
