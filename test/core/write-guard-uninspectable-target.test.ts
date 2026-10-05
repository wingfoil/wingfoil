/**
 * task-131-make-dirty-target-guard-refuse-path-cannot-inspect — the dirty-target guard family
 * (`src/core/write-guard.ts`, `dl-080` (B)) refuses a target it cannot inspect, instead of reading
 * git's silence as "clean".
 *
 * - `bug-118`: `git status --porcelain -- <path>` prints NOTHING for a path that lies beyond a
 *   symbolic link — modified or not — and `requireUnmodifiedTarget` short-circuited on the empty
 *   string. The guard was blind at all six of its call sites (`dna set`, `directive assign`,
 *   `directive create`, `directive remove`, `initWingfoilStorage`, the gated Memory transition
 *   verbs), whether the symlink pointed inside or outside the project.
 * - `bug-124`: with `directives/custom` symlinked elsewhere INSIDE the project, `directive remove`
 *   unlinked the file and only then failed at `git add` with git's raw text.
 * - `bug-182` (absorbed by the approver's triage, 2026-10-01, `dl-045`): the content-carrying verbs
 *   (`memory submit`, `memory amend`) run no dirty-target guard by design — the working tree is their
 *   content — but `commitPaths`'s `git add` silently replaced a staged version that differs from both
 *   `HEAD` and the working tree. Such a version is refused there.
 * - `bug-122`: the unconfined `resolveMemoryPath` is not part of the storage barrel.
 *
 * Every fixture is a THROWAWAY temp git repo; anything "outside the project" is a second `mkdtemp`.
 * The load-bearing assertions are the bytes on disk and `git rev-parse HEAD`, never only a message.
 *
 * Deterministic (REQ-SYS-07): fixed fixture text and identity, fixed case order, no clock.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CORE_MODULES,
  initWingfoilProject,
  initWingfoilStorage,
  requireAbsentTarget,
  requireInspectableTarget,
  requireNoDivergentStage,
  requireUnmodifiedTarget,
} from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';

import { renderCustomDirective } from '../../src/directives/create';
import * as storage from '../../src/storage';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

type AnyFn = CoreFn<unknown, unknown>;

function op(module: string, name: string): AnyFn {
  const operation = CORE_MODULES.find((entry) => entry.name === module)?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered on the "${module}" module`);
  return operation.fn as AnyFn;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);
const errorMessage = (result: CoreResult<unknown>): string => (result.ok ? '<result was ok>' : result.error.message);

/** Assert the shape every refusal in this suite must have: not ok, exit 1, the path named, no git text. */
function expectUninspectableRefusal(result: CoreResult<unknown>, path: string): void {
  expect(result.ok).toBe(false);
  expect(exitCodeForResult(result)).toBe(1);
  expect(errorMessage(result)).toContain(path);
  expect(errorMessage(result)).toContain('symbolic link');
  expect(errorMessage(result)).not.toContain('Command failed');
}

const DNA = '.wingfoil/dna.yaml';
const ROLES = '.wingfoil/roles.yaml';
const CUSTOM_DIR = '.wingfoil/directives/custom';

/** The REAL `wingfoil init` Scrum scaffold in a temp repo. */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

/**
 * Move `relativeDir` to `destination` (absolute) and leave a symlink to it in its place, then commit.
 * `destination` inside the repo is the in-root case; a second `mkdtemp` is the out-of-root case.
 */
function aliasDirectory(repo: string, relativeDir: string, destination: string): void {
  renameSync(join(repo, relativeDir), destination);
  symlinkSync(destination, join(repo, relativeDir));
  commitAll(repo, `fixture: alias ${relativeDir}`);
}

const placements = ['inside', 'outside'] as const;
type Placement = (typeof placements)[number];

/**
 * A verb's refusal for a target beyond a symlinked directory. In the root it is this suite's
 * inspectability refusal; out of it, the write paths ask confinement first (task-172, `bug-121`:
 * a path that leaves the project is reported as leaving it), so the message is the boundary one.
 * Either way: exit 1, the path named, nothing written — asserted by each caller on the bytes.
 */
