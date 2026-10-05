/**
 * task-190-run-dependency-lockfile-check-schedule-github-actions-provisional (`dl-105` Decision 3–4,
 * Action 2; R1 (a), R2 (c), R4) — the dependency and lockfile check runs on a schedule, in a GitHub
 * Actions workflow of its own, until the workflow engine takes the trigger over.
 *
 * `dl-069`: lockfile drift that arrives from the registry was seen only at a tag. `dl-105` R4 binds the
 * recurring check to `npm ci` plus `npm run check:lockfile`, keyed on exit status alone; the triage of
 * 2026-10-05 adds `npm run check:audit` (`task-250`, `bug-223`) and `bug-238` the whole-tree audit
 * `npm run check:audit:all`. R2 (c): while the trigger is provisional the job only reads and reports —
 * no commit, no push, no credential.
 *
 * Asserted offline, as `ci-workflow.test.ts` does for `ci.yml`: the files are parsed from the working
 * tree. Nothing here runs the workflow — its first real run is the first cron tick after the merge.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const SCHEDULED_PATH = join(REPO_ROOT, '.github', 'workflows', 'dependency-check.yml');
const CI_PATH = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

interface WorkflowStep {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
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

/** The `uses:` lines of a workflow, trimmed — the unit the SHA pins are compared on. */
function usesLines(raw: string): string[] {
  return raw
    .split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line))
    .map((line) => line.trim());
}

/** The workflow's single job. */
function onlyJob(): WorkflowJob {
  const jobs = Object.values(read(SCHEDULED_PATH).parsed.jobs);
  expect(jobs).toHaveLength(1);
  return jobs[0] as WorkflowJob;
}

/** The one `schedule` cron string. */
function cronOf(parsed: Workflow): string {
  const schedule = parsed.on.schedule as ReadonlyArray<{ readonly cron: string }>;
  expect(schedule).toHaveLength(1);
  return schedule[0]?.cron ?? '';
}

describe('dependency-check workflow (task-190) — dl-105: the dependency check on a provisional schedule', () => {
  it('exists at .github/workflows/dependency-check.yml', () => {
    expect(existsSync(SCHEDULED_PATH)).toBe(true);
  });

  it('triggers on one `schedule` cron of five fields and on `workflow_dispatch` — and on nothing else', () => {
    const { parsed } = read(SCHEDULED_PATH);
    expect(Object.keys(parsed.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    // minute hour day-of-month month day-of-week — five whitespace-separated fields, nothing more.
    expect(cronOf(parsed).split(' ')).toHaveLength(5);
    expect(cronOf(parsed)).toMatch(/^[\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+$/);
  });

  it('records the cron string in the header, next to a pointer to dl-105 (R1 (a): the engine reuses it)', () => {
    const { raw, parsed } = read(SCHEDULED_PATH);
    const header = raw.split('\n').filter((line) => line.startsWith('#'));
    const cronLine = header.find((line) => line.includes(`'${cronOf(parsed)}'`));
    expect(cronLine).toBeDefined();
    expect(cronLine).toContain('dl-105');
    expect(header.join('\n')).toContain('cadence: { recurring: { cron:');
  });

  it('is read-only: `permissions: contents: read` only, and no job widens it', () => {
    const { parsed } = read(SCHEDULED_PATH);
    expect(parsed.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(parsed.jobs)) expect(job.permissions).toBeUndefined();
  });

  it('runs exactly `npm ci`, `npm run check:lockfile`, `npm run check:audit`, `npm run check:audit:all`', () => {
    const runSteps = onlyJob()
      .steps.filter((s) => s.run !== undefined)
      .map((s) => s.run?.trim());
    expect(runSteps).toEqual(['npm ci', 'npm run check:lockfile', 'npm run check:audit', 'npm run check:audit:all']);
  });

  it('reports every check after a successful install, whatever the previous check said', () => {
    const steps = onlyJob().steps;
    expect(steps.find((s) => s.run?.trim() === 'npm ci')?.id).toBe('install');
    for (const check of ['npm run check:lockfile', 'npm run check:audit', 'npm run check:audit:all']) {
      expect({ check, if: steps.find((s) => s.run?.trim() === check)?.if }).toEqual({
        check,
        if: "${{ !cancelled() && steps.install.outcome == 'success' }}",
      });
    }
  });

  it('is keyed on exit status alone — no `continue-on-error` anywhere (dl-105 R4)', () => {
    for (const job of Object.values(read(SCHEDULED_PATH).parsed.jobs)) {
      expect(job['continue-on-error']).toBeUndefined();
      for (const step of job.steps) expect(step['continue-on-error']).toBeUndefined();
    }
  });

  it('has no push, tag or publish step, and carries no credential (dl-105 R2 (c))', () => {
    const { raw } = read(SCHEDULED_PATH);
    const yaml = raw
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    for (const forbidden of [
      'git push',
      'git tag',
      'git commit',
      'npm publish',
      'npm version',
      'secrets.',
      'id-token',
      'NPM_TOKEN',
      'NODE_AUTH_TOKEN',
      '_authToken',
      'write',
    ]) {
      expect({ forbidden, found: yaml.includes(forbidden) }).toEqual({ forbidden, found: false });
    }
    const checkout = onlyJob().steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['persist-credentials']).toBe(false);
  });

  it('pins Node at the CI `NODE_VERSION`, fed to setup-node, on the CI runner, no cache', () => {
    const scheduled = read(SCHEDULED_PATH).parsed;
    const ci = read(CI_PATH).parsed;
    expect(scheduled.env?.NODE_VERSION).toBeDefined();
    expect(scheduled.env?.NODE_VERSION).toBe(ci.env?.NODE_VERSION);
    const setup = onlyJob().steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(setup?.with?.['node-version']).toBe('${{ env.NODE_VERSION }}');
    expect(setup?.with?.['package-manager-cache']).toBe(false);
    expect(onlyJob()['runs-on']).toBe(ci.jobs['packaging-gate']?.['runs-on']);
  });

  it('uses exactly the action pins ci.yml uses (checkout and setup-node)', () => {
    const scheduled = usesLines(read(SCHEDULED_PATH).raw);
    const ci = new Set(usesLines(read(CI_PATH).raw));
    expect(scheduled).toHaveLength(2);
    for (const line of scheduled) expect({ line, inCi: ci.has(line) }).toEqual({ line, inCi: true });
  });
});
