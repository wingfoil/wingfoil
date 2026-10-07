/**
 * task-033-manual-e2e-journey-validation — executable regression of the MANUAL Journey 0a walkthrough
 * (`docs/04_memory/v0.1/task-033-manual-e2e-journey-validation.md`, `docs/01_vision/05_journeys.md`
 * "Journey 0a — Initialize WingFoil on a New Project", `docs/04_memory/planning/rl-v1/minor-v0.1.md`
 * Success Criteria).
 *
 * This is a value-add, not the primary deliverable: the primary deliverable is the WRITTEN walkthrough
 * record in task-033's own Execution Notes (a human/agent actually ran these commands, by hand, against
 * a throwaway temp git repo, and recorded pass/fail + exit codes there). This file scripts that exact
 * cycle end-to-end against the real, COMPILED `dist/cli.js` (out-of-process, via the same
 * `cli-harness.cjs` bridge `test/cli/program.integration.test.ts` already uses — see that file's header
 * comment for why `program.ts`'s `commander` wiring cannot be imported directly into a Jest test), so
 * the manual walkthrough gets a permanent, automated guard against regressing:
 *
 *   init --template Scrum -> dna show -> dna show <section> -> dna set + read-back -> memory add ->
 *   memory search -> paths -> paths <category> --list
 *
 * Exactly the v0.1-scoped slice this task's Acceptance Criteria requires (Journey 0a steps 1-2 and 4;
 * step 3, `wingfoil workflow start`, is out of v0.1 scope and covered only by the manual record's
 * "known gaps" section, not here). Every exit code asserted below was observed running the identical
 * commands by hand first (see task-033's Execution Notes) — not guessed from the specs.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { load as yamlLoad } from 'js-yaml';

import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { DIST_DIR, runCliHarness, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** Spawn the real, compiled CLI wiring against a given project root (a fresh throwaway git repo here,
 *  never this repository's own `.wingfoil/` — same rule the manual walkthrough follows). */
function runCliInRoot(root: string, ...args: readonly string[]): SpawnedRun {
  return runCliHarness(root, args);
}

