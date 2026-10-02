/**
 * task-110-memory-add-keeps-version-dots-and-sources-every-id-token — `memory add --set
 * <name>=<value>` (`spec-008-cli-grammar` §10, `dl-107` S2) through the REAL compiled `dist/cli.js`,
 * in a throwaway git repository whose committed `memory.yaml` carries this repository's own `release`
 * type (`{kind}-{version}` under a `{release-line}` folder).
 *
 * Pins what only the process boundary shows: that Commander collects the REPEATED option into every
 * occurrence (not just the last), that `--help` advertises it, and the exit codes of §10's error
 * table. Spawned through `./helpers/spawn-cli` (bug-197), whose `spawnSync` means stderr is captured on a 0-exit run too (see
 * `memory-add-type-baseline.integration.test.ts`). `dist/` is built once by jest's `globalSetup`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1
types:
  release:
    path: "docs/memory/planning/{release-line}/{id}.md"
    id_pattern: "{kind}-{version}"
    template:
      file: "memory/templates/release.md"
      frontmatter:
        required: [id, type, title, status]
`;

const RELEASE_TEMPLATE = `---
id: "{auto}"
type: release
title: ""
status: draft
kind: ""               # REQUIRED — "minor" or "patch"
version: ""            # REQUIRED — e.g. "v0.1"
release-line: ""       # REQUIRED
tmpl_version: 260929
---

## Scope
`;

function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

describe('wingfoil memory add --set (task-110, spec-008 §10)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/release.md', RELEASE_TEMPLATE);
    commitAll(repo, 'seed');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('collects every repeated --set and produces patch-v0.2.3 with its fields written (exit 0)', () => {
    const run = wingfoil(
      repo,
      'memory', 'add', '--type', 'release', '--title', 'WingFoil v0.2.3',
      '--set', 'kind=patch', '--set', 'version=v0.2.3', '--set', 'release-line=v1',
      '--format', 'json',
    );
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ id: 'patch-v0.2.3', path: 'docs/memory/planning/v1/patch-v0.2.3.md' });
    const content = readFileSync(join(repo, 'docs/memory/planning/v1/patch-v0.2.3.md'), 'utf-8');
    // Each filled line keeps the template's inline comment (task-163, `bug-033`).
    expect(content).toMatch(/^kind: "patch" +# REQUIRED/m);
    expect(content).toMatch(/^version: "v0.2.3" +# REQUIRED/m);
    expect(content).toMatch(/^release-line: "v1" +# REQUIRED/m);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(release): add patch-v0.2.3');
  });

  it('a malformed --set is a usage error: exit 2, one error line, nothing committed', () => {
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const run = wingfoil(repo, 'memory', 'add', '--type', 'release', '--title', 'X', '--set', 'version');
    expect(run.status).toBe(2);
    expect(run.stderr).toBe('error: invalid flag value: --set expects <name>=<value>, got "version"\n');
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });

  it('a missing token is exit 1 and names the option that supplies it', () => {
    const run = wingfoil(repo, 'memory', 'add', '--type', 'release', '--title', 'X', '--set', 'kind=patch', '--set', 'release-line=v1');
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('error: missing value for token {version}: give it with --set version=<value>\n');
  });

  it('--help advertises the repeatable option', () => {
    const run = wingfoil(repo, 'memory', 'add', '--help');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/--set <name=value>/);
    expect(run.stdout).toMatch(/repeatable/);
  });
});
