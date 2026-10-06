/**
 * WORKFLOW.md parity gate (task-148, bug-170; `dl-116` Q1 (A) — enumeration parity, modelled on
 * `cli-reference.test.ts`; phase scoping task-187, bug-206).
 *
 * `.wingfoil/WORKFLOW.md` is the human-readable reference of this repository's workflows. It drifted
 * because each decision that added a phase edited the workflow YAML and `CLAUDE.md`, and nothing
 * compared the reference with `workflows.yaml` (bug-170). This test loads the workflow registry the
 * CLI loads — the manifest and every file its `include` list names — and requires:
 *
 * - every workflow name to appear in `WORKFLOW.md` as a whole word;
 * - every phase to be **documented for its own workflow** (bug-206): named as a whole word inside one
 *   of that workflow's regions, or as the pair `workflow/phase` anywhere. A workflow's regions are the
 *   sections whose heading names it in backticks (to the next heading of the same or a higher level),
 *   the Mermaid `subgraph … ["workflow"]` blocks, and the Mermaid node labels that name it in
 *   backticks (a sub-workflow summarised in one node). A section ends at the next heading of any
 *   level, so a subsection about another workflow does not lend it names. In a section or a subgraph
 *   the phase must be marked as a name — a bold node title `**phase**` or inline code `` `phase` `` —
 *   since prose there uses the same common words ("the end-to-end gate"); a one-node summary lists
 *   its phases bare as an arrow chain (`fresh-init → drive-cli → gate`), so there a name counts only
 *   next to a `→` — the label's prose ("Approval gate") does not (review fix F1). A `.` does not bound
 *   a name: `memory.submit` is an action, not the `submit` phase, and `submit.x` is no mention either.
 *
 * Before bug-206 a phase counted as documented wherever its name occurred, so common-word phases
 * (`submit`, `approve`, `gate`, `design`, `capture`) passed on any prose or dotted action. A task that
 * adds or renames a phase therefore updates its workflow's part of the reference in the same change.
 * Deterministic: the registry is walked in `include` order and the missing names are reported sorted.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowsYaml } from '../../src/core/loaders';

const repoRoot = join(__dirname, '..', '..');
const referencePath = join(repoRoot, '.wingfoil', 'WORKFLOW.md');
const FIXTURE = join(__dirname, 'fixtures', 'enumeration-parity', 'workflow-md-drift.md');

function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `name` occurs in `text` as a whole word — not part of a longer kebab-case name, and not
 * either side of a dotted name (`memory.submit`, `submit.x`); a `.` that ends a sentence still bounds.
 */
function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_.-])${escape(name)}(?![A-Za-z0-9_-]|\\.[A-Za-z0-9_])`).test(text);
}

/** Whether `name` occurs in `text` marked as a name: in bold (`**name**`) or as inline code. */
function marks(text: string, name: string): boolean {
  return new RegExp(`\\*\\*${escape(name)}\\*\\*|\`${escape(name)}\``).test(text);
}

/**
 * Whether `name` is one of the names a one-node summary's arrows chain (`a → b (opt.) → c`): a name
 * right after a `→`, or right before one. The label's prose ("Approval gate", "design gate") is not
 * a phase list, so a word there names no phase (review fix F1).
 */
function chains(label: string, name: string): boolean {
  const chained: readonly string[] = label.match(/(?<=→\s*)[a-z][a-z0-9-]*|[a-z][a-z0-9-]*(?=\s*(?:\(opt\.\))?\s*→)/g) ?? [];
  return chained.includes(name);
}

/** A region of the reference that documents one workflow, and how a phase must be named in it. */
interface Region {
  readonly text: string;
  /** `marked` in a section or a subgraph; `chained` in a one-node summary, which lists phases bare between arrows. */
  readonly naming: 'marked' | 'chained';
}

