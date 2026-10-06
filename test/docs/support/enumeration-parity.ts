/**
 * The engine of the enumeration-parity gates (`task-187-add-enumeration-parity-tests-commands-memory-types-exit`,
 * `dl-116-document-parity-tests-beyond-the-cli-reference` Q1 (A), Q2 (a), Q3 (ii)).
 *
 * A specification restates lists the code or the configuration defines: the commands the CLI ships,
 * the Memory types and their state machines, the exit codes, the MCP Resources and Tools. Each gate
 * under `test/docs/*-parity.test.ts` reads one such list out of a document (a **document side**),
 * derives the same list from the code (a **code side**), and compares the two with
 * {@link compareEnumeration}. A difference is a {@link ParityFinding}:
 *
 * - `missing` — the code has the item and the document does not name it;
 * - `surplus` — the document names an item the code does not have (planned, retired, or wrong).
 *
 * Findings are keyed by enumeration, document, direction and item — never by line (`dl-075`) — so a
 * finding does not move when text above it does. The allowlist (`../enumeration-parity.allowlist.ts`)
 * says why each first-run finding is there, the same ratchet as `name-resolvability.test.ts`
 * (`task-151`): see {@link checkAllowlist} for what fails in each mode.
 *
 * This module holds only pure functions over text and lists; each gate builds its own code side.
 * Deterministic: every list is sorted, and nothing reads the clock or iterates an unordered source.
 */
import { load } from 'js-yaml';

/** Which way a document disagrees with the code. */
export type ParityDirection = 'missing' | 'surplus';

/** One difference between a document's enumeration and the code's. */
export interface ParityFinding {
  /** The enumeration compared, e.g. `spec-008 §1 nouns` — one gate may compare several. */
  readonly enumeration: string;
  /** Repository-relative path of the document, or a fixture label. */
  readonly document: string;
  readonly direction: ParityDirection;
  /** The item the two sides disagree about, e.g. `memory park` or `task: waiting backlog`. */
  readonly item: string;
}

/** An allowed finding, with the reason it is there. */
export interface ParityAllowlistEntry extends ParityFinding {
  /** Never empty. */
  readonly reason: string;
  /**
   * For a `planned` entry only: the short ids (`task-217`) of the tasks expected to make the item true,
   * none of them `done` when the entry was written. Once every one is `done`, the plan is spent.
   */
  readonly plannedBy?: readonly string[];
}

/** The stable key of a finding or an entry: `enumeration|document|direction|item`. */
export function parityKey(finding: ParityFinding): string {
  return `${finding.enumeration}|${finding.document}|${finding.direction}|${finding.item}`;
}

