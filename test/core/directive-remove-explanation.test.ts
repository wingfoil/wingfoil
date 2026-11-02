/**
 * task-311 (bug-108, dl-080 (B)) — the developer's pins of the two `directive remove` explanations its
 * independent review asked for (2026-10-29). Both are working-tree files no commit can turn into a directive
 * by the plain "commit it first" the W-uncommitted sentence advises, so each gets a sentence of its own:
 *
 * - an UNTRACKED directive file that is itself a symbolic link (an in-root target): once committed, `HEAD`
 *   records the link and skips it (design gate D1 (a)), so committing it would not resolve it;
 * - a directive file git IGNORES: `git status` reports nothing for it and a plain `git add` refuses it.
 *
 * Either way the refusal is still decided at `HEAD` (`NOT_FOUND`, exit 1), and nothing is written.
 * Every write lands in a throwaway temp git repo. Deterministic (REQ-SYS-07): fixed fixtures, no clock.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { renderCustomDirective } from '../../src/directives/create';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const CUSTOM_DIR = '.wingfoil/directives/custom';

async function remove(repo: string, name: string): Promise<CoreResult<unknown>> {
  const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveRemove;
  if (!operation) throw new Error('fixture bug: "directiveRemove" operation not registered on the directive module');
  return (await operation.fn({ root: repo, positional: name })) as CoreResult<unknown>;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

describe('directive remove explains a working-tree directive no plain commit can resolve (task-311 review)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = initWingfoilProject(repo, 'Scrum');
    if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  });

  afterEach(() => removeTempDir(repo));

  it('an UNTRACKED symlinked directive file (in-root target) is unknown, and the message does not advise committing it', async () => {
    writeFixtureFile(repo, 'notes/lnk.md', renderCustomDirective('lnk'));
    commitAll(repo, 'fixture: a directive text outside the directives tree');
    const link = join(repo, CUSTOM_DIR, 'lnk.md');
    symlinkSync('../../../notes/lnk.md', link);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await remove(repo, 'lnk');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe(
      `unknown directive: lnk — the working tree's '${CUSTOM_DIR}/lnk.md' defines it, but that path is a symbolic ` +
        'link, which a commit records as a link and not as a directive, so the directive cannot be resolved from ' +
        'the committed repository (dl-080)',
    );
    expect(result.error.message).not.toContain('first, then retry');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('an IGNORED directive file is unknown, and the message says git ignores it rather than advising a commit', async () => {
    const ignored = `${CUSTOM_DIR}/ign.md`;
    writeFileSync(join(repo, '.gitignore'), `${ignored}\n`, 'utf-8');
    commitAll(repo, 'fixture: ignore one directive path');
    writeFixtureFile(repo, ignored, renderCustomDirective('ign'));
    // The fixture's premise, from git itself: the path is ignored and `git status` reports nothing for it.
    expect(execFileSync('git', ['-C', repo, 'check-ignore', ignored], { encoding: 'utf-8' }).trim()).toBe(ignored);
    expect(execFileSync('git', ['-C', repo, 'status', '--porcelain', '--', ignored], { encoding: 'utf-8' })).toBe('');
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await remove(repo, 'ign');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe(
      `unknown directive: ign — the working tree's '${ignored}' defines it, but git ignores that path (git status ` +
        'reports nothing for it), so no commit of this repository records it and a plain git add would not stage ' +
        'it (dl-080)',
    );
    expect(result.error.message).not.toContain('first, then retry');
    expect(existsSync(join(repo, ignored))).toBe(true);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });
});
