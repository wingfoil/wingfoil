/**
 * task-358 AC 2 (c) (red-first, `bug-320` Expected; `dl-115` Q2 (a): "the same existence check … when a plan reaches
 * `done`"; approver ruling D2 (a) (i)) — the governance check (`scripts/check-governance.cjs`) gains the later check
 * `plan-retrospective`: a `wf(plan): finalize <id> [active → done]` commit whose plan, at that commit, holds no
 * `### Retrospective` entry (at least one line outside HTML comments, D2 (b)) is a finding naming the plan, gated from
 * the check's introduction like the other later checks (`dl-103` §1 starting mode, per check).
 *
 * The scratch repository holds this repository's committed `.wingfoil/memory.yaml` and `.wingfoil/dna.yaml` (whose
 * `team.agents` entry the commits' `Co-Authored-By:` names, task-352) and a plan built from its
 * `.wingfoil/memory/templates/plan.md` (both read at `HEAD`), moved `add` → `submit` → `finalize` with the subjects
 * and trailer paragraphs of real plan commits (`git show -s --format=%B 397f66042` / `a02480998` on `main`: the
 * `wf(plan): add`, the `Carries content:` submit, the hand finalize `[active → done]`). The marker spelling
 * `governance-check:plan-retrospective` follows `CHECKS`' convention (`governance-check:<check>`) and is pinned
 * against `CHECKS` in `check-governance-enforcement.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import type { GovernanceFinding, GovernanceReport } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const ROOT = join(__dirname, '..', '..');
const CHECK = 'plan-retrospective';
const MARKER = 'governance-check:plan-retrospective';

const atHead = (path: string): string => execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8' });

const MEMORY_YAML = atHead('.wingfoil/memory.yaml');
/** This repository's `dna.yaml`, whose `team.agents` entry the trailers below name (task-352: `co-author-identity`). */
const DNA_YAML = atHead('.wingfoil/dna.yaml');
const PLAN_TEMPLATE = atHead('.wingfoil/memory/templates/plan.md');

const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };
const VERSION_TRAILER = 'WingFoil-Version: 0.3.2 (16c28e9ceb5eedcdf62efce5b1b2e1e03222fe7a)';
const ATTRIBUTION = 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5';

function planDocument(id: string, status: string, entry: string | null): string {
  let out = PLAN_TEMPLATE;
  const fields: Record<string, string> = {
    id,
    title: '"Dev-loop — rel-v9.9"',
    status,
    workflow: '"dev-loop"',
    phase: '"rel-v9.9"',
    parent: '"release-cycle.implementation"',
    release: '"v9.9"',
  };
  for (const [key, value] of Object.entries(fields)) out = out.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`);
  return entry === null ? out : `${out.trimEnd()}\n\n${entry}\n`;
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

interface Fixture {
  readonly root: string;
  commit(message: string, files?: Readonly<Record<string, string>>): string;
}

function fixture(): Fixture {
  const root = makeTempGitRepo();
  roots.push(root);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: DEVELOPER.name,
    GIT_AUTHOR_EMAIL: DEVELOPER.email,
    GIT_COMMITTER_NAME: DEVELOPER.name,
    GIT_COMMITTER_EMAIL: DEVELOPER.email,
  };
  const commit: Fixture['commit'] = (message, files = {}) => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], { cwd: root, encoding: 'utf-8', env });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA_YAML });
  return { root, commit };
}

/** `add` → `submit` → `finalize [active → done]` of one plan; returns the finalize commit's sha. */
function runPlan(f: Fixture, id: string, entry: string | null): string {
  const path = `docs/05_plans/rl-v9/rel-v9.9/${id}.md`;
  f.commit(`wf(plan): add ${id}\n\n${VERSION_TRAILER}\n${ATTRIBUTION}`, { [path]: planDocument(id, 'draft', null) });
  f.commit(`wf(plan): submit ${id}\n\nCarries content: frontmatter field 'release', the body\n\n${VERSION_TRAILER}\n${ATTRIBUTION}`, {
    [path]: planDocument(id, 'active', entry),
  });
  return f.commit(`wf(plan): finalize ${id} [active → done]\n\n${VERSION_TRAILER}\n${ATTRIBUTION}`, { [path]: planDocument(id, 'done', entry) });
}

/** The findings of the later check `plan-retrospective` (compared as a string: the check is new). */
const ofCheck = (report: GovernanceReport): GovernanceFinding[] => report.findings.filter((finding) => (finding.check as string | undefined) === CHECK);

describe('task-358 AC 2 (c) — governance check plan-retrospective on wf(plan): finalize (bug-320, D2 (a) (i))', () => {
  it('a finalize after the check\'s introduction whose plan has no ### Retrospective entry: a gated finding naming the plan, exit 1', () => {
    const f = fixture();
    const finalize = runPlan(f, 'dev-loop-rel-v9.9-plan', null);
    const report = checkGovernance(f.root);
    const findings = ofCheck(report);
    expect(findings.map(({ sha, gated }) => ({ sha, gated }))).toEqual([{ sha: finalize, gated: true }]);
    expect(findings[0]!.message).toContain('dev-loop-rel-v9.9-plan');
    expect(exitCodeFor(report)).toBe(1);
  });

  it('the same finalize with an entry ("- None." under ### Retrospective): no finding, exit 0', () => {
    const f = fixture();
    runPlan(f, 'dev-loop-rel-v9.9-plan', '- None.');
    const report = checkGovernance(f.root);
    expect(ofCheck(report)).toEqual([]);
    expect(report.findings.filter((finding) => finding.gated)).toEqual([]);
    expect(exitCodeFor(report)).toBe(0);
  });

  it('gating: the same finalize before the check entered the script is reported, not gated, exit 0; after it, gated', () => {
    const g = fixture();
    g.commit('chore: introduce the script', { 'scripts/check-governance.cjs': '// placeholder\n' });
    const before = runPlan(g, 'dev-loop-rel-v9.8-plan', null);
    g.commit('chore: add the rule', { 'scripts/check-governance.cjs': `// placeholder\n// ${MARKER}\n` });
    const historyOnly = checkGovernance(g.root);
    expect(ofCheck(historyOnly).map(({ sha, gated }) => ({ sha, gated }))).toEqual([{ sha: before, gated: false }]);
    expect(exitCodeFor(historyOnly)).toBe(0);
    const after = runPlan(g, 'dev-loop-rel-v9.9-plan', null);
    const gated = new Map(ofCheck(checkGovernance(g.root)).map((finding) => [finding.sha, finding.gated]));
    expect(gated.get(before)).toBe(false);
    expect(gated.get(after)).toBe(true);
  });
});
