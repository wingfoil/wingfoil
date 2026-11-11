/**
 * AGENTS.md parity gate (task-358, `bug-435` item 2; `dl-025` the agent-facing documentation gate, `dl-137` the agent
 * file and its `CLAUDE.md` pointer, `dl-116` Q1 (A) enumeration parity) — the command `agent-docs.align-agent-docs`'
 * check `agents-md.current` runs (`.wingfoil/workflows/bindings.yaml`), and one of the document-parity suites
 * `docs.parity` names. What a command can decide of the five readings that check replaced:
 *
 * - **§1, the command surface** — the project-status block lists exactly the commands the Commander program
 *   `buildProgram` derives from `CORE_MODULES` (the `bin` entry point's tree, Commander's implicit `help` excluded),
 *   noun by noun, and states their count;
 * - **§5, the Memory model** — the type table names exactly `memory.yaml`'s types, each row's forward chain is the
 *   type's resolved `sequence`, each `(→x)` after a state is that state's `gates` reject target and each `⟲ a→b` its
 *   `returns` edge;
 * - **§6, the workflows** — every startable (`kind: main`) workflow of the registry `workflows.yaml` includes is named,
 *   in backticks, in the section;
 * - **§7, the directives** — the role table equals `roles.yaml`'s `assignments` (each role's directives, in order) and
 *   its `global` row;
 * - **`CLAUDE.md`** — the pointer: the line `@AGENTS.md`, then one sentence (`dl-137` Q1 (b)).
 *
 * The rest of AGENTS.md (the documentation map, the conventions, the golden rules) is a reading, left to the
 * architect at `align-agent-docs`. Deterministic: sets and lists compared in declared or sorted order.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import { loadMemoryYaml, loadRolesYaml } from '../../src/core/loaders';
import { loadWorkflowRegistry } from '../../src/core/workflow-registry';
import { resolveStateMachine } from '../../src/memory/state-machine';

const repoRoot = join(__dirname, '..', '..');
const AGENTS = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');

/** The text of the `## <n>. ` section of AGENTS.md (to the next `## ` heading). */
function section(number: string): string {
  const lines = AGENTS.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## ${number}. `));
  if (start === -1) throw new Error(`AGENTS.md has no section ## ${number}.`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

const backticked = (text: string): string[] => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
const words = (names: readonly string[]): string[] => names.filter((name) => /^[a-z]+$/.test(name));

/** The code side: each top-level command's verbs (a flat command has none), Commander's `help` excluded. */
function commandTree(program: Command): Map<string, string[]> {
  return new Map(program.commands.map((top) => [top.name(), top.commands.map((sub) => sub.name()).filter((name) => name !== 'help').sort()]));
}

let tree: Map<string, string[]>;
beforeAll(async () => {
  tree = commandTree(await buildProgram(CORE_MODULES, { resolveRoot: () => repoRoot, buildParams: () => ({}) }));
});

describe('AGENTS.md §1 — the command surface (CORE_MODULES)', () => {
  /** The bullet list of §1's "The command surface" paragraph: `- top level: …;` and `- \`noun\`: …;` lines. */
  function documented(): Map<string, string[]> {
    const text = section('1');
    const start = text.indexOf('**The command surface**');
    expect(start).toBeGreaterThan(-1);
    // A bullet is a `> - ` line and the `>   ` continuation lines below it.
    const bullets: string[] = [];
    for (const line of text.slice(start).split('\n').slice(1)) {
      if (/^>\s*- /.test(line)) bullets.push(line);
      else if (/^>\s{2,}\S/.test(line) && bullets.length > 0) bullets[bullets.length - 1] += ` ${line.replace(/^>\s+/, '')}`;
      else if (bullets.length > 0) break;
    }
    const tree = new Map<string, string[]>();
    for (const line of bullets) {
      const body = line.replace(/^>\s*- /, '');
      const top = /^top level:\s*([^;]*)/.exec(body);
      if (top !== null) {
        for (const name of words(backticked(top[1]!))) tree.set(name, []);
        continue;
      }
      // One or more `noun`: `verb`, `verb` (…) segments, `;`-separated; a verb is a backticked lower-case word.
      for (const segment of body.split(/;\s*/)) {
        const head = /^`([a-z]+)`:\s*(.*)$/.exec(segment.trim());
        if (head === null) continue;
        tree.set(head[1]!, words(backticked(head[2]!.replace(/\([^)]*\)/g, ''))).sort());
      }
    }
    return tree;
  }

  it('names every shipped command, noun by noun, and nothing that does not ship', () => {
    const sortTree = (t: Map<string, string[]>): [string, string[]][] => [...t].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    expect(sortTree(documented())).toEqual(sortTree(tree));
  });

  it('states the number of commands the surface derives', () => {
    const leaves = [...tree.values()].reduce((count, verbs) => count + Math.max(verbs.length, 1), 0);
    expect(section('1')).toMatch(new RegExp(`— ${leaves} commands`));
  });
});

describe('AGENTS.md §5 — the Memory type table (memory.yaml)', () => {
  const memoryYaml = loadMemoryYaml(repoRoot);

  /** Each table row: `| \`type\` | \`path\` | chain … |`, keyed by type. */
  function rows(): Map<string, string> {
    const out = new Map<string, string>();
    for (const line of section('5').split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim());
      const type = /^`([a-z-]+)`$/.exec(cells[1] ?? '');
      if (type === null || cells.length < 5) continue;
      out.set(type[1]!, cells[3]!);
    }
    return out;
  }

  /** A row's machine: the forward chain, each state's `(→x)` reject target, and each `⟲ a→b` return edge. */
  function parseChain(cell: string): { sequence: string[]; rejects: Record<string, string>; returns: Record<string, string> } {
    const returns: Record<string, string> = {};
    for (const match of cell.matchAll(/⟲\s*([a-z-]+)→([a-z-]+)/g)) returns[match[1]!] = match[2]!;
    // The chain ends at the first `;`, `[`, or space-separated note (`(·→deprecated)`, `(mirrors \`adr\`)`).
    const chain = cell.split(/[;[]|\s/)[0]!.trim();
    const rejects: Record<string, string> = {};
    const sequence: string[] = [];
    for (const hop of chain.split(/→(?![^(]*\))/)) {
      const state = /^([a-z-]+)(?:\(→([a-z-]+)\))?$/.exec(hop.trim());
      if (state === null) throw new Error(`unreadable state '${hop}' in '${cell}'`);
      sequence.push(state[1]!);
      if (state[2] !== undefined) rejects[state[1]!] = state[2];
    }
    return { sequence, rejects, returns };
  }

  it('names exactly memory.yaml\'s types', () => {
    expect([...rows().keys()].sort()).toEqual(Object.keys(memoryYaml.types).sort());
  });

  it.each(Object.keys(memoryYaml.types).sort().map((type) => [type]))('%s: the row\'s chain, reject targets and return edges are the type\'s machine', (type) => {
    const cell = rows().get(type);
    expect(cell).toBeDefined();
    const machine = resolveStateMachine(memoryYaml, type);
    const rejects = Object.fromEntries(
      Object.entries(machine.gates ?? {})
        .filter(([, gate]) => gate?.reject !== undefined)
        .map(([state, gate]) => [state, gate!.reject!]),
    );
    expect(parseChain(cell!)).toEqual({ sequence: [...machine.sequence], rejects, returns: { ...(machine.returns ?? {}) } });
  });
});

describe('AGENTS.md §6 — the startable workflows (workflows.yaml)', () => {
  it('names, in backticks, every main workflow the registry includes', () => {
    const { workflows } = loadWorkflowRegistry(repoRoot);
    const mains = workflows.filter((workflow) => workflow.kind === 'main').map((workflow) => workflow.name);
    expect(mains.length).toBeGreaterThan(0);
    const named = new Set(backticked(section('6')));
    expect(mains.filter((name) => !named.has(name))).toEqual([]);
  });
});

describe('AGENTS.md §7 — the role-directive table (roles.yaml)', () => {
  it('equals roles.yaml\'s assignments, role by role, and its global row', () => {
    const roles = loadRolesYaml(repoRoot);
    const table = new Map<string, string[]>();
    for (const line of section('7').split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim());
      if (cells.length < 4 || cells[1] === '' || /^-+$/.test(cells[1]!) || cells[1] === 'Role') continue;
      const role = /^\*\*global \(all roles\)\*\*$/.test(cells[1]!) ? '(global)' : cells[1]!;
      table.set(role, cells[2]!.split(',').map((name) => name.trim()).filter(Boolean));
    }
    const expected = new Map<string, string[]>([...Object.entries(roles.assignments ?? {}).map(([role, ids]) => [role, [...ids]] as [string, string[]]), ['(global)', [...(roles.global ?? [])]]]);
    expect([...table]).toEqual([...expected]);
  });
});

describe('CLAUDE.md — the pointer to AGENTS.md (dl-137 Q1 (b))', () => {
  it('is the line @AGENTS.md, then one sentence', () => {
    const lines = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    expect(lines[0]).toBe('@AGENTS.md');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/AGENTS\.md/);
    expect(lines[1]!.match(/[.!?](?:\s|$)/g)).toHaveLength(1);
  });
});
