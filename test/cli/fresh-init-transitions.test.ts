/**
 * bug-030-init-memory-yaml-has-no-state-machine (task-071), AC1/AC6 — **a freshly `wingfoil init`-ed
 * project can run every Memory transition verb**, proved the only way that claim can honestly be
 * proved: against a REAL `wingfoil init`, driving the REAL compiled `dist/cli.js` end-to-end in a
 * throwaway git repository, for every template the `init` registry supports.
 *
 * Why this suite exists at all, rather than an assertion inside an existing one:
 *
 * - `test/memory/state-machine.test.ts` and `test/storage/templates.test.ts` exercise the resolver and
 *   the scaffold *as library calls*. They cannot show that the shipped CLI, reading the bytes `init`
 *   committed, completes a transition and writes the state to disk.
 * - `scripts/e2e-smoke.cjs` (dl-023, reused as spec-015 §3 stage 3) does drive a fresh init through the
 *   real CLI, but its step list is `init`, `dna show`, `dna set`, `memory add`, `paths`,
 *   `directives list`, `workflow list` — **no transition verb at all**. That omission is
 *   `bug-029-e2e-smoke-omits-memory-submit` (`open`, `low`, unscheduled), a sibling of bug-030 that
 *   task-071 deliberately does NOT fix: extending the smoke script is bug-029's ground. The smoke is
 *   run unchanged as a regression check on the scaffold edit instead, and is explicitly not offered as
 *   evidence for AC1. This suite is the equivalent-coverage route AC6 allows — and is precisely what
 *   bug-029 would later automate inside the smoke script.
 *
 * The drive is the full four-verb round trip, in the order that exercises both gate edges of the
 * scaffolded machine (`draft → pending → approved`, `gates.pending.reject: draft`):
 *
 *   `init` → `memory add` → `submit` → `approve` → `reject` → `submit` → `deprecate`
 *
 * After every verb this asserts both halves of "it completed": the `status` the verb wrote into the
 * document's frontmatter, and that it produced **exactly one** commit (P1.2/§5.1 — one operation, one
 * commit). `--reason` is passed where the verb requires it (REQ-SEC-04, spec-008 §2) and omitted on
 * `deprecate`, where dl-027 makes it optional — passed there too, for the audit trail.
 *
 * Determinism (REQ-SYS-07): fixed template order (the `TEMPLATES` registry order), fixed git identity,
 * fixed step list; nothing asserted depends on a clock, on randomness, or on the temp directory name.
 * `dist/` is built once by jest's `globalSetup` (bug-003-cli-integration-dist-race) — never rebuilt here.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { TEMPLATES } from '../../src/storage/templates';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

/** Spawn the real published entry point (`node dist/cli.js`) inside a project root. */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

/** Number of commits on HEAD — the "exactly one commit per operation" counter. */
function commitCount(repo: string): number {
  return Number(git(repo, ['rev-list', '--count', 'HEAD']).trim());
}

/** The `status:` value in a document's frontmatter, as written on disk. */
function statusOf(repo: string, relativePath: string): string {
  const match = /^status:\s*"?([A-Za-z0-9-]+)"?\s*$/m.exec(readFileSync(join(repo, relativePath), 'utf-8'));
  return match?.[1] ?? '';
}

/**
 * Register the repository's git identity as a `team.members[]` entry holding the `approver` role, the
 * way a real user configures their project, and commit it (the working-tree-clean invariant below).
 *
 * This is **not** a workaround for the bug under test: `wingfoil init` deliberately scaffolds
 * `team.members: []`, and `memory approve`/`reject` gate on REQ-SEC-03 approval authority
 * (`requireApprovalAuthority`, `src/core/approval-authority.ts`, adr-006 — authority is a role held by
 * a `dna.yaml` member matching the live git identity). Without this step those two verbs refuse with
 * `user not authorized to approve type 'task'` — the verb's OWN rule, applied after the state machine
 * resolved, which is exactly the boundary AC1 draws ("each verb's own argument requirements still
 * apply … what must not happen is state-machine resolution failing before the verb's own logic runs").
 * Granting the role here is what lets the four verbs be driven to completion so the STATE each writes
 * can be asserted.
 */