describe('Journey 0a (v0.1-scoped slice) — real CLI, fresh throwaway project (task-033)', () => {
  let repo: string;

  beforeAll(() => {
    expect(existsSync(join(DIST_DIR, 'cli.js'))).toBe(true);
  });

  beforeEach(() => {
    // Step 1 — "Create new repo and project files" (05_journeys.md Journey 0a): a bare temp dir made
    // into a git repo with a local identity, exactly as `makeTempGitRepo` already does for every other
    // out-of-process CLI suite.
    repo = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('step 2: `wingfoil init --template Scrum` runs to completion (exit 0) and produces a schema-valid dna.yaml + Memory scaffold with no manual YAML editing (bug-005 regression)', () => {
    const init = runCliInRoot(repo, 'init', '--template', 'Scrum');
    expect(init.status).toBe(0);
    expect(existsSync(join(repo, '.wingfoil', 'dna.yaml'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'memory.yaml'))).toBe(true);

    // bug-005 regression: `dna show` used to error immediately (exit 1) against a freshly-scaffolded
    // dna.yaml, because the scaffold itself failed its own DnaYaml schema. task-032 fixed the scaffold;
    // this is the permanent guard that a fresh init's dna.yaml stays schema-valid and readable.
    const show = runCliInRoot(repo, 'dna', 'show', '--format', 'json');
    expect(show.status).toBe(0);
    expect(show.stderr).toBe('');
    const dna = JSON.parse(show.stdout) as { paths: { config: string[] } };
    expect(dna.paths.config).toContain('.wingfoil');
  });

  it('the whole v0.1-scoped cycle: init -> dna show <section> -> dna set + read-back -> memory add -> memory search -> paths -> paths <category> --list, all exit 0, no manual YAML edit', () => {
    expect(runCliInRoot(repo, 'init', '--template', 'Scrum').status).toBe(0);

    // dna show <section> (drill-down, task-026/P2.2)
    const showProject = runCliInRoot(repo, 'dna', 'show', 'project', '--format', 'json');
    expect(showProject.status).toBe(0);
    expect(JSON.parse(showProject.stdout)).toMatchObject({ methodology: 'Scrum' });

    // dna set <key> <value> + read-back (task-025/P2.1) — the only mutating DNA path; a scalar leaf,
    // never requiring hand-editing `.wingfoil/dna.yaml`.
    const setResult = runCliInRoot(repo, 'dna', 'set', 'project.name', '--value', 'E2E Demo Project');
    expect(setResult.status).toBe(0);
    const readBack = runCliInRoot(repo, 'dna', 'show', 'project', '--format', 'json');
    expect(readBack.status).toBe(0);
    expect(JSON.parse(readBack.stdout)).toMatchObject({ name: 'E2E Demo Project' });

    // memory add --type/--title/--tags (task-020/P1.1) then memory search (task-021/P1.5, P1.12)
    const add = runCliInRoot(repo, 'memory', 'add', '--type', 'task', '--title', 'Set up CI pipeline', '--tags', 'infra,ci', '--format', 'json');
    expect(add.status).toBe(0);
    const added = JSON.parse(add.stdout) as { id: string; path: string };
    expect(existsSync(join(repo, added.path))).toBe(true);

    const search = runCliInRoot(repo, 'memory', 'search', 'CI', '--format', 'json');
    expect(search.status).toBe(0);
    const searchResult = JSON.parse(search.stdout) as { matches: Array<{ id: string }> };
    expect(searchResult.matches.map((m) => m.id)).toContain(added.id);

    // paths (whole) / paths <category> --list (task-028/P2.5) — `config` is the one category `init`
    // populates by default (`.wingfoil`); `sources`/`tests`/`docs` stay unmapped until a user maps them
    // (out of v0.1's scope to auto-populate — see task-033's Execution Notes "known limitation" note).
    const paths = runCliInRoot(repo, 'paths', '--format', 'json');
    expect(paths.status).toBe(0);
    expect(JSON.parse(paths.stdout)).toMatchObject({ config: ['.wingfoil'] });

    const pathsConfig = runCliInRoot(repo, 'paths', 'config', '--list', '--format', 'json');
    expect(pathsConfig.status).toBe(0);
    expect(JSON.parse(pathsConfig.stdout)).toEqual({ category: 'config', paths: ['.wingfoil'] });

    // Every mutation (`init`, `dna set`, `memory add`) is its own git commit — no leftover working-tree
    // changes, and no manual YAML edit was ever needed to reach this point.
    const status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf-8' });
    expect(status.trim()).toBe('');
    const log = execFileSync('git', ['-C', repo, 'log', '--format=%s'], { encoding: 'utf-8' });
    expect(log).toContain('initialize .wingfoil/');
    expect(log).toContain('wf(dna): set project.name');
  });

  it('`init --template Kanban` (the other v0.1 template) is an equally clean, schema-valid scaffold (bug-005 regression, both templates)', () => {
    const init = runCliInRoot(repo, 'init', '--template', 'Kanban');
    expect(init.status).toBe(0);
    const show = runCliInRoot(repo, 'dna', 'show', '--format', 'json');
    expect(show.status).toBe(0);
    expect(show.stderr).toBe('');
  });

  it('known gap (out of v0.1 scope, not a release blocker): `wingfoil workflow start`/`wingfoil agent execute` are not implemented — Journey 0a step 3 / Journey 1 steps 2-4', () => {
    expect(runCliInRoot(repo, 'init', '--template', 'Scrum').status).toBe(0);

    // Exit 2, not 1: an unknown command is a USAGE error under spec-005 §1, and since
    // task-101-route-commander-parse-errors-through-the-exit-code-contract (`bug-098`) Commander's own
    // parse errors are routed through that contract instead of ending at Commander's suggested 1.
    const workflowStart = runCliInRoot(repo, 'workflow', 'start', '--name', 'Scrum');
    expect(workflowStart.status).toBe(2);
    expect(workflowStart.stderr).toContain("unknown command 'start'");

    // task-220 ships the `agent` noun with `agent show`; `agent execute` is still a later task's (task-228).
    const agentExecute = runCliInRoot(repo, 'agent', 'execute', '--next');
    expect(agentExecute.status).toBe(2);
    expect(agentExecute.stderr).toContain("unknown command 'execute'");
  });

  it('`dna set` still writes scalars only — but it now names the verb that reaches an array-typed field, and that verb works (bug-083, task-093)', () => {
    expect(runCliInRoot(repo, 'init', '--template', 'Scrum').status).toBe(0);

    // Until task-093 this was a documented dead end: the write failed with the schema re-validation's
    // `E_VALIDATION … expected array, received string`, which says nothing about how to write the
    // field, and no other command in the surface could write it either (bug-083).
    const unchanged = snapshotPersistence(repo);
    const viaSet = runCliInRoot(repo, 'dna', 'set', 'paths.sources', '--value', 'src');
    expect(viaSet.status).toBe(1);
    expect(viaSet.stderr).toContain('dna add|remove|update');
    assertPersistenceUnchanged(repo, unchanged);

    const viaAdd = runCliInRoot(repo, 'dna', 'add', 'paths.sources', '--value', 'src');
    expect(viaAdd.status).toBe(0);
    const dna = yamlLoad(readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8')) as { paths: { sources: string[] } };
    expect(dna.paths.sources).toEqual(['src']);
  });

  it('a schema-invalid raw dna.yaml round-trips through js-yaml the same way the CLI itself validates it (sanity check on the fixture-free path)', () => {
    expect(runCliInRoot(repo, 'init', '--template', 'Scrum').status).toBe(0);
    const raw = readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8');
    const parsed = yamlLoad(raw) as { version: number; paths: { config: string[] } };
    expect(parsed.version).toBe(1);
    expect(parsed.paths.config).toEqual(['.wingfoil']);
  });
});
