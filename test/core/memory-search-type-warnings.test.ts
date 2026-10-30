/**
 * task-314 (`bug-283`): `memory search --type <t>` warns only about the unreadable files type `t`'s
 * `path` pattern can produce (`spec-017` §1.4's token rule), and about a newer-format document only
 * when its readable `type:` is `t` (design gate D2 (a)); an undeclared type gets no warning (D3 (a)).
 * A search without `--type` keeps reporting every file it could not read.
 *
 * The fixture copies this repository's own `.wingfoil/memory.yaml` patterns for `release-line`,
 * `release`, `task`, `adr` and `bug`. The expected lines are the ones
 * `wingfoil memory search --type bug` printed over the same files, with `--format console` and with
 * `--format json` (task-314 red notes); today it prints all four lines for any `--type`.
 */
import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/rl-{release-line}/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
`;

const VALID_BUG = 'docs/04_memory/bugs/bug-001-valid.md';
const BROKEN_BUG = 'docs/04_memory/bugs/bug-002-broken.md';
const BROKEN_ADR = 'docs/04_memory/design/adrs/adr-001-broken.md';
const FUTURE_ADR = 'docs/04_memory/design/adrs/adr-002-future.md';
const BROKEN_RELEASE_LINE = 'docs/04_memory/planning/rl-v9-broken.md';

const unparsable = (file: string): string =>
  `W_MEMORY_UNREADABLE (${file}): unreadable frontmatter in ${file}: unexpected end of the stream within a flow collection (4:1)`;
const NEWER_FORMAT_ADR =
  `W_MEMORY_UNREADABLE (${FUTURE_ADR}): unreadable frontmatter in ${FUTURE_ADR}: E_INVALID_FORMAT: this file is written in format 99; this WingFoil reads up to format 1: upgrade WingFoil`;

function broken(id: string, type: string): string {
  return ['---', `id: ${id}`, `type: ${type}`, 'title: [unclosed', '---', '', 'Broken.', ''].join('\n');
}

type Result = { ok: boolean; value?: unknown; warnings?: readonly string[] };
type SearchValue = { matches: { id: string }[]; message?: string };

function op(name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered`);
  return operation.fn;
}

let root: string;

beforeAll(() => {
  root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, VALID_BUG, ['---', 'id: bug-001-valid', 'type: bug', 'title: "bug-001-valid"', 'status: open', '---', '', 'Body.', ''].join('\n'));
  writeFixtureFile(root, BROKEN_BUG, broken('bug-002-broken', 'bug'));
  writeFixtureFile(root, BROKEN_ADR, broken('adr-001-broken', 'adr'));
  writeFixtureFile(root, FUTURE_ADR, ['---', 'id: adr-002-future', 'type: adr', 'title: "adr-002-future"', 'status: accepted', 'format: 99', '---', '', 'Future.', ''].join('\n'));
  writeFixtureFile(root, BROKEN_RELEASE_LINE, broken('rl-v9-broken', 'release-line'));
  commitAll(root, 'seed task-314 memory search --type fixture');
});
afterAll(() => removeTempDir(root));

describe('memorySearch with a type warns only about files that type can hold (task-314 AC1, bug-283)', () => {
  it('(red-first) --type bug: the bug match, and the warning of the unreadable bug file only', async () => {
    const result = (await op('memorySearch')({ root, options: { type: 'bug' } })) as Result;
    expect(result.ok).toBe(true);
    expect((result.value as SearchValue).matches.map((match) => match.id)).toEqual(['bug-001-valid']);
    expect(result.warnings).toEqual([unparsable(BROKEN_BUG)]);
  });

  it('(red-first) --type adr: no match, and the two adr lines in path order', async () => {
    const result = (await op('memorySearch')({ root, options: { type: 'adr' } })) as Result;
    expect(result.ok).toBe(true);
    expect((result.value as SearchValue).message).toBe('no documents matched the query');
    expect(result.warnings).toEqual([unparsable(BROKEN_ADR), NEWER_FORMAT_ADR]);
  });

  it('(red-first) --type nosuch, an undeclared type: no warning (design gate D3 (a))', async () => {
    const result = (await op('memorySearch')({ root, options: { type: 'nosuch' } })) as Result;
    expect(result.ok).toBe(true);
    expect(result.warnings ?? []).toEqual([]);
  });

  it('(characterization) no --type: every unreadable file of the fixture, in path order', async () => {
    const result = (await op('memorySearch')({ root })) as Result;
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([unparsable(BROKEN_BUG), unparsable(BROKEN_ADR), NEWER_FORMAT_ADR, unparsable(BROKEN_RELEASE_LINE)]);
  });
});

describe('wingfoil memory search --type bug on the CLI (task-314 AC1)', () => {
  const stderrLines = (stderr: string): string[] => stderr.split('\n').filter((line) => line.length > 0);

  it('(red-first) --format console: exit 0, and one warning line on stderr, the unreadable bug file', () => {
    const run = runCliEntry(root, ['memory', 'search', '--type', 'bug', '--format', 'console']);
    expect(run.status).toBe(0);
    expect(stderrLines(run.stderr)).toEqual([`warning: ${unparsable(BROKEN_BUG)}`]);
    expect(run.stdout).toContain('"id": "bug-001-valid"');
  });

  it('(red-first) --format json: exit 0, and one JSON warning line on stderr, the unreadable bug file', () => {
    const run = runCliEntry(root, ['memory', 'search', '--type', 'bug', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(stderrLines(run.stderr)).toEqual([JSON.stringify({ warning: unparsable(BROKEN_BUG) })]);
    expect((JSON.parse(run.stdout) as SearchValue).matches.map((match) => match.id)).toEqual(['bug-001-valid']);
  });
});
