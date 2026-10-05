/**
 * The pillar loaders at an arbitrary revision (task-137, spec-012 §2 `stateRef`, spec-016 §3.3 step 7,
 * spec-017 §1.1). Each `…AtRev(root, rev)` reads the configuration exactly as commit `rev` holds it:
 * a later commit and a dirty working tree are both invisible. An unknown or malformed `rev` is a
 * `RevisionError` — a `CoreError` naming the rev — never an empty answer, because an empty answer would
 * hand an agent a wrong context.
 */
import {
  loadDirectivesAtRev,
  loadDnaYamlAtRev,
  loadMemoryYamlAtRev,
  loadRolesYamlAtRev,
  loadWorkflowsYaml,
  loadWorkflowsYamlAtRev,
} from '../../src/core/loaders';
import { RevisionError, resolveRevision } from '../../src/core/revision';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import * as core from '../../src/core';
import * as memory from '../../src/memory';
import * as storage from '../../src/storage';
import { DiagnosticsError } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const memoryYaml = (firstState: string): string => `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    states:
      sequence: [ ${firstState}, pending, done ]
`;

const dnaYaml = (moduleName: string): string => `
version: 1.1
modules:
  - name: ${moduleName}
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const workflowsYaml = (file: string): string => `
version: 1.0
include:
  - workflows/custom/${file}
`;

const workflowYaml = (name: string): string => `
name: ${name}
kind: main
version: 1.0
phases:
  - name: only-phase
    role: developer
    actions:
      - agent.execute
`;

const directiveMd = (id: string): string => `---
id: ${id}
name: "${id}"
type: directive
kind: custom
title: "${id}"
tags: [ custom ]
ref: []
---

# Directive — ${id}
`;

const rolesYaml = (directive: string): string => `
version: 1.0
assignments:
  developer:
    - ${directive}
