/**
 * task-340 AC 2 (red-first) — `W_WORKFLOW_AGENT_ROLE_UNEXECUTED` (`dl-202` item 2; `spec-003` Layer 2 Phase table and
 * § "Diagnostics", amended at the design gate `24a86f5cc`; BDD `p4-workflow/P4.1-workflow-config.feature`, "Warning -
 * an agent action under a role no agent executes").
 *
 * The core check (`src/core/workflow-core-checks.ts`, a row after `W_PHASE_FALLBACK_NOT_REENTRANT`, inside the
 * `dna.yaml` checks): a phase whose `role` is a `team.roles` name and whose `actions` hold an `agent.<x>` token raises
 * one warning, at the first such action, when no `team.agents` entry WITH an `adapter` lists the role in
 * `executes_as`. Message: `phase '<name>' declares <token> under role '<role>', but no team.agents entry with an
 * adapter executes as '<role>'`. Not decided without `dna.yaml`: the `W_WORKFLOW_CHECKS_NOT_RUN` line stays as it is
 * (approver ruling D5).
 *
 * The fixture mirrors `release-publishing`'s two phases that held `agent.execute` under `tech-lead`
 * (`publish`, `merge-forward`), the case the design measured on this repository.
 */
import { CORE_MODULES, loadWorkflowRegistryAtRev, W_WORKFLOW_CHECKS_NOT_RUN, workflowCoreDiagnostics } from '../../src/core';
import { DnaYaml } from '../../src/dna/schema';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

const CODE = 'W_WORKFLOW_AGENT_ROLE_UNEXECUTED';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
`;

/** `team.agents` as YAML lines (already indented under `team:`), or nothing. */
function dnaYaml(agents: string): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Roberto
      email: roberto@example.invalid
      roles: [ approver, tech-lead ]
${agents}  roles:
    - name: developer
    - name: reviewer
    - name: tech-lead
    - name: approver
paths:
  sources: [ src/ ]
`;
}

const AGENT_DEVELOPER = `  agents:
    - name: Claude
      email: noreply@anthropic.com
      adapter: claude-code
      executes_as: [ developer ]
`;

const AGENT_TECH_LEAD_NO_ADAPTER = `  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer, tech-lead ]
`;

const AGENT_TECH_LEAD_WITH_ADAPTER = `  agents:
    - name: Claude
      email: noreply@anthropic.com
      adapter: claude-code
      executes_as: [ developer, tech-lead ]
`;

/** `release-publishing`'s two tech-lead phases with `agent.execute`, as a sub workflow. */
const PUBLISHING = {
  name: 'publishing',
  kind: 'sub',
  element: 'release',
  phases: [
    { name: 'publish', role: 'tech-lead', actions: ['agent.execute', 'approver.execute(command: "x")'] },
    { name: 'merge-forward', role: 'tech-lead', actions: ['git.merge(from: integration_branch, ff: false)', 'agent.execute'] },
  ],
};

const MAIN = { name: 'main', kind: 'main', element: 'release', phases: [{ name: 'ship', include: 'publishing' }] };

const PURE_MEMORY = MemoryYaml.parse(parseYaml(MEMORY_YAML, 'memory.yaml'));

/** The core diagnostics of `workflows` (files `f0.yaml`, `f1.yaml`, …) against `dna` (YAML text, or none). */
function pure(workflows: readonly unknown[], dna: string | null): Diag[] {
  return workflowCoreDiagnostics(
    { include: workflows.map((_, i) => `f${i}.yaml`), workflows: workflows.map((w) => Workflow.parse(w)), bindings: null },
    { memoryYaml: PURE_MEMORY, dnaYaml: dna === null ? null : DnaYaml.parse(parseYaml(dna, 'dna.yaml')), templateFields: () => null },
  ) as Diag[];
}

const ofCode = (diagnostics: readonly Diag[]): Diag[] => diagnostics.filter((d) => d.code === CODE);

const warning = (file: string, path: string, phase: string, role: string, token = 'agent.execute'): Diag => ({
  code: CODE,
  severity: 'warning',
  file,
  path,
  message: `phase '${phase}' declares ${token} under role '${role}', but no team.agents entry with an adapter executes as '${role}'`,
});

