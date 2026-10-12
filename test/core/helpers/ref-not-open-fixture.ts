/**
 * task-281 AC 4 (`bug-326`) — the fixture the `<ref>` suites share (`test/core/workflow-ref-not-open.test.ts`,
 * `test/cli/workflow-ref-not-open.integration.test.ts`): a loaded startable workflow `release-cycle`, NO open
 * instance, a committed instance plan `old-1-plan` of it at `status: done` (no `parent`), an active phase plan
 * `phase-1-plan` (`parent` set: not an instance, `spec-017` §3.1), and a `bug` type for `memory add --workflow`.
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite.
 */
import { commitAll, writeFixtureFile } from '../../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  bug:
    path: "docs/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    template:
      file: "memory/templates/bug.md"
      frontmatter:
        required: [ id, type, title, status ]
    states:
      sequence: [ draft, open, closed ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const BUG_TEMPLATE = `---
id: ""
type: bug
title: ""
status: draft
---

<!-- body -->
`;

const DNA_YAML = `version: 1.0
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
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const MAIN = `name: release-cycle
startable: true
element: release
phases:
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** Write and commit the fixture project at `root`. */
export function writeRefProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', MAIN);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/bug.md', BUG_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', 'released'));
  writeFixtureFile(root, 'docs/plans/old-1-plan.md', element('plan', 'old-1-plan', 'done', 'workflow: "release-cycle"\nphase: "x"\nelement: "minor-1"\nparent: ""\n'));
  writeFixtureFile(
    root,
    'docs/plans/phase-1-plan.md',
    element('plan', 'phase-1-plan', 'active', 'workflow: "release-cycle"\nphase: "ship"\nelement: "minor-1"\nparent: "release-cycle.ship"\n'),
  );
  commitAll(root, 'fixture');
}
