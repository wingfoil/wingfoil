/**
 * task-306 AC 6 (characterization; `spec-017` §4.10, §4.5, §4.3 `record`, §5.1, §7.9) — an optional LAST phase of an
 * included sub-workflow is never skipped: §4.10 skips an optional phase only when a later phase of the same workflow
 * is complete other than vacuously, and the last phase has none. So `release-publishing`'s `merge-forward`
 * (`bug-428`), placed after `mark-released`, is the frontier step once the release is `released`, the including
 * phase is not complete until it is recorded, and the main's next phase waits for it. Its leaf has no state,
 * produces or selection evidence and declares `approval:`, so its evidence is `record`: the approver records it with
 * `workflow finalize` (a patch as the go-ahead of its merge forward, a minor with a `--reason` saying it has nothing
 * to merge forward — the design's reading, no spec amend).
 *
 * The fixture mirrors the real shapes: a sub `publishing-tail` (element `release`) whose two phases are copied from
 * the tail of `.wingfoil/workflows/custom/release-publishing.yaml` — `mark-released` (`element.set_state(released)`,
 * role `tech-lead`) and `merge-forward` as task-306 AC 1 declares it — included by a main `cycle` (element
 * `release`) as `publishing`, the way `release-cycle.yaml` includes `release-publishing`, followed by a non-optional
 * checkpoint `health`, as `release-health` follows `publishing`. Repository, identities and `asApprover` as
 * `test/core/workflow-finalize.test.ts` builds them. Inline YAML: it passes before task-306's green.
 */
import { CORE_MODULES, deduceWorkflowStateAtHead } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

/** `WingFoil Test` (the fixture's `user.*`) holds no `approver` role; Morgan does. */
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
      roles: [ developer, tech-lead ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, approver ]
  roles:
    - name: developer
    - name: tech-lead
    - name: reviewer
    - name: approver
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
global: []
`;

/** The tail of release-publishing.yaml: `mark-released`, then task-306's `merge-forward` (AC 1's shape). */
const PUBLISHING_TAIL = `name: publishing-tail
kind: sub
element: release
phases:
  - name: mark-released
    description: "Mark the release element released."
    role: tech-lead
    actions:
      - element.set_state(released)
  - name: merge-forward
    description: >-
      A patch only: its release/X.Y merged forward into main with --no-ff after the tag and mark-released.
      A minor records the phase with workflow finalize and a --reason saying it has nothing to merge forward.
    role: tech-lead
    optional: true
    actions:
      - 'git.merge(from: integration_branch, ff: false)'
      - agent.execute
    approval: { by_role: approver }
`;

/** The including main: `publishing` as release-cycle includes release-publishing, then a non-optional checkpoint. */
const CYCLE = `name: cycle
kind: main
element: release
phases:
  - name: publishing
    include: publishing-tail
  - name: health
    role: tech-lead
    actions:
      - agent.execute
`;

const BINDINGS_YAML = `version: 1.0
actions:
  git.merge: { manual: true }
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/cycle.yaml': CYCLE,
  'workflows/custom/publishing-tail.yaml': PUBLISHING_TAIL,
};

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The configuration, the release at `status`, and one open `cycle` instance on it, committed. */
function buildRepo(status: string): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(WORKFLOWS).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  writeFixtureFile(root, 'docs/releases/rel-1.md', element('release', 'rel-1', status));
  commitAll(root, 'fixture configuration and the release');
  writeFixtureFile(root, 'docs/plans/plan-cycle.md', element('plan', 'plan-cycle', 'active', 'workflow: "cycle"\nphase: "x"\nelement: "rel-1"\n'));
  commitAll(root, 'wf(plan): add plan-cycle');
  return root;
}

const MARK_RELEASED = 'publishing-tail.mark-released@release:rel-1';
const MERGE_FORWARD = 'publishing-tail.merge-forward@release:rel-1';
const HEALTH = 'cycle.health@release:rel-1';

function instance(root: string) {
  const found = deduceWorkflowStateAtHead(root).instances.find((entry) => entry.instance.id === 'plan-cycle');
  if (found === undefined) throw new Error('plan-cycle is not an open instance at HEAD');
  return found;
}

