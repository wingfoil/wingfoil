/**
 * task-375 AC 1 (red-first, `dl-071` option (B), S3; REQ-SEC-03; `spec-008` §6 the authority-refusal row, `spec-006` §7
 * step 4, `spec-005` §3.2; approver ruling D1 of the design gate) — when no member of the `dna.yaml` committed at `HEAD`
 * holds `approver`, the authority refusal keeps its pinned message and gains a `hint` saying how to grant the role:
 *
 * - `team.members` empty (the `init` scaffold): the `dna add` command, with the asker's own identity;
 * - members, none an approver: the `dna update` remedy;
 * - no hint when a member holds `approver` (the refusal is then a denial), nor when the working tree's `dna.yaml` grants
 *   the asker (the uncommitted-grant suffix already names the remedy).
 *
 * The check is the shared one, so `requireApproverAuthority` (`workflow rekey`, `adopt --plan --apply`) carries it too.
 * Expected red: the refusal has no `hint` today, so (a), (b) and (e) fail on `toEqual`; (c) and (d) pin the exclusions
 * and pass already.
 */
import { requireApprovalAuthority, requireApproverAuthority } from '../../src/core/approval-authority';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import type { AgentContext } from '../../src/core/agent-context';

/** No agent marker: the approver's own session (`spec-018` §3.1). */
const NO_AGENT: AgentContext = { markers: [], attribution: null };

const ADA = { name: 'Ada Lovelace', email: 'ada@example.invalid' };
const MORGAN = { name: 'Morgan', email: 'morgan@example.invalid' };
const REFUSAL = "user not authorized to approve type 'task'";

const HINT_NO_MEMBERS =
  "no team member holds the 'approver' role yet: add one with 'wingfoil dna add team.members --value \"Ada Lovelace\" --entry-email ada@example.invalid --entry-roles approver', then retry";
const HINT_NO_APPROVER =
  "no team member holds the 'approver' role yet: add approver to the roles of a team.members entry with 'wingfoil dna update', then retry";

/** A `dna.yaml` whose `team.members` block is `members` (already indented under `team:`). */
function dnaYaml(members: string): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
${members}
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;
}

const NO_MEMBERS = '  members: []';
const ADA_MEMBER = (roles: string): string => `  members:\n    - name: Ada Lovelace\n      email: ada@example.invalid\n      roles: [ ${roles} ]`;
const WITH_APPROVER = `${ADA_MEMBER('developer')}\n    - name: Morgan\n      email: morgan@example.invalid\n      roles: [ approver ]`;

describe('task-375 AC 1 — the authority refusal tells an operator with no approver how to grant it (dl-071 (B))', () => {
  let root: string;
  const seed = (members: string): void => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(members));
    commitAll(root, 'dna');
  };
  afterEach(() => removeTempDir(root));

  it("(a) team.members empty: the pinned message, and the hint naming 'dna add' with the asker's identity", () => {
    seed(NO_MEMBERS);
    expect(requireApprovalAuthority(root, 'task', ADA, NO_AGENT, 'memory approve')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: REFUSAL, hint: HINT_NO_MEMBERS },
    });
  });

  it("(b) members, none an approver, asked by a member: the pinned message, and the 'dna update' hint", () => {
    seed(ADA_MEMBER('developer'));
    expect(requireApprovalAuthority(root, 'task', ADA, NO_AGENT, 'memory approve')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: REFUSAL, hint: HINT_NO_APPROVER },
    });
  });

  it('(c) a member holds approver: the refusal is a denial, with no hint key', () => {
    seed(WITH_APPROVER);
    expect(requireApprovalAuthority(root, 'task', ADA, NO_AGENT, 'memory approve')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: REFUSAL },
    });
    expect(requireApprovalAuthority(root, 'task', MORGAN, NO_AGENT, 'memory approve').ok).toBe(true);
  });

  it('(d) the working tree grants the asker and HEAD does not: the uncommitted-grant suffix, no hint', () => {
    seed(ADA_MEMBER('developer'));
    writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(ADA_MEMBER('developer, approver')));
    const result = requireApprovalAuthority(root, 'task', ADA, NO_AGENT, 'memory approve');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message.startsWith(`${REFUSAL} — `)).toBe(true);
    expect(Object.keys(result.error).sort()).toEqual(['code', 'message']);
  });

  it("(e) requireApproverAuthority (workflow rekey) with team.members empty: the caller's refusal and the (a) hint", () => {
    seed(NO_MEMBERS);
    expect(requireApproverAuthority(root, ADA, 'user not authorized to rekey', NO_AGENT, 'workflow rekey')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'user not authorized to rekey', hint: HINT_NO_MEMBERS },
    });
  });
});
