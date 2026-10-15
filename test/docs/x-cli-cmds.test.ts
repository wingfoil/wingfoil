/**
 * task-245 — `docs/01_vision/X_cli-cmds.md` states the shipped command surface, in one notation
 * (bug-099, bug-100), with a row for every command the CLI ships, and US-6-01 / US-6-02 spell the
 * workflow commands as they ship (W3 B6 handover).
 *
 * The shipped surface is the Commander program `buildProgram` derives from `CORE_MODULES`, built exactly
 * as `cli-reference.test.ts` builds it: its leaf commands, each command's positional as `--help`'s usage
 * line writes it (`<x>` required, `[x]` optional — `usage()`, which `program.ts` builds from the
 * operation's declared positional) and its long options. The document is split at `## Revision history`:
 * the *body* is what precedes it, the *history* the rest (decision D1: a revision entry is a record and
 * keeps the words it was written with). A *command row* is a body line starting ``| `wingfoil ``; its
 * *synopsis* is the row's first code span, with `\|` read as `|`.
 *
 * Deterministic: fixed inputs, findings in document or command order.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';

const repoRoot = join(__dirname, '..', '..');
const cliCmdsPath = join(repoRoot, 'docs', '01_vision', 'X_cli-cmds.md');
const storyMapPath = join(repoRoot, 'docs', '02_requirements', '01_user_story_map', '07_workflow-config.md');

interface Shipped {
  path: string;
  command: Command;
  /** The declared positional, as the usage line writes it, or undefined. */
  positional?: { name: string; required: boolean };
  /** Every registered long option, `--dry-run` included. */
  options: string[];
}

async function shippedProgram(): Promise<Command> {
  return buildProgram(CORE_MODULES, { resolveRoot: () => repoRoot, buildParams: () => ({}) });
}

/** Every leaf command, in program order, Commander's implicit `help` excluded. */
function shippedCommands(program: Command): Shipped[] {
  const out: Shipped[] = [];
  const add = (path: string, command: Command): void => {
    const term = /(?:^|\s)(<([a-z][a-z-]*)>|\[([a-z][a-z-]*)\])(?=\s|$)/.exec(command.usage().replace('[options]', ''));
    const positional =
      term === null ? undefined : { name: (term[2] ?? term[3]) as string, required: term[2] !== undefined };
    out.push({ path, command, positional, options: command.options.map((option) => option.long as string) });
  };
  for (const top of program.commands) {
    const subs = top.commands.filter((sub) => sub.name() !== 'help');
    if (subs.length === 0) add(top.name(), top);
    else for (const sub of subs) add(`${top.name()} ${sub.name()}`, sub);
  }
  return out;
}

function document(): { body: string[]; history: string; whole: string } {
  const whole = readFileSync(cliCmdsPath, 'utf8');
  const at = whole.indexOf('\n## Revision history');
  if (at < 0) throw new Error('X_cli-cmds.md has no "## Revision history" heading');
  return { body: whole.slice(0, at).split('\n'), history: whole.slice(at), whole };
}

/** The first code span of a table row, with the `\|` escape read as `|`. */
function synopsis(row: string): string {
  const span = /`([^`]*)`/.exec(row);
  if (span === null) throw new Error(`row without a code span: ${row}`);
  return (span[1] as string).replace(/\\\|/g, '|');
}

function commandRows(body: string[]): Array<{ line: number; row: string; synopsis: string }> {
  return body.flatMap((row, index) => (row.startsWith('| `wingfoil ') ? [{ line: index + 1, row, synopsis: synopsis(row) }] : []));
}

/** True when `synopsis` begins `wingfoil <path>` followed by a space or its end. */
function isRowOf(synopsisText: string, path: string): boolean {
  const head = `wingfoil ${path}`;
  return synopsisText === head || synopsisText.startsWith(`${head} `);
}

/** The lines of the body section opened by `heading` (a `## ` line), up to the next `## ` heading. */
function section(body: string[], heading: string): string[] {
  const start = body.indexOf(heading);
  if (start < 0) return [];
  const rest = body.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return end < 0 ? rest : rest.slice(0, end);
}

/** Numeric `major.minor` comparison (bug-314: a version pin is "≥", never `toBe`). */
function versionAtLeast(actual: string, floor: string): boolean {
  const [a1, a2] = actual.split('.').map(Number) as [number, number];
  const [f1, f2] = floor.split('.').map(Number) as [number, number];
  return a1 > f1 || (a1 === f1 && a2 >= f2);
}

function headerVersion(text: string): string {
  const match = /^\*\*Version:\*\* (\d+\.\d+)/m.exec(text);
  if (match === null) throw new Error('no **Version:** header');
  return match[1] as string;
}

