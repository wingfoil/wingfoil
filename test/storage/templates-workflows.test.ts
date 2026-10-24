/**
 * task-296 (bug-400, patch-v0.3.1) — the `wingfoil init` scaffold's workflows are drivable by the 0.3
 * engine: every phase names a role, the ingest and delivery phases that add Memory declare it, and the
 * scaffold's `dna.yaml` shows a commented `team.agents` example. These are the in-process pins of the
 * scaffold (`templateScaffold`, `src/storage/templates.ts`); the CLI half — `workflow start` / `next` /
 * `finalize` on a fresh `init` — is `test/cli/init-scaffold-workflows.integration.test.ts`.
 *
 * Shapes pinned are the ones the task's design and its approver gate fixed (D1–D5): no `role` is required
 * on a phase that only `include:`s another workflow (`spec-003` Layer 2, `role`); `bug-ingest` has no
 * `fallback` (D3) and nothing here pins one either way.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { load as loadYaml } from 'js-yaml';

import { TEMPLATES, templateScaffold, type TemplateDefinition } from '../../src/storage/templates';
import { loadDnaYaml } from '../../src/core/loaders';

interface PhaseDoc {
  name: string;
  role?: string;
  include?: string;
  actions?: unknown[];
  produces?: unknown[];
  approval?: unknown;
}

interface WorkflowDoc {
  name: string;
  phases: PhaseDoc[];
}

const CUSTOM_WORKFLOWS_DIR = '.wingfoil/workflows/custom/';

/** The ingest mains of the scaffold, each with the Memory type its capture phase adds. */
const INGEST_TYPES = ['bug', 'decision-log', 'adr'] as const;

function fileOf(def: TemplateDefinition, path: string): string {
  const file = templateScaffold(def).find((f) => f.path === path);
  expect([path, file === undefined]).toEqual([path, false]);
  return file!.content;
}

/** Every `.wingfoil/workflows/custom/*.yaml` of the scaffold, parsed once, by path. */
function workflowFilesOf(def: TemplateDefinition): Array<{ path: string; text: string; doc: WorkflowDoc }> {
  return templateScaffold(def)
    .filter((f) => f.path.startsWith(CUSTOM_WORKFLOWS_DIR) && f.path.endsWith('.yaml'))
    .map((f) => ({ path: f.path, text: f.content, doc: loadYaml(f.content) as WorkflowDoc }));
}

function workflowOf(def: TemplateDefinition, name: string): WorkflowDoc {
  const found = workflowFilesOf(def).find((w) => w.doc.name === name);
  expect([name, found === undefined]).toEqual([name, false]);
  return found!.doc;
}

function phaseOf(workflow: WorkflowDoc, name: string): PhaseDoc {
  const phase = workflow.phases.find((p) => p.name === name);
  expect([`${workflow.name}.${name}`, phase === undefined]).toEqual([`${workflow.name}.${name}`, false]);
  return phase!;
}

/** The `team.roles` names the scaffold's `dna.yaml` declares. */
function scaffoldRoleNames(def: TemplateDefinition): string[] {
  const dna = loadYaml(fileOf(def, '.wingfoil/dna.yaml')) as { team: { roles: Array<{ name: string }> } };
  return dna.team.roles.map((r) => r.name);
}

/** The `path` pattern `memory.yaml` declares for `type`. */
function memoryPathOf(def: TemplateDefinition, type: string): string {
  const memory = loadYaml(fileOf(def, '.wingfoil/memory.yaml')) as { types: Record<string, { path: string }> };
  return memory.types[type]!.path;
}

describe('task-296 AC 1 — every phase of the scaffold\'s workflows names a role from team.roles (bug-400)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: the scaffold has the five workflow files bug-400 greps`, () => {
      expect(workflowFilesOf(def).map((w) => w.doc.name).sort()).toEqual(
        ['adr-ingest', 'bug-ingest', 'decision-log-ingest', `${def.slug}-delivery`, 'sw-life-cycle'].sort(),
      );
    });

    it(`${def.name}: every phase that does not only include another workflow has a role declared in team.roles`, () => {
      const roles = scaffoldRoleNames(def);
      const offenders: string[] = [];
      for (const { doc } of workflowFilesOf(def)) {
        for (const phase of doc.phases) {
          if (phase.include !== undefined) continue;
          if (typeof phase.role !== 'string' || !roles.includes(phase.role)) {
            offenders.push(`${doc.name}.${phase.name} role=${String(phase.role)}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${def.name}: bug-400 step 2's grep (^\\s+(role|actions|produces):) matches a line in every workflow file`, () => {
      const unmatched = workflowFilesOf(def)
        .filter((w) => !w.text.split('\n').some((line) => /^\s+(role|actions|produces):/.test(line)))
        .map((w) => w.path);
      expect(unmatched).toEqual([]);
    });

    for (const type of INGEST_TYPES) {
      it(`${def.name}: ${type}-ingest has a capture phase that adds the ${type} and an approve phase that approves it`, () => {
        const workflow = workflowOf(def, `${type}-ingest`);
        expect(workflow.phases.map((p) => p.name)).toEqual(['capture', 'approve']);
        expect(phaseOf(workflow, 'capture').actions).toContain(`memory.add(type: ${type})`);
        const approve = phaseOf(workflow, 'approve');
        expect(approve.actions).toContain('memory.approve');
        expect(approve.approval).toEqual({ by_role: 'approver' });
      });

      it(`${def.name}: ${type}-ingest's capture produces the ${type} path memory.yaml declares`, () => {
        const capture = phaseOf(workflowOf(def, `${type}-ingest`), 'capture');
        expect(capture.produces).toEqual([memoryPathOf(def, type)]);
      });
    }
  }
});

describe('task-296 AC 2 (a) — the delivery workflow\'s Memory-producing phases declare it (bug-400 step 4)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: ${def.slug}-delivery.plan adds tasks and produces the task directory memory.yaml declares`, () => {
      const plan = phaseOf(workflowOf(def, `${def.slug}-delivery`), 'plan');
      expect(plan.actions).toContain('memory.add(type: task)');
      expect(plan.produces).toContain('docs/memory/task/');
      // The same directory memory.yaml's task `path` writes into, so the two cannot diverge (D2).
      expect(memoryPathOf(def, 'task').startsWith('docs/memory/task/')).toBe(true);
    });

    it(`${def.name}: ${def.slug}-delivery.review approves through memory.approve, routed to the approver`, () => {
      const review = phaseOf(workflowOf(def, `${def.slug}-delivery`), 'review');
      expect(review.actions).toContain('memory.approve');
      expect(review.approval).toEqual({ by_role: 'approver' });
    });
  }
});

