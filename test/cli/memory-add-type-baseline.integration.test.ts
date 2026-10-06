/**
 * task-095-memory-add-resolves-its-type-at-head /
 * `bug-085-memory-add-reads-the-type-registry-from-the-worktree`, AC1/AC3/AC4/AC5 — the defect and
 * its fix end to end through the REAL compiled `dist/cli.js`, in a REAL `wingfoil init`-ed throwaway
 * project.
 *
 * `bug-085` was found by `task-091`'s AC5 sweep on a project other than this one, and could not have
 * been found here: `bug-075` means the verbs cannot be pointed at WingFoil's own Memory. The
 * in-process suite (`test/core/memory-add-type-baseline.test.ts`) pins the behaviour at the `CoreFn`
 * seam; this one pins the two things only the process boundary shows:
 *
 * - the **exit code** a script keys on — `1`, a well-formed invocation failing a repository-state
 *   precondition, never `2` (`spec-005-cli-command-contract` § "1. Exit-code contract (REQ-INT-04)";
 *   ruled on `bug-076`), and
 * - the **stderr text** a human reads, in `spec-008-cli-grammar` § 6's `error: <reason>` envelope,
 *   whose worked example for this very verb is
 *   `error: unknown memory type 'unicorn' (not defined in memory.yaml)`.
 *
 * It also pins the AC4 fact the fail-closed decision rests on, in the form this task needs it:
 * `wingfoil init` commits `.wingfoil/memory.yaml` **and every `template.file` scaffold it names** in
 * the scaffold commit, so `HEAD` carries a registry AND a readable scaffold from a project's first
 * commit onwards. `task-091` measured the registry half; the scaffold half is this task's.
 *
 * Spawned through `./helpers/spawn-cli` (bug-197), which throws on a signal rather than reading it as an
 * exit, and uses `spawnSync`, not `execFileSync` + `catch`: the latter surfaces `stderr` only on the error path, so
 * a command that exits `0` while printing to fd 2 reads back as `stderr: ''` — a false green that
 * cost `task-086` a rewrite of this same helper shape. Do not "simplify" it back.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003-cli-integration-dist-race`) — never rebuilt
 * here. Deterministic (REQ-SYS-07): fixed step list, fixed identity, fixed fixture text.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_PATH = '.wingfoil/memory.yaml';

/** The `bug-085` edit, applied to the scaffolded registry in the WORKING TREE only. */
const FABRICATED_TYPE = `
  fabricated-type:
    path: docs/memory/fabricated/{id}.md
    id_pattern: "fab-{n}-{slug}"
    template:
      file: memory/templates/fabricated.md
      frontmatter:
        required: [id, type, title, status]
`;

/** Spawn the real published entry point; captures stderr on EVERY run, including a 0-exit one. */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

/** Add `fabricated-type` to the working tree's registry, with an untracked scaffold to match. */
function fabricateTypeInWorkingTree(repo: string): void {
  const path = join(repo, MEMORY_PATH);
  const scaffolded = readFileSync(path, 'utf-8');
  expect(scaffolded).toContain('types:');
  writeFileSync(path, scaffolded.replace('types:\n', `types:${FABRICATED_TYPE}`), 'utf-8');
  writeFileSync(
    join(repo, '.wingfoil/memory/templates/fabricated.md'),
    readFileSync(join(repo, '.wingfoil/memory/templates/adr.md'), 'utf-8'),
    'utf-8',
  );
}

describe('the CLI resolves `memory add`\'s type at HEAD (bug-085)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);
  });

  afterEach(() => removeTempDir(repo));

  // AC4's load-bearing fact, measured rather than assumed (the task's design § D5 rests on it).
  it('AC4: `wingfoil init` commits the registry AND every template it names, in one commit', () => {
    const committed = gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n');
    expect(committed).toContain(MEMORY_PATH);
    const registry = gitOut(repo, ['show', `HEAD:${MEMORY_PATH}`]);
    const templates = [...registry.matchAll(/^\s*file:\s*(\S+)\s*$/gm)].map((match) => `.wingfoil/${match[1]}`);
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) expect(committed).toContain(template);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // AC1's reproduction, as a test: exit 0 and a committed element of a type no commit defines.
  it('AC1/AC3/AC6: an uncommitted type cannot produce a committed element, and the refusal exits 1', () => {
    fabricateTypeInWorkingTree(repo);
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'memory', 'add', '--type', 'fabricated-type', '--title', 'Probe');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("error: unknown memory type 'fabricated-type' (not defined in memory.yaml)");
    expect(run.stderr).toContain(`commit '${MEMORY_PATH}' first`);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(existsSync(join(repo, 'docs/memory/fabricated'))).toBe(false);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // spec-008 § 6's worked example, byte for byte, with no second sentence: nothing disagrees here.
  it('AC3: a genuinely unknown type still prints the spec-008 §6 example verbatim at exit 1', () => {
    const run = wingfoil(repo, 'memory', 'add', '--type', 'unicorn', '--title', 'X');

    expect(run.status).toBe(1);
    expect(run.stderr.trim()).toBe("error: unknown memory type 'unicorn' (not defined in memory.yaml)");
  });

  // AC5 — the two ordinary flows, through the real command.
  it('AC5: adding an element of a committed type still works on a fresh project', () => {
    const run = wingfoil(repo, 'memory', 'add', '--type', 'adr', '--title', 'Probe');

    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('adr-001-probe');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(adr): add adr-001-probe');
  });

  it('AC5: register the type, COMMIT it, then add — the flow the rule asks for', () => {
    fabricateTypeInWorkingTree(repo);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'chore: register a new memory type']);

    const run = wingfoil(repo, 'memory', 'add', '--type', 'fabricated-type', '--title', 'Probe');

    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(fabricated-type): add fab-001-probe');
    expect(gitOut(repo, ['show', `HEAD~1:${MEMORY_PATH}`])).toContain('fabricated-type');
  });
});
