/**
 * task-140-run-packaging-gate-push-pull-request-separate (`dl-076` option (D), REQ-SYS-09) — the packaging
 * gate runs on every push and pull request, in a workflow of its own.
 *
 * `dl-076` E4: until this task the only executable `npm ci` in the repository was `publish.yml`'s `gate`
 * job, reachable only by a `vX.Y.Z` tag push, so the pipeline's environment was entered once per release.
 * `.github/workflows/ci.yml` enters it on every push: the same `npm ci` + `prepublishOnly` (build + test +
 * lint), on the same runner image, at the same Node. `publish.yml`'s own trigger is untouched (Q4: no
 * `adr-009` amendment) — `publish-pipeline.test.ts` keeps pinning it to the tag alone.
 *
 * Asserted offline, as `publish-pipeline.test.ts` does for `publish.yml`: both files are parsed from the
 * working tree. Nothing here runs the workflow — its first real run is the task's AC 3, a push.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const CI_PATH = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const PUBLISH_PATH = join(REPO_ROOT, '.github', 'workflows', 'publish.yml');

interface WorkflowStep {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly 'continue-on-error'?: unknown;
}

interface WorkflowJob {
  readonly 'runs-on'?: string;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly 'continue-on-error'?: unknown;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly concurrency?: Readonly<Record<string, unknown>>;
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

describe('ci workflow (task-140) — dl-076 (D): the packaging gate on every push and pull request', () => {
  it('exists at .github/workflows/ci.yml, beside publish.yml', () => {
    expect(existsSync(CI_PATH)).toBe(true);
    expect(existsSync(PUBLISH_PATH)).toBe(true);
  });

  it('triggers on a push to any branch and on a pull request to main — and on nothing else', () => {
    const { parsed } = read(CI_PATH);
    expect(Object.keys(parsed.on).sort()).toEqual(['pull_request', 'push']);
    // `branches` alone, no `tags`: a tag push is publish.yml's, and does not run this gate a second time.
    expect(parsed.on.push).toEqual({ branches: ['**'] });
    expect(parsed.on.pull_request).toEqual({ branches: ['main'] });
  });

  it('is read-only: `permissions: contents: read`, and no job widens it', () => {
    const { parsed } = read(CI_PATH);
    expect(parsed.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(parsed.jobs)) expect(job.permissions).toBeUndefined();
  });

  it('runs one job on ubuntu-24.04, the runner publish.yml’s gate uses', () => {
    const ci = read(CI_PATH).parsed;
    const publish = read(PUBLISH_PATH).parsed;
    expect(Object.keys(ci.jobs)).toEqual(['packaging-gate']);
    expect(ci.jobs['packaging-gate']?.['runs-on']).toBe('ubuntu-24.04');
    expect(ci.jobs['packaging-gate']?.['runs-on']).toBe(publish.jobs.gate?.['runs-on']);
  });

  it('pins the same Node as publish.yml — equal `env.NODE_VERSION`, fed to setup-node, no cache', () => {
    const ci = read(CI_PATH).parsed;
    const publish = read(PUBLISH_PATH).parsed;
    expect(ci.env?.NODE_VERSION).toBeDefined();
    expect(ci.env?.NODE_VERSION).toBe(publish.env?.NODE_VERSION);
    const setup = ci.jobs['packaging-gate']?.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(setup?.with?.['node-version']).toBe('${{ env.NODE_VERSION }}');
    expect(setup?.with?.['package-manager-cache']).toBe(false);
  });

  it('runs exactly `npm ci`, `npm run check:audit`, then `npm run prepublishOnly` — publish.yml’s two gate steps plus the audit', () => {
    // task-250 (bug-223) added `check:audit` between the two: it needs the registry's advisory database,
    // so it is a ci.yml step and not part of `prepublishOnly`, which publish.yml's tag gate also runs.
    const job = read(CI_PATH).parsed.jobs['packaging-gate'];
    const runSteps = (job?.steps ?? []).filter((s) => s.run !== undefined).map((s) => s.run?.trim());
    expect(runSteps).toEqual(['npm ci', 'npm run check:audit', 'npm run prepublishOnly']);
    const publishGate = (read(PUBLISH_PATH).parsed.jobs.gate?.steps ?? []).map((s) => s.run?.trim());
    expect(publishGate).toEqual(expect.arrayContaining(['npm ci', 'npm run prepublishOnly']));
  });

  it('fails the run on a red gate — no `continue-on-error` anywhere (dl-076 Q2)', () => {
    const { parsed } = read(CI_PATH);
    for (const job of Object.values(parsed.jobs)) {
      expect(job['continue-on-error']).toBeUndefined();
      for (const step of job.steps) expect(step['continue-on-error']).toBeUndefined();
    }
  });

  it('pins every action by full SHA, to exactly the line publish.yml uses for it', () => {
    const ciUses = usesLines(read(CI_PATH).raw);
    const publishUses = new Set(usesLines(read(PUBLISH_PATH).raw));
    expect(ciUses.length).toBeGreaterThan(0);
    for (const line of ciUses) {
      expect(line).toMatch(/^- uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
      expect(publishUses.has(line)).toBe(true);
    }
  });

  it('checks out the same full history as publish.yml’s gate (`fetch-depth: 0`)', () => {
    const checkoutOf = (wf: Workflow, job: string): WorkflowStep | undefined =>
      wf.jobs[job]?.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    const ci = checkoutOf(read(CI_PATH).parsed, 'packaging-gate');
    const gate = checkoutOf(read(PUBLISH_PATH).parsed, 'gate');
    expect(ci?.with?.['fetch-depth']).toBe(0);
    expect(ci?.with?.['fetch-depth']).toBe(gate?.with?.['fetch-depth']);
  });

  it('cancels superseded runs per branch or PR, but never a run on main (one group per main commit)', () => {
    const { parsed } = read(CI_PATH);
    expect(parsed.concurrency).toEqual({
      group: "ci-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}",
      'cancel-in-progress': true,
    });
  });

  it('checks out without persisting credentials, and carries no registry credential', () => {
    const { raw, parsed } = read(CI_PATH);
    const checkout = parsed.jobs['packaging-gate']?.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['persist-credentials']).toBe(false);
    for (const secret of ['secrets.', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', '_authToken', 'id-token']) {
      expect(raw).not.toContain(secret);
    }
  });
});