interface FinalizeOutput {
  readonly finalized: { readonly key: string };
  readonly next: { readonly key: string } | null;
  readonly commit: string;
}

const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowFinalize'];

async function finalize(root: string, options: Record<string, string> = {}): Promise<CoreResult<FinalizeOutput>> {
  if (op === undefined) throw new Error('no workflowFinalize operation in CORE_MODULES');
  return (await op.fn({ root, positional: 'plan-cycle', options })) as CoreResult<FinalizeOutput>;
}

/** Run `fn` with `GIT_AUTHOR_*` naming Morgan, the approver, and restore the environment after. */
async function asApprover<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { name: process.env.GIT_AUTHOR_NAME, email: process.env.GIT_AUTHOR_EMAIL };
  process.env.GIT_AUTHOR_NAME = 'Morgan';
  process.env.GIT_AUTHOR_EMAIL = 'morgan@example.invalid';
  try {
    return await fn();
  } finally {
    if (saved.name === undefined) delete process.env.GIT_AUTHOR_NAME;
    else process.env.GIT_AUTHOR_NAME = saved.name;
    if (saved.email === undefined) delete process.env.GIT_AUTHOR_EMAIL;
    else process.env.GIT_AUTHOR_EMAIL = saved.email;
  }
}

describe('task-306 AC 6 — an optional last phase is never skipped (spec-017 §4.10); it is recorded by workflow finalize', () => {
  let root: string;
  afterEach(() => removeTempDir(root));

  it('the fixture loads with no error', () => {
    root = buildRepo('releasing');
    const deduction = deduceWorkflowStateAtHead(root);
    const errors = deduction.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('a releasing release: the frontier is mark-released', () => {
    root = buildRepo('releasing');
    expect(instance(root).frontier.map((step) => step.key)).toEqual([MARK_RELEASED]);
  });

  it('a released release: the one frontier step is merge-forward, optional, finalizable by its record; publishing is current, not complete', () => {
    root = buildRepo('released');
    const entry = instance(root);
    expect(entry.frontier.map((step) => step.key)).toEqual([MERGE_FORWARD]);
    const step = entry.frontier[0]!;
    expect(step.optional).toBe(true);
    expect(step.evidence.missing).toEqual(['record']);
    expect(step.evidence.finalizable).toBe(true);
    expect(entry.complete).toBe(false);
    expect(entry.phases.map((phase) => [phase.phase, phase.state])).toEqual([
      ['publishing', 'current'],
      ['health', 'pending'],
    ]);
  });

  it('finalize without the approver identity is refused by the authority check, nothing written', async () => {
    root = buildRepo('released');
    const before = git(root, ['rev-parse', 'HEAD']).trim();
    const result = await finalize(root, { reason: 'Nothing to merge forward: a minor.' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/not authorized to approve/);
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });

  it("the approver's finalize with a --reason writes the record with Approver:; then the frontier is health", async () => {
    root = buildRepo('released');
    const result = await asApprover(() => finalize(root, { reason: 'Nothing to merge forward: a minor, its integration branch is main.' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.finalized.key).toBe(MERGE_FORWARD);
    const message = git(root, ['log', '-1', '--format=%B']).trim();
    expect(message.split('\n')[0]).toBe(`workflow: finalize plan-cycle ${MERGE_FORWARD}`);
    expect(message).toContain('\nApprover: Morgan <morgan@example.invalid> (approver)\n');
    expect(message).toContain('Reason: Nothing to merge forward: a minor, its integration branch is main.');
    expect(message).toContain('WingFoil-Phase: publishing-tail.merge-forward completed');
    expect(result.value.next?.key).toBe(HEALTH);
    const entry = instance(root);
    expect(entry.frontier.map((step) => step.key)).toEqual([HEALTH]);
    expect(entry.phases.map((phase) => [phase.phase, phase.state])).toEqual([
      ['publishing', 'complete'],
      ['health', 'current'],
    ]);
  });
});
