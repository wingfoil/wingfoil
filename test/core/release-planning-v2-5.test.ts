/**
 * task-347 (`dl-191` (a), `dl-163` S3d, `dl-100` §4 (b), `release-planning-rel-v0.4-plan` R11; design gate D1 (b),
 * D2–D5 (a), approver ruling 2026-11-08) — `release-planning.yaml` 2.5:
 *
 * - AC 1 (red-first, read per D1 (b)): `triage-bugs` keeps its selection of `open` bugs and names the follow-up; a
 *   new phase `assign-bugs`, right after it, selects every `triaged` bug whose `release` is empty and gives each a
 *   release (`element.set_release`, a `wf(bug): assign` commit) or has the approver close it (`memory reject`);
 * - AC 2 (red-first): `define-scope` states the low-severity reservation inside the 20 % fix-task share (D5);
 * - AC 3 (red-first): a `collect-feedback` phase at index 1, after `advance-pinned-build` (D2), reads the consumer
 *   inboxes as `retrospective.collect-feedback` does, with the same role and check; its read record is
 *   `rel-{release.version}-planning-feedback-triage.md`, the name the v0.4 planning wrote by hand;
 * - AC 4 (red-first, the version row): `version:` is 2.5 or later, its 2.5 entry names task-347 and dl-191 (a).
 *
 * Read **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, `workflowShowAtHead`, `git show HEAD:`), like
 * `test/core/workflow-patch-line-texts.test.ts`, whose `flat` and `historyEntryOf` helpers are copied here, not
 * imported. Prose is pinned as substrings of whitespace-flattened text; version pins are "≥" plus the history entry
 * naming the task (bug-314).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { resolveToken, tokenName } from '../../src/workflow/bindings';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const RELEASE_PLANNING_FILE = '.wingfoil/workflows/custom/release-planning.yaml';
const V04_READ_RECORD = 'docs/09_retrospectives/rl-v1/rel-v0.4-planning-feedback-triage.md';

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** Collapse every run of whitespace to one space. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** `version:` of a raw workflow file: the number and the rest of its line (the history comment). */
function versionLine(raw: string): { value: number; rest: string } {
  const match = /^version: "?(\d+\.\d+)"?(.*)$/m.exec(raw);
  if (!match) throw new Error('no version: line');
  return { value: Number(match[1]), rest: match[2] ?? '' };
}

/** The `;`- or `(prev`-delimited history segment naming `version` as a word and `task`. */
function historyEntryOf(rest: string, version: string, task: string): string | undefined {
  const word = new RegExp(`(^|[\\s(])${version.replace('.', '\\.')}([\\s):,]|$)`);
  return rest.split(/;|\(prev /).find((segment) => word.test(segment) && segment.includes(task));
}

function workflow(name: string): Workflow {
  const found = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === name);
  if (found === undefined) throw new Error(`${name} is not in the registry at HEAD`);
  return found;
}

/** The named phase; a missing one fails as an assertion on the phase names, not a thrown error. */
function phaseOf(wf: Workflow, name: string): Phase {
  expect(wf.phases.map((p) => p.name)).toContain(name);
  const found = wf.phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`${wf.name} has no phase '${name}' at HEAD`);
  return found;
}

const planning = (): Workflow => workflow('release-planning');

describe('task-347 AC 1 — release-planning sweeps the open bugs in triage-bugs and the unassigned triaged bugs in assign-bugs (dl-191 (a), D1 (b))', () => {
  it('red-first: the phases, in order, with collect-feedback after advance-pinned-build and assign-bugs after triage-bugs', () => {
    expect(planning().phases.map((p) => p.name)).toEqual([
      'advance-pinned-build',
      'collect-feedback',
      'define-scope',
      'triage-bugs',
      'assign-bugs',
      'reconcile-governance',
      'record-adrs',
      'identify-specs',
      'build-backlog',
      'commit-backlog',
    ]);
  });

  it('red-first: assign-bugs selects every triaged bug with an empty release; tech-lead, element.set_release, no approval', () => {
    const assign = phaseOf(planning(), 'assign-bugs');
    expect(assign.where).toEqual({ type: 'bug', status: ['triaged'], release: [''] });
    expect((assign.actions ?? []).map(tokenName)).toEqual(['element.set_release']);
    expect(assign.role).toBe('tech-lead');
    expect(assign.approval).toBeUndefined();
  });

  it("red-first: assign-bugs' description names dl-191 (a), the wf(bug): assign commit, and the close by memory reject (triaged -> closed)", () => {
    const text = flat(phaseOf(planning(), 'assign-bugs').description ?? '');
    for (const phrase of ['dl-191 (a)', '`wf(bug): assign`', '`memory reject`', 'triaged -> closed']) {
      expect(text).toContain(phrase);
    }
  });

  it("red-first: workflow show release-planning at HEAD resolves assign-bugs' action to a manual binding", () => {
    const shown = workflowShowAtHead(ROOT, 'release-planning');
    if (!shown.ok) throw new Error(`workflow show release-planning failed: ${shown.error.message}`);
    const assign = shown.value.workflow.phases.find((p) => p.name === 'assign-bugs');
    expect(assign?.actions.map((action) => [tokenName(action.token), action.binding.kind])).toEqual([['element.set_release', 'manual']]);
  });

  it("red-first: triage-bugs keeps its selection of open bugs and names the follow-up in assign-bugs (dl-191 (a))", () => {
    const triage = phaseOf(planning(), 'triage-bugs');
    expect(triage.where).toEqual({ type: 'bug', status: ['open'], release: ['', '{release.version}'] });
    const text = flat(triage.description ?? '');
    for (const phrase of ['dl-191 (a)', 'assign-bugs', 'unassigned past a planning']) {
      expect(text).toContain(phrase);
    }
  });
});