describe('AC 1 (bug-099) — no stale claim survives in the body', () => {
  it('no body line names tech-stack or says "interactive or flag-based"', () => {
    // `grep -n "tech-stack\|interactive or flag-based" docs/01_vision/X_cli-cmds.md`, body only (D1).
    const hits = document()
      .body.map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => /tech-stack|interactive or flag-based/.test(line))
      .map(([n, line]) => `${n}: ${line.trim().slice(0, 100)}`);
    expect(hits).toEqual([]);
  });

  it('every **Sync Process:** paragraph is marked *Not built* (D5)', () => {
    const { body } = document();
    const paragraphs: string[] = [];
    body.forEach((line, index) => {
      if (!line.startsWith('**Sync Process:**')) return;
      const end = body.findIndex((next, at) => at > index && next.trim() === '');
      paragraphs.push(body.slice(index, end < 0 ? undefined : end).join('\n'));
    });
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.filter((paragraph) => !paragraph.includes('*Not built*'))).toEqual([]);
  });

  it('the --dry-run row names exactly the commands that register --dry-run, after the verb, exit 2 for the rest', async () => {
    const shipped = shippedCommands(await shippedProgram());
    const takers = shipped.filter((command) => command.options.includes('--dry-run')).map((command) => command.path);
    const row = section(document().body, '## Global Options').find((line) => line.startsWith('| `--dry-run`'));
    expect(row).toBeDefined();
    const paths = new Set(shipped.map((command) => command.path));
    const named = [...(row as string).matchAll(/`([^`]+)`/g)]
      .map(([, span]) => (span as string).replace(/^wingfoil /, ''))
      .filter((span) => paths.has(span));
    expect([...new Set(named)].sort()).toEqual([...takers].sort());
    expect(row).toContain('after the verb');
    expect(row).toContain('exit `2`');
  });

  it('every root-program long option has a Global Options row', async () => {
    const program = await shippedProgram();
    const roots = [...program.options.map((option) => option.long as string), '--help'];
    const rows = section(document().body, '## Global Options').filter((line) => line.startsWith('| `'));
    const firstCells = rows.map((row) => row.split('|')[1] ?? '');
    const missing = roots.filter((flag) => !firstCells.some((cell) => new RegExp(`${flag}(?![a-z-])`).test(cell)));
    expect(missing).toEqual([]);
  });

  it('no command row carries a per-row --format (D3: stated once, in Global Options)', () => {
    const rows = commandRows(document().body).filter(({ row }) => row.includes('--format'));
    expect(rows.map(({ line, synopsis: s }) => `${line}: ${s}`)).toEqual([]);
  });
});

describe('AC 2 (bug-100) — one notation, the shipped one', () => {
  it('no [<word>-id] bracketed positional is left anywhere in the file', () => {
    // `grep -c "\[[a-z-]*-id\]" docs/01_vision/X_cli-cmds.md` → 0
    expect(document().whole.match(/\[[a-z-]*-id\]/g) ?? []).toEqual([]);
  });

  it('the pillar note that some rows "predate the convention" is removed', () => {
    expect(document().body.filter((line) => line.includes('predate the convention'))).toEqual([]);
  });

  it("every shipped command's row spells its positional and its options as the CLI registers them", async () => {
    const shipped = shippedCommands(await shippedProgram());
    const findings: string[] = [];
    for (const { line, synopsis: s } of commandRows(document().body)) {
      const command = shipped.filter(({ path }) => isRowOf(s, path)).sort((a, b) => b.path.length - a.path.length)[0];
      if (command === undefined) continue;
      const where = `${line} (${command.path}): ${s}`;
      if (command.positional !== undefined) {
        const { name, required } = command.positional;
        if (required && (!s.includes(`<${name}>`) || s.includes(`[<${name}>]`))) findings.push(`${where} — expected <${name}>`);
        if (!required && !s.includes(`[<${name}>]`)) findings.push(`${where} — expected [<${name}>]`);
      }
      const tokens = [...s.matchAll(/--([a-z][a-z_-]*)(<)?/g)].map(([, name, pattern]) => ({ name: `--${name}`, pattern: pattern !== undefined }));
      for (const option of command.options) {
        if (option === '--dry-run' || option === '--help') continue;
        const named = tokens.some(({ name, pattern }) => (pattern ? option.startsWith(name) : name === option));
        if (!named) findings.push(`${where} — missing ${option}`);
      }
      for (const { name, pattern } of tokens) {
        const registered = pattern ? command.options.some((option) => option.startsWith(name)) : command.options.includes(name);
        if (!registered) findings.push(`${where} — ${name}${pattern ? '<…>' : ''} is not registered`);
      }
    }
    expect(findings).toEqual([]);
  });
});

