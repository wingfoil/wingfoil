/**
 * task-342 (`dl-203` Q4 (a), `bug-502`) — the hand-driven workflow cycle in the consumer guides, pinned to the text
 * the approver confirmed at the design gate (decision D7; D1–D6 as recommended):
 *
 * - AC 1 (red-first): `docs/agents.md` § "7. Following a workflow" — the cycle of `dl-203` D3 (five steps, then
 *   `workflow next` again), the coordinator's place (the sentences of `.wingfoil/directives/custom/coordinator.md`,
 *   less the internal ids, D6), and the table of the version that removes each manual step (eight rows);
 * - AC 2 (red-first): `docs/user-guide.md` § "7. Workflows" — the same cycle for a human operator, the link to
 *   `agents.md` §7, and the same eight-row table (a parity case reading both files);
 * - AC 3 (red-first): `docs/agents.md` — the §2 row of `memory search` names no `--status`, §6 states that an agent's
 *   own records wait for the approver, which `--status` to pass and where knowledge given in a request goes, and §7
 *   names the two levels of process (light, strict) and the default when a project names none (D4);
 * - AC 4 (characterization): every inline code span starting `wingfoil ` in the new spans names a command path the
 *   code build's command tree registers, with options of that command or global options (D1: the pinned-build runs
 *   are the task's evidence); neither file claims "signed" or "human-approved" (`dl-212` D4). This case passes once
 *   the text exists: at the red commit it fails only because the new spans are absent.
 *
 * Text is compared with whitespace runs (and Markdown blockquote markers) collapsed, so a re-wrap does not break a
 * pin; the words are pinned verbatim; every assertion is scoped to its section, from its heading to the next heading of
 * the same or a higher level, so it fails because the text is absent, not because of an unrelated line elsewhere.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import { inlineCodeSpans } from './support/name-resolvability';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (...path: string[]): string => readFileSync(join(REPO_ROOT, ...path), 'utf-8');

/** `text` with blockquote markers dropped and every whitespace run a single space. */
const flat = (text: string): string => text.replace(/^>[ \t]?/gm, '').replace(/\s+/g, ' ').trim();

