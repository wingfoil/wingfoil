/**
 * task-374, fix round after the independent review (`spec-017` §5.1, §7.4; `bug-487`, `bug-341`) — the projects of the
 * review's fixtures, built with the repository's git helpers:
 *
 * - {@link writeSelfHeldProject}: one marked main `hotfix` iterating the releases through a `sprint` whose first phase
 *   is a `produces:` step, so `release-1` sits at its `planning` gate on a frontier step that approves nothing. With
 *   `selfField`, `release-1` also carries `release: "release-1"`. `release-2` (`releasing`, outside the iteration's
 *   entry filter) and `rl-2` (`planning`, a type `hotfix` never iterates) scope nothing: three element types are
 *   ungated at once.
 * - {@link writeTwoRunsProject}: two marked mains, `sw-life-cycle` (iterating the release lines, then their releases)
 *   and `hotfix` (iterating the releases), both with `release-1`'s `sprint-planning` on their frontier, so both hold
 *   `bug-1-crash` (`release: "release-1"`); `order` says which of the two starts last.
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite.
 */
import { commitAll, git, writeFixtureFile } from '../../storage/helpers/git-fixture';

/** The one team member: every role, so every ungated element is routed to them. */
export const IDENTITY_MEMBER = { name: 'WingFoil Test', email: 'wf-test@example.invalid' } as const;

/** The routed-member text a console line names (`spec-017` §5.3). */
export const IDENTITY_ROUTED = `${IDENTITY_MEMBER.name} <${IDENTITY_MEMBER.email}>`;

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
    - name: ${IDENTITY_MEMBER.name}
      email: ${IDENTITY_MEMBER.email}
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

const HOTFIX = `name: hotfix
startable: true
phases:
  - name: fix
    include: sprint
    iterate_over: release
    where: { status: [ planning, in-development ] }
`;

/** The sprint's approval phases; with `goalFirst`, a `produces:` phase comes before them. */
function sprint(goalFirst: boolean): string {
  const goal = goalFirst ? `  - name: sprint-goal
    role: product-owner
    produces: [ "docs/goals/{release.id}.md" ]
` : '';
  return `name: sprint
includable: true
element: release
phases:
${goal}  - name: sprint-planning
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
}

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function writeConfiguration(root: string, workflows: Record<string, string>): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(workflows).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  commitAll(root, 'fixture configuration');
}

/** A marked start (`spec-017` §3.1): the plan's add commit carries `WingFoil-Start: <workflow>` as its final paragraph. */
function startMarked(root: string, id: string, workflow: string): void {
  writeFixtureFile(root, `docs/plans/${id}.md`, element('plan', id, 'draft', `workflow: "${workflow}"\nphase: ""\nelement: ""\nparent: ""\n`));
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', `wf(plan): add ${id}`, '-m', `WingFoil-Start: ${workflow}`]);
}

/** The release lines, the releases and the two bugs every variant shares; `release1Extra` adds fields to `release-1`. */
function writeMemory(root: string, release1Extra: string): void {
  writeFixtureFile(root, 'docs/vision.md', '# Vision\n');
  writeFixtureFile(root, 'docs/stories.md', '# Stories\n');
  writeFixtureFile(root, 'docs/planning/rl-1.md', element('release-line', 'rl-1', 'active'));
  writeFixtureFile(root, 'docs/planning/rl-2.md', element('release-line', 'rl-2', 'planning'));
  writeFixtureFile(root, 'docs/planning/releases/release-1.md', element('release', 'release-1', 'planning', `release-line: "rl-1"\n${release1Extra}`));
  writeFixtureFile(root, 'docs/planning/releases/release-2.md', element('release', 'release-2', 'releasing', 'release-line: "rl-1"\n'));
  writeFixtureFile(root, 'docs/bugs/bug-1-crash.md', element('bug', 'bug-1-crash', 'triaged', 'release: "release-1"\n'));
  writeFixtureFile(root, 'docs/bugs/bug-2-other.md', element('bug', 'bug-2-other', 'triaged', 'release: "release-9"\n'));
  commitAll(root, 'seed the Memory by hand');
}

/** The instance {@link writeSelfHeldProject} opens. */
export const SELF_INSTANCE = 'hotfix-1-plan';

/** Write and commit the self-held project at `root` (a fresh repository from `makeTempGitRepo`). */
export function writeSelfHeldProject(root: string, options: { readonly selfField: boolean }): void {
  writeConfiguration(root, {
    'workflows/custom/hotfix.yaml': HOTFIX,
    'workflows/custom/sprint.yaml': sprint(true),
  });
  startMarked(root, SELF_INSTANCE, 'hotfix');
  writeMemory(root, options.selfField ? 'release: "release-1"\n' : '');
}

/** The two instances {@link writeTwoRunsProject} opens. */
export const TWO_RUNS = { lifeCycle: 'sw-life-cycle-1-plan', hotfix: 'hotfix-1-plan' } as const;

/** Write and commit the two-runs project at `root`; `startedLast` names the instance started last (the active one, §3.3). */
export function writeTwoRunsProject(root: string, options: { readonly startedLast: 'hotfix' | 'sw-life-cycle' }): void {
  writeConfiguration(root, {
    'workflows/custom/sw-life-cycle.yaml': SW_LIFE_CYCLE,
    'workflows/custom/release-line-cycle.yaml': RELEASE_LINE_CYCLE,
    'workflows/custom/sprint.yaml': sprint(false),
    'workflows/custom/hotfix.yaml': HOTFIX,
  });
  const starts: readonly (readonly [string, string])[] = [
    [TWO_RUNS.lifeCycle, 'sw-life-cycle'],
    [TWO_RUNS.hotfix, 'hotfix'],
  ];
  const ordered = options.startedLast === 'hotfix' ? starts : [...starts].reverse();
  for (const [id, workflow] of ordered) startMarked(root, id, workflow);
  writeMemory(root, '');
}
