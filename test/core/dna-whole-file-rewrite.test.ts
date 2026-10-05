/**
 * task-193 (`bug-019`, `bug-126`; approver ruling R20/Q9 of `release-planning-rel-v0.3-plan`, "as
 * `dl-062`") — a DNA write the in-place editor cannot express is REFUSED unless `--force` authorizes
 * the whole-file rewrite, and a forced rewrite carries a warning that comments were not kept, through
 * task-169's success-warning channel (`CoreResult.warnings`).
 *
 * Exercises the REAL, registered `CORE_MODULES` `dna` operations (the `CoreFn`s behind
 * `wingfoil dna set|add|update|remove`) in throwaway git repositories. The end-to-end half (exit codes,
 * stderr, `--format json`) is `test/cli/dna-force.integration.test.ts`.
 *
 * Deterministic (REQ-SYS-07): fixed fixture text, fixed requests.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DNA_PATH = '.wingfoil/dna.yaml';

/**
 * A valid `dna.yaml` whose `paths` is a non-empty FLOW mapping: the in-place editor cannot add a block
 * line under it, so `dna add paths.tests` has no minimal edit — the one shape still left to the
 * whole-file rewrite. It carries comments, so the refusal visibly protects something.
 */
const FLOW_PATHS = `# Project DNA — a comment the rewrite would lose
version: 1
modules: []   # [AUTHORING] none yet
stacks: {}
team:
  members: []
  roles:
    - name: developer
paths: { sources: [src/] }
`;

/** WingFoil's own comment-rich `dna.yaml` (read only): its `project.north_star` is a `>-` block scalar. */
const REAL_DNA = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'dna.yaml'), 'utf-8');

const CONFLICT = 'dna.yaml cannot be updated in place; edit paths.tests by hand, or pass --force to rewrite the whole file';
const WARNING =
  'dna.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, ' +
  'blank lines, line endings or number formatting (1.0 becomes 1)';

type DnaVerb = 'dnaSet' | 'dnaAdd' | 'dnaUpdate' | 'dnaRemove';

function op(name: DnaVerb): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'dna')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered on the dna module`);
  return operation.fn;
}

function head(repo: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim();
}

function dnaText(repo: string): string {
  return readFileSync(join(repo, DNA_PATH), 'utf-8');
}

function commentLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trimStart().startsWith('#'));
}

/** The `warnings` of a success, `[]` when it carries none. */
function warningsOf(result: CoreResult<unknown>): readonly string[] {
  return result.ok ? (result.warnings ?? []) : [];
}

describe('dna verbs — the whole-file rewrite is refused unless --force (task-193, R20/Q9)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  describe('on a file the in-place editor cannot edit', () => {
    beforeEach(() => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, DNA_PATH, FLOW_PATHS);
      commitAll(repo, 'seed a flow-mapping dna.yaml');
    });

    it('without --force: CONFLICT (exit 1), the file and HEAD unchanged, no commit', async () => {
      const before = head(repo);
      const result = await op('dnaAdd')({ root: repo, positionals: ['paths.tests'], options: { value: 'test/' } });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'CONFLICT', message: CONFLICT });
      expect(exitCodeForResult(result)).toBe(1);
      expect(dnaText(repo)).toBe(FLOW_PATHS);
      expect(head(repo)).toBe(before);
    });

    it('with --force: the whole file is rewritten and committed, and the success carries the warning', async () => {
      const before = head(repo);
      const result = await op('dnaAdd')({ root: repo, positionals: ['paths.tests'], options: { value: 'test/' }, force: true });

      expect(result.ok).toBe(true);
      expect(warningsOf(result)).toEqual([WARNING]);
      expect(result.ok && result.commit?.message).toBe('wf(dna): add paths.tests test/');
      expect(head(repo)).not.toBe(before);
      const written = dnaText(repo);
      expect(commentLines(written)).toEqual([]);
      expect((load(written) as { paths: unknown }).paths).toEqual({ sources: ['src/'], tests: ['test/'] });
    });

    it('a mutation the schema refuses is still VALIDATION, not CONFLICT: --force would not help it', async () => {
      // `paths.runs` holds exactly one entry (spec-002), and it sits under the same flow mapping.
      const result = await op('dnaUpdate')({ root: repo, positionals: ['paths.runs'], options: { value: 'a/,b/' } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
      expect(dnaText(repo)).toBe(FLOW_PATHS);
    });
  });

  describe('--force authorizes the rewrite, it does not force one', () => {
    beforeEach(() => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, DNA_PATH, REAL_DNA);
      commitAll(repo, "seed WingFoil's own dna.yaml");
    });

    it.each<[DnaVerb, string[], Record<string, string>]>([
      ['dnaSet', ['project.name'], { value: 'Renamed' }],
      ['dnaAdd', ['paths.sources'], { value: 'lib/' }],
      ['dnaUpdate', ['modules.core'], { 'entry-description': 'Changed.' }],
      ['dnaRemove', ['paths.sources'], { value: 'src/' }],
    ])('%s %s with --force on an editable file: in place, every comment kept, no warning', async (verb, positionals, options) => {
      const result = await op(verb)({ root: repo, positionals, options, force: true });
      expect(result.ok).toBe(true);
      expect(warningsOf(result)).toEqual([]);
      expect(commentLines(dnaText(repo))).toEqual(commentLines(REAL_DNA));
    });

    it('bug-019: `dna set project.north_star` (a `>-` block scalar) keeps every comment, with no --force', async () => {
      const result = await op('dnaSet')({ root: repo, positionals: ['project.north_star'], options: { value: 'short' } });
      expect(result.ok).toBe(true);
      expect(warningsOf(result)).toEqual([]);
      expect(commentLines(dnaText(repo))).toEqual(commentLines(REAL_DNA));
      expect((load(dnaText(repo)) as { project: { north_star: string } }).project.north_star).toBe('short');
    });
  });

  it('every mutating dna verb declares the --force flag (spec-008 §12)', () => {
    const operations = CORE_MODULES.find((module) => module.name === 'dna')!.operations;
    for (const verb of ['dnaSet', 'dnaAdd', 'dnaUpdate', 'dnaRemove'] as const) {
      expect(operations[verb]!.flags?.map((flag) => flag.name)).toEqual(['force']);
    }
    expect(operations.dnaShow!.flags).toBeUndefined();
  });
});
