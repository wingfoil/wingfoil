/**
 * task-294 AC 3 (red-first, plus a characterization) — `requireApproverAuthority(root, identity, refusal)`
 * (`src/core/approval-authority.ts`, design "Shared module for task-295"): the check `memory approve` makes
 * (REQ-SEC-03; the committed `dna.yaml` at `HEAD`, `VALIDATION`, exit 1), refusing with the caller's own
 * message — `workflow adopt --plan --apply` passes `user not authorized to apply adoptions in bulk`, `workflow
 * rekey` will pass `user not authorized to rekey` — plus the uncommitted-grant suffix when only the working tree
 * would grant it. `requireApprovalAuthority`'s messages stay what they are (characterization: passes at red).
 */
import { requireApprovalAuthority, requireApproverAuthority } from '../../src/core/approval-authority';
import { exitCodeForResult } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

function dnaYaml(developerRoles: string): string {
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
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ ${developerRoles} ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;
}

const DEVELOPER = { name: 'WingFoil Test', email: 'wf-test@example.invalid' };
const MORGAN = { name: 'Morgan', email: 'morgan@example.invalid' };
const REFUSAL = 'user not authorized to apply adoptions in bulk';

describe('task-294 — requireApprovalAuthority keeps its messages (characterization)', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml('developer'));
    commitAll(root, 'dna');
  });
  afterEach(() => removeTempDir(root));

  it("refuses a non-approver with REQ-SEC-03's message, accepts the approver", () => {
    const refused = requireApprovalAuthority(root, 'task', DEVELOPER);
    expect(refused).toEqual({ ok: false, error: { code: 'VALIDATION', message: "user not authorized to approve type 'task'" } });
    expect(requireApprovalAuthority(root, 'task', MORGAN).ok).toBe(true);
  });
});

describe("task-294 — requireApproverAuthority: memory approve's check, the caller's refusal", () => {
  let root: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml('developer'));
    commitAll(root, 'dna');
  });
  afterEach(() => removeTempDir(root));

  it('accepts a member holding the approver role at HEAD', () => {
    expect(requireApproverAuthority(root, MORGAN, REFUSAL).ok).toBe(true);
  });

  it('refuses any other identity with the refusal given, VALIDATION, exit 1', () => {
    const result = requireApproverAuthority(root, DEVELOPER, REFUSAL);
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: REFUSAL } });
    expect(exitCodeForResult(result)).toBe(1);
    expect(requireApproverAuthority(root, { name: 'Nobody', email: 'nobody@example.invalid' }, 'user not authorized to rekey')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'user not authorized to rekey' },
    });
  });

  it("appends requireApprovalAuthority's uncommitted-grant suffix when only the working tree grants the role", () => {
    writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml('developer, approver'));
    const approve = requireApprovalAuthority(root, 'task', DEVELOPER);
    expect(approve.ok).toBe(false);
    if (approve.ok) return;
    const prefix = "user not authorized to approve type 'task'";
    expect(approve.error.message.startsWith(`${prefix} — `)).toBe(true);
    const suffix = approve.error.message.slice(prefix.length);

    const result = requireApproverAuthority(root, DEVELOPER, REFUSAL);

    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: `${REFUSAL}${suffix}` } });
  });

  it('reads who may approve from HEAD, not the working tree: an uncommitted removal does not refuse the approver', () => {
    writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml('developer').replace('roles: [ approver ]', 'roles: [ developer ]'));
    expect(requireApproverAuthority(root, MORGAN, REFUSAL).ok).toBe(true);
  });
});
