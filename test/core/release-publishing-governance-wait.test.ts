/**
 * task-366 AC 6 (red-first; `dl-190` item 2 (c); design item 8, D8 (a) as ruled at the design gate) —
 * `release-publishing`'s `tag` waits for the required governance check: its pre-checks gain, last,
 * `governance-check-passed(kind: "{release.kind}", version: "{release.version}")`, bound in `bindings.yaml` to
 * `scripts/wait-governance-check.cjs` (a `run` binding at severity `reject`, the `on-integration-branch` binding's
 * `kind` and `version` patterns), and the phase's description names it. `release-publishing.yaml` ≥ 2.5 and
 * `bindings.yaml` ≥ 3.3, each history entry naming `task-366` and `dl-190`. The script's own behaviour is
 * `test/cli/wait-governance-check.test.ts`.
 *
 * As `test/core/workflow-integration-branch.test.ts` does: the workflow is read as `HEAD` holds it
 * (`loadWorkflowRegistryAtHead`, `git show HEAD:<path>` for the raw text), `bindings.yaml` from the working tree for its
 * raw text and at `HEAD` for `resolveToken`; prose pinned as substrings of whitespace-flattened text (task-276); version
 * pins "≥" plus the entry naming the task (bug-314). Each value compared comes from one parse.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { resolveToken } from '../../src/workflow/bindings';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const PUBLISHING_FILE = '.wingfoil/workflows/custom/release-publishing.yaml';
const TRANSCRIPT_PATH = 'docs/07_gates/rl-{release.release-line}/rel-{release.version}-staging-rehearsal.md';
const ON_INTEGRATION_BRANCH = 'on-integration-branch(kind: "{release.kind}", version: "{release.version}")';
const GOVERNANCE_CHECK_PASSED = 'governance-check-passed(kind: "{release.kind}", version: "{release.version}")';

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** Collapse every run of whitespace to one space. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** `version:` of a raw workflow / bindings file: major and minor, and the rest of its line (the history comment). */
function versionLine(raw: string): { major: number; minor: number; rest: string } {
  const match = /^version: "?(\d+)\.(\d+)"?(.*)$/m.exec(raw);
  if (!match) throw new Error('no version: line');
  return { major: Number(match[1]), minor: Number(match[2]), rest: match[3] ?? '' };
}

/** The history segment (split on `;` and `(prev `) that names `version` as a word and `task`. */
function historyEntry(rest: string, version: string, task: string): string | undefined {
  const word = new RegExp(`(^|[\\s(])${version.replace('.', '\\.')}([\\s):,]|$)`);
  return rest.split(/;|\(prev /).find((segment) => word.test(segment) && segment.includes(task));
}

function tagPhase(): Phase {
  const wf: Workflow | undefined = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'release-publishing');
  if (wf === undefined) throw new Error('release-publishing is not in the registry at HEAD');
  const phase = wf.phases.find((p) => p.name === 'tag');
  if (phase === undefined) throw new Error('release-publishing has no phase tag at HEAD');
  return phase;
}

describe('task-366 AC 6 — release-publishing `tag` waits for the required governance check (dl-190 (c))', () => {
  it('`tag` pre-checks the four existing entries, then governance-check-passed', () => {
    expect(tagPhase().checks?.pre).toEqual([
      ON_INTEGRATION_BRANCH,
      'phase-branch-merged-to-integration-branch',
      `staging-rehearsal-passed(transcript: ${TRANSCRIPT_PATH})`,
      `evidence-only-since-candidate(transcript: ${TRANSCRIPT_PATH})`,
      GOVERNANCE_CHECK_PASSED,
    ]);
  });

  it("`tag`'s description names governance-check-passed", () => {
    expect(flat(tagPhase().description ?? '')).toContain('governance-check-passed');
  });

  it('release-publishing.yaml is 2.5 or later, with a 2.5 entry naming task-366 and dl-190', () => {
    const { major, minor, rest } = versionLine(atHead(PUBLISHING_FILE));
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(2005);
    const entry = historyEntry(rest, '2.5', 'task-366');
    expect(entry).toBeDefined();
    expect(entry).toContain('dl-190');
  });

  describe('bindings.yaml binds governance-check-passed to scripts/wait-governance-check.cjs', () => {
    const raw = readFileSync(join(ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8');
    const bindings = yamlLoad(raw) as {
      checks: Record<string, { run: string[]; severity?: string; args?: Record<string, string> }>;
    };

    it('runs the script with the kind and version, at severity reject, with the on-integration-branch patterns', () => {
      expect(bindings.checks['governance-check-passed']).toEqual({
        run: ['node', 'scripts/wait-governance-check.cjs', '--kind', '{kind}', '--version', '{version}'],
        severity: 'reject',
        args: bindings.checks['on-integration-branch']?.args,
      });
      expect(Object.keys(bindings.checks['on-integration-branch']?.args ?? {})).toEqual(['kind', 'version']);
    });

    it('the pre-check token resolves to a run binding of that command', () => {
      const { bindings: atHeadBindings } = loadWorkflowRegistryAtHead(ROOT);
      const resolved = resolveToken(GOVERNANCE_CHECK_PASSED, 'check', atHeadBindings);
      expect(resolved.kind).toBe('run');
      expect(resolved.kind === 'run' ? resolved.argv : []).toContain('scripts/wait-governance-check.cjs');
    });

    it('`version:` is 3.3 or later, with a 3.3 entry naming task-366 and dl-190', () => {
      const { major, minor, rest } = versionLine(raw);
      expect(major * 1000 + minor).toBeGreaterThanOrEqual(3003);
      const entry = historyEntry(rest, '3.3', 'task-366');
      expect(entry).toBeDefined();
      expect(entry).toContain('dl-190');
    });
  });
});
