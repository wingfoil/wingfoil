/**
 * task-381 — the vision-change `cp-004` (`dl-132`): the stories P5.3.4 and P5.3.5 lack (`bug-399`), US-5-06 and
 * Journey 5 step 4.5's story (`bug-289`), and the vision's reader commands (`bug-397`), read from the real files (no
 * fixture, no git, no clock):
 *
 * - AC 1 (red-first): every id of `06_features.md`'s pillar tables is named by the `_(feat: …)_` marker of an `[MVP]`
 *   story and has a row in the story map's index, whose figures equal the computed count; the stories US-2-12
 *   (P5.3.4) and US-4-15 (P5.3.5) of the design's D2;
 * - AC 2 (red-first): US-5-06 says what `wingfoil dna show` returns (D3); the heading of step 4.5 and its story US-5-11
 *   (D4); the BDD delta of D6 (two `Feature:` lines, one narrative persona, two index cells, the "N additional"
 *   figure);
 * - AC 3 (red-first): the journey steps name `wingfoil workflow show release-cycle`, `wingfoil workflow show
 *   <workflow>` and `wingfoil workflow status`, with no "planned" (D5), step 4.5's Outcome is the one `cp-004` states
 *   (D4), and the features bullet names the `[ref]` argument;
 * - the design gate's D9: the sequencer's "Scope changes" section names `cp-004` on a dated line, written at
 *   `schedule`; only the id and a date are pinned, the wording is the developer's.
 *
 * AC 4 (characterization) adds no case: `test/docs` and `test/docs/vision-index.test.ts` staying green are its evidence.
 *
 * A story is the text from a line starting `* **[MVP` up to the next line starting `* ` or `#`, whitespace collapsed;
 * its `feat` ids are those of every `_(feat: …)_` in it. The `flat`, `between` and `rowOf` helpers are copied from
 * `test/docs/vision-change-w1-rows.test.ts`. Deterministic: files read in a fixed order, ids compared as sorted lists.
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

const rowOf = (table: string, id: string): string | undefined =>
  table.split('\n').find((line) => line.startsWith(`| ${id} `));

const FEATURES = read('docs', '01_vision', '06_features.md');
/** The pillar tables: everything before the "Features by Release" section. */
const PILLARS = FEATURES.slice(0, FEATURES.indexOf('## Features by Release'));
/** The ids of the pillar tables' rows (`| P…` / `| X…`), in file order. */
const PILLAR_IDS = PILLARS.split('\n')
  .map((line) => /^\| ((?:P|X)[0-9][0-9.]*)/.exec(line)?.[1])
  .filter((id): id is string => id !== undefined);

const USM_DIR = ['docs', '02_requirements', '01_user_story_map'];
const usm = (file: string): string => read(...USM_DIR, file);
const STORY_FILES = [
  '01_init-migrate.md',
  '02_session-context.md',
  '03_review-workflow.md',
  '04_team-task.md',
  '05_conventions.md',
  '06_decisions.md',
  '07_workflow-config.md',
];

/** The `[MVP]` stories of `text`, each flattened: from `* **[MVP` to the next line starting `* ` or `#`. */
function mvpStories(text: string): string[] {
  const stories: string[] = [];
  let current: string[] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('* ') || line.startsWith('#')) {
      if (current) stories.push(flat(current.join('\n')));
      current = line.startsWith('* **[MVP') ? [line] : null;
    } else if (current) {
      current.push(line);
    }
  }
  if (current) stories.push(flat(current.join('\n')));
  return stories;
}

/** The ids of every `_(feat: …)_` marker of `story` (a comma-separated list each). */
const featIds = (story: string): string[] =>
  [...story.matchAll(/_\(\s*feat:\s*([^)]*)\)/g)].flatMap((match) =>
    (match[1] ?? '').split(',').map((id) => id.trim()).filter((id) => id.length > 0),
  );

const MVP_STORIES = STORY_FILES.flatMap((file) => mvpStories(usm(file)));
const FEAT_IDS = new Set(MVP_STORIES.flatMap(featIds));
const INDEX = usm('00_index.md');
const indexLine = (start: string): string | undefined => INDEX.split('\n').find((line) => line.startsWith(start));

