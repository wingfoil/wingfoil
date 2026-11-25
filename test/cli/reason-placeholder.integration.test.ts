/**
 * task-378 AC 5 (red-first; `bug-498`; `spec-008` §2's sixth case, amended at the design gate, `53026cc8d`; design D3 (a))
 * — every verb that records a `Reason:` refuses, at exit `2`, a reason that is only a placeholder token or holds no
 * word, through the REAL compiled `dist/cli.js`, before anything is written: `HEAD` unchanged and the working tree as it
 * was (`git status --porcelain` byte-identical, `memory amend`'s prepared edit included).
 *
 * - `memory approve` (the BDD scenario of `P1.7-memory-approve.feature`, "Error - a reason that states nothing", with
 *   `<the reply>` and `...`), `memory reject`, `memory amend`, `memory park`, `memory deprecate --reason '...'` and
 *   `workflow finalize --reason '<x>'` on an `approval:` phase.
 *
 * Fixture: `buildL0Repo` (`test/core/helpers/l0-fixture.ts`), whose git identity is a member holding `approver`, each
 * target in the state its verb needs. Every child runs with `withoutAgentMarkers(process.env)` (`spec-018` §1), so the
 * approver-gated verbs reach the reason check rather than the agent-context refusal.
 *
 * Expected stderr: `error: ` and `spec-008` §2's message, word for word at the worktree's head.
 *
 * Expected red: today each verb accepts the reason and commits (exit `0`), so each case fails on the exit code, the
 * absent message and the moved `HEAD`. `dist/` is built once by jest's `globalSetup`.
 */
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { buildL0Repo, prepareAmend } from '../core/helpers/l0-fixture';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

jest.setTimeout(120_000);

const PLACEHOLDER_STDERR = 'error: invalid flag value: --reason must state a reason: it holds no word, or only a <placeholder>\n';

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

function fixture(): string {
  const root = buildL0Repo();
  roots.push(root);
  return root;
}

function wingfoil(root: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd: root, env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv });
}

/** `HEAD` and the porcelain status of `root`: what a refused verb must leave as it found it. */
function state(root: string): { head: string; status: string } {
  return { head: git(root, ['rev-parse', 'HEAD']).trim(), status: git(root, ['status', '--porcelain']) };
}

/** Run `args` and assert spec-008 §2's sixth-case refusal: exit 2, the message, nothing written. */
function expectRefused(root: string, args: readonly string[]): void {
  const before = state(root);
  const run = wingfoil(root, args);
  expect({ status: run.status, stderr: run.stderr, stdout: run.stdout }).toEqual({ status: 2, stderr: PLACEHOLDER_STDERR, stdout: '' });
  expect(state(root)).toEqual(before);
}

describe('task-378 AC 5 — P1.7-memory-approve.feature, one test per scenario', () => {
  it('Error - a reason that states nothing', () => {
    const root = fixture();
    expectRefused(root, ['memory', 'approve', 'task-001-approve-me', '--reason', '<the reply>']);
    expectRefused(root, ['memory', 'approve', 'task-001-approve-me', '--reason', '...']);
  });
});

describe('task-378 AC 5 — every verb that records a Reason: refuses a reason that states nothing (spec-008 §2)', () => {
  it('memory reject --reason <x>', () => {
    expectRefused(fixture(), ['memory', 'reject', 'task-002-reject-me', '--reason', '<x>']);
  });

  it('memory amend --reason - (the prepared edit stays uncommitted)', () => {
    const root = fixture();
    prepareAmend(root);
    expectRefused(root, ['memory', 'amend', 'task-003-amend-me', '--reason', '-']);
  });

  it('memory park --reason ?!', () => {
    expectRefused(fixture(), ['memory', 'park', 'task-005-park-me', '--reason', '?!']);
  });

  it("memory deprecate --reason '...' (an optional flag, given and stating nothing)", () => {
    expectRefused(fixture(), ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', '...']);
  });

  it("workflow finalize --reason '<x>' on an approval: phase", () => {
    expectRefused(fixture(), ['workflow', 'finalize', 'rc-1', '--reason', '<x>']);
  });

  it("memory approve --reason '  <x>  ' (judged on the normalized text)", () => {
    expectRefused(fixture(), ['memory', 'approve', 'task-001-approve-me', '--reason', '  <x>  ']);
  });
});
