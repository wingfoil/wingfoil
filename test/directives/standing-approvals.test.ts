/**
 * task-343 — the `standing-approvals` directive (`release-planning-rel-v0.4-plan` R1 L7, `dl-212` D1, `dl-067`):
 * each standing-approval rule has a stable id, the gate it covers, the mechanical evidence it requires and the exact
 * command the approver runs; the directive is bound to `approver` only.
 *
 * Pins are substrings of whitespace-flattened text (task-276) or the line shapes the design fixes; version pins are
 * "≥" plus the version line naming the task (bug-314). A "block" is the text from a rule heading (`### SA-<nn> — …`)
 * to the next line starting `### ` or `## `.
 *
 * - AC 1 (red-first): the file, its frontmatter, `## 4. The rules`, and each block's Status, Gate, Evidence and
 *   Command lines; the Gate names an approval phase (`approval: { by_role: approver }`) of a workflow of this
 *   repository; no `npx`.
 * - AC 2 (red-first): `roles.yaml` binds the directive to `approver` only, at version 1.9 or later naming task-343;
 *   the directive says no rule lets an agent run an approver verb (sentence S1 of the design).
 * - AC 3 (red-first): the directive states how an approval cites a rule (sentence S2); every rule's `--reason`
 *   names its id and passes the CLI's own `Reason:` contract on an approval (`reasonRefusalMessage`).
 * - AC 4: the exit-0 half is already pinned by `test/cli/check-role-directives.test.ts` ("this repository passes
 *   the sweep"); the listing half runs the PINNED build's `directives list --role approver --format json`, whose
 *   entry shape is copied from a real run of `npm run -s wingfoil -- directives list --role approver --format json`.
 * - AC 5 (characterization of the approver's ruling at the design gate): SA-01 adopted, SA-02 proposed.
 *
 * Reads this repository's working tree, as the other live-configuration suites do. Every read is lazy, so before
 * green each case fails on its own (ENOENT or an assertion) instead of the whole file failing to load.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { reasonRefusalMessage } from '../../src/memory/commit-message';

const ROOT = join(__dirname, '..', '..');
const WINGFOIL = join(ROOT, '.wingfoil');
const ID = 'standing-approvals';
const FILE = join(WINGFOIL, 'directives', 'custom', `${ID}.md`);

const flat = (s: string): string => s.replace(/\s+/g, ' ');
const directive = (): string => readFileSync(FILE, 'utf-8');
const frontmatter = (text: string): string => text.slice(text.indexOf('\n') + 1, text.indexOf('\n---', 4));
const rolesText = (): string => readFileSync(join(WINGFOIL, 'roles.yaml'), 'utf-8');

/** A `major.minor` version as one comparable number (as `test/directives/dev-loop-practice.test.ts`). */
function versionNumber(raw: string): number {
  const match = /^"?(\d+)\.(\d+)"?/.exec(raw);
  if (!match) throw new Error(`not a version: ${raw}`);
  return Number(match[1]) * 1000 + Number(match[2]);
}

/** The `## 4. The rules` section, up to the next `## ` heading. */
function rulesSection(text: string): string {
  const start = text.indexOf('\n## 4. The rules\n');
  if (start < 0) throw new Error('no section "## 4. The rules"');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start + 1, end < 0 ? undefined : end);
}

interface Block {
  readonly id: string;
  readonly lines: readonly string[];
}

const HEADING = /^### (SA-\d{2}) — \S/;

/** The rule blocks of `## 4. The rules`, in file order. */
function blocks(): Block[] {
  const lines = rulesSection(directive()).split('\n');
  const result: { id: string; lines: string[] }[] = [];
  let current: { id: string; lines: string[] } | null = null;
  for (const line of lines) {
    if (line.startsWith('### ') || line.startsWith('## ')) {
      const match = HEADING.exec(line);
      current = match ? { id: match[1] ?? '', lines: [] } : null;
      if (current) result.push(current);
      continue;
    }
    current?.lines.push(line);
  }
  return result;
}

/** The lines of `block` matching `re`. */
const linesMatching = (block: Block, re: RegExp): string[] => block.lines.filter((line) => re.test(line));

/** The indented lines (starting with two spaces) right after the single line of `block` matching `head`. */
function itemsAfter(block: Block, head: RegExp): string[] {
  const at = block.lines.findIndex((line) => head.test(line));
  if (at < 0) throw new Error(`${block.id}: no line matching ${head}`);
  const items: string[] = [];
  for (const line of block.lines.slice(at + 1)) {
    if (!line.startsWith('  ')) break;
    items.push(line);
  }
  return items;
}

