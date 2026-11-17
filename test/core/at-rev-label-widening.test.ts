/**
 * task-354 (`bug-317`), the widened scope: the two readers at a revision outside `src/core/loaders.ts` that name a
 * file `<rev>:<path>` in an error — `loadMemoryDocumentSummaryAtRev` (`src/memory/query.ts`) and `listAdaptersAtRev`
 * (`src/agent/discovery.ts`) — take the same optional `label` as the loaders, the revision as passed by default.
 */
import { listAdaptersAtRev } from '../../src/agent';
import { loadMemoryDocumentSummaryAtRev } from '../../src/memory/query';
import { ValidationError } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DOC = 'docs/04_memory/v0.1/task-1-a.md';
const BUILT_IN = '.wingfoil/agents/built-in/fake.yaml';
const CUSTOM = '.wingfoil/agents/custom/fake.yaml';

/** The message of what `read` throws; fails the test when it throws nothing. */
function thrownMessage(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).message;
  }
  throw new Error('expected a ValidationError, nothing was thrown');
}

describe('readers at a revision outside the loaders take a label (task-354, bug-317)', () => {
  let repo: string;
  let sha: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    // A Memory document whose frontmatter does not parse, and one adapter name in both directories.
    writeFixtureFile(repo, DOC, '---\nid: [task-1-a\n---\n\nbody\n');
    writeFixtureFile(repo, BUILT_IN, 'name: fake\n');
    writeFixtureFile(repo, CUSTOM, 'name: fake\n');
    commitAll(repo, 'fixture');
    sha = git(repo, ['rev-parse', 'HEAD']).trim();
  });

  afterAll(() => removeTempDir(repo));

  it('loadMemoryDocumentSummaryAtRev names the file with the label the caller passes', () => {
    const message = thrownMessage(() => loadMemoryDocumentSummaryAtRev(repo, sha, DOC, 'HEAD'));
    expect(message).toContain(`HEAD:${DOC}`);
    expect(message).not.toContain(sha);
  });

  it('loadMemoryDocumentSummaryAtRev without a label names the revision as passed', () => {
    expect(thrownMessage(() => loadMemoryDocumentSummaryAtRev(repo, sha, DOC))).toContain(`${sha}:${DOC}`);
  });

  it('listAdaptersAtRev names the adapter directory with the label the caller passes', () => {
    const message = thrownMessage(() => listAdaptersAtRev(repo, sha, 'HEAD'));
    expect(message).toContain('HEAD:.wingfoil/agents');
    expect(message).not.toContain(sha);
  });

  it('listAdaptersAtRev without a label names the revision as passed', () => {
    expect(thrownMessage(() => listAdaptersAtRev(repo, sha))).toContain(`${sha}:.wingfoil/agents`);
  });
});
