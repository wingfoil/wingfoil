/**
 * task-340 AC 1 (red-first) — human-only roles (`dl-202` item 1; `spec-002` § "Role binding", "Human-only roles",
 * and the `RoleEntry` Zod listing; BDD `p2-dna/P2.4-project-dna-config.feature`, the two human-only scenarios;
 * approver ruling D1 (A): `approver` is human-only without a declaration).
 *
 * - A `team.roles` entry may declare `human_only: true`; the key is kept and loads with no unknown-field warning.
 * - A `team.agents[].executes_as` naming a human-only role is a load error at `team.agents[<i>].executes_as[<k>]`,
 *   naming the entry and the role; `approver` counts as human-only with no key at all.
 * - `human_only: false` on `approver` is a load error at `team.roles[<j>].human_only`.
 * - One predicate answers the question: `isHumanOnlyRole(dna, role)` (`src/dna/roles.ts`, re-exported by the
 *   `src/dna` barrel) on top of `isHumanOnlyRoleEntry(entry)` (`src/dna/schema.ts`).
 *
 * The messages are `spec-002`'s (amended at the design gate, `b818cb9c9`); the CLI line's shape is the one the
 * design's prototype printed (`node dist/cli.js dna show`, task-340 `### design`).
 */
import { APPROVER_ROLE } from '../../src/core/approval-authority';
import { isHumanOnlyRole } from '../../src/dna';
import { DnaYaml, isHumanOnlyRoleEntry } from '../../src/dna/schema';
import { CLI_ENTRY, runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface RoleInput {
  readonly name: string;
  readonly human_only?: boolean;
}

/** A minimal DNA document: `roles` in the given order, one agent `Claude` executing `executesAs`. */
function dnaInput(roles: readonly RoleInput[], executesAs: readonly string[]): unknown {
  return {
    version: 1,
    modules: [{ name: 'core', path: 'src/core' }],
    stacks: { technologies: [{ name: 'TypeScript', category: 'language' }] },
    team: {
      members: [{ name: 'Test User', email: 'test@example.invalid', roles: ['developer'] }],
      agents: [{ name: 'Claude', email: 'noreply@anthropic.com', executes_as: [...executesAs] }],
      roles: roles.map((role) => ({ ...role })),
    },
    paths: {},
  };
}

/** The issues of a refused document, as `{ path, message }`; `[]` when it parses. */
function issues(input: unknown): { path: (string | number)[]; message: string }[] {
  const result = DnaYaml.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => ({ path: [...issue.path] as (string | number)[], message: issue.message }));
}

const HUMAN_ONLY_MESSAGE = (index: number, name: string, role: string): string =>
  `team.agents[${index}] '${name}' executes_as names the human-only role "${role}" (a human-only role is never executed by an agent)`;

const APPROVER_FALSE_MESSAGE = (index: number): string =>
  `team.roles[${index}] "approver" may not declare human_only: false (the approver role is always human-only, REQ-SEC-03)`;

describe('task-340 AC 1 — a role may declare itself human-only (spec-002 RoleEntry.human_only)', () => {
  it('(a) human_only: true on tech-lead parses and is kept on the entry', () => {
    const parsed = DnaYaml.parse(dnaInput([{ name: 'developer' }, { name: 'tech-lead', human_only: true }, { name: 'approver' }], ['developer']));
    expect(parsed.team.roles[1]).toEqual({ name: 'tech-lead', human_only: true });
  });

  it('(b) executes_as naming a role declared human-only is one load error at its executes_as index, naming the entry and the role', () => {
    expect(issues(dnaInput([{ name: 'developer' }, { name: 'tech-lead', human_only: true }, { name: 'approver' }], ['developer', 'tech-lead']))).toEqual([
      { path: ['team', 'agents', 0, 'executes_as', 1], message: HUMAN_ONLY_MESSAGE(0, 'Claude', 'tech-lead') },
    ]);
  });

  it('(c) executes_as naming approver, with no human_only key on approver, is the same load error (D1 (A))', () => {
    expect(issues(dnaInput([{ name: 'developer' }, { name: 'approver' }], ['approver']))).toEqual([
      { path: ['team', 'agents', 0, 'executes_as', 0], message: HUMAN_ONLY_MESSAGE(0, 'Claude', 'approver') },
    ]);
  });

  it('(d) human_only: false on approver is a load error at team.roles[<j>].human_only (D1 (A))', () => {
    expect(issues(dnaInput([{ name: 'developer' }, { name: 'reviewer' }, { name: 'approver', human_only: false }], ['developer']))).toEqual([
      { path: ['team', 'roles', 2, 'human_only'], message: APPROVER_FALSE_MESSAGE(2) },
    ]);
  });

  it('(e) positive control: human_only: false on tech-lead, executed by the agent, parses', () => {
    expect(issues(dnaInput([{ name: 'developer' }, { name: 'tech-lead', human_only: false }, { name: 'approver' }], ['developer', 'tech-lead']))).toEqual([]);
  });

  it('(e) an undefined role keeps the one undefined-role issue, and no human-only issue', () => {
    expect(issues(dnaInput([{ name: 'developer' }, { name: 'approver' }], ['developer', 'ghost']))).toEqual([
      { path: ['team', 'agents', 0, 'executes_as', 1], message: 'team.agents[0].executes_as references undefined role "ghost" (not in team.roles)' },
    ]);
  });
});