/**
 * AC 3 (a) — the commented `team.agents` example, in the shape of task-118's `technologies` example
 * (`test/storage/templates.test.ts`): a `  # agents:` head plus deeper-indented `  #   ` lines inside the
 * `team:` block, and an active `  agents: []` line (D4) that the uncommented example replaces.
 */
describe('task-296 AC 3 (a) — the scaffold\'s dna.yaml carries a commented team.agents example', () => {
  const ACTIVE_LINE = '  agents: []';
  const EXAMPLE_HEAD = '  # agents:';

  function dnaTextOf(def: TemplateDefinition): string {
    return fileOf(def, '.wingfoil/dna.yaml');
  }

  /** The `team:` block: from `team:` up to (exclusive) the next top-level line. */
  function teamBlockOf(text: string): string[] {
    const lines = text.split('\n');
    const start = lines.indexOf('team:');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((l, i) => i > start && /^\S/.test(l));
    return lines.slice(start + 1, end === -1 ? undefined : end);
  }

  /** The commented-out example block: `  # agents:` plus the deeper-indented comment lines after it. */
  function exampleBlockOf(lines: readonly string[]): string[] {
    const head = lines.indexOf(EXAMPLE_HEAD);
    expect(head).toBeGreaterThanOrEqual(0);
    const rest = lines.slice(head + 1);
    const end = rest.findIndex((l) => !l.startsWith('  #   '));
    return [EXAMPLE_HEAD, ...(end === -1 ? rest : rest.slice(0, end))];
  }

  /** Writes `text` as `<tmp>/.wingfoil/dna.yaml` and loads it with the real two-pass loader. */
  function loadAsProject(text: string): ReturnType<typeof loadDnaYaml> {
    const root = mkdtempSync(join(tmpdir(), 'wf-task-296-'));
    try {
      mkdirSync(join(root, '.wingfoil'));
      writeFileSync(join(root, '.wingfoil', 'dna.yaml'), text);
      return loadDnaYaml(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  for (const def of TEMPLATES) {
    it(`${def.name}: the team block holds the commented example and the active \`agents: []\` line`, () => {
      const team = teamBlockOf(dnaTextOf(def));
      expect(team).toContain(EXAMPLE_HEAD);
      expect(exampleBlockOf(team).length).toBeGreaterThan(1);
      expect(team).toContain(ACTIVE_LINE);
    });

    it(`${def.name}: the example, uncommented in place of \`agents: []\`, loads as one non-approving claude-code agent`, () => {
      const text = dnaTextOf(def);
      const lines = text.split('\n');
      const example = exampleBlockOf(teamBlockOf(text)).map((l) => l.replace(/^(\s*)# /, '$1'));
      const at = lines.indexOf(ACTIVE_LINE);
      expect(at).toBeGreaterThanOrEqual(0);
      lines.splice(at, 1, ...example);

      const agents = loadAsProject(lines.join('\n')).team.agents ?? [];
      expect(agents).toHaveLength(1);
      const agent = agents[0]!;
      expect(agent.executes_as).not.toContain('approver');
      expect(agent.executes_as.length).toBeGreaterThan(0);
      expect(agent.adapter).toBe('claude-code');
      // The adapter it names is one the scaffold ships, so the example works as written.
      expect(templateScaffold(def).map((f) => f.path)).toContain('.wingfoil/agents/built-in/claude-code.yaml');
    });

    it(`${def.name}: the unedited scaffold loads with team.agents = []`, () => {
      expect(loadAsProject(dnaTextOf(def)).team.agents).toEqual([]);
    });
  }
});

describe('task-296 AC 3 (c) — the scaffold has no workflows/bindings.yaml (ruling W1-4; characterization)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: no scaffold path is .wingfoil/workflows/bindings.yaml`, () => {
      expect(templateScaffold(def).map((f) => f.path)).not.toContain('.wingfoil/workflows/bindings.yaml');
    });
  }
});