function expectVerbRefusal(result: CoreResult<unknown>, path: string, placement: Placement): void {
  if (placement === 'inside') {
    expectUninspectableRefusal(result, path);
    return;
  }
  expect(result.ok).toBe(false);
  expect(exitCodeForResult(result)).toBe(1);
  expect(errorMessage(result)).toContain(path);
  expect(errorMessage(result)).toContain('outside the project root');
  expect(errorMessage(result)).not.toContain('Command failed');
}

describe('requireUnmodifiedTarget — a target beyond a symbolic link is refused, never read as clean (bug-118)', () => {
  let repo: string;
  let outside: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
  });
  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  const realDir = (placement: Placement): string => (placement === 'inside' ? join(repo, 'elsewhere') : join(outside, 'custom'));

  describe.each(placements)('with directives/custom symlinked %s the project', (placement) => {
    beforeEach(() => {
      writeFixtureFile(repo, `${CUSTOM_DIR}/legacy-rule.md`, renderCustomDirective('legacy-rule'));
      commitAll(repo, 'fixture: a custom directive');
      aliasDirectory(repo, CUSTOM_DIR, realDir(placement));
    });

    it('git status reports nothing for the target, modified or not — the blindness the guard must not trust', () => {
      writeFileSync(join(realDir(placement), 'legacy-rule.md'), 'modified\n', 'utf-8');
      expect(gitOut(repo, ['status', '--porcelain', '--', `${CUSTOM_DIR}/legacy-rule.md`])).toBe('');
    });

    it('refuses an UNMODIFIED target it cannot inspect, naming the path and the symbolic link', () => {
      expectUninspectableRefusal(requireUnmodifiedTarget(repo, `${CUSTOM_DIR}/legacy-rule.md`), `${CUSTOM_DIR}/legacy-rule.md`);
    });

    // task-247: `memory submit`/`amend` no longer reach this guard through such a document (the HEAD
    // preamble refuses it first), so it is pinned here directly, as the defence it still is.
    it('requireNoDivergentStage refuses a target it cannot inspect, naming the path and the symbolic link', () => {
      expectUninspectableRefusal(requireNoDivergentStage(repo, `${CUSTOM_DIR}/legacy-rule.md`), `${CUSTOM_DIR}/legacy-rule.md`);
    });

    it('refuses a MODIFIED target it cannot inspect (bug-118 repro)', () => {
      writeFileSync(join(realDir(placement), 'legacy-rule.md'), 'modified\n', 'utf-8');
      expectUninspectableRefusal(requireUnmodifiedTarget(repo, `${CUSTOM_DIR}/legacy-rule.md`), `${CUSTOM_DIR}/legacy-rule.md`);
    });
  });

  // Added at refactor (not red-first): the same "cannot inspect" answer for an ancestor the
  // filesystem will not let us `lstat` into. Skipped as root, where permission bits do not bind.
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  (asRoot ? it.skip : it)('refuses a target behind a directory without search permission, naming it', () => {
    writeFixtureFile(repo, 'locked/inner/file.md', 'x\n');
    chmodSync(join(repo, 'locked'), 0o600);
    try {
      const result = requireUnmodifiedTarget(repo, 'locked/inner/file.md');
      expect(result.ok).toBe(false);
      expect(exitCodeForResult(result)).toBe(1);
      expect(errorMessage(result)).toContain("'locked/inner' cannot be read (EACCES)");
    } finally {
      chmodSync(join(repo, 'locked'), 0o700);
    }
  });

  // The two new guards are public through the core barrel, next to their siblings (independent review).
  it('requireInspectableTarget / requireNoDivergentStage — reachable from src/core; an ordinary target passes both', () => {
    expect(requireInspectableTarget(repo, DNA).ok).toBe(true);
    expect(requireNoDivergentStage(repo, DNA).ok).toBe(true);
  });

  it('characterization: an ordinary clean target still passes', () => {
    expect(requireUnmodifiedTarget(repo, DNA).ok).toBe(true);
  });

  it('characterization: an ordinary absent target (parent missing too) still passes', () => {
    expect(requireUnmodifiedTarget(repo, 'docs/not/there/yet.md').ok).toBe(true);
  });

  it('characterization: a target whose OWN name is a symlink is not "beyond" one — git reports the link (bug-044 benign case)', () => {
    const target = join(outside, 'target-rule.md');
    writeFileSync(target, renderCustomDirective('benign-rule'), 'utf-8');
    symlinkSync(target, join(repo, CUSTOM_DIR, 'benign-rule.md'));
    commitAll(repo, 'fixture: plant a symlinked directive file');
    expect(requireUnmodifiedTarget(repo, `${CUSTOM_DIR}/benign-rule.md`).ok).toBe(true);
  });
});

