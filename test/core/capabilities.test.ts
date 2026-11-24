/**
 * task-362 (`spec-019` Task A, `dl-177`; feature P5.1.5) — the capabilities document, built in-process.
 *
 * - AC 1 (red-first): `wingfoil capabilities` is the self-named operation of a new `CoreModule` `capabilities`,
 *   `mutates: false`, `readsProject: false`, with no positional, flag or option, and `spec-019` §1's `--help`
 *   description and example.
 * - AC 3 (red-first; T-3, T-6, T-11): §3.1's keys in §3.2's order, `formats` rendered from `FILE_KIND_FORMATS`,
 *   `wingfoil` from the one build reader (`commit: 'unknown'` without `dist/build-info.json`), and §3.5's console
 *   layout for a hand-written document.
 * - AC 4 (red-first; T-1): `FILE_KIND_FORMATS` is bound to `src/validation/format.ts`'s numeric `_FORMAT` exports
 *   through §3.1's kinds table (kind → constant). Every constant is `1` today, so the binding is by name, never by
 *   value: a value match would pair each constant with all nine entries.
 * - AC 5 (red-first; T-4, T-5): `commands` is the code-unit-sorted union of `enumerateOperations(CORE_MODULES)` and
 *   `BOOTSTRAP_COMMANDS`, and equals, as a set, the leaf commands of `buildProgram(CORE_MODULES, …)`.
 * - AC 6 (red-first; T-7, T-8): each capability is present iff every command it requires is; the reserved names of
 *   §4.3 are declared and never reported; §4.2's names (seven since task-365's `governance-check`) and their `requires` are the one literal list here.
 * - AC 7 (red-first; T-10): the document without `wingfoil`, `JSON.stringify` plus `\n`, equals the committed
 *   fixture `test/core/fixtures/capabilities-document.json`, written at red from `spec-019` §3.5's lists (1018 bytes).
 *
 * Expected red: `src/core/capabilities.ts` does not exist (jest: `Cannot find module`; tsc: TS2307), and
 * `FILE_KIND_FORMATS` / `readBuildIdentity` are not exported (TS2305). Determinism (REQ-SYS-07): fixed inputs, and
 * every order is compared with a code-unit comparator, never `localeCompare`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import {
  BOOTSTRAP_COMMANDS,
  CAPABILITIES,
  CAPABILITIES_DOCUMENT_FORMAT,
  RESERVED_CAPABILITY_NAMES,
  buildCapabilitiesDocument,
  renderCapabilitiesConsole,
  type CapabilitiesDocument,
} from '../../src/core/capabilities';
import { deriveVerb, enumerateOperations, type CoreModule } from '../../src/core/registry';
import { readBuildIdentity } from '../../src/storage/build-stamp';
import * as formatExports from '../../src/validation/format';
import { FILE_KIND_FORMATS } from '../../src/validation/format';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const BUILD = { version: '0.4.0', commit: SHA } as const;
const FIXTURE = join(__dirname, 'fixtures', 'capabilities-document.json');

/** `spec-019` §1's two `--help` strings. */
const DESCRIPTION = 'print the file formats this WingFoil reads, its commands and the capabilities it provides';
const EXAMPLE = 'wingfoil capabilities --format json';

/** `spec-019` §3.1's kinds table: each kind and the `src/validation/format.ts` constant that is its `highest`. */
const KIND_CONSTANTS: Readonly<Record<string, string>> = {
  'agent-adapter': 'ADAPTER_MANIFEST_FORMAT',
  bindings: 'BINDINGS_YAML_FORMAT',
  directive: 'DIRECTIVE_FORMAT',
  dna: 'DNA_YAML_FORMAT',
  memory: 'MEMORY_YAML_FORMAT',
  'memory-template': 'MEMORY_TEMPLATE_FORMAT',
  roles: 'ROLES_YAML_FORMAT',
  workflow: 'WORKFLOW_FORMAT',
  workflows: 'WORKFLOWS_YAML_FORMAT',
};

