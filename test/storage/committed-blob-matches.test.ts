/**
 * `committedBlobMatches` (task-193 review): whether written text is what a commit holds at a path, as
 * git stores it — through `core.autocrlf` and `.gitattributes` — rather than byte for byte against
 * `git show`. Real throwaway repositories; deterministic fixture text.
 */
import { committedBlobMatches } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';

const CRLF = 'a: 1\r\nb: 2\r\n';

describe('committedBlobMatches', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  function seed(autocrlf: string): string {
    repo = makeTempGitRepo();
    git(repo, ['config', 'core.autocrlf', autocrlf]);
    writeFixtureFile(repo, 'f.yaml', CRLF);
    commitAll(repo, 'seed');
    return git(repo, ['rev-parse', 'HEAD']).trim();
  }

  it('core.autocrlf=true: the CRLF text matches the LF blob git stored, though `git show` differs byte for byte', () => {
    const sha = seed('true');
    expect(git(repo, ['show', `${sha}:f.yaml`])).toBe('a: 1\nb: 2\n');
    expect(committedBlobMatches(repo, sha, 'f.yaml', CRLF)).toBe(true);
  });

  it('core.autocrlf=false: the CRLF text matches its own CRLF blob', () => {
    const sha = seed('false');
    expect(committedBlobMatches(repo, sha, 'f.yaml', CRLF)).toBe(true);
  });

  it('a different text does not match, whatever the filters', () => {
    const sha = seed('true');
    expect(committedBlobMatches(repo, sha, 'f.yaml', 'a: 1\r\nb: 3\r\n')).toBe(false);
  });

  it('a path the revision does not hold does not match', () => {
    const sha = seed('false');
    expect(committedBlobMatches(repo, sha, 'absent.yaml', CRLF)).toBe(false);
  });
});
