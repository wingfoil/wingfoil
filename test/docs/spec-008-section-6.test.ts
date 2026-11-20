/**
 * task-375 AC 4 and AC 5 (characterization; `bug-536`, `bug-548`) — `spec-008-cli-grammar` §6, as amended at the design
 * gate (`2dfd6fb91`):
 *
 * - **AC 4:** the pinned-refusal table holds the `E_NOT_A_MEMBER` row — exit `1`, `init` named as excluded — and its
 *   message and `hint:` line are byte-equal to the fenced block of `spec-006-core-domain-api` §7 "Membership", read
 *   from that file, not retyped;
 * - **AC 5:** the warnings table pins the `agent execute` warning texts the design lists (the four families `bug-548`
 *   found missing: the version change, the headless output's usage and session reasons, the transcript source), and the
 *   sentence before the table says which other `agent execute` warnings `spec-016` words and leaves "outside this
 *   claim".
 *
 * Unasserted here (T1): that the listed texts are every warning `src/agent` builds — the list is the design's.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SPECS = join(__dirname, '..', '..', 'docs', '04_memory', 'design', 'specs');

function specFile(prefix: string): string {
  const name = readdirSync(SPECS).find((entry) => entry.startsWith(`${prefix}-`) && entry.endsWith('.md'));
  if (name === undefined) throw new Error(`no ${prefix} under ${SPECS}`);
  return readFileSync(join(SPECS, name), 'utf-8');
}

/** The text from the line starting `start` up to (excluding) the next line starting `end`. */
function section(text: string, start: string, end: RegExp): string {
  const lines = text.split('\n');
  const from = lines.findIndex((line) => line.startsWith(start));
  if (from < 0) throw new Error(`no heading ${start}`);
  const to = lines.findIndex((line, index) => index > from && end.test(line));
  return lines.slice(from, to < 0 ? undefined : to).join('\n');
}

/** A Markdown table row's cells, split on unescaped pipes, trimmed. */
function cells(row: string): string[] {
  return row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim());
}

const SECTION_6 = section(specFile('spec-008'), '### 6.', /^### 7\./);

describe('task-375 AC 4 — spec-008 §6 lists E_NOT_A_MEMBER (bug-536)', () => {
  const membership = section(specFile('spec-006'), '### 7.', /^##+ /);
  const fence = /```\n(error: E_NOT_A_MEMBER[^\n]*)\n(hint: [^\n]*)\n```/.exec(membership);

  it("spec-006 §7 holds the membership refusal's fenced error and hint lines", () => {
    expect(fence).not.toBeNull();
  });

  const rows = SECTION_6.split('\n').filter((line) => line.startsWith('|')).map(cells);
  const row = rows.find((candidate) => (candidate[2] ?? '').startsWith('`E_NOT_A_MEMBER: the git identity <name> <email> is not a team member'));

  it('a row of the pinned-refusal table carries E_NOT_A_MEMBER, exit `1`, and names init as excluded', () => {
    expect(row).toBeDefined();
    expect(row?.[1]).toBe('`1`');
    expect(row?.[0]).toMatch(/not `init`/);
  });

  it("the row's message and hint are byte-equal to spec-006 §7's fenced block", () => {
    const message = (fence?.[1] ?? '').slice('error: '.length);
    const hint = (fence?.[2] ?? '').slice('hint: '.length);
    expect(message).not.toBe('');
    expect(hint).not.toBe('');
    expect(row?.[2]).toContain(`\`${message}\``);
    expect(row?.[2]).toContain(`with the \`hint:\` line \`${hint}\``);
  });
});

describe('task-375 AC 5 — spec-008 §6 pins the agent execute warnings or states them outside the claim (bug-548)', () => {
  const lines = SECTION_6.split('\n');
  const header = lines.findIndex((line) => line.startsWith('| Command | Warning |'));
  const tableEnd = lines.findIndex((line, index) => index > header && !line.startsWith('|'));
  const table = lines.slice(header, tableEnd < 0 ? undefined : tableEnd).join('\n');

  const WARNINGS = [
    "the agent CLI changed during the run: version_args printed '<before>' before the launch and '<after>' after it",
    'the headless output is not one JSON document',
    'the headless output is over 1 MiB',
    'the headless output carries no session id',
    'usage.transcript: ',
    'the transcript of session <session> <reason>',
    'is not a non-negative integer in a message: not read from it',
    'model is not a string in a message: not read from it',
  ];

  it('the warnings table exists in §6', () => {
    expect(header).toBeGreaterThan(0);
  });

  it.each(WARNINGS)('the warnings table pins %j', (text) => {
    expect(table).toContain(text);
  });

  it("the sentence before the table leaves agent execute's other warnings to spec-016, outside the claim", () => {
    const before = lines.slice(Math.max(0, header - 12), header).join(' ').replace(/\s+/g, ' ');
    expect(before).toContain("`agent execute`'s other warnings");
    expect(before).toContain('are worded by `spec-016` and are outside this claim');
  });
});
