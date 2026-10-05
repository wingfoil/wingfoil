/**
 * Every command's `--help` describes the command, names its argument and explains its options
 * (task-120-subcommand-help-describes-every-command, `bug-128`; `spec-008-cli-grammar` §8,
 * `P5.1.4-cli-ux.feature` "Help is available for every command").
 *
 * The suite walks the WHOLE Commander tree `buildProgram` derives from the production `CORE_MODULES`
 * — the same tree the `bin` entry point runs, the hand-wired `init`/`mcp` included — so a command
 * added later without a description, with a generic positional, or with an undescribed option fails
 * here rather than shipping. Nothing is hand-listed: the expected text is read back from the
 * declaration (`CoreModule.description`, `CoreOperation.description|positional|example`,
 * `CoreOption.description`, `CoreFlag.description`), which is what "taken from the same declaration
 * the command surface derives from" (AC 1) means as a test.
 *
 * Whether a positional declared required really IS required is a fact about behaviour, not about the
 * declaration; `./help-positional-required.integration.test.ts` checks that half against the compiled
 * CLI.
 */
import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import { deriveVerb, enumerateOperations, type CoreOperation } from '../../src/core/registry';

/** Argument names that describe the mechanism rather than the target (bug-128's `positionals`). */
const GENERIC_ARGUMENT_NAMES = new Set(['positional', 'positionals', 'args', 'arg', 'argument', 'arguments', 'value', 'values', 'target']);

/** Options Commander itself registers, whose text is Commander's. */
const COMMANDER_OWN_FLAGS = new Set(['-h, --help', '-V, --version']);

async function buildProductionProgram(): Promise<Command> {
  return buildProgram(CORE_MODULES, { resolveRoot: () => '/unused', buildParams: () => ({}) });
}

/** Every command below the root, Commander's implicit `help` excluded, with its space-joined path. */
function walk(root: Command): Array<{ path: string; command: Command }> {
  const out: Array<{ path: string; command: Command }> = [];
  const visit = (command: Command, prefix: string): void => {
    for (const child of command.commands) {
      if (child.name() === 'help') continue;
      const path = prefix ? `${prefix} ${child.name()}` : child.name();
      out.push({ path, command: child });
      visit(child, path);
    }
  };
  visit(root, '');
  return out;
}

/** The full help a user sees for `command`, including the text added after it (`addHelpText`). */
function renderedHelp(command: Command): string {
  let text = '';
  command.configureOutput({ writeOut: (chunk) => (text += chunk), writeErr: (chunk) => (text += chunk) });
  command.outputHelp();
  return text;
}

/** `CORE_MODULES`'s operations keyed by their CLI path (`"memory approve"`, `"paths"`). */
const OPERATIONS_BY_PATH = new Map<string, CoreOperation>(
  enumerateOperations(CORE_MODULES).map(({ module, operation }) => {
    const verb = deriveVerb(module.name, operation.name);
    return [verb ? `${module.name} ${verb}` : module.name, operation];
  }),
);

describe('every command in the tree has a one-line description (AC 1)', () => {
  it('walks a tree of the expected size (guard against a vacuous sweep)', async () => {
    const commands = walk(await buildProductionProgram());
    // init, mcp, 5 nouns, 18 derived leaves — at least.
    expect(commands.length).toBeGreaterThanOrEqual(25);
  });

  it('no command has an empty description', async () => {
    const undescribed = walk(await buildProductionProgram())
      .filter(({ command }) => command.description().trim() === '')
      .map(({ path }) => path);
    expect(undescribed).toEqual([]);
  });

  it('no description spans more than one line', async () => {
    const multiLine = walk(await buildProductionProgram())
      .filter(({ command }) => command.description().includes('\n'))
      .map(({ path }) => path);
    expect(multiLine).toEqual([]);
  });

  it('each noun shows its CoreModule.description and each derived command its CoreOperation.description', async () => {
    const program = await buildProductionProgram();
    for (const module of CORE_MODULES) {
      const noun = program.commands.find((command) => command.name() === module.name);
      const isFlat = Object.keys(module.operations).length === 1 && module.operations[module.name] !== undefined;
      // A module with no operation yet (`agent`, task-177) derives no command, so it has no noun to
      // describe; it must not show up as an empty one.
      if (Object.keys(module.operations).length === 0) {
        expect({ noun: module.name, shown: noun !== undefined }).toEqual({ noun: module.name, shown: false });
        continue;
      }
      if (!isFlat) expect({ noun: module.name, description: noun?.description() }).toEqual({ noun: module.name, description: module.description });
    }
    for (const { path, command } of walk(program)) {
      const operation = OPERATIONS_BY_PATH.get(path);
      if (operation) expect({ path, description: command.description() }).toEqual({ path, description: operation.description });
    }
  });
});

