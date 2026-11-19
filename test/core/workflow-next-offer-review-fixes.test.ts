/**
 * task-376, fix round after review — in-process pins of what the compiled-CLI suites also drive (`spec-017` §6.1): the
 * edge predicate on a deprecated element and on a malformed machine, the actions `buildStep` reports, and the console of
 * a creation already made and of a placeholder whose name holds an underscore.
 */
import { buildStep, renderNextConsole, type NextResult, type Step } from '../../src/core';
import { RESERVED_SET_NAMES } from '../../src/memory/add';
import type { MemoryYaml, StateMachine } from '../../src/memory/schema';
import { hasTransitionEdge } from '../../src/memory/state-machine';
import { memoryAddOperands } from '../../src/workflow/bindings';
import type { DeducedAction, DeducedStep, ElementRef } from '../../src/workflow/deduce';
import type { Workflow } from '../../src/workflow/schema';

const MACHINE = { sequence: ['draft', 'pending', 'done'], gates: { pending: { reject: 'draft' } } } as unknown as StateMachine;

const MEMORY = {
  version: 1,
  types: { bug: { path: 'docs/bugs/{id}.md', id_pattern: 'bug-{n}-{slug}', states: MACHINE } },
} as unknown as MemoryYaml;

const bug = (id: string, status: string): ElementRef => ({ type: 'bug', id, status });

function action(token: string, targets: readonly ElementRef[]): DeducedAction {
  return { token, text: token, unresolved: [], target: 'selection', targetType: 'bug', targets, boundFrom: null };
}

function stepOf(actions: readonly DeducedAction[], pendingCreated?: DeducedStep['pendingCreated']): Step {
  const workflow = { name: 'loop', phases: [{ name: 'gate', optional: false, cadence: 'once' }] } as unknown as Workflow;
  const deduced = {
    key: 'loop.gate',
    instance: 'loop-1',
    trail: [],
    workflow: 'loop',
    phase: 'gate',
    scope: null,
    role: null,
    optional: false,
    produces: [],
    created: [],
    evidence: { kinds: ['created'], missing: ['created'], finalizable: false },
    ...(pendingCreated === undefined ? {} : { pendingCreated }),
    reentered: false,
    reentryCommit: null,
    actions,
  } as unknown as DeducedStep;
  return buildStep(deduced, { workflows: [workflow], memoryYaml: MEMORY, dnaYaml: null, bindings: null, rolesYaml: null, directiveFiles: [] });
}

function consoleOf(step: Step): string[] {
  const result: NextResult = { baseline: { rev: 'HEAD', commit: 'abc' }, instance: null, complete: false, next: step, more: [], diagnostics: [] };
  return renderNextConsole(result).split('\n');
}

describe('task-376 after review — hasTransitionEdge agrees with the verbs (spec-017 §6.1)', () => {
  it.each<[string, 'submit' | 'approve' | 'reject' | 'deprecate', boolean]>([
    ['deprecated', 'deprecate', false],
    ['superseded', 'deprecate', true],
    ['done', 'deprecate', true],
    ['draft', 'approve', false],
    ['pending', 'approve', true],
  ])('%s, %s: %s', (state, op, expected) => {
    expect(hasTransitionEdge(MACHINE, state, op)).toBe(expected);
  });

  it('a malformed machine is an error, not an answer that the edge is missing', () => {
    expect(() => hasTransitionEdge({} as unknown as StateMachine, 'draft', 'submit')).toThrow(TypeError);
  });
});

describe('task-376 after review — the actions buildStep reports (spec-017 §6.1)', () => {
  it('a deprecated target gets no memory deprecate command and is reported apart', () => {
    const [view] = stepOf([action('memory.deprecate', [bug('bug-1', 'deprecated')])]).actions;
    expect(view!.binding).toEqual({ kind: 'wingfoil' });
    expect(view!.notOffered).toEqual([{ element: bug('bug-1', 'deprecated'), reason: "no deprecate edge from 'deprecated'" }]);
  });

  it('beside a live target, the command names the live one alone', () => {
    const [view] = stepOf([action('memory.deprecate', [bug('bug-1', 'deprecated'), bug('bug-2', 'draft')])]).actions;
    expect(view!.binding).toEqual({ kind: 'wingfoil', argv: ['wingfoil', 'memory', 'deprecate', 'bug-2'] });
  });

  it('two eligible targets give one command each, argv the first', () => {
    const [view] = stepOf([action('memory.approve', [bug('bug-1', 'pending'), bug('bug-2', 'pending')])]).actions;
    const commands = ['bug-1', 'bug-2'].map((id) => ['wingfoil', 'memory', 'approve', id, '--reason', '<reason>']);
    expect(view!.binding).toEqual({ kind: 'wingfoil', argv: commands[0], commands });
    expect(view!.notOffered).toBeUndefined();
  });

  it('a creation already made reports done, offers no command, and prints every id on the console', () => {
    const step = stepOf([action('memory.add(type: bug)', [bug('bug-1', 'draft'), bug('bug-2', 'draft')])]);
    expect(step.actions[0]!.binding).toEqual({ kind: 'wingfoil' });
    expect(step.actions[0]!.done).toEqual([bug('bug-1', 'draft'), bug('bug-2', 'draft')]);
    expect(consoleOf(step)).toContain('    - memory.add(type: bug) — done: bug-1, bug-2');
  });

  it('pendingCreated is reported as deduced, and absent when the deduction has none', () => {
    const pending = [{ element: bug('bug-1', 'draft'), reaches: 'pending', missingPaths: [] }];
    expect(stepOf([], pending).pendingCreated).toEqual(pending);
    expect(stepOf([])).not.toHaveProperty('pendingCreated');
  });
});

describe('task-376 after review — the console never quotes a placeholder (spec-017 §6.1)', () => {
  it.each(['rel_line=<rel_line>', 'rel-line=<rel-line>', '<rel_line>'])('%s prints as it is', (word) => {
    const step = stepOf([]);
    const offered = { ...step, actions: [{ token: 'a', text: 'a', unresolved: [], target: 'none', binding: { kind: 'wingfoil', argv: ['wingfoil', word] } }] } as unknown as Step;
    expect(consoleOf(offered)).toContain(`    - a [wingfoil: wingfoil ${word}]`);
  });
});

describe('task-376 after review — one list of the names --set reserves (spec-008 §10)', () => {
  it('every reserved name stays out of the offered command', () => {
    expect(memoryAddOperands([], [...RESERVED_SET_NAMES])).toEqual(['--title', '<title>']);
  });
});
