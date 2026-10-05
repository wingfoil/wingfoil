/**
 * The real, production `CORE_MODULES` registry exported from `src/core/index.ts` (task-006,
 * spec-006-core-domain-api). Scope note (see task-006's Execution Notes): today this registry wires
 * in exactly the core functions that already legitimately exist — task-004's read-only per-pillar
 * loaders (`loadDnaYaml`, `loadDirectives`, `loadWorkflowsYaml`) — re-packaged as `mutates: false`
 * `CoreOperation`s. The full memory/dna/directives/workflow domain operations tables in spec-006 §3
 * (`memoryAdd`, `dnaSet`, ...) are feature work for task-018..030 and are deliberately NOT registered
 * here yet; there is intentionally zero mutating operation in production today.
 */
import { enumerateOperations } from '../../src/core/registry';
import { CORE_MODULES, WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

describe('CORE_MODULES — production registry', () => {
  it('registers the currently-existing operations, incl. the mutating ops `dna.dnaAdd`/`dnaRemove`/`dnaUpdate` (task-093), `dna.dnaSet` (task-025), `memory.memoryAdd` (task-020) + `directive.directiveCreate` (task-050)', () => {
    const flat = enumerateOperations(CORE_MODULES).map(
      (entry) => `${entry.module.name}.${entry.operation.name}`,
    );
    expect(flat).toEqual([
      // task-050-directive-create registers a `directive` (SINGULAR) module, because
      // `CoreModule.name` IS the `wingfoil <noun>` segment and both the P3.1 BDD and spec-006 §3's
      // own CLI/MCP columns spell that noun `directive create` — while P3.4's list command keeps the
      // plural `directives list`. See task-050's Execution Notes (design decision D1).
      'directive.directiveAssign',
      'directive.directiveCreate',
      'directive.directiveRemove',
      'directives.directivesList',
      // task-093-dna-mutation-surface-add-remove-update adds the three verbs `dl-081` ratified
      // (option (E)): the collection travels in the verb's `<path>` positional rather than in the verb
      // name (`dl-082-cli-parameter-shape`), so the DNA
      // pillar reaches every collection at three operations instead of a dozen.
      'dna.dnaAdd',
      'dna.dnaRemove',
      'dna.dnaSet',
      'dna.dnaShow',
      'dna.dnaUpdate',
      'memory.memoryAdd',
      // task-127 (`dl-108`): the approver-gated amendment verb.
      'memory.memoryAmend',
      'memory.memoryApprove',
      'memory.memoryDeprecate',
      'memory.memoryHistory',
      'memory.memoryReject',
      'memory.memorySearch',
      'memory.memorySubmit',
      'paths.paths',
      'workflow.workflowList',
    ]);
  });

  it('thirteen operations mutate today — the nine before task-093, `dna.dnaAdd`, `dna.dnaRemove` and `dna.dnaUpdate` (P2.1, dl-081), and `memory.memoryAmend` (task-127, dl-108); the rest are read-only', () => {
    const mutating = enumerateOperations(CORE_MODULES).filter(({ operation }) => operation.mutates);
    expect(mutating.map(({ module, operation }) => `${module.name}.${operation.name}`)).toEqual([
      'directive.directiveAssign',
      'directive.directiveCreate',
      'directive.directiveRemove',
      'dna.dnaAdd',
      'dna.dnaRemove',
      'dna.dnaSet',
      'dna.dnaUpdate',
      'memory.memoryAdd',
      'memory.memoryAmend',
      'memory.memoryApprove',
      'memory.memoryDeprecate',
      'memory.memoryReject',
      'memory.memorySubmit',
    ]);
  });
});

describe('CORE_MODULES operations — wrapped loader behavior', () => {
  const DNA_YAML = `
version: 1.1
modules:
  - name: core
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
  const DIRECTIVE_MD = `---
id: sample
name: "Sample"
type: directive
kind: custom
title: "Sample"
tags: [ custom ]
ref: []
---

# Directive — Sample
`;
  const WORKFLOWS_YAML = `
version: 1.0
include:
  - workflows/custom/main.yaml
`;
  const MAIN_WORKFLOW_YAML = `
name: main
kind: main
version: 1.0
phases:
  - name: only-phase
    role: developer
    actions:
      - agent.execute
`;

  function findOperation(moduleName: string, operationName: string) {
    const found = CORE_MODULES.find((m) => m.name === moduleName)?.operations[operationName];
    if (!found) throw new Error(`fixture bug: ${moduleName}.${operationName} not registered`);
    return found;
  }

  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('dnaShow returns coreOk(DnaYaml) when .wingfoil/dna.yaml is valid', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    const result = await findOperation('dna', 'dnaShow').fn({ root: repo });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { modules: unknown[] }).modules).toHaveLength(1);
    }
  });

  it('dnaShow returns coreErr(NOT_FOUND) when .wingfoil/dna.yaml is missing, naming it repository-relative', async () => {
    // A `.wingfoil/` without the file (task-179, `bug-245`); with no `.wingfoil/` at all the refusal is
    // `WINGFOIL_NOT_INITIALIZED` (`bug-198`, below).
    writeFixtureFile(repo, '.wingfoil/.gitkeep', '');
    const result = await findOperation('dna', 'dnaShow').fn({ root: repo });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toMatch(/^\.wingfoil\/dna\.yaml is missing: /);
      expect(result.error.message).not.toContain(repo);
    }
  });

  it.each([
    ['dna', 'dnaShow'],
    ['paths', 'paths'],
    ['memory', 'memorySearch'],
  ] as const)('%s.%s refuses with WINGFOIL_NOT_INITIALIZED when there is no .wingfoil/ (task-179, bug-198)', async (moduleName, operationName) => {
    const result = await findOperation(moduleName, operationName).fn({ root: repo });
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: WINGFOIL_NOT_INITIALIZED } });
  });

  it('directivesList returns coreOk([...]) for valid directive files', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/sample.md', DIRECTIVE_MD);
    const result = await findOperation('directives', 'directivesList').fn({ root: repo });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // dl-042 (task-055): the payload is `{ entries, warnings }`, no longer a bare array.
      expect((result.value as { entries: unknown[] }).entries).toHaveLength(1);
    }
  });

  it('directivesList returns coreErr(VALIDATION) for a directive file with bad frontmatter', async () => {
    writeFixtureFile(
      repo,
      '.wingfoil/directives/custom/broken.md',
      '---\nid: broken\ntype: not-a-directive\nkind: custom\ntitle: Broken\n---\n',
    );
    const result = await findOperation('directives', 'directivesList').fn({ root: repo });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('workflowList returns coreOk({manifest, workflows}) for a valid workflows pillar', async () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', WORKFLOWS_YAML);
    writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', MAIN_WORKFLOW_YAML);
    const result = await findOperation('workflow', 'workflowList').fn({ root: repo });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { workflows: unknown[] }).workflows).toHaveLength(1);
    }
  });

  it('workflowList returns coreErr(VALIDATION) when an include path is missing (cross-file check)', async () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/missing.yaml\n');
    const result = await findOperation('workflow', 'workflowList').fn({ root: repo });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  // task-028-implement-paths-category (P2.5): `paths` queries the same `.wingfoil/dna.yaml` `paths`
  // node dnaShow reads, filtered to one category — the category rides task-026's generic bare
  // `positional` seam (same field `dnaShowFn`'s section uses). spec-005-cli-command-contract §4's
  // worked example fixes the exact success shape: `{"category":"sources","paths":["src/cli","src/core"]}`.
  it('paths returns coreOk({category, paths}) for a mapped category (spec-005 §4 worked-example shape)', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    const result = await findOperation('paths', 'paths').fn({ root: repo, positional: 'sources' });
    expect(result).toEqual({ ok: true, value: { category: 'sources', paths: ['src/'] } });
  });

  it("paths returns coreErr(NOT_FOUND, \"no paths mapped for category '<category>'\") for an unmapped category (BDD P2.5)", async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    const result = await findOperation('paths', 'paths').fn({ root: repo, positional: 'governance' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: "no paths mapped for category 'governance'" },
    });
  });

  it('paths returns coreOk(<whole paths node>) when no category (positional) is given — symmetric with dna show, and the MCP mechanical zero-arg Resource case', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    const result = await findOperation('paths', 'paths').fn({ root: repo });
    expect(result).toEqual({ ok: true, value: { sources: ['src/'] } });
  });

  it('paths returns coreErr(NOT_FOUND) when .wingfoil/dna.yaml is missing, same as dnaShow', async () => {
    writeFixtureFile(repo, '.wingfoil/.gitkeep', '');
    const result = await findOperation('paths', 'paths').fn({ root: repo, positional: 'sources' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
