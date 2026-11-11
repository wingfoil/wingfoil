/**
 * task-333 AC 5 (`dl-220` Q2 (b); `spec-006` §7 "Membership", as amended at the design gate; design
 * "src/core/team-membership.ts", D1, D2) — `requireTeamMembership(root, identity)`, in-process:
 *
 * - an identity whose email matches no `team.members` entry of the `dna.yaml` committed at `HEAD` → `VALIDATION`, the
 *   `E_NOT_A_MEMBER` message and its `hint` word for word;
 * - a member passes, the email matched case-insensitively (as `resolveMemberRoles` matches it);
 * - the working tree never decides: an uncommitted `dna.yaml` adding the stranger does not admit them;
 * - not refused when there is no team to be outside of: no `dna.yaml` committed at `HEAD`, or a committed
 *   `team.members: []` (D1);
 * - a committed `dna.yaml` that does not validate is refused, fail-closed;
 * - structural: the call sites of `requireTeamMembership(` are those of `requireGitIdentity(` minus
 *   `src/core/init.ts`, file by file (16 today), so a mutating operation added later takes the step.
 *
 * Red until the module exists: `tsc` TS2307 for `../../src/core/team-membership`, jest "Cannot find module".
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { requireTeamMembership } from '../../src/core/team-membership';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { MEMBER, notAMemberRefusal, STRANGER } from './helpers/l0-fixture';

const REPO_ROOT = join(__dirname, '..', '..');

/** A fixture refusal `{ error, hint }` as the `CoreError` it is carried in: `VALIDATION`, the text as `message`. */
const asCoreError = (refusal: { readonly error: string; readonly hint: string }): { code: string; message: string; hint: string } => ({
  code: 'VALIDATION',
  message: refusal.error,
  hint: refusal.hint,
});

function dna(members: string): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
${members}  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;
}

const ONE_MEMBER = dna(`  members:\n    - name: ${MEMBER.name}\n      email: ${MEMBER.email}\n      roles: [ developer, approver ]\n`);
const NO_MEMBERS = dna('  members: []\n');
const WITH_STRANGER = dna(
  `  members:\n    - name: ${MEMBER.name}\n      email: ${MEMBER.email}\n      roles: [ developer, approver ]\n    - name: ${STRANGER.name}\n      email: ${STRANGER.email}\n      roles: [ developer ]\n`,
);

async function membership(root: string, identity: { readonly name: string; readonly email: string }): Promise<CoreResult<void>> {
  return (await requireTeamMembership(root, identity)) as CoreResult<void>;
}

describe('task-333 AC 5 — requireTeamMembership (spec-006 §7 Membership)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(dnaYaml: string | null): string {
    const root = makeTempGitRepo();
    roots.push(root);
    writeFixtureFile(root, 'README.md', 'x\n');
    if (dnaYaml !== null) writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml);
    commitAll(root, 'fixture');
    return root;
  }

  it('a non-member: VALIDATION, the E_NOT_A_MEMBER message and hint, nothing written', async () => {
    const root = repo(ONE_MEMBER);
    const unchanged = snapshotPersistence(root);
    const result = await membership(root, STRANGER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject(asCoreError(notAMemberRefusal(STRANGER)));
    assertPersistenceUnchanged(root, unchanged, 'membership refusal');
  });

  it('a member passes, the email matched case-insensitively', async () => {
    const root = repo(ONE_MEMBER);
    expect((await membership(root, MEMBER)).ok).toBe(true);
    expect((await membership(root, { name: MEMBER.name, email: 'WF-Test@Example.INVALID' })).ok).toBe(true);
  });

  it('the working tree never decides: an uncommitted dna.yaml adding the stranger does not admit them', async () => {
    const root = repo(ONE_MEMBER);
    writeFileSync(join(root, '.wingfoil/dna.yaml'), WITH_STRANGER);
    const result = await membership(root, STRANGER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe(notAMemberRefusal(STRANGER).error);
  });

  it('a committed team.members: [] (the init scaffold) refuses nobody (D1)', async () => {
    const root = repo(NO_MEMBERS);
    expect((await membership(root, STRANGER)).ok).toBe(true);
  });

  it('no dna.yaml committed at HEAD refuses nobody (D1), even with one in the working tree', async () => {
    const root = repo(null);
    writeFixtureFile(root, '.wingfoil/dna.yaml', ONE_MEMBER);
    expect((await membership(root, STRANGER)).ok).toBe(true);
  });

  it('a committed dna.yaml that does not validate is refused, fail-closed, member or not', async () => {
    const root = repo('version: 1.0\nteam: 7\n');
    for (const who of [MEMBER, STRANGER]) {
      const result = await membership(root, who);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message.startsWith("cannot resolve team membership: the committed '.wingfoil/dna.yaml' (at HEAD) is not readable as DNA: ")).toBe(true);
      expect(result.error.message.endsWith('. Membership is read from the committed configuration, so the committed file must be valid; fix it and commit the fix, then retry.')).toBe(true);
    }
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** Per file of `src/`, the calls of `name(` outside comments and outside the function's own definition. */
function callCounts(name: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const call = new RegExp(`\\b${name}\\(`, 'g');
  for (const path of sourceFiles(join(REPO_ROOT, 'src'))) {
    const file = relative(REPO_ROOT, path).split('\\').join('/');
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const code = line.trim();
      if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) continue;
      if (new RegExp(`function ${name}\\(`).test(line)) continue;
      const found = line.match(call)?.length ?? 0;
      if (found > 0) counts[file] = (counts[file] ?? 0) + found;
    }
  }
  return counts;
}

describe('task-333 AC 5 — membership follows the identity check at every mutating call site but init (structural)', () => {
  it('requireTeamMembership( is called, file by file, as often as requireGitIdentity(, src/core/init.ts excluded', () => {
    const identity = callCounts('requireGitIdentity');
    delete identity['src/core/init.ts'];
    expect(callCounts('requireTeamMembership')).toEqual(identity);
  });
});