/** `spec-019` §4.2's initial list, in code-unit order of the name, each `requires` as the table lists it. */
const SPEC_CAPABILITIES: readonly { name: string; requires: readonly string[] }[] = [
  { name: 'agent-execute', requires: ['agent execute'] },
  { name: 'directive-verbs', requires: ['directive create', 'directive assign', 'directive remove', 'directives list'] },
  { name: 'dna-verbs', requires: ['dna show', 'dna set', 'dna add', 'dna update', 'dna remove'] },
  // task-365 (`spec-019` OQ-4 (a), §4.2 as amended; design D6 (a)): the seventh capability, between `dna-verbs` and
  // `mcp-server` in code-unit order.
  { name: 'governance-check', requires: ['verify'] },
  { name: 'mcp-server', requires: ['mcp'] },
  {
    name: 'memory-verbs',
    requires: [
      'memory add',
      'memory submit',
      'memory approve',
      'memory reject',
      'memory deprecate',
      'memory amend',
      'memory park',
      'memory history',
      'memory search',
    ],
  },
  {
    name: 'workflow-tracking',
    requires: [
      'workflow list',
      'workflow show',
      'workflow start',
      'workflow next',
      'workflow status',
      'workflow finalize',
      'workflow end',
      'workflow adopt',
      'workflow rekey',
      'workflow create',
      'workflow remove',
    ],
  },
];

/** Ascending UTF-16 code-unit order (`a < b`), `spec-019` §3.2. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const codeUnitSorted = (list: readonly string[]): string[] => [...list].sort(byCodeUnit);

/** The command string `spec-019` §3.3 writes for an operation: `"<module> <verb>"`, or `"<module>"` for an empty verb. */
function commandOf(moduleName: string, operationName: string): string {
  const verb = deriveVerb(moduleName, operationName);
  return verb === '' ? moduleName : `${moduleName} ${verb}`;
}

/** A copy of `modules` without the operation whose command string is `command`. */
function withoutCommand(modules: readonly CoreModule[], command: string): CoreModule[] {
  return modules.map((module) => ({
    ...module,
    operations: Object.fromEntries(
      Object.entries(module.operations).filter(([, operation]) => commandOf(module.name, operation.name) !== command),
    ),
  }));
}

/** Every leaf command of `program`, Commander's implicit `help` excluded (the walk of `test/docs/cli-reference.test.ts`). */
function leafCommands(program: Command): string[] {
  const out: string[] = [];
  for (const top of program.commands) {
    const subs = top.commands.filter((sub) => sub.name() !== 'help');
    if (subs.length === 0) out.push(top.name());
    else for (const sub of subs) out.push(`${top.name()} ${sub.name()}`);
  }
  return out;
}

const fullDocument = (): CapabilitiesDocument => buildCapabilitiesDocument(CORE_MODULES, BUILD);

