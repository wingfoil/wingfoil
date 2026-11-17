/**
 * task-354 D2 (b) (`bug-317`; `spec-012` §2 `ContextRequest.label`) — the MCP session context names the revision its
 * client asked for in a warning, not the sha that revision resolved to: `buildSessionContext` passes its `state` as
 * the context's `label`. A characterization test written at the review-fix round (the behaviour landed with green
 * `342b0a06a`).
 *
 * The fixture is the `agent execute` fixture (`test/agent/helpers/agent-execute-fixture.ts`) with the unknown
 * top-level key `mystery: 1` appended to the committed `dna.yaml`.
 */
import { buildSessionContext } from '../../src/mcp/prompt';
import { withWarningSink } from '../../src/validation/warning';
import { DNA_YAML, seed, TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

describe('task-354 D2 (b) — buildSessionContext labels its warnings with the state it was given (bug-317)', () => {
  let repo: string;
  let sha: string;

  beforeAll(() => {
    repo = seed((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', `${DNA_YAML}mystery: 1\n`));
    sha = git(repo, ['rev-parse', 'HEAD']).trim();
  });

  afterAll(() => removeTempDir(repo));

  /** The unknown-field warnings about dna.yaml, raised through the sink or returned with the context. */
  function dnaWarnings(state: string): string[] {
    const raised: string[] = [];
    const { warnings } = withWarningSink(
      (text) => raised.push(text),
      () => buildSessionContext(repo, 'developer', { type: 'task', id: TASK_ID }, state),
    );
    return [...raised, ...warnings].filter((text) => text.includes('.wingfoil/dna.yaml'));
  }

  it('state HEAD → the warning names HEAD:.wingfoil/dna.yaml, not the sha', () => {
    const warnings = dnaWarnings('HEAD');
    expect(warnings).toContain('HEAD:.wingfoil/dna.yaml: unknown field(s) ignored: mystery');
    expect(warnings.filter((text) => text.includes(sha))).toEqual([]);
  });

  it('state <sha> → the warning names <sha>:.wingfoil/dna.yaml, the revision as given', () => {
    expect(dnaWarnings(sha)).toContain(`${sha}:.wingfoil/dna.yaml: unknown field(s) ignored: mystery`);
  });
});
