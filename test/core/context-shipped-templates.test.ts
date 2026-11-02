/**
 * task-318-bind-the-context-golden-payload-to-the-shipped-memory-templates (`bug-266`) — the `spec-012`
 * §7 context payload built from Memory documents that the templates WingFoil ships actually produce.
 *
 * `test/fixtures/context/golden-payload.md` (pinned by `context-payload-format.test.ts`) is the normative
 * example of format 1, built from a context written by hand: it never sees the frontmatter `memory add`
 * writes from a shipped template. This suite closes that gap. In a throwaway git repository it writes the
 * scaffolded `.wingfoil/memory.yaml` and the eight `.wingfoil/memory/templates/<type>.md` exactly as
 * `templateScaffold` generates them for `wingfoil init`, plus fixed pillar files (`dna.yaml`, `roles.yaml`,
 * one directive); it creates one element per type through the REAL registered `memory.memoryAdd`, submits
 * every one but the task once (`spec-012` §6 drops `draft` documents from §4), and assembles the context of
 * the draft task as the `developer` role.
 *
 * A failure means one of these changed: a shipped Memory template, the scaffolded `memory.yaml` (its
 * paths, id patterns or state machines), the rendering of `memory add` / `memory submit`, or the payload
 * serializer. Rewrite `test/fixtures/context/golden-payload-shipped-templates.md` by hand from the received
 * payload the failing `toBe` shows; its diff is reviewed by the approver (`dl-150` (B)). The test has no
 * write path. Only the header's `state:` sha is normalised, after asserting it is the real commit's: every
 * commit `memory add`/`submit` writes carries its author date and the `WingFoil-Version` trailer, so the
 * sha moves with every run.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES } from '../../src/core';
import { assembleExecutionContext } from '../../src/core/context';
import type { CoreFn } from '../../src/core/registry';
import { resolveTemplate, templateScaffold, type ScaffoldFile } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const GOLDEN_PATH = join(__dirname, '..', 'fixtures', 'context', 'golden-payload-shipped-templates.md');

/** The sha the normative golden carries; the received header sha is replaced by it. */
const NORMALISED_SHA = '0123456789abcdef0123456789abcdef01234567';

const TASK_ID = 'task-001-golden-task';

const HEADER = /^<!-- format: 1 \| role: developer \| element: task:task-001-golden-task \| state: ([0-9a-f]{40}) -->$/;

/** The Memory part of a scaffold: the `memory.yaml` and the Memory templates, nothing else. */
function memoryEntries(files: readonly ScaffoldFile[]): ScaffoldFile[] {
  return files.filter((file) => file.path === '.wingfoil/memory.yaml' || file.path.startsWith('.wingfoil/memory/templates/'));
}

function shippedMemoryEntries(template: string): ScaffoldFile[] {
  const definition = resolveTemplate(template);
  if (!definition) throw new Error(`fixture bug: template "${template}" not shipped`);
  return memoryEntries(templateScaffold(definition));
}

/** The `DNA_YAML` shape of `context-payload-format.test.ts`, reduced to one module. */
const DNA_YAML = `version: 1.1
project:
  name: Golden
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
  methodologies:
    - name: TDD
team:
  members:
    - name: Golden User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = 'version: 1.0\nassignments:\n  developer:\n    - testing\nglobal: []\n';

const TESTING_DIRECTIVE = '---\nid: testing\nname: "testing"\ntype: directive\nkind: custom\ntitle: "testing"\n---\n\n# Testing\n\nWrite the test first.\n';

function operation<P, R>(name: 'memoryAdd' | 'memorySubmit'): CoreFn<P, R> {
  const found = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!found) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return found.fn as unknown as CoreFn<P, R>;
}

type AddParams = { root: string; options: Record<string, string | string[]> };

const gitHead = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();

describe('task-318 — the context payload of documents made from the shipped Memory templates (bug-266)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('builds the golden payload from one document per shipped template, byte for byte', async () => {
    for (const file of shippedMemoryEntries('scrum')) writeFixtureFile(repo, file.path, file.content);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', TESTING_DIRECTIVE);
    commitAll(repo, 'seed');

    const add = operation<AddParams, { id: string; path: string }>('memoryAdd');
    const submit = operation<{ root: string; positional: string }, unknown>('memorySubmit');
    const ids = new Map<string, string>();
    for (const type of ['adr', 'bug', 'decision-log', 'release', 'release-line', 'task', 'tech-spec']) {
      const added = await add({ root: repo, options: { type, title: `Golden ${type}` } });
      if (!added.ok) throw new Error(`memory add ${type}: ${added.error.code}: ${added.error.message}`);
      ids.set(type, added.value.id);
    }
    const plan = await add({
      root: repo,
      options: { type: 'plan', title: 'Golden plan', set: ['workflow=sw-life-cycle', 'phase=inception', 'scope=rl-001'] },
    });
    if (!plan.ok) throw new Error(`memory add plan: ${plan.error.code}: ${plan.error.message}`);
    ids.set('plan', plan.value.id);
    expect(ids.get('task')).toBe(TASK_ID);

    for (const type of ['adr', 'bug', 'decision-log', 'plan', 'release', 'release-line', 'tech-spec']) {
      const submitted = await submit({ root: repo, positional: ids.get(type)! });
      if (!submitted.ok) throw new Error(`memory submit ${type}: ${submitted.error.code}: ${submitted.error.message}`);
    }

    const result = assembleExecutionContext(repo, { role: 'developer', element: { type: 'task', id: TASK_ID }, stateRef: 'HEAD' });
    if (!result.ok) throw new Error(`expected a context, got ${result.error.code}: ${result.error.message}`);
    expect(result.value.notes).toEqual([]);
    expect(result.warnings).toBeUndefined();

    const lines = result.value.payload.split('\n');
    const header = HEADER.exec(lines[1]!);
    expect(header).not.toBeNull();
    const head = gitHead(repo);
    expect(header![1]).toBe(head);
    expect(result.value.context.stateRef).toBe(head);

    lines[1] = lines[1]!.replace(head, NORMALISED_SHA);
    expect(lines.join('\n')).toBe(readFileSync(GOLDEN_PATH, 'utf-8'));
  });

  it('the scrum and kanban scaffolds ship the same Memory part, so the golden speaks for both', () => {
    const scrum = shippedMemoryEntries('scrum');
    expect(scrum.map((file) => file.path)).toContain('.wingfoil/memory.yaml');
    expect(shippedMemoryEntries('kanban')).toEqual(scrum);
  });
});
