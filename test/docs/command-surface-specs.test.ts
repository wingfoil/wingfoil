/**
 * The command surface in the specs (`task-165`, `bug-028`, `dl-046`).
 *
 * Three specs enumerate the commands the binary accepts outside the `<noun> <verb>` form: the
 * grammar (`spec-008-cli-grammar` §1, its grammar comment and its `<noun>` bullet), the command
 * contract (`spec-005-cli-command-contract`, Context) and the core-function table
 * (`spec-006-core-domain-api` §3, one row per command). `wingfoil mcp` shipped with `task-030` and was
 * missing from all three (`bug-028`), because nothing compared the lists with the program. This suite
 * does: it walks the Commander program `buildProgram` derives from `CORE_MODULES` — the same tree the
 * `bin` entry point runs, the hand-wired bootstrap commands `init` and `mcp` included — takes every
 * top-level command that has no verb (a flat command), and requires each spec list to name it. A list
 * may name more than ships (`audit` is planned, BDD P5.1.3), never less.
 *
 * It also holds REQ-SYS-05 to the exemption `dl-046` A(a) gave the bootstrap commands: a bootstrap
 * command is state-mutating (`init`) or hosts the MCP surface (`mcp`), has no MCP Tool, and the
 * requirement's Fit Criterion must say so by name, or the parity it states is false for it.
 *
 * Deterministic: every side is a sorted list derived from files in the repository.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';

const repoRoot = join(__dirname, '..', '..');
const specsDir = join(repoRoot, 'docs', '04_memory', 'design', 'specs');

function read(...segments: string[]): string {
  return readFileSync(join(...segments), 'utf8');
}

/** Every top-level command with no verb under it (Commander's implicit `help` excluded), sorted. */
function flatCommands(program: Command): string[] {
  return program.commands
    .filter((top) => top.commands.filter((sub) => sub.name() !== 'help').length === 0)
    .map((top) => top.name())
    .sort();
}

/** The flat commands that are not derived from `CORE_MODULES` — wired by hand in `src/cli/program.ts`. */
function bootstrapCommands(flat: readonly string[]): string[] {
  const moduleNames = new Set(CORE_MODULES.map((module) => module.name));
  return flat.filter((name) => !moduleNames.has(name));
}

/** The text of a Markdown section, from its heading line to the next heading of the same or a higher level. */
function section(markdown: string, heading: RegExp): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) throw new Error(`no heading matching ${String(heading)}`);
  const level = /^#+/.exec(lines[start] ?? '')?.[0].length ?? 0;
  const end = lines.findIndex((line, index) => index > start && /^#+ /.test(line) && (/^#+/.exec(line)?.[0].length ?? 0) <= level);
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/** The backticked names of the first parenthetical after `marker` in `text`, sorted. */
function parentheticalNames(text: string, marker: RegExp): string[] {
  const match = new RegExp(`${marker.source}[^(\\n]*\\(([^)]*)\\)`).exec(text);
  if (match === null) throw new Error(`no parenthetical after ${String(marker)}`);
  return [...(match[1] ?? '').matchAll(/`([^`]+)`/g)].map(([, name]) => name ?? '').sort();
}

/** What `names` lacks of `required`, sorted. */
function missing(required: readonly string[], names: readonly string[]): string[] {
  return required.filter((name) => !names.includes(name));
}

describe('the command surface in the specs (bug-028, dl-046)', () => {
  let flat: string[];
  let bootstrap: string[];

  beforeAll(async () => {
    const program = await buildProgram(CORE_MODULES, { resolveRoot: () => repoRoot, buildParams: () => ({}) });
    flat = flatCommands(program);
    bootstrap = bootstrapCommands(flat);
  });

  it('finds the flat commands the CLI ships, the two bootstrap commands among them (vacuity guard)', () => {
    expect(bootstrap).toEqual(['init', 'mcp']);
    expect(flat).toEqual(expect.arrayContaining(['init', 'mcp', 'paths']));
  });

  it("spec-008 §1's grammar comment and <noun> bullet name every flat command the CLI ships", () => {
    const grammar = section(read(specsDir, 'spec-008-cli-grammar.md'), /^### 1\. /);
    const comment = grammar.split('\n').find((line) => /# flat command/.test(line)) ?? '';
    const commentNames = [...comment.matchAll(/`([^`]+)`/g)].map(([, name]) => name ?? '');
    const bulletNames = parentheticalNames(grammar, /or a\s+flat command/);
    expect({ comment: missing(flat, commentNames), bullet: missing(flat, bulletNames) }).toEqual({ comment: [], bullet: [] });
  });

  it("spec-005's Context names every flat command the CLI ships", () => {
    const context = section(read(specsDir, 'spec-005-cli-command-contract.md'), /^## Context/);
    expect(missing(flat, parentheticalNames(context, /flat command/))).toEqual([]);
  });

  it('spec-006 §3 has a row for every flat command the CLI ships', () => {
    const table = section(read(specsDir, 'spec-006-core-domain-api.md'), /^### 3\. /);
    const rows = flat.filter((name) => new RegExp(`^\\|.*\\|\\s*\`wingfoil ${name}\`\\s*\\|`, 'm').test(table));
    expect(missing(flat, rows)).toEqual([]);
  });

  it("REQ-SYS-05's Fit Criterion names the bootstrap commands it exempts (dl-046 A(a))", () => {
    const requirement = section(read(repoRoot, 'docs', '02_requirements', '03_sard', '01_architecture.md'), /^### REQ-SYS-05 /);
    const fit = /\*\*Fit Criterion:\*\*([\s\S]*?)(?=\n\* \*\*|$)/.exec(requirement)?.[1] ?? '';
    const named = bootstrap.filter((name) => fit.includes(`\`${name}\``));
    expect(missing(bootstrap, named)).toEqual([]);
  });
});
