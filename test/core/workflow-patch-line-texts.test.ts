/**
 * task-291 (`dl-185` C4 (i)) — two workflow texts name the release's integration branch where they said `main`:
 * `release-health.yaml`'s `measure` names the measurement point as the tag, else the commit carrying `released` on
 * the release's integration branch (`main` for a minor, `release/X.Y` for a patch); `release-planning.yaml`'s
 * `advance-pinned-build` says the in-flight release merges the patch's line forward after a patch tag.
 *
 * Workflow files are read **as `HEAD` holds them** (`loadWorkflowRegistryAtHead`; `git show HEAD:<path>` for the
 * version line), like `test/core/workflow-integration-branch.test.ts`, whose helpers are copied here, not
 * imported. Prose is pinned as substrings of whitespace-flattened text, never by line (task-276); every absence
 * sits beside a positive; version pins are "≥" plus the history entry naming task-291 (bug-314). AC 3 is red-first
 * (design D2, reclassified: the sentences are not written yet); the `wingfoil-cli` re-check sentence is kept
 * (characterization, pinned by `test/directives/wingfoil-cli.test.ts` too).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead, loadWorkflowRegistryAtRev } from '../../src/core';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const CUSTOM = '.wingfoil/workflows/custom';
const RELEASE_HEALTH_FILE = `${CUSTOM}/release-health.yaml`;
const RELEASE_PLANNING_FILE = `${CUSTOM}/release-planning.yaml`;

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

/**
 * The history entry of `version` in a version-line comment: the first `;`- or `(prev`-delimited segment that
 * names `version` as a word and `task-291`.
 */
