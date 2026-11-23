/**
 * task-380 AC 3 (`bug-471`, design gate D4 (a)) — the `paths` operation's category argument names the categories of
 * the `dna.yaml` `paths:` schema and says that a category declared there by hand is answered too (task-312), so
 * `paths --help` no longer reads as a closed list. The list is the schema's keys, joined `a, b, …, f or g`: the test
 * reads them from `Paths.shape`, so an eighth category reaches the help without an edit, and it also pins the seven
 * names `spec-002` and today's help name (`node dist/cli.js paths --help` → `sources, tests, docs, config, governance,
 * runs or health (omit it for the whole map)`), so a vacuous schema read cannot pass.
 *
 * The parse of the description below is `test/docs/x-cli-cmds.test.ts`'s (`replace(/\s*\(.*\)\s*$/, '')`, split on
 * `,\s*|\s+or\s+`): the added text sits inside the parenthetical that parse strips.
 *
 * Unasserted here (T1): what the compiled CLI prints (`test/cli/help-command-path.integration.test.ts`).
 */
import { CORE_MODULES } from '../../src/core';
import { Paths } from '../../src/dna/schema';

const SEVEN = ['sources', 'tests', 'docs', 'config', 'governance', 'runs', 'health'];

/** `a, b, …, f or g`. */
function joinCategories(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

function pathsDescription(): string | undefined {
  const module = CORE_MODULES.find((candidate) => candidate.name === 'paths');
  return module?.operations.paths?.positional?.description;
}

describe('task-380 AC 3 — the paths category argument (bug-471, D4 (a))', () => {
  it('the schema declares the seven categories (guard against a vacuous read)', () => {
    expect(Object.keys(Paths.shape)).toEqual(SEVEN);
  });

  it('names the schema\'s categories and says that a category declared in dna.yaml paths: is answered too', () => {
    const names = joinCategories(Object.keys(Paths.shape));
    expect(pathsDescription()).toBe(
      `${names} (a category of your own, declared in dna.yaml paths:, is answered too; omit it for the whole map)`,
    );
  });

  it('the list x-cli-cmds reads from the description is exactly the seven categories', () => {
    const description = (pathsDescription() ?? '').replace(/\s*\(.*\)\s*$/, '');
    expect(description.split(/,\s*|\s+or\s+/).filter((word) => word !== '')).toEqual(SEVEN);
  });
});
