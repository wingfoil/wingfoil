/**
 * The task-218 `agent execute` fixture: a project the fake adapter (task-200) can be selected in, with
 * two agents (one with an adapter, one without), a `task` and a `bug` element sharing a tag (so no
 * context carries the "no relevant Memory" note), both templates, and a `.mcp.json` naming a `wingfoil`
 * server that cannot start (`spec-016` §2.5: it must not be read). Shared by the CLI and in-process suites.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { commitAll, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

export const REPO_ROOT = join(__dirname, '..', '..', '..');
export const AGENTS_FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'agents');
export const FAKE_SCRIPT_REL = 'test/fixtures/agents/fake-agent.cjs';

export const TASK_ID = 'task-202-explicit-override';
export const BUG_ID = 'bug-007-handoff-fallback';
export const TASK_REF = `task:${TASK_ID}`;

export const DNA_YAML = `version: 1
project:
  name: Fixture
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
      email: wf-test@example.com
      roles: [ approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: qa
    - name: approver
  agents:
    - name: Fake Agent
      email: fake-agent@example.com
      executes_as: [ developer, reviewer, approver ]
      approval_authority: false
      adapter: fake
    - name: Plain Agent
      email: plain-agent@example.com
      executes_as: [ developer ]
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;

export const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [ title ]
  bug:
    path: "docs/04_memory/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    template:
      file: "memory/templates/bug.md"
      frontmatter:
        required: [ title ]
`;

export const ROLES_YAML = `version: 1.0
assignments:
  developer:
    - testing
  reviewer:
    - code-review
global:
  - doc-versioning
`;

export const TASK_TEMPLATE = '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\n---\n\n## Description\n\n## Execution Notes\n';
export const BUG_TEMPLATE = '---\nid: ""\ntype: bug\ntitle: ""\nstatus: draft\n---\n\n## Summary\n\n## Triage & Execution Notes\n';

export function directiveMd(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nRule body of ${id}.\n`;
}

export function elementMd(type: string, id: string, body: string): string {
  // A shared tag makes the elements relevant to each other (spec-012 §6), so no context has the
  // "no relevant Memory" note and the warnings a test expects are only its own.
  return ['---', `id: ${id}`, `type: ${type}`, `title: "${id}"`, 'release: "v0.1"', 'status: draft', 'tags: [ context ]', '---', '', body, ''].join('\n');
}

/** A manifest derived from the fake's: `fake.yaml` with its `name` and, optionally, other lines replaced. */
export function manifest(name: string, edit: (text: string) => string = (text) => text): string {
  const fake = readFileSync(join(AGENTS_FIXTURES, 'custom', 'fake.yaml'), 'utf-8');
  return edit(fake.replace(/^name: fake$/m, `name: ${name}`));
}

/** A project the fake adapter can be selected in; `tweak` edits the tree before the one commit. */
export function seed(tweak: (repo: string) => void = () => undefined): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(repo, '.wingfoil/memory/templates/task.md', TASK_TEMPLATE);
  writeFixtureFile(repo, '.wingfoil/memory/templates/bug.md', BUG_TEMPLATE);
  for (const id of ['testing', 'code-review', 'doc-versioning']) {
    writeFixtureFile(repo, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  }
  for (const name of ['fake', 'fake-terminal']) {
    writeFixtureFile(repo, `.wingfoil/agents/custom/${name}.yaml`, readFileSync(join(AGENTS_FIXTURES, 'custom', `${name}.yaml`), 'utf-8'));
  }
  writeFixtureFile(repo, `docs/04_memory/v0.1/${TASK_ID}.md`, elementMd('task', TASK_ID, '## Description\n\nOverride the next step.'));
  writeFixtureFile(repo, `docs/04_memory/bugs/${BUG_ID}.md`, elementMd('bug', BUG_ID, '## Summary\n\nA bug.'));
  writeFixtureFile(repo, 'docs/04_memory/v0.1/task-203-sibling.md', elementMd('task', 'task-203-sibling', '## Description\n\nA sibling.'));
  // The project's own registration (dl-026), naming a `wingfoil` server that cannot start: §2.5.
  writeFixtureFile(repo, '.mcp.json', '{"mcpServers": {"wingfoil": {"command": "wingfoil-no-such-server", "args": ["mcp"]}}}\n');
  mkdirSync(join(repo, dirname(FAKE_SCRIPT_REL)), { recursive: true });
  copyFileSync(join(AGENTS_FIXTURES, 'fake-agent.cjs'), join(repo, FAKE_SCRIPT_REL));
  tweak(repo);
  commitAll(repo, 'seed task-218 agent execute fixture');
  return repo;
}
