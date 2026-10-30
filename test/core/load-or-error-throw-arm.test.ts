/**
 * task-309 (`bug-251`) — characterization of `loadOrError`'s throw arm (`src/core/index.ts`): a loader
 * failure that is no expected domain failure — here an `Error` carrying no errno `code` at all, the shape
 * of a programmer error — is re-thrown, never turned into a `CoreResult` (spec-006 §2: only expected
 * domain failures become one).
 *
 * Until task-309 the arm was reached by a `dna.yaml` that is a directory (`EISDIR`); bug-251's fix makes
 * that an `IO` refusal (`core-index-arms.test.ts`), so the trigger moves here: `readDocument` is steered to
 * throw for `dna.yaml` only, every other storage call keeps its real behaviour. Passes before and after
 * the fix.
 */
import { CORE_MODULES, initWingfoilProject } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

/** Armed only around the operation under test, so the scaffold reads and writes for real. */
let mockArmed = false;

jest.mock('../../src/storage', () => {
  const actual = jest.requireActual<typeof import('../../src/storage')>('../../src/storage');
  return {
    ...actual,
    readDocument: (absolutePath: string): string => {
      if (mockArmed && absolutePath.endsWith('dna.yaml')) throw new Error('boom');
      return actual.readDocument(absolutePath);
    },
  };
});

function op(module: string, name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((candidate) => candidate.name === module)?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${module}.${name}" is not registered`);
  return operation.fn;
}

describe('loadOrError: a loader failure that is not an expected domain failure propagates as a throw', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });
  afterEach(() => {
    mockArmed = false;
    removeTempDir(repo);
  });

  it('an Error with no errno code from the dna.yaml read is re-thrown by `dna show`', async () => {
    mockArmed = true;

    await expect(op('dna', 'dnaShow')({ root: repo })).rejects.toThrow('boom');
  });
});
