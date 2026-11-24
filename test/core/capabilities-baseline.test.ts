/**
 * task-363 AC 4 (`spec-019` §8, §12 AC 12; `dl-213` (a); approver ruling D4 (a), D6) — the 0.3.2 baseline
 * capabilities document, `test/core/fixtures/capabilities-document-baseline-0.3.2.json`, and the lines §8 derives
 * from it for the first section that carries them, 0.4.0.
 *
 * - characterization (passes on first run): the baseline's bytes — `format: 1`, the nine file kinds at `1..1`, the
 *   35 commands of 0.3.2 as a literal (never read from the pinned build, whose pin moves), no capability, written
 *   `JSON.stringify` plus one `\n` in §3.2's order; it equals the document built from literals alone — §8's
 *   "the nine kinds at `1..1`", the 35 commands of 0.3.2, no capability — never from the live §5 fixture, which
 *   grows with every capability a later task adds (D6 (a));
 * - red until AC 1's function exists: `releaseLines(baseline, §5 fixture)` gives `Formats read: unchanged` and
 *   `Capabilities: ` followed by the fixture's own capabilities, which contain §8's six names (D6: never a count).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { releaseLines } from '../../scripts/changelog-section.cjs';

const ROOT = join(__dirname, '..', '..');
const BASELINE_FILE = join(ROOT, 'test', 'core', 'fixtures', 'capabilities-document-baseline-0.3.2.json');
const FIXTURE_FILE = join(ROOT, 'test', 'core', 'fixtures', 'capabilities-document.json');

interface Doc {
  format: number;
  formats: Record<string, { lowest: number; highest: number }>;
  commands: string[];
  capabilities: string[];
}

const KINDS = ['agent-adapter', 'bindings', 'directive', 'dna', 'memory', 'memory-template', 'roles', 'workflow', 'workflows'];

/** The 35 commands of 0.3.2: `git show v0.3.2:docs/cli-reference.md` and the pinned 0.3.2 build's `--help`. */
const COMMANDS_0_3_2 = [
  'agent execute', 'agent list', 'agent show',
  'directive assign', 'directive create', 'directive remove', 'directives list',
  'dna add', 'dna remove', 'dna set', 'dna show', 'dna update',
  'init', 'mcp',
  'memory add', 'memory amend', 'memory approve', 'memory deprecate', 'memory history', 'memory park', 'memory reject',
  'memory search', 'memory submit',
  'paths',
  'workflow adopt', 'workflow create', 'workflow end', 'workflow finalize', 'workflow list', 'workflow next',
  'workflow rekey', 'workflow remove', 'workflow show', 'workflow start', 'workflow status',
];

/** `spec-019` §8: the 0.4.0 `Capabilities:` line against the baseline names these six. */
const SECTION_8_NAMES = ['agent-execute', 'directive-verbs', 'dna-verbs', 'mcp-server', 'memory-verbs', 'workflow-tracking'];

const baselineText = readFileSync(BASELINE_FILE, 'utf-8');
const fixtureText = readFileSync(FIXTURE_FILE, 'utf-8');

describe('task-363 AC 4 — the 0.3.2 baseline capabilities document (characterization)', () => {
  it('is JSON.stringify bytes plus one final newline, 910 bytes, sha256 9f91dddd…152e27f', () => {
    expect(baselineText).toBe(`${JSON.stringify(JSON.parse(baselineText))}\n`);
    expect(Buffer.byteLength(baselineText, 'utf-8')).toBe(910);
    expect(createHash('sha256').update(baselineText).digest('hex')).toBe(
      '9f91ddddee5f85f6045a43cab016344d9abb766152a540d8615c34155152e27f',
    );
  });

  it('holds format 1, the nine kinds at 1..1, the 35 commands of 0.3.2 and no capability, in §3.2\'s key order', () => {
    const doc = JSON.parse(baselineText) as Doc;
    expect(Object.keys(doc)).toEqual(['format', 'formats', 'commands', 'capabilities']);
    expect(doc.format).toBe(1);
    expect(Object.keys(doc.formats)).toEqual(KINDS);
    for (const kind of KINDS) {
      expect(Object.keys(doc.formats[kind] ?? {})).toEqual(['lowest', 'highest']);
      expect(doc.formats[kind]).toEqual({ lowest: 1, highest: 1 });
    }
    expect(COMMANDS_0_3_2).toHaveLength(35);
    expect(doc.commands).toEqual(COMMANDS_0_3_2);
    expect(doc.capabilities).toEqual([]);
  });

  it('equals the document built from §8\'s 0.3.2 statement and the literal 0.3.2 command list, not the live §5 fixture', () => {
    // `spec-019` §8: "the nine kinds at `1..1` …, the 35 commands of 0.3.2, and no capability".
    const expected: Doc = {
      format: 1,
      formats: Object.fromEntries(KINDS.map((kind) => [kind, { lowest: 1, highest: 1 }])),
      commands: [...COMMANDS_0_3_2],
      capabilities: [],
    };
    expect(`${JSON.stringify(expected)}\n`).toBe(baselineText);
  });
});

describe('task-363 AC 4 — the 0.4.0 lines §8 derives from the baseline (red until releaseLines exists)', () => {
  it('against the baseline, the §5 fixture gives `Formats read: unchanged` and its own capabilities, §8\'s six among them', () => {
    const fixture = JSON.parse(fixtureText) as Doc;
    const result = releaseLines(JSON.parse(baselineText), fixture);
    expect(result).toEqual({
      ok: true,
      formatsRead: 'Formats read: unchanged',
      capabilities: `Capabilities: ${fixture.capabilities.join(', ')}`,
      breaking: [],
    });
    for (const name of SECTION_8_NAMES) expect(fixture.capabilities).toContain(name);
  });
});
