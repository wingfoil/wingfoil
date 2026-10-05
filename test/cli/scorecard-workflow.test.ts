/**
 * task-160-add-openssf-scorecard-workflow-private-results (`dl-129` §1, Q1 (b), REQ-SYS-09) — an
 * OpenSSF Scorecard workflow, on a push to `main` and weekly, whose results stay private for the
 * first run.
 *
 * `dl-129` Decision 1: the official action, pinned by SHA like `publish.yml`, with only the permissions
 * the action documents. Q1 was ratified as (b) for the first run: `publish_results: false`, so nothing
 * is sent to the OpenSSF REST API and no badge exists until the approver chooses (a). The SARIF report
 * goes to the repository's code-scanning dashboard only — no `upload-artifact` step, because a
 * workflow artefact of a public repository is downloadable by any signed-in GitHub user.
 *
 * Asserted offline, as `ci-workflow.test.ts` does for `ci.yml`: the file is parsed from the working
 * tree. Nothing here runs the workflow — its first real run is the task's AC 2, a push to `main`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const SCORECARD_PATH = join(REPO_ROOT, '.github', 'workflows', 'scorecard.yml');
const PUBLISH_PATH = join(REPO_ROOT, '.github', 'workflows', 'publish.yml');

interface WorkflowStep {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly 'runs-on'?: string;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly env?: unknown;
  readonly defaults?: unknown;
  readonly container?: unknown;
  readonly services?: unknown;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly env?: unknown;
  readonly defaults?: unknown;
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

/** The single job of the workflow — the one the scorecard action runs in. */
function analysisJob(): WorkflowJob {
  const jobs = Object.values(read(SCORECARD_PATH).parsed.jobs);
  expect(jobs).toHaveLength(1);
  return jobs[0] as WorkflowJob;
}

function stepUsing(job: WorkflowJob, action: string): WorkflowStep | undefined {
  return job.steps.find((s) => s.uses?.startsWith(`${action}@`));
}

describe('scorecard workflow (task-160) — dl-129 §1: OpenSSF Scorecard, private results (Q1 (b))', () => {
  it('exists at .github/workflows/scorecard.yml', () => {
    expect(existsSync(SCORECARD_PATH)).toBe(true);
  });

  it('triggers on a push to main and on a weekly schedule — and on nothing else', () => {
    const { parsed } = read(SCORECARD_PATH);
    expect(Object.keys(parsed.on).sort()).toEqual(['push', 'schedule']);
    expect(parsed.on.push).toEqual({ branches: ['main'] });
    const schedule = parsed.on.schedule as ReadonlyArray<{ readonly cron: string }>;
    expect(schedule).toHaveLength(1);
    // minute hour day-of-month month day-of-week: fixed minute, hour and weekday; every month-day/month.
    expect(schedule[0]?.cron).toMatch(/^\d{1,2} \d{1,2} \* \* [0-6]$/);
  });

  it('keeps the results private: `publish_results: false`, SARIF to code scanning only, no artefact', () => {
    const job = analysisJob();
    const scorecard = stepUsing(job, 'ossf/scorecard-action');
    expect(scorecard?.with?.publish_results).toBe(false);
    expect(scorecard?.with?.results_format).toBe('sarif');
    const upload = stepUsing(job, 'github/codeql-action/upload-sarif');
    expect(upload?.with?.sarif_file).toBe(scorecard?.with?.results_file);
    expect(stepUsing(job, 'actions/upload-artifact')).toBeUndefined();
  });

  it('holds only the documented permissions: read-only workflow, and the job adds `security-events: write`', () => {
    const { parsed } = read(SCORECARD_PATH);
    expect(parsed.permissions).toEqual({ contents: 'read' });
    // scorecard-action v2.4.4 README: `security-events: write` uploads to code scanning; the four reads
    // let the default token query commits, issues, PRs and checks. `id-token: write` is documented
    // for `publish_results: true` only, so under Q1 (b) it is absent.
    expect(analysisJob().permissions).toEqual({
      'security-events': 'write',
      contents: 'read',
      issues: 'read',
      'pull-requests': 'read',
      checks: 'read',
    });
  });

  it('carries no OIDC grant, no secret and no credential', () => {
    const { raw } = read(SCORECARD_PATH);
    for (const secret of ['secrets.', 'id-token', 'repo_token', 'NPM_TOKEN', '_authToken']) {
      expect(raw).not.toContain(secret);
    }
    const checkout = stepUsing(analysisJob(), 'actions/checkout');
    expect(checkout?.with?.['persist-credentials']).toBe(false);
  });

  it('meets the shape the Scorecard API requires of a workflow, so Q1 (a) is a one-line change', () => {
    const { parsed } = read(SCORECARD_PATH);
    const job = analysisJob();
    expect(parsed.env).toBeUndefined();
    expect(parsed.defaults).toBeUndefined();
    for (const key of ['env', 'defaults', 'container', 'services'] as const) expect(job[key]).toBeUndefined();
    expect(job['runs-on']).toBe('ubuntu-24.04');
    expect(job.steps.every((s) => s.run === undefined)).toBe(true);
  });

  it('pins the official action and every other action by full SHA, the tag in a trailing comment', () => {
    const lines = usesLines(read(SCORECARD_PATH).raw);
    for (const line of lines) expect(line).toMatch(/^- uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    // The table freezes the lookup recorded in task-160's Execution Notes (`git ls-remote --tags`,
    // the dereferenced `^{}` commit of each release tag): a pin moved without redoing it fails here.
    expect(lines.sort()).toEqual(
      [
        '- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
        '- uses: ossf/scorecard-action@2d1146689b8cda280b9bc96326124645441f03bc # v2.4.4',
        '- uses: github/codeql-action/upload-sarif@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2',
      ].sort(),
    );
  });

  it('checks out with exactly the pin publish.yml uses for actions/checkout', () => {
    const publishUses = new Set(usesLines(read(PUBLISH_PATH).raw));
    const checkout = usesLines(read(SCORECARD_PATH).raw).filter((l) => l.includes('actions/checkout@'));
    expect(checkout).toHaveLength(1);
    expect(publishUses.has(checkout[0] as string)).toBe(true);
  });
});