describe('task-340 AC 2 — W_WORKFLOW_AGENT_ROLE_UNEXECUTED (spec-003 § Diagnostics, dl-202 item 2)', () => {
  it('(a) two tech-lead phases with agent.execute, no agent executes tech-lead: exactly two warnings, phase order, at the first agent action of each', () => {
    expect(ofCode(pure([MAIN, PUBLISHING], dnaYaml(AGENT_DEVELOPER)))).toEqual([
      warning('f1.yaml', 'phases[0].actions[0]', 'publish', 'tech-lead'),
      warning('f1.yaml', 'phases[1].actions[1]', 'merge-forward', 'tech-lead'),
    ]);
  });

  it('(a) the warning comes after every other core row of the same phase', () => {
    const got = pure([MAIN, PUBLISHING], dnaYaml(AGENT_DEVELOPER));
    const first = got.findIndex((d) => d.code === CODE);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(got.slice(first + 1).filter((d) => d.code !== CODE && d.file === 'f1.yaml' && d.path.startsWith('phases[0]'))).toEqual([]);
  });

  it('(b) an agent that executes tech-lead WITHOUT an adapter still raises it', () => {
    expect(ofCode(pure([MAIN, PUBLISHING], dnaYaml(AGENT_TECH_LEAD_NO_ADAPTER))).map((d) => d.path)).toEqual(['phases[0].actions[0]', 'phases[1].actions[1]']);
  });

  it('(b) an agent with an adapter that executes tech-lead: none', () => {
    expect(ofCode(pure([MAIN, PUBLISHING], dnaYaml(AGENT_TECH_LEAD_WITH_ADAPTER)))).toEqual([]);
  });

  it('(c) no team.agents at all: raised', () => {
    expect(ofCode(pure([MAIN, PUBLISHING], dnaYaml(''))).map((d) => d.path)).toEqual(['phases[0].actions[0]', 'phases[1].actions[1]']);
  });

  it('(d) no role, an unknown role (only E_PHASE_ROLE_UNKNOWN), or no agent.* action: none', () => {
    const sub = {
      name: 'chores',
      kind: 'sub',
      phases: [
        { name: 'roleless', actions: ['agent.execute'] },
        { name: 'haunted', role: 'ghost', actions: ['agent.execute'] },
        { name: 'manual', role: 'tech-lead', actions: ['git.merge(from: integration_branch, ff: false)'] },
      ],
    };
    const got = pure([{ name: 'main', kind: 'main', phases: [{ name: 'go', include: 'chores' }] }, sub], dnaYaml(AGENT_DEVELOPER));
    expect(ofCode(got)).toEqual([]);
    expect(got.filter((d) => d.path.startsWith('phases[1]')).map((d) => d.code)).toEqual(['E_PHASE_ROLE_UNKNOWN']);
  });

  it('(e) a human-only role (approver) with agent.execute: raised', () => {
    const sub = { name: 'gate', kind: 'sub', phases: [{ name: 'decide', role: 'approver', actions: ['agent.execute'] }] };
    expect(ofCode(pure([{ name: 'main', kind: 'main', phases: [{ name: 'go', include: 'gate' }] }, sub], dnaYaml(AGENT_DEVELOPER)))).toEqual([
      warning('f1.yaml', 'phases[0].actions[0]', 'decide', 'approver'),
    ]);
  });

  it('(f) two agent.execute in one phase: one warning, at the first', () => {
    const sub = { name: 'twice', kind: 'sub', phases: [{ name: 'deploy', role: 'tech-lead', actions: ['git.merge(from: integration_branch, ff: false)', 'agent.execute', 'agent.execute'] }] };
    expect(ofCode(pure([{ name: 'main', kind: 'main', phases: [{ name: 'go', include: 'twice' }] }, sub], dnaYaml(AGENT_DEVELOPER)))).toEqual([
      warning('f1.yaml', 'phases[0].actions[1]', 'deploy', 'tech-lead'),
    ]);
  });

  it('(g) without dna.yaml: not decided, and the W_WORKFLOW_CHECKS_NOT_RUN line is unchanged (D5)', () => {
    const got = pure([MAIN, PUBLISHING], null);
    expect(ofCode(got)).toEqual([]);
    expect(got.filter((d) => d.code === W_WORKFLOW_CHECKS_NOT_RUN)).toEqual([
      { code: W_WORKFLOW_CHECKS_NOT_RUN, severity: 'warning', file: 'dna.yaml', path: '', message: 'dna.yaml is absent: the role, approver and dna: collection checks were not run' },
    ]);
  });
});

describe('task-340 AC 2 — through the registry at HEAD, `workflow list` and the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n  - workflows/custom/publishing.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', 'name: main\nkind: main\nelement: release\nphases:\n  - name: ship\n    include: publishing\n');
    writeFixtureFile(
      repo,
      '.wingfoil/workflows/custom/publishing.yaml',
      [
        'name: publishing',
        'kind: sub',
        'element: release',
        'phases:',
        '  - name: publish',
        '    role: tech-lead',
        '    actions:',
        '      - agent.execute',
        `      - 'approver.execute(command: "x")'`,
        '  - name: merge-forward',
        '    role: tech-lead',
        '    actions:',
        `      - 'git.merge(from: integration_branch, ff: false)'`,
        '      - agent.execute',
        '',
      ].join('\n'),
    );
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml(AGENT_DEVELOPER));
    commitAll(repo, 'fixture');
  });
  afterAll(() => removeTempDir(repo));

  const FILE = 'workflows/custom/publishing.yaml';
  const EXPECTED = [warning(FILE, 'phases[0].actions[0]', 'publish', 'tech-lead'), warning(FILE, 'phases[1].actions[1]', 'merge-forward', 'tech-lead')];

  it('the registry at HEAD carries the two warnings and loads (a warning refuses nothing)', () => {
    expect(ofCode(loadWorkflowRegistryAtRev(repo, 'HEAD').diagnostics as Diag[])).toEqual(EXPECTED);
  });

  it('the workflowList operation succeeds with the two warnings in its diagnostics', async () => {
    const op = CORE_MODULES.find((m) => m.name === 'workflow')!.operations['workflowList']!;
    const result = (await op.fn({ root: repo })) as { ok: boolean; value?: { diagnostics: Diag[] } };
    expect(result.ok).toBe(true);
    expect(ofCode(result.value!.diagnostics)).toEqual(EXPECTED);
  });

  it.each([['json'], ['console']])('(h) `workflow list --format %s`: exit 0, the two warnings in the payload, empty stderr', (format) => {
    const run = runCliEntry(repo, ['workflow', 'list', '--format', format]);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(ofCode((JSON.parse(run.stdout) as { diagnostics: Diag[] }).diagnostics)).toEqual(EXPECTED);
  });
});
