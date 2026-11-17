/**
 * task-303 — this repository binds the prose checks a human confirms on purpose `manual: true` (`dl-186` Q6,
 * `dl-172` (a); `spec-003-workflows-yaml-schema` Layer 3, `spec-017` §12). Its design gate's D1 (a) left the checks a
 * deterministic command could decide unbound; task-358's gate (approver ruling D1 (B), `bug-469`) superseded that for
 * them: each is bound `run` when a command decides it, otherwise `manual: true` in a group of its own, "manual until a
 * command" (D4: `phase-branch-merged-to-integration-branch` among them). The two groups and the `run` set are pinned in
 * `test/core/workflow-bindings-complete.test.ts`, from `test/core/helpers/manual-binding-groups.ts`.
 *
 * - AC 1 (task-358 edit): each of the 44 names task-303 left unbound is now bound — `manual: true` until a command, or
 *   `run` (`retrospective.present`) — or no longer occurs in any workflow (the twelve `e2e-smoke` and `agent-docs`
 *   prose checks `e2e-smoke.scenario`, `mcp.registered` and `agents-md.current` replace, `bug-435`).
 * - AC 2 (task-358 edit): of the 17 names task-303 bound manual, the 15 still declared resolve manual and the two mixed
 *   keys, split into their halves, occur in no workflow; the check occurrences resolving manual at `HEAD` carry exactly
 *   the 56 names of the two groups (55 at task-358, 56 with task-359's `downcast.in-scope`); the registry raises no
 *   warning (68 → 0); `bindings.yaml` keeps task-303's 2.6 entry.
 * - AC 3 (characterization): `demo.rendered` is pinned in `test/docs/presentation.test.ts` and
 *   `test/core/workflow-manual-check.test.ts`; here it is one of the "manual on purpose" names.
 *
 * Every registry read is the configuration **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, task-194).
 * Deterministic: workflows in manifest `include` order, phases in declared order, `pre` before `post`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { resolveToken, tokenName } from '../../src/workflow/bindings';

import { MANUAL_ON_PURPOSE, MANUAL_UNTIL_A_COMMAND } from './helpers/manual-binding-groups';

const ROOT = join(__dirname, '..', '..');
const BINDINGS = '.wingfoil/workflows/bindings.yaml';

/** The 17 check names task-303 bound `manual: true` (its design table, class i; D1 (a)). */
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

/** The 44 check names task-303 left unbound (its design table, classes ii and iii; D1 (a), D2 (a)), as `tokenName` cuts them. */
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

/** The names task-358 replaced with `e2e-smoke.scenario`, `mcp.registered` and `agents-md.current` (bug-435, D3 (a)). */
const REPLACED_BY_TASK_358 = [
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
] as const;

/** The two mixed keys task-358 split into their halves (bug-435 item 4). */
const SPLIT_BY_TASK_358 = [
  '100% of MVP Canvas features covered; edge-case stories present',
  '100% of MVP Canvas features included; edge-case stories generated',
] as const;

/** The `tokenName` of every check occurrence (pre, then post) of every workflow at `HEAD`. */
function checkNamesAtHead(): string[] {
  const { workflows } = loadWorkflowRegistryAtHead(ROOT);
  return workflows.flatMap((workflow) => workflow.phases.flatMap((phase) => [...(phase.checks?.pre ?? []), ...(phase.checks?.post ?? [])].map(tokenName)));
}

/** The distinct `tokenName`s of the check occurrences whose binding resolves `manual`, sorted. */
function manualCheckNames(): string[] {
  const { workflows, bindings } = loadWorkflowRegistryAtHead(ROOT);
  const names = new Set<string>();
  for (const workflow of workflows) {
    for (const phase of workflow.phases) {
      for (const token of [...(phase.checks?.pre ?? []), ...(phase.checks?.post ?? [])]) {
        if (resolveToken(token, 'check', bindings).kind === 'manual') names.add(tokenName(token));
      }
    }
  }
  return [...names].sort();
}

describe('task-303 AC 1, as task-358 changed it — the checks task-303 left unbound are bound or gone (bug-469, D1 (B))', () => {
  const { bindings } = loadWorkflowRegistryAtHead(ROOT);
  const used = new Set(checkNamesAtHead());

  it('the list holds 44 distinct names, none of them one of the 17 task-303 bound manual', () => {
    expect(new Set(UNBOUND_NAMES).size).toBe(44);
    expect(new Set(MANUAL_NAMES).size).toBe(17);
    expect(UNBOUND_NAMES.filter((name) => (MANUAL_NAMES as readonly string[]).includes(name))).toEqual([]);
  });

  it('the 44 split into 31 manual until a command, retrospective.present bound run, and 12 replaced', () => {
    const until = UNBOUND_NAMES.filter((name) => (MANUAL_UNTIL_A_COMMAND as readonly string[]).includes(name));
    const replaced = UNBOUND_NAMES.filter((name) => (REPLACED_BY_TASK_358 as readonly string[]).includes(name));
    expect([until.length, replaced.length]).toEqual([31, 12]);
    expect(UNBOUND_NAMES.filter((name) => !until.includes(name) && !(replaced as readonly string[]).includes(name))).toEqual(['retrospective.present']);
  });

  it.each(UNBOUND_NAMES.map((name) => [name]))('%s no longer resolves unbound where a workflow uses it', (name) => {
    if ((REPLACED_BY_TASK_358 as readonly string[]).includes(name)) {
      expect(used.has(name)).toBe(false);
    } else {
      expect(resolveToken(name, 'check', bindings).kind).toBe(name === 'retrospective.present' ? 'run' : 'manual');
    }
  });
});

describe('task-303 AC 2, as task-358 changed it — the manual bindings (dl-186 Q6, D1 (B))', () => {
  it('the 15 names task-303 bound manual that still exist resolve manual; its two mixed keys occur in no workflow', () => {
    const { bindings } = loadWorkflowRegistryAtHead(ROOT);
    const used = new Set(checkNamesAtHead());
    const kept = MANUAL_NAMES.filter((name) => !(SPLIT_BY_TASK_358 as readonly string[]).includes(name));
    expect(kept.length).toBe(15);
    expect(kept.filter((name) => resolveToken(name, 'check', bindings).kind !== 'manual')).toEqual([]);
    expect(SPLIT_BY_TASK_358.filter((name) => used.has(name))).toEqual([]);
  });

  it('the check occurrences resolving manual at HEAD carry exactly the 56 names of the two groups', () => {
    expect(manualCheckNames()).toEqual([...MANUAL_UNTIL_A_COMMAND, ...MANUAL_ON_PURPOSE].sort());
  });

  it('the registry warns no more (86 → 65 at task-303, 68 with task-349\'s gate.slot-free, 0 at task-358)', () => {
    const diagnostics = loadWorkflowRegistryAtHead(ROOT).diagnostics as readonly Diag[];
    expect(diagnostics).toEqual([]);
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