describe('task-362 AC 1 — the capabilities operation in CORE_MODULES (spec-019 §1)', () => {
  it('a module `capabilities` whose one operation is the self-named `capabilities`: mutates false, readsProject false, no positional, flag or option', () => {
    const module = CORE_MODULES.find((candidate) => candidate.name === 'capabilities');
    expect(module).toBeDefined();
    expect(Object.keys(module!.operations)).toEqual(['capabilities']);
    const operation = module!.operations.capabilities!;
    expect(operation.name).toBe('capabilities');
    expect(operation.mutates).toBe(false);
    expect((operation as unknown as { readsProject?: unknown }).readsProject).toBe(false);
    expect(operation.positional).toBeUndefined();
    expect(operation.flags).toBeUndefined();
    expect(operation.options).toBeUndefined();
  });

  it('its description and example are spec-019 §1\'s two strings', () => {
    const operation = CORE_MODULES.find((candidate) => candidate.name === 'capabilities')?.operations.capabilities;
    const help = operation as unknown as { description?: unknown; example?: unknown } | undefined;
    expect(help?.description).toBe(DESCRIPTION);
    expect(help?.example).toBe(EXAMPLE);
  });

  it('deriveVerb gives the empty verb, so the command is the bare `wingfoil capabilities`', () => {
    expect(deriveVerb('capabilities', 'capabilities')).toBe('');
  });

  it('the Commander program registers `capabilities` as a top-level command whose description is §1\'s', async () => {
    const program: Command = await buildProgram(CORE_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const command = program.commands.find((candidate) => candidate.name() === 'capabilities');
    expect(command).toBeDefined();
    expect(command!.description()).toBe(DESCRIPTION);
    expect(command!.commands.filter((sub) => sub.name() !== 'help')).toEqual([]);
  });
});

describe('task-362 AC 4 — T-1: FILE_KIND_FORMATS is bound to src/validation/format.ts (spec-019 §3.1)', () => {
  /** The module's exports whose name ends in `_FORMAT` and whose value is a number. */
  const numericFormatExports = (): [string, number][] =>
    Object.entries(formatExports as Record<string, unknown>)
      .filter((entry): entry is [string, number] => entry[0].endsWith('_FORMAT') && typeof entry[1] === 'number')
      .sort(([a], [b]) => byCodeUnit(a, b));

  it('nine frozen entries of frozen `{ kind, lowest, highest }`, kinds unique, kebab-case, in code-unit order', () => {
    expect(Array.isArray(FILE_KIND_FORMATS)).toBe(true);
    expect(Object.isFrozen(FILE_KIND_FORMATS)).toBe(true);
    expect(FILE_KIND_FORMATS).toHaveLength(9);
    for (const entry of FILE_KIND_FORMATS) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.keys(entry).sort(byCodeUnit)).toEqual(['highest', 'kind', 'lowest']);
      expect(entry.kind).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
    const kinds = FILE_KIND_FORMATS.map((entry) => entry.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(codeUnitSorted(kinds));
    expect(kinds).toEqual(Object.keys(KIND_CONSTANTS));
  });

  it('every numeric `_FORMAT` export is the `highest` of exactly one entry, the kind §3.1\'s table names; E_INVALID_FORMAT is not one', () => {
    const exported = numericFormatExports();
    expect(exported.map(([name]) => name)).toEqual(codeUnitSorted(Object.values(KIND_CONSTANTS)));
    for (const [name, value] of exported) {
      const kinds = Object.entries(KIND_CONSTANTS).filter(([, constant]) => constant === name).map(([kind]) => kind);
      expect(kinds).toHaveLength(1);
      const entry = FILE_KIND_FORMATS.find((candidate) => candidate.kind === kinds[0]);
      expect(entry?.highest).toBe(value);
    }
    expect(typeof (formatExports as Record<string, unknown>).E_INVALID_FORMAT).toBe('string');
    expect(exported.map(([name]) => name)).not.toContain('E_INVALID_FORMAT');
  });

  it('`lowest` is ADAPTER_MANIFEST_FORMAT for agent-adapter (a literal) and 1 for the eight formatField kinds; lowest ≤ highest', () => {
    for (const entry of FILE_KIND_FORMATS) {
      const expectedLowest = entry.kind === 'agent-adapter' ? formatExports.ADAPTER_MANIFEST_FORMAT : 1;
      expect([entry.kind, entry.lowest]).toEqual([entry.kind, expectedLowest]);
      expect(entry.lowest).toBeLessThanOrEqual(entry.highest);
      expect(Number.isInteger(entry.lowest) && entry.lowest >= 1).toBe(true);
    }
  });
});

describe('task-362 AC 3 — T-3, T-6: the document\'s keys, order and build identity (spec-019 §3.1, §3.2)', () => {
  it('top-level keys in §3.1\'s order; `wingfoil` is { version, commit }; each range is { lowest, highest }', () => {
    const document = fullDocument();
    expect(Object.keys(document)).toEqual(['format', 'wingfoil', 'formats', 'commands', 'capabilities']);
    expect(Object.keys(document.wingfoil)).toEqual(['version', 'commit']);
    expect(document.wingfoil).toEqual(BUILD);
    for (const range of Object.values(document.formats)) expect(Object.keys(range as object)).toEqual(['lowest', 'highest']);
  });

  it('`format` is CAPABILITIES_DOCUMENT_FORMAT, 1 in v0.4', () => {
    expect(CAPABILITIES_DOCUMENT_FORMAT).toBe(1);
    expect(fullDocument().format).toBe(CAPABILITIES_DOCUMENT_FORMAT);
  });

  it('T-3 — `formats` equals FILE_KIND_FORMATS rendered as the kind → { lowest, highest } mapping, keys in code-unit order', () => {
    const formats = fullDocument().formats;
    const expected = Object.fromEntries(
      [...FILE_KIND_FORMATS]
        .sort((a, b) => byCodeUnit(a.kind, b.kind))
        .map((entry) => [entry.kind, { lowest: entry.lowest, highest: entry.highest }]),
    );
    expect(formats).toEqual(expected);
    expect(Object.keys(formats)).toEqual(codeUnitSorted(Object.keys(formats)));
  });

  it('pure over its inputs: two builds of the same inputs are equal', () => {
    expect(JSON.stringify(fullDocument())).toBe(JSON.stringify(fullDocument()));
  });

  describe('T-6 — `wingfoil` comes from the one build reader, readBuildIdentity', () => {
    let pkg: string;
    /** A module directory of the compiled layout, `<pkg>/dist/storage` (the layout `test/storage/build-stamp.test.ts` builds). */
    let moduleDir: string;

    beforeEach(() => {
      pkg = mkdtempSync(join(tmpdir(), 'wf-capabilities-build-'));
      writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'wingfoil', version: '1.2.3' }));
      mkdirSync(join(pkg, 'dist', 'storage'), { recursive: true });
      moduleDir = join(pkg, 'dist', 'storage');
    });
    afterEach(() => rmSync(pkg, { recursive: true, force: true }));

    it('with no dist/build-info.json, `commit` is `unknown`', () => {
      expect(readBuildIdentity(moduleDir)).toEqual({ version: '1.2.3', commit: 'unknown' });
      expect(buildCapabilitiesDocument(CORE_MODULES, readBuildIdentity(moduleDir)).wingfoil).toEqual({ version: '1.2.3', commit: 'unknown' });
    });

    it('with a build record, `commit` is the recorded commit and `version` the package.json one', () => {
      writeFileSync(join(pkg, 'dist', 'build-info.json'), JSON.stringify({ version: '0.0.1', commit: SHA }));
      const identity = readBuildIdentity(moduleDir);
      expect(identity).toEqual({ version: '1.2.3', commit: SHA });
      expect(Object.keys(identity)).toEqual(['version', 'commit']);
    });
  });
});

