/**
 * task-175 — phase evidence and token bindings (spec-003-workflows-yaml-schema § "Evidence",
 * § "Selections", § "Collections", § "Action expressions" built-in table, § "Check expressions",
 * Layer 3, § "Diagnostics"; `dl-104` D1 (c), D3, D4; `dl-090` Q1–Q6).
 *
 * - Each loader row this task owns fires on a minimal fixture with its code, severity, `file`, `path`
 *   and message; the warnings leave the load successful (exit 0) and ride the result's `diagnostics`.
 * - `workflows/bindings.yaml` validates per Layer 3; an absent file is no bindings.
 * - This repository's workflows load with zero errors (spec-003 § Diagnostics "Measured"; the
 *   characterization task-199 extends).
 */
import { join } from 'path';

import { CORE_MODULES } from '../../src/core';
import { loadWorkflowsYaml, loadWorkflowsYamlAtRev } from '../../src/core/loaders';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

const MAIN_FILE = 'workflows/custom/main.yaml';

/** Write a one-workflow manifest whose workflow is `body` (a startable `main` with `element: task`). */
function writeMain(root: string, phases: string, header = 'name: main\nkind: main\nelement: task\n'): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n');
  writeFixtureFile(root, `.wingfoil/${MAIN_FILE}`, `${header}phases:\n${phases}`);
}

function writeBindings(root: string, content: string): void {
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', content);
}

/** Load, expect a throw, and return the thrown error's `diagnostics` array. */
function errorsOf(root: string): Diag[] {
  try {
    loadWorkflowsYaml(root);
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    return (err as { diagnostics: Diag[] }).diagnostics;
  }
  throw new Error('expected loadWorkflowsYaml to throw');
}

/** Load, expect success, and return the result's warning `diagnostics`. */
function warningsOf(root: string): Diag[] {
  const result = loadWorkflowsYaml(root) as unknown as { diagnostics?: Diag[] };
  expect(Array.isArray(result.diagnostics)).toBe(true);
  return result.diagnostics ?? [];
}