/** The regions of `markdown` that document `workflow` (see the module comment), in document order. */
function regionsOf(markdown: string, workflow: string): Region[] {
  const named = new RegExp(`\`${escape(workflow)}\``);
  const lines = markdown.split('\n');
  const regions: Region[] = [];
  const level = (line: string): number => /^(#+) /.exec(line)?.[1]?.length ?? 0;
  let fenced = false;
  const headings = lines.map((line) => {
    if (/^```/.test(line)) fenced = !fenced;
    return fenced ? 0 : level(line);
  });
  lines.forEach((line, start) => {
    const own = headings[start] ?? 0;
    if (own === 0 || !named.test(line)) return;
    const end = headings.findIndex((other, index) => index > start && other > 0);
    regions.push({ text: lines.slice(start, end === -1 ? undefined : end).join('\n'), naming: 'marked' });
  });
  const subgraph = new RegExp(`^\\s*subgraph \\w+\\["${escape(workflow)}"\\]\\n([\\s\\S]*?)^\\s*end\\s*$`, 'gm');
  for (const [block] of markdown.matchAll(subgraph)) regions.push({ text: block, naming: 'marked' });
  for (const [label] of markdown.matchAll(/\["[^"\n]*"\]/g)) if (named.test(label)) regions.push({ text: label, naming: 'chained' });
  return regions;
}

/** The `workflow/phase` pairs of `phases` that `markdown` does not document for their workflow, sorted. */
function undocumentedPhases(markdown: string, phases: ReadonlyArray<readonly [string, string]>): string[] {
  // A Mermaid label writes its line breaks as the two characters `\n`; read them as whitespace, so a
  // name that opens a label line counts as a whole word.
  const text = markdown.replace(/\\n/g, ' ');
  return phases
    .filter(([workflow, phase]) => !mentions(text, `${workflow}/${phase}`) && !regionsOf(text, workflow).some((region) => (region.naming === 'marked' ? marks : chains)(region.text, phase)))
    .map(([workflow, phase]) => `${workflow}/${phase}`)
    .sort();
}

describe('WORKFLOW.md parity — the phase predicate, on a fixture (bug-206)', () => {
  it('does not count a dotted action or an unrelated section as a mention of a phase', () => {
    const phases = [
      ['release-cycle', 'planning'],
      ['release-cycle', 'submit'],
      ['e2e-smoke', 'fresh-init'],
      ['e2e-smoke', 'gate'],
    ] as const;
    expect(undocumentedPhases(readFileSync(FIXTURE, 'utf8'), phases)).toEqual(['e2e-smoke/gate', 'release-cycle/submit']);
  });

  it('counts a workflow/phase pair anywhere, a marked name before a period in its section, and a one-node summary', () => {
    const text = [
      'See `e2e-smoke/gate` for the gate.',
      '',
      '## `release-cycle`',
      '',
      'It ends with `submit`. A plain gate in prose names no phase.',
      '',
      '```mermaid',
      'M1["**Module 1**\\n`backlog-export`\\ngenerate-records → validate"]',
      '```',
    ].join('\n');
    const phases = [
      ['e2e-smoke', 'gate'],
      ['release-cycle', 'submit'],
      ['backlog-export', 'validate'],
      ['backlog-export', 'map-dependencies'],
      ['release-cycle', 'gate'],
    ] as const;
    expect(undocumentedPhases(text, phases)).toEqual(['backlog-export/map-dependencies', 'release-cycle/gate']);
  });

  // Review fix F1: a summary label also carries prose ("Approval gate", "design gate"); only the names
  // its arrows chain are phases.
  it('counts only arrow-chained names in a one-node summary, not its prose', () => {
    const text = [
      '```mermaid',
      'ES["**e2e-smoke** → `e2e-smoke`\\nfresh-init → drive-cli (opt.) → mcp-registration\\n🔑 Approval gate — *approver*"]',
      'DL["**implementation** → `dev-loop`\\n— design gate + TDD cycle per task —"]',
      '```',
    ].join('\n');
    const phases = [
      ['e2e-smoke', 'fresh-init'],
      ['e2e-smoke', 'drive-cli'],
      ['e2e-smoke', 'mcp-registration'],
      ['e2e-smoke', 'gate'],
      ['dev-loop', 'design'],
    ] as const;
    expect(undocumentedPhases(text, phases)).toEqual(['dev-loop/design', 'e2e-smoke/gate']);
  });
});

describe('WORKFLOW.md parity with workflows.yaml (.wingfoil/WORKFLOW.md)', () => {
  const markdown = readFileSync(referencePath, 'utf8');
  const { workflows } = loadWorkflowsYaml(repoRoot);

  it('loads a non-empty registry to compare against', () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('names every workflow workflows.yaml includes', () => {
    const reference = markdown.replace(/\\n/g, ' ');
    const missing = workflows.map((w) => w.name).filter((name) => !mentions(reference, name));
    expect(missing.sort()).toEqual([]);
  });

  it('documents every phase of every workflow workflows.yaml includes, for its own workflow', () => {
    const phases = workflows.flatMap((workflow) => workflow.phases.map((phase) => [workflow.name, phase.name] as const));
    expect(undocumentedPhases(markdown, phases)).toEqual([]);
  });
});