global: []
`;

describe('…AtRev loaders — the configuration as one commit holds it (task-137)', () => {
  let repo: string;
  let first: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    // Commit 1 — the revision under test.
    writeFixtureFile(repo, '.wingfoil/memory.yaml', memoryYaml('draft'));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml('core'));
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', workflowsYaml('first.yaml'));
    writeFixtureFile(repo, '.wingfoil/workflows/custom/first.yaml', workflowYaml('first'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/alpha.md', directiveMd('alpha'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', rolesYaml('alpha'));
    commitAll(repo, 'first');
    first = git(repo, ['rev-parse', 'HEAD']).trim();

    // Commit 2 — a later commit that changes every pillar.
    writeFixtureFile(repo, '.wingfoil/memory.yaml', memoryYaml('LATER-COMMIT'));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml('later-commit'));
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', workflowsYaml('second.yaml'));
    writeFixtureFile(repo, '.wingfoil/workflows/custom/second.yaml', workflowYaml('second'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/beta.md', directiveMd('beta'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', rolesYaml('beta'));
    commitAll(repo, 'second');

    // And an uncommitted edit on top of it.
    writeFixtureFile(repo, '.wingfoil/memory.yaml', memoryYaml('DIRTY-TREE'));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml('dirty-tree'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/gamma.md', directiveMd('gamma'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', rolesYaml('gamma'));
  });

  afterEach(() => removeTempDir(repo));

  it('loadDnaYamlAtRev returns the dna.yaml committed at the older sha', () => {
    expect(loadDnaYamlAtRev(repo, first)?.modules[0]?.name).toBe('core');
    expect(loadDnaYamlAtRev(repo, 'HEAD')?.modules[0]?.name).toBe('later-commit');
  });

  it('loadMemoryYamlAtRev returns the memory.yaml committed at the older sha', () => {
    expect(loadMemoryYamlAtRev(repo, first)?.types.task?.states?.sequence?.[0]).toBe('draft');
    expect(loadMemoryYamlAtRev(repo, 'HEAD~0')?.types.task?.states?.sequence?.[0]).toBe('LATER-COMMIT');
  });

  it('loadDirectivesAtRev returns exactly the directive files committed at the older sha', () => {
    expect(loadDirectivesAtRev(repo, first).map((file) => file.frontmatter.id)).toEqual(['alpha']);
    expect(loadDirectivesAtRev(repo, 'HEAD').map((file) => file.frontmatter.id)).toEqual(['alpha', 'beta']);
  });

  it('loadRolesYamlAtRev returns the roles.yaml committed at the older sha', () => {
    expect(loadRolesYamlAtRev(repo, first)?.assignments.developer).toEqual(['alpha']);
    expect(loadRolesYamlAtRev(repo, 'HEAD')?.assignments.developer).toEqual(['beta']);
  });

  it('loadWorkflowsYamlAtRev returns the registry committed at the older sha', () => {
    expect(loadWorkflowsYamlAtRev(repo, first).workflows.map((workflow) => workflow.name)).toEqual(['first']);
    expect(loadWorkflowsYamlAtRev(repo, 'HEAD').workflows.map((workflow) => workflow.name)).toEqual(['second']);
  });

  it('a file the commit does not hold is null (one file) or absent (a directory), not an error', () => {
    git(repo, ['rm', '--quiet', '--force', '.wingfoil/roles.yaml']);
    commitAll(repo, 'delete roles.yaml');
    expect(loadRolesYamlAtRev(repo, 'HEAD')).toBeNull();
    expect(loadRolesYamlAtRev(repo, first)?.assignments.developer).toEqual(['alpha']);
  });

  it('reading at a revision leaves the working tree and the index untouched', () => {
    const before = git(repo, ['status', '--porcelain']);
    loadDnaYamlAtRev(repo, first);
    loadMemoryYamlAtRev(repo, first);
    loadDirectivesAtRev(repo, first);
    loadRolesYamlAtRev(repo, first);
    loadWorkflowsYamlAtRev(repo, first);
    expect(git(repo, ['status', '--porcelain'])).toBe(before);
  });

  it('two calls with the same (root, rev) are deep-equal (REQ-SYS-07)', () => {
    const read = (): unknown => ({
      dna: loadDnaYamlAtRev(repo, first),
      memory: loadMemoryYamlAtRev(repo, first),
      directives: loadDirectivesAtRev(repo, first),
      roles: loadRolesYamlAtRev(repo, first),
      workflows: loadWorkflowsYamlAtRev(repo, first),
    });
    expect(read()).toEqual(read());
  });
});

describe('loadWorkflowsYamlAtRev — the same diagnostics array at a commit (task-136 contract)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('throws the DiagnosticsError the working-tree loader throws for the same bytes, file labels included', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', `${workflowsYaml('broken.yaml')}  - workflows/custom/missing.yaml\n`);
    writeFixtureFile(repo, '.wingfoil/workflows/custom/broken.yaml', 'name: broken\nkind: nonsense\nversion: 1.0\nphases: []\n');
    commitAll(repo, 'a broken registry');

    const fromTree = (() => {
      try {
        loadWorkflowsYaml(repo);
      } catch (error) {
        return error;
      }
      return null;
    })();
    const atRev = (() => {
      try {
        loadWorkflowsYamlAtRev(repo, 'HEAD');
      } catch (error) {
        return error;
      }
      return null;
    })();

    expect(fromTree).toBeInstanceOf(DiagnosticsError);
    expect(atRev).toBeInstanceOf(DiagnosticsError);
    expect((atRev as DiagnosticsError).diagnostics).toEqual((fromTree as DiagnosticsError).diagnostics);
    expect((atRev as DiagnosticsError).message).toBe((fromTree as DiagnosticsError).message);
  });

  it('an absent manifest at the commit is an empty registry, as in the working tree', () => {
    writeFixtureFile(repo, 'README.md', 'no configuration\n');
    commitAll(repo, 'no workflows');
    expect(loadWorkflowsYamlAtRev(repo, 'HEAD')).toEqual({ manifest: null, workflows: [], bindings: null, diagnostics: [] });
  });
});

describe('an unknown or malformed rev is a CoreError naming the rev, never an empty result (task-137)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml('core'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/alpha.md', directiveMd('alpha'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  const loaders: ReadonlyArray<[string, (root: string, rev: string) => unknown]> = [
    ['loadDnaYamlAtRev', loadDnaYamlAtRev],
    ['loadMemoryYamlAtRev', loadMemoryYamlAtRev],
    ['loadDirectivesAtRev', loadDirectivesAtRev],
    ['loadRolesYamlAtRev', loadRolesYamlAtRev],
    ['loadWorkflowsYamlAtRev', loadWorkflowsYamlAtRev],
  ];

  it.each(loaders)('%s refuses an unknown rev with NOT_FOUND, naming it', (_name, load) => {
    const rev = 'no-such-branch';
    let thrown: unknown;
    try {
      load(repo, rev);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RevisionError);
    const error = thrown as RevisionError;
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toContain(JSON.stringify(rev));
    expect(error.toCoreError()).toEqual({ code: 'NOT_FOUND', message: error.message, details: { rev } });
  });

  it.each(['', '-x', '--output=/tmp/x', 'HEAD:README.md', 'HEAD..HEAD', 'a b', 'HEAD\n'])(
    'refuses the malformed rev %j with VALIDATION, naming it',
    (rev) => {
      for (const [, load] of loaders) {
        let thrown: unknown;
        try {
          load(repo, rev);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(RevisionError);
        expect((thrown as RevisionError).code).toBe('VALIDATION');
        expect((thrown as RevisionError).details).toEqual({ rev });
        expect((thrown as RevisionError).message).toContain(JSON.stringify(rev));
      }
    },
  );

  it('a rev naming a non-commit object (a tree) is NOT_FOUND', () => {
    const tree = git(repo, ['rev-parse', 'HEAD^{tree}']).trim();
    expect(() => resolveRevision(repo, tree)).toThrow(RevisionError);
  });

  it('resolveRevision returns the full 40-hex sha of the commit', () => {
    expect(resolveRevision(repo, 'HEAD')).toBe(git(repo, ['rev-parse', 'HEAD']).trim());
    expect(resolveRevision(repo, 'HEAD')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('a root that is not a repository is a StorageError, not NOT_FOUND; the …AtHead readers still answer null (review)', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'wf-not-a-repo-'));
    try {
      expect(() => resolveRevision(notARepo, 'HEAD')).toThrow(storage.StorageError);
      expect(() => loadDnaYamlAtRev(notARepo, 'HEAD')).toThrow(/E_GIT_READ_FAILED/);
      expect(core.loadDnaYamlAtHead(notARepo)).toBeNull();
      expect(core.loadDirectivesAtHead(notARepo)).toEqual([]);
    } finally {
      removeTempDir(notARepo);
    }
  });

  it('a rev with whitespace is refused as malformed; git\'s dotted spelling of the same rev works (review)', () => {
    for (const rev of ['master@{1 day ago}', 'HEAD^{/fix bug}']) {
      expect(() => resolveRevision(repo, rev)).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    }
    expect(resolveRevision(repo, 'HEAD@{1.day.ago}')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('an unborn HEAD (no commit yet) is NOT_FOUND at the …AtRev level', () => {
    const empty = makeTempGitRepo();
    try {
      expect(() => loadDnaYamlAtRev(empty, 'HEAD')).toThrow(RevisionError);
    } finally {
      removeTempDir(empty);
    }
  });
});

describe('the readers at a revision are public API (task-137)', () => {
  it('the core, memory and storage barrels export them', () => {
    const exported = [
      core.loadDirectivesAtRev,
      core.loadDnaYamlAtRev,
      core.loadMemoryYamlAtRev,
      core.loadRolesYamlAtRev,
      core.loadWorkflowsYamlAtRev,
      core.resolveRevision,
      core.isWellFormedRevision,
      core.RevisionError,
      memory.listMemoryDocumentPathsAtRev,
      memory.loadMemoryDocumentsAtRev,
      memory.loadMemoryDocumentSummaryAtRev,
      memory.findMemoryDocumentByTypeAndIdAtRev,
      storage.readPathsAtRev,
      storage.resolveCommitAtRev,
    ];
    for (const fn of exported) expect(typeof fn).toBe('function');
    expect(core.isWellFormedRevision('HEAD~1')).toBe(true);
  });
});

describe('a commit git resolved but cannot list is a failed read, not an empty one (task-137)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/alpha.md', directiveMd('alpha'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('loadDirectivesAtRev throws E_GIT_READ_FAILED instead of answering []', () => {
    const spy = jest.spyOn(storage, 'listPathsAtRev').mockReturnValue(null);
    try {
      expect(() => loadDirectivesAtRev(repo, 'HEAD')).toThrow(storage.StorageError);
      expect(() => loadDirectivesAtRev(repo, 'HEAD')).toThrow(/E_GIT_READ_FAILED/);
    } finally {
      spy.mockRestore();
    }
  });
});