describe('spec-003 § Diagnostics — the evidence and binding rows owned by task-175', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('E_PHASE_PRODUCES_NOT_A_PATH — a prose produces entry (string form)', () => {
    writeMain(repo, '  - name: explore\n    produces:\n      - "a friction inventory (grouped by theme)"\n');
    expect(errorsOf(repo)).toEqual([
      {
        code: 'E_PHASE_PRODUCES_NOT_A_PATH',
        severity: 'error',
        file: MAIN_FILE,
        path: 'phases[0].produces[0]',
        message: "produces 'a friction inventory (grouped by theme)' is not a path pattern (allowed: [A-Za-z0-9._/{}-], no whitespace)",
      },
    ]);
  });

  it('E_PHASE_PRODUCES_NOT_A_PATH — the path of a { type, path } entry', () => {
    writeMain(
      repo,
      "  - name: seed\n    actions:\n      - 'memory.add(type: adr)'\n    produces:\n      - { type: adr, path: 'docs/adrs/{adr.id} draft.md' }\n",
    );
    expect(errorsOf(repo)).toEqual([
      expect.objectContaining({ code: 'E_PHASE_PRODUCES_NOT_A_PATH', path: 'phases[0].produces[0].path' }),
    ]);
  });

  it('accepts path patterns: files, directories ending in /, {…} tokens', () => {
    writeMain(repo, '  - name: write\n    produces:\n      - "docs/{id}.md"\n      - "docs/out/"\n      - "README.md"\n');
    expect(warningsOf(repo)).toEqual([]);
  });

  it('E_PHASE_PRODUCES_OWNER_NOT_CREATED — a { type: T, path } entry in a phase that does not memory.add T', () => {
    writeMain(
      repo,
      "  - name: seed\n    actions:\n      - 'memory.add(type: adr)'\n    produces:\n      - { type: tech-spec, path: 'docs/specs/{tech-spec.id}.md' }\n",
    );
    expect(errorsOf(repo)).toEqual([
      {
        code: 'E_PHASE_PRODUCES_OWNER_NOT_CREATED',
        severity: 'error',
        file: MAIN_FILE,
        path: 'phases[0].produces[0].type',
        message: "produces owner 'tech-spec' is not a type this phase creates (no memory.add(type: tech-spec))",
      },
    ]);
  });

  it('a { type, path } entry whose type the phase memory.adds is legal and not ambiguous', () => {
    writeMain(
      repo,
      "  - name: seed\n    actions:\n      - 'memory.add(type: adr)'\n      - memory.submit\n    produces:\n      - { type: adr, path: 'docs/adrs/{adr.id}.md' }\n",
    );
    expect(warningsOf(repo)).toEqual([]);
  });

  it('a { type, path } entry with an unknown key fails its structural pass', () => {
    writeMain(repo, "  - name: seed\n    produces:\n      - { type: adr, path: 'docs/a.md', owner: x }\n");
    expect(errorsOf(repo).map((d) => d.code)).toEqual(['E_VALIDATION']);
  });

  it('E_PHASE_SELECTION_UNTYPED — where without iterate_over and without a type key', () => {
    writeMain(repo, '  - name: sweep\n    where: { release: "" }\n    actions:\n      - memory.approve\n');
    expect(errorsOf(repo)).toEqual([
      {
        code: 'E_PHASE_SELECTION_UNTYPED',
        severity: 'error',
        file: MAIN_FILE,
        path: 'phases[0].where',
        message: 'a selection (where without iterate_over) names the type(s) it selects with a type key',
      },
    ]);
  });

  it('a typed selection, and a where under iterate_over, are not refused', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'include:\n  - workflows/custom/main.yaml\n  - workflows/custom/sub.yaml\n');
    writeFixtureFile(
      repo,
      `.wingfoil/${MAIN_FILE}`,
      'name: main\nkind: main\nphases:\n  - name: sweep\n    where: { type: [bug, decision-log], release: "" }\n  - name: each\n    include: sub\n    iterate_over: task\n    where: { status: backlog }\n',
    );
    writeFixtureFile(repo, '.wingfoil/workflows/custom/sub.yaml', 'name: sub\nkind: sub\nelement: task\nphases:\n  - name: go\n');
    expect(warningsOf(repo)).toEqual([]);
  });

  it('awaits: { party, evidence } is accepted; its evidence is a check token', () => {
    writeMain(repo, '  - name: publish\n    awaits: { party: npm registry, evidence: npm.version_visible }\n');
    expect(warningsOf(repo)).toEqual([
      expect.objectContaining({ code: 'W_WORKFLOW_UNBOUND_TOKEN', path: 'phases[0].awaits.evidence' }),
    ]);
  });

  it('awaits without evidence, or with an empty party, fails its structural pass', () => {
    writeMain(repo, '  - name: publish\n    awaits: { party: "" }\n');
    expect(errorsOf(repo).every((d) => d.code === 'E_VALIDATION')).toBe(true);
  });

  it('W_WORKFLOW_UNBOUND_TOKEN — warning, exit 0: an action and a check with no built-in or project binding', async () => {
    writeMain(
      repo,
      '  - name: build\n    actions:\n      - "git.merge(to: main)"\n      - memory.submit\n    checks:\n      pre: ["tests.coverage(min: 80)"]\n',
    );
    expect(warningsOf(repo)).toEqual([
      {
        code: 'W_WORKFLOW_UNBOUND_TOKEN',
        severity: 'warning',
        file: MAIN_FILE,
        path: 'phases[0].actions[0]',
        message: "action token 'git.merge' has no built-in or bindings.yaml binding",
      },
      {
        code: 'W_WORKFLOW_UNBOUND_TOKEN',
        severity: 'warning',
        file: MAIN_FILE,
        path: 'phases[0].checks.pre[0]',
        message: "check token 'tests.coverage' has no built-in or bindings.yaml binding",
      },
    ]);
    // Through `workflow list`: ok (exit 0), the warnings in the payload's `diagnostics`.
    const workflowList = CORE_MODULES.find((m) => m.name === 'workflow')?.operations.workflowList;
    if (!workflowList) throw new Error('fixture bug: workflow.workflowList not registered');
    const result = await workflowList.fn({ root: repo });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { diagnostics: Diag[] }).diagnostics.map((d) => d.code)).toEqual([
        'W_WORKFLOW_UNBOUND_TOKEN',
        'W_WORKFLOW_UNBOUND_TOKEN',
      ]);
    }
  });

  it('a token bound in bindings.yaml is not reported unbound', () => {
    writeMain(repo, '  - name: build\n    actions:\n      - tests.bdd.run\n    checks:\n      post: [lint.clean]\n');
    writeBindings(repo, 'version: 1.0\nchecks:\n  lint.clean: { run: [npm, run, lint] }\nactions:\n  tests.bdd.run: { run: [npm, run, "test:bdd"] }\n');
    expect(warningsOf(repo)).toEqual([]);
  });

  it('W_PHASE_PRODUCES_OWNER_IMPLICIT — a string entry with an {id} token in a phase that memory.adds', () => {
    writeMain(
      repo,
      "  - name: design\n    actions:\n      - 'memory.add(type: tech-spec)'\n    produces:\n      - \"docs/specs/{id}.md\"\n      - \"docs/notes/{task.id}.md\"\n",
    );
    expect(warningsOf(repo)).toEqual([
      {
        code: 'W_PHASE_PRODUCES_OWNER_IMPLICIT',
        severity: 'warning',
        file: MAIN_FILE,
        path: 'phases[0].produces[0]',
        message: "produces 'docs/specs/{id}.md' in a phase that memory.adds: name its owner as { type, path } (dl-104 D3)",
      },
    ]);
  });

  it("a self-creating workflow's creating phase is not ambiguous (spec-003 Layer 2 element)", () => {
    writeMain(
      repo,
      "  - name: capture\n    actions:\n      - 'memory.add(type: bug)'\n      - memory.submit\n    produces:\n      - \"docs/bugs/{id}.md\"\n  - name: triage\n    actions:\n      - memory.approve\n",
      'name: main\nkind: main\n',
    );
    expect(warningsOf(repo)).toEqual([]);
  });

  it('W_PHASE_ACTION_UNTARGETED — an untyped Memory action with no element, no prior memory.add, no selection', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'include:\n  - workflows/custom/main.yaml\n  - workflows/custom/sub.yaml\n');
    writeFixtureFile(repo, `.wingfoil/${MAIN_FILE}`, 'name: main\nkind: main\nphases:\n  - name: go\n    include: sub\n');
    writeFixtureFile(
      repo,
      '.wingfoil/workflows/custom/sub.yaml',
      "name: sub\nkind: sub\nphases:\n  - name: deprecate\n    actions:\n      - memory.deprecate\n      - 'memory.add(type: adr)'\n      - memory.submit\n  - name: sweep\n    where: { type: bug }\n    actions:\n      - element.set_state(closed)\n",
    );
    expect(warningsOf(repo)).toEqual([
      {
        code: 'W_PHASE_ACTION_UNTARGETED',
        severity: 'warning',
        file: 'workflows/custom/sub.yaml',
        path: 'phases[0].actions[0]',
        message: "action 'memory.deprecate' has no element to act on (the workflow binds none, no memory.add precedes it, no selection)",
      },
    ]);
  });

  it('per phase, rows come out in table order: errors, then the three warnings', () => {
    writeMain(
      repo,
      "  - name: mixed\n    where: { release: x }\n    actions:\n      - memory.approve\n      - 'memory.add(type: adr)'\n      - git.tag\n    produces:\n      - \"not a path\"\n      - { type: bug, path: 'docs/{bug.id}.md' }\n      - \"docs/{id}.md\"\n",
    );
    expect(errorsOf(repo).map((d) => `${d.path} ${d.code}`)).toEqual([
      'phases[0].produces[0] E_PHASE_PRODUCES_NOT_A_PATH',
      'phases[0].produces[1].type E_PHASE_PRODUCES_OWNER_NOT_CREATED',
      'phases[0].where E_PHASE_SELECTION_UNTYPED',
      'phases[0].actions[2] W_WORKFLOW_UNBOUND_TOKEN',
      'phases[0].produces[2] W_PHASE_PRODUCES_OWNER_IMPLICIT',
    ]);
  });
});

