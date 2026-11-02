/**
 * task-303 — this repository binds the prose checks a human confirms on purpose `manual: true` (`dl-186` Q6,
 * `dl-172` (a); `spec-003-workflows-yaml-schema` Layer 3, `spec-017` §12). The rule is the design gate's D1 (a): a
 * check is manual only when its condition is a reading or a judgement no program can decide; a check a
 * deterministic command could decide stays unbound (a `W_WORKFLOW_UNBOUND_TOKEN` warning), even when that command
 * does not exist yet (D2 (a): `phase-branch-merged-to-integration-branch` among them).
 *
 * - AC 1 (characterization): each of the 44 names the design classifies as decidable resolves unbound at `HEAD`
 *   (passes before and after the binding change). The reason each manual check is confirmed by hand is reviewed
 *   in the task's Execution Notes and the comments of `bindings.yaml`, not tested.
 * - AC 2 (red-first): the manual check occurrences at `HEAD` are exactly the 21 of the 17 names this task binds
 *   plus `demo.rendered` (`task-298`); the registry's warnings fall from 86 to 65, every one an unbound check and
 *   none naming a manual check; `bindings.yaml` is bumped to at least 2.6 with a `task-303` history entry numbered
 *   at least 2.6 ("at least", bug-314). The warning list itself is pinned in
 *   `test/core/workflow-repository-conformance.test.ts`, edited with `bindings.yaml` (`task-298` D1 (a)).
 * - AC 3 (characterization): `demo.rendered` is pinned in `test/docs/presentation.test.ts` and
 *   `test/core/workflow-manual-check.test.ts`; here it is one of the 22 rows, at its path.
 *
 * Every registry read is the configuration **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, task-194).
 * Deterministic: workflows in manifest `include` order, phases in declared order, `pre` before `post`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { resolveToken, tokenName } from '../../src/workflow/bindings';

const ROOT = join(__dirname, '..', '..');
const BINDINGS = '.wingfoil/workflows/bindings.yaml';

/** The 17 check names this task binds `manual: true` (design table, class i; D1 (a)). */
const MANUAL_NAMES = [
  '100% of MVP Canvas features covered; edge-case stories present',
  'each scenario atomic + testable; zero ambiguous adjectives/adverbs',
  'every REQ has a numeric/percentage/boolean Fit Criterion',
  '100% of MVP Canvas features included; edge-case stories generated',
  'each story has >=1 happy path and >=1 edge/error path',
  'no ambiguous adjectives/adverbs',
  'each scenario atomic and testable',
  'every REQ has a clearly numeric, percentage-based, or boolean Fit Criterion',
  'spec-review.passed',
  'the wingfoil-cli directive re-checked against the new pin',
  'acceptance-criteria.consistent',
  'claims.rerun',
  'rereview.previous-reject',
  "user-facing docs aligned with the release's shipped CLI/feature surface",
  'secondary-sources.listed',
  'feedback-notes.recorded',
  'proposals.disposed',
] as const;

/** The 44 check names that stay unbound (design table, classes ii and iii; D1 (a), D2 (a)), as `tokenName` cuts them. */
const UNBOUND_NAMES = [
  'frontmatter.required',
  'secret-scan.clean',
  'change-proposal.target_release is not empty',
  'valid JSON; no duplicate IDs; no circular dependencies',
  'valid JSON parse',
  'no duplicate IDs',
  'no circular dependencies',
  'all releases where release-line={release-line.version} are status',
  '`npm run -s wingfoil -- --version` == the version package.json pins',
  'new pin >= old pin, and `npm view wingfoil versions` lists it',
  'the switch commit changes only package.json and package-lock.json',
  'change-proposals.swept',
  'ready-decision-logs.covered',
  'task.wave.declared',
  'waves.declared',
  'docs.examples.passing',
  'stop-the-line.clear',
  'growth.clear',
  'tech-spec.approved',
  'depends_on.acknowledged',
  'tests.exist',
  'tests.failing',
  'tests.unchanged',
  'retrospective.present',
  'all tasks where tags=[{release.version}] are status',
  'AGENTS.md project status matches the shipped command surface',
  'AGENTS.md element/state tables match memory.yaml',
  'AGENTS.md workflow list matches workflows.yaml',
  'AGENTS.md role-directive bindings match roles.yaml',
  'CLAUDE.md is a pointer that imports AGENTS.md',
  'exit-code-zero',
  'scaffolded dna.yaml/memory.yaml/directives round-trip their own loaders',
  'every step exits with the code it declares, per spec-005-cli-command-contract',
  'every artifact a command wrote re-loads through its own reader after the last writer, with its content asserted',
  'the working tree is clean after every step',
  'registered server version == package.json pin',
  'advertised channel set == EXPECTED_CHANNELS, every advertised list answers, every listed Resource reads and Prompt gets except a declared KNOWN_READ_FAILURES entry, on the pinned build and the build under development',
  'all bugs where tags=[{release.version}] are status',
  'phase-branch-merged-to-integration-branch',
  'staged version approved on npm, installable from the npm registry once its tarball answers HTTP 200, its GitHub Release created with the test reports attached and its MCP Registry listing published',
  'every catalogue metric has a value or an explicit not-measurable reason',
  'every regressed metric and every breached floor has a finding',
  "every finding is tracked by an element or carries an RH proposal in the report's Proposals section",
  'deprecated content excluded from agent context and default search',
] as const;

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

