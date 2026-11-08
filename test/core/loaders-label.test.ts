/**
 * task-354 AC3 (`bug-317`; `spec-012` §2 `ContextRequest.label`, `spec-008` §6 the unknown-field row) — the
 * readers at a revision take an optional last `label`, the name their warnings and parse errors give the
 * source: `<label>:<path>`. Absent, the label is the revision as passed (`<rev>:<path>`), as today.
 *
 * What is asserted, on a committed fixture whose `dna.yaml`, `memory.yaml`, `roles.yaml`, `workflows.yaml` and
 * one workflow file each carry one unknown top-level key, and whose second commit holds a directive that does
 * not parse:
 * - `loadDnaYamlAtRev`, `loadMemoryYamlAtRev`, `loadRolesYamlAtRev` and their `…AtCommit` forms, given
 *   `'HEAD'`, raise `HEAD:<path>: unknown field(s) ignored: <key>`; without it, `<sha>:<path>: …`
 *   (characterization of the default);
 * - `loadWorkflowsYamlAtRev(root, sha, new Map(), 'HEAD')` and `loadWorkflowsYamlAtCommit(…, 'HEAD')` label the
 *   manifest's and the workflow file's unknown-field warnings `HEAD:`; `loadWorkflowRegistryAtRev(root, sha,
 *   undefined, 'HEAD')` and `loadWorkflowRegistryAtCommit(root, sha, undefined, undefined, 'HEAD')` label those
 *   and the fallback `memory.yaml` / `dna.yaml` loads' warnings `HEAD:`;
 * - `loadDirectivesAtRev(root, sha, 'HEAD')` and `loadDirectivesAtCommit(…, 'HEAD')` throw a `ValidationError`
 *   naming `HEAD:.wingfoil/directives/custom/broken.md`, not the sha;
 * - `assembleExecutionContext(root, { role, element, stateRef: sha, label: 'HEAD' })` raises the `HEAD:` warning
 *   for each pillar it loads, and its payload never carries the label (it records the full sha);
 * - the label is the caller's, never a git argument: a label naming no commit reads the same commit.
 *
 * Deterministic: fixed fixture bytes, the warnings collected in order through `withWarningSink`.
 */