function byKey(a: ParityFinding, b: ParityFinding): number {
  const [x, y] = [parityKey(a), parityKey(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Compare a document's enumeration with the code's: every code item the document does not name is
 * `missing`, every document item the code does not have is `surplus`. Duplicates count once; the
 * result is sorted by key.
 */
export function compareEnumeration(
  enumeration: string,
  document: string,
  documented: readonly string[],
  shipped: readonly string[],
): ParityFinding[] {
  const [doc, code] = [new Set(documented), new Set(shipped)];
  const findings: ParityFinding[] = [
    ...[...code].filter((item) => !doc.has(item)).map((item) => ({ enumeration, document, direction: 'missing' as const, item })),
    ...[...doc].filter((item) => !code.has(item)).map((item) => ({ enumeration, document, direction: 'surplus' as const, item })),
  ];
  return findings.sort(byKey);
}

// ---- reading a document side ----------------------------------------------------------------------

/**
 * The text of a Markdown section, from its heading line to the next heading of the same or a higher
 * level (fenced code is not a heading). Throws when no heading matches, so a renamed section fails
 * the gate loudly instead of yielding an empty enumeration.
 */
export function markdownSection(markdown: string, heading: RegExp): string {
  const lines = markdown.split('\n');
  let fenced = false;
  const isHeading = lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    return !fenced && /^#+ /.test(line);
  });
  const start = lines.findIndex((line, index) => isHeading[index] === true && heading.test(line));
  if (start === -1) throw new Error(`no heading matching ${String(heading)}`);
  const level = headingLevel(lines[start] ?? '');
  const end = lines.findIndex((line, index) => index > start && isHeading[index] === true && headingLevel(line) <= level);
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function headingLevel(line: string): number {
  return /^#+/.exec(line)?.[0].length ?? 0;
}

/** Every inline-code span of `text`, in order (fenced blocks are not excluded: pass prose only). */
export function backticked(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map(([, span]) => span ?? '');
}

/**
 * The backticked names of the first parenthetical that follows `marker` in `text`. Throws when the
 * marker or the parenthetical is gone, for the same reason as {@link markdownSection}.
 */
export function namesInParenthetical(text: string, marker: RegExp): string[] {
  const match = new RegExp(`${marker.source}[^(]*?\\(([^)]*)\\)`).exec(text);
  if (match === null) throw new Error(`no parenthetical after ${String(marker)}`);
  return backticked(match[1] ?? '');
}

/**
 * The backticked names between `marker` and the end of its sentence (a `.` followed by whitespace,
 * or a `(§`/`—` aside, whichever comes first). Throws when the marker is gone.
 */
export function namesInSentence(text: string, marker: RegExp): string[] {
  const match = new RegExp(`${marker.source}([\\s\\S]*?)(?:\\.\\s|\\(§|—)`).exec(text);
  if (match === null) throw new Error(`no sentence after ${String(marker)}`);
  return backticked(match[1] ?? '');
}

/** The body of every fenced code block in `text` whose info string is `lang` (`''` for a bare fence). */
export function fencedBlocks(text: string, lang: string): string[] {
  const blocks: string[] = [];
  const pattern = /^```([^\n]*)\n([\s\S]*?)^```\s*$/gm;
  for (const [, info, body] of text.matchAll(pattern)) if ((info ?? '').trim() === lang) blocks.push(body ?? '');
  return blocks;
}

/**
 * The first cell of every body row of the Markdown tables in `text`, with its backticks removed —
 * the header row (the one a `|---|` delimiter row follows) and the delimiter rows are left out.
 */
export function firstTableColumn(text: string): string[] {
  const lines = text.split('\n');
  const isDelimiter = (line: string | undefined): boolean => line !== undefined && /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line);
  const cells: string[] = [];
  lines.forEach((line, index) => {
    const cell = /^\|\s*([^|]*?)\s*\|/.exec(line)?.[1];
    if (cell === undefined || isDelimiter(line) || isDelimiter(lines[index + 1])) return;
    cells.push(cell.replace(/`/g, ''));
  });
  return cells;
}

/** A parsed YAML document, or a thrown error naming what failed to parse. */
export function parseYaml(text: string, label: string): unknown {
  try {
    return load(text);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

// ---- state machines as facts ----------------------------------------------------------------------

/** The `states` block of a type, as `memory.yaml` and `spec-001`'s worked examples write it. */
export interface StatesBlock {
  readonly sequence?: readonly string[];
  readonly gates?: Readonly<Record<string, { readonly reject?: string } | null | undefined>>;
  readonly waiting?: readonly string[];
  readonly returns?: Readonly<Record<string, string>>;
  readonly limits?: Readonly<Record<string, number>>;
}

/**
 * A state machine flattened into one string per declared fact, prefixed with `owner` (a type name, or
 * `defaults`), sorted — so two machines compare as two sets and a difference names the one fact that
 * differs: `task: sequence draft > pending > …`, `task: gate pending reject draft`,
 * `task: waiting backlog`, `task: returns in-progress > backlog`, `task: limit in-progress 3`.
 * The sequence is one fact because its order is the machine.
 */
export function stateFacts(owner: string, states: StatesBlock | undefined): string[] {
  if (states === undefined) return [`${owner}: no states block`];
  const facts: string[] = [];
  if (states.sequence !== undefined) facts.push(`${owner}: sequence ${states.sequence.join(' > ')}`);
  for (const [state, gate] of Object.entries(states.gates ?? {})) facts.push(`${owner}: gate ${state} reject ${gate?.reject ?? '(none)'}`);
  for (const state of states.waiting ?? []) facts.push(`${owner}: waiting ${state}`);
  for (const [from, to] of Object.entries(states.returns ?? {})) facts.push(`${owner}: returns ${from} > ${to}`);
  for (const [state, limit] of Object.entries(states.limits ?? {})) facts.push(`${owner}: limit ${state} ${String(limit)}`);
  return facts.sort();
}

// ---- the allowlist ratchet ------------------------------------------------------------------------

/** What {@link checkAllowlist} found, every list sorted by key. */
export interface AllowlistCheck {
  /** Findings no entry lists: fail in both modes. */
  readonly unlisted: ParityFinding[];
  /** Entries that list a current finding. */
  readonly listed: ParityAllowlistEntry[];
  /** Entries that list no current finding — the divergence was fixed, so the entry should go. */
  readonly stale: ParityAllowlistEntry[];
  /** Listed `planned` entries whose cited tasks are all `done`: the plan did not deliver. */
  readonly exhausted: ParityAllowlistEntry[];
  /** `key: task` for every cited task that does not exist: fail in both modes. */
  readonly unknownTasks: string[];
}

/**
 * Apply `allowlist` to `findings`. Only entries of the `enumerations` the caller compared are
 * considered, so each gate checks its own share of the one shared allowlist.
 */
export function checkAllowlist(
  findings: readonly ParityFinding[],
  allowlist: readonly ParityAllowlistEntry[],
  enumerations: readonly string[],
  taskStatuses: ReadonlyMap<string, string>,
): AllowlistCheck {
  const scope = new Set(enumerations);
  const entries = allowlist.filter((entry) => scope.has(entry.enumeration));
  const found = new Set(findings.map(parityKey));
  const allowed = new Set(entries.map(parityKey));
  const listed = entries.filter((entry) => found.has(parityKey(entry)));
  const unknownTasks: string[] = [];
  const exhausted: ParityAllowlistEntry[] = [];
  for (const entry of listed) {
    const cited = entry.plannedBy ?? [];
    for (const task of cited) if (!taskStatuses.has(task)) unknownTasks.push(`${parityKey(entry)}: ${task}`);
    if (cited.length > 0 && cited.every((task) => taskStatuses.get(task) === 'done')) exhausted.push(entry);
  }
  return {
    unlisted: findings.filter((finding) => !allowed.has(parityKey(finding))),
    listed,
    stale: entries.filter((entry) => !found.has(parityKey(entry))),
    exhausted,
    unknownTasks,
  };
}

/** The one-paragraph warn-mode report of a gate, or `undefined` when there is nothing to report. */
export function warnReport(gate: string, check: AllowlistCheck, untriagedReason: string): string | undefined {
  const untriaged = check.listed.filter((entry) => entry.reason === untriagedReason);
  if (untriaged.length + check.stale.length + check.exhausted.length === 0) return undefined;
  return [
    `${gate} (warn mode until v0.4): ${String(check.listed.length)} allowlisted finding(s), ${String(untriaged.length)} untriaged, ` +
      `${String(check.stale.length)} stale, ${String(check.exhausted.length)} planned with every task done.`,
    ...untriaged.map((entry) => `  untriaged  ${parityKey(entry)}`),
    ...check.stale.map((entry) => `  stale      ${parityKey(entry)}`),
    ...check.exhausted.map((entry) => `  delivered? ${parityKey(entry)} (${(entry.plannedBy ?? []).join(', ')} all done)`),
  ].join('\n');
}
