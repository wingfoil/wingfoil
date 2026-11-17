/**
 * Role-based approval authority (REQ-SEC-03, adr-006-git-identity-role-based-authz —
 * task-040-role-based-approval-authority). Mirrors `test/core/git-identity.test.ts`'s isolation
 * pattern for the git-identity-resolution cases, and `test/memory/state-machine.test.ts`'s
 * real-config-fixture pattern for the pure role-lookup cases (parses the REAL
 * `.wingfoil/dna.yaml`, whose one `team.members` entry — Roberto Pompermaier,
 * `robypomper@gmail.com` — holds the `approver` role among others).
 *
 * Since task-090 (`bug-079-uncommitted-dna-yaml-grants-approval-authority`), `requireApprovalAuthority`
 * takes `(root, typeName)` and resolves the roles from the **committed** `.wingfoil/dna.yaml` itself —
 * a caller can no longer hand it a `DnaYaml` parsed from the working tree. Every case below therefore
 * COMMITS its fixture configuration into the throwaway repo; the cases that deliberately do not are
 * the ones pinning that baseline. The pure-lookup describe is untouched: `resolveMemberRoles` /
 * `hasApproverRole` are still pure functions of a parsed `DnaYaml`, whatever produced it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'fs';
import { dump, load } from 'js-yaml';

import { DnaYaml } from '../../src/dna/schema';
import { hasApproverRole, requireApprovalAuthority, resolveMemberRoles } from '../../src/core/approval-authority';
import { readGitIdentity } from '../../src/core/git-identity';
import * as loaders from '../../src/core/loaders';
import type { AgentContext } from '../../src/core/agent-context';

/** No agent marker: the approver's own session (task-333 made the agent context a required parameter, `spec-018` §3.1). */
const NO_AGENT: AgentContext = { markers: [], attribution: null };

const raw = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'dna.yaml'), 'utf-8');
const realDna = DnaYaml.parse(load(raw));

const REVIEWER_ONLY_DNA: DnaYaml = {
  version: 1,
  modules: [],
  stacks: {},
  team: {
    members: [
      { name: 'Approver Amy', email: 'amy@example.com', roles: ['approver'] },
      { name: 'Reviewer Ray', email: 'ray@example.com', roles: ['reviewer', 'developer'] },
    ],
    roles: [{ name: 'approver' }, { name: 'reviewer' }, { name: 'developer' }],
  },
  paths: {},
};

describe('resolveMemberRoles / hasApproverRole — pure role lookup (REQ-SEC-03)', () => {
  it('resolves the real dna.yaml member roles for a matching email (case-insensitive)', () => {
    expect(resolveMemberRoles(realDna, 'robypomper@gmail.com')).toEqual(
      expect.arrayContaining(['approver', 'developer']),
    );
    expect(resolveMemberRoles(realDna, 'RobyPomper@Gmail.com')).toEqual(
      expect.arrayContaining(['approver']),
    );
  });

  it('returns an empty role list for an email with no matching team member', () => {
    expect(resolveMemberRoles(realDna, 'nobody@example.com')).toEqual([]);
  });

  it('returns an empty role list for an empty email', () => {
    expect(resolveMemberRoles(realDna, '')).toEqual([]);
  });

  it('hasApproverRole: true for the real approver, false for a reviewer-only member', () => {
    expect(hasApproverRole(realDna, 'robypomper@gmail.com')).toBe(true);
    expect(hasApproverRole(REVIEWER_ONLY_DNA, 'ray@example.com')).toBe(false);
    expect(hasApproverRole(REVIEWER_ONLY_DNA, 'amy@example.com')).toBe(true);
  });

  it('hasApproverRole: false for an unknown email', () => {
    expect(hasApproverRole(realDna, 'nobody@example.com')).toBe(false);
  });
});

