/**
 * The vision, the User Story Map and the P1 feature files place Memory documents where the code
 * writes them (task-259; bug-256, bug-257).
 *
 * A Memory element is written at the path its type declares in `memory.yaml`, resolved against the
 * project root (`task-017`, `task-172`); `.wingfoil/memory/` holds only the type templates
 * (`.wingfoil/memory/templates/`). Thirteen passages of `docs/01_vision/` and `docs/02_requirements/`
 * still named `.wingfoil/memory/` as the store, and nothing read them: nothing executes `.feature`
 * files (bug-106). This suite is bug-256's step-1 grep turned into a gate, plus the two acceptance
 * scenarios whose text names the location (P1.3 sc.1, P1.11 sc.1), plus bug-257's one stale
 * `dna show --section team` in the vision's CLI table (`dl-082`: the section is a positional).
 *
 * The P1.11 scenario-1 behaviour itself is exercised in `test/memory/entry.test.ts`; P1.3 scenario 1's
 * in `test/core/memory-add.test.ts` (AC(a)).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

const repoRoot = join(__dirname, '..', '..');
const SCANNED = ['docs/01_vision', 'docs/02_requirements'];
const featureDir = join(repoRoot, 'docs', '02_requirements', '02_bdd', 'features', 'p1-memory');

/** Every regular file under `dir`, sorted, as repository-relative POSIX paths. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(relative(repoRoot, full).split('\\').join('/'));
  }
  return out;
}

/** The text of the scenario titled `title` in `feature`, up to the next `Scenario:` or the end. */
function scenario(feature: string, title: string): string {
  const start = feature.indexOf(`Scenario: ${title}`);
  if (start < 0) throw new Error(`no scenario "${title}"`);
  const next = feature.indexOf('Scenario:', start + 1);
  return feature.slice(start, next < 0 ? undefined : next);
}

describe('no vision or requirements passage places Memory documents in .wingfoil/memory/ (bug-256)', () => {
  it("bug-256's step-1 grep returns nothing", () => {
    // `grep -rn '\.wingfoil/memory' docs/01_vision docs/02_requirements | grep -v 'memory\.yaml\|memory/templates'`
    const hits: string[] = [];
    for (const dir of SCANNED) {
      for (const file of filesUnder(join(repoRoot, dir))) {
        readFileSync(join(repoRoot, file), 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (!line.includes('.wingfoil/memory')) return;
            if (line.includes('memory.yaml') || line.includes('memory/templates')) return;
            hits.push(`${file}:${index + 1}: ${line.trim()}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('P1.3 scenario 1 expects the file at the path the type declares (bug-256)', () => {
  const feature = (): string => readFileSync(join(featureDir, 'P1.3-memory-add.feature'), 'utf8');

  it('the Background declares the type path and scenario 1 expects the file in its directory', () => {
    const declared = /Memory type "decision" is defined in "\.wingfoil\/memory\.yaml".*path "([^"]+)"/.exec(
      feature(),
    )?.[1];
    expect(declared).toBe('docs/memory/decision/{id}.md');
    const expected = /a Memory file is created under "([^"]+)"/.exec(
      scenario(feature(), 'Add a new Memory document in draft state'),
    )?.[1];
    expect(expected).toBe(`${posix.dirname(declared as string)}/`);
  });
});

describe('P1.11 scenario 1 asserts the store the configuration declares (bug-256)', () => {
  const feature = (): string => readFileSync(join(featureDir, 'P1.11-memory-entries.feature'), 'utf8');

  it('names the declared paths and the templates, not a .wingfoil/memory/ directory', () => {
    const text = scenario(feature(), 'Memory store is ready after initialization');
    expect(text).toContain('".wingfoil/memory.yaml" declares a path inside the project root for every Memory type');
    expect(text).toContain('".wingfoil/memory/templates/" holds the template of every type that declares one');
    expect(text).toContain('both are tracked by git');
  });

  it('its narrative names the declared paths', () => {
    const narrative = feature().split('\n').slice(0, 3).join('\n');
    expect(narrative).toContain('at the path its type declares in .wingfoil/memory.yaml');
  });
});

describe("the vision's CLI table lists roles with dna show's positional section (bug-257)", () => {
  const cliCmds = (): string => readFileSync(join(repoRoot, 'docs', '01_vision', 'X_cli-cmds.md'), 'utf8');

  it('names no --section option', () => {
    expect(cliCmds()).not.toContain('--section');
  });

  it('the ROLE row says roles are listed via dna show team', () => {
    const row = cliCmds()
      .split('\n')
      .find((line) => line.startsWith('| `ROLE`'));
    expect(row).toBeDefined();
    expect(row).toContain('Listed via `dna show team`');
  });
});
