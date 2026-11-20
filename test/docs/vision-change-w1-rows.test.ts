/**
 * task-360 — the vision-change `cp-003` (`dl-132`, plan ruling W1-R2): the feature rows of `wingfoil capabilities`
 * (P5.1.5, `spec-019`) and `wingfoil verify` (P1.14, `spec-020`), P5.2.3 restated without `approve`, and each layer the
 * change's impact analysis names, read from the real files (no fixture):
 *
 * - AC 2 (characterization): `docs/01_vision/06_features.md` — the two pillar rows, the two `v0.4` rows, P5.2.3's
 *   `v0.4` Notes without "Submit, approve" and with the refusal, the MVP total equal to the pillar tables' id rows;
 * - AC 3 (characterization): the User Story Map — US-0A-23 and US-4-14 with their feature markers, the index's pillar
 *   rows and its MVP total equal to the count of `06_features.md`;
 * - AC 4 (characterization, `downcast-scenarios`): the two new feature files, their `Feature:` lines and the scenario
 *   titles of the change-proposal's BDD subsection, scenarios 1–13; `P5.2.3-mcp-tools.feature`'s refusing Scenario
 *   Outline and the agent-as-author step restated (design gate D7); the missing-argument scenario left for `task-367`;
 * - AC 5 (red-first): the SARD sentences `downcast-requirements` writes — REQ-SEC-02 and REQ-SEC-03 carry `spec-020`'s
 *   fit sentence verbatim and trace `spec-020` and P1.14 (REQ-SEC-03 also P5.2.3, D3); REQ-INT-01 traces `spec-019`
 *   and P5.1.5; REQ-INT-03's Fit Criterion is restated (D4).
 *
 * Text is compared with whitespace runs collapsed, so a re-wrap of a paragraph does not break a pin; the words are
 * pinned verbatim. The `flat` and `between` helpers are copied from `test/docs/l0-traceability.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (...path: string[]): string => readFileSync(join(REPO_ROOT, ...path), 'utf-8');

/** `text` with blockquote markers dropped and every whitespace run a single space. */
const flat = (text: string): string => text.replace(/^>[ \t]?/gm, '').replace(/\s+/g, ' ').trim();

/** The text from the line starting `start` to the next line starting `end` (exclusive), or to the end. */
function between(text: string, start: string, end: RegExp): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`not found: ${start}`);
  const rest = text.slice(from + start.length);
  const stop = rest.search(end);
  return start + (stop === -1 ? rest : rest.slice(0, stop));
}