describe('task-381 AC 1 — every MVP feature has a story and an index row, and the figures agree (red-first)', () => {
  it("06_features.md's pillar tables hold 68 ids (the parse this suite counts with)", () => {
    expect(PILLAR_IDS).toHaveLength(68);
  });

  it.each(PILLAR_IDS)('%s is named by the feat marker of an [MVP] story', (id) => {
    expect(FEAT_IDS.has(id)).toBe(true);
  });

  it.each(PILLAR_IDS)("%s has a row in the story map index's pillar tables", (id) => {
    expect(rowOf(INDEX, id)).toBeDefined();
  });

  it('the index\'s "Features mapped under [MVP]" figure equals the count of pillar-table ids', () => {
    const line = indexLine('- **Features mapped under [MVP]');
    expect(line).toBeDefined();
    expect(Number(/:\*\*\s*(\d+)/.exec(line ?? '')?.[1])).toBe(PILLAR_IDS.length);
  });

  it('the index says "Unmapped MVP features:" 0', () => {
    expect(indexLine('- **Unmapped MVP features:**')).toMatch(/^- \*\*Unmapped MVP features:\*\* 0\b/);
  });

  it('the index states the MVP coverage as the count over the count', () => {
    const n = PILLAR_IDS.length;
    expect(indexLine('- **MVP coverage:**')).toContain(`**MVP coverage:** **${n}/${n}**`);
  });

  it('the per-pillar verification ends with the count over the count', () => {
    const n = PILLAR_IDS.length;
    const perPillar = flat(between(INDEX, 'Coverage verification per pillar', /^#/m));
    expect(perPillar).toContain(`→ **${n}/${n}**`);
  });
});

/** The story `id` of `file`, flattened: from `<id>:` to the next line starting `* ` or `#`. */
const storyOf = (file: string, id: string): string => flat(between(usm(file), `${id}:`, /^\* |^#/m));

describe('task-381 AC 1/2 — the stories of P5.3.4 and P5.3.5 (red-first, D2)', () => {
  it.each([
    ['03_review-workflow.md', 'US-2-12', '_(feat: P5.3.4)_', '`wingfoil agent list`'],
    ['05_conventions.md', 'US-4-15', '_(feat: P5.3.5)_', '`wingfoil agent show <run-id>`'],
  ])('%s has %s marked %s and naming %s', (file, id, marker, command) => {
    const story = storyOf(file, id);
    expect(story).toContain(marker);
    expect(story).toContain(command);
  });
});

describe('task-381 AC 2 — US-5-06, step 4.5 and its story, and the BDD delta (red-first, D3, D4, D6)', () => {
  const decisions = usm('06_decisions.md');
  const STEP_45 = '### Step 4.5 — Check release progress (read-only view)';

  it('US-5-06 names `wingfoil dna show`, team size and stacks, and promises neither a current phase nor risks', () => {
    const story = storyOf('06_decisions.md', 'US-5-06');
    expect(story).toContain('`wingfoil dna show`');
    expect(story).toContain('team size');
    expect(story).toContain('stacks');
    expect(story).not.toContain('current phase');
    expect(story).not.toContain('risks');
  });

  it(`06_decisions.md has the heading "${STEP_45}" after Step 4 and before Step 5`, () => {
    const lines = decisions.split('\n');
    const at = lines.indexOf(STEP_45);
    const step4 = lines.findIndex((line) => line.startsWith('### Step 4 '));
    const step5 = lines.findIndex((line) => line.startsWith('### Step 5 '));
    expect(at).toBeGreaterThan(-1);
    expect(step4).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(step4);
    expect(at).toBeLessThan(step5);
  });

  it('US-5-11 sits under step 4.5, names `wingfoil workflow status`, carries _(ref: P4.5 and no feat marker', () => {
    expect(decisions.split('\n').includes(STEP_45)).toBe(true);
    const section = between(decisions, STEP_45, /^### Step 5 /m);
    expect(section).toContain('US-5-11:');
    const story = flat(between(section, 'US-5-11:', /^\* |^#/m));
    expect(story).toContain('`wingfoil workflow status`');
    expect(story).toContain('_(ref: P4.5');
    expect(story).not.toMatch(/_\(\s*feat:/);
  });

  const BDD = ['docs', '02_requirements', '02_bdd'];
  const feature = (file: string): string[] =>
    read(...BDD, 'features', 'p5-interaction', file).split('\n');

  it.each([
    ['P5.3.4-agent-list.feature', 'Feature: P5.3.4 (US-2-12) - '],
    ['P5.3.5-agent-show.feature', 'Feature: P5.3.5 (US-4-15) - '],
  ])('%s opens with "%s…"', (file, start) => {
    expect(feature(file)[0]).toMatch(new RegExp(`^${start.replace(/[.()]/g, '\\$&')}`));
  });

  it("P5.3.4-agent-list.feature's narrative follows its home story: its second line starts \"  As Sam,\"", () => {
    expect(feature('P5.3.4-agent-list.feature')[1]).toMatch(/^ {2}As Sam,/);
  });

  const bddIndex = read(...BDD, '00_index.md');

  it.each([
    ['P5.3.4', /^\| P5\.3\.4\s+\| US-2-12\s+\|/m],
    ['P5.3.5', /^\| P5\.3\.5\s+\| US-4-15\s+\|/m],
  ])("the BDD index's %s row names its story", (id, row) => {
    expect(rowOf(bddIndex, id)).toMatch(row);
  });

  it('the BDD index\'s "The N additional" figure equals the [MVP] stories with a ref marker and no feat marker', () => {
    const refOnly = MVP_STORIES.filter((story) => /_\(\s*ref:/.test(story) && !/_\(\s*feat:/.test(story));
    const figure = Number(/The (\d+) additional/.exec(bddIndex)?.[1]);
    expect(figure).toBe(refOnly.length);
    expect(refOnly.some((story) => story.includes('US-5-11:'))).toBe(true);
  });
});

describe("task-381 AC 3 — the vision's reader commands name the shipped forms (red-first, D5)", () => {
  const journeys = read('docs', '01_vision', '05_journeys.md');
  const journey = (n: string): string => between(journeys, `## Journey ${n} `, /^## /m);

  it.each(['workflow show --name', '(P4.5, planned)', 'until it ships'])('05_journeys.md no longer contains "%s"', (text) => {
    expect(journeys.split('\n').filter((line) => line.includes(text))).toEqual([]);
  });

  it.each([
    ['2', '3', '`wingfoil workflow show release-cycle`'],
    ['3', '2', '`wingfoil workflow show release-cycle`'],
    ['5', '4.5', '`wingfoil workflow status`'],
    ['6', '1', '`wingfoil workflow show <workflow>`'],
  ])('Journey %s step %s names %s', (n, step, command) => {
    expect(rowOf(journey(n), step)).toContain(command);
  });

  it('Journey 5 step 4.5 states what `wingfoil workflow status` prints, not a state per release (D4)', () => {
    const row = rowOf(journey('5'), '4.5');
    expect(row).toContain('The open runs, each at its current phase, and what is pending or blocking');
    expect(row).not.toContain("Each release's state");
  });

  it('the active-context bullet of 06_features.md names the [ref] argument, not --name', () => {
    const text = flat(between(FEATURES, '- **Active context:**', /^- /m));
    expect(text).toContain('subsequent commands target it unless a workflow is named by its `[ref]` argument');
    expect(text).not.toContain('unless `--name` is given');
  });
});

describe("task-381 D9 — the sequencer's Scope changes name cp-004 on a dated line (red-first, written at schedule)", () => {
  it('a bullet of "Scope changes" names cp-004 and a date', () => {
    const sequencer = read('docs', '01_vision', '07_sequencer.md');
    const scope = between(sequencer, '### Scope changes', /^---/m);
    const bullets = scope.split(/^- /m).slice(1).map(flat);
    const named = bullets.filter((bullet) => bullet.includes('cp-004'));
    expect(named).not.toHaveLength(0);
    expect(named.some((bullet) => /\b\d{4}-\d{2}-\d{2}\b/.test(bullet))).toBe(true);
  });
});