function grantApproverRole(repo: string): void {
  const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
  const scaffolded = readFileSync(dnaPath, 'utf-8');
  const member = '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [approver]';
  expect(scaffolded).toContain('  members: []');
  writeFileSync(dnaPath, scaffolded.replace('  members: []', member), 'utf-8');
  git(repo, ['add', '.wingfoil/dna.yaml']);
  git(repo, ['commit', '--quiet', '-m', 'configure approver']);
}

describe('a freshly `wingfoil init`-ed project runs every Memory transition verb (bug-030, AC1)', () => {
  beforeAll(() => {
    // Built once by test/global-setup.cjs before any worker starts — just assert it is there.
    expect(existsSync(CLI_ENTRY)).toBe(true);
  });

  for (const def of TEMPLATES) {
    describe(`template ${def.name}`, () => {
      let repo: string;
      let documentPath: string;
      let documentId: string;

      beforeAll(() => {
        repo = makeTempGitRepo();
        const init = wingfoil(repo, 'init', '--template', def.name);
        expect([init.status, init.stderr]).toEqual([0, '']);
        grantApproverRole(repo);
        const added = wingfoil(repo, 'memory', 'add', '--type', 'task', '--title', 'Smoke task', '--format', 'json');
        expect([added.status, added.stderr]).toEqual([0, '']);
        const value = JSON.parse(added.stdout) as { id: string; path: string };
        documentId = value.id;
        documentPath = value.path;
      });

      afterAll(() => removeTempDir(repo));

      it('`memory add` wrote a document in the scaffolded type\'s path, at the machine\'s chain head', () => {
        expect(documentPath).toMatch(/task/);
        expect(statusOf(repo, documentPath)).toBe('draft');
      });

      it('`memory submit` completes: draft -> pending, in exactly one commit', () => {
        const before = commitCount(repo);
        const run = wingfoil(repo, 'memory', 'submit', documentId);
        expect([run.status, run.stderr]).toEqual([0, '']);
        expect(statusOf(repo, documentPath)).toBe('pending');
        expect(commitCount(repo) - before).toBe(1);
      });

      it('`memory reject --reason` completes on the gate: pending -> draft, in exactly one commit', () => {
        // `reject` runs before `approve` because the scaffolded machine allows no other order: its one
        // gate is `pending`, and `approved` is the terminal `sequence` entry with no edge back. (The
        // rejection reason is also written to the document's `rejection_reason` field by the verb —
        // asserted below, after the resubmit that clears it again.)
        const before = commitCount(repo);
        const run = wingfoil(repo, 'memory', 'reject', documentId, '--reason', 'needs work');
        expect([run.status, run.stderr]).toEqual([0, '']);
        expect(statusOf(repo, documentPath)).toBe('draft');
        expect(readFileSync(join(repo, documentPath), 'utf-8')).toContain('needs work');
        expect(commitCount(repo) - before).toBe(1);
      });

      it('`memory submit` again after the rejection: draft -> pending, in exactly one commit', () => {
        const before = commitCount(repo);
        const run = wingfoil(repo, 'memory', 'submit', documentId);
        expect([run.status, run.stderr]).toEqual([0, '']);
        expect(statusOf(repo, documentPath)).toBe('pending');
        expect(commitCount(repo) - before).toBe(1);
      });

      it('`memory approve --reason` completes: pending -> approved, in exactly one commit', () => {
        const before = commitCount(repo);
        const run = wingfoil(repo, 'memory', 'approve', documentId, '--reason', 'fresh-init smoke');
        expect([run.status, run.stderr]).toEqual([0, '']);
        expect(statusOf(repo, documentPath)).toBe('approved');
        expect(commitCount(repo) - before).toBe(1);
      });

      it('an illegal verb is refused by the ENGINE, not by state-machine resolution', () => {
        // `approved` is not a `gates` key, so `reject` has no edge from it. The refusal must be the
        // dl-032 contract message — bug-030's failure would have prevented the verb from ever getting
        // this far.
        const run = wingfoil(repo, 'memory', 'reject', documentId, '--reason', 'too late');
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("illegal transition approved -> draft for type 'task'");
        expect(statusOf(repo, documentPath)).toBe('approved');
      });

      it('`memory deprecate` completes from any state: -> deprecated, in exactly one commit', () => {
        const before = commitCount(repo);
        const run = wingfoil(repo, 'memory', 'deprecate', documentId, '--reason', 'end of smoke');
        expect([run.status, run.stderr]).toEqual([0, '']);
        expect(statusOf(repo, documentPath)).toBe('deprecated');
        expect(commitCount(repo) - before).toBe(1);
      });

      it('no verb ever failed on state-machine resolution (the bug-030 signature)', () => {
        // The defect's fingerprint: `resolveStateMachine` throwing REQ-STATE-08 before the verb's own
        // logic runs. Re-drive one verb on the now-`deprecated` document: whatever the engine answers,
        // it must be the engine's own answer, never a resolution failure.
        const run = wingfoil(repo, 'memory', 'submit', documentId);
        expect(`${run.stdout}${run.stderr}`).not.toMatch(/REQ-STATE-08|declares no `states` block/);
      });

      it('the working tree is clean — every mutation was committed (dl-023 smoke invariant)', () => {
        expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
      });
    });
  }
});