/**
 * The section whose heading line is exactly `heading`: from that line to the next heading of the same or a higher
 * level (exclusive), or to the end; `''` when the heading is absent (the pins on it then fail on their assertion).
 */
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) return '';
  const level = /^#+/.exec(heading)?.[0].length ?? 0;
  const end = lines.findIndex((line, i) => {
    if (i <= start) return false;
    const marks = /^(#+) /.exec(line)?.[1];
    return marks !== undefined && marks.length <= level;
  });
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/** The paragraph of `text` that starts with `lead` (to the next blank line), or `''`. */
function paragraph(text: string, lead: string): string {
  const from = text.indexOf(lead);
  if (from === -1) return '';
  const stop = text.indexOf('\n\n', from);
  return text.slice(from, stop === -1 ? undefined : stop);
}

/** The ordered-list items of `text`: their number and their text up to the line end. */
const numberedItems = (text: string): Array<{ n: number; text: string }> =>
  [...text.matchAll(/^(\d+)\. (.*)$/gm)].map((m) => ({ n: Number(m[1]), text: m[2] ?? '' }));

/** The body rows of the first table in `text`, as (first cell, last cell) after trimming. */
function firstTableRows(text: string): Array<[string, string]> {
  const lines = text.split('\n');
  const first = lines.findIndex((line) => line.startsWith('|'));
  if (first === -1) return [];
  const table: string[] = [];
  for (const line of lines.slice(first)) {
    if (!line.startsWith('|')) break;
    table.push(line);
  }
  return table.slice(2).map((row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    return [cells[0] ?? '', cells[cells.length - 1] ?? ''];
  });
}

const AGENTS_DOC = read('docs', 'agents.md');
const USER_GUIDE = read('docs', 'user-guide.md');
const COORDINATOR = read('.wingfoil', 'directives', 'custom', 'coordinator.md');

const A2 = section(AGENTS_DOC, '## 2. Is this a WingFoil project?');
const A6 = section(AGENTS_DOC, '## 6. Writing: the verbs');
const A7 = section(AGENTS_DOC, '## 7. Following a workflow');
const U7 = section(USER_GUIDE, '## 7. Workflows');

/** The eight (first cell, last cell) rows of "What removes each manual step" (design D7). */
const MANUAL_STEPS: Array<[string, string]> = [
  ['reading the run: `workflow status`, `workflow next`', 'the driver, 1.0'],
  ['opening and ending a workflow: `workflow start`, `workflow end`', 'the driver, 1.0'],
  ['adding an element linked to its step: `memory add --workflow --step`', 'the driver, 1.0'],
  [
    "launching the agent of the step's role: `agent execute --next`",
    'the driver, 1.0 (a launch without a terminal, `--headless`, is new in 0.4)',
  ],
  ["running a phase's checks", 'the driver, 1.0'],
  ['recording a step no evidence completes: `workflow finalize`', 'the driver, 1.0'],
  ["writing an element's content and doing the step's work", "never: it stays the agent's"],
  ['deciding a gate', "never: a gate stays the approver's"],
];

const NEVER_SENTENCE = 'The coordinator never approves, rejects or amends, and never decides a gate.';

describe('task-342 AC 1 — docs/agents.md §7 describes the hand-driven cycle', () => {
  const s7 = flat(A7);
  const cycle = section(A7, '### The cycle');

  it('§7 keeps its heading and opens with what drives a run until the driver ships', () => {
    expect(A7).not.toBe('');
    expect(s7).toContain(
      "WingFoil 0.3 records and routes workflows; it does not execute their steps. Until the workflow engine's driver runs them itself (planned for 1.0), a run is driven by hand, by a human or by you.",
    );
  });

  it('"### The cycle" is a numbered list of exactly five steps', () => {
    expect(numberedItems(cycle).map((item) => item.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('the five steps hold the design\'s sentences verbatim', () => {
    const text = flat(cycle);
    for (const sentence of [
      "`wingfoil workflow status`, then `wingfoil workflow next`: the open workflows, then the next step of the active one — its role and that role's directives, the element it works on, and the command or commit each action expects. `wingfoil workflow show <name>` prints a whole workflow.",
      "Act in the role the step names, with that role's directives loaded (§4, rule 3).",
      'Record the outcome with the verbs in §6. An element the step adds is added linked to it, with the command `workflow next` prints: `wingfoil memory add --type <type> --title "<title>" --workflow <instance> --step <step-key>`. WingFoil deduces from the documents, as committed, that the step is done.',
      'A step that nothing in the repository can show as done, such as a checkpoint, is recorded with `wingfoil workflow finalize`; `workflow next` then moves past it.',
      "At a gate — a step waiting for the approver, shown as `human needed:` by `workflow next` and `workflow status` — stop and hand over to the human approver. The approver's verbs refuse to run in an agent's session (`E_AGENT_CONTEXT`, new in 0.4).",
    ]) expect(text).toContain(sentence);
  });

  it('the cycle loops on `workflow next`, is a hand-driven run, and starts or ends a workflow only when asked', () => {
    const text = flat(cycle);
    expect(text).toContain("Then run `wingfoil workflow next` again, until the workflow's steps are complete.");
    expect(text).toContain('An agent following this cycle is a hand-driven run, not a coordinator.');
    expect(text).toContain(
      'Start (`wingfoil workflow start <name>`) or end (`wingfoil workflow end`) a workflow only when the human asks you to.',
    );
  });

  it('"### The coordinator" states its three judgement points and its run record', () => {
    const text = flat(section(A7, '### The coordinator'));
    for (const sentence of [
      'A project may declare a `coordinator` role, which an agent may execute. It decides only what the configuration cannot:',
      'which frontier steps to run in parallel, within the declared caps;',
      'the triage of a failure the driver reports (rerun, open a bug, stop);',
      "the content of an element that no other role's step writes.",
      "It never does a step's work in place of the step's role.",
      'A coordinator session is recorded as a run: it is launched with `wingfoil agent execute --element <type>:<id> --role coordinator`, which appends its record to the run log and commits it as `agent: record <run-id>` when the session exits; the element is the `plan` of the run it coordinates.',
      "Until the driver ships, the coordinator may run the driver's mechanical steps as a hand-driven run, each recorded exactly as the step declares it, with the subject or command `workflow next` prints.",
    ]) expect(text).toContain(sentence);
    expect(numberedItems(section(A7, '### The coordinator')).map((item) => item.n)).toEqual([1, 2, 3]);
  });

  it('the never-sentence is word for word the coordinator directive\'s (parity)', () => {
    expect(flat(COORDINATOR)).toContain(NEVER_SENTENCE);
    expect(flat(section(A7, '### The coordinator'))).toContain(NEVER_SENTENCE);
  });

  it('"### What removes each manual step": its first table has the eight rows, in order', () => {
    expect(firstTableRows(section(A7, '### What removes each manual step'))).toEqual(MANUAL_STEPS);
  });
});

describe('task-342 AC 2 — docs/user-guide.md §7 gives the same cycle to a human operator', () => {
  const s7 = flat(U7);
  const loop = (() => {
    const from = U7.indexOf('Then, until its steps are complete:');
    const to = U7.indexOf('**End it.**');
    return from === -1 || to === -1 || to < from ? '' : U7.slice(from, to);
  })();

  it('states that until the driver ships, the operator drives the run by hand', () => {
    expect(s7).toContain(
      "Until the workflow engine's driver runs a workflow itself (planned for 1.0), you drive it by hand: you start it, go round a cycle until its steps are complete, and end it.",
    );
    expect(s7).toContain(
      '**Start it.** `wingfoil workflow start <name>` opens a workflow: it records it as a `plan` document (an `add` and a `submit` commit) and makes it the active workflow. `--element <type>:<id>` names the element it runs on.',
    );
    expect(s7).toContain(
      '**End it.** `wingfoil workflow end` closes the active workflow once its steps are complete, and makes the previous one active again; before that it refuses and names the current step.',
    );
  });

  it('the cycle is a numbered list of five steps, each led by its bold name', () => {
    const items = numberedItems(loop);
    expect(items.map((item) => item.n)).toEqual([1, 2, 3, 4, 5]);
    expect(items.map((item) => /^\*\*[^*]+\*\*/.exec(item.text)?.[0])).toEqual([
      '**Ask where the run stands.**',
      '**Do the step, or have it done.**',
      '**Record it with the verbs.**',
      '**Record what nothing else shows.**',
      '**Decide the gates.**',
    ]);
  });

  it('the new steps hold the design\'s sentences verbatim', () => {
    const text = flat(loop);
    for (const sentence of [
      "**Do the step, or have it done.** Do the phase's work in the role it names, with that role's directives loaded, or launch the agent of that role on it with `wingfoil agent execute --next` (§9.4).",
      "**Record it with the verbs.** Move the outcome's Memory documents through their states with the verbs in §8. An element the step adds is added linked to it: `workflow next` prints the `wingfoil memory add` command with `--workflow <instance> --step <step-key>`. WingFoil deduces from those documents, as committed, that the step is done.",
      '**Record what nothing else shows.** A step that nothing in the repository can show as done',
      'is recorded with `wingfoil workflow finalize`',
      '**Decide the gates.** At a step waiting for the approver (`human needed:` in `workflow next` and `workflow status`), the approver approves or rejects from a terminal of their own (§8.3); an agent stops there and hands over.',
    ]) expect(text).toContain(sentence);
  });

  it('names a hand-driven run, links agents.md §7 and places the coordinator', () => {
    expect(U7).toContain('](agents.md#7-following-a-workflow)');
    expect(s7).toContain(
      'A run driven this way, by you or by an agent following [`agents.md` §7](agents.md#7-following-a-workflow), is a hand-driven run.',
    );
    expect(s7).toContain(
      "A project may also declare a `coordinator` role, executed by an agent, that decides only what the configuration cannot — which ready steps to run in parallel, the triage of a failure, the content of an element no other role's step writes — and never approves, rejects, amends or decides a gate; its session is recorded as a run with `wingfoil agent execute --element plan:<instance-id> --role coordinator`.",
    );
  });

  it('"**What removes each manual step.**" leads a table equal to agents.md §7\'s (parity)', () => {
    const from = U7.indexOf('**What removes each manual step.**');
    const rows = from === -1 ? [] : firstTableRows(U7.slice(from));
    expect(rows).toEqual(MANUAL_STEPS);
    expect(rows).toEqual(firstTableRows(section(A7, '### What removes each manual step')));
  });
});

describe('task-342 AC 3 — docs/agents.md says which records to read and where knowledge goes (bug-502)', () => {
  it('§2: the memory search row reads every state but deprecated, with no --status', () => {
    const row = A2.split('\n').find((line) => line.startsWith('| current work and decisions'));
    expect(row).toBeDefined();
    const cells = (row ?? '').split('|').slice(1, -1).map((cell) => cell.trim());
    expect(cells).toEqual([
      'current work and decisions, your own pending records included',
      '`wingfoil memory search --type <type>` (every state but `deprecated`; §6)',
    ]);
    expect(row).not.toContain('[--status <s>]');
  });

  it('§6: an agent\'s own records wait for the approver', () => {
    expect(flat(A6)).toContain(
      "**Your own records wait for the approver.** A document you add and submit stops at the first gate of its type's state machine (`pending` in the one `init` scaffolds) and stays there until the approver approves or rejects it: nothing you run moves it on. It is still current work: read it and build on it like any other document.",
    );
  });

  it('§6: which --status to pass to memory search', () => {
    expect(flat(A6)).toContain(
      '**Which states to read.** `wingfoil memory search --type <type>` with no `--status` lists every state but `deprecated`, your pending records included: use it for current work and decisions. `--status <state>` keeps one state; pass it only to narrow a read on purpose. `--status approved` alone hides everything still waiting for the approver, your own records first.',
    );
  });

  it('§6: knowledge given in a request becomes a decision-log, a directive or an element\'s body', () => {
    expect(flat(A6)).toContain(
      '**Knowledge given in a request.** A rule the human gives you in a request and means for later work is not kept in your own notes or memory, where no other agent reads it: record it as a `decision-log` (`wingfoil memory add --type decision-log --title "<title>"`, inside the `decision-log-ingest` workflow when the project runs one), and submit it for the approver; once approved, it holds for every agent. A rule that changes what a role must do becomes a directive (`wingfoil directive create`) only when your role and task call for changing governance. A fact about one element goes in that element\'s body.',
    );
  });

  it('§7 "### Levels of process": a light and a strict level, and the default when none is named', () => {
    const levels = section(A7, '### Levels of process');
    const text = flat(levels);
    expect(text).toContain(
      'A project names the level of process its agents follow, in its own instructions to agents or in a global directive. Two levels:',
    );
    expect(levels).toMatch(/^- \*\*Light:\*\* /m);
    expect(levels).toMatch(/^- \*\*Strict:\*\* /m);
    expect(text).toContain(
      '**Light:** Memory is the project\'s register. You add, submit, park and deprecate documents with the verbs in §6 and read them back (§2); no workflow is opened, and each document waits for the approver on its own.',
    );
    expect(text).toContain(
      '**Strict:** the work runs inside an open workflow, through the cycle below: each element is added linked to its step, each step is recorded, and the run stops at every gate.',
    );
    expect(text).toContain(
      'When the project names no level, follow the cycle for the work of a workflow `wingfoil workflow status` lists as open, and the light level otherwise.',
    );
  });
});

describe('task-342 AC 4 — the commands of the new text exist, and no "signed" claim (characterization)', () => {
  let commands: Map<string, { flags: Set<string>; hasSubcommands: boolean }>;
  let globalFlags: Set<string>;

  beforeAll(async () => {
    const program: Command = await buildProgram(CORE_MODULES, { resolveRoot: () => REPO_ROOT, buildParams: () => ({}) });
    const flags = (command: Command): Set<string> =>
      new Set(command.options.map((option) => option.long).filter((long): long is string => long !== undefined));
    commands = new Map();
    for (const top of program.commands) {
      commands.set(top.name(), { flags: flags(top), hasSubcommands: top.commands.length > 0 });
      for (const sub of top.commands) commands.set(`${top.name()} ${sub.name()}`, { flags: flags(sub), hasSubcommands: false });
    }
    globalFlags = new Set(['--help', ...program.options.map((option) => option.long ?? '')]);
  });

  /** The `wingfoil …` inline code spans of the spans the task writes. */
  const newSpans = (): string[] => {
    const row = A2.split('\n').find((line) => line.startsWith('| current work and decisions')) ?? '';
    const paragraphs = [
      '**Your own records wait for the approver.**',
      '**Which states to read.**',
      '**Knowledge given in a request.**',
    ].map((lead) => paragraph(A6, lead));
    return [row, ...paragraphs, A7, U7].flatMap(inlineCodeSpans).filter((span) => /^wingfoil /.test(span));
  };

  /** Why `span` does not resolve on the command tree, or `undefined` when it does. */
  const problem = (span: string): string | undefined => {
    const tokens = span.split(/\s+/).slice(1);
    const words: string[] = [];
    for (const token of tokens) {
      if (words.length === 2 || !/^[a-z][a-z-]*$/.test(token)) break;
      words.push(token);
    }
    const path =
      words.length === 2 && commands.has(words.join(' '))
        ? words.join(' ')
        : words.length >= 1 && commands.has(words[0] as string) && !commands.get(words[0] as string)?.hasSubcommands
          ? (words[0] as string)
          : undefined;
    if (path === undefined) return `${span}: no command '${words.join(' ')}'`;
    const known = commands.get(path)?.flags ?? new Set<string>();
    for (const token of tokens) {
      const flag = /^\[?(--[a-z][a-z-]*)/.exec(token)?.[1];
      if (flag !== undefined && !known.has(flag) && !globalFlags.has(flag)) return `${span}: '${path}' has no ${flag}`;
    }
    return undefined;
  };

  it('the new spans carry the commands the design names (not vacuous)', () => {
    const spans = newSpans();
    for (const expected of [
      'wingfoil memory search --type <type>',
      'wingfoil memory add --type decision-log --title "<title>"',
      'wingfoil directive create',
      'wingfoil memory add --type <type> --title "<title>" --workflow <instance> --step <step-key>',
      'wingfoil agent execute --element <type>:<id> --role coordinator',
      'wingfoil agent execute --next',
      'wingfoil agent execute --element plan:<instance-id> --role coordinator',
    ]) expect(spans).toContain(expected);
  });

  it('every `wingfoil …` span of the new text names a registered command and its options', () => {
    const spans = newSpans();
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.map(problem).filter((p): p is string => p !== undefined)).toEqual([]);
  });

  it.each([
    ['docs/agents.md', AGENTS_DOC],
    ['docs/user-guide.md', USER_GUIDE],
  ])('%s carries neither "signed" nor "human-approved" (dl-212 D4), beside the coordinator sentence', (file, text) => {
    expect(text).not.toMatch(/\bsigned\b/i);
    expect(text).not.toMatch(/human-approved/i);
    expect(flat(text)).toContain(
      file === 'docs/agents.md' ? NEVER_SENTENCE : 'and never approves, rejects, amends or decides a gate',
    );
  });
});