const STATUS = /^- \*\*Status:\*\* (proposed|adopted|withdrawn|retired)\b/;
const GATE = /^- \*\*Gate:\*\* `([a-z0-9-]+)\.([a-z0-9-]+)@[a-z-]+:<[^>]+>`/;
const EVIDENCE_HEAD = /^- \*\*Evidence\*\*/;
const EVIDENCE_ITEM = /^ {2}\d+\. `(npm|node|git|grep) [^`]+` → \S/;
const COMMAND_HEAD = /^- \*\*Command\*\*/;
const COMMAND_ITEM = /^ {2}`node dist\/cli\.js (memory approve|workflow finalize) [^`]*--reason "([^"]+)"`$/;

/** The `--reason` text of a block's single Command line. */
function reasonOf(block: Block): string {
  const items = itemsAfter(block, COMMAND_HEAD);
  expect(items).toHaveLength(1);
  const match = COMMAND_ITEM.exec(items[0] ?? '');
  expect(match).not.toBeNull();
  return match![2] ?? '';
}

interface Phase {
  readonly name: string;
  readonly approval?: { readonly by_role?: string };
}

/** The phase named `phase` of `.wingfoil/workflows/custom/<workflow>.yaml`, or undefined. */
function phaseOf(workflow: string, phase: string): Phase | undefined {
  const doc = yamlLoad(readFileSync(join(WINGFOIL, 'workflows', 'custom', `${workflow}.yaml`), 'utf-8')) as {
    phases?: Phase[];
  };
  return (doc.phases ?? []).find((entry) => entry.name === phase);
}

const S1 =
  'No rule lets an agent run an approver verb: the approver runs every command below from their own terminal, and ' +
  "the verbs refuse an agent's session with `E_AGENT_CONTEXT` (`dl-212` D1, `spec-018` §3).";

const S2 =
  'An approval under a rule cites the rule id in its `Reason:`, in prose, as `under standing rule SA-<nn>`: no line ' +
  'of the reason begins with `Approver:`, `Reason:`, `WingFoil-Version:`, `Co-Authored-By:` or `AI-Model:`, and the ' +
  'reason does not end with a paragraph made entirely of `Key: value` lines (`dl-067`, AGENTS.md §5.1).';

describe('task-343 AC 1 — the directive lists each rule with an id, a gate, its evidence and the command (R1 L7)', () => {
  it('red-first: the frontmatter is id standing-approvals, a custom directive with no scope, version ≥ 1.0 naming task-343', () => {
    const header = frontmatter(directive());
    const parsed = yamlLoad(header) as Record<string, unknown>;
    expect(parsed['id']).toBe(ID);
    expect(parsed['type']).toBe('directive');
    expect(parsed['kind']).toBe('custom');
    expect(Object.keys(parsed)).not.toContain('scope');
    const version = /^version: "(\d+\.\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1000);
    expect(version![2]).toContain('task-343');
  });

  it('red-first: "## 4. The rules" holds at least one SA-<nn> heading, ids unique and strictly ascending', () => {
    const ids = blocks().map((block) => block.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const numbers = ids.map((id) => Number(id.slice(3)));
    for (let i = 1; i < numbers.length; i += 1) expect(numbers[i]).toBeGreaterThan(numbers[i - 1] ?? 0);
  });

  it('red-first: every block has exactly one Status, Gate, Evidence and Command line', () => {
    const found = blocks();
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const block of found) {
      expect([block.id, linesMatching(block, STATUS).length]).toEqual([block.id, 1]);
      expect([block.id, linesMatching(block, GATE).length]).toEqual([block.id, 1]);
      expect([block.id, linesMatching(block, EVIDENCE_HEAD).length]).toEqual([block.id, 1]);
      expect([block.id, linesMatching(block, COMMAND_HEAD).length]).toEqual([block.id, 1]);
    }
  });

  it('red-first: each Gate names an approval phase (approval: { by_role: approver }) of a workflow of this repository', () => {
    const found = blocks();
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const block of found) {
      const match = GATE.exec(linesMatching(block, GATE)[0] ?? '');
      expect(match).not.toBeNull();
      const phase = phaseOf(match![1] ?? '', match![2] ?? '');
      expect([block.id, phase?.name, phase?.approval?.by_role]).toEqual([block.id, match![2], 'approver']);
    }
  });

  // The design's SA-02 (status proposed) ends its evidence with an item no command decides (the reviewer's verdict),
  // so the pin is the design's "followed by one or more lines" read literally: the items right after the Evidence
  // line start with at least one command-and-output item; a later non-command item is not refused here — for a
  // `proposed` block only: the next case holds an `adopted` block to commands alone.
  it('red-first: each Evidence line is followed by one or more numbered items, each a command and its expected output', () => {
    const found = blocks();
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const block of found) {
      const items = itemsAfter(block, EVIDENCE_HEAD);
      const leading = items.findIndex((item) => !EVIDENCE_ITEM.test(item));
      const commands = leading < 0 ? items.length : leading;
      expect([block.id, commands > 0, items[0]]).toEqual([block.id, true, expect.stringMatching(EVIDENCE_ITEM)]);
    }
  });

  // Review finding 2 (dl-212 D1, the directive's §1): a rule in force decides a gate on commands alone, so for an
  // `adopted` block EVERY item after the Evidence head is a command and its expected output; the leniency of the case
  // above stays for `proposed` blocks only.
  it('red-first: an adopted rule\'s Evidence items are all commands with their expected output, none a judgement', () => {
    const adopted = blocks().filter((block) => STATUS.exec(linesMatching(block, STATUS)[0] ?? '')?.[1] === 'adopted');
    expect(adopted.length).toBeGreaterThanOrEqual(1);
    for (const block of adopted) {
      const items = itemsAfter(block, EVIDENCE_HEAD);
      expect([block.id, items.length > 0]).toEqual([block.id, true]);
      for (const item of items) expect([block.id, item]).toEqual([block.id, expect.stringMatching(EVIDENCE_ITEM)]);
    }
  });

  it('red-first: each Command line is followed by exactly one code-build memory approve or workflow finalize with a --reason', () => {
    const found = blocks();
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const block of found) expect(reasonOf(block).length).toBeGreaterThan(0);
  });

  it('red-first: the directive never names npx', () => {
    expect(directive()).not.toContain('npx');
  });
});

