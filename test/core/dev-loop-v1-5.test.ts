/**
 * task-205 — `dev-loop.yaml` v1.5: separation of duties (`dl-134` §1–§5, ratified Q1 (a), Q2 (a),
 * §4 (c)), the reject-side bug sync (`dl-061` A.1, B.1, C.1), parking (`dl-110` P2) and the main-sync on
 * resume (`dl-035`); the `testing` directive and `roles.yaml` halves (`dl-134` Action 4).
 *
 * The workflow is read **as `HEAD` holds it**, through `loadWorkflowRegistryAtHead` (the loader plus the
 * core checks, task-194), like `test/core/workflow-repository-conformance.test.ts` (task-199), whose
 * zero-error test this file does not replace. The header comments, which the parsed workflow does not
 * carry, are read from the same commit (`git show HEAD:<path>`). The directive, `roles.yaml` and
 * `WORKFLOW.md` are read from the working tree, as the other live-configuration suites do.
 *
 * What is NOT asserted here (recorded as unasserted in the task's Execution Notes, testing T1): that
 * `workflow next` reports the fallback step and the sync — that command is `task-216`'s; this file pins
 * the configuration it will read (the fallback step, the sync token's binding, the subject's legality).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadDirectives, loadMemoryYamlAtHead, loadRolesYaml, loadWorkflowRegistryAtHead } from '../../src/core';
import { resolveRoleDirectives } from '../../src/core/context';
import { parseBracketHops, parseMemoryOperation } from '../../src/memory/audit';
import { isMachineEdge, resolveStateMachine } from '../../src/memory/state-machine';
import { resolveToken, tokenName } from '../../src/workflow/bindings';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';

function devLoop(): { workflow: Workflow; diagnostics: readonly { code: string; severity: string; file: string }[] } {
  const loaded = loadWorkflowRegistryAtHead(ROOT);
  const workflow = loaded.workflows.find((w) => w.name === 'dev-loop');
  if (workflow === undefined) throw new Error('dev-loop is not in the registry at HEAD');
  return { workflow, diagnostics: loaded.diagnostics as readonly { code: string; severity: string; file: string }[] };
}

function phase(name: string): Phase {
  const found = devLoop().workflow.phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`dev-loop has no phase '${name}' at HEAD`);
  return found;
}

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** The leading comment block of dev-loop.yaml at HEAD (every line before `name:`), comment markers stripped, joined. */
function header(): string {
  const lines = atHead(DEV_LOOP_FILE).split('\n');
  const end = lines.findIndex((line) => line.startsWith('name:'));
  return lines
    .slice(0, end)
    .map((line) => line.replace(/^#\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
}

/** The raw line of dev-loop.yaml at HEAD that declares `action` inside phase `phaseName`. */
function actionLine(phaseName: string, action: string): string {
  const text = atHead(DEV_LOOP_FILE);
  const start = text.indexOf(`  - name: ${phaseName}\n`);
  const next = text.indexOf('\n  - name: ', start + 1);
  const block = text.slice(start, next === -1 ? undefined : next);
  const line = block.split('\n').find((l) => l.includes(action));
  if (line === undefined) throw new Error(`no line declaring ${action} in phase ${phaseName}`);
  return line;
}

describe('AC 1 — dev-loop.yaml v1.5 declares the dl-134 separation of duties (red-first)', () => {
  it('loads at HEAD with zero errors', () => {
    const { diagnostics } = devLoop();
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('`red` is run by qa, in a fresh session (mode absent: fresh is mandatory for qa, dl-135 point 3)', () => {
    expect(phase('red').role).toBe('qa');
    expect(phase('red').mode).toBeUndefined();
  });

  it('`green` distinct_from [red]; `refactor` mode resume; `review` distinct_from [red, green, refactor]', () => {
    expect(phase('green').role).toBe('developer');
    expect(phase('green').distinct_from).toEqual(['red']);
    expect(phase('refactor').role).toBe('developer');
    expect(phase('refactor').mode).toBe('resume');
    expect(phase('review').role).toBe('reviewer');
    expect(phase('review').distinct_from).toEqual(['red', 'green', 'refactor']);
    expect(phase('review').mode).toBeUndefined();
  });

  it('`tests.unchanged(since: red)` is a post-check of `green` and of `refactor`', () => {
    expect(phase('green').checks?.post).toContain('tests.unchanged(since: red)');
    expect(phase('refactor').checks?.post).toContain('tests.unchanged(since: red)');
  });
});

describe('AC 2 — dl-061 A.1: a review reject re-enters at red, whose first action syncs the linked bugs back (red-first)', () => {
  it('`review` keeps its fallback { step: red, set_state: in-progress } with no `actions` key (no schema change)', () => {
    expect(phase('review').fallback).toEqual({ step: 'red', set_state: 'in-progress' });
  });

  it('the fallback step\'s FIRST action is `bug.sync_state(for_each: task.bug)`, a manual step whose commit is `wf(bug): sync`', () => {
    const { workflow } = devLoop();
    const target = phase(phase('review').fallback!.step);
    const first = target.actions?.[0];
    expect(first).toBe('bug.sync_state(for_each: task.bug)');
    expect(resolveToken(first!, 'action', loadWorkflowRegistryAtHead(ROOT).bindings)).toEqual({
      kind: 'manual',
      source: 'built-in',
      expectedCommit: { type: 'bug', verbs: ['sync'] },
    });
    // The workflow's element is the task the sync's `for_each` reads.
    expect(workflow.element).toBe('task');
  });

  it('the expected subject `wf(bug): sync <bug> [in-review → in-progress]` crosses a declared bug `gates` reject edge and reads back as a sync', () => {
    const memoryYaml = loadMemoryYamlAtHead(ROOT);
    expect(memoryYaml).not.toBeNull();
    const machine = resolveStateMachine(memoryYaml!, 'bug');
    const to = machine.gates?.['in-review']?.reject;
    expect(to).toBe('in-progress');
    const subject = `wf(bug): sync bug-001-example [in-review → ${to}]`;
    expect(parseMemoryOperation(subject)).toBe('sync');
    expect(parseBracketHops(subject)).toEqual([{ from: 'in-review', to: 'in-progress' }]);
    expect(isMachineEdge(machine, 'in-review', 'in-progress')).toBe(true);
  });

  it('the header records where the sync lands: first action of `red`, a no-op on a first pass', () => {
    expect(header()).toMatch(/dl-061 A\.1/);
    expect(header()).toMatch(/first action of `red`/);
    expect(header()).toMatch(/first pass/);
  });
});

describe('AC 3 — dl-061 B.1 / C.1 are stated in the header', () => {
  it('a sync crossing a `gates` reject edge cites the approver\'s reject sha (B.1)', () => {
    expect(header()).toMatch(/dl-061 B\.1/);
    expect(header()).toMatch(/cites the approver's reject commit/);
  });

  it('the reject procedure emits both commits, reject then sync (C.1)', () => {
    expect(header()).toMatch(/dl-061 C\.1/);
    expect(header()).toMatch(/emits both commits/);
  });
});

describe('AC 4 — the testing directive and roles.yaml halves of dl-134 (Action 4)', () => {
  const testing = (): string => readFileSync(join(ROOT, '.wingfoil/directives/custom/testing.md'), 'utf-8');

  it('testing.md carries the qa black-box rule (§1, Q1 (a)) and the freeze of red\'s files (§2, Q2 (a)), with a version', () => {
    const text = testing();
    // "1.1" at task-205; task-221 bumps it (the typecheck.clean bullet names `refactor`).
    expect(text).toMatch(/^version: "1\.[1-9]\d*"$/m);
    expect(text).toMatch(/\*\*T3 — `red` is `qa`'s, and it is black-box\.\*\*/);
    expect(text).toMatch(/dl-134` §1, Q1 \(a\)/);
    expect(text).toMatch(/\*\*T4 — `red`'s tests are frozen in `green` and `refactor`\.\*\*/);
    expect(text).toMatch(/dl-134` §2, Q2 \(a\)/);
    expect(text).toContain('tests.unchanged(since: red)');
  });

  it('testing.md points fixture authors to security-secrets S1 (dl-073 Action 3, bug-248 handover)', () => {
    expect(testing()).toMatch(/`security-secrets` S1/);
  });

  it('roles.yaml binds code-quality, testing and determinism to reviewer beside its own, from version 1.5', () => {
    const roles = loadRolesYaml(ROOT);
    // 1.5 is task-205's bump; a later binding moves it forward (1.6, task-270: wingfoil-cli global).
    expect(Number(roles.version)).toBeGreaterThanOrEqual(1.5);
    for (const id of ['code-review', 'traceability', 'command-baseline', 'code-quality', 'testing', 'determinism']) {
      expect(roles.assignments.reviewer).toContain(id);
    }
  });

  it('a reviewer\'s resolved directives include the developer\'s and qa\'s, with no warning', () => {
    const resolution = resolveRoleDirectives(loadDirectives(ROOT), loadRolesYaml(ROOT), 'reviewer');
    const ids = resolution.directives.map((d) => d.frontmatter.id);
    for (const id of ['code-quality', 'testing', 'determinism']) expect(ids).toContain(id);
    expect(resolution.warnings).toEqual([]);
  });
});

describe('AC 5 — version 1.5 and the WORKFLOW.md diagram', () => {
  it('dev-loop.yaml is at version 1.5 or later, with 1.5\'s history line (task-221 makes it 1.6)', () => {
    expect(devLoop().workflow.version).toBeGreaterThanOrEqual(1.5);
    expect(atHead(DEV_LOOP_FILE)).toMatch(/^version: \d+\.\d+ +# .*\b1\.5 dl-134 .*\(prev 1\.41/m);
  });

  it('WORKFLOW.md\'s dev-loop diagram shows `red` under qa', () => {
    const text = readFileSync(join(ROOT, '.wingfoil/WORKFLOW.md'), 'utf-8');
    const red = text.split('\n').find((line) => line.trimStart().startsWith('RED["'));
    expect(red).toBeDefined();
    expect(red).toContain('**red** *(qa)*');
  });
});

describe('AC 6 — dl-035: the resume path merges main into the task branch before re-submit', () => {
  it('`red` (the fallback step) merges main after the bug sync and before any red work', () => {
    const actions = (phase('red').actions ?? []).map(tokenName);
    expect(actions).toEqual(['bug.sync_state', 'git.merge', 'agent.execute']);
    expect(phase('red').actions![1]).toBe('git.merge(from: main)');
    expect(actionLine('red', 'git.merge(from: main)')).toMatch(/dl-035/);
  });

  it('`refactor` merges main as its LAST action, so its post-checks measure the merged tree (approver ruling 2026-10-09, option 2)', () => {
    const actions = phase('refactor').actions ?? [];
    expect(actions[actions.length - 1]).toBe('git.merge(from: main)');
    expect(actionLine('refactor', 'git.merge(from: main)')).toMatch(/dl-035 \(b\)/);
  });

  it('`review` does not merge: it stays read-only toward the branch except submit and the bug sync', () => {
    expect((phase('review').actions ?? []).map(tokenName)).toEqual(['tests.bdd.run', 'memory.submit', 'bug.sync_state']);
  });

  it('the header gives conflicts to the developer, never to qa, with no "returns to red" from red itself', () => {
    const text = header();
    expect(text).toMatch(/the developer runs it before `qa` starts/);
    expect(text).toMatch(/`qa` never resolves a conflict/);
    expect(text).toMatch(/last action of `refactor`/);
    expect(text).not.toMatch(/the task returns to `red` with the conflict/);
  });

  it('the merge is a bound manual step (no unbound action token)', () => {
    expect(resolveToken('git.merge(from: main)', 'action', loadWorkflowRegistryAtHead(ROOT).bindings).kind).toBe('manual');
  });
});

describe('dl-110 P2 — parking is declared in the header (handover from task-180)', () => {
  it('names the verb, the kept branch, the removed worktree and the bug sync back to planned', () => {
    const text = header();
    expect(text).toMatch(/dl-110 P2/);
    expect(text).toMatch(/memory park/);
    expect(text).toMatch(/branch `task\/\{task\.id\}` is kept/);
    expect(text).toMatch(/worktree is removed/);
    expect(text).toMatch(/in-progress → planned/);
  });
});

describe('review fixes (task-205 review F1, F2)', () => {
  it('F1: the park sync `[in-progress → planned]` is a declared bug edge — `returns: { in-progress: planned }` (dl-110 P1 (a))', () => {
    const memoryYaml = loadMemoryYamlAtHead(ROOT);
    expect(memoryYaml).not.toBeNull();
    const machine = resolveStateMachine(memoryYaml!, 'bug');
    expect(machine.returns).toEqual({ 'in-progress': 'planned' });
    expect(isMachineEdge(machine, 'in-progress', 'planned')).toBe(true);
    const subject = 'wf(bug): sync bug-001-example [in-progress → planned]';
    expect(parseMemoryOperation(subject)).toBe('sync');
    expect(parseBracketHops(subject)).toEqual([{ from: 'in-progress', to: 'planned' }]);
  });

  it("F2: the header says red's first-action sync also runs after done's fallback, whose task edge is dl-053's question", () => {
    expect(header()).toMatch(/also runs after `done`'s fallback/);
    expect(header()).toMatch(/dl-053/);
    expect(header()).not.toMatch(/gets no sync here/);
  });
});
