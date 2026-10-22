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

import { loadWorkflowRegistryAtHead } from '../../src/core';
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