describe('task-343 AC 2 — bound to the approver only; no rule lets an agent run an approver verb (dl-212 D1)', () => {
  interface Roles {
    readonly assignments: Record<string, readonly string[]>;
    readonly global?: readonly string[];
  }

  it('red-first: roles.yaml binds standing-approvals to approver and to no other role, nor globally', () => {
    const roles = yamlLoad(rolesText()) as Roles;
    expect(roles.assignments['approver']).toContain(ID);
    const others = Object.entries(roles.assignments)
      .filter(([role, list]) => role !== 'approver' && list.includes(ID))
      .map(([role]) => role);
    expect(others).toEqual([]);
    expect(roles.global ?? []).not.toContain(ID);
  });

  it('red-first: roles.yaml is at 1.9 or later and its version line names task-343', () => {
    const version = /^version: (\S+)(.*)$/m.exec(rolesText());
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1009);
    expect(version![2]).toContain('task-343');
  });

  it('red-first: the directive states sentence S1', () => {
    expect(flat(directive())).toContain(S1);
  });
});

describe('task-343 AC 3 — an approval under a rule cites its id in a Reason that keeps the dl-067 contract', () => {
  it('red-first: the directive states sentence S2', () => {
    expect(flat(directive())).toContain(S2);
  });

  it('red-first: every rule\'s --reason names its own id and passes reasonRefusalMessage on an approval', () => {
    const found = blocks();
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const block of found) {
      const reason = reasonOf(block);
      expect([block.id, reason]).toEqual([block.id, expect.stringContaining(`under standing rule ${block.id}`)]);
      expect([block.id, reasonRefusalMessage(reason, { approval: true })]).toEqual([block.id, null]);
    }
  });
});

describe('task-343 AC 4 — the pinned build lists the directive for the approver', () => {
  interface Listed {
    readonly path: string;
    readonly frontmatter: { readonly id: string };
    readonly roles: readonly string[];
    readonly global: boolean;
    readonly assignment: string;
  }

  it('red-first: `directives list --role approver --format json` on the pinned build lists standing-approvals once, as an approver binding', () => {
    const run = spawnSync(
      process.execPath,
      [join('node_modules', 'wingfoil-released', 'dist', 'cli.js'), 'directives', 'list', '--role', 'approver', '--format', 'json'],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout) as { entries: Listed[]; warnings: unknown[] };
    expect(out.warnings).toEqual([]);
    const entries = out.entries.filter((entry) => entry.frontmatter.id === ID);
    expect(entries.map((entry) => [entry.path, entry.roles, entry.global, entry.assignment])).toEqual([
      [`directives/custom/${ID}.md`, ['approver'], false, 'approver'],
    ]);
  });
});

describe('task-343 AC 5 — each rule carries the status the approver ruled at the design gate (R1 L7)', () => {
  it('characterization of the ruling: SA-01 adopted, SA-02 proposed', () => {
    const statuses = Object.fromEntries(
      blocks().map((block) => [block.id, STATUS.exec(linesMatching(block, STATUS)[0] ?? '')?.[1]]),
    );
    expect(statuses).toEqual({ 'SA-01': 'adopted', 'SA-02': 'proposed' });
  });
});