/** `[workflow, path, tokenName]` of every check occurrence (pre, then post) whose binding resolves `manual`. */
function manualCheckRows(): [string, string, string][] {
  const { workflows, bindings } = loadWorkflowRegistryAtHead(ROOT);
  const rows: [string, string, string][] = [];
  for (const workflow of workflows) {
    workflow.phases.forEach((phase, p) => {
      for (const when of ['pre', 'post'] as const) {
        (phase.checks?.[when] ?? []).forEach((token, i) => {
          if (resolveToken(token, 'check', bindings).kind === 'manual') {
            rows.push([workflow.name, `phases[${p}].checks.${when}[${i}]`, tokenName(token)]);
          }
        });
      }
    });
  }
  return rows;
}

describe('task-303 AC 1 — the checks a command can assert stay unbound (characterization, D1 (a), D2 (a))', () => {
  const { bindings } = loadWorkflowRegistryAtHead(ROOT);

  it('the list holds 44 distinct names, none of them one of the 17 bound manual', () => {
    expect(new Set(UNBOUND_NAMES).size).toBe(44);
    expect(new Set(MANUAL_NAMES).size).toBe(17);
    expect(UNBOUND_NAMES.filter((name) => (MANUAL_NAMES as readonly string[]).includes(name))).toEqual([]);
  });

  it.each(UNBOUND_NAMES.map((name) => [name]))('%s resolves { kind: unbound, source: none } at HEAD', (name) => {
    expect(resolveToken(name, 'check', bindings)).toEqual({ kind: 'unbound', source: 'none' });
  });
});

describe('task-303 AC 2 — the prose checks a human confirms are bound manual: true (red-first, dl-186 Q6)', () => {
  it('the manual check occurrences at HEAD are exactly the 21 this task binds plus demo.rendered (task-298), in registry order', () => {
    expect(manualCheckRows()).toEqual([
      ['specification-downcast', 'phases[0].checks.post[0]', '100% of MVP Canvas features covered; edge-case stories present'],
      ['specification-downcast', 'phases[1].checks.post[0]', 'each scenario atomic + testable; zero ambiguous adjectives/adverbs'],
      ['specification-downcast', 'phases[2].checks.post[0]', 'every REQ has a numeric/percentage/boolean Fit Criterion'],
      ['user-story-mapping', 'phases[2].checks.post[0]', '100% of MVP Canvas features included; edge-case stories generated'],
      ['specification-by-examples', 'phases[1].checks.post[0]', 'each story has >=1 happy path and >=1 edge/error path'],
      ['specification-by-examples', 'phases[1].checks.post[1]', 'no ambiguous adjectives/adverbs'],
      ['specification-by-examples', 'phases[1].checks.post[2]', 'each scenario atomic and testable'],
      ['volere-requirements', 'phases[2].checks.post[0]', 'every REQ has a clearly numeric, percentage-based, or boolean Fit Criterion'],
      ['initial-design', 'phases[1].checks.pre[0]', 'spec-review.passed'],
      ['initial-design', 'phases[3].checks.pre[0]', 'spec-review.passed'],
      ['release-planning', 'phases[0].checks.post[2]', 'the wingfoil-cli directive re-checked against the new pin'],
      ['release-planning', 'phases[4].checks.pre[0]', 'spec-review.passed'],
      ['release-planning', 'phases[5].checks.pre[0]', 'spec-review.passed'],
      ['release-planning', 'phases[6].checks.post[1]', 'acceptance-criteria.consistent'],
      ['dev-loop', 'phases[1].checks.post[3]', 'acceptance-criteria.consistent'],
      ['dev-loop', 'phases[5].checks.pre[1]', 'claims.rerun'],
      ['dev-loop', 'phases[5].checks.pre[2]', 'rereview.previous-reject'],
      ['user-docs', 'phases[1].checks.post[0]', "user-facing docs aligned with the release's shipped CLI/feature surface"],
      ['user-docs', 'phases[1].checks.post[2]', 'demo.rendered'],
      ['retrospective', 'phases[0].checks.post[0]', 'secondary-sources.listed'],
      ['retrospective', 'phases[1].checks.post[0]', 'feedback-notes.recorded'],
      ['retrospective', 'phases[2].checks.pre[0]', 'proposals.disposed'],
    ]);
  });

  it('the registry warns 65 times (86 → 65), every warning an unbound check, none naming a check bound manual', () => {
    const diagnostics = loadWorkflowRegistryAtHead(ROOT).diagnostics as readonly Diag[];
    expect(diagnostics.length).toBe(65);
    expect(diagnostics.filter((d) => d.code !== 'W_WORKFLOW_UNBOUND_TOKEN' || d.severity !== 'warning')).toEqual([]);
    const tokens = diagnostics.map((d) => tokenName(/token '(.*)' has no/.exec(d.message)![1]!));
    expect(tokens.filter((name) => (MANUAL_NAMES as readonly string[]).includes(name))).toEqual([]);
  });

  it('bindings.yaml is bumped to at least 2.6, with a task-303 history entry numbered at least 2.6 (bug-314)', () => {
    const line = /^version:.*$/m.exec(readFileSync(join(ROOT, BINDINGS), 'utf8'))![0];
    expect(Number(/^version:\s*"?([0-9.]+)/.exec(line)![1])).toBeGreaterThanOrEqual(2.6);
    // Each `;`-separated segment of the version comment opens with its own version number.
    const entries = line
      .replace(/^version:[^#]*#/, '')
      .split(';')
      .map((segment) => /^\s*(\d+\.\d+)\b/.exec(segment))
      .filter((match): match is RegExpExecArray => match !== null && match.input.includes('task-303'))
      .map((match) => Number(match[1]));
    expect(entries.length > 0 ? Math.max(...entries) : Number.NaN).toBeGreaterThanOrEqual(2.6);
  });
});
