/**
 * task-208-enforce-governance-check-ci-hooks-branch-protection-advisory (`dl-103` §1 (A)) — the
 * governance check runs outside the agent, in `.github/workflows/governance.yml`, on every push and pull
 * request to `main`; `dl-097` §2 (b) — the claim-shape lint runs beside it, warn-only.
 *
 * Asserted offline, as `ci-workflow.test.ts` does for `ci.yml`: the file is parsed from the working tree.
 * Nothing here runs the workflow — its first real run is the first push to `main` after the merge.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const GOVERNANCE_PATH = join(REPO_ROOT, '.github', 'workflows', 'governance.yml');
const CI_PATH = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

interface WorkflowStep {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly 'continue-on-error'?: unknown;
}

interface WorkflowJob {
  readonly 'runs-on'?: string;
  readonly permissions?: unknown;
  readonly 'continue-on-error'?: unknown;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions?: unknown;
  readonly env?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

function read(path: string): { readonly raw: string; readonly parsed: Workflow } {
  const raw = readFileSync(path, 'utf-8');
  return { raw, parsed: yamlLoad(raw) as Workflow };
}

function usesLines(raw: string): string[] {
  return raw
    .split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line))
    .map((line) => line.trim());
}

function onlyJob(): WorkflowJob {
  const jobs = Object.values(read(GOVERNANCE_PATH).parsed.jobs);
  expect(jobs).toHaveLength(1);
  return jobs[0] as WorkflowJob;
}

function runOf(pattern: RegExp): WorkflowStep {
  const step = onlyJob().steps.find((s) => s.run !== undefined && pattern.test(s.run));
  expect(step).toBeDefined();
  return step as WorkflowStep;
}

describe('governance workflow (task-208) — dl-103 §1 (A): the check runs outside the agent', () => {
  it('exists at .github/workflows/governance.yml', () => {
    expect(existsSync(GOVERNANCE_PATH)).toBe(true);
  });

  it('triggers on push to main and on pull requests into main — and on nothing else', () => {
    const { parsed } = read(GOVERNANCE_PATH);
    expect(parsed.on).toEqual({ push: { branches: ['main'] }, pull_request: { branches: ['main'] } });
  });

  it('is read-only: `permissions: contents: read` only, and no job widens it', () => {
    const { parsed } = read(GOVERNANCE_PATH);
    expect(parsed.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(parsed.jobs)) expect(job.permissions).toBeUndefined();
  });

  it('checks out the full history without persisted credentials (the introduction commit must be reachable)', () => {
    const checkout = onlyJob().steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['fetch-depth']).toBe(0);
    expect(checkout?.with?.['persist-credentials']).toBe(false);
  });

  it('runs, in order: npm ci, the build, the governance check, the claim lint', () => {
    const runs = onlyJob()
      .steps.filter((s) => s.run !== undefined)
      .map((s) => s.run?.trim() ?? '');
    const at = (pattern: RegExp): number => runs.findIndex((run) => pattern.test(run));
    expect(at(/^npm ci$/)).toBe(0);
    expect(at(/^npm run build$/)).toBe(1);
    expect(at(/node scripts\/check-governance\.cjs --base "\$BASE"/)).toBeGreaterThan(1);
    expect(at(/node scripts\/lint-claims\.cjs --base "\$BASE" --format github/)).toBeGreaterThan(at(/check-governance/));
  });

  it('takes the range from the event: the pull request base, or the commit before the push', () => {
    const { raw } = read(GOVERNANCE_PATH);
    expect(raw).toContain('github.event.pull_request.base.sha');
    expect(raw).toContain('github.event.before');
  });

  it('keeps the governance check binding and the claim lint warn-only', () => {
    const governance = runOf(/check-governance\.cjs/);
    expect(governance['continue-on-error']).toBeUndefined();
    const lint = runOf(/lint-claims\.cjs/);
    expect(lint.if).toBe("${{ !cancelled() && steps.build.outcome == 'success' }}");
    // Warn-only by its own exit status (0 on findings), never by masking a failure to run.
    expect(lint['continue-on-error']).toBeUndefined();
    for (const job of Object.values(read(GOVERNANCE_PATH).parsed.jobs)) expect(job['continue-on-error']).toBeUndefined();
  });

  it('has no push, tag or publish step, and carries no credential', () => {
    const yaml = read(GOVERNANCE_PATH)
      .raw.split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    for (const forbidden of ['git push', 'git tag', 'git commit', 'npm publish', 'secrets.', 'id-token', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'write']) {
      expect({ forbidden, found: yaml.includes(forbidden) }).toEqual({ forbidden, found: false });
    }
  });

  it('pins Node at the CI `NODE_VERSION`, on the CI runner, no cache, and uses exactly ci.yml action pins', () => {
    const governance = read(GOVERNANCE_PATH);
    const ci = read(CI_PATH);
    expect(governance.parsed.env?.NODE_VERSION).toBe(ci.parsed.env?.NODE_VERSION);
    const setup = onlyJob().steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(setup?.with?.['node-version']).toBe('${{ env.NODE_VERSION }}');
    expect(setup?.with?.['package-manager-cache']).toBe(false);
    expect(onlyJob()['runs-on']).toBe(ci.parsed.jobs['packaging-gate']?.['runs-on']);
    const ciUses = new Set(usesLines(ci.raw));
    const lines = usesLines(governance.raw);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect({ line, inCi: ciUses.has(line) }).toEqual({ line, inCi: true });
  });

  it('never cancels a run on main', () => {
    const { raw } = read(GOVERNANCE_PATH);
    expect(raw).toContain("group: governance-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}");
  });
});
