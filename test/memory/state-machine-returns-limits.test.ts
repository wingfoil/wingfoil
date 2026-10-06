/**
 * task-180 (`dl-110` P1 (a), P3 (a); `spec-001-memory-yaml-schema`) — the two machine keys `memory park`
 * and the WIP limit stand on:
 *
 * - `returns: { <state>: <earlier state> }` — a declared backward edge that is not a rejection, taken by
 *   `memory park`. The schema refuses a target that is not an EARLIER state of `sequence` (AC3).
 * - `limits: { <state>: <positive integer> }` — an optional per-state WIP limit, enforced by the verb
 *   that enters the state (`test/core/memory-wip-limits.test.ts`).
 *
 * Pure: the schema and the engine only, no repository.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { MemoryYaml, StateMachine } from '../../src/memory/schema';
import {
  E_INVALID_TRANSITION,
  isMachineEdge,
  resolveTransitionTarget,
  resolveTypeTransition,
} from '../../src/memory/state-machine';
import { ValidationError } from '../../src/validation';

const TASK_SEQUENCE = ['draft', 'pending', 'backlog', 'in-progress', 'in-review', 'approved', 'done'];

const taskMachine = (extra: Record<string, unknown>): unknown => ({
  sequence: TASK_SEQUENCE,
  gates: { pending: { reject: 'draft' }, 'in-review': { reject: 'in-progress' } },
  waiting: ['backlog', 'approved'],
  ...extra,
});

function issuesOf(machine: unknown): string[] {
  const result = StateMachine.safeParse(machine);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('StateMachine `returns` — a declared return edge to an earlier state (AC3)', () => {
  it('accepts a return edge to an earlier state of `sequence`', () => {
    expect(issuesOf(taskMachine({ returns: { 'in-progress': 'backlog' } }))).toEqual([]);
    expect(issuesOf(taskMachine({ returns: { 'in-review': 'draft', 'in-progress': 'pending' } }))).toEqual([]);
  });

  it('is optional: a machine without it is unchanged', () => {
    const parsed = StateMachine.parse(taskMachine({}));
    expect(parsed.returns).toBeUndefined();
  });

  it.each([
    ['a later state', { 'in-progress': 'in-review' }, 'in-progress', 'in-review'],
    ['the same state', { 'in-progress': 'in-progress' }, 'in-progress', 'in-progress'],
    ['a state not in `sequence`', { 'in-progress': 'parked' }, 'in-progress', 'parked'],
  ])('refuses a target that is %s', (_label, returns, from, to) => {
    expect(issuesOf(taskMachine({ returns }))).toEqual([
      `\`returns\` target "${to}" of "${from}" must be an earlier state of \`sequence\``,
    ]);
  });

  it('refuses `deprecated` as a target: the reserved implicit state is never declared', () => {
    expect(issuesOf(taskMachine({ returns: { 'in-progress': 'deprecated' } }))).toEqual([
      '"deprecated" is a reserved implicit state and may not be a `returns` target',
    ]);
  });

  it('refuses a key that is not a member of `sequence`', () => {
    expect(issuesOf(taskMachine({ returns: { parked: 'backlog' } }))).toEqual(['`returns` key "parked" must be a member of `sequence`']);
  });

  it('refuses a target that is not a string', () => {
    expect(StateMachine.safeParse(taskMachine({ returns: { 'in-progress': 3 } })).success).toBe(false);
  });

  it('the type-level refinement names the owning type for a key outside `sequence` (P1.13 wording)', () => {
    const result = MemoryYaml.safeParse({
      version: 1,
      types: { task: { path: 'docs/{id}.md', states: taskMachine({ returns: { parked: 'backlog' } }) } },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      "transition target 'parked' not in declared states for type 'task'",
    );
  });
});

describe('StateMachine `limits` — optional per-state WIP limits (dl-110 P3 (a))', () => {
  it('accepts a positive integer per `sequence` state', () => {
    expect(issuesOf(taskMachine({ limits: { 'in-progress': 3, 'in-review': 1 } }))).toEqual([]);
    expect(StateMachine.parse(taskMachine({ limits: { 'in-progress': 3 } })).limits).toEqual({ 'in-progress': 3 });
  });

  it.each([[0], [-1], [1.5], ['3']])('refuses %p as a limit', (limit) => {
    expect(StateMachine.safeParse(taskMachine({ limits: { 'in-progress': limit } })).success).toBe(false);
  });

  it('refuses a key that is not a member of `sequence`', () => {
    expect(issuesOf(taskMachine({ limits: { parked: 1 } }))).toEqual(['`limits` key "parked" must be a member of `sequence`']);
  });

  it('refuses `deprecated` as a key', () => {
    expect(issuesOf(taskMachine({ limits: { deprecated: 1 } }))).toEqual([
      '"deprecated" is a reserved implicit state and may not be declared as a `limits` key',
    ]);
  });
});

describe('the `park` edge in the engine', () => {
  const machine = StateMachine.parse(taskMachine({ returns: { 'in-progress': 'backlog' } }));

  it('`park` from a state with a `returns` edge resolves to its target', () => {
    expect(resolveTransitionTarget(machine, 'in-progress', 'park')).toBe('backlog');
  });

  it.each(['draft', 'backlog', 'in-review', 'done'])('`park` from %s, which declares no return edge, is illegal', (state) => {
    expect(() => resolveTransitionTarget(machine, state, 'park')).toThrow(ValidationError);
  });

  // The `<to>` of the contract message is not pinned: task-181 (bug-165) changes how it is computed.
  // What a park refusal must say is the state it was refused from, the type, and why.
  it('the contract message names the state refused from and the type (dl-032), exit 1', () => {
    const memoryYaml = MemoryYaml.parse({ version: 1, types: { task: { path: 'docs/{id}.md', states: machine } } });
    try {
      resolveTypeTransition(memoryYaml, 'task', 'in-review', 'park');
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issue = (error as ValidationError).issues[0]!;
      expect(issue.code).toBe(E_INVALID_TRANSITION);
      expect(issue.message).toBe("illegal transition in-review -> (none) for type 'task'"); // task-181, dl-154
      expect(issue.detail).toContain('not a `returns` state');
      expect((error as ValidationError).exitCode).toBe(1);
    }
  });

  it('on a machine with no `returns` at all, `park` is refused the same way', () => {
    const memoryYaml = MemoryYaml.parse({ version: 1, types: { note: { path: 'docs/{id}.md' } } });
    expect(() => resolveTypeTransition(memoryYaml, 'note', 'draft', 'park')).toThrow(
      /illegal transition draft -> \(none\) for type 'note'$/, // task-181, dl-154
    );
  });

  it('`isMachineEdge` reads a `returns` edge as an edge of the machine (a park hop in a chain)', () => {
    expect(isMachineEdge(machine, 'in-progress', 'backlog')).toBe(true);
    expect(isMachineEdge(machine, 'in-review', 'backlog')).toBe(false);
  });
});

describe("this repository's `.wingfoil/memory.yaml` (AC4)", () => {
  const raw = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8');
  const memoryYaml = MemoryYaml.parse(load(raw));

  it('`task` declares the return edge `in-progress → backlog`, which `memory park` takes', () => {
    expect(memoryYaml.types['task']!.states!.returns).toEqual({ 'in-progress': 'backlog' });
    expect(resolveTypeTransition(memoryYaml, 'task', 'in-progress', 'park')).toBe('backlog');
  });
});
