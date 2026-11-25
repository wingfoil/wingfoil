/**
 * task-374 (`bug-487`, `bug-341`; `spec-017` §5.1, §7.4 as amended at the design gate) — the scratch project of the
 * design's AC 1 reproduction, written verbatim: one marked `sw-life-cycle` instance whose `delivery` phase iterates
 * the release lines, each `release-line-cycle` iterating its releases through `sprint`, so that the frontier holds
 * `release-1`'s `sprint-planning`, `release-2`'s `sprint-review` and `rl-2`'s `approve` at once.
 *
 * The suites that share it: `test/core/workflow-status-held.test.ts`, `test/cli/workflow-status-full.integration.test.ts`
 * and `test/mcp/workflow-state-resources.test.ts`.
 *
 * Three commits: the configuration; the instance plan `sw-life-cycle-1-plan`, its add commit carrying the start
 * marker `WingFoil-Start: sw-life-cycle` in its final trailer paragraph (`spec-017` §3.1), so the pre-marker rule
 * keeps nothing and no `W_INSTANCE_PRE_MARKER` enters the diagnostics; then the Memory, written by hand, with no
 * `workflow finalize` record. Besides the design's `bug-1-crash` (`release: "release-1"`, the element of an open
 * iteration: held), the fixture adds `bug-2-other` (`release: "release-9"`, an element that does not exist: never
 * held). The `version` variant gives `release-1` a `version: "v0.1"` and `bug-1-crash` a `release: "v0.1"`, held
 * through the scoping element's `version` field.
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite.
 */
import { commitAll, git, writeFixtureFile } from '../../storage/helpers/git-fixture';

/** The one instance the fixture opens. */
export const HELD_INSTANCE = 'sw-life-cycle-1-plan';

/** The one team member: every role, so every approval and every ungated element is routed to them. */
export const HELD_MEMBER = { name: 'WingFoil Test', email: 'wf-test@example.invalid' } as const;

/** The routed-member text a console line names (`spec-017` §5.3). */
export const HELD_ROUTED = `${HELD_MEMBER.name} <${HELD_MEMBER.email}>`;

const MEMORY_YAML = `version: 1.0
types:
  release-line:
    path: "docs/planning/{id}.md"
    states:
      sequence: [ draft, planning, active, done ]
      gates:
        planning: { reject: draft }
  release:
    path: "docs/planning/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
      gates:
        planning:  { reject: draft }
        releasing: { reject: in-development }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, planned, in-progress, resolved, closed ]
      gates:
        open:    { reject: closed }
        triaged: { reject: closed }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
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
    - name: ${HELD_MEMBER.name}
      email: ${HELD_MEMBER.email}
      roles: [ approver, product-owner, tech-lead, developer, reviewer ]
  roles:
    - name: approver
    - name: product-owner
    - name: tech-lead
    - name: developer
    - name: reviewer
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
global: []
`;

/** The main: two produced documents, the release lines iterated through `release-line-cycle`, a closing phase. */
const SW_LIFE_CYCLE = `name: sw-life-cycle
startable: true
phases:
  - name: inception
    role: product-owner
    produces: [ docs/vision.md ]
  - name: specification
    role: product-owner
    produces: [ docs/stories.md ]
  - name: delivery
    include: release-line-cycle
    iterate_over: release-line
    where: { status: [ planning, active ] }
  - name: sunset
    role: product-owner
    produces: [ docs/sunset.md ]
`;

/** One release line: its approval, its releases iterated through `sprint`, then closed. */
const RELEASE_LINE_CYCLE = `name: release-line-cycle
includable: true
element: release-line
phases:
  - name: approve
    role: tech-lead
    actions:
      - memory.approve
    approval: { by_role: approver }
  - name: releases
    include: sprint
    iterate_over: release
    where: { release-line: "{release-line.id}", status: [ planning, in-development ] }
  - name: close
    role: tech-lead
    actions:
      - element.set_state(done)
`;

/** One release: planning approved, executed to `releasing`, reviewed. */
const SPRINT = `name: sprint
includable: true
element: release
phases:
  - name: sprint-planning
    role: product-owner
    actions:
      - memory.approve
    approval: { by_role: approver }
  - name: sprint-execution
    role: developer
    actions:
      - element.set_state(releasing)
  - name: sprint-review
    role: approver
    actions:
      - memory.approve
    approval: { by_role: approver }
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The fixture's variants: `version` makes `bug-1-crash` name `release-1` through its `version` field. */
export interface HeldUngatedOptions {
  readonly version?: boolean;
}

/** Write and commit the fixture project at `root` (a fresh repository from `makeTempGitRepo`). */
export function writeHeldUngatedProject(root: string, options: HeldUngatedOptions = {}): void {
  const workflows: Record<string, string> = {
    'workflows/custom/sw-life-cycle.yaml': SW_LIFE_CYCLE,
    'workflows/custom/release-line-cycle.yaml': RELEASE_LINE_CYCLE,
    'workflows/custom/sprint.yaml': SPRINT,
  };
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(workflows).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  commitAll(root, 'fixture configuration');

  // The marked start: the add commit's final trailer paragraph names the workflow (spec-017 §3.1).
  writeFixtureFile(root, `docs/plans/${HELD_INSTANCE}.md`, element('plan', HELD_INSTANCE, 'draft', 'workflow: "sw-life-cycle"\nphase: ""\nelement: ""\nparent: ""\n'));
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', `wf(plan): add ${HELD_INSTANCE}`, '-m', 'WingFoil-Start: sw-life-cycle']);

  const version = options.version === true;
  writeFixtureFile(root, 'docs/vision.md', '# Vision\n');
  writeFixtureFile(root, 'docs/stories.md', '# Stories\n');
  writeFixtureFile(root, 'docs/planning/rl-1.md', element('release-line', 'rl-1', 'active'));
  writeFixtureFile(root, 'docs/planning/rl-2.md', element('release-line', 'rl-2', 'planning'));
  writeFixtureFile(root, 'docs/planning/releases/release-1.md', element('release', 'release-1', 'planning', `release-line: "rl-1"\n${version ? 'version: "v0.1"\n' : ''}`));
  writeFixtureFile(root, 'docs/planning/releases/release-2.md', element('release', 'release-2', 'releasing', 'release-line: "rl-1"\n'));
  writeFixtureFile(root, 'docs/bugs/bug-1-crash.md', element('bug', 'bug-1-crash', 'triaged', `release: "${version ? 'v0.1' : 'release-1'}"\n`));
  writeFixtureFile(root, 'docs/bugs/bug-2-other.md', element('bug', 'bug-2-other', 'triaged', 'release: "release-9"\n'));
  commitAll(root, 'seed the Memory by hand');
}