describe('requireApprovalAuthority — git-identity-gated CoreResult (REQ-SEC-03)', () => {
  let dir: string;
  const isolationKeys = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-approval-authority-'));
    execFileSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf-8' });
    const emptyConfig = join(dir, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of isolationKeys) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });

  afterEach(() => {
    for (const key of isolationKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  function setLocalConfig(key: string, value: string): void {
    execFileSync('git', ['-C', dir, 'config', key, value], { encoding: 'utf-8' });
  }

  /** Write `.wingfoil/dna.yaml` into the working tree WITHOUT committing it (task-090's baseline). */
  function writeDna(text: string): void {
    mkdirSync(join(dir, '.wingfoil'), { recursive: true });
    writeFileSync(join(dir, '.wingfoil', 'dna.yaml'), text, 'utf-8');
  }

  /**
   * Write it and COMMIT it — what makes a role real under task-090. The identity rides `-c` flags
   * because this fixture blanks the global/system git config, so there is no committer otherwise.
   */
  function commitDna(text: string): void {
    writeDna(text);
    execFileSync('git', ['-C', dir, 'add', '--', '.wingfoil/dna.yaml'], { encoding: 'utf-8' });
    const identity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid'];
    execFileSync('git', ['-C', dir, ...identity, 'commit', '--quiet', '-m', 'seed dna.yaml'], { encoding: 'utf-8' });
  }

  it('rejects with the exact REQ-SEC-03 message + VALIDATION code when the committer email holds no approver role', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    setLocalConfig('user.name', 'Reviewer Ray');
    setLocalConfig('user.email', 'ray@example.com');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: "user not authorized to approve type 'task'" },
    });
  });

  it('rejects when the committer email matches no team member at all', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    setLocalConfig('user.name', 'Stranger');
    setLocalConfig('user.email', 'stranger@example.com');
    expect(requireApprovalAuthority(dir, 'adr', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: "user not authorized to approve type 'adr'" },
    });
  });

  it('succeeds when the committer email matches a team member holding the approver role', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    setLocalConfig('user.name', 'Approver Amy');
    setLocalConfig('user.email', 'amy@example.com');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve').ok).toBe(true);
  });

  it('succeeds against the real dna.yaml for its configured approver (Roberto)', () => {
    commitDna(raw);
    setLocalConfig('user.name', 'Roberto Pompermaier');
    setLocalConfig('user.email', 'robypomper@gmail.com');
    expect(requireApprovalAuthority(dir, 'release', readGitIdentity(dir), NO_AGENT, 'memory approve').ok).toBe(true);
  });

  // task-090 / bug-079 — the baseline itself, at this function's own seam. The verbs' end-to-end
  // version lives in `test/core/approval-authority-baseline.test.ts`.
  it('task-090: an UNCOMMITTED grant does not authorize — REQ-SEC-03 message first, then the baseline named', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    writeDna(
      dump({
        ...REVIEWER_ONLY_DNA,
        team: {
          ...REVIEWER_ONLY_DNA.team,
          members: [{ name: 'Reviewer Ray', email: 'ray@example.com', roles: ['reviewer', 'developer', 'approver'] }],
        },
      }),
    );
    setLocalConfig('user.name', 'Reviewer Ray');
    setLocalConfig('user.email', 'ray@example.com');

    const result = requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/^user not authorized to approve type 'task' — the working tree's /);
    expect(result.error.message).toContain('not committed');
  });

  it('task-090: an UNCOMMITTED withdrawal does not revoke — authority is what the repository records', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    writeDna(
      dump({
        ...REVIEWER_ONLY_DNA,
        team: { ...REVIEWER_ONLY_DNA.team, members: [{ name: 'Approver Amy', email: 'amy@example.com', roles: ['reviewer'] }] },
      }),
    );
    setLocalConfig('user.name', 'Approver Amy');
    setLocalConfig('user.email', 'amy@example.com');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve').ok).toBe(true);
  });

  // The diagnostic is a diagnostic: an unreadable working-tree file must not change an answer that
  // comes from HEAD, and must not turn a refusal into a crash.
  it('task-090: an unreadable working-tree dna.yaml leaves the refusal exactly as REQ-SEC-03 words it', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    rmSync(join(dir, '.wingfoil', 'dna.yaml'));
    setLocalConfig('user.name', 'Reviewer Ray');
    setLocalConfig('user.email', 'ray@example.com');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: "user not authorized to approve type 'task'" },
    });

    writeDna('this: [is not, a dna file\n');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      error: { message: "user not authorized to approve type 'task'" },
    });
  });

  // The one failure this gate does NOT convert into an authorization answer. A committed file that
  // does not parse or validate is a refusal (`cannot resolve approval authority: …`); anything else
  // would be a defect in the read path, and reporting a defect as "not authorized" — or as
  // "authorized" — would put a wrong authorization decision on the record. It propagates instead.
  // Reachable only by making the read fail in a way nothing in the code can produce, hence the spy.
  it('task-090: an unexpected failure to read the committed baseline propagates, never becomes an authorization answer', () => {
    setLocalConfig('user.name', 'Approver Amy');
    setLocalConfig('user.email', 'amy@example.com');
    const spy = jest.spyOn(loaders, 'loadDnaYamlAtHead').mockImplementation(() => {
      throw new Error('git is not available');
    });
    try {
      expect(() => requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toThrow('git is not available');
    } finally {
      spy.mockRestore();
    }
  });

  it('task-090: with no committed dna.yaml at all, no authority can be resolved', () => {
    writeDna(dump(REVIEWER_ONLY_DNA));
    setLocalConfig('user.name', 'Approver Amy');
    setLocalConfig('user.email', 'amy@example.com');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      error: { message: expect.stringContaining('is not committed at HEAD') },
    });
  });

  // bug-017-agent-authority-guarantee-untested, absorbed into task-046-memory-approve (dl-045).
  // The load-bearing guarantee of the whole authority model — an AI agent that `executes_as`
  // `approver` gains NO approval authority — held structurally (`resolveMemberRoles` reads
  // `team.members` only) but was asserted nowhere, so a future edit reintroducing an agent fallback
  // (exactly the defect `task-034`'s first pass shipped) would break nothing. The fixture is
  // deliberately adversarial: `approval_authority: true`, a declarative `dna.yaml` marker NO code
  // anywhere reads (`task-034`'s second rejection) — so refusing here pins both halves at once.
  // Characterization (T1): the property already holds, so this passes on first run; no red fabricated.
  // task-340 (dl-202 item 1, approver ruling D1 (A)): `approver` is human-only, so a committed `dna.yaml` whose agent
  // `executes_as` it no longer loads — the committed half of the guarantee became structural. The unvalidated half
  // (the pure functions on the object) is kept; the committed half pins the load refusal (red-first, task-340 AC 1).
  it('bug-017: an agent holding `approver` via `executes_as` — even with `approval_authority: true` — gets NO approval authority', () => {
    const agentOnlyDna: DnaYaml = {
      ...REVIEWER_ONLY_DNA,
      team: {
        members: [{ name: 'Reviewer Ray', email: 'ray@example.com', roles: ['reviewer', 'developer'] }],
        agents: [{ name: 'Claude', executes_as: ['approver'], approval_authority: true }],
        roles: [{ name: 'approver' }, { name: 'reviewer' }, { name: 'developer' }],
      },
    };
    // No MEMBER holds `approver` — only the agent entry claims it.
    expect(agentOnlyDna.team.members.some((member) => member.roles.includes('approver'))).toBe(false);
    expect(hasApproverRole(agentOnlyDna, 'ray@example.com')).toBe(false);
    expect(resolveMemberRoles(agentOnlyDna, 'ray@example.com')).not.toContain('approver');

    // Committed, so the refusal is about the ROLES the repository records — not about the baseline.
    commitDna(dump(agentOnlyDna));
    setLocalConfig('user.name', 'Reviewer Ray');
    setLocalConfig('user.email', 'ray@example.com');
    expect(requireApprovalAuthority(dir, 'task', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        message:
          "cannot resolve approval authority: the committed '.wingfoil/dna.yaml' (at HEAD) is not readable as DNA: " +
          'E_VALIDATION team.agents.0.executes_as.0 (HEAD:.wingfoil/dna.yaml): team.agents[0] \'Claude\' executes_as names the human-only role "approver" ' +
          '(a human-only role is never executed by an agent). Approval authority is read from the committed configuration, so the committed file ' +
          'must be valid; fix it and commit the fix, then retry.',
      },
    });
  });

  it('the error type-interpolation reflects the exact `typeName` argument passed in', () => {
    commitDna(dump(REVIEWER_ONLY_DNA));
    setLocalConfig('user.name', 'Reviewer Ray');
    setLocalConfig('user.email', 'ray@example.com');
    expect(requireApprovalAuthority(dir, 'decision-log', readGitIdentity(dir), NO_AGENT, 'memory approve')).toMatchObject({
      error: { message: "user not authorized to approve type 'decision-log'" },
    });
  });
});
