/**
 * task-341 — the `coordinator` role's directive (`dl-203` D2 and Q3 (a), `dl-212` D1, `dl-135`; approver rulings
 * D1 (a)–D5 of 2026-11-16): what the coordinator decides (only the judgement points `dl-203` D2 lists), what it never
 * does (approve, reject, amend, decide a gate), and how its session is recorded as a run; bound to `coordinator` in
 * `roles.yaml`.
 *
 * Pins are substrings of whitespace-flattened text (task-276), the sentences C1–C3 the design fixes for green to write
 * verbatim; version pins are "≥" plus the version line naming the task (bug-314).
 *
 * - AC 1 (red-first) is pinned in `test/agent/repository-agent-roles.test.ts` (the committed `dna.yaml`).
 * - AC 2 (red-first): the file, its frontmatter, `## 1. What the coordinator decides` (C1 and `dl-203` D2's three
 *   items, a numbered list of exactly three), `## 2. What the coordinator never does` (C2 and the approver-gated
 *   verbs), no `npx`.
 * - AC 3 (red-first): `## 3. A coordinator session is recorded as a run` (C3), and the command it names: the code
 *   build's `agent execute --element plan:release-planning-rel-v0.4-plan --role coordinator --dry-run --format json`
 *   on this repository plans a `coordinator` run of `Claude` and writes nothing. The expected stderr line and plan
 *   fields are copied from a real run of that command on the code build, in a scratch clone of this branch carrying
 *   the four configuration writes of the design (task-341's red notes name it).
 * - AC 4 (red-first): `roles.yaml` binds `coordinator` to the `coordinator` directive only, at 2.0 or later naming
 *   task-341; the `check:role-directives` exit-0 half is pinned by `test/cli/check-role-directives.test.ts`.
 * - AC 5 (characterization): the PINNED build's `directives list --role coordinator --format json` lists the directive
 *   with no warning; the entry shape is copied from a real run of the pinned build in that scratch clone. At red the
 *   case fails only because the binding and the file are really absent (the pinned build prints the warning
 *   "no directives assigned to role 'coordinator'"), not on a fabricated red.
 *
 * Reads this repository's working tree, as the other live-configuration suites do. Every read is lazy, so before
 * green each case fails on its own (ENOENT or an assertion) instead of the whole file failing to load.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { CLI_ENTRY, spawnCapture } from '../cli/helpers/spawn-cli';
import { removeTempDir } from '../storage/helpers/git-fixture';

const ROOT = join(__dirname, '..', '..');
const WINGFOIL = join(ROOT, '.wingfoil');
const ID = 'coordinator';
const FILE = join(WINGFOIL, 'directives', 'custom', `${ID}.md`);

const flat = (s: string): string => s.replace(/\s+/g, ' ');
const directive = (): string => readFileSync(FILE, 'utf-8');
const frontmatter = (text: string): string => text.slice(text.indexOf('\n') + 1, text.indexOf('\n---', 4));
const rolesText = (): string => readFileSync(join(WINGFOIL, 'roles.yaml'), 'utf-8');

/** A `major.minor` version as one comparable number (as `test/directives/standing-approvals.test.ts`). */
function versionNumber(raw: string): number {
  const match = /^"?(\d+)\.(\d+)"?/.exec(raw);
  if (!match) throw new Error(`not a version: ${raw}`);
  return Number(match[1]) * 1000 + Number(match[2]);
}

