/**
 * task-358 fix round (approver ruling 2026-11-12, finding 2; `bug-466`'s class) — P02 ("Legal transitions",
 * REQ-STATE-01, `docs/08_health/metrics.yaml`) counts only transitions. The governance check's later check
 * `plan-retrospective` (task-358, `bug-320`) reports a `wf(plan): finalize` whose plan holds no `### Retrospective`
 * entry under rule `state`; `scripts/release-health/measure.cjs` leaves it out of P02 (`P02_EXCLUDED_CHECKS`), so a
 * window holding such a finalize keeps P02 at 0 failing, while the governance check still reports the finding.
 *
 * Fixture: a scratch repository holding this repository's committed `.wingfoil/memory.yaml` and `.wingfoil/dna.yaml`
 * and a plan built from `.wingfoil/memory/templates/plan.md` (all read at `HEAD`), moved `add` → `submit` →
 * `finalize [active → done]` with the template's Retrospective comment only. Deterministic: fixed contents and dates.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { checkGovernance } from '../../scripts/check-governance.cjs';
import { processConformance } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const ROOT = join(__dirname, '..', '..');
const atHead = (path: string): string => execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8' });

const PLAN_ID = 'dev-loop-rel-v9.9-plan';
const PLAN_PATH = `docs/05_plans/rl-v9/rel-v9.9/${PLAN_ID}.md`;
const STAMP = 'WingFoil-Version: 0.3.2 (16c28e9ceb5eedcdf62efce5b1b2e1e03222fe7a)';

function planDocument(status: string): string {
  const fields: Record<string, string> = {
    id: PLAN_ID,
    title: '"Dev-loop — rel-v9.9"',
    status,
    workflow: '"dev-loop"',
    phase: '"rel-v9.9"',
    parent: '"release-cycle.implementation"',
    release: '"v9.9"',
  };
  let out = atHead('.wingfoil/memory/templates/plan.md');
  for (const [key, value] of Object.entries(fields)) out = out.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`);
  return out;
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

function fixture(): { root: string; base: string; finalize: string } {
  const root = makeTempGitRepo();
  roots.push(root);
  const commit = (message: string, files: Readonly<Record<string, string>>): string => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-01T10:00:00+00:00', GIT_COMMITTER_DATE: '2026-11-01T10:00:00+00:00' },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const base = commit('chore: configure wingfoil', {
    '.wingfoil/memory.yaml': atHead('.wingfoil/memory.yaml'),
    '.wingfoil/dna.yaml': atHead('.wingfoil/dna.yaml'),
  });
  commit(`wf(plan): add ${PLAN_ID}\n\n${STAMP}`, { [PLAN_PATH]: planDocument('draft') });
  commit(`wf(plan): submit ${PLAN_ID}\n\nCarries content: frontmatter field 'release', the body\n\n${STAMP}`, { [PLAN_PATH]: planDocument('active') });
  const finalize = commit(`wf(plan): finalize ${PLAN_ID} [active → done]\n\n${STAMP}`, { [PLAN_PATH]: planDocument('done') });
  return { root, base, finalize };
}

describe('task-358 fix round — P02 counts only transitions, not plan-retrospective findings (bug-466 class)', () => {
  it('the governance check reports the finalize under plan-retrospective, rule state (the positive case)', () => {
    const { root, base, finalize } = fixture();
    const findings = checkGovernance(root, { base }).findings.filter((finding) => (finding.check as string | undefined) === 'plan-retrospective');
    expect(findings.map(({ sha, rule }) => ({ sha, rule }))).toEqual([{ sha: finalize, rule: 'state' }]);
  });

  it('P02 over the same window has no failing item', () => {
    const { root, base, finalize } = fixture();
    const p02 = processConformance(root, finalize, base).find((metric) => metric.id === 'P02');
    expect(p02).toBeDefined();
    expect(p02!.failing ?? []).toEqual([]);
  });
});
