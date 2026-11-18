/**
 * task-376 — the details of the offered commands the acceptance suites leave open (`spec-017` §6.1, §7.6): the parser
 * and the operands of `memory add` in `src/workflow/bindings.ts`, the edge predicate of `src/memory/state-machine.ts`,
 * the warning of `workflow list`, and how the console prints a command, a target left out and a pending element.
 */
import { renderNextConsole, type NextResult, type Step } from '../../src/core';
import { actionArgumentDiagnostics } from '../../src/core/workflow-list-show';
import type { MemoryYaml, StateMachine } from '../../src/memory/schema';
import { hasTransitionEdge } from '../../src/memory/state-machine';
import { builtinCommand, memoryAddArguments, memoryAddOperands, memoryAddPatternTokens, SHOWN_OPERANDS, tokenArguments, unquoted } from '../../src/workflow/bindings';
import type { Workflow } from '../../src/workflow/schema';

const MEMORY = {
  version: 1,
  types: {
    task: { path: 'docs/{release}/{id}.md', id_pattern: 'task-{nnn}-{slug}' },
    release: { path: 'docs/rl-{line}/{id}.md', id_pattern: '{kind}-{version}-{line}' },
    note: { path: 'docs/notes/{id}.md' },
  },
} as unknown as MemoryYaml;

const literal = (raw: string): string | null => raw;

describe('task-376 — tokenArguments (the one parser of a token list)', () => {
  it.each<[string, [string, string][]]>([
    ['memory.submit', []],
    ['memory.add(type: bug, title: "a, b", tags: [x, y])', [['type', 'bug'], ['title', '"a, b"'], ['tags', '[x, y]']]],
    ['git.merge(from: main, bare)', [['from', 'main']]],
    ['broken) (', []],
  ])('%s', (token, expected) => {
    expect(tokenArguments(token)).toEqual(expected);
  });

  it('unquoted strips one matching pair only', () => {
    expect([unquoted('"a b"'), unquoted("'a'"), unquoted('"a\''), unquoted('plain')]).toEqual(['a b', 'a', '"a\'', 'plain']);
  });
});

describe('task-376 — the operands of memory add (spec-017 §6.1)', () => {
  it('a list joins by commas, and one element with no printable value makes the whole list a placeholder', () => {
    const interpolate = (raw: string): string | null => (raw.includes('{') ? null : raw);
    expect(memoryAddArguments('memory.add(type: bug, tags: ["a", b])', interpolate)).toEqual([{ name: 'tags', value: 'a,b' }]);
    expect(memoryAddArguments('memory.add(type: bug, tags: [a, "{x.y}"])', interpolate)).toEqual([{ name: 'tags', value: null }]);
  });

  it('the pattern tokens come from the id_pattern then the path, each once; an unknown type or no memory.yaml has none', () => {
    expect(memoryAddPatternTokens(MEMORY, 'release')).toEqual(['kind', 'version', 'line', 'id']);
    expect(memoryAddPatternTokens(MEMORY, 'note')).toEqual(['id']);
    expect(memoryAddPatternTokens(MEMORY, 'missing')).toEqual([]);
    expect(memoryAddPatternTokens(MEMORY, null)).toEqual([]);
    expect(memoryAddPatternTokens(null, 'task')).toEqual([]);
  });

  it('a token memory add fills itself is never a --set, declared or not; the numeric family included', () => {
    const tokens = memoryAddPatternTokens(MEMORY, 'task');
    expect(memoryAddOperands([{ name: 'slug', value: 'x' }], tokens)).toEqual(['--title', '<title>', '--set', 'release=<release>']);
  });

  it('an empty or unprintable value is the placeholder of its name', () => {
    const args = [{ name: 'title', value: '' }, { name: 'tags', value: null }, { name: 'kind', value: null }];
    expect(memoryAddOperands(args, ['kind'])).toEqual(['--title', '<title>', '--tags', '<tags>', '--set', 'kind=<kind>']);
  });

  it('declared tokens keep their declared order, the tokens not given follow in pattern order', () => {
    const args = memoryAddArguments('memory.add(type: release, line: l1, kind: minor)', literal);
    expect(memoryAddOperands(args, memoryAddPatternTokens(MEMORY, 'release'))).toEqual(['--title', '<title>', '--set', 'line=l1', '--set', 'kind=minor', '--set', 'version=<version>']);
  });

  it('workflow show prints a literal title as declared and an interpolated one as its placeholder', () => {
    const shown = (token: string): string[] => {
      const declared = memoryAddArguments(token, (raw) => (raw.includes('{') ? null : raw));
      return builtinCommand(token, ['wingfoil', 'memory', 'add', '--type', 'note'], { ...SHOWN_OPERANDS, add: memoryAddOperands(declared, []) });
    };
    expect(shown('memory.add(type: note, title: "End of life")').slice(5, 7)).toEqual(['--title', 'End of life']);
    expect(shown('memory.add(type: note, title: "Retro {release.version}")').slice(5, 7)).toEqual(['--title', '<title>']);
  });

  it('a built-in with no operand keeps its prefix', () => {
    expect(builtinCommand('config.init', ['wingfoil', 'init'], { ...SHOWN_OPERANDS, add: [] })).toEqual(['wingfoil', 'init']);
  });
});

describe('task-376 — hasTransitionEdge (spec-017 §6.1)', () => {
  const machine = { sequence: ['draft', 'pending', 'done'], gates: { pending: { reject: 'draft' } } } as unknown as StateMachine;

  it.each<[string, 'submit' | 'approve' | 'reject' | 'deprecate', boolean]>([
    ['draft', 'submit', true],
    ['pending', 'submit', false],
    ['pending', 'approve', true],
    ['draft', 'approve', false],
    ['pending', 'reject', true],
    ['done', 'reject', false],
    ['done', 'deprecate', true],
  ])('%s, %s: %s', (state, op, expected) => {
    expect(hasTransitionEdge(machine, state, op)).toBe(expected);
  });
});

