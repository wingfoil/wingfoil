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
  readonly concurrency?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

function read(path: string): { readonly raw: string; readonly parsed: Workflow } {
  const raw = readFileSync(path, 'utf-8');
  return { raw, parsed: yamlLoad(raw) as Workflow };
}

/** The comment header of a workflow file: everything before its `name:` line. */
function headerOf(raw: string, name: string): string {
  const at = raw.indexOf(`\nname: ${name}`);
  expect(at).toBeGreaterThan(0);
  return raw.slice(0, at);
}

/**
 * The header paragraph whose first line starts with `start`, up to (excluding) the next bare `#` line.
 * Fails the test when no line starts with `start`.
 */
function headerParagraph(header: string, start: string): string {
  const lines = header.split('\n');
  const first = lines.findIndex((line) => line.startsWith(start));
  expect({ start, found: first >= 0 }).toEqual({ start, found: true });
  const rest = lines.slice(first);
  const end = rest.findIndex((line) => line.trim() === '#');
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
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

  it('triggers on push to main or to a release/** line, and on pull requests into either — and on nothing else (task-267 AC 6, dl-159)', () => {
    const { parsed } = read(GOVERNANCE_PATH);
    expect(parsed.on).toEqual({
      push: { branches: ['main', 'release/**'] },
      pull_request: { branches: ['main', 'release/**'] },
    });
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

  it('never cancels a run on main or on a release/* line — the same group rule as ci.yml (task-267 AC 6, design D1)', () => {
    const { raw, parsed } = read(GOVERNANCE_PATH);
    expect(raw).toContain(
      "group: governance-${{ (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/heads/release/')) && github.sha || github.ref }}",
    );
    // One rule, two files: the body after the prefix is ci.yml's, character for character.
    const governanceGroup = String(parsed.concurrency?.group ?? '');
    const ciGroup = String(read(CI_PATH).parsed.concurrency?.group ?? '');
    expect(governanceGroup.startsWith('governance-')).toBe(true);
    expect(ciGroup.startsWith('ci-')).toBe(true);
    expect(governanceGroup.slice('governance-'.length)).toBe(ciGroup.slice('ci-'.length));
  });

  it('names release/X.Y in its header — line 1, the range paragraph (all-zero first push → whole history), the ci.yml paragraph — citing dl-159 (task-267 AC 6, design D2/D3)', () => {
    const header = headerOf(read(GOVERNANCE_PATH).raw, 'governance');
    expect(header.split('\n')[0]).toContain('release/X.Y');
    const range = headerParagraph(header, '# The range');
    expect(range).toContain('release/X.Y');
    expect(range).toContain('all-zero');
    expect(range).toContain('whole history');
    expect(headerParagraph(header, '# Kept equal to ci.yml')).toContain('release/X.Y');
    expect(header).toContain('dl-159');
  });
});
