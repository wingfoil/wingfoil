/**
 * task-358 (`bug-469`, `bug-320`, `bug-435`; `spec-003-workflows-yaml-schema` Layer 3 as amended at the task's design
 * gate; `dl-090`, `dl-172` (a), `dl-115`) — every token of this repository's workflows is bound: a `run` where a command
 * decides the check, `manual: true` for the rest, in two groups ("manual until a command", "manual on purpose";
 * approver ruling D1 (B)), so the registry raises no `W_WORKFLOW_UNBOUND_TOKEN`.
 *
 * - AC 1 (red-first): (a) the registry's diagnostics at `HEAD` are `[]`; (b) every check occurrence and every action
 *   of every workflow resolves to a kind other than `unbound`; (c) the four `run` bindings, exactly; (d) the 36 names
 *   "manual until a command" and the 19 "manual on purpose" resolve `{ kind: 'manual', source: 'project' }`, the two
 *   lists disjoint, each under its own group comment in `bindings.yaml`; (f) `bindings.yaml` is at least 3.1, with a
 *   history segment naming task-358. The CLI half (e) is `test/cli/workflow-unbound-none.integration.test.ts`.
 * - AC 2 (a) (red-first): `dev-loop`'s `done` check `retrospective.present` runs `scripts/check-retrospective.cjs` on
 *   `{element.path}`; `design` reads the decision-logs a task's `ref:` names (D2 (c)); `dev-loop.yaml` at least 2.5.
 * - AC 3 (red-first, `bug-435`): `e2e-smoke`'s checks are `e2e-smoke.scenario` and `mcp.registered` (D3 (a));
 *   `agent-docs` binds `agents-md.current` to a `test/docs/` parity suite that `docs.parity` also runs;
 *   `release-health.yaml`'s comment states the real reason; the mixed checks are split.
 *
 * Every registry read is the configuration **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, `workflowShowAtHead`,
 * `git show HEAD:…`), as `test/core/workflow-manual-prose-checks.test.ts` does, so a dirty working tree changes nothing.
 * Version pins are "at least" plus the history clause naming the task (`bug-314`). Deterministic: workflows in manifest
 * `include` order, phases in declared order, `pre` before `post`; fixed name lists.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { resolveToken, tokenName } from '../../src/workflow/bindings';
import type { Phase, Workflow } from '../../src/workflow/schema';

import { MANUAL_ON_PURPOSE, MANUAL_UNTIL_A_COMMAND, RUN_BINDINGS } from './helpers/manual-binding-groups';

const ROOT = join(__dirname, '..', '..');
const BINDINGS = '.wingfoil/workflows/bindings.yaml';
const CUSTOM = '.wingfoil/workflows/custom';

/** A file's content at `HEAD`, or `null` when `HEAD` holds no such file. */
function atHead(path: string): string | null {
  try {
    return execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function workflow(name: string): Workflow {
  const found = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === name);
  if (found === undefined) throw new Error(`workflow ${name} is not in the registry at HEAD`);
  return found;
}

function phase(workflowName: string, phaseName: string): Phase {
  const found = workflow(workflowName).phases.find((p) => p.name === phaseName);
  if (found === undefined) throw new Error(`${workflowName} has no phase ${phaseName} at HEAD`);
  return found;
}

/** The `version:` line of a configuration file at `HEAD`. */
function versionLine(path: string): string {
  const line = /^version:.*$/m.exec(atHead(path) ?? '');
  if (line === null) throw new Error(`${path} has no version: line at HEAD`);
  return line[0];
}

type Group = 'until' | 'purpose';

/**
 * The group comment each `checks:` key of `bindings.yaml` (at `HEAD`) sits under: the last comment line above it, in
 * the `checks:` block, matching `/manual until a command/i` or `/manual on purpose/i`. Keys are unquoted, or quoted in
 * YAML's single or double style.
 */
function groupOfKeys(): Map<string, Group | null> {
  const lines = (atHead(BINDINGS) ?? '').split('\n');
  const start = lines.indexOf('checks:');
  const end = lines.indexOf('actions:');
  const groups = new Map<string, Group | null>();
  let current: Group | null = null;
  for (const line of lines.slice(start + 1, end === -1 ? undefined : end)) {
    if (/^\s*#/.test(line)) {
      if (/manual until a command/i.test(line)) current = 'until';
      else if (/manual on purpose/i.test(line)) current = 'purpose';
      continue;
    }
    const key = /^ {2}(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s#"'][^:]*?)):\s/.exec(line);
    if (key === null) continue;
    const name = key[1] !== undefined ? key[1].replace(/\\(.)/g, '$1') : key[2] !== undefined ? key[2].replace(/''/g, "'") : key[3]!;
    groups.set(name, current);
  }
  return groups;
}

describe('task-358 AC 1 — every token of this repository is bound (red-first, bug-469, D1 (B))', () => {
  it('(a) the registry loads at HEAD with no diagnostic at all', () => {
    expect(loadWorkflowRegistryAtHead(ROOT).diagnostics).toEqual([]);
  });

  it('(b) no check occurrence (pre and post) and no action of any workflow resolves unbound', () => {
    const { workflows, bindings } = loadWorkflowRegistryAtHead(ROOT);
    const unbound: string[] = [];
    for (const w of workflows) {
      w.phases.forEach((p, i) => {
        (p.actions ?? []).forEach((token, j) => {
          if (resolveToken(token, 'action', bindings).kind === 'unbound') unbound.push(`${w.name} phases[${i}].actions[${j}] ${tokenName(token)}`);
        });
        for (const when of ['pre', 'post'] as const) {
          (p.checks?.[when] ?? []).forEach((token, j) => {
            if (resolveToken(token, 'check', bindings).kind === 'unbound') unbound.push(`${w.name} phases[${i}].checks.${when}[${j}] ${tokenName(token)}`);
          });
        }
      });
    }
    expect(unbound).toEqual([]);
  });

  it.each(RUN_BINDINGS.map(([name, argv]) => [name, argv]))('(c) %s is bound run, exactly %j, at severity reject', (name, argv) => {
    const { bindings } = loadWorkflowRegistryAtHead(ROOT);
    expect(resolveToken(name as string, 'check', bindings)).toEqual({ kind: 'run', source: 'project', argv, severity: 'reject' });
  });

  it('(d) the two manual lists hold 36 and 19 distinct names and are disjoint', () => {
    expect(new Set(MANUAL_UNTIL_A_COMMAND).size).toBe(36);
    expect(new Set(MANUAL_ON_PURPOSE).size).toBe(19);
    expect(MANUAL_UNTIL_A_COMMAND.filter((name) => (MANUAL_ON_PURPOSE as readonly string[]).includes(name))).toEqual([]);
  });

  it.each([...MANUAL_UNTIL_A_COMMAND, ...MANUAL_ON_PURPOSE].map((name) => [name]))('(d) %s resolves { kind: manual, source: project } at HEAD', (name) => {
    const { bindings } = loadWorkflowRegistryAtHead(ROOT);
    expect(resolveToken(name, 'check', bindings)).toEqual({ kind: 'manual', source: 'project' });
  });

  it('(d) bindings.yaml places each "manual until a command" name under that group comment, each "manual on purpose" name under its own', () => {
    const groups = groupOfKeys();
    const misplaced = [
      ...MANUAL_UNTIL_A_COMMAND.filter((name) => groups.get(name) !== 'until').map((name) => [name, groups.get(name) ?? null, 'until']),
      ...MANUAL_ON_PURPOSE.filter((name) => groups.get(name) !== 'purpose').map((name) => [name, groups.get(name) ?? null, 'purpose']),
    ];
    expect(misplaced).toEqual([]);
  });

  it('(f) bindings.yaml is at least 3.1, with a task-358 history entry numbered at least 3.1 (bug-314)', () => {
    const line = versionLine(BINDINGS);
    expect(Number(/^version:\s*"?([0-9.]+)/.exec(line)![1])).toBeGreaterThanOrEqual(3.1);
    // Each `;`-separated segment of the version comment opens with its own version number.
    const entries = line
      .replace(/^version:[^#]*#/, '')
      .split(';')
      .map((segment) => /^\s*(\d+\.\d+)\b/.exec(segment))
      .filter((match): match is RegExpExecArray => match !== null && match.input.includes('task-358'))
      .map((match) => Number(match[1]));
    expect(entries.length > 0 ? Math.max(...entries) : Number.NaN).toBeGreaterThanOrEqual(3.1);
  });
});

describe('task-358 AC 2 (a) — dev-loop: the retrospective check runs on the element path; design reads the ref: decision-logs (red-first, bug-320)', () => {
  it('workflow show dev-loop shows done\'s retrospective.present bound run on {element.path}, not evaluated', () => {
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    const done = shown.value.workflow.phases.find((p) => p.name === 'done')!;
    const views = [...done.checks.pre, ...done.checks.post].filter((entry) => tokenName(entry.token) === 'retrospective.present');
    expect(views.map((entry) => [entry.binding, entry.evaluated])).toEqual([
      [{ kind: 'run', source: 'project', argv: ['node', 'scripts/check-retrospective.cjs', '{element.path}'], severity: 'reject' }, false],
    ]);
  });

  it('design\'s description reads every decision-log the task\'s ref: names, and depends_on.acknowledged names ref:', () => {
    const design = phase('dev-loop', 'design');
    expect(design.description).toMatch(/every decision-log the task's `ref:` names/);
    const acknowledged = (design.checks?.post ?? []).filter((token) => tokenName(token) === 'depends_on.acknowledged');
    expect(acknowledged).toEqual([expect.stringMatching(/^depends_on\.acknowledged\(/)]);
    expect(acknowledged[0]).toContain('ref:');
  });

  it('dev-loop.yaml is at least 2.5, its version comment naming task-358', () => {
    expect(workflow('dev-loop').version).toBeGreaterThanOrEqual(2.5);
    expect(versionLine(`${CUSTOM}/dev-loop.yaml`)).toContain('task-358');
  });
});

describe('task-358 AC 3 — bug-435\'s four leftovers (red-first)', () => {
  describe('(a) e2e-smoke: one scenario token on fresh-init and drive-cli, mcp.registered alone on mcp-registration (D3 (a))', () => {
    it('the phase names are unchanged', () => {
      expect(workflow('e2e-smoke').phases.map((p) => p.name)).toEqual(['fresh-init', 'drive-cli', 'mcp-registration', 'gate']);
    });

    it.each([['fresh-init'], ['drive-cli']])('%s checks.post is exactly e2e-smoke.scenario', (name) => {
      expect(phase('e2e-smoke', name).checks?.post).toEqual(['e2e-smoke.scenario']);
    });

    it('mcp-registration checks.post is exactly mcp.registered, in place of its two prose checks', () => {
      expect(phase('e2e-smoke', 'mcp-registration').checks?.post).toEqual(['mcp.registered']);
    });

    it('e2e-smoke.yaml is at least 2.0, its version comment naming task-358', () => {
      expect(workflow('e2e-smoke').version).toBeGreaterThanOrEqual(2.0);
      expect(versionLine(`${CUSTOM}/e2e-smoke.yaml`)).toContain('task-358');
    });
  });

  describe('(b) agent-docs: the AGENTS.md readings become one parity suite', () => {
    it('align-agent-docs checks.post is exactly agents-md.current and workflow-md.complete', () => {
      expect(phase('agent-docs', 'align-agent-docs').checks?.post).toEqual(['agents-md.current', 'workflow-md.complete']);
    });

    it('agent-docs.yaml is at least 1.2, its version comment naming task-358', () => {
      expect(workflow('agent-docs').version).toBeGreaterThanOrEqual(1.2);
      expect(versionLine(`${CUSTOM}/agent-docs.yaml`)).toContain('task-358');
    });

    it('test/docs/agents-md.test.ts exists at HEAD and cites dl-025, dl-137 and dl-116', () => {
      const suite = atHead('test/docs/agents-md.test.ts');
      expect(suite).not.toBeNull();
      for (const id of ['dl-025', 'dl-137', 'dl-116']) expect(suite).toContain(id);
    });

    it('docs.parity runs test/docs/agents-md.test.ts', () => {
      const { bindings } = loadWorkflowRegistryAtHead(ROOT);
      const parity = resolveToken('docs.parity', 'check', bindings);
      expect(parity.kind).toBe('run');
      expect(parity.kind === 'run' ? parity.argv : []).toContain('test/docs/agents-md.test.ts');
    });
  });

  describe('(c) release-health.yaml: the comment states the real reason', () => {
    const file = `${CUSTOM}/release-health.yaml`;

    it('no comment says the check waits for scripts/release-health/ to ship', () => {
      expect(atHead(file)).not.toContain('Unbound until scripts/release-health/ ships');
    });

    it('the measure phase\'s comment says no command reads a report against the catalogue', () => {
      const text = atHead(file) ?? '';
      const block = text.slice(text.indexOf('- name: measure'), text.indexOf('- name: compare'));
      const comments = block.split('\n').filter((line) => /^\s*#/.test(line)).join(' ');
      expect(comments).toMatch(/no command reads a report against (?:the catalogue|`?docs\/08_health\/metrics\.yaml`?)/);
    });

    it('release-health.yaml is at least 1.3, its version comment naming task-358', () => {
      expect(workflow('release-health').version).toBeGreaterThanOrEqual(1.3);
      expect(versionLine(file)).toContain('task-358');
    });
  });

  describe('(d) the mixed checks are split into what a command could decide and what a human reads', () => {
    it('specification-downcast phases[0].checks.post is the coverage half, then the edge-case half (at least 1.1)', () => {
      const w = workflow('specification-downcast');
      expect(w.phases[0]!.checks?.post).toEqual(['100% of MVP Canvas features covered', 'edge-case stories present']);
      expect(w.version).toBeGreaterThanOrEqual(1.1);
      expect(versionLine(`${CUSTOM}/specification-downcast.yaml`)).toContain('task-358');
    });

    it('user-story-mapping mvp-cut checks.post is the inclusion half, then the edge-case half (at least 1.2)', () => {
      expect(phase('user-story-mapping', 'mvp-cut').checks?.post).toEqual(['100% of MVP Canvas features included', 'edge-case stories generated']);
      expect(workflow('user-story-mapping').version).toBeGreaterThanOrEqual(1.2);
      expect(versionLine(`${CUSTOM}/user-story-mapping.yaml`)).toContain('task-358');
    });

    it('retrospective collect-feedback: feedback-notes.recorded, then feedback-notes.restated; recorded no longer holds the restating clause', () => {
      const post = phase('retrospective', 'collect-feedback').checks?.post ?? [];
      expect(post).toEqual([expect.stringMatching(/^feedback-notes\.recorded\(/), expect.stringMatching(/^feedback-notes\.restated\(/)]);
      expect(post[0]).not.toContain("WingFoil's words");
    });

    it('retrospective additional-points: proposals.disposed, then proposals.outcome-chosen (at least 1.9)', () => {
      expect(phase('retrospective', 'additional-points').checks?.pre).toEqual([
        expect.stringMatching(/^proposals\.disposed\(/),
        expect.stringMatching(/^proposals\.outcome-chosen\(/),
      ]);
      expect(workflow('retrospective').version).toBeGreaterThanOrEqual(1.9);
      expect(versionLine(`${CUSTOM}/retrospective.yaml`)).toContain('task-358');
    });
  });
});