describe('task-347 AC 2 — define-scope reserves the low-severity share inside the 20 % (dl-191 (a), dl-100 §4 (b), D5)', () => {
  it("red-first: define-scope's description states at least 10 % of the task budget, rounded up, for low-severity bugs, oldest first by bug number", () => {
    const text = flat(phaseOf(planning(), 'define-scope').description ?? '');
    for (const phrase of [
      'Inside that 20 %',
      'at least 10 % of the task budget, rounded up',
      '`low`-severity',
      'oldest first by bug number',
      'dl-191 (a)',
    ]) {
      expect(text).toContain(phrase);
    }
    expect(text).toMatch(/20 %/);
  });
});

describe('task-347 AC 3 — release-planning declares collect-feedback as the retrospective does (dl-163 S3d, R11, D2)', () => {
  it('red-first: collect-feedback is phase 1, with retrospective.collect-feedback\'s role, agent.execute and no optional flag', () => {
    const phases = planning().phases;
    expect(phases.findIndex((p) => p.name === 'collect-feedback')).toBe(1);
    const collect = phaseOf(planning(), 'collect-feedback');
    expect(collect.role).toBe(phaseOf(workflow('retrospective'), 'collect-feedback').role);
    expect(collect.role).toBe('facilitator');
    expect((collect.actions ?? []).map(tokenName)).toEqual(['agent.execute']);
    expect(collect.optional).toBeFalsy();
  });

  it('red-first: its produces is the planning read record rel-{release.version}-planning-feedback-triage.md', () => {
    expect(phaseOf(planning(), 'collect-feedback').produces).toEqual([
      'docs/09_retrospectives/rl-{release.release-line}/rel-{release.version}-planning-feedback-triage.md',
    ]);
  });

  it("red-first: its checks.post equals retrospective.collect-feedback's, bound manual by the project", () => {
    const { bindings } = loadWorkflowRegistryAtHead(ROOT);
    const post = phaseOf(planning(), 'collect-feedback').checks?.post ?? [];
    expect(post).toEqual(phaseOf(workflow('retrospective'), 'collect-feedback').checks?.post);
    // task-358 (bug-435 item 4, W0-R10): retrospective's check is split into its mechanical half and its reading,
    // and this phase declares the same tokens, so it takes the same split.
    expect(post.map(tokenName)).toEqual(['feedback-notes.recorded', 'feedback-notes.restated']);
    for (const token of post) expect(resolveToken(token, 'check', bindings)).toEqual({ kind: 'manual', source: 'project' });
  });

  it('red-first: release-planning.yaml is at least 2.6, its 2.6 entry naming task-358 (bug-435 split, bug-314)', () => {
    const { value, rest } = versionLine(atHead(RELEASE_PLANNING_FILE));
    expect(value).toBeGreaterThanOrEqual(2.6);
    expect(historyEntryOf(rest, '2.6', 'task-358')).toBeDefined();
  });

  it("red-first: its description restates the read: active repository services with a feedback_inbox, the consumer's main, the commit read, the cite, the ruling before define-scope", () => {
    const text = flat(phaseOf(planning(), 'collect-feedback').description ?? '');
    for (const phrase of [
      'dl-163 S3d',
      'R11',
      '`active`',
      'kind `repository`',
      '`feedback_inbox`',
      "the consumer's `main`",
      'records the commit read for each',
      '<service id>/F-<nnn>@<sha>',
      'before define-scope',
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("the v0.4 planning's read record exists, which keeps minor-v0.4's iteration complete", () => {
    expect(existsSync(join(ROOT, V04_READ_RECORD))).toBe(true);
  });
});

describe('task-347 AC 4 — release-planning.yaml raises its version once (doc-versioning)', () => {
  it('red-first: version is 2.5 or later; its 2.5 entry names task-347 and dl-191 (a); its 2.4 entry still names task-305', () => {
    const { value, rest } = versionLine(atHead(RELEASE_PLANNING_FILE));
    expect(value).toBeGreaterThanOrEqual(2.5);
    const entry = historyEntryOf(rest, '2.5', 'task-347');
    expect(entry).toBeDefined();
    expect(entry).toContain('dl-191 (a)');
    expect(historyEntryOf(rest, '2.4', 'task-305')).toBeDefined();
  });
});
