/**
 * Exit-code parity (`task-187`, `dl-116` Q1 (A)): the exit codes `spec-008-cli-grammar` §5,
 * `spec-005-cli-command-contract` §1 and `spec-009-validation-strategy` §3 enumerate, against the
 * exit-code selection in `src/core` (`exit-code.ts`, the one place an exit code is decided, task-012).
 *
 * The code side is behaviour, not source text: every outcome kind the selection classifies is run
 * through it — a success, a `CoreError` of every `CoreErrorCode` (the list below is typed as a
 * `Record<CoreErrorCode, …>`, so `tsc` fails it when a code is added or removed), a parser usage
 * error, a parser-incomplete invocation, an explicit help, a thrown `UsageError`, a thrown parse
 * failure and a thrown plain error — and the codes it returns are the set. For `spec-009` §3, each
 * `E_*` code the section binds to an exit code is built the way `src` builds it and run through
 * `exitCodeForThrow`.
 *
 * The enumerations compared, both directions:
 *
 * - `spec-008 §5 codes`, `spec-005 §1 codes` — the codes of each section's exit-code table;
 * - `spec-009 §3 exit codes` — one fact `E_CODE → n` per code named in the section's `**`n`**` bullets
 *   (a family pattern such as `E_INVALID_*` is not a code and is skipped).
 *
 * Warn mode for v0.3: see `enumeration-parity.allowlist.ts`. Deterministic: sorted sets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import {
  type CoreErrorCode,
  UsageError,
  classifyParseOutcome,
  exitCodeForError,
  exitCodeForResult,
  exitCodeForThrow,
} from '../../src/core';
import { E_INVALID_TRANSITION, resolveTransitionTarget } from '../../src/memory/state-machine';
import { E_VALIDATION, E_YAML_PARSE_ERROR, ValidationError, toValidationError } from '../../src/validation';
import {
  type ParityFinding,
  backticked,
  compareEnumeration,
  firstTableColumn,
  markdownSection,
  parityKey,
} from './support/enumeration-parity';
import { expectAllowlisted } from './support/parity-gate';

const repoRoot = join(__dirname, '..', '..');
const SPEC_008 = 'docs/04_memory/design/specs/spec-008-cli-grammar.md';
const SPEC_005 = 'docs/04_memory/design/specs/spec-005-cli-command-contract.md';
const SPEC_009 = 'docs/04_memory/design/specs/spec-009-validation-strategy.md';
const FIXTURE = join(__dirname, 'fixtures', 'enumeration-parity', 'exit-codes-drift.md');

const ENUMERATIONS = ['spec-008 §5 codes', 'spec-005 §1 codes', 'spec-009 §3 exit codes'] as const;

/** Every `CoreErrorCode`: `tsc` refuses this object when the union gains or loses a member. */
const CORE_ERROR_CODES: Record<CoreErrorCode, true> = { NOT_FOUND: true, INVALID_TRANSITION: true, VALIDATION: true, CONFLICT: true, IO: true };

/** The exit codes `src/core`'s selection returns over every outcome kind it classifies, sorted. */
function selectableCodes(): string[] {
  const codes = [
    exitCodeForResult({ ok: true, value: null }),
    ...Object.keys(CORE_ERROR_CODES).map((code) => exitCodeForError({ code: code as CoreErrorCode, message: 'm' })),
    classifyParseOutcome({ code: 'commander.unknownCommand', exitCode: 1 }).exitCode,
    classifyParseOutcome({ code: 'commander.help', exitCode: 1 }).exitCode,
    classifyParseOutcome({ code: 'commander.help', exitCode: 0 }).exitCode,
    exitCodeForThrow(new UsageError('m')).exitCode,
    exitCodeForThrow(ValidationError.yamlParse('f', 'm')).exitCode,
    exitCodeForThrow(new Error('m')).exitCode,
  ];
  return [...new Set(codes.map(String))].sort();
}