const FEATURES = read('docs', '01_vision', '06_features.md');
/** The pillar tables: everything before the "Features by Release" section. */
const PILLARS = FEATURES.slice(0, FEATURES.indexOf('## Features by Release'));
const V04 = between(FEATURES, '### **v0.4', /^### /m);
/** The id rows of the pillar tables (`| P…` / `| X…`), as `06_features.md`'s pillar tables hold them. */
const PILLAR_ID_ROWS = PILLARS.split('\n').filter((line) => /^\| (P|X)[0-9]/.test(line));
const rowOf = (table: string, id: string): string | undefined =>
  table.split('\n').find((line) => line.startsWith(`| ${id} `));

describe('task-360 AC 2 — 06_features.md holds the P1.14 and P5.1.5 rows and restates P5.2.3 (characterization)', () => {
  it('Pillar 1 has a P1.14 row naming `wingfoil verify`', () => {
    expect(rowOf(PILLARS, 'P1.14')).toContain('`wingfoil verify`');
  });

  it('P5.1 has a P5.1.5 row naming `wingfoil capabilities`', () => {
    const p51 = between(PILLARS, '#### **5.1', /^#### /m);
    expect(rowOf(p51, 'P5.1.5')).toContain('`wingfoil capabilities`');
  });

  it.each([
    ['P1.14', '`wingfoil verify`'],
    ['P5.1.5', '`wingfoil capabilities`'],
  ])('the v0.4 table has a %s row naming %s', (id, name) => {
    expect(rowOf(V04, id)).toContain(name);
  });

  it("the v0.4 table's P5.2.3 row no longer says \"Submit, approve\" and states the refusal (E_AGENT_CONTEXT)", () => {
    const row = rowOf(V04, 'P5.2.3');
    expect(row).toBeDefined();
    expect(row).not.toContain('Submit, approve');
    expect(row).toContain('E_AGENT_CONTEXT');
  });

  it('"Total Features (MVP)" is 68 and equals the id rows of the pillar tables', () => {
    expect(FEATURES).toContain('**Total Features (MVP):** 68');
    expect(PILLAR_ID_ROWS).toHaveLength(68);
  });
});

describe('task-360 AC 3 — the User Story Map holds US-0A-23 and US-4-14 and agrees with 06_features.md (characterization)', () => {
  const usm = (file: string): string => read('docs', '02_requirements', '01_user_story_map', file);

  it.each([
    ['01_init-migrate.md', 'US-0A-23', '_(feat: P5.1.5)_'],
    ['05_conventions.md', 'US-4-14', '_(feat: P1.14)_'],
  ])('%s has %s marked %s', (file, id, marker) => {
    const story = between(usm(file), `${id}:`, /^\* |^#/m);
    expect(story).toContain(marker);
  });

  const index = usm('00_index.md');

  it.each(['P1.14', 'P5.1.5'])("the index's pillar tables have a %s row", (id) => {
    expect(rowOf(index, id)).toBeDefined();
  });

  it('the index\'s "Total MVP features" figure equals the count of 06_features.md\'s pillar tables', () => {
    const line = index.split('\n').find((candidate) => candidate.startsWith('- **Total MVP features'));
    expect(line).toBeDefined();
    const figure = Number(/(\d+)\s*$/.exec(line ?? '')?.[1]);
    expect(figure).toBe(PILLAR_ID_ROWS.length);
  });
});

const bdd = (folder: string, file: string): string =>
  read('docs', '02_requirements', '02_bdd', 'features', folder, file);
/** The first line that is not a comment, a tag or blank (the BDD index's re-count rule). */
const firstLine = (feature: string): string | undefined =>
  feature.split('\n').find((line) => !/^\s*(#|@|$)/.test(line));
/** The scenario titles of `feature`, `Scenario:` and `Scenario Outline:` alike. */
const titles = (feature: string): string[] =>
  feature
    .split('\n')
    .filter((line) => /^ {2}Scenario( Outline)?: /.test(line))
    .map((line) => line.replace(/^ {2}Scenario( Outline)?: /, ''));

describe("task-360 AC 4 — the BDD delta of cp-003's analysis, scenarios 1–13 (characterization)", () => {
  it.each([
    ['p5-interaction', 'P5.1.5-capabilities.feature', 'Feature: P5.1.5 (US-0A-23) - '],
    ['p1-memory', 'P1.14-verify.feature', 'Feature: P1.14 (US-4-14) - '],
  ])('%s/%s opens with "%s…"', (folder, file, start) => {
    expect(firstLine(bdd(folder, file))?.startsWith(start)).toBe(true);
  });

  it.each([
    ['p5-interaction', 'P5.1.5-capabilities.feature', 'Print the capabilities document as JSON'],
    ['p5-interaction', 'P5.1.5-capabilities.feature', 'The YAML output parses to the JSON document'],
    ['p5-interaction', 'P5.1.5-capabilities.feature', 'The same output outside a git repository'],
    ['p5-interaction', 'P5.1.5-capabilities.feature', 'Error - an operand is refused'],
    ['p5-interaction', 'P5.2.1-mcp-resources.feature', 'Read the capabilities document as an MCP resource'],
    ['p5-interaction', 'P5.2.1-mcp-resources.feature', 'Error - a write to the capabilities resource is refused'],
    ['p1-memory', 'P1.14-verify.feature', 'Error - a forged approval fails the check'],
    ['p1-memory', 'P1.14-verify.feature', 'Error - a status changed outside a Memory operation fails the check'],
    ['p1-memory', 'P1.14-verify.feature', 'Error - an approval carrying an agent trailer fails the check'],
    ['p1-memory', 'P1.14-verify.feature', 'Findings before the introduction are history'],
    ['p1-memory', 'P1.14-verify.feature', 'The report under json and yaml'],
    ['p1-memory', 'P1.14-verify.feature', 'A range written by the verbs passes'],
    ['p5-interaction', 'P5.2.3-mcp-tools.feature', 'Error - an approver-gated Tool refuses in an agent context'],
  ])('%s/%s has the scenario "%s"', (folder, file, title) => {
    expect(titles(bdd(folder, file))).toContain(title);
  });

  const tools = bdd('p5-interaction', 'P5.2.3-mcp-tools.feature');

  it('P5.2.3-mcp-tools.feature has a Scenario Outline over memory.approve, memory.reject and memory.amend quoting E_AGENT_CONTEXT', () => {
    const outline = between(tools, '  Scenario Outline: Error - an approver-gated Tool refuses in an agent context', /^ {2}Scenario/m);
    const examples = between(outline, '    Examples:', /^ {2}\S/m);
    for (const tool of ['memory.approve', 'memory.reject', 'memory.amend']) {
      expect(examples).toMatch(new RegExp(`^\\s*\\|\\s*${tool.replace('.', '\\.')}\\s*\\|`, 'm'));
    }
    expect(outline).toContain('E_AGENT_CONTEXT');
  });

  it('P5.2.3-mcp-tools.feature no longer says "with the agent as author" (design gate D7)', () => {
    expect(tools).not.toContain('with the agent as author');
  });

  it("the missing-argument scenario is left as it is, for task-367's gate (W1-R2)", () => {
    expect(titles(tools)).toContain('Error - invoking a tool with a missing required argument');
    expect(tools).toContain('Then the tool returns error "missing required argument: reason"');
  });
});

describe('task-360 AC 5 — the SARD sentences of cp-003 (red-first: written at downcast-requirements)', () => {
  const FIT_SENTENCE =
    'A commit range in which a forged approval or an out-of-band status change exists makes `wingfoil verify` exit `1`.';
  const security = read('docs', '02_requirements', '03_sard', '05_security-compliance.md');
  const integrations = read('docs', '02_requirements', '03_sard', '04_integrations.md');
  const fitOf = (req: string): string => flat(between(req, '* **Fit Criterion:**', /^\* \*\*Traceability:\*\*/m));
  const traceOf = (req: string): string => flat(between(req, '* **Traceability:**', /^#{1,3} |^---/m));

  describe.each([
    ['REQ-SEC-02', ['spec-020', 'P1.14']],
    ['REQ-SEC-03', ['spec-020', 'P1.14', 'P5.2.3']],
  ])('%s', (id, traced) => {
    const req = between(security, `### ${id}`, /^### /m);

    it("the Fit Criterion carries spec-020's sentence verbatim", () => {
      expect(fitOf(req)).toContain(FIT_SENTENCE);
    });

    it.each(traced)('the Traceability names %s', (name) => {
      expect(traceOf(req)).toContain(name);
    });
  });

  it.each(['spec-019', 'P5.1.5'])('REQ-INT-01\'s Traceability names %s', (name) => {
    expect(traceOf(between(integrations, '### REQ-INT-01', /^### /m))).toContain(name);
  });

  it('REQ-INT-03\'s Fit Criterion no longer promises memory.approve via MCP and states the E_AGENT_CONTEXT refusal (D4)', () => {
    const fit = fitOf(between(integrations, '### REQ-INT-03', /^### /m));
    expect(fit).not.toContain('`memory.submit`/`memory.approve` invoked via MCP');
    expect(fit).toContain('E_AGENT_CONTEXT');
  });
});
