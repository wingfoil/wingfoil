/**
 * task-333 — the fixture of the approval-binding L0 suites (`spec-018` §6): a repository whose committed `dna.yaml`
 * makes the git identity (`WingFoil Test <wf-test@example.invalid>`, the fixture's `user.*`) a `team.members` entry
 * holding `approver`, and declares two agents, `Claude` (`adapter: claude-code`, `email: noreply@anthropic.com`) and
 * `Other` (`email: other@example.com`), or none ({@link L0Options.agents} `false`, T-7's `team.agents: []`).
 *
 * `Other`'s address is `example.com`, not the design's `other@example.invalid`: `src/dna/schema.ts` refuses an agent
 * email on a reserved top-level domain (`ATTRIBUTION_EMAIL_MESSAGES['reserved-domain']`, bug-261), and a committed
 * `dna.yaml` that does not validate refuses every approval for another reason.
 *
 * It holds one target per approver-gated command of `spec-018` §3.1, each in the state its command needs, and one
 * per ungated verb that takes a `--reason` (§3.3's accepted cases):
 *
 * - tasks: `task-001-approve-me` and `task-002-reject-me` at `pending`, `task-003-amend-me` at `backlog` (amendable;
 *   {@link prepareAmend} leaves the uncommitted edit `memory amend` records), `task-004-deprecate-me` at `draft`,
 *   `task-005-park-me` at `in-progress` (the `returns` edge `memory park` takes);
 * - `workflow finalize` on an `approval:` phase: the main `release-cycle` whose first phase `go` declares
 *   `approval: { by_role: approver }`, and its open instance `rc-1` on `release:minor-1` (the shape of
 *   `test/cli/workflow-finalize.integration.test.ts`);
 * - `workflow adopt --plan --apply`: the main `adoptable` whose first phase adds an adr, its open instance
 *   `adoptable-1-plan`, and `adr-001-adopt-me` committed with no step linkage (`test/cli/dry-run.integration.test.ts`);
 * - `workflow rekey`: the main `renamed` whose phase `new-name` was `old-name`, its open instance `renamed-1-plan`,
 *   and a phase record of `renamed.old-name` written by hand (the same file's shape).
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite. Deterministic: fixed text, fixed identity.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

export const MEMBER = { name: 'WingFoil Test', email: 'wf-test@example.invalid' } as const;
export const STRANGER = { name: 'Sam Stranger', email: 'stranger@example.invalid' } as const;

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    amendable: true
    states:
      sequence: [ draft, pending, backlog, in-progress, done ]
      gates:
        pending: { reject: draft }
      returns: { in-progress: backlog }
  adr:
    path: "docs/adrs/{id}.md"
    states:
      sequence: [ draft, pending, accepted ]
      gates:
        pending: { reject: draft }
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const AGENTS = `  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer ]
      adapter: claude-code
    - name: Other
      email: other@example.com
      executes_as: [ developer ]
`;

function dnaYaml(agents: boolean): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${MEMBER.name}
      email: ${MEMBER.email}
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
${agents ? AGENTS : '  agents: []\n'}paths:
  sources: [ src/ ]
`;
}

const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
phases:
  - name: go
    role: developer
    approval: { by_role: approver }
  - name: ship
    role: developer
`;

const ADOPTABLE = `name: adoptable
startable: true
phases:
  - name: seed
    role: approver
    actions:
      - 'memory.add(type: adr)'
  - name: close
    role: approver
`;

const RENAMED = `name: renamed
startable: true
phases:
  - name: new-name
    role: approver
  - name: close
    role: approver
`;

/** A Memory document. */
export function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n\nThe scope.\n`;
}

function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "1"\nelement: "${elementId}"\nparent: ""\n`);
}

export const TASK_PATH = (id: string): string => `docs/tasks/${id}.md`;

export interface L0Options {
  /** Whether `dna.yaml` declares the two agents (default) or `team.agents: []` (T-7). */
  readonly agents?: boolean;
}