describe('task-376 — W_ACTION_ARGUMENT_NOT_PASSED (spec-017 §2)', () => {
  const workflow = (actions: string[]): Workflow => ({ name: 'w', phases: [{ name: 'p', actions }, { name: 'empty' }] }) as unknown as Workflow;

  it('a token of the patterns, an option of the verb, an unknown type and any other action are not reported', () => {
    const actions = ['memory.add(type: task, title: "T", tags: [a], release: v1)', 'memory.add(type: missing, odd: 1)', 'memory.add', 'memory.submit'];
    expect(actionArgumentDiagnostics([workflow(actions)], ['w.yaml'], MEMORY)).toEqual([]);
  });

  it.each<[string, string]>([
    ['slug: s', "memory.add argument 'slug' cannot be passed: memory add --set reserves the name 'slug'"],
    ['status: draft', "memory.add argument 'status' cannot be passed: memory add --set reserves the name 'status'"],
    ['nnn: 7', "memory.add argument 'nnn' cannot be passed: memory add generates the numeric token {nnn}"],
    ['odd: 1', "memory.add argument 'odd' cannot be passed: type 'task' has no token {odd} in its id_pattern or path"],
  ])('%s is reported with the reason of its kind', (argument, message) => {
    const diagnostics = actionArgumentDiagnostics([workflow([`memory.add(type: task, ${argument})`])], ['w.yaml'], MEMORY);
    expect(diagnostics).toEqual([{ code: 'W_ACTION_ARGUMENT_NOT_PASSED', severity: 'warning', file: 'w.yaml', path: 'phases[0].actions[0]', message }]);
  });

  it('a numeric name no pattern holds has no such token', () => {
    const diagnostics = actionArgumentDiagnostics([workflow(['memory.add(type: note, nnn: 7)'])], ['w.yaml'], MEMORY);
    expect(diagnostics.map((entry) => entry.message)).toEqual(["memory.add argument 'nnn' cannot be passed: type 'note' has no token {nnn} in its id_pattern or path"]);
  });

  it('without memory.yaml no type is known, so nothing is reported', () => {
    expect(actionArgumentDiagnostics([workflow(['memory.add(type: task, odd: 1)'])], ['w.yaml'], null)).toEqual([]);
  });
});

describe('task-376 — the console of an offered command (spec-017 §6.1)', () => {
  const element = (id: string, status: string): { type: string; id: string; status: string } => ({ type: 'bug', id, status });
  const action = (overrides: Record<string, unknown>): Step['actions'][number] =>
    ({ token: 'a', text: 'a', unresolved: [], target: 'none', binding: { kind: 'wingfoil' }, ...overrides }) as unknown as Step['actions'][number];

  function console_(actions: Step['actions'], pendingCreated?: unknown[]): string[] {
    const step = {
      key: 'w.p',
      instance: 'i',
      trail: [],
      scope: null,
      role: null,
      agentRole: false,
      members: [],
      directives: [],
      actions,
      evidence: { kinds: ['created'], missing: ['created', 'produces'], finalizable: false, manualOnly: false },
      ...(pendingCreated === undefined ? {} : { pendingCreated }),
      awaiting: null,
      reentered: false,
    } as unknown as Step;
    const result: NextResult = { baseline: { rev: 'HEAD', commit: 'abc' }, instance: null, complete: false, next: step, more: [], diagnostics: [] };
    return renderNextConsole(result).split('\n');
  }

  it.each<[string, string]>([
    ['plain-word.1', 'plain-word.1'],
    ['dev-loop.red@task:task-1/waves#w0', 'dev-loop.red@task:task-1/waves#w0'],
    ['<id>', '<id>'],
    ['release=<release>', 'release=<release>'],
    ['two words', "'two words'"],
    ["it's", "'it'\\''s'"],
    ['$HOME', "'$HOME'"],
    ['a;b', "'a;b'"],
    ['#first', "'#first'"],
    ['<not a placeholder>', "'<not a placeholder>'"],
    ['', "''"],
  ])('the argv element %j prints as %s', (word, printed) => {
    expect(console_([action({ binding: { kind: 'wingfoil', argv: ['wingfoil', word] } })])).toContain(`    - a [wingfoil: wingfoil ${printed}]`);
  });

  it('several commands print one per line, and each target left out with its reason', () => {
    const lines = console_([
      action({
        binding: { kind: 'wingfoil', argv: ['wingfoil', 'one'], commands: [['wingfoil', 'one'], ['wingfoil', 'two']] },
        notOffered: [{ element: element('bug-3', 'draft'), reason: "no approve edge from 'draft'" }],
      }),
    ]);
    expect(lines).toEqual(expect.arrayContaining(['    - a [wingfoil]', '        wingfoil one', '        wingfoil two', "        not offered: bug-3 (no approve edge from 'draft')"]));
  });

  it('a pending element names its state and the paths not committed; a state not determined is said so', () => {
    const lines = console_([], [
      { element: element('bug-1', 'pending'), reaches: 'pending', missingPaths: ['docs/a.md', 'docs/b.md'] },
      { element: element('bug-2', 'draft'), reaches: null, missingPaths: [] },
    ]);
    expect(lines).toContain(
      '  evidence missing: created (bug-1 is pending, the phase leaves it pending, not committed: docs/a.md, docs/b.md; bug-2 is draft, the phase leaves it in a state it cannot determine), produces',
    );
  });

  it('no pending element: the kind is printed alone', () => {
    expect(console_([])).toContain('  evidence missing: created, produces');
  });
});