describe('task-362 AC 5 — T-4, T-5: the command list (spec-019 §3.3)', () => {
  it('T-4 — the code-unit-sorted union of enumerateOperations(CORE_MODULES) and BOOTSTRAP_COMMANDS, no duplicate', () => {
    expect(BOOTSTRAP_COMMANDS).toEqual(['init', 'mcp']);
    expect(Object.isFrozen(BOOTSTRAP_COMMANDS)).toBe(true);
    const derived = enumerateOperations(CORE_MODULES).map(({ module, operation }) => commandOf(module.name, operation.name));
    const expected = codeUnitSorted([...new Set([...derived, ...BOOTSTRAP_COMMANDS])]);
    const commands = fullDocument().commands;
    expect(commands).toEqual(expected);
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands).toEqual(codeUnitSorted(commands));
    for (const command of ['capabilities', 'paths', 'init', 'mcp']) expect(commands).toContain(command);
  });

  it('T-5 — equal as sets to the leaf commands of buildProgram(CORE_MODULES, …), `help` excluded', async () => {
    const program: Command = await buildProgram(CORE_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    expect(codeUnitSorted(fullDocument().commands)).toEqual(codeUnitSorted(leafCommands(program)));
  });
});

describe('task-362 AC 6 — T-7, T-8: the capabilities (spec-019 §4)', () => {
  it('T-8 — CAPABILITIES is §4.2\'s list: the seven names in code-unit order, each `requires` as the table lists it, frozen', () => {
    expect(CAPABILITIES.map((entry) => ({ name: entry.name, requires: [...entry.requires] }))).toEqual(
      SPEC_CAPABILITIES.map((entry) => ({ name: entry.name, requires: [...entry.requires] })),
    );
    expect(Object.isFrozen(CAPABILITIES)).toBe(true);
  });

  it('T-8 — names are kebab-case and unique; every `requires` entry is a command of the document', () => {
    const names = CAPABILITIES.map((entry) => entry.name);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    expect(new Set(names).size).toBe(names.length);
    const commands = fullDocument().commands;
    for (const entry of CAPABILITIES) for (const command of entry.requires) expect([entry.name, commands]).toEqual([entry.name, expect.arrayContaining([command])]);
  });

  it('T-8 — the reserved names of §4.3 are declared, and none is in CAPABILITIES or in the document', () => {
    expect(RESERVED_CAPABILITY_NAMES).toEqual(['migrate', 'pack-install', 'workflow-engine']);
    expect(Object.isFrozen(RESERVED_CAPABILITY_NAMES)).toBe(true);
    const names = CAPABILITIES.map((entry) => entry.name);
    const reported = fullDocument().capabilities;
    for (const reserved of RESERVED_CAPABILITY_NAMES) {
      expect(names).not.toContain(reserved);
      expect(reported).not.toContain(reserved);
    }
  });

  it('T-7 — over the full CORE_MODULES every CAPABILITIES name is reported, in code-unit order', () => {
    expect(fullDocument().capabilities).toEqual(codeUnitSorted(CAPABILITIES.map((entry) => entry.name)));
  });

  it('T-7 — removing one required command removes exactly the capabilities that require it', () => {
    let removals = 0;
    for (const capability of CAPABILITIES) {
      for (const command of capability.requires) {
        if ((BOOTSTRAP_COMMANDS as readonly string[]).includes(command)) continue; // not in CORE_MODULES: checked below
        const document = buildCapabilitiesDocument(withoutCommand(CORE_MODULES, command), BUILD);
        expect(document.commands).not.toContain(command);
        const expected = codeUnitSorted(CAPABILITIES.filter((entry) => !entry.requires.includes(command)).map((entry) => entry.name));
        expect([command, document.capabilities]).toEqual([command, expected]);
        removals += 1;
      }
    }
    expect(removals).toBeGreaterThan(0);
  });

  it('T-7 — mcp-server requires the bootstrap command `mcp` alone, which no CORE_MODULES change removes, and is present', () => {
    expect(CAPABILITIES.find((entry) => entry.name === 'mcp-server')?.requires).toEqual(['mcp']);
    expect(buildCapabilitiesDocument([], BUILD).capabilities).toEqual(['mcp-server']);
    expect(fullDocument().capabilities).toContain('mcp-server');
  });
});

