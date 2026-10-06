/**
 * task-095-memory-add-resolves-its-type-at-head /
 * `bug-085-memory-add-reads-the-type-registry-from-the-worktree` — **`memory add` resolves the type
 * registry, the type's `path` and its `template` from the COMMITTED `.wingfoil/memory.yaml` and the
 * COMMITTED scaffold, never from the working tree** (`dl-080-which-baseline-each-command-reads`,
 * ratified as option (B): *a read that gates an operation resolves against the repository as
 * committed at `HEAD`*).
 *
 * The defect this pins: `memoryAddFn` loaded `memory.yaml` off disk, so an uncommitted `types:` entry
 * was enough to commit an element of a type no commit defines — and the element was then
 * **unreachable**, not merely wrong: with the working tree restored, `memory submit` and
 * `memory deprecate` both answer `document not found` and `memory search --type` finds nothing, which
 * is indistinguishable from the element never having been created. Strictly worse than `bug-081`,
 * which at least left the element visible and refusing.
 *
 * Same shape of fix as `task-091`'s, by the one move this call site allows: `memoryAddFn` held no
 * helper with a `MemoryYaml` parameter to remove, so the whole decision moved **behind**
 * `resolveAddType(root, type)` (`src/core/memory-add-type.ts`), which takes a root and a type name and
 * nothing else. The verb no longer holds a `MemoryYaml` at all, so — exactly as for
 * `prepareMemoryTransition` and `checkAssignable` — there is no argument through which a working-tree
 * registry could reach the decision. Several cases below therefore assert what the COMMITTED registry
 * *does* decide (the path an element lands at, the bytes it is scaffolded from), not merely that the
 * dirty one does not: a guard would satisfy the second and not the first.
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryAdd` operation — the exact `CoreFn` the
 * CLI command and the MCP Tool dispatch to — in THROWAWAY temp git repositories (`bug-075`: the verbs
 * cannot be pointed at this repository's own Memory). The sibling suite
 * `test/cli/memory-add-type-baseline.integration.test.ts` pins the exit code and stderr at the process
 * boundary.
 *
 * Determinism (REQ-SYS-07): fixed fixture texts, fixed identity, fixed step order; nothing asserted
 * depends on a clock, on randomness, or on the temp directory name.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import * as loaders from '../../src/core/loaders';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_YAML_PATH = '.wingfoil/memory.yaml';
const SCAFFOLD_PATH = '.wingfoil/memory/templates/adr.md';

/** The committed registry every case starts from: one type, one path, one scaffold. */
const MEMORY_YAML = `version: 1
types:
  adr:
    path: "docs/memory/adr/{id}.md"
    id_pattern: "adr-{n}-{slug}"
    template:
      file: "memory/templates/adr.md"
      frontmatter:
        required: [id, type, title, status]
  note:
    path: "docs/memory/note/{id}.md"
    id_pattern: "note-{slug}"
    template:
      file: "memory/templates/adr.md"
      frontmatter:
        required: [id, type, title, status]
`;

/**
 * The `bug-085` edit: a second type, added to the WORKING TREE's registry only.
 *
 * `note`'s `id_pattern` carries no `{n}` token on purpose, so its id is a pure function of the title
 * and the working-tree sequence counter (`bug-087`, `release: v0.3` — out of scope per AC7) never
 * enters a case that is about something else.
 */
const WITH_FABRICATED_TYPE = `${MEMORY_YAML}  fabricated-type:
    path: "docs/memory/fabricated/{id}.md"
    id_pattern: "fab-{n}-{slug}"
    template:
      file: "memory/templates/fabricated.md"
      frontmatter:
        required: [id, type, title, status]
`;

const COMMITTED_SCAFFOLD = `---
id: ""
type: adr
title: ""
status: draft
---

<!-- COMMITTED SCAFFOLD BODY -->
`;

const DIRTY_SCAFFOLD = COMMITTED_SCAFFOLD.replace('COMMITTED SCAFFOLD BODY', 'UNCOMMITTED SCAFFOLD BODY');

interface AddValue {
  readonly id: string;
  readonly path: string;
}

/** The real, registered `memory.memoryAdd` `CoreFn` — fails loudly if it is ever un-registered. */
function memoryAdd(): CoreFn<unknown, AddValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
  if (!operation) throw new Error('fixture bug: "memoryAdd" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, AddValue>;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

/** A repo whose COMMITTED state is `MEMORY_YAML` + `COMMITTED_SCAFFOLD`, with a clean working tree. */
function seedRepo(): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, MEMORY_YAML_PATH, MEMORY_YAML);
  writeFixtureFile(repo, SCAFFOLD_PATH, COMMITTED_SCAFFOLD);
  commitAll(repo, 'seed');
  expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  return repo;
}

/** Overwrite a tracked fixture file in the WORKING TREE only — never staged, never committed. */
function dirty(repo: string, path: string, content: string): void {
  writeFileSync(join(repo, path), content, 'utf-8');
  expect(gitOut(repo, ['status', '--porcelain', '--', path])).toBe(`M ${path}`);
}

