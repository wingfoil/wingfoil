/**
 * task-299 AC3 — `doc-versioning` states that a tool write is a revision of its own (`dl-174` (a),
 * `spec-006` §6 item 7): a `wingfoil` command that writes one of the four versioned configuration files
 * raises its `version:` in its own commit, so the one-bump-per-branch rule applies to hand edits.
 *
 * Red-first (task-299 design gate D2: the sentence is new). Pins are substrings of whitespace-flattened
 * text of *The bump rule* (task-276, the shape of `integration-branch-baseline.test.ts`). No version pin:
 * the directive declares none (task-299 design gate D1).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_VERSIONING = readFileSync(
  join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom', 'doc-versioning.md'),
  'utf-8',
);

const flat = (s: string): string => s.replace(/\s+/g, ' ');

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

describe('doc-versioning — a tool write is a revision of its own (task-299, dl-174)', () => {
  it('AC3: The bump rule states that a tool write raises the version and the one-bump rule applies to hand edits', () => {
    const bump = flat(section(DOC_VERSIONING, 'The bump rule'));
    expect(bump).toContain('A tool write is a revision of its own');
    expect(bump).toContain('`dl-174` (a)');
    expect(bump).toContain('`spec-006` §6 item 7');
    expect(bump).toContain('the one-bump-per-branch rule above applies to hand edits');
  });
});
