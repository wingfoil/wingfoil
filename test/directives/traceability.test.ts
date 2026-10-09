/**
 * task-197 — the `traceability` directive states which type a finding is filed as (`dl-118` rules 1–3,
 * option (B)), who files an element during parallel work and who authors acceptance criteria
 * (`dl-102` §1 (a), §3), and what a plan's `release` means (`bug-186`, approved triage); the
 * `capture` phases of `bug-ingest` and `decision-log-ingest` point at the filing rule (`dl-118` (B)).
 *
 * Characterization of directive and configuration text (documentation ACs, `testing` directive T1).
 * Every Memory element the directive cites must exist, so a renamed or mistyped citation fails here
 * rather than leaving a reader with a dangling id. The directive and the workflows are read from the
 * working tree, as the other live-configuration suites do; "no new role" is read against `dna.yaml`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadDnaYaml, loadWorkflowRegistry } from '../../src/core';

const ROOT = join(__dirname, '..', '..');
const TEXT = readFileSync(join(ROOT, '.wingfoil', 'directives', 'custom', 'traceability.md'), 'utf-8');

/** The body of the `## <heading>…` section, up to the next `## ` heading. */
function section(heading: string): string {
  const start = TEXT.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`traceability has no section "## ${heading}"`);
  const end = TEXT.indexOf('\n## ', start + 1);
  return TEXT.slice(start, end < 0 ? undefined : end);
}

/** Whether a Memory element with this full id exists under `docs/04_memory/` (any directory). */
function elementExists(id: string): boolean {
  const walk = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .some((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name === `${id}.md`));
  return walk(join(ROOT, 'docs', '04_memory'));
}

const DL_118 = 'dl-118-choosing-between-decision-log-bug-and-directive';
const DL_060 = 'dl-060-roles-yaml-binds-by-directive-id';
const DL_102 = 'dl-102-acceptance-criteria-checked-against-the-standing-brief';

describe('traceability — which type a finding is filed as (dl-118)', () => {
  const filing = (): string => section('Which type a finding is filed as');

  it('cites dl-118 by its full id, and the element exists', () => {
    expect(filing()).toContain(`\`${DL_118}\``);
    expect(elementExists(DL_118)).toBe(true);
  });

  it('states the three outcomes: bug, decision-log, directive change through a decision-log', () => {
    const s = filing();
    expect(s).toMatch(/^1\. \*\*Bug\*\*/m);
    expect(s).toMatch(/^2\. \*\*Decision-log\*\*/m);
    expect(s).toMatch(/^3\. \*\*Directive change, proposed through a decision-log\*\*/m);
  });

  it('gives dl-060 as the example of rule 2, and the element exists', () => {
    expect(filing()).toContain(`\`${DL_060}\``);
    expect(elementExists(DL_060)).toBe(true);
  });
});

describe('traceability — dl-102 §1 (a) and §3', () => {
  it('states the element-filing rule, citing dl-102 and pointing to git-conventions §6 for allocation', () => {
    const s = section('Who files an element');
    expect(s).toContain(`\`${DL_102}\``);
    expect(elementExists(DL_102)).toBe(true);
    expect(s).toContain('`git-conventions` §6');
  });

  it('names tech-lead for out-of-band criteria and product-owner for backlog criteria, both declared roles', () => {
    const s = section('Who authors acceptance criteria');
    expect(s).toContain('`tech-lead`');
    expect(s).toContain('`product-owner`');
    const roles = loadDnaYaml(ROOT).team.roles.map((r) => r.name);
    expect(roles).toEqual(expect.arrayContaining(['tech-lead', 'product-owner']));
    expect(roles).not.toContain('orchestrator');
  });
});

describe("traceability — a plan's release (bug-186)", () => {
  it('states the release a plan serves, set by its author, and that amend keeps it reserved', () => {
    const s = section("A plan's `release`");
    expect(s).toContain('bug-186');
    expect(s).toContain('set by its author');
    expect(s).toContain('memory amend');
  });
});

describe('ingest capture phases point at the filing rule (dl-118 (B))', () => {
  const capture = (name: string): string => {
    const wf = loadWorkflowRegistry(ROOT).workflows.find((w) => w.name === name);
    if (wf === undefined) throw new Error(`no workflow '${name}'`);
    const phase = wf.phases.find((p) => p.name === 'capture');
    if (phase === undefined) throw new Error(`${name} has no capture phase`);
    return String(phase.description ?? '');
  };

  it.each(['bug-ingest', 'decision-log-ingest'])("%s's capture description names the traceability directive and dl-118", (name) => {
    const description = capture(name);
    expect(description).toContain('traceability');
    expect(description).toContain('dl-118');
  });

  it('the directive file exists where the pointer sends the reader', () => {
    expect(existsSync(join(ROOT, '.wingfoil', 'directives', 'custom', 'traceability.md'))).toBe(true);
  });
});
