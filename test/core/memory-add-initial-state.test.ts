/**
 * `bug-214` (absorbed by task-180) — `memory add` writes the head of the type's machine, not the
 * literal `draft`. `spec-001`: "`sequence[0]` is the state `memory.add` assigns"; `spec-010`'s `status`
 * row states it as the declared rule. The machine is the type's own `states`, else `defaults.states`,
 * else the engine's built-in default (REQ-STATE-08), all read from the committed `memory.yaml`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { splitFrontmatter } from '../../src/storage';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const TEMPLATE = `---
id: ""
type: TYPE
title: ""
status: draft          # auto-set by wingfoil
---

<!-- body -->
`;

const entry = (type: string, states = ''): string => `  ${type}:
    path: "docs/memory/${type}/{id}.md"
    id_pattern: "${type}-{n}-{slug}"
    template:
      file: "memory/templates/${type}.md"
      frontmatter:
        required: [title]
${states}`;

function operation<T = unknown>(name: string): CoreFn<unknown, T> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!op) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return op.fn as CoreFn<unknown, T>;
}

function statusOf(repo: string, path: string): unknown {
  const content = readFileSync(join(repo, path), 'utf-8');
  return (load(splitFrontmatter(content).frontmatter ?? '') as Record<string, unknown>).status;
}

function seed(repo: string, memoryYaml: string, types: readonly string[]): void {
  writeFixtureFile(repo, '.wingfoil/memory.yaml', memoryYaml);
  for (const type of types) writeFixtureFile(repo, `.wingfoil/memory/templates/${type}.md`, TEMPLATE.replace('TYPE', type));
  commitAll(repo, 'seed');
}

describe('memory add writes the head of the type machine (bug-214)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it("a type whose own machine starts at 'new' is created in 'new', and `submit` then moves it", async () => {
    seed(repo, `version: 1\ntypes:\n${entry('bug', '    states:\n      sequence: [ new, done ]\n')}`, ['bug']);
    const added = await operation<{ id: string; path: string }>('memoryAdd')({ root: repo, options: { type: 'bug', title: 'First bug' } });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(statusOf(repo, added.value.path)).toBe('new');
    // The scaffold's inline comment on the status line survives.
    expect(readFileSync(join(repo, added.value.path), 'utf-8')).toContain('status: new          # auto-set by wingfoil');

    const submitted = await operation('memorySubmit')({ root: repo, positional: added.value.id, positionals: [added.value.id] });
    expect(submitted.ok).toBe(true);
    expect(statusOf(repo, added.value.path)).toBe('done');
    expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim()).toBe(`wf(bug): submit ${added.value.id}`);
  });

  it('a type with no machine of its own takes the head of `defaults.states`', async () => {
    seed(repo, `version: 1\ndefaults:\n  states:\n    sequence: [ todo, doing, finished ]\ntypes:\n${entry('note')}`, ['note']);
    const added = await operation<{ id: string; path: string }>('memoryAdd')({ root: repo, options: { type: 'note', title: 'A note' } });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(statusOf(repo, added.value.path)).toBe('todo');
  });

  it("with no machine anywhere, the built-in default's head is 'draft'", async () => {
    seed(repo, `version: 1\ntypes:\n${entry('note')}`, ['note']);
    const added = await operation<{ id: string; path: string }>('memoryAdd')({ root: repo, options: { type: 'note', title: 'A note' } });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(statusOf(repo, added.value.path)).toBe('draft');
  });
});