/** The exit code of each `E_*` code `src` exports a builder for, run through `exitCodeForThrow`, as `E_CODE → n`. */
function boundCodes(): string[] {
  const thrown = (build: () => unknown): number => {
    try {
      build();
    } catch (error) {
      return exitCodeForThrow(error).exitCode;
    }
    throw new Error('expected a throw');
  };
  const zodError = z.object({ a: z.string() }).safeParse({}).error;
  if (zodError === undefined) throw new Error('expected a ZodError');
  const machine = { sequence: ['draft', 'pending', 'done'], gates: { pending: { reject: 'draft' } } };
  return [
    `${E_YAML_PARSE_ERROR} → ${String(exitCodeForThrow(ValidationError.yamlParse('f', 'm')).exitCode)}`,
    `${E_VALIDATION} → ${String(exitCodeForThrow(toValidationError(zodError, 'f')).exitCode)}`,
    `${E_INVALID_TRANSITION} → ${String(thrown(() => resolveTransitionTarget(machine, 'draft', 'approve')))}`,
  ].sort();
}

/** `E_CODE → n` for every code a `- **`n`** —` bullet of `text` names. */
function bulletBindings(text: string): string[] {
  const facts: string[] = [];
  for (const [, code, body] of text.matchAll(/^- \*\*`(\d)`\*\*([\s\S]*?)(?=\n- |\n\n|(?![\s\S]))/gm)) {
    for (const name of backticked((body ?? '').replace(/\s+/g, ' '))) if (/^E_[A-Z_]+$/.test(name)) facts.push(`${name} → ${code ?? ''}`);
  }
  return facts;
}

/** Every finding of the three documents against the code side. */
export function exitCodeFindings(
  code: { codes: readonly string[]; bindings: readonly string[] },
  docs: { spec008: { path: string; text: string }; spec005: { path: string; text: string }; spec009: { path: string; text: string } },
): ParityFinding[] {
  const tableCodes = (text: string): string[] => firstTableColumn(text).filter((cell) => /^\d+$/.test(cell));
  const spec009 = markdownSection(docs.spec009.text, /^### 3\. /);
  const bindings = bulletBindings(spec009);
  if (bindings.length === 0) throw new Error(`${docs.spec009.path}: no exit-code bullets in §3`);
  return [
    ...compareEnumeration('spec-008 §5 codes', docs.spec008.path, tableCodes(markdownSection(docs.spec008.text, /^### 5\. /)), code.codes),
    ...compareEnumeration('spec-005 §1 codes', docs.spec005.path, tableCodes(markdownSection(docs.spec005.text, /^### 1\. /)), code.codes),
    ...compareEnumeration('spec-009 §3 exit codes', docs.spec009.path, bindings, code.bindings),
  ];
}

describe('exit-code parity — the engine, on a fixture', () => {
  it("reads src/core's selection: the three-code contract, and each bound E_* code's exit", () => {
    expect(selectableCodes()).toEqual(['0', '1', '2']);
    expect(boundCodes()).toEqual(['E_INVALID_TRANSITION → 1', 'E_VALIDATION → 1', 'E_YAML_PARSE_ERROR → 2']);
  });

  it('reports every drift of a drifted copy: a code missing, a code invented, an E_* code on the wrong exit', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const doc = { path: 'fixture.md', text };
    const findings = exitCodeFindings({ codes: selectableCodes(), bindings: boundCodes() }, { spec008: doc, spec005: doc, spec009: doc });
    expect(findings.map(parityKey).sort()).toEqual([
      'spec-005 §1 codes|fixture.md|missing|2',
      'spec-005 §1 codes|fixture.md|surplus|3',
      'spec-008 §5 codes|fixture.md|missing|2',
      'spec-008 §5 codes|fixture.md|surplus|3',
      'spec-009 §3 exit codes|fixture.md|missing|E_INVALID_TRANSITION → 1',
      'spec-009 §3 exit codes|fixture.md|missing|E_YAML_PARSE_ERROR → 2',
      'spec-009 §3 exit codes|fixture.md|surplus|E_INVALID_TRANSITION → 2',
      'spec-009 §3 exit codes|fixture.md|surplus|E_TELEPORT → 1',
    ]);
  });
});

describe('exit-code parity — spec-008, spec-005 and spec-009 in the repository', () => {
  it('lists every difference in the allowlist', () => {
    const read = (path: string): { path: string; text: string } => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') });
    const findings = exitCodeFindings(
      { codes: selectableCodes(), bindings: boundCodes() },
      { spec008: read(SPEC_008), spec005: read(SPEC_005), spec009: read(SPEC_009) },
    );
    expectAllowlisted('exit-code parity', findings, ENUMERATIONS);
  });
});