/** The fixture repository, committed, clean. */
export function buildL0Repo(options: L0Options = {}): string {
  const root = makeTempGitRepo();
  writeFixtureFile(
    root,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/adoptable.yaml\n  - workflows/custom/renamed.yaml\n',
  );
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/adoptable.yaml', ADOPTABLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/renamed.yaml', RENAMED);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(options.agents ?? true));
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  writeFixtureFile(root, TASK_PATH('task-001-approve-me'), element('task', 'task-001-approve-me', 'pending'));
  writeFixtureFile(root, TASK_PATH('task-002-reject-me'), element('task', 'task-002-reject-me', 'pending'));
  writeFixtureFile(root, TASK_PATH('task-003-amend-me'), element('task', 'task-003-amend-me', 'backlog'));
  writeFixtureFile(root, TASK_PATH('task-004-deprecate-me'), element('task', 'task-004-deprecate-me', 'draft'));
  writeFixtureFile(root, TASK_PATH('task-005-park-me'), element('task', 'task-005-park-me', 'in-progress'));
  writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', 'in-development'));
  writeFixtureFile(root, 'docs/plans/rc-1.md', plan('rc-1', 'release-cycle', 'minor-1'));
  writeFixtureFile(root, 'docs/plans/adoptable-1-plan.md', plan('adoptable-1-plan', 'adoptable', ''));
  writeFixtureFile(root, 'docs/plans/renamed-1-plan.md', plan('renamed-1-plan', 'renamed', ''));
  writeFixtureFile(root, 'docs/adrs/adr-001-adopt-me.md', element('adr', 'adr-001-adopt-me', 'draft'));
  commitAll(root, 'fixture: the L0 project');
  git(root, ['commit', '--quiet', '--allow-empty', '-m', 'workflow: finalize renamed-1-plan renamed.old-name', '-m', 'WingFoil-Phase: renamed.old-name completed\nWingFoil-Instance: renamed-1-plan']);
  return root;
}

/** The uncommitted body edit `memory amend task-003-amend-me` records. */
export function prepareAmend(root: string): void {
  const path = join(root, TASK_PATH('task-003-amend-me'));
  writeFileSync(path, `${readFileSync(path, 'utf-8')}\nA corrected scope paragraph.\n`);
}

/** One approver-gated command of `spec-018` §3.1: its `<command>` and an invocation that succeeds outside an agent's session. */
export interface GatedCase {
  readonly command: string;
  readonly args: readonly string[];
  /** An edit the command needs on disk before it runs. */
  readonly prepare?: (root: string) => void;
}

/** The six commands of `spec-018` §3.1 / §6 T-9 on {@link buildL0Repo}, each with `--reason r`. */
export const GATED_CASES: readonly GatedCase[] = [
  { command: 'memory approve', args: ['memory', 'approve', 'task-001-approve-me', '--reason', 'r'] },
  { command: 'memory reject', args: ['memory', 'reject', 'task-002-reject-me', '--reason', 'r'] },
  { command: 'memory amend', args: ['memory', 'amend', 'task-003-amend-me', '--reason', 'r'], prepare: prepareAmend },
  { command: 'workflow finalize', args: ['workflow', 'finalize', 'rc-1', '--reason', 'r'] },
  { command: 'workflow adopt --plan --apply', args: ['workflow', 'adopt', 'adoptable-1-plan', '--plan', '--apply', '--reason', 'r'] },
  { command: 'workflow rekey', args: ['workflow', 'rekey', 'renamed-1-plan', '--from', 'renamed.old-name', '--to', 'renamed.new-name', '--reason', 'r'] },
];

/** `spec-018` §3.2's two lines for `command` and the `, `-joined marker phrases, as the CLI prints them. */
export function agentContextRefusal(command: string, markers: string): { readonly error: string; readonly hint: string } {
  return {
    error: `E_AGENT_CONTEXT: '${command}' needs the approver and does not run in an agent's session (${markers}): an approval is recorded only from the approver's own session, never from an agent's (dl-212)`,
    hint: `run '${command}' yourself, from a terminal no agent started — not through an agent's shell`,
  };
}

/** {@link agentContextRefusal} as the console stderr: `error: …` then `hint: …`, each newline-terminated. */
export function agentContextStderr(command: string, markers: string): string {
  const { error, hint } = agentContextRefusal(command, markers);
  return `error: ${error}\nhint: ${hint}\n`;
}

/** `spec-006` §7's membership refusal (task-333 design gate amendment) for `who`, as `error` and `hint`. */
export function notAMemberRefusal(who: { readonly name: string; readonly email: string }): { readonly error: string; readonly hint: string } {
  return {
    error: `E_NOT_A_MEMBER: the git identity ${who.name} <${who.email}> is not a team member: no team.members entry of the dna.yaml committed at HEAD has the email ${who.email}, and only a member changes this project (dl-220)`,
    hint: `a member adds you with 'wingfoil dna add team.members --value "${who.name}" --entry-email ${who.email} --entry-roles <role>', or run the command as a member's git identity`,
  };
}

/** `spec-018` §3.3's `--reason` refusal on an operation that writes an `Approver:` line (a `UsageError`, exit 2). */
export const APPROVAL_REASON_REFUSAL = 'invalid flag value: --reason must not contain a line starting with "Co-Authored-By:" or "AI-Model:" on an approval';

/** T-18's reason: one paragraph, a `Co-Authored-By:` line inside it, prose after it (no other defect). */
export const CO_AUTHOR_REASON = 'Fine.\nCo-Authored-By: X <x@example.invalid>\nDone.';