function historyEntry(rest: string, version: string): string | undefined {
  const word = new RegExp(`(^|[\\s(])${version.replace('.', '\\.')}([\\s):,]|$)`);
  return rest.split(/;|\(prev /).find((segment) => word.test(segment) && segment.includes('task-291'));
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

describe('task-291 AC 3 — release-health `measure` names the integration branch (dl-185 C4 (i))', () => {
  it("measure's description: the commit carrying `released` on the release's integration branch, not on main", () => {
    const text = flat(phaseOf(workflow('release-health'), 'measure').description ?? '');
    expect(text).toContain(
      "the commit carrying the release's `released` transition on the release's integration branch (`main` for a minor, `release/X.Y` for a patch",
    );
    expect(text).toContain('dl-185 C4 (i)');
    expect(text).not.toContain('the commit on main carrying');
  });

  it('release-health.yaml is version 1.2 or later; its 1.2 entry names task-291', () => {
    const { value, rest } = versionLine(atHead(RELEASE_HEALTH_FILE));
    expect(value).toBeGreaterThanOrEqual(1.2);
    expect(historyEntry(rest, '1.2')).toBeDefined();
  });
});

describe('task-291 AC 3 — release-planning `advance-pinned-build` merges the patch line forward (dl-185 C4 (i))', () => {
  it("advance-pinned-build's description: the in-flight release merges the patch's line forward, release/X.Y into main", () => {
    const text = flat(phaseOf(workflow('release-planning'), 'advance-pinned-build').description ?? '');
    expect(text).toContain("merges the patch's line forward after the patch's tag");
    expect(text).toContain('`release/X.Y` into `main`, never back');
    expect(text).toContain('dl-185 C4 (i)');
    expect(text).not.toContain("merges `main` after the patch's tag");
  });

  it('advance-pinned-build keeps the wingfoil-cli re-check (characterization)', () => {
    const text = flat(phaseOf(workflow('release-planning'), 'advance-pinned-build').description ?? '');
    expect(text).toContain('re-checks the `wingfoil-cli` directive (dl-163 S3e)');
  });

  it('release-planning.yaml is version 2.3 or later; its 2.3 entry names task-291', () => {
    const { value, rest } = versionLine(atHead(RELEASE_PLANNING_FILE));
    expect(value).toBeGreaterThanOrEqual(2.3);
    expect(historyEntry(rest, '2.3')).toBeDefined();
  });
});

/**
 * task-305 (`dl-206` Q1 (i), Q2 (i); `dl-159` A2 item 5; `bug-429`; release-planning v0.3.2 R8) — AC 2, red-first
 * (design D1, approver-accepted): `triage-bugs` and `define-scope` name the eligibility test of a `kind: patch`
 * release, `git log --no-merges release/X.Y..main -- <file>` (`--no-merges` per R8, design D5 (a)), and the
 * re-capture of an element that exists only on `main`; `advance-pinned-build` states the pin per line (a patch line
 * pins only its own X.Y; the merge forward keeps `main`'s pin, D3 (a)), that each pin advance updates only the
 * project-status sentence of `AGENTS.md` §1 (D4 (a)), and that its check needs the line's own `node_modules`
 * (design gate D6, F2). The task-291 sentences of `advance-pinned-build` stay (characterization, above and below).
 * The three phases' `checks` are unchanged against the design's read commit (the conformance suites list their
 * tokens). Version pin: ">= 2.4" plus the 2.4 entry naming task-305 (bug-314), the 2.3 entry still naming task-291.
 */
const DESIGN_READ_REV = '0fcb59ee8e69bcba30d547aa2156670b4f603b4b';

/** The `;`- or `(prev`-delimited history segment naming `version` as a word and `task`. */
function historyEntryOf(rest: string, version: string, task: string): string | undefined {
  const word = new RegExp(`(^|[\\s(])${version.replace('.', '\\.')}([\\s):,]|$)`);
  return rest.split(/;|\(prev /).find((segment) => word.test(segment) && segment.includes(task));
}

function phaseAtRev(rev: string, wfName: string, name: string): Phase {
  const wf = loadWorkflowRegistryAtRev(ROOT, rev).workflows.find((w) => w.name === wfName);
  if (wf === undefined) throw new Error(`${wfName} is not in the registry at ${rev}`);
  const found = wf.phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`${wfName} has no phase '${name}' at ${rev}`);
  return found;
}

describe('task-305 AC 2 — release-planning names the patch eligibility test and the pin per line (dl-206, dl-159 A2 item 5)', () => {
  for (const name of ['triage-bugs', 'define-scope']) {
    it(`${name}'s description: a \`kind: patch\` release's eligibility test with --no-merges, and the re-capture (dl-206 Q1 (i), Q2 (i))`, () => {
      const text = flat(phaseOf(workflow('release-planning'), name).description ?? '');
      expect(text).toContain('`kind: patch`');
      expect(text).toContain('`git log --no-merges release/X.Y..main -- <file>`');
      expect(text).toContain('dl-206 Q2 (i)');
      expect(text).toContain('dl-206 Q1 (i)');
      expect(text).not.toContain('`git log release/X.Y..main -- <file>`');
    });
  }

  it("advance-pinned-build's description: the pin per line as ruled — a patch line pins only its own X.Y, the merge forward keeps main's pin", () => {
    const text = flat(phaseOf(workflow('release-planning'), 'advance-pinned-build').description ?? '');
    expect(text).toContain('dl-159 A2 item 5');
    expect(text).toContain('a patch line pins only published versions of its own X.Y');
    expect(text).toContain("the merge forward keeps `main`'s pin");
    expect(text).toContain('git-conventions §1 rule 5');
    expect(text).not.toContain('not ruled');
  });

  it("advance-pinned-build's description: each pin advance updates the project-status sentence of AGENTS.md §1, and only that sentence", () => {
    const text = flat(phaseOf(workflow('release-planning'), 'advance-pinned-build').description ?? '');
    expect(text).toContain('the project-status sentence of `AGENTS.md` §1, and only that sentence');
  });

  it("advance-pinned-build's description: the check needs the line's own node_modules, npm ci in the release worktree (design gate D6, F2)", () => {
    const text = flat(phaseOf(workflow('release-planning'), 'advance-pinned-build').description ?? '');
    expect(text).toContain('node_modules');
    expect(text).toContain('npm ci');
    expect(text).toContain('release worktree');
  });

  it("advance-pinned-build keeps task-291's merge-forward sentence and the wingfoil-cli re-check (characterization)", () => {
    const text = flat(phaseOf(workflow('release-planning'), 'advance-pinned-build').description ?? '');
    expect(text).toContain("merges the patch's line forward after the patch's tag");
    expect(text).toContain('`release/X.Y` into `main`, never back');
    expect(text).toContain('dl-185 C4 (i)');
    expect(text).toContain('re-checks the `wingfoil-cli` directive (dl-163 S3e)');
  });

  it("the checks of advance-pinned-build, define-scope and triage-bugs are unchanged since the design's read (characterization)", () => {
    const wf = workflow('release-planning');
    for (const name of ['advance-pinned-build', 'define-scope', 'triage-bugs']) {
      expect(phaseOf(wf, name).checks).toEqual(phaseAtRev(DESIGN_READ_REV, 'release-planning', name).checks);
    }
  });

  it('release-planning.yaml is version 2.4 or later; its 2.4 entry names task-305 and its 2.3 entry still names task-291', () => {
    const { value, rest } = versionLine(atHead(RELEASE_PLANNING_FILE));
    expect(value).toBeGreaterThanOrEqual(2.4);
    expect(historyEntryOf(rest, '2.4', 'task-305')).toBeDefined();
    expect(historyEntryOf(rest, '2.3', 'task-291')).toBeDefined();
  });
});
