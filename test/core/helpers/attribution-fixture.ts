/**
 * task-334 — the fixture of the attribution-trailer suites (`spec-018` §2, §6 T-10…T-17, T-20, T-21): the L0
 * repository of `./l0-fixture.ts` (`buildL0Repo`), plus what `spec-018` §2.1's ungated operations need to succeed on
 * it, committed as a second fixture commit:
 *
 * - `memory.yaml`: the `task` and `plan` types gain an `id_pattern` and a `template` (`memory add --type task`,
 *   `workflow start`), every L0 path and state machine kept;
 * - the main `notes` (one phase `write`, no `approval:`, no evidence) and its open instance `notes-1-plan`: the target
 *   of a `workflow finalize` on a phase without `approval:` (`spec-018` §2.1, §2.3 rule 4);
 * - the main `report` (one phase `note` that `produces: [ README.md ]`, already present) and its open instance
 *   `report-1-plan`, complete at once: the target of `workflow end`; `report` is also what `workflow start` starts;
 * - `task-006-submit-me` at `draft`: the target of `memory submit`.
 *
 * {@link AttributionOptions.agents} picks the committed `team.agents`:
 *
 * - `'two'` (default) — L0's `Claude` (`adapter: claude-code`, `noreply@anthropic.com`) and `Other` (`other@example.com`);
 * - `'none'` — `team.agents: []` (T-17, and T-15's `… declares none`);
 * - `'noMail'` — `Claude`, `Other`, then `NoMail` with neither `email` nor `adapter` (valid: `src/dna/schema.ts` asks an
 *   email only of an entry with an adapter), the signing entry of T-16;
 * - `'unadaptedFirst'` — `Plain` (`plain@example.com`, no adapter) first, then `Claude` and `Other`: a vendor marker
 *   selects `Claude` by its adapter though it is not first (`spec-018` §2.3 rule 3), a blank `WINGFOIL_AGENT` takes
 *   `Plain` (rule 4).
 *
 * Agent emails are on `example.com`, never a reserved domain: `src/dna/schema.ts` refuses those (bug-261), and a
 * committed `dna.yaml` that does not validate refuses every mutating command (`requireTeamMembership`, fail-closed).
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite. Deterministic: fixed text, fixed identity.
 */
import { buildL0Repo, element, MEMBER, TASK_PATH } from './l0-fixture';
import { commitAll, writeFixtureFile } from '../../storage/helpers/git-fixture';

/** Which `team.agents` the committed `dna.yaml` declares (see the module comment). */
export type AgentsVariant = 'two' | 'none' | 'noMail' | 'unadaptedFirst';

export interface AttributionOptions {
  readonly agents?: AgentsVariant;
}

const CLAUDE = `    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer ]
      adapter: claude-code
`;
const OTHER = `    - name: Other
      email: other@example.com
      executes_as: [ developer ]
`;
const NO_MAIL = `    - name: NoMail
      executes_as: [ developer ]
`;
const PLAIN = `    - name: Plain
      email: plain@example.com
      executes_as: [ developer ]
`;

const AGENTS: Readonly<Record<AgentsVariant, string>> = {
  two: `  agents:\n${CLAUDE}${OTHER}`,
  none: '  agents: []\n',
  noMail: `  agents:\n${CLAUDE}${OTHER}${NO_MAIL}`,
  unadaptedFirst: `  agents:\n${PLAIN}${CLAUDE}${OTHER}`,
};

/** L0's `dna.yaml` (`./l0-fixture.ts`) with the `team.agents` of `variant`. */
function dnaYaml(variant: AgentsVariant): string {
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
${AGENTS[variant]}paths:
  sources: [ src/ ]
`;
}

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    id_pattern: "task-{n}-{slug}"
    template:
      frontmatter:
        required: [ title ]
      file: "memory/templates/task.md"
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
    id_pattern: "{workflow}-{n}-plan"
    template:
      frontmatter:
        required: [ title ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const TASK_TEMPLATE = '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\n---\n\n## Description\n';
const PLAN_TEMPLATE = '---\nid: ""\ntype: plan\ntitle: ""\nstatus: draft\nworkflow: ""\nphase: ""\nelement: ""\nparent: ""\n---\n\n## Steps\n';

const NOTES = `name: notes
startable: true
phases:
  - name: write
    role: developer
`;

const REPORT = `name: report
startable: true
phases:
  - name: note
    role: developer
    produces: [ "README.md" ]
`;

function plan(id: string, workflow: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "1"\nelement: ""\nparent: ""\n`);
}

/** The attribution fixture repository, committed, clean. */
export function buildAttributionRepo(options: AttributionOptions = {}): string {
  const variant = options.agents ?? 'two';
  const root = buildL0Repo({ agents: variant !== 'none' });
  writeFixtureFile(
    root,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/adoptable.yaml\n  - workflows/custom/renamed.yaml\n  - workflows/custom/notes.yaml\n  - workflows/custom/report.yaml\n',
  );
  writeFixtureFile(root, '.wingfoil/workflows/custom/notes.yaml', NOTES);
  writeFixtureFile(root, '.wingfoil/workflows/custom/report.yaml', REPORT);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/task.md', TASK_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(variant));
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, TASK_PATH('task-006-submit-me'), element('task', 'task-006-submit-me', 'draft'));
  writeFixtureFile(root, 'docs/plans/notes-1-plan.md', plan('notes-1-plan', 'notes'));
  writeFixtureFile(root, 'docs/plans/report-1-plan.md', plan('report-1-plan', 'report'));
  commitAll(root, 'fixture: the attribution additions');
  return root;
}