/** The section under the heading line `## <heading>`, up to the next `## ` heading. */
function section(heading: string): string {
  const text = directive();
  const marker = `\n## ${heading}\n`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`coordinator has no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start + 1, end < 0 ? undefined : end);
}

const C1 = 'The coordinator decides only the judgement points `dl-203` D2 lists, which the configuration cannot decide:';

/** `dl-203` D2's three judgement points, verbatim, in order. */
const D2_ITEMS = [
  'which frontier steps to run in parallel, within the declared caps (`dl-170`);',
  'the triage of a failure the driver reports (rerun, open a bug, stop);',
  'the content of an element that no other role\'s step writes.',
];

const C2 = 'The coordinator never approves, rejects or amends, and never decides a gate.';

const C3 =
  'A coordinator session is recorded as a run (`dl-135`): it is launched with `wingfoil agent execute ' +
  '--element <type>:<id> --role coordinator`, which appends its record to the run log and commits it as `agent: record ' +
  '<run-id>` when the session exits (`spec-016` §4).';

describe('task-341 AC 2 — the directive states what the coordinator decides and what it never does (dl-203 D2, dl-212 D1)', () => {
  it('red-first: the frontmatter is id coordinator, a custom directive with no scope, version ≥ 1.0 naming task-341', () => {
    const header = frontmatter(directive());
    const parsed = yamlLoad(header) as Record<string, unknown>;
    expect(parsed['id']).toBe(ID);
    expect(parsed['type']).toBe('directive');
    expect(parsed['kind']).toBe('custom');
    expect(Object.keys(parsed)).not.toContain('scope');
    const version = /^version: ("?\d+\.\d+"?)(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1000);
    expect(version![2]).toContain('task-341');
  });

  it('red-first: "## 1. What the coordinator decides" states C1 and dl-203 D2\'s three items as a numbered list 1.–3., no fourth', () => {
    const s1 = section('1. What the coordinator decides');
    expect(flat(s1)).toContain(C1);
    const numbers = [...s1.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));
    expect(numbers).toEqual([1, 2, 3]);
    D2_ITEMS.forEach((item, index) => expect(flat(s1)).toContain(`${index + 1}. ${item}`));
  });

  it('red-first: "## 2. What the coordinator never does" states C2 and names the approver-gated verbs and the gate', () => {
    const s2 = flat(section('2. What the coordinator never does'));
    expect(s2).toContain(C2);
    for (const literal of ['memory approve', 'memory reject', 'memory amend', 'E_AGENT_CONTEXT', 'approval:']) {
      expect([literal, s2.includes(literal)]).toEqual([literal, true]);
    }
  });

  it('red-first: the directive never names npx', () => {
    expect(directive()).not.toContain('npx');
  });
});

