/**
 * task-311 (bug-108, dl-080 (B)) — the developer's unit pins of `loadDirectiveInventoryAtHead`
 * (`src/core/loaders.ts`), the HEAD inventory `directive remove` resolves the directive it deletes from,
 * and of the symbolic-link skip it shares with the directive read at a commit (design gate D1 (a), D6 (a)).
 *
 * - A repository with no commit answers the empty inventory, never an error (`atHeadOr`).
 * - A `.md` entry `HEAD` records as a symbolic link is skipped, listed in `symlinks` (sorted) and named in
 *   `warnings`; a regular committed directive beside it is read.
 * - The working tree is never read: an uncommitted directive file is absent from the answer.
 * - `loadDirectivesAtCommit` skips the same entry, so the read at a commit never parses a link's text.
 *
 * Every write lands in a throwaway temp git repo. Deterministic (REQ-SYS-07): fixed fixtures, no clock.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadDirectiveInventoryAtHead, loadDirectivesAtCommit } from '../../src/core/loaders';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const directiveMd = (id: string): string =>
  `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n`;

const skipWarning = (path: string): string =>
  `directive entry '${path}' skipped at HEAD: it is a symbolic link, whose target no commit records`;

describe('loadDirectiveInventoryAtHead (task-311)', () => {
  let repo: string;
  let outside: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  it('answers the empty inventory in a repository with no commit', () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/keeper.md', directiveMd('keeper'));

    expect(loadDirectiveInventoryAtHead(repo)).toEqual({ files: [], warnings: [], symlinks: [] });
  });

  it('skips every .md entry HEAD records as a symbolic link, sorted, and reads the regular files beside them', () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/keeper.md', directiveMd('keeper'));
    writeFixtureFile(outside, 'target.md', directiveMd('linked'));
    symlinkSync(join(outside, 'target.md'), join(repo, '.wingfoil/directives/custom/zeta.md'));
    symlinkSync(join(outside, 'target.md'), join(repo, '.wingfoil/directives/custom/alpha.md'));
    commitAll(repo, 'fixture: a directive and two symlinked directive files');

    const inventory = loadDirectiveInventoryAtHead(repo);

    expect(inventory.files.map((file) => file.frontmatter.id)).toEqual(['keeper']);
    expect(inventory.symlinks).toEqual(['.wingfoil/directives/custom/alpha.md', '.wingfoil/directives/custom/zeta.md']);
    expect(inventory.warnings).toEqual([
      skipWarning('.wingfoil/directives/custom/alpha.md'),
      skipWarning('.wingfoil/directives/custom/zeta.md'),
    ]);

    const sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
    expect(loadDirectivesAtCommit(repo, sha).map((file) => file.frontmatter.id)).toEqual(['keeper']);
  });

  it('never reads the working tree: an uncommitted directive file is not in the answer', () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/keeper.md', directiveMd('keeper'));
    commitAll(repo, 'fixture: one committed directive');
    writeFixtureFile(repo, '.wingfoil/directives/custom/ghost.md', directiveMd('ghost'));

    const inventory = loadDirectiveInventoryAtHead(repo);

    expect(inventory.files.map((file) => file.frontmatter.id)).toEqual(['keeper']);
    expect(inventory.warnings).toEqual([]);
    expect(inventory.symlinks).toEqual([]);
  });
});