describe('spec-003 Layer 3 — workflows/bindings.yaml', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeMain(repo, '  - name: go\n');
  });
  afterEach(() => removeTempDir(repo));

  const BINDINGS = 'workflows/bindings.yaml';

  it('an absent file is no bindings', () => {
    const result = loadWorkflowsYaml(repo) as unknown as { bindings: unknown; diagnostics: unknown };
    expect(result.bindings).toBeNull();
    expect(result.diagnostics).toEqual([]);
  });

  it('a valid file is returned, severity defaulting to reject', () => {
    writeBindings(
      repo,
      [
        'version: 1.0',
        'checks:',
        '  tests.coverage: { run: [npm, run, coverage, --, "{min}"], args: { min: "^[0-9]{1,3}$" } }',
        '  smoke.gate: { run: [npm, run, smoke], severity: warn }',
        'actions:',
        '  approver.execute: { manual: true }',
        'collections:',
        '  init-templates: [ default, kanban ]',
        '  modules: [ { id: core }, { name: cli } ]',
        '',
      ].join('\n'),
    );
    const { bindings } = loadWorkflowsYaml(repo) as unknown as { bindings: Record<string, Record<string, unknown>> };
    expect(bindings.checks).toEqual({
      'tests.coverage': { run: ['npm', 'run', 'coverage', '--', '{min}'], severity: 'reject', args: { min: '^[0-9]{1,3}$' } },
      'smoke.gate': { run: ['npm', 'run', 'smoke'], severity: 'warn' },
    });
    expect(bindings.actions).toEqual({ 'approver.execute': { manual: true } });
    expect(bindings.collections).toEqual({ 'init-templates': ['default', 'kanban'], modules: [{ id: 'core' }, { name: 'cli' }] });
  });

  it.each([
    ['an action with both run and manual', 'actions:\n  x.y: { run: [a], manual: true }\n', 'actions.x.y'],
    ['an action with neither run nor manual', 'actions:\n  x.y: { args: {} }\n', 'actions.x.y'],
    ['an empty run', 'checks:\n  x.y: { run: [] }\n', 'checks.x.y.run'],
    ['a check without run', 'checks:\n  x.y: { severity: warn }\n', 'checks.x.y.run'],
    ['a severity outside warn|reject', 'checks:\n  x.y: { run: [a], severity: block }\n', 'checks.x.y.severity'],
    ['manual: false', 'actions:\n  x.y: { manual: false }\n', 'actions.x.y.manual'],
    ['an args pattern that is not a regular expression', 'checks:\n  x.y: { run: [a, "{n}"], args: { n: "([" } }\n', 'checks.x.y.args.n'],
    ['duplicate collection keys', 'collections:\n  c: [ a, b, a ]\n', 'collections.c[2]'],
    ['a collection key outside the ID characters', 'collections:\n  c: [ Kanban ]\n', 'collections.c[0]'],
    ['a map entry with neither id nor name', 'collections:\n  c: [ { label: x } ]\n', 'collections.c[0]'],
  ])('refuses %s (E_VALIDATION on bindings.yaml)', (_label, content, path) => {
    writeBindings(repo, content);
    const diagnostics = errorsOf(repo);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.file === BINDINGS && d.severity === 'error')).toBe(true);
    expect(diagnostics.map((d) => d.path)).toContain(path);
  });

  it('a file that is not YAML is one E_YAML_PARSE_ERROR, and token bindings are left undecided', () => {
    writeMain(repo, '  - name: go\n    actions:\n      - git.tag\n');
    writeBindings(repo, 'checks: [unclosed\n');
    expect(errorsOf(repo)).toEqual([expect.objectContaining({ code: 'E_YAML_PARSE_ERROR', file: BINDINGS, path: '' })]);
  });

  it('E_BINDING_PARTIAL_INTERPOLATION — a placeholder that is not a whole run element', () => {
    writeBindings(repo, 'actions:\n  git.create_branch: { run: [git, switch, -c, "task/{task.id}"] }\n');
    expect(errorsOf(repo)).toEqual([
      {
        code: 'E_BINDING_PARTIAL_INTERPOLATION',
        severity: 'error',
        file: BINDINGS,
        path: 'actions.git.create_branch.run[3]',
        message: "'task/{task.id}' interpolates part of an argument: a placeholder must be a whole run element",
      },
    ]);
  });

  it('E_BINDING_BUILTIN_TOKEN — a project binding for a built-in token', () => {
    writeBindings(
      repo,
      'actions:\n  memory.submit: { run: [echo] }\n  task.set_state: { manual: true }\n  agent.verify_specs: { manual: true }\n  config.init: { run: [wingfoil, init] }\n',
    );
    expect(errorsOf(repo)).toEqual(
      ['memory.submit', 'task.set_state', 'agent.verify_specs', 'config.init'].map((token) => ({
        code: 'E_BINDING_BUILTIN_TOKEN',
        severity: 'error',
        file: BINDINGS,
        path: `actions.${token}`,
        message: `'${token}' is a built-in token and may not be rebound`,
      })),
    );
  });

  it('E_BINDING_AGENT_CHECK — a check bound to wingfoil agent execute (directly or through npx)', () => {
    writeBindings(
      repo,
      'checks:\n  depends_on.acknowledged: { run: [wingfoil, agent, execute, --step, design] }\n  self.ok: { run: [npx, wingfoil, agent, execute] }\nactions:\n  review.run: { run: [wingfoil, agent, execute] }\n',
    );
    expect(errorsOf(repo)).toEqual([
      {
        code: 'E_BINDING_AGENT_CHECK',
        severity: 'error',
        file: BINDINGS,
        path: 'checks.depends_on.acknowledged.run',
        message: 'check \'depends_on.acknowledged\' is bound to wingfoil agent execute: a check an agent asserts about its own work is not a gate',
      },
      expect.objectContaining({ code: 'E_BINDING_AGENT_CHECK', path: 'checks.self.ok.run' }),
    ]);
  });

  it('bindings.yaml diagnostics come after every workflow file (spec-003 order)', () => {
    writeMain(repo, '  - name: go\n    produces: ["prose here"]\n');
    writeBindings(repo, 'actions:\n  memory.add: { manual: true }\n');
    expect(errorsOf(repo).map((d) => `${d.file} ${d.code}`)).toEqual([
      `${MAIN_FILE} E_PHASE_PRODUCES_NOT_A_PATH`,
      `${BINDINGS} E_BINDING_BUILTIN_TOKEN`,
    ]);
  });

  it('the at-rev loader reads bindings.yaml from the commit', () => {
    writeBindings(repo, 'actions:\n  approver.execute: { manual: true }\n');
    commitAll(repo, 'fixture');
    writeBindings(repo, 'actions:\n  memory.add: { manual: true }\n');
    const result = loadWorkflowsYamlAtRev(repo, 'HEAD') as unknown as { bindings: { actions: unknown } };
    expect(result.bindings.actions).toEqual({ 'approver.execute': { manual: true } });
  });
});

describe("this repository's own workflows (characterization, spec-003 § Diagnostics \"Measured\"; task-199 extends)", () => {
  it('load with zero errors', () => {
    const liveRoot = join(__dirname, '..', '..');
    const result = loadWorkflowsYaml(liveRoot) as unknown as { workflows: unknown[]; diagnostics: Diag[] };
    expect(result.workflows.length).toBeGreaterThanOrEqual(23);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