const add = (repo: string, type: string, title: string): Promise<ReturnType<CoreFn<unknown, AddValue>>> =>
  memoryAdd()({ root: repo, options: { type, title } }) as Promise<never>;

describe('memory add resolves its type registry, path and template at HEAD (bug-085, dl-080 (B))', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  // AC1's reproduction, as a test (AC3/AC6). Red today: exit 0 and a commit of a type no commit knows.
  it('AC1/AC3/AC6: a type defined only in the working tree is refused at exit 1, nothing written', async () => {
    repo = seedRepo();
    dirty(repo, MEMORY_YAML_PATH, WITH_FABRICATED_TYPE);
    writeFixtureFile(repo, '.wingfoil/memory/templates/fabricated.md', COMMITTED_SCAFFOLD);
    const before = head(repo);

    const unchanged = snapshotPersistence(repo);
    const result = await add(repo, 'fabricated-type', 'Probe');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    // The P1.3 sc.2 / spec-008 §6 sentence stays verbatim and FIRST.
    expect(result.error.message.startsWith("unknown memory type 'fabricated-type' (not defined in memory.yaml)")).toBe(
      true,
    );
    // Nothing committed, and no element file created anywhere.
    expect(head(repo)).toBe(before);
    expect(existsSync(join(repo, 'docs/memory/fabricated'))).toBe(false);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // D4: the second sentence appears ONLY because the working tree and HEAD actually disagree.
  it('AC3: the refusal names the type and says the working tree defines it while HEAD does not', async () => {
    repo = seedRepo();
    dirty(repo, MEMORY_YAML_PATH, WITH_FABRICATED_TYPE);

    const result = await add(repo, 'fabricated-type', 'Probe');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(`the working tree's '${MEMORY_YAML_PATH}' defines it`);
    expect(result.error.message).toContain('not committed');
    expect(result.error.message).toContain(`commit '${MEMORY_YAML_PATH}' first`);
  });

  // The other half of the same diagnostic: a genuinely unknown type keeps the message byte for byte,
  // even while `memory.yaml` is dirty for a reason that has nothing to do with the requested type.
  it('AC3: a genuinely unknown type keeps the pinned P1.3 message verbatim, with no second sentence', async () => {
    repo = seedRepo();
    dirty(repo, MEMORY_YAML_PATH, `${MEMORY_YAML}# an unrelated uncommitted comment\n`);

    const result = await add(repo, 'unicorn', 'X');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe("unknown memory type 'unicorn' (not defined in memory.yaml)");
  });

  // AC2 — the type's `path`. A guard would refuse the dirty registry; only a committed BASELINE keeps
  // deciding correctly, so assert where the element actually lands.
  it('AC2: the element lands at the COMMITTED `path` pattern, not the working tree\'s', async () => {
    repo = seedRepo();
    dirty(repo, MEMORY_YAML_PATH, MEMORY_YAML.replace('docs/memory/adr/{id}.md', 'docs/HIJACKED/{id}.md'));

    const result = await add(repo, 'adr', 'Probe');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBe('docs/memory/adr/adr-001-probe.md');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe('docs/memory/adr/adr-001-probe.md');
    expect(existsSync(join(repo, 'docs/HIJACKED'))).toBe(false);
  });

  // AC2 — the `template`. AC1 measured that the committed element's body came from a file in no
  // commit; here the file is tracked and merely dirty, which is the everyday form of the same read.
  it('AC2: the element is scaffolded from the COMMITTED template bytes, not the working tree\'s', async () => {
    repo = seedRepo();
    dirty(repo, SCAFFOLD_PATH, DIRTY_SCAFFOLD);

    const result = await add(repo, 'adr', 'Probe');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = readFileSync(join(repo, result.value.path), 'utf-8');
    expect(written).toContain('COMMITTED SCAFFOLD BODY');
    expect(written).not.toContain('UNCOMMITTED SCAFFOLD BODY');
    expect(gitOut(repo, ['show', `HEAD:${result.value.path}`])).toContain('COMMITTED SCAFFOLD BODY');
  });

  // The mirror case, and the one a guard would get wrong in the other direction (task-091's M2): a
  // working tree that WITHDRAWS something HEAD records no longer blocks. Today this throws a raw
  // ENOENT; under the committed baseline the scaffold is still readable.
  it('AC2: a scaffold committed at HEAD but deleted in the working tree still adds', async () => {
    repo = seedRepo();
    rmSync(join(repo, SCAFFOLD_PATH));

    const result = await add(repo, 'adr', 'Probe');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(join(repo, result.value.path), 'utf-8')).toContain('COMMITTED SCAFFOLD BODY');
  });

  // D3 — the scaffold a committed registry names must itself be committed, or the element would carry
  // bytes no commit contains (AC1's third face).
  it('AC3: a `template.file` present in the working tree but in no commit is refused at exit 1', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, MEMORY_YAML_PATH, MEMORY_YAML);
    commitAll(repo, 'registry only — the scaffold is deliberately left untracked');
    writeFixtureFile(repo, SCAFFOLD_PATH, COMMITTED_SCAFFOLD);
    const before = head(repo);

    const result = await add(repo, 'adr', 'Probe');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain("cannot read the scaffold for memory type 'adr'");
    expect(result.error.message).toContain(SCAFFOLD_PATH);
    expect(result.error.message).toContain('is in no commit');
    expect(head(repo)).toBe(before);
  });

  // AC4 — fail-closed, half one: nothing committed to read. Today the working-tree copy simply serves.
  it('AC4: an UNCOMMITTED `memory.yaml` is refused fail-closed at exit 1, not read from disk', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'README.md', 'seed\n');
    commitAll(repo, 'seed without a registry');
    writeFixtureFile(repo, MEMORY_YAML_PATH, MEMORY_YAML);
    writeFixtureFile(repo, SCAFFOLD_PATH, COMMITTED_SCAFFOLD);
    const before = head(repo);

    const result = await add(repo, 'adr', 'Probe');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toContain('cannot resolve the memory type registry');
    expect(result.error.message).toContain('is not committed at HEAD');
    expect(head(repo)).toBe(before);
  });

  // AC4 — fail-closed, half two: a committed registry that does not validate, while the working-tree
  // copy is perfectly fine. Falling back to the good copy on disk is exactly the defect.
  it('AC4: an INVALID committed `memory.yaml` is refused fail-closed, even with a valid one on disk', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, MEMORY_YAML_PATH, 'version: 1\ntypes: "not a mapping"\n');
    writeFixtureFile(repo, SCAFFOLD_PATH, COMMITTED_SCAFFOLD);
    commitAll(repo, 'seed an invalid registry');
    writeFileSync(join(repo, MEMORY_YAML_PATH), MEMORY_YAML, 'utf-8');

    const result = await add(repo, 'adr', 'Probe');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toContain('is not readable as a Memory configuration');
  });

  // D4 — the diagnostic can never decide. An unreadable working-tree registry leaves the refusal
  // exactly as P1.3 words it, rather than turning into a different (or a thrown) failure.
  it('AC3: a working-tree read failure cannot change the refusal owned by HEAD', async () => {
    repo = seedRepo();
    const spy = jest.spyOn(loaders, 'loadMemoryYaml').mockImplementation(() => {
      throw new Error('working tree unreadable');
    });
    try {
      const result = await add(repo, 'unicorn', 'X');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe("unknown memory type 'unicorn' (not defined in memory.yaml)");
    } finally {
      spy.mockRestore();
    }
  });

  // ---- AC5: the ordinary flows, each pinned (characterization — all green before the fix too) ----

  it('AC5: adding an element of a COMMITTED type still works, in one scoped commit', async () => {
    repo = seedRepo();

    const result = await add(repo, 'adr', 'Use Postgres');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ id: 'adr-001-use-postgres', path: 'docs/memory/adr/adr-001-use-postgres.md' });
    expect(readFileSync(join(repo, result.value.path), 'utf-8')).toContain('status: draft');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(adr): add adr-001-use-postgres');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(result.value.path);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('AC5: a type added AND COMMITTED is usable immediately — edit, commit, add', async () => {
    repo = seedRepo();
    writeFileSync(join(repo, MEMORY_YAML_PATH), WITH_FABRICATED_TYPE, 'utf-8');
    writeFixtureFile(repo, '.wingfoil/memory/templates/fabricated.md', COMMITTED_SCAFFOLD);
    commitAll(repo, 'chore: register a new memory type');

    const result = await add(repo, 'fabricated-type', 'Probe');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBe('docs/memory/fabricated/fab-001-probe.md');
    // The element and the type that supports it are now in the same committed record.
    expect(gitOut(repo, ['show', `HEAD:${MEMORY_YAML_PATH}`])).toContain('fabricated-type');
  });

  // task-092's absence guard must not regress: it is a different read in the same verb, and the id it
  // guards is now derived from the COMMITTED `path` pattern.
  it("AC5: task-092's absence guard still refuses an occupied target path", async () => {
    repo = seedRepo();
    const NOTE_X = 'docs/memory/note/note-x.md';
    writeFixtureFile(repo, NOTE_X, 'a hand-started draft, never committed\n');
    const before = head(repo);

    const result = await add(repo, 'note', 'X');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain(NOTE_X);
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, NOTE_X), 'utf-8')).toBe('a hand-started draft, never committed\n');
  });

  it('AC5: adding a NEW element still works while ANOTHER element carries uncommitted modifications', async () => {
    repo = seedRepo();
    const first = await add(repo, 'adr', 'First');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    writeFileSync(join(repo, first.value.path), 'hand edits, uncommitted\n', 'utf-8');

    const second = await add(repo, 'adr', 'Second');

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.path).toBe('docs/memory/adr/adr-002-second.md');
    expect(git(repo, ['status', '--porcelain']).trimEnd()).toBe(` M ${first.value.path}`);
  });
});
