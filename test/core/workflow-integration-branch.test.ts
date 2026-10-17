/**
 * task-288 (`dl-159` A1.8; approver rulings D1–D7, 2026-10-16) — `dev-loop.yaml`'s merges and
 * `release-publishing.yaml`'s `tag` phase name the release's **integration branch** (`git-conventions` §1,
 * task-286): `release/X.Y` for a patch, `main` for a minor or a release with no `kind`. The one declaration
 * of the derivation is `scripts/integration-branch.cjs` (D1; its unit tests are
 * `test/cli/integration-branch.test.ts`), bound as `tag`'s pre-check `on-integration-branch` (D3); the
 * workflows name the branch by the plain argument value `integration_branch` (D2).
 *
 * Workflow files are read **as `HEAD` holds them** (`loadWorkflowRegistryAtHead`; `git show HEAD:<path>` for
 * the raw text and header comments), like `test/core/dev-loop-v2-0.test.ts`; `bindings.yaml`, `WORKFLOW.md`
 * and the directive from the working tree, as their suites do. Prose is pinned as substrings of
 * whitespace-flattened text, never by line (task-276); every absence sits beside a positive; version pins are
 * "≥" plus the history entry naming task-288 and dl-159 (bug-314). Each YAML file is parsed once per value
 * compared — no object from two parses is compared by identity.
 *
 * - AC 1 (red-first): no action or check of either workflow names `main` literally;
 * - AC 2 (red-first): dev-loop's three merges, `start`'s description, the header, the version;
 * - AC 3 (red-first): release-publishing's `tag` (pre-checks, action, description), the version; the
 *   `on-integration-branch` binding in `bindings.yaml`;
 * - AC 5 (red-first, reclassified at design): `bindings.yaml`'s git comments, `WORKFLOW.md`'s Dev Loop and
 *   Release Publishing texts and nodes; D5: `sw-life-cycle.yaml` and `release-cycle.yaml` headers.
 *   (`git-conventions` §1 is `test/directives/dev-loop-done-order.test.ts`.)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { resolveToken } from '../../src/workflow/bindings';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const CUSTOM = '.wingfoil/workflows/custom';
const DEV_LOOP_FILE = `${CUSTOM}/dev-loop.yaml`;
const PUBLISHING_FILE = `${CUSTOM}/release-publishing.yaml`;
const SW_LIFE_CYCLE_FILE = `${CUSTOM}/sw-life-cycle.yaml`;
const RELEASE_CYCLE_FILE = `${CUSTOM}/release-cycle.yaml`;
const TRANSCRIPT_PATH = 'docs/07_gates/rl-{release.release-line}/rel-{release.version}-staging-rehearsal.md';
const ON_INTEGRATION_BRANCH = 'on-integration-branch(kind: "{release.kind}", version: "{release.version}")';
const INTEGRATION_WORDING = 'the integration branch (`main`, or `release/X.Y` for a patch)';

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** Collapse every run of whitespace to one space. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** The leading `#` comment block of a workflow file (before its `name:` key), flattened, `#` markers removed. */
function header(raw: string): string {
  const end = raw.search(/^name:/m);
  const block = raw.slice(0, end < 0 ? undefined : end);
  return flat(block.replace(/^#\s?/gm, ''));
}

/** `version:` of a raw workflow / bindings file: the number and the rest of its line (the history comment). */
function versionLine(raw: string): { value: number; rest: string } {
  const match = /^version: "?(\d+\.\d+)"?(.*)$/m.exec(raw);
  if (!match) throw new Error('no version: line');
  return { value: Number(match[1]), rest: match[2] ?? '' };
}

/**
 * The history entry of `version` in a version-line comment: the first `;`- or `(prev`-delimited segment that
 * names `version` as a word and `task-288`.
 */
function historyEntry(rest: string, version: string): string | undefined {
  const word = new RegExp(`(^|[\\s(])${version.replace('.', '\\.')}([\\s):,]|$)`);
  return rest.split(/;|\(prev /).find((segment) => word.test(segment) && segment.includes('task-288'));
}

function workflow(name: string): Workflow {
  const found = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === name);
  if (found === undefined) throw new Error(`${name} is not in the registry at HEAD`);
  return found;
}

function phaseOf(wf: Workflow, name: string): Phase {
  const found = wf.phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`${wf.name} has no phase '${name}' at HEAD`);
  return found;
}

/** Every action and every pre/post check token of every phase, as `<phase>: <token>`. */
function tokens(wf: Workflow): string[] {
  const out: string[] = [];
  for (const phase of wf.phases) {
    for (const action of phase.actions ?? []) out.push(`${phase.name}: ${action}`);
    for (const check of phase.checks?.pre ?? []) out.push(`${phase.name}: ${check}`);
    for (const check of phase.checks?.post ?? []) out.push(`${phase.name}: ${check}`);
  }
  return out;
}

describe('task-288 AC 1 — one name for the integration branch, never a literal `main` in a token', () => {
  it.each([['dev-loop'], ['release-publishing']])('%s: no action or check token names `main`; at least one names the integration branch', (name) => {
    const all = tokens(workflow(name));
    expect(all.filter((token) => /integration_branch|on-integration-branch/.test(token)).length).toBeGreaterThan(0);
    expect(all.filter((token) => /\bmain\b/.test(token))).toEqual([]);
  });
});

describe('task-288 AC 2 — dev-loop.yaml merges from / into the integration branch (2.0 → 2.1)', () => {
  it("`red`'s merge and `refactor`'s last action are `git.merge(from: integration_branch)`", () => {
    const wf = workflow('dev-loop');
    expect(phaseOf(wf, 'red').actions?.[1]).toBe('git.merge(from: integration_branch)');
    const refactor = phaseOf(wf, 'refactor').actions ?? [];
    expect(refactor[refactor.length - 1]).toBe('git.merge(from: integration_branch)');
  });

  it("`done` keeps task-281's order and merges into the integration branch; the phase order is unchanged", () => {
    const wf = workflow('dev-loop');
    expect(phaseOf(wf, 'done').actions).toEqual([
      'memory.approve',
      'element.set_state(done)',
      'bug.sync_state(for_each: task.bug)',
      'git.merge(to: integration_branch, ff: false)',
      'git.remove_worktree',
    ]);
    expect(wf.phases.map((p) => p.name)).toEqual(['start', 'design', 'red', 'green', 'refactor', 'review', 'done']);
  });

  it("`start`'s description says the branch is cut from the integration branch", () => {
    const description = flat(phaseOf(workflow('dev-loop'), 'start').description ?? '');
    expect(description).toContain('integration branch');
  });

  it('the header declares `integration_branch` and cites scripts/integration-branch.cjs', () => {
    const text = header(atHead(DEV_LOOP_FILE));
    expect(text).toContain('integration_branch');
    expect(text).toContain('scripts/integration-branch.cjs');
  });

  it('`version:` is 2.1 or later, its 2.1 entry names task-288 and dl-159, and keeps `prev 2.0` and `prev 1.9`', () => {
    const { value, rest } = versionLine(atHead(DEV_LOOP_FILE));
    expect(value).toBeGreaterThanOrEqual(2.1);
    const entry = historyEntry(rest, '2.1');
    expect(entry).toBeDefined();
    expect(entry).toContain('dl-159');
    expect(rest).toContain('prev 2.0');
    expect(rest).toContain('prev 1.9');
  });

  it('the merge stays a bound manual step', () => {
    const { bindings } = loadWorkflowRegistryAtHead(ROOT);
    expect(resolveToken('git.merge(from: integration_branch)', 'action', bindings).kind).toBe('manual');
    expect(resolveToken('git.merge(to: integration_branch, ff: false)', 'action', bindings).kind).toBe('manual');
  });
});

describe('task-288 AC 3 — release-publishing `tag` on the integration branch (1.8 → 1.9), the bound pre-check', () => {
  it('the phase order is unchanged; `tag` pre-checks the integration branch first and evidence-only last', () => {
    const wf = workflow('release-publishing');
    expect(wf.phases.map((p) => p.name)).toEqual(['release-commit', 'staging-rehearsal', 'tag', 'publish', 'mark-released']);
    expect(phaseOf(wf, 'tag').checks?.pre).toEqual([
      ON_INTEGRATION_BRANCH,
      'phase-branch-merged-to-integration-branch',
      `staging-rehearsal-passed(transcript: ${TRANSCRIPT_PATH})`,
      `evidence-only-since-candidate(transcript: ${TRANSCRIPT_PATH})`,
    ]);
  });

  it("`tag`'s action tags on the integration branch", () => {
    expect(phaseOf(workflow('release-publishing'), 'tag').actions).toEqual(['git.tag(name: "{release.version}", on: integration_branch)']);
  });

  it("`tag`'s description: a minor on the pushed `main`, a patch on the pushed `release/X.Y` (dl-159, git-conventions §3, task-286)", () => {
    const description = flat(phaseOf(workflow('release-publishing'), 'tag').description ?? '');
    for (const phrase of ['pushed `main`', 'pushed `release/X.Y`', 'dl-159', 'git-conventions', '§3', 'task-286']) {
      expect(description).toContain(phrase);
    }
    expect(description).not.toContain('ON `main`');
  });

  it('`version:` is 1.9 or later with a 1.9 entry naming task-288 and dl-159', () => {
    const raw = atHead(PUBLISHING_FILE);
    const { value, rest } = versionLine(raw);
    expect(value).toBeGreaterThanOrEqual(1.9);
    expect(raw).toMatch(/1\.9 [^;]*task-288/);
    expect(historyEntry(rest, '1.9')).toContain('dl-159');
  });

  describe('bindings.yaml (2.2 → 2.3) binds on-integration-branch', () => {
    const raw = readFileSync(join(ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8');
    const bindings = yamlLoad(raw) as {
      version: number;
      checks: Record<string, { run: string[]; severity?: string; args?: Record<string, string> }>;
    };

    it('the binding runs the script in check mode, at severity reject, with the kind and version patterns', () => {
      expect(bindings.checks['on-integration-branch']).toEqual({
        run: ['node', 'scripts/integration-branch.cjs', '--check-head', '--kind', '{kind}', '--version', '{version}'],
        severity: 'reject',
        args: { kind: '^(minor|patch)?$', version: '^v[0-9]+\\.[0-9]+(\\.[0-9]+)?$' },
      });
    });

    it('the `kind` pattern accepts "", minor, patch and refuses anything else', () => {
      const pattern = new RegExp(bindings.checks['on-integration-branch']?.args?.['kind'] ?? '(?!)');
      for (const good of ['', 'minor', 'patch']) expect(good).toMatch(pattern);
      for (const bad of ['major', '-x', 'patch;x']) expect(bad).not.toMatch(pattern);
    });

    it('the `version` pattern accepts vX.Y and vX.Y.Z and refuses anything else', () => {
      const pattern = new RegExp(bindings.checks['on-integration-branch']?.args?.['version'] ?? '(?!)');
      for (const good of ['v0.3', 'v0.3.1']) expect(good).toMatch(pattern);
      for (const bad of ['0.3.1', 'v0.3.1;x', '-v0.3']) expect(bad).not.toMatch(pattern);
    });

    it('the pre-check token resolves to that command', () => {
      const { bindings: atHeadBindings } = loadWorkflowRegistryAtHead(ROOT);
      const resolved = resolveToken(ON_INTEGRATION_BRANCH, 'check', atHeadBindings);
      expect(resolved.kind).toBe('run');
      expect(resolved.kind === 'run' ? resolved.argv : []).toContain('scripts/integration-branch.cjs');
    });

    it('`version:` is 2.3 or later with a 2.3 entry naming task-288 and dl-159', () => {
      expect(bindings.version).toBeGreaterThanOrEqual(2.3);
      expect(raw).toMatch(/2\.3 [^;]*task-288/);
      expect(historyEntry(versionLine(raw).rest, '2.3')).toContain('dl-159');
    });
  });
});

describe('task-288 AC 5 — bindings.yaml comments and WORKFLOW.md name the integration branch', () => {
  it("bindings.yaml's dev-loop/tag git comments name the integration branch and the script, no longer `on main`", () => {
    const raw = readFileSync(join(ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8');
    // From after the `tests.bdd.run:` line (so the comment above `git.create_branch:` is included) to `git.tag:`.
    const from = raw.indexOf('\n', raw.indexOf('  tests.bdd.run:'));
    const to = raw.indexOf('  git.tag:');
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const block = flat(raw.slice(from, to).replace(/^\s*#\s?/gm, ''));
    expect(block).toContain('integration branch');
    expect(block).toContain('scripts/integration-branch.cjs');
    expect(block).not.toContain('on main');
  });

  const guide = readFileSync(join(ROOT, '.wingfoil', 'WORKFLOW.md'), 'utf-8');

  /** The `### <heading>` section of WORKFLOW.md, up to the next `### `. */
  function guideSection(heading: string): string {
    const start = guide.indexOf(`### ${heading}`);
    if (start < 0) throw new Error(`no section "### ${heading}"`);
    const end = guide.indexOf('\n### ', start + 1);
    return guide.slice(start, end < 0 ? undefined : end);
  }

  /** The WORKFLOW.md line whose trimmed text starts with `prefix`. */
  function node(prefix: string): string {
    const found = guide.split('\n').find((line) => line.trimStart().startsWith(prefix));
    if (found === undefined) throw new Error(`no line starting ${prefix}`);
    return found;
  }

  it.each([['Dev Loop — `dev-loop`'], ['Release Publishing']])('WORKFLOW.md *%s* names the integration branch (`main`, or `release/X.Y` for a patch)', (heading) => {
    expect(flat(guideSection(heading))).toContain(INTEGRATION_WORDING);
  });

  it('the `done` node merges into the integration branch, no longer "merge to main"', () => {
    const done = node('DONE["');
    expect(done).toContain('integration branch');
    expect(done).not.toContain('merge to main');
  });

  it('the `tag` node pre-checks on-integration-branch', () => {
    expect(node('TG["')).toContain('on-integration-branch');
  });
});

describe('task-288 D5 — sw-life-cycle.yaml (1.1 → 1.2) and release-cycle.yaml (1.5 → 1.6) headers, same class', () => {
  it.each([
    [SW_LIFE_CYCLE_FILE, '1.2', 'merged to `main`'],
    [RELEASE_CYCLE_FILE, '1.6', 'the release tag on the pushed `main`'],
  ])('%s: the git-conventions header names the integration branch and `release/X.Y`; version ≥ %s with a task-288 entry', (path, version, stale) => {
    const raw = atHead(path);
    const text = header(raw);
    expect(text).toContain('integration branch');
    expect(text).toContain('release/X.Y');
    expect(text).not.toContain(stale);
    const { value, rest } = versionLine(raw);
    expect(value).toBeGreaterThanOrEqual(Number(version));
    const entry = historyEntry(rest, version);
    expect(entry).toBeDefined();
    expect(entry).toContain('dl-159');
  });
});