describe('task-340 AC 1 (f) — one predicate: isHumanOnlyRole / isHumanOnlyRoleEntry', () => {
  const marked = DnaYaml.parse(dnaInput([{ name: 'developer' }, { name: 'tech-lead', human_only: true }, { name: 'approver' }], ['developer']));
  const unmarked = DnaYaml.parse(dnaInput([{ name: 'developer' }, { name: 'tech-lead' }, { name: 'approver' }], ['developer']));

  it('approver is human-only with no key; the role name is the one approval authority reads (APPROVER_ROLE)', () => {
    expect(isHumanOnlyRole(unmarked, 'approver')).toBe(true);
    expect(isHumanOnlyRole(unmarked, APPROVER_ROLE)).toBe(true);
  });

  it('tech-lead is human-only only where its entry declares it', () => {
    expect(isHumanOnlyRole(marked, 'tech-lead')).toBe(true);
    expect(isHumanOnlyRole(unmarked, 'tech-lead')).toBe(false);
  });

  it('a role with no declaration, and a role team.roles does not define, are not human-only', () => {
    expect(isHumanOnlyRole(marked, 'developer')).toBe(false);
    expect(isHumanOnlyRole(marked, 'ghost')).toBe(false);
  });

  it('isHumanOnlyRoleEntry: approver always; any other entry exactly when human_only is true', () => {
    expect(isHumanOnlyRoleEntry({ name: 'approver' })).toBe(true);
    expect(isHumanOnlyRoleEntry({ name: 'tech-lead', human_only: true })).toBe(true);
    expect(isHumanOnlyRoleEntry({ name: 'tech-lead', human_only: false })).toBe(false);
    expect(isHumanOnlyRoleEntry({ name: 'tech-lead' })).toBe(false);
  });
});

/** The DNA file the CLI cases commit: tech-lead marked human-only, the agent executing `executesAs`. */
function dnaFile(executesAs: string): string {
  return `version: 1
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
      email: test@example.invalid
      roles: [ developer, tech-lead ]
  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ ${executesAs} ]
  roles:
    - name: developer
    - name: tech-lead
      human_only: true
    - name: approver
paths:
  sources: [ src/ ]
`;
}

describe('task-340 AC 1 — through the compiled CLI (`wingfoil dna show`)', () => {
  const repos: string[] = [];
  afterAll(() => repos.forEach(removeTempDir));

  function project(executesAs: string): string {
    const repo = makeTempGitRepo();
    repos.push(repo);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaFile(executesAs));
    commitAll(repo, 'fixture dna.yaml');
    return repo;
  }

  it('human_only is a known field: dna show exits 0 with no unknown-field warning, and prints it', () => {
    expect(CLI_ENTRY).toMatch(/cli\.js$/);
    const run = runCliEntry(project('developer'), ['dna', 'show', '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const shown = JSON.parse(run.stdout) as { team: { roles: { name: string; human_only?: boolean }[] } };
    expect(shown.team.roles[1]).toEqual({ name: 'tech-lead', human_only: true });
  });

  it('executes_as naming the human-only tech-lead: exit 1, the E_VALIDATION line naming the entry and the role', () => {
    const run = runCliEntry(project('developer, tech-lead'), ['dna', 'show']);
    expect(run.status).toBe(1);
    expect(run.stderr.split('\n')).toContain(
      `error: E_VALIDATION team.agents.0.executes_as.1 (.wingfoil/dna.yaml): ${HUMAN_ONLY_MESSAGE(0, 'Claude', 'tech-lead')}`,
    );
  });
});