import * as core from '../../src/core';
import {
  loadDirectivesAtCommit,
  loadDirectivesAtRev,
  loadDnaYamlAtCommit,
  loadDnaYamlAtRev,
  loadMemoryYamlAtCommit,
  loadMemoryYamlAtRev,
  loadRolesYamlAtCommit,
  loadRolesYamlAtRev,
  loadWorkflowsYamlAtCommit,
  loadWorkflowsYamlAtRev,
} from '../../src/core/loaders';
import { loadWorkflowRegistryAtCommit, loadWorkflowRegistryAtRev } from '../../src/core/workflow-registry';
import { ValidationError, withWarningSink } from '../../src/validation';
import { DNA_YAML, MEMORY_YAML, ROLES_YAML, seed, TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { commitAll, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const WORKFLOWS_YAML = 'version: 1.0\nenigma: 4\ninclude:\n  - workflows/custom/only.yaml\n';
const ONLY_WORKFLOW = 'name: only\nkind: main\nversion: 1.0\nriddle: 5\nphases:\n  - name: only-phase\n    role: developer\n    actions:\n      - agent.execute\n';

const DNA = '.wingfoil/dna.yaml: unknown field(s) ignored: mystery';
const MEMORY = '.wingfoil/memory.yaml: unknown field(s) ignored: arcane';
const ROLES = '.wingfoil/roles.yaml: unknown field(s) ignored: cipher';
const MANIFEST = '.wingfoil/workflows.yaml: unknown field(s) ignored: enigma';
const WORKFLOW = '.wingfoil/workflows/custom/only.yaml: unknown field(s) ignored: riddle';

/** The warnings `run` raises, in order. */
function warningsOf(run: () => unknown): string[] {
  const seen: string[] = [];
  withWarningSink((text) => seen.push(text), run);
  return seen;
}

/** The error `run` throws (`undefined` when it returns). */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('task-354 AC3 — the readers at a revision take an optional label naming the source (bug-317)', () => {
  let repo: string;
  let sha: string;
  let broken: string;

  beforeAll(() => {
    repo = seed((root) => {
      writeFixtureFile(root, '.wingfoil/dna.yaml', `${DNA_YAML}mystery: 1\n`);
      writeFixtureFile(root, '.wingfoil/memory.yaml', `${MEMORY_YAML}arcane: 2\n`);
      writeFixtureFile(root, '.wingfoil/roles.yaml', `${ROLES_YAML}cipher: 3\n`);
      writeFixtureFile(root, '.wingfoil/workflows.yaml', WORKFLOWS_YAML);
      writeFixtureFile(root, '.wingfoil/workflows/custom/only.yaml', ONLY_WORKFLOW);
    });
    sha = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, '.wingfoil/directives/custom/broken.md', '---\nid: broken\n: : not yaml\n---\n');
    commitAll(repo, 'a directive that does not parse');
    broken = git(repo, ['rev-parse', 'HEAD']).trim();
  });

  afterAll(() => removeTempDir(repo));

  describe('dna.yaml, memory.yaml and roles.yaml: the unknown-field warning carries the label', () => {
    it('loadDnaYamlAtRev(root, sha, "HEAD") and loadDnaYamlAtCommit(root, sha, "HEAD") say HEAD:', () => {
      expect(warningsOf(() => loadDnaYamlAtRev(repo, sha, 'HEAD'))).toEqual([`HEAD:${DNA}`]);
      expect(warningsOf(() => loadDnaYamlAtCommit(repo, sha, 'HEAD'))).toEqual([`HEAD:${DNA}`]);
    });

    it('loadMemoryYamlAtRev(root, sha, "HEAD") and loadMemoryYamlAtCommit(root, sha, "HEAD") say HEAD:', () => {
      expect(warningsOf(() => loadMemoryYamlAtRev(repo, sha, 'HEAD'))).toEqual([`HEAD:${MEMORY}`]);
      expect(warningsOf(() => loadMemoryYamlAtCommit(repo, sha, 'HEAD'))).toEqual([`HEAD:${MEMORY}`]);
    });

    it('loadRolesYamlAtRev(root, sha, "HEAD") and loadRolesYamlAtCommit(root, sha, "HEAD") say HEAD:', () => {
      expect(warningsOf(() => loadRolesYamlAtRev(repo, sha, 'HEAD'))).toEqual([`HEAD:${ROLES}`]);
      expect(warningsOf(() => loadRolesYamlAtCommit(repo, sha, 'HEAD'))).toEqual([`HEAD:${ROLES}`]);
    });

    it('without a label the source is the revision as passed: <sha>:<path> (characterization of the default)', () => {
      expect(warningsOf(() => loadDnaYamlAtRev(repo, sha))).toEqual([`${sha}:${DNA}`]);
      expect(warningsOf(() => loadMemoryYamlAtCommit(repo, sha))).toEqual([`${sha}:${MEMORY}`]);
      expect(warningsOf(() => loadRolesYamlAtRev(repo, sha))).toEqual([`${sha}:${ROLES}`]);
    });

    it('the label names the source only, never the commit read: a label naming no commit reads the same commit', () => {
      expect(warningsOf(() => expect(loadDnaYamlAtRev(repo, sha, 'not-a-commit')?.project?.name).toBe('Fixture'))).toEqual([
        `not-a-commit:${DNA}`,
      ]);
    });
  });

  describe('the workflow pillar: the manifest, a workflow file and the registry fallbacks carry the label', () => {
    it('loadWorkflowsYamlAtRev(root, sha, new Map(), "HEAD") and …AtCommit say HEAD: for the manifest and the file', () => {
      expect(warningsOf(() => loadWorkflowsYamlAtRev(repo, sha, new Map(), 'HEAD'))).toEqual([`HEAD:${MANIFEST}`, `HEAD:${WORKFLOW}`]);
      expect(warningsOf(() => loadWorkflowsYamlAtCommit(repo, sha, new Map(), 'HEAD'))).toEqual([`HEAD:${MANIFEST}`, `HEAD:${WORKFLOW}`]);
    });

    it('loadWorkflowRegistryAtRev(root, sha, undefined, "HEAD") labels every warning HEAD:, the memory.yaml and dna.yaml fallbacks included', () => {
      const warnings = warningsOf(() => loadWorkflowRegistryAtRev(repo, sha, undefined, 'HEAD'));
      expect([...new Set(warnings)].sort()).toEqual([`HEAD:${DNA}`, `HEAD:${MEMORY}`, `HEAD:${MANIFEST}`, `HEAD:${WORKFLOW}`].sort());
    });

    it('loadWorkflowRegistryAtCommit(root, sha, undefined, undefined, "HEAD") labels every warning HEAD:', () => {
      const warnings = warningsOf(() => loadWorkflowRegistryAtCommit(repo, sha, undefined, undefined, 'HEAD'));
      expect([...new Set(warnings)].sort()).toEqual([`HEAD:${DNA}`, `HEAD:${MEMORY}`, `HEAD:${MANIFEST}`, `HEAD:${WORKFLOW}`].sort());
    });
  });

  describe('the directives: a parse error names the labelled source', () => {
    it('loadDirectivesAtRev(root, sha, "HEAD") throws a ValidationError naming HEAD:<path>, not the sha', () => {
      const error = thrownBy(() => loadDirectivesAtRev(repo, broken, 'HEAD'));
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toContain('(HEAD:.wingfoil/directives/custom/broken.md)');
      expect((error as Error).message).not.toContain(broken);
    });

    it('loadDirectivesAtCommit(root, sha, "HEAD") throws the same', () => {
      const error = thrownBy(() => loadDirectivesAtCommit(repo, broken, 'HEAD'));
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toContain('(HEAD:.wingfoil/directives/custom/broken.md)');
    });

    it('without a label the parse error names <sha>:<path> (characterization of the default)', () => {
      const error = thrownBy(() => loadDirectivesAtRev(repo, broken));
      expect((error as Error).message).toContain(`(${broken}:.wingfoil/directives/custom/broken.md)`);
    });
  });

  describe('assembleExecutionContext: ContextRequest.label (spec-012 §2)', () => {
    it('stateRef: sha, label: "HEAD" → every pillar warning says HEAD:, and the payload records the sha, not the label', () => {
      let assembled: ReturnType<typeof core.assembleExecutionContext> | undefined;
      const warnings = warningsOf(() => {
        assembled = core.assembleExecutionContext(repo, { role: 'developer', element: { type: 'task', id: TASK_ID }, stateRef: sha, label: 'HEAD' });
      });
      expect(warnings.filter((text) => text.includes(sha))).toEqual([]);
      expect(warnings).toEqual(expect.arrayContaining([`HEAD:${DNA}`, `HEAD:${MEMORY}`, `HEAD:${ROLES}`]));
      expect(assembled?.ok).toBe(true);
      expect(JSON.stringify(assembled)).toContain(sha);
      expect(JSON.stringify(assembled)).not.toContain('"label"');
    });

    it('without a label the warnings name the stateRef as given (characterization of the default)', () => {
      const warnings = warningsOf(() => core.assembleExecutionContext(repo, { role: 'developer', element: { type: 'task', id: TASK_ID }, stateRef: sha }));
      expect(warnings).toEqual(expect.arrayContaining([`${sha}:${DNA}`, `${sha}:${MEMORY}`, `${sha}:${ROLES}`]));
    });
  });
});
