/**
 * Command-list parity (`task-187`, `dl-116` Q1 (A)): the commands `spec-008-cli-grammar` and
 * `spec-005-cli-command-contract` enumerate, against the Commander program `buildProgram` derives
 * from `CORE_MODULES` — the tree the `bin` entry point runs, the bootstrap commands `init` and `mcp`
 * included, Commander's implicit `help` excluded.
 *
 * The enumerations compared, both directions (a command the document lacks is `missing`, a command
 * it names that does not ship is `surplus` — planned or retired, the allowlist says which):
 *
 * - `spec-008 §1` — the `<noun>` bullet's pillar namespaces and flat commands, the DNA pillar's verbs,
 *   and the verbs of the singular `directive` and plural `directives` nouns;
 * - `spec-008 §11` — every command the baseline table and its closing paragraph name;
 * - `spec-005 Context` — the pillar list and the flat-command list.
 *
 * `command-surface-specs.test.ts` (`task-165`) keeps its narrower rule — every shipped flat command is
 * named, in `spec-006` §3 too — and this gate adds the other direction and the verbs. Warn mode for
 * v0.3: see `enumeration-parity.allowlist.ts`. Deterministic: both sides are sorted sets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import {
  type ParityFinding,
  backticked,
  compareEnumeration,
  markdownSection,
  namesInParenthetical,
  namesInSentence,
  parityKey,
} from './support/enumeration-parity';
import { expectAllowlisted } from './support/parity-gate';

const repoRoot = join(__dirname, '..', '..');
const SPEC_008 = 'docs/04_memory/design/specs/spec-008-cli-grammar.md';
const SPEC_005 = 'docs/04_memory/design/specs/spec-005-cli-command-contract.md';
const FIXTURE = join(__dirname, 'fixtures', 'enumeration-parity', 'commands-drift.md');

/** The code side: each noun's verbs (a flat command has none). */
type CommandTree = ReadonlyMap<string, readonly string[]>;

const ENUMERATIONS = [
  'spec-008 §1 nouns',
  'spec-008 §1 flat commands',
  'spec-008 §1 dna verbs',
  'spec-008 §1 directive verbs',
  'spec-008 §1 directives verbs',
  'spec-008 §11 commands',
  'spec-005 Context nouns',
  'spec-005 Context flat commands',
] as const;

function commandTree(program: Command): CommandTree {
  return new Map(
    program.commands.map((top) => [top.name(), top.commands.map((sub) => sub.name()).filter((name) => name !== 'help').sort()] as const),
  );
}

const nouns = (tree: CommandTree): string[] => [...tree].filter(([, verbs]) => verbs.length > 0).map(([noun]) => noun);
const flats = (tree: CommandTree): string[] => [...tree].filter(([, verbs]) => verbs.length === 0).map(([noun]) => noun);
const leaves = (tree: CommandTree): string[] =>
  [...tree].flatMap(([noun, verbs]) => (verbs.length === 0 ? [noun] : verbs.map((verb) => `${noun} ${verb}`)));
const words = (names: readonly string[]): string[] => names.filter((name) => /^[a-z]+$/.test(name));