describe('every positional is named for what it is, and marked required where it is (AC 2)', () => {
  it('a derived command registers exactly the positional its operation declares, under that name', async () => {
    const mismatches: string[] = [];
    for (const { path, command } of walk(await buildProductionProgram())) {
      const operation = OPERATIONS_BY_PATH.get(path);
      if (!operation) continue;
      const registered = command.registeredArguments.map((argument) => argument.name());
      const declared = operation.positional ? [operation.positional.name] : [];
      if (JSON.stringify(registered) !== JSON.stringify(declared)) mismatches.push(`${path}: registered ${JSON.stringify(registered)}, declared ${JSON.stringify(declared)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('no argument anywhere in the tree has a generic name or an empty description', async () => {
    const bad: string[] = [];
    for (const { path, command } of walk(await buildProductionProgram())) {
      for (const argument of command.registeredArguments) {
        if (GENERIC_ARGUMENT_NAMES.has(argument.name())) bad.push(`${path}: generic name '${argument.name()}'`);
        if (!argument.description || argument.description.trim() === '') bad.push(`${path}: '${argument.name()}' undescribed`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the synopsis shows a required positional as <name> and an optional one as [name]', async () => {
    const bad: string[] = [];
    for (const { path, command } of walk(await buildProductionProgram())) {
      const positional = OPERATIONS_BY_PATH.get(path)?.positional;
      const help = renderedHelp(command);
      const usage = help.split('\n')[0] ?? '';
      if (usage.includes('positionals') || usage.includes('...')) bad.push(`${path}: ${usage}`);
      if (!positional) continue;
      const shown = positional.required ? `<${positional.name}>` : `[${positional.name}]`;
      if (!usage.includes(shown)) bad.push(`${path}: usage lacks ${shown}: ${usage}`);
    }
    expect(bad).toEqual([]);
  });

  it("a noun's verb list shows each verb with its positional as the verb's own synopsis does", async () => {
    const program = await buildProductionProgram();
    const help = program.createHelp();
    const bad: string[] = [];
    for (const { path, command } of walk(program)) {
      const positional = OPERATIONS_BY_PATH.get(path)?.positional;
      const term = help.subcommandTerm(command);
      if (term.includes('positionals') || term.includes('...')) bad.push(`${path}: ${term}`);
      if (positional && !term.includes(positional.required ? `<${positional.name}>` : `[${positional.name}]`)) bad.push(`${path}: ${term}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('every option is described (AC 2)', () => {
  it('no option carries an empty or generic "<name> value" / "<name> flag" description', async () => {
    const bad: string[] = [];
    for (const { path, command } of walk(await buildProductionProgram())) {
      for (const option of command.options) {
        if (COMMANDER_OWN_FLAGS.has(option.flags)) continue;
        const name = option.long?.replace(/^--/, '') ?? option.flags;
        const text = option.description.trim();
        if (text === '' || text === `${name} value` || text === `${name} flag`) bad.push(`${path}: ${option.flags} → '${text}'`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('an option its operation declares required says so in its description', async () => {
    const bad: string[] = [];
    for (const { path, command } of walk(await buildProductionProgram())) {
      for (const declared of OPERATIONS_BY_PATH.get(path)?.options ?? []) {
        if (declared.required !== true) continue;
        const option = command.options.find((candidate) => candidate.long === `--${declared.name}`);
        if (!option?.description.endsWith('(required)')) bad.push(`${path}: --${declared.name}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('a command with nothing below it prints an example and the exit codes (spec-008 §8, P5.1.4)', () => {
  it('every leaf command shows an Example: line invoking itself, and the three exit codes', async () => {
    const bad: string[] = [];
    for (const { path, command } of walk(await buildProductionProgram())) {
      if (command.commands.length > 0) continue;
      const help = renderedHelp(command);
      const example = /\nExample:\n {2}\$ (.+)\n/.exec(help)?.[1];
      if (!example?.startsWith(`wingfoil ${path}`)) bad.push(`${path}: example ${JSON.stringify(example)}`);
      if (!/\nExit codes:\n {2}0 .+\n {2}1 .+\n {2}2 .+/.test(help)) bad.push(`${path}: no exit codes`);
    }
    expect(bad).toEqual([]);
  });

  it("a derived command's example is the one its operation declares", async () => {
    for (const { path, command } of walk(await buildProductionProgram())) {
      const operation = OPERATIONS_BY_PATH.get(path);
      if (operation) expect({ path, help: renderedHelp(command) }).toEqual({ path, help: expect.stringContaining(`$ ${operation.example}\n`) });
    }
  });
});
