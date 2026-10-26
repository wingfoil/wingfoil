/**
 * task-199 — this repository's workflows, aligned with the v0.3 schema and commands (spec-003 Consequences,
 * open question 6; spec-017 §12; `dl-104` Action 2; `dl-090` Actions 3–4; `dl-025`; `bug-224`).
 *
 * Every assertion reads the configuration **as `HEAD` holds it**, through task-194's
 * `loadWorkflowRegistryAtHead` (the registry plus the core checks), so a regression in the committed files,
 * the loader or the core checks is caught, and a dirty working tree changes nothing.
 *
 * - AC 1 (red-first): zero errors, and the exact remaining warning set (code, file, path; for
 *   `W_WORKFLOW_UNBOUND_TOKEN` the token), spec-017 §12's last paragraph.
 * - AC 2 (red-first): no `W_PHASE_PRODUCES_OWNER_IMPLICIT`, `W_PHASE_TOKEN_OUT_OF_SCOPE` or
 *   `W_PHASE_ACTION_UNTARGETED`; no action token is unbound — the unbound tokens left are checks only, each
 *   listed with its reason in the task's Execution Notes.
 * - AC 3 (characterization): every `agent.*` step resolves to `wingfoil agent execute`, every
 *   `set_state` / `sync_state` to a `manual` step whose commit verb is one of `dl-079` (A)'s list (task-126).
 * - AC 4 (red-first): spec-017 §12's deduction consequences re-measured — the checkpoint phases and the
 *   approvals recorded by `workflow finalize`, and the `{ type, path }` owner of each rewritten `produces`.
 * - AC 6 (red-first): `release-line-cycle` runs the same `align-agent-docs` phase as `user-docs` (`dl-025`).
 * - task-303 (`dl-186` Q6): the prose checks a human confirms on purpose are bound `manual: true`, so the warning set
 *   keeps only the checks a command could decide (86 → 65).
 * - task-301 AC 2 / AC 3 (red-first, `bug-389`): the eleven phases of the four specification sub-workflows declare
 *   their module's output directory as `produces`, so they leave the checkpoint list (28 → 17).
 * - `dl-153` (A): the first `workflows/bindings.yaml` carries `format: 1`; `tests.coverage(min: N)` restates
 *   `jest.config.js`'s threshold, which its binding cannot pass.
 *
 * Deterministic: the registry is walked in manifest `include` order, phases in declared order.
 */
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { MEMORY_OPERATIONS } from '../../src/memory/audit';
import { isBuiltinToken, resolveToken, tokenName, type BindingsYaml } from '../../src/workflow/bindings';
import type { Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

function registry(): { workflows: readonly Workflow[]; bindings: BindingsYaml | null; diagnostics: Diag[] } {
  const loaded = loadWorkflowRegistryAtHead(ROOT);
  return { workflows: loaded.workflows, bindings: loaded.bindings, diagnostics: [...(loaded.diagnostics as Diag[])] };
}

/** `[workflow, path, code-or-unbound-token]`: the workflow file's stem, the diagnostic path, and the code — or, for an unbound token, the token. */
type Row = [string, string, string];

function rows(diagnostics: readonly Diag[]): Row[] {
  return diagnostics.map((d) => {
    const stem = d.file.replace(/^workflows\/custom\//, '').replace(/\.yaml$/, '');
    if (d.code !== 'W_WORKFLOW_UNBOUND_TOKEN') return [stem, d.path, d.code];
    const token = /token '(.*)' has no/.exec(d.message)![1]!;
    return [stem, d.path, token];
  });
}

describe('AC 1 / AC 2 — every workflow loads at HEAD with zero errors and only the deliberate warnings', () => {
  it('zero errors; the only warnings left are unbound checks (each with a reason in the notes), in spec-003 order', () => {
    const { diagnostics } = registry();
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    // task-303 (dl-186 Q6, dl-172 (a)): the 17 prose checks a human confirms on purpose (21 occurrences) are bound
    // `manual: true` in bindings.yaml 2.6; the 65 left are the checks a command could decide (spec-017 §12).
    expect(rows(diagnostics)).toEqual([
      ["sw-life-cycle", "phases[3].checks.post[0]", "frontmatter.required"],
      ["bug-ingest", "phases[0].checks.post[0]", "frontmatter.required"],
      ["decision-log-ingest", "phases[0].checks.post[0]", "frontmatter.required"],
      ["adr-ingest", "phases[0].checks.post[0]", "frontmatter.required"],
      ["service-ingest", "phases[0].checks.post[0]", "frontmatter.required"],
      ["service-ingest", "phases[0].checks.post[1]", "secret-scan.clean"],
      // task-212 (dl-132): vision-change's capture mirrors the change-proposal template; its vision-index.current checks are bound.
      ["vision-change", "phases[0].checks.post[0]", "frontmatter.required"],
      ["vision-change", "phases[6].checks.pre[0]", "change-proposal.target_release is not empty"],
      ["specification-downcast", "phases[3].checks.post[0]", "valid JSON; no duplicate IDs; no circular dependencies"],
      ["backlog-export", "phases[2].checks.post[0]", "valid JSON parse"],
      ["backlog-export", "phases[2].checks.post[1]", "no duplicate IDs"],
      ["backlog-export", "phases[2].checks.post[2]", "no circular dependencies"],
      ["initial-design", "phases[0].checks.post[0]", "frontmatter.required"],
      ["initial-design", "phases[1].checks.post[0]", "frontmatter.required"],
      ["initial-design", "phases[2].checks.post[0]", "frontmatter.required"],
      ["initial-design", "phases[3].checks.post[0]", "frontmatter.required"],
      ["release-line-cycle", "phases[4].checks.pre[0]", "all releases where release-line={release-line.version} are status"],
      ["release-line-cycle", "phases[4].checks.post[0]", "frontmatter.required"],
      ["release-planning", "phases[0].checks.pre[0]", "`npm run -s wingfoil -- --version` == the version package.json pins"],
      ["release-planning", "phases[0].checks.post[0]", "new pin >= old pin, and `npm view wingfoil versions` lists it"],
      ["release-planning", "phases[0].checks.post[1]", "the switch commit changes only package.json and package-lock.json"],
      ["release-planning", "phases[1].checks.post[0]", "frontmatter.required"],
      // task-277 (approver ruling 2026-10-12 D1 (c)): define-scope's sweep of the scheduled change-proposals, bound later under dl-166 Q2 (ii).
      ["release-planning", "phases[1].checks.post[1]", "change-proposals.swept"],
      // task-230 (dl-100 §1, approver ruling 2026-10-12 D2): the coverage of the ready decision-logs, read by the product-owner.
      ["release-planning", "phases[3].checks.post[0]", "ready-decision-logs.covered"],
      ["release-planning", "phases[4].checks.post[0]", "frontmatter.required"],
      ["release-planning", "phases[5].checks.post[0]", "frontmatter.required"],
      ["release-planning", "phases[6].checks.post[0]", "frontmatter.required"],
      // task-230 (dl-102 §2): build-backlog's criteria check is bound manual (task-303); (dl-100 §2) commit-backlog's backlog_committed.
      // task-230 review F1: each task's wave is listed; commit-backlog's waves is a non-empty list.
      ["release-planning", "phases[6].checks.post[2]", "task.wave.declared"],
      ["release-planning", "phases[7].checks.pre[0]", "frontmatter.required"],
      ["release-planning", "phases[7].checks.pre[1]", "waves.declared"],
      // task-230 (dl-133 §2): no single command runs the docs/examples scripts (docs/examples/README.md).
      ["wave", "phases[1].checks.post[1]", "docs.examples.passing"],
      // task-221 (dl-133 Q4 (i)): the stop-the-line check reads memory.yaml's rule; no command asserts it yet.
      ["dev-loop", "phases[0].checks.pre[0]", "stop-the-line.clear"],
      // task-230 (dl-100 §3 (a)): the growth check reads memory.yaml's release.growth_threshold; no command asserts it yet.
      ["dev-loop", "phases[0].checks.pre[1]", "growth.clear"],
      ["dev-loop", "phases[1].checks.post[0]", "frontmatter.required"],
      ["dev-loop", "phases[1].checks.post[1]", "tech-spec.approved"],
      ["dev-loop", "phases[1].checks.post[2]", "depends_on.acknowledged"],
      ["dev-loop", "phases[2].checks.post[0]", "tests.exist"],
      ["dev-loop", "phases[2].checks.post[1]", "tests.failing"],
      // task-205 (dl-134 §2): declared on green and refactor, evaluated from v1.0 (P4.12); no command asserts it yet.
      ["dev-loop", "phases[3].checks.post[1]", "tests.unchanged"],
      ["dev-loop", "phases[4].checks.post[5]", "tests.unchanged"],
      // task-221 (dl-115 Q2 (a)): the file is the task's path, which no binding placeholder carries. `typecheck.clean`
      // and `docs.parity` are bound; claims.rerun and rereview.previous-reject are bound manual (task-303).
      ["dev-loop", "phases[6].checks.post[0]", "retrospective.present"],
      ["user-docs", "phases[0].checks.pre[0]", "all tasks where tags=[{release.version}] are status"],
      // task-298 (dl-172 (a)): demo.rendered (task-224's manual re-render, approver ruling 2026-10-10) is bound
      // `manual: true` in bindings.yaml 2.5, so it is no longer unbound (86 warnings, spec-017 §12).
      // task-252 (dl-137 Q1 (b)): the agent file is AGENTS.md; the fifth check reads CLAUDE.md, its pointer.
      ["agent-docs", "phases[0].checks.post[0]", "AGENTS.md project status matches the shipped command surface"],
      ["agent-docs", "phases[0].checks.post[1]", "AGENTS.md element/state tables match memory.yaml"],
      ["agent-docs", "phases[0].checks.post[2]", "AGENTS.md workflow list matches workflows.yaml"],
      ["agent-docs", "phases[0].checks.post[3]", "AGENTS.md role-directive bindings match roles.yaml"],
      ["agent-docs", "phases[0].checks.post[5]", "CLAUDE.md is a pointer that imports AGENTS.md"],
      ["e2e-smoke", "phases[0].checks.post[0]", "exit-code-zero"],
      ["e2e-smoke", "phases[0].checks.post[1]", "scaffolded dna.yaml/memory.yaml/directives round-trip their own loaders"],
      ["e2e-smoke", "phases[1].checks.post[0]", "every step exits with the code it declares, per spec-005-cli-command-contract"],
      ["e2e-smoke", "phases[1].checks.post[1]", "every artifact a command wrote re-loads through its own reader after the last writer, with its content asserted"],
      ["e2e-smoke", "phases[1].checks.post[2]", "the working tree is clean after every step"],
      ["e2e-smoke", "phases[2].checks.post[0]", "exit-code-zero"],
      ["e2e-smoke", "phases[2].checks.post[1]", "registered server version == package.json pin"],
      ["e2e-smoke", "phases[2].checks.post[2]", "advertised channel set == EXPECTED_CHANNELS, every advertised list answers, every listed Resource reads and Prompt gets except a declared KNOWN_READ_FAILURES entry, on the pinned build and the build under development"],
      ["release-submit", "phases[0].checks.pre[0]", "all tasks where tags=[{release.version}] are status"],
      ["release-submit", "phases[0].checks.pre[1]", "all bugs where tags=[{release.version}] are status"],
      // task-219: release-commit and staging-rehearsal precede tag; the rehearsal's check is bound.
      // task-288 (dl-159 A1.8, approver ruling D3): on-integration-branch is bound (scripts/integration-branch.cjs);
      // which phase branch has merged into the integration branch is a reading no command asserts.
      ["release-publishing", "phases[2].checks.pre[1]", "phase-branch-merged-to-integration-branch"],
      // task-229 (dl-130 Action 2): the prose post check also names the GitHub Release; task-238 (dl-130 step 2) the MCP Registry listing; task-244 (dl-136) the test reports attached to the Release.
      ["release-publishing", "phases[3].checks.post[0]", "staged version approved on npm, live on the npm registry, its GitHub Release created with the test reports attached and its MCP Registry listing published"],
      // task-222 (dl-089 §1): the report checks, unbound until scripts/release-health/ ships them (task-231, task-241).
      ["release-health", "phases[0].checks.post[0]", "every catalogue metric has a value or an explicit not-measurable reason"],
      ["release-health", "phases[1].checks.post[0]", "every regressed metric and every breached floor has a finding"],
      ["release-health", "phases[2].checks.post[0]", "every finding is tracked by an element or carries an RH proposal in the report's Proposals section"],
      ["retrospective", "phases[3].checks.post[0]", "frontmatter.required"],
      ["end-of-life", "phases[0].checks.post[0]", "frontmatter.required"],
      ["end-of-life", "phases[1].checks.post[0]", "deprecated content excluded from agent context and default search"],
    ]);
  });

  it('the alignment codes are gone (9 + 2 + 1, and bug-ingest\'s W_PHASE_FALLBACK_NOT_REENTRANT, at 4fd77678), and no action token is unbound', () => {
    const { diagnostics } = registry();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).not.toContain('W_PHASE_PRODUCES_OWNER_IMPLICIT');
    expect(codes).not.toContain('W_PHASE_TOKEN_OUT_OF_SCOPE');
    expect(codes).not.toContain('W_PHASE_ACTION_UNTARGETED');
    expect(codes).not.toContain('W_PHASE_FALLBACK_NOT_REENTRANT');
    expect(new Set(codes)).toEqual(new Set(['W_WORKFLOW_UNBOUND_TOKEN']));
    const unboundActions = diagnostics.filter((d) => d.code === 'W_WORKFLOW_UNBOUND_TOKEN' && /\.actions\[/.test(d.path));
    expect(unboundActions).toEqual([]);
  });

  it('no project action token keeps a positional argument or a shell separator (spec-003 open question 6, dl-090 Q3 (a))', () => {
    // The built-in `set_state(<s>)` / `set_release(<v>)` forms are spec-003's own; open question 6 is about
    // the tokens a binding must pass to a command.
    const offenders: string[] = [];
    for (const workflow of registry().workflows) {
      workflow.phases.forEach((phase) => {
        for (const action of phase.actions ?? []) {
          const args = /\((.*)\)$/.exec(action)?.[1];
          if (args === undefined || isBuiltinToken(tokenName(action))) continue;
          // `key: value` pairs only: the first argument starts with a key, and no value embeds a shell separator.
          if (!/^[a-z_]+\s*:/.test(args) || /;/.test(args)) offenders.push(`${workflow.name}.${phase.name}: ${action}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('AC 3 — how dev-loop\'s steps resolve (what workflow show / workflow next report; characterization)', () => {
  it('every agent step is `wingfoil agent execute`; every set_state / sync_state is manual with a declared verb', () => {
    const { workflows, bindings } = registry();
    const devLoop = workflows.find((w) => w.name === 'dev-loop')!;
    const agentSteps: string[] = [];
    for (const phase of devLoop.phases) {
      for (const action of phase.actions ?? []) {
        const name = tokenName(action);
        const binding = resolveToken(action, 'action', bindings);
        if (name.startsWith('agent.')) {
          expect(binding).toEqual({ kind: 'agent', source: 'built-in', argv: ['wingfoil', 'agent', 'execute'] });
          agentSteps.push(phase.name);
        }
        if (/\.(set_state|sync_state)$/.test(name)) {
          expect(binding.kind).toBe('manual');
          expect(binding.source).toBe('built-in');
          for (const verb of binding.expectedCommit!.verbs) expect(MEMORY_OPERATIONS).toContain(verb);
        }
      }
    }
    expect(agentSteps.length).toBeGreaterThan(0);
  });

  it('one agent step per phase: design\'s three agent.<x> are one agent.execute, the instructions in its description (dl-090 Q6 (b))', () => {
    for (const workflow of registry().workflows) {
      for (const phase of workflow.phases) {
        const agentSteps = (phase.actions ?? []).filter((action) => tokenName(action).startsWith('agent.'));
        expect(agentSteps.length <= 1 ? [] : [`${workflow.name}.${phase.name}`]).toEqual([]);
        if (agentSteps.length === 1) expect(agentSteps[0]).toBe('agent.execute');
      }
    }
  });

  it('every set_state / sync_state in every workflow carries a dl-079 (A) verb, under spec-003\'s verb rule', () => {
    const { workflows, bindings } = registry();
    for (const workflow of workflows) {
      for (const phase of workflow.phases) {
        for (const action of phase.actions ?? []) {
          const binding = resolveToken(action, 'action', bindings);
          if (binding.kind !== 'manual' || binding.source !== 'built-in') continue;
          const verbs = binding.expectedCommit!.verbs;
          // spec-003: a set_state emits `approve` under `approval:`, else `finalize` or `start`.
          const applied = verbs.length === 1 ? verbs[0]! : phase.approval !== undefined ? 'approve' : verbs.includes('start') ? 'start' : verbs[0]!;
          expect(MEMORY_OPERATIONS).toContain(applied);
        }
      }
    }
  });
});

/**
 * spec-003 § "Evidence" read statically, as spec-017 §12 applied it: a phase declares evidence when it
 * includes, selects, awaits, has a string `produces`, adds an element, or changes its bound element's
 * state; a phase with none is a checkpoint. An approval whose phase moves no element through a state
 * (and selects none) is recorded by `workflow finalize` with approver authority (spec-017 §5.1).
 */
function measure(workflows: readonly Workflow[]): { checkpoints: string[]; finalizeApprovals: string[] } {
  const untyped = /^(memory\.(submit|approve|reject|deprecate)|element\.set_state)$/;
  const stateful = /^(memory\.(submit|approve|reject|deprecate)|[a-z][a-z0-9-]*\.set_state)$/;
  const checkpoints: string[] = [];
  const finalizeApprovals: string[] = [];
  for (const workflow of workflows) {
    const startable = workflow.kind === 'main' || workflow.startable === true;
    const creating =
      workflow.element === undefined && startable ? workflow.phases.findIndex((p) => (p.actions ?? []).some((a) => tokenName(a) === 'memory.add')) : -1;
    workflow.phases.forEach((phase, i) => {
      const actions = (phase.actions ?? []).map(tokenName);
      const selection = phase.where !== undefined && phase.iterate_over === undefined;
      const firstAdd = actions.indexOf('memory.add');
      const beforeAdd = firstAdd === -1 ? actions : actions.slice(0, firstAdd);
      const bound = workflow.element !== undefined || (creating !== -1 && i >= creating);
      const state =
        bound && ((!selection && beforeAdd.some((a) => untyped.test(a))) || (workflow.element !== undefined && actions.includes(`${workflow.element}.set_state`)));
      const evidence =
        phase.include !== undefined ||
        selection ||
        phase.awaits !== undefined ||
        (phase.produces ?? []).some((entry) => typeof entry === 'string') ||
        firstAdd !== -1 ||
        state;
      const key = `${workflow.name}.${phase.name}`;
      if (!evidence) checkpoints.push(key);
      if (phase.approval !== undefined && !selection && !actions.some((a) => stateful.test(a))) finalizeApprovals.push(key);
    });
  }
  return { checkpoints, finalizeApprovals };
}

describe('AC 4 — spec-017 §12\'s deduction consequences, re-measured', () => {
  it('17 checkpoint phases (28 at 4fd77678: end-of-life.deprecate now selects what it deprecates; 27 until task-207: e2e-smoke.gate produces its report, bug-134; 27 again from task-219: release-publishing.release-commit, while staging-rehearsal produces its transcript; 28 from task-222: release-health.propose writes into the report compare produced; 29 from task-212: vision-change.update-vision; 30 from task-230: wave.re-plan, the re-plan checkpoint of dl-100 §2; 28 from task-244: release-submit.pre-release-checks produces the candidate’s test-results summary and release-publishing.publish the tag run’s, dl-136; 17 from task-301: the eleven phases of user-story-mapping, specification-by-examples, volere-requirements and backlog-export produce their module’s output directory, bug-389)', () => {
    expect(measure(registry().workflows).checkpoints).toEqual([
      'vision-change.update-vision',
      'release-planning.advance-pinned-build',
      'wave.re-plan',
      'dev-loop.red',
      'dev-loop.green',
      'dev-loop.refactor',
      'user-docs.check-implementation-complete',
      'e2e-smoke.fresh-init',
      'e2e-smoke.drive-cli',
      'e2e-smoke.mcp-registration',
      'release-submit.approve-release',
      'release-publishing.release-commit',
      'release-publishing.tag',
      'release-health.propose',
      'retrospective.additional-points',
      'retrospective.approve',
      'end-of-life.archive',
    ]);
  });

  it('the eleven specification sub-workflow phases produce their module\'s output directory (task-301, bug-389, dl-186 S3-b)', () => {
    const downcast = ['user-story-mapping', 'specification-by-examples', 'volere-requirements', 'backlog-export'];
    const declared: [string, unknown][] = [];
    for (const name of downcast) {
      const workflow = registry().workflows.find((w) => w.name === name)!;
      for (const phase of workflow.phases) declared.push([`${name}.${phase.name}`, phase.produces]);
    }
    expect(declared).toEqual([
      ['user-story-mapping.backbone', ['docs/02_requirements/01_user_story_map/']],
      ['user-story-mapping.vertical-explosion', ['docs/02_requirements/01_user_story_map/']],
      ['user-story-mapping.mvp-cut', ['docs/02_requirements/01_user_story_map/']],
      ['specification-by-examples.isolate-mvp', ['docs/02_requirements/02_bdd/features/']],
      ['specification-by-examples.write-scenarios', ['docs/02_requirements/02_bdd/features/']],
      ['volere-requirements.extract-requirements', ['docs/02_requirements/03_sard/']],
      ['volere-requirements.apply-volere-shell', ['docs/02_requirements/03_sard/']],
      ['volere-requirements.group-by-macro-area', ['docs/02_requirements/03_sard/']],
      ['backlog-export.generate-records', ['docs/03_backlog/04_backlog/']],
      ['backlog-export.map-dependencies', ['docs/03_backlog/04_backlog/']],
      ['backlog-export.validate', ['docs/03_backlog/04_backlog/']],
    ]);
  });

  it('7 approvals recorded by workflow finalize (7 at 4fd77678: retrospective.approve now carries its decision-log; align-agent-docs lives in agent-docs; 6 until task-230 added wave.re-plan)', () => {
    expect(measure(registry().workflows).finalizeApprovals).toEqual([
      'wave.re-plan',
      'user-docs.align-user-docs',
      'agent-docs.align-agent-docs',
      'e2e-smoke.gate',
      'release-submit.approve-release',
      'release-publishing.publish',
      'retrospective.additional-points',
    ]);
  });

  it('the nine implicit-owner produces name the element type the phase creates (dl-104 D3)', () => {
    const owners: string[] = [];
    for (const workflow of registry().workflows) {
      for (const phase of workflow.phases) {
        for (const entry of phase.produces ?? []) {
          if (typeof entry !== 'string') owners.push(`${workflow.name}.${phase.name} ${entry.type} ${entry.path}`);
        }
      }
    }
    expect(owners).toEqual([
      'initial-design.seed-releases release docs/04_memory/planning/rl-{release-line.version}/{release.id}.md',
      'initial-design.seed-adrs adr docs/04_memory/design/adrs/{adr.id}.md',
      'initial-design.seed-dls decision-log docs/04_memory/design/dls/{decision-log.id}.md',
      'initial-design.seed-specs tech-spec docs/04_memory/design/specs/{tech-spec.id}.md',
      'release-line-cycle.plan-next-release-line release-line docs/04_memory/planning/{release-line.id}.md',
      'release-planning.record-adrs adr docs/04_memory/design/adrs/{adr.id}.md',
      'release-planning.identify-specs tech-spec docs/04_memory/design/specs/{tech-spec.id}.md',
      'release-planning.build-backlog task docs/04_memory/{task.release}/{task.id}.md',
      'dev-loop.design tech-spec docs/04_memory/design/specs/{tech-spec.id}.md',
    ]);
  });

  it('end-of-life.deprecate selects only the closing release-line\'s unreleased releases (approver ruling 2026-10-07)', () => {
    const endOfLife = registry().workflows.find((w) => w.name === 'end-of-life')!;
    expect(endOfLife.phases.find((p) => p.name === 'deprecate')?.where).toEqual({
      type: 'release',
      'release-line': '{release-line.version}',
      status: ['draft', 'planning', 'in-development', 'releasing'],
    });
  });

  it('retrospective.collect-feedback is no checkpoint: its produces is evidence, and it records no approval (task-272, dl-163 S3d)', () => {
    const { checkpoints, finalizeApprovals } = measure(registry().workflows);
    const retrospective = registry().workflows.find((w) => w.name === 'retrospective')!;
    expect(retrospective.phases.map((p) => p.name)).toEqual(['explore', 'collect-feedback', 'additional-points', 'capture', 'approve']);
    expect(checkpoints).not.toContain('retrospective.collect-feedback');
    expect(finalizeApprovals).not.toContain('retrospective.collect-feedback');
  });

  it('retrospective.approve declares the transition it stands for: wf(decision-log): approve retro-{version}', () => {
    const retrospective = registry().workflows.find((w) => w.name === 'retrospective')!;
    const approve = retrospective.phases.find((p) => p.name === 'approve')!;
    expect(approve.actions).toEqual(['decision-log.set_state(ready)']);
    expect(approve.approval).toEqual({ by_role: 'approver' });
  });
});

describe('AC 6 — dl-025: release-line-cycle runs user-docs\' align-agent-docs phase', () => {
  it('both include the agent-docs workflow, release-line-cycle right before plan-next-release-line', () => {
    const { workflows } = registry();
    const userDocs = workflows.find((w) => w.name === 'user-docs')!;
    expect(userDocs.phases.find((p) => p.name === 'align-agent-docs')?.include).toBe('agent-docs');
    const cycle = workflows.find((w) => w.name === 'release-line-cycle')!;
    const names = cycle.phases.map((p) => p.name);
    expect(names.slice(-2)).toEqual(['align-agent-docs', 'plan-next-release-line']);
    expect(cycle.phases.find((p) => p.name === 'align-agent-docs')?.include).toBe('agent-docs');
    const agentDocs = workflows.find((w) => w.name === 'agent-docs')!;
    expect(agentDocs.element).toBeUndefined();
    expect(agentDocs.phases.map((p) => [p.name, p.role, p.approval])).toEqual([['align-agent-docs', 'architect', { by_role: 'approver' }]]);
  });
});

describe('workflows/bindings.yaml (dl-090 Action 3, dl-153 (A))', () => {
  it('carries format 1, and binds dev-loop.refactor\'s gates to the commands its comment named', () => {
    const { bindings } = registry();
    expect((bindings as { format?: number }).format).toBe(1);
    expect(bindings!.checks!['docs.api.build']!.run).toEqual(['npm', 'run', 'docs:api']);
    expect(bindings!.checks!['lint.clean']!.run).toEqual(['npm', 'run', 'lint']);
  });

  it('every tests.coverage(min: N) restates jest.config.js\'s global threshold, which `npm run test:coverage` enforces', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jestConfig = require(join(ROOT, 'jest.config.js')) as { coverageThreshold: { global: Record<string, number> } };
    const thresholds = new Set(Object.values(jestConfig.coverageThreshold.global));
    const mins: number[] = [];
    for (const workflow of registry().workflows) {
      for (const phase of workflow.phases) {
        for (const check of [...(phase.checks?.pre ?? []), ...(phase.checks?.post ?? [])]) {
          const min = /^tests\.coverage\(min:\s*(\d+)\)$/.exec(check);
          if (min) mins.push(Number(min[1]));
        }
      }
    }
    expect(mins.length).toBeGreaterThan(0);
    expect([...thresholds]).toEqual([...new Set(mins)]);
  });
});
