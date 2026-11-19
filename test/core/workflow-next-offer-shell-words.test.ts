/**
 * task-376, fix round after re-review — in-process pins of how the console tells a given value from a placeholder
 * (`spec-017` §6.1): the origin of each `memory add` operand, and the commands `buildStep` registers for the console.
 */
import { buildStep, renderNextConsole, type NextResult, type Step } from '../../src/core';
import type { MemoryYaml } from '../../src/memory/schema';
import { memoryAddOperandParts, memoryAddOperands, type BindingsYaml } from '../../src/workflow/bindings';
import type { DeducedAction, DeducedStep } from '../../src/workflow/deduce';
import type { Workflow } from '../../src/workflow/schema';

const MEMORY = { version: 1, types: { release: { path: 'docs/{id}.md', id_pattern: '{kind}-{version}' } } } as unknown as MemoryYaml;
const BINDINGS = { actions: { 'ops.say': { run: ['echo', '{word}', '<fixed>'] } } } as unknown as BindingsYaml;

function action(token: string, addArguments?: DeducedAction['addArguments']): DeducedAction {
  return { token, text: token, unresolved: [], target: 'none', targetType: null, targets: [], boundFrom: null, ...(addArguments === undefined ? {} : { addArguments }) };
}

function lines(actions: readonly DeducedAction[]): string[] {
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
    evidence: { kinds: ['record'], missing: ['record'], finalizable: true },
    reentered: false,
    reentryCommit: null,
    actions,
  } as unknown as DeducedStep;
  const step: Step = buildStep(deduced, { workflows: [workflow], memoryYaml: MEMORY, dnaYaml: null, bindings: BINDINGS, rolesYaml: null, directiveFiles: [] });
  const result: NextResult = { baseline: { rev: 'HEAD', commit: 'abc' }, instance: null, complete: false, next: step, more: [], diagnostics: [] };
  return renderNextConsole(result).split('\n');
}

describe('task-376 after re-review — the origin of a memory add operand (spec-017 §6.1)', () => {
  const args = [
    { name: 'title', value: '<tags>' },
    { name: 'tags', value: null },
    { name: 'kind', value: '<kind>' },
  ];

  it('a value the action gave is marked given, a placeholder spelled alike is not', () => {
    expect(memoryAddOperandParts(args, ['kind', 'version'])).toEqual([
      { text: '--title', given: false },
      { text: '<tags>', given: true },
      { text: '--tags', given: false },
      { text: '<tags>', given: false },
      { text: '--set', given: false },
      { text: 'kind=<kind>', given: true },
      { text: '--set', given: false },
      { text: 'version=<version>', given: false },
    ]);
  });

  it('an empty value is no value: it prints the placeholder', () => {
    expect(memoryAddOperandParts([{ name: 'title', value: '' }], [])).toEqual([
      { text: '--title', given: false },
      { text: '<title>', given: false },
    ]);
  });

  it('memoryAddOperands prints the same operands', () => {
    expect(memoryAddOperands(args, ['kind', 'version'])).toEqual(memoryAddOperandParts(args, ['kind', 'version']).map((part) => part.text));
  });
});

describe('task-376 after re-review — the console of a built command (spec-017 §6.1)', () => {
  it('memory add: the given values are quoted, the placeholders are not', () => {
    const add = action('memory.add(type: release)', [
      { name: 'title', value: '<draft>' },
      { name: 'kind', value: 'minor' },
    ]);
    expect(lines([add])).toContain(
      "    - memory.add(type: release) [wingfoil: wingfoil memory add --type release --title '<draft>' --set kind=minor --set version=<version> --workflow loop-1 --step loop.gate]",
    );
  });

  it('a Memory verb keeps its placeholders', () => {
    expect(lines([action('memory.approve')])).toContain('    - memory.approve [wingfoil: wingfoil memory approve <id> --reason <reason>]');
  });

  it('a project run command holds no placeholder: every element shaped like one is quoted', () => {
    expect(lines([action('ops.say(word: "<draft>")')])).toContain(`    - ops.say(word: "<draft>") [run: echo '<draft>' '<fixed>']`);
  });
});