describe('AC 3 — a row for every shipped command, planned rows marked, the version recorded', () => {
  it('every shipped leaf command has exactly one command row', async () => {
    const rows = commandRows(document().body);
    const counts = shippedCommands(await shippedProgram()).map(({ path }) => {
      const own = rows.filter(({ synopsis: s }) => isRowOf(s, path));
      return `${path}: ${own.length}`;
    });
    expect(counts.filter((entry) => !entry.endsWith(': 1'))).toEqual([]);
  });

  it('every row of a command no build ships is marked *Not built*', async () => {
    const paths = shippedCommands(await shippedProgram()).map(({ path }) => path);
    const unshipped = commandRows(document().body).filter(({ synopsis: s }) => !paths.some((path) => isRowOf(s, path)));
    expect(unshipped.length).toBeGreaterThan(0);
    expect(unshipped.filter(({ row }) => !row.includes('*Not built*')).map(({ synopsis: s }) => s)).toEqual([]);
  });

  it('the header is at version 1.7 or later, with a dated 1.7 entry (task-245) and the missing 1.5 entry (task-179)', () => {
    const { whole, history } = document();
    expect(versionAtLeast(headerVersion(whole), '1.7')).toBe(true);
    const entries = [...history.matchAll(/^\*\*Version (\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)/gm)].map(([, version]) => version as string);
    const descending = entries.every((version, index) => {
      const previous = entries[index - 1];
      return previous === undefined || (previous !== version && versionAtLeast(previous, version));
    });
    expect(descending).toBe(true);
    const entry = (version: string): string => {
      const start = history.indexOf(`**Version ${version} (`);
      if (start < 0) return '';
      const next = history.indexOf('\n**Version ', start + 1);
      return history.slice(start, next < 0 ? undefined : next);
    };
    expect(entries).toEqual(expect.arrayContaining(['1.7', '1.5']));
    expect(entry('1.7')).toContain('task-245');
    expect(entry('1.5')).toContain('task-179');
  });
});

describe('AC 4 — task-138, task-169, task-127 and task-180 reach the document', () => {
  it('the --entry-<field> parameter row names every --entry-* option dna add registers', async () => {
    const dnaAdd = shippedCommands(await shippedProgram()).find(({ path }) => path === 'dna add');
    const entries = (dnaAdd?.options ?? []).filter((option) => option.startsWith('--entry-'));
    expect(entries).toContain('--entry-adapter');
    const row = document().body.find((line) => line.startsWith('| `--entry-<field>`'));
    expect(row).toBeDefined();
    expect(entries.filter((option) => !new RegExp(`${option}(?![a-z_-])`).test(row as string))).toEqual([]);
  });

  it("the paths row and the category parameter row name every category paths' --help lists", async () => {
    const paths = shippedCommands(await shippedProgram()).find(({ path }) => path === 'paths');
    const description = (paths?.command.registeredArguments[0]?.description ?? '').replace(/\s*\(.*\)\s*$/, '');
    const categories = description.split(/,\s*|\s+or\s+/).filter((word) => word !== '');
    expect(categories).toEqual(expect.arrayContaining(['runs', 'health']));
    const { body } = document();
    const pathsRow = commandRows(body).find(({ synopsis: s }) => isRowOf(s, 'paths'))?.row ?? '';
    const categoryRow = body.find((line) => line.startsWith('| `category`')) ?? '';
    const missing = (row: string): string[] => categories.filter((category) => !new RegExp(`\\b${category}\\b`).test(row));
    expect({ paths: missing(pathsRow), category: missing(categoryRow) }).toEqual({ paths: [], category: [] });
  });

  it('directive assign --force, memory amend and memory park have rows in the shipped notation', () => {
    const rows = commandRows(document().body).map(({ synopsis: s }) => s);
    expect(rows.find((s) => isRowOf(s, 'directive assign'))).toContain('--force');
    expect(rows.find((s) => isRowOf(s, 'memory amend'))).toMatch(/^wingfoil memory amend <id> --reason <text>/);
    expect(rows.find((s) => isRowOf(s, 'memory park'))).toMatch(/^wingfoil memory park <id> --reason <text>/);
  });
});

describe('H3 (W3 B6 handover) — US-6-01 and US-6-02 spell the workflow commands as they ship', () => {
  /** The story bullet `id` opens, its lines joined with single spaces, up to the next `* **[` bullet. */
  function story(id: string): string {
    const lines = readFileSync(storyMapPath, 'utf8').split('\n');
    const start = lines.findIndex((line) => line.startsWith('* **[') && line.includes(`${id}:`));
    if (start < 0) return '';
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith('* **['));
    return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join(' ').replace(/\s+/g, ' ');
  }

  it('US-6-02 names `wingfoil workflow create <name>` and no "interactive or flag-based" form', () => {
    const text = story('US-6-02');
    expect(text).toContain('wingfoil workflow create <name>');
    expect(text).not.toContain('interactive or flag-based');
  });

  it('US-6-01 names `wingfoil workflow show <ref>`', () => {
    expect(story('US-6-01')).toContain('wingfoil workflow show <ref>');
  });
});