describe('task-362 AC 7 — T-10: the committed fixture (spec-019 §5)', () => {
  it('the document without `wingfoil`, JSON.stringify plus one \\n, equals test/core/fixtures/capabilities-document.json byte for byte', () => {
    const rest: Record<string, unknown> = { ...buildCapabilitiesDocument(CORE_MODULES, readBuildIdentity()) };
    delete rest.wingfoil;
    expect(Object.keys(rest)).toEqual(['format', 'formats', 'commands', 'capabilities']);
    expect(`${JSON.stringify(rest)}\n`).toBe(readFileSync(FIXTURE, 'utf-8'));
  });
});

describe('task-362 AC 3 — T-11: the console layout of spec-019 §3.5', () => {
  it('a hand-written document: header, three sections each after one blank line, two-space items, `(0)` with no item, one final \\n', () => {
    const document: CapabilitiesDocument = {
      format: 1,
      wingfoil: { version: '0.4.0', commit: SHA },
      formats: { 'agent-adapter': { lowest: 1, highest: 1 }, dna: { lowest: 1, highest: 2 } },
      commands: ['capabilities', 'init', 'paths'],
      capabilities: [],
    };
    expect(renderCapabilitiesConsole(document)).toBe(
      [
        `wingfoil 0.4.0 (${SHA}), capabilities document format 1`,
        '',
        'formats read (kind: lowest..highest):',
        '  agent-adapter: 1..1',
        '  dna: 1..2',
        '',
        'commands (3):',
        '  capabilities',
        '  init',
        '  paths',
        '',
        'capabilities (0):',
        '',
      ].join('\n'),
    );
  });

  it('the full document: every command and capability on its own line, the counts in the headings', () => {
    const document = fullDocument();
    const lines = renderCapabilitiesConsole(document).split('\n');
    expect(lines[0]).toBe(`wingfoil 0.4.0 (${SHA}), capabilities document format 1`);
    const commandsAt = lines.indexOf(`commands (${document.commands.length}):`);
    expect(commandsAt).toBeGreaterThan(0);
    expect(lines.slice(commandsAt + 1, commandsAt + 1 + document.commands.length)).toEqual(document.commands.map((command) => `  ${command}`));
    const capabilitiesAt = lines.indexOf(`capabilities (${document.capabilities.length}):`);
    expect(capabilitiesAt).toBeGreaterThan(commandsAt);
    expect(lines.slice(capabilitiesAt + 1)).toEqual([...document.capabilities.map((name) => `  ${name}`), '']);
  });
});
