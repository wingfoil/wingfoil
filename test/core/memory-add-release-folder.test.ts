/**
 * task-164-file-new-release-under-folder-siblings-use (`bug-163`) — a `release` added with
 * `memory add` lands in the folder its sibling releases already use.
 *
 * `memory.yaml` resolves a release's `path` from its `release-line` field. That field holds the
 * release-line's **version** (`v1`, written by `initial-design`'s `seed-releases` as
 * `{release-line.version}`), while every release committed in this repository sits under the
 * release-line's **id** (`planning/rl-v1/`, `rl-{version}`). The two meet only if the path pattern
 * turns the version into the id. Both cases read this repository's own `memory.yaml` as committed at
 * `HEAD` — the one `memory add` reads (`resolveAddType`, `dl-080` (B)) — so they pin the
 * configuration WingFoil develops itself with, not a fixture that merely resembles it:
 *
 * - **AC 1** (red-first): `memory add --type release --set release-line=v1 …`, in a scratch repository
 *   carrying that `memory.yaml`, its `release` scaffold and one sibling release, writes under
 *   `planning/rl-v1/` and keeps `release-line: "v1"`.
 * - **AC 2** (the same rule over the committed documents): every release document committed at `HEAD`
 *   sits exactly where the committed `path` pattern puts it for its own `release-line` and `id`, so
 *   no existing release has to move for the fix.
 *
 * Determinism (REQ-SYS-07): fixed inputs, documents iterated in sorted order, no wall-clock read.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import type { CoreFn } from '../../src/core/registry';
import { splitFrontmatter } from '../../src/storage/frontmatter';
import { renderMemoryPath } from '../../src/storage/memory-path';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');

/** A file of this repository as committed at `HEAD`. */
const committed = (path: string): string => git(REPO_ROOT, ['show', `HEAD:${path}`]);

/** The committed `release` `path` pattern. */
function releasePathPattern(): string {
  const registry = loadMemoryYamlAtHead(REPO_ROOT);
  const pattern = registry?.types['release']?.path;
  if (pattern === undefined) throw new Error('fixture bug: no `release` type in the committed memory.yaml');
  return pattern;
}

/** The parsed frontmatter of a Markdown document. */
function frontmatterOf(content: string): Record<string, unknown> {
  const { frontmatter } = splitFrontmatter(content);
  return (load(frontmatter ?? '') ?? {}) as Record<string, unknown>;
}

function memoryAddFn(): CoreFn<unknown, { id: string; path: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
  if (!operation) throw new Error('fixture bug: "memoryAdd" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, { id: string; path: string }>;
}

/** A sibling release as this repository's own carry it: under the release-line's id, field = version. */
const SIBLING_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.1.md';
const SIBLING = `---
id: "minor-v0.1"
type: release
title: "sibling"
status: released
version: "v0.1"
release-line: "v1"
---
`;

describe('a new release is filed under the folder its siblings use (task-164, bug-163)', () => {
  describe('AC 1 — memory add --type release --set release-line=v1, with this repository\'s memory.yaml', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, '.wingfoil/memory.yaml', committed('.wingfoil/memory.yaml'));
      writeFixtureFile(repo, '.wingfoil/memory/templates/release.md', committed('.wingfoil/memory/templates/release.md'));
      writeFixtureFile(repo, SIBLING_PATH, SIBLING);
      commitAll(repo, 'seed: this repository\'s memory.yaml, the release scaffold, one sibling release');
    });

    afterEach(() => removeTempDir(repo));

    it('writes under planning/rl-v1/, beside the sibling, and keeps release-line: "v1"', async () => {
      const result = await memoryAddFn()({
        root: repo,
        options: { type: 'release', title: 'WingFoil v0.2.3', set: ['kind=patch', 'version=v0.2.3', 'release-line=v1'] },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('patch-v0.2.3');
      expect(result.value.path).toBe('docs/04_memory/planning/rl-v1/patch-v0.2.3.md');
      expect(dirname(result.value.path)).toBe(dirname(SIBLING_PATH));
      expect(existsSync(join(repo, 'docs/04_memory/planning/v1'))).toBe(false);

      const written = frontmatterOf(readFileSync(join(repo, result.value.path), 'utf-8'));
      expect(written['release-line']).toBe('v1');
      expect(written['release-line']).toBe(frontmatterOf(SIBLING)['release-line']);
    });
  });

  describe('AC 2 — the release documents committed at HEAD', () => {
    /** Every committed `type: release` document under the release path's literal folder, sorted. */
    function committedReleases(): { path: string; frontmatter: Record<string, unknown> }[] {
      const listing = git(REPO_ROOT, ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'docs/04_memory/planning/']);
      return listing
        .split('\n')
        .filter((path) => path.endsWith('.md'))
        .sort()
        .map((path) => ({ path, frontmatter: frontmatterOf(committed(path)) }))
        .filter(({ frontmatter }) => frontmatter['type'] === 'release');
    }

    it('there are releases to check', () => {
      expect(committedReleases().length).toBeGreaterThan(0);
    });

    it('each sits where the committed path pattern puts it for its own release-line and id', () => {
      const pattern = releasePathPattern();
      const misplaced = committedReleases()
        .map(({ path, frontmatter }) => ({
          path,
          resolved: renderMemoryPath(pattern, {
            'release-line': String(frontmatter['release-line']),
            id: String(frontmatter['id']),
          }),
        }))
        .filter(({ path, resolved }) => path !== resolved);
      expect(misplaced).toEqual([]);
    });
  });
});