/** Every finding of the two documents against `tree`; `spec008`/`spec005` are the documents' text. */
export function commandFindings(tree: CommandTree, spec008: { path: string; text: string }, spec005: { path: string; text: string }): ParityFinding[] {
  const grammar = markdownSection(spec008.text, /^### 1\. /);
  const docNouns = words(namesInParenthetical(grammar, /is a pillar namespace/));
  const docFlats = words(namesInParenthetical(grammar, /or a\s+flat command/));
  // A command in §11 is `noun verb`, or a flat command alone; a bare noun (`the dna verbs`) is prose.
  const allNouns = new Set([...docNouns, ...nouns(tree)]);
  const allFlats = new Set([...docFlats, ...flats(tree)]);
  const baselines = backticked(markdownSection(spec008.text, /^### 11\. /)).filter((span) => {
    const [first = '', ...rest] = span.split(' ');
    return /^[a-z]+(?: [a-z]+)?$/.test(span) && (rest.length === 0 ? allFlats.has(first) : allNouns.has(first));
  });
  const context = markdownSection(spec005.text, /^## Context/);
  const verbs = (noun: string): readonly string[] => tree.get(noun) ?? [];

  return [
    ...compareEnumeration('spec-008 §1 nouns', spec008.path, docNouns, nouns(tree)),
    ...compareEnumeration('spec-008 §1 flat commands', spec008.path, docFlats, flats(tree)),
    ...compareEnumeration('spec-008 §1 dna verbs', spec008.path, words(namesInSentence(grammar, /The DNA pillar's verbs are/)), verbs('dna')),
    ...compareEnumeration('spec-008 §1 directive verbs', spec008.path, words(namesInParenthetical(grammar, /singular `directive`/)), verbs('directive')),
    ...compareEnumeration('spec-008 §1 directives verbs', spec008.path, words(namesInParenthetical(grammar, /plural `directives`/)), verbs('directives')),
    ...compareEnumeration('spec-008 §11 commands', spec008.path, baselines, leaves(tree)),
    ...compareEnumeration('spec-005 Context nouns', spec005.path, words(namesInParenthetical(context, /regardless of pillar/)), nouns(tree)),
    ...compareEnumeration('spec-005 Context flat commands', spec005.path, words(namesInParenthetical(context, /flat command/)), flats(tree)),
  ];
}

let tree: CommandTree;

beforeAll(async () => {
  tree = commandTree(await buildProgram(CORE_MODULES, { resolveRoot: () => repoRoot, buildParams: () => ({}) }));
});

describe('command-list parity — the engine, on a fixture', () => {
  it('reads a non-empty code side: nouns with verbs and flat commands, the bootstrap ones included', () => {
    expect(nouns(tree)).toEqual(expect.arrayContaining(['dna', 'memory']));
    expect(flats(tree)).toEqual(expect.arrayContaining(['init', 'mcp', 'paths']));
  });

  it('reports every drift of a drifted copy, in each enumeration, both directions', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const fixtureTree: CommandTree = new Map([
      ['dna', ['set', 'show']],
      ['directive', ['assign']],
      ['directives', ['list']],
      ['init', []],
      ['memory', ['add', 'submit']],
      ['paths', []],
    ]);
    const findings = commandFindings(fixtureTree, { path: 'spec-008.md', text }, { path: 'spec-005.md', text });
    expect(findings.map(parityKey).sort()).toEqual([
      'spec-005 Context flat commands|spec-005.md|missing|paths',
      'spec-005 Context nouns|spec-005.md|missing|directives',
      'spec-008 §1 directive verbs|spec-008.md|surplus|create',
      'spec-008 §1 directives verbs|spec-008.md|missing|list',
      'spec-008 §1 dna verbs|spec-008.md|surplus|teleport',
      'spec-008 §1 flat commands|spec-008.md|surplus|audit',
      'spec-008 §1 nouns|spec-008.md|missing|directives',
      'spec-008 §1 nouns|spec-008.md|surplus|agent',
      'spec-008 §11 commands|spec-008.md|missing|memory submit',
      'spec-008 §11 commands|spec-008.md|surplus|memory teleport',
    ]);
  });

  it('fails loudly when a section or a list it reads is gone', () => {
    expect(() => commandFindings(tree, { path: 'x', text: '## Context\n' }, { path: 'y', text: '## Context\n' })).toThrow(/no heading/);
  });
});

describe(`command-list parity — spec-008 and spec-005 in the repository`, () => {
  it('lists every difference in the allowlist', () => {
    const findings = commandFindings(
      tree,
      { path: SPEC_008, text: readFileSync(join(repoRoot, SPEC_008), 'utf8') },
      { path: SPEC_005, text: readFileSync(join(repoRoot, SPEC_005), 'utf8') },
    );
    expectAllowlisted('command-list parity', findings, ENUMERATIONS);
  });
});
