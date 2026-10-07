/**
 * task-268 (`bug-291`) — the Memory `git log` readers on signed commits.
 *
 * With `log.showSignature=true` git prints the signature status on stdout before each commit's
 * formatted output. `walkGitLogFields` read it into the first field of the record (`%H`), the
 * `--follow --diff-filter=C` creation probe returned it as the creation commit, and the path probe
 * skipped it — so `memory history` failed on any element with a signed commit.
 *
 * - AC 1: each reader returns the same answer with the option on as with it off (every reader passes
 *   `--no-show-signature`).
 * - AC 2: a commit name that is not a full sha — what a `git` ignoring the flag prints — is refused
 *   with `E_GIT_READ_FAILED` (`IO` at the CLI), never used.
 *
 * The git configuration is isolated (`isolateGitConfig`): no global or system configuration of the
 * developer is read or written.
 */
import { auditAttribution } from '../../src/memory/audit';
import { walkGitLogFields } from '../../src/memory/git-log';
import { collectHistoricalPaths, findElementCreationSha, getMemoryHistory } from '../../src/memory/history';
import { E_GIT_READ_FAILED, StorageError } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { enableSigning, installSignatureForcingGit, isolateGitConfig, setShowSignature } from '../storage/helpers/signed-commits';

const TEMPLATE = '.wingfoil/memory/templates/bug.md';
const ELEMENT = 'docs/bugs/bug-1.md';
const BODY = `---\nid: ""\ntype: bug\ntitle: ""\nstatus: draft\n---\n\n## Summary\n\n<!-- what happened -->\n\n## Steps\n\n<!-- how -->\n`;

/** A template, an element copied from it (a `C` edge for `--follow`), a status change and a rename. */
function seed(repo: string): void {
  writeFixtureFile(repo, TEMPLATE, BODY);
  commitAll(repo, 'scaffold');
  writeFixtureFile(repo, 'docs/old/bug-1.md', BODY.replace('id: ""', 'id: "bug-1"'));
  commitAll(repo, 'wf(bug): add bug-1');
  git(repo, ['mv', 'docs/old/bug-1.md', ELEMENT]);
  git(repo, ['commit', '-q', '-m', 'move bug-1']);
  writeFixtureFile(repo, ELEMENT, BODY.replace('id: ""', 'id: "bug-1"').replace('status: draft', 'status: open'));
  commitAll(repo, 'wf(bug): submit bug-1');
}

/** Each reader's answer, in one value so the two settings compare at once. */
function answers(repo: string): unknown {
  return {
    walk: walkGitLogFields(repo, ['%H', '%s'], [ELEMENT], ['--follow']),
    history: getMemoryHistory(repo, ELEMENT),
    creation: findElementCreationSha(repo, ELEMENT),
    paths: [...collectHistoricalPaths(repo, ELEMENT)],
    audit: auditAttribution(repo, [ELEMENT, TEMPLATE]),
  };
}

function thrownBy(read: () => unknown): StorageError {
  try {
    read();
  } catch (error) {
    if (error instanceof StorageError) return error;
    throw error;
  }
  throw new Error('expected a StorageError, the read returned');
}

describe('task-268 — Memory git log readers on signed commits (bug-291)', () => {
  let restore: () => void = () => undefined;
  let repo = '';

  beforeAll(() => {
    restore = isolateGitConfig();
    repo = makeTempGitRepo();
    enableSigning(repo);
    seed(repo);
  });

  afterAll(() => {
    removeTempDir(repo);
    restore();
  });

  it('AC 1: every reader gives the same answer with log.showSignature on as with it off', () => {
    setShowSignature(repo, false);
    const off = answers(repo);
    setShowSignature(repo, true);
    expect(answers(repo)).toEqual(off);
    // The fixture exercises what it claims: a copy edge, a rename and three element commits.
    const history = getMemoryHistory(repo, ELEMENT);
    expect(history.map((entry) => entry.subject)).toEqual(['wf(bug): add bug-1', 'move bug-1', 'wf(bug): submit bug-1']);
    expect(history.map((entry) => entry.path)).toEqual(['docs/old/bug-1.md', ELEMENT, ELEMENT]);
  });

  describe('AC 2: a git that prints signature text despite --no-show-signature', () => {
    let uninstall: () => void = () => undefined;
    beforeAll(() => {
      setShowSignature(repo, true);
      uninstall = installSignatureForcingGit();
    });
    afterAll(() => uninstall());

    it.each([
      ['walkGitLogFields', (root: string) => walkGitLogFields(root, ['%H', '%s'], [ELEMENT], ['--follow'])],
      ['walkGitLogFields (one field)', (root: string) => walkGitLogFields(root, ['%H'], [ELEMENT])],
      ['findElementCreationSha', (root: string) => findElementCreationSha(root, ELEMENT)],
      ['collectHistoricalPaths', (root: string) => collectHistoricalPaths(root, ELEMENT)],
      ['getMemoryHistory', (root: string) => getMemoryHistory(root, ELEMENT)],
      ['auditAttribution', (root: string) => auditAttribution(root, [ELEMENT])],
    ])('%s refuses a commit name that is not a full sha', (_name, read) => {
      const error = thrownBy(() => read(repo));
      expect(error.code).toBe(E_GIT_READ_FAILED);
      expect(error.message).toMatch(/printed "No signature.*" where a commit name was expected/);
    });
  });
});
