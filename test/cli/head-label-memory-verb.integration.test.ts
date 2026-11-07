/**
 * task-354 D2 (b) (`bug-317`; `spec-008` §6, the unknown-field row as amended by task-354) — a Memory verb resolves
 * `HEAD` itself (`prepareMemoryTransition`), so its read of `memory.yaml` labels the file `HEAD:`, never the 40-hex
 * sha. A characterization test written at the review-fix round (the behaviour landed with green `342b0a06a`), in its
 * own file because `test/cli/head-label.integration.test.ts` is the red commit's and stays as it is.
 *
 * The fixture is the `agent execute` fixture (`test/agent/helpers/agent-execute-fixture.ts`) with the unknown
 * top-level key `mystery: 1` appended to the committed `memory.yaml`; `memory submit` names an id no document holds.
 */
import { MEMORY_YAML, seed } from '../agent/helpers/agent-execute-fixture';
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const WARNING = 'warning: HEAD:.wingfoil/memory.yaml: unknown field(s) ignored: mystery\n';

describe('task-354 D2 (b) — a Memory verb labels memory.yaml HEAD: in the unknown-field warning (bug-317)', () => {
  let repo: string;

  beforeAll(() => {
    repo = seed((root) => writeFixtureFile(root, '.wingfoil/memory.yaml', `${MEMORY_YAML}mystery: 1\n`));
  });

  afterAll(() => removeTempDir(repo));

  it('memory submit on an id no document holds warns about HEAD:.wingfoil/memory.yaml, with no sha label', () => {
    const run = spawnCapture(process.execPath, [CLI_ENTRY, 'memory', 'submit', 'task-999-missing'], { cwd: repo, timeout: 60_000 });
    // Observed by hand on this fixture with the compiled CLI: these two stderr lines, exit 1.
    expect(run.stderr).toBe(`${WARNING}error: document not found: task-999-missing\n`);
    expect(run.stderr).not.toMatch(/[0-9a-f]{40}:/);
    expect(run.status).toBe(1);
  });
});