/**
 * task-127, approver ruling (c) of 2026-10-01: the `init` scaffold declares `amendable` per type —
 * `true` for `tech-spec`, `decision-log`, `task` and `bug`, `false` for `release` and `release-line`
 * — so `memory amend` works on a fresh project without hand edits. task-158 (approver ruling
 * 2026-10-02): `adr` is `true` too, for dated correction and Revision notes; a changed decision is
 * still a new ADR (`dl-108` A3).
 * Driven through the real `dist/cli.js`, like the suite above.
 */
describe('a freshly `wingfoil init`-ed project can amend an approved tech-spec (task-127) and an accepted adr (task-158)', () => {
  for (const def of TEMPLATES) {
    it(`template ${def.name}`, () => {
      const repo = makeTempGitRepo();
      try {
        expect(wingfoil(repo, 'init', '--template', def.name).status).toBe(0);
        grantApproverRole(repo);

        const drive = (type: string, gateVerb: string): { id: string; path: string } => {
          const added = wingfoil(repo, 'memory', 'add', '--type', type, '--title', `A ${type}`, '--format', 'json');
          expect([added.status, added.stderr]).toEqual([0, '']);
          const value = JSON.parse(added.stdout) as { id: string; path: string };
          expect(wingfoil(repo, 'memory', 'submit', value.id).status).toBe(0);
          expect(wingfoil(repo, 'memory', gateVerb, value.id, '--reason', 'ok').status).toBe(0);
          return value;
        };

        const spec = drive('tech-spec', 'approve');
        writeFileSync(join(repo, spec.path), `${readFileSync(join(repo, spec.path), 'utf-8')}\nA correction.\n`, 'utf-8');
        const before = commitCount(repo);
        const amended = wingfoil(repo, 'memory', 'amend', spec.id, '--reason', 'a correction');
        expect([amended.status, amended.stderr]).toEqual([0, '']);
        expect(commitCount(repo) - before).toBe(1);
        expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`wf(tech-spec): amend ${spec.id} [approved → approved]`);
        expect(git(repo, ['status', '--porcelain']).trim()).toBe('');

        const adr = drive('adr', 'approve');
        writeFileSync(join(repo, adr.path), `${readFileSync(join(repo, adr.path), 'utf-8')}\n> **Correction (2026-10-02) — a fact.**\n`, 'utf-8');
        const adrBefore = commitCount(repo);
        const adrAmended = wingfoil(repo, 'memory', 'amend', adr.id, '--reason', 'a correction note');
        expect([adrAmended.status, adrAmended.stderr]).toEqual([0, '']);
        expect(commitCount(repo) - adrBefore).toBe(1);
        expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`wf(adr): amend ${adr.id} [accepted → accepted]`);
      } finally {
        removeTempDir(repo);
      }
    });
  }
});