describe('the six requireUnmodifiedTarget call sites refuse before any write (bug-118 AC1)', () => {
  let repo: string;
  let outside: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
  });
  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  /** Where `.wingfoil/` really lives once it has been aliased. */
  const aliasConfig = (placement: Placement): string => {
    const destination = placement === 'inside' ? join(repo, 'cfg-real') : join(outside, 'cfg-real');
    aliasDirectory(repo, '.wingfoil', destination);
    return destination;
  };

  describe.each(placements)('with the target symlinked %s the project', (placement) => {
    it('dna set — refuses, leaves dna.yaml byte-identical, creates no commit', async () => {
      const real = aliasConfig(placement);
      const bytes = readFileSync(join(real, 'dna.yaml'), 'utf-8');
      const before = head(repo);

      const result = (await op('dna', 'dnaSet')({
        root: repo,
        positionals: ['project.name'],
        options: { value: 'Renamed' },
      })) as CoreResult<unknown>;

      expectVerbRefusal(result, DNA, placement);
      expect(readFileSync(join(real, 'dna.yaml'), 'utf-8')).toBe(bytes);
      expect(head(repo)).toBe(before);
    });

    /**
     * `roles.yaml` sits directly under `.wingfoil/`, so it is beyond a symlink only when `.wingfoil/`
     * itself is one. Two cases:
     * - the symlink is COMMITTED (this fixture): the committed `dna.yaml` the verb reads its role
     *   catalogue from (`dl-080` (B)) is not at `HEAD` either, so the verb is ALREADY refused, before
     *   the guard and before any write;
     * - the symlink is in the WORKING TREE only: `.wingfoil/dna.yaml` is still at `HEAD`, the verb
     *   reaches the guard, and git reports `roles.yaml` as ` D` — so even the old guard refused it as
     *   dirty; the new guard now refuses it earlier, as uninspectable.
     * Characterization at the verb (it must stay a refusal with nothing written);
     * the guard's own answer for `roles.yaml` is pinned red-first beside it.
     */
    it('directive assign — characterization: refused before any write, roles.yaml byte-identical, no commit', async () => {
      const real = aliasConfig(placement);
      const bytes = readFileSync(join(real, 'roles.yaml'), 'utf-8');
      const before = head(repo);

      const result = (await op('directive', 'directiveAssign')({
        root: repo,
        options: { directive: 'architecture', role: 'developer' },
      })) as CoreResult<unknown>;

      expect(result.ok).toBe(false);
      expect(exitCodeForResult(result)).toBe(1);
      expect(readFileSync(join(real, 'roles.yaml'), 'utf-8')).toBe(bytes);
      expect(head(repo)).toBe(before);
    });

    it('directive assign — the guard itself refuses roles.yaml beyond the symlink', () => {
      aliasConfig(placement);
      expectUninspectableRefusal(requireUnmodifiedTarget(repo, ROLES), ROLES);
    });

    it('directive create — refuses and writes no file', async () => {
      const real = placement === 'inside' ? join(repo, 'elsewhere') : join(outside, 'custom');
      aliasDirectory(repo, CUSTOM_DIR, real);
      const before = head(repo);

      const result = (await op('directive', 'directiveCreate')({ root: repo, options: { name: 'delta' } })) as CoreResult<unknown>;

      expectVerbRefusal(result, `${CUSTOM_DIR}/delta.md`, placement);
      expect(existsSync(join(real, 'delta.md'))).toBe(false);
      expect(head(repo)).toBe(before);
    });

    it('initWingfoilStorage — refuses and writes no scaffold file', () => {
      const real = aliasConfig(placement);
      const bytes = readFileSync(join(real, 'dna.yaml'), 'utf-8');
      const before = head(repo);

      const result = initWingfoilStorage(repo);

      expectVerbRefusal(result, '.wingfoil/', placement);
      expect(readFileSync(join(real, 'dna.yaml'), 'utf-8')).toBe(bytes);
      expect(head(repo)).toBe(before);
    });
  });

  // `directive remove`: the out-of-root case is refused by the confinement check first
  // (`test/core/directive-remove-confinement.test.ts`, task-102); the in-root case is bug-124.
  it('directive remove — an in-root symlinked custom/ refuses BEFORE unlinking; the file survives (bug-124)', async () => {
    writeFixtureFile(repo, `${CUSTOM_DIR}/legacy-rule.md`, renderCustomDirective('legacy-rule'));
    commitAll(repo, 'fixture: a custom directive');
    const real = join(repo, '.wingfoil', 'elsewhere');
    aliasDirectory(repo, CUSTOM_DIR, real);
    const bytes = readFileSync(join(real, 'legacy-rule.md'), 'utf-8');
    const before = head(repo);

    const result = (await op('directive', 'directiveRemove')({ root: repo, positional: 'legacy-rule' })) as CoreResult<unknown>;

    expectUninspectableRefusal(result, `${CUSTOM_DIR}/legacy-rule.md`);
    expect(existsSync(join(real, 'legacy-rule.md'))).toBe(true);
    expect(readFileSync(join(real, 'legacy-rule.md'), 'utf-8')).toBe(bytes);
    expect(head(repo)).toBe(before);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------------
// Memory: the gated transition verbs (the sixth call site), the content-carrying verbs, `memory add`.
// ---------------------------------------------------------------------------------------------------

const TYPE_DIR = 'docs/memory/note';
const DOC_ID = 'note-001-planted';
const DOC_PATH = `${TYPE_DIR}/${DOC_ID}.md`;

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  note:
    path: "${TYPE_DIR}/{id}.md"
    id_pattern: "note-{n}-{slug}"
    amendable: true
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [title]
`;

const NOTE_TEMPLATE = `---
id: ""
type: note
title: ""
status: draft
---

<!-- body -->
`;

const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

function noteDoc(status: string, body = 'Real content.'): string {
  return `---
id: "${DOC_ID}"
type: note
title: "A planted note"
status: ${status}
---

## Body

${body}
`;
}

function makeMemoryRepo(): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
  writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
  writeFixtureFile(repo, `${TYPE_DIR}/.gitkeep`, '');
  commitAll(repo, 'seed memory.yaml + dna.yaml + a note store');
  return repo;
}

describe('memory transition verbs — a document in an in-root symlinked type directory is refused before the write', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeMemoryRepo();
  });
  afterEach(() => removeTempDir(repo));

  // Out-of-root is refused by the confinement pre-flight (`test/core/memory-transition-confinement.test.ts`).
  const verbs: readonly { operation: string; from: string; params: Record<string, unknown> }[] = [
    { operation: 'memorySubmit', from: 'draft', params: {} },
    { operation: 'memoryApprove', from: 'pending', params: { options: { reason: 'probe' } } },
    { operation: 'memoryReject', from: 'pending', params: { options: { reason: 'probe' } } },
    { operation: 'memoryDeprecate', from: 'draft', params: { options: { reason: 'probe' } } },
  ];

  it.each(verbs)('$operation — refuses at exit 1, leaves the document byte-identical, creates no commit', async ({ operation, from, params }) => {
    writeFixtureFile(repo, DOC_PATH, noteDoc(from));
    commitAll(repo, 'fixture: a planted note');
    const real = join(repo, 'notes-real');
    aliasDirectory(repo, TYPE_DIR, real);
    const bytes = readFileSync(join(real, `${DOC_ID}.md`), 'utf-8');
    const before = head(repo);

    const result = (await op('memory', operation)({ root: repo, positional: DOC_ID, ...params })) as CoreResult<unknown>;

    expectUninspectableRefusal(result, DOC_PATH);
    expect(readFileSync(join(real, `${DOC_ID}.md`), 'utf-8')).toBe(bytes);
    expect(head(repo)).toBe(before);
  });
});

describe('memory add — a NEW target in an in-root symlinked type directory is refused before the write (same class)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeMemoryRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('requireAbsentTarget refuses a path beyond a symbolic link', () => {
    aliasDirectory(repo, TYPE_DIR, join(repo, 'notes-real'));
    expectUninspectableRefusal(requireAbsentTarget(repo, `${TYPE_DIR}/note-002-x.md`), `${TYPE_DIR}/note-002-x.md`);
  });

  it('memory add — refuses at exit 1 and writes no file', async () => {
    const real = join(repo, 'notes-real');
    aliasDirectory(repo, TYPE_DIR, real);
    const before = head(repo);

    const result = (await op('memory', 'memoryAdd')({ root: repo, options: { type: 'note', title: 'X' } })) as CoreResult<unknown>;

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(errorMessage(result)).toContain('symbolic link');
    expect(gitOut(repo, ['ls-files', '--others', '--exclude-standard'])).toBe('');
    expect(head(repo)).toBe(before);
  });
});

describe('content-carrying verbs refuse a staged version that differs from both HEAD and the working tree (bug-182)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeMemoryRepo();
  });
  afterEach(() => removeTempDir(repo));

  const verbs: readonly { operation: string; from: string; params: Record<string, unknown> }[] = [
    { operation: 'memorySubmit', from: 'draft', params: {} },
    { operation: 'memoryAmend', from: 'approved', params: { options: { reason: 'probe' } } },
  ];

  describe.each(verbs)('$operation', ({ operation, from, params }) => {
    beforeEach(() => {
      writeFixtureFile(repo, DOC_PATH, noteDoc(from));
      commitAll(repo, 'fixture: a committed note');
    });

    it('refuses at exit 1 naming the path; the staged and working-tree versions both survive; no commit', async () => {
      writeFileSync(join(repo, DOC_PATH), noteDoc(from, 'STAGED'), 'utf-8');
      gitOut(repo, ['add', '--', DOC_PATH]);
      writeFileSync(join(repo, DOC_PATH), noteDoc(from, 'WORKTREE'), 'utf-8');
      const before = head(repo);

      const result = (await op('memory', operation)({ root: repo, positional: DOC_ID, ...params })) as CoreResult<unknown>;

      expect(result.ok).toBe(false);
      expect(exitCodeForResult(result)).toBe(1);
      expect(errorMessage(result)).toContain(DOC_PATH);
      expect(errorMessage(result)).toContain('index');
      expect(head(repo)).toBe(before);
      expect(gitOut(repo, ['show', `:0:${DOC_PATH}`])).toContain('STAGED');
      expect(readFileSync(join(repo, DOC_PATH), 'utf-8')).toContain('WORKTREE');
    });

    it('characterization: a staged version EQUAL to the working tree is committed as before', async () => {
      writeFileSync(join(repo, DOC_PATH), noteDoc(from, 'SAME'), 'utf-8');
      gitOut(repo, ['add', '--', DOC_PATH]);
      const before = head(repo);

      const result = (await op('memory', operation)({ root: repo, positional: DOC_ID, ...params })) as CoreResult<unknown>;

      expect(result.ok).toBe(true);
      expect(head(repo)).not.toBe(before);
      expect(gitOut(repo, ['show', `HEAD:${DOC_PATH}`])).toContain('SAME');
    });

    it('characterization: an unstaged working-tree edit (index = HEAD) is committed as before', async () => {
      writeFileSync(join(repo, DOC_PATH), noteDoc(from, 'EDITED'), 'utf-8');
      const before = head(repo);

      const result = (await op('memory', operation)({ root: repo, positional: DOC_ID, ...params })) as CoreResult<unknown>;

      expect(result.ok).toBe(true);
      expect(head(repo)).not.toBe(before);
      expect(gitOut(repo, ['show', `HEAD:${DOC_PATH}`])).toContain('EDITED');
    });
  });
});

describe('storage barrel — the unconfined resolver is not public surface (bug-122)', () => {
  it('src/storage/index.ts does not export resolveMemoryPath', () => {
    expect(Object.keys(storage)).not.toContain('resolveMemoryPath');
  });

  it('characterization: renderMemoryPath is still exported', () => {
    expect(Object.keys(storage)).toContain('renderMemoryPath');
  });
});