describe('task-341 AC 3 — a coordinator session is recorded as a run, by the command the directive names (dl-135, D2)', () => {
  it('red-first: "## 3. A coordinator session is recorded as a run" states C3', () => {
    expect(flat(section('3. A coordinator session is recorded as a run'))).toContain(C3);
  });

  describe('the code build: agent execute --element plan:… --role coordinator --dry-run --format json', () => {
    const PLAN = 'release-planning-rel-v0.4-plan';
    const WARNING = 'interactive launch needs a terminal on stdin and stdout: a run without --dry-run is refused here';
    let bin: string;

    beforeAll(() => {
      // A `claude` that exits 1, first on PATH: no agent CLI can run (the dry run spawns none, spec-016 §3.3).
      bin = mkdtempSync(join(tmpdir(), 'wf-341-bin-'));
      const claude = join(bin, 'claude');
      writeFileSync(claude, '#!/bin/sh\nexit 1\n');
      chmodSync(claude, 0o755);
    });

    afterAll(() => removeTempDir(bin));

    /** The launching identity: a `team.members` entry of the committed `dna.yaml` (the run's git config holds none). */
    function memberIdentity(): Record<string, string> {
      const raw = spawnSync('git', ['show', 'HEAD:.wingfoil/dna.yaml'], { cwd: ROOT, encoding: 'utf-8' }).stdout;
      const member = (yamlLoad(raw) as { team: { members: { name: string; email: string }[] } }).team.members[0]!;
      return {
        GIT_AUTHOR_NAME: member.name,
        GIT_AUTHOR_EMAIL: member.email,
        GIT_COMMITTER_NAME: member.name,
        GIT_COMMITTER_EMAIL: member.email,
      };
    }

    const gitOut = (args: readonly string[]): string => spawnSync('git', [...args], { cwd: ROOT, encoding: 'utf-8' }).stdout;

    it('red-first: exit 0, the no-terminal warning on stderr, a coordinator run of Claude planned, nothing written', () => {
      const headBefore = gitOut(['rev-parse', 'HEAD']);
      const statusBefore = gitOut(['status', '--porcelain']);
      const env = {
        ...withoutAgentMarkers(process.env),
        ...memberIdentity(),
        PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
      };

      const run = spawnCapture(
        process.execPath,
        [CLI_ENTRY, 'agent', 'execute', '--element', `plan:${PLAN}`, '--role', 'coordinator', '--dry-run', '--format', 'json'],
        { cwd: ROOT, env },
      );

      // The refusal (when there is one) is on stderr, so a failure prints it.
      expect([run.status, run.stderr]).toEqual([0, expect.stringContaining(WARNING)]);
      // With --format json the warning is one JSON line on stderr (the console form prints `warning: <text>`).
      expect(run.stderr.trimEnd().split('\n').map((line) => JSON.parse(line) as unknown)).toEqual([{ warning: WARNING }]);
      const plan = JSON.parse(run.stdout) as { dryRun: boolean; subject: string; run: { id: string } & Record<string, unknown> };
      expect(plan.dryRun).toBe(true);
      expect(plan.run).toMatchObject({
        element: `plan:${PLAN}`,
        workflow: 'n/a',
        phase: 'adhoc',
        role: 'coordinator',
        agent: 'Claude',
        adapter: 'built-in/claude-code',
      });
      expect(plan.run.id).toMatch(/^release-planning-rel-v0\.4-plan\/adhoc\/[1-9][0-9]*$/);
      expect(plan.subject).toBe(`agent: record ${plan.run.id}`);
      expect(gitOut(['rev-parse', 'HEAD'])).toBe(headBefore);
      expect(gitOut(['status', '--porcelain'])).toBe(statusBefore);
    });
  });
});

describe('task-341 AC 4 — roles.yaml binds coordinator to the coordinator directive (dl-174)', () => {
  interface Roles {
    readonly assignments: Record<string, readonly string[]>;
    readonly global?: readonly string[];
  }

  it('red-first: assignments.coordinator is [coordinator]; no other role binds the directive, nor global', () => {
    const roles = yamlLoad(rolesText()) as Roles;
    expect(roles.assignments['coordinator']).toEqual([ID]);
    const others = Object.entries(roles.assignments)
      .filter(([role, list]) => role !== 'coordinator' && list.includes(ID))
      .map(([role]) => role);
    expect(others).toEqual([]);
    expect(roles.global ?? []).not.toContain(ID);
  });

  it('red-first: roles.yaml is at 2.0 or later and its version line names task-341', () => {
    const version = /^version: (\S+)(.*)$/m.exec(rolesText());
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(2000);
    expect(version![2]).toContain('task-341');
  });
});

describe('task-341 AC 5 — the pinned build lists the directive for the coordinator with no warning (dl-205 Q1 (a))', () => {
  interface Listed {
    readonly path: string;
    readonly frontmatter: { readonly id: string };
    readonly roles: readonly string[];
    readonly global: boolean;
    readonly assignment: string;
  }

  it('characterization: `directives list --role coordinator --format json` on the pinned build lists coordinator once, no warning', () => {
    const run = spawnSync(
      process.execPath,
      [join('node_modules', 'wingfoil-released', 'dist', 'cli.js'), 'directives', 'list', '--role', 'coordinator', '--format', 'json'],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout) as { entries: Listed[]; warnings: unknown[] };
    expect(out.warnings).toEqual([]);
    const entries = out.entries.filter((entry) => entry.frontmatter.id === ID);
    expect(entries.map((entry) => [entry.path, entry.roles, entry.global, entry.assignment])).toEqual([
      [`directives/custom/${ID}.md`, ['coordinator'], false, 'coordinator'],
    ]);
  });
});
