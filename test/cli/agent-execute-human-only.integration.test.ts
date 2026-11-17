/**
 * task-340 AC 3 — `agent execute` refuses a human-only role before any side effect (`dl-202` item 1; `spec-016` §3.1,
 * §3.2 step 4, §3.3 step 3, §3.5, §3.7 `HUMAN_ONLY_ROLE`, amended at the design gate `16a03b365`; BDD
 * `p5-interaction/P5.3.2-agent-role-selection.feature`, "Error - the step's role is human-only"; approver ruling D6:
 * one message for every human-only role, `role '<r>' is never executed by an agent`, exit 1).
 *
 * The fixture is task-218's (`test/agent/helpers/agent-execute-fixture.ts`, the fake adapter) with a `tech-lead`
 * role declared `human_only: true` and held by the member.
 *
 * - (a)/(b) red-first: `--role tech-lead`, whatever the flags (`--dry-run`, `--headless`, `--interactive`,
 *   `--agent 'Fake Agent'`, `--format json`), exits 1 with the refusal, spawns nothing and writes nothing.
 * - (c) red-first: the step form, a phase whose role is `tech-lead` and that holds `agent.execute`, prints the
 *   deduction's `W_WORKFLOW_AGENT_ROLE_UNEXECUTED` warning line, then the same refusal.
 * - (d) characterization: `--role approver` keeps today's message and exit (the existing pins stay as they are).
 * - (e) red-first: the refusal precedes the adapter probe — with the adapter's command off `PATH`, the error is still
 *   the human-only one, not `AGENT_NOT_FOUND`.
 */
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, manifest, seed, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { RELEASE_ID, seedStep, startInstance, STEP_WORKFLOWS } from '../agent/helpers/agent-execute-step-fixture';
import { errorLine, execute, expectNothingRan, headOf, removeRunScratch, warningLines } from './helpers/agent-execute-cli';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

function track(repo: string): string {
  repos.push(repo);
  return repo;
}

/** The fixture's `dna.yaml` with `tech-lead` declared human-only and held by the member. */
const HUMAN_ONLY_DNA = DNA_YAML.replace('      roles: [ approver ]\n', '      roles: [ approver, tech-lead ]\n').replace(
  '    - name: approver\n',
  '    - name: approver\n    - name: tech-lead\n      human_only: true\n',
);

const REFUSAL = "role 'tech-lead' is never executed by an agent";

/** A startable workflow whose one phase is `tech-lead`'s and holds `agent.execute` (`release-publishing.publish`'s old shape). */
const DEPLOY = `name: deploy
startable: true
element: release
phases:
  - name: deploy
    role: tech-lead
    actions:
      - agent.execute
`;
const DEPLOY_FILE = 'workflows/custom/deploy.yaml';

describe('task-340 AC 3 (a)/(b) — --role tech-lead (human-only) is refused before any side effect', () => {
  let repo: string;
  beforeAll(() => {
    repo = track(seed((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', HUMAN_ONLY_DNA)));
  });

  it('the fixture marks tech-lead human-only and no agent executes it', () => {
    expect(HUMAN_ONLY_DNA).toContain('    - name: tech-lead\n      human_only: true\n');
    expect(HUMAN_ONLY_DNA).toContain('      roles: [ approver, tech-lead ]\n');
    expect(HUMAN_ONLY_DNA).not.toMatch(/executes_as: \[[^\]]*tech-lead/);
  });

  it.each([
    [['--element', TASK_REF, '--role', 'tech-lead', '--dry-run']],
    [['--element', TASK_REF, '--role', 'tech-lead', '--headless']],
    [['--element', TASK_REF, '--role', 'tech-lead', '--interactive']],
    [['--element', TASK_REF, '--role', 'tech-lead', '--agent', 'Fake Agent']],
    [['--element', TASK_REF, '--role', 'tech-lead', '--dry-run', '--headless']],
  ])('%j → exit 1, the HUMAN_ONLY_ROLE refusal, nothing spawned or written', (args) => {
    const before = headOf(repo);
    const run = execute(repo, args);
    expect(errorLine(run.stderr)).toBe(`error: ${REFUSAL}`);
    expect(run.status).toBe(1);
    expectNothingRan(repo, run, before);
  });

  it('--format json: the refusal is the JSON error object on stderr, exit 1', () => {
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'tech-lead', '--dry-run', '--headless', '--format', 'json']);
    const objects = run.stderr
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(objects).toContainEqual({ error: REFUSAL });
    expect(run.status).toBe(1);
    expectNothingRan(repo, run, before);
  });

  it('(d) characterization: --role approver keeps its message and exit 1', () => {
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'approver', '--dry-run']);
    // Copied from a real run of this build: `agent execute --element task:task-202-explicit-override --role approver`.
    expect(errorLine(run.stderr)).toBe("error: role 'approver' is never executed by an agent");
    expect(run.status).toBe(1);
    expectNothingRan(repo, run, before);
  });
});

describe('task-340 AC 3 (c) — a step whose phase role is human-only (P5.3.2 "the step\'s role is human-only")', () => {
  let repo: string;
  beforeAll(() => {
    repo = track(seedStep((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', HUMAN_ONLY_DNA), { ...STEP_WORKFLOWS, [DEPLOY_FILE]: DEPLOY }));
    startInstance(repo, 'deploy-1', 'deploy', RELEASE_ID);
  });

  it.each([[['--next']], [['--next', '--headless']], [['--next', '--dry-run']]])(
    '%j → the deduction\'s W_WORKFLOW_AGENT_ROLE_UNEXECUTED warning line, then the refusal; nothing spawned',
    (args) => {
      const before = headOf(repo);
      const run = execute(repo, args);
      expect(warningLines(run.stderr)).toContain(
        `warning: W_WORKFLOW_AGENT_ROLE_UNEXECUTED (${DEPLOY_FILE}): phase 'deploy' declares agent.execute under role 'tech-lead', but no team.agents entry with an adapter executes as 'tech-lead'`,
      );
      expect(errorLine(run.stderr)).toBe(`error: ${REFUSAL}`);
      expect(run.status).toBe(1);
      expectNothingRan(repo, run, before);
    },
  );
});

describe('task-340 AC 3 (e) — the refusal precedes the adapter probe (AGENT_NOT_FOUND)', () => {
  let repo: string;
  beforeAll(() => {
    repo = track(
      seed((root) => {
        writeFixtureFile(root, '.wingfoil/dna.yaml', HUMAN_ONLY_DNA.replace('adapter: fake', 'adapter: ghostcli'));
        writeFixtureFile(root, '.wingfoil/agents/custom/ghostcli.yaml', manifest('ghostcli', (text) => text.replace('command: node', 'command: wingfoil-no-such-agent-cli')));
      }),
    );
  });

  it('control: --role developer meets AGENT_NOT_FOUND (the adapter command is off PATH)', () => {
    expect(errorLine(execute(repo, ['--element', TASK_REF, '--role', 'developer']).stderr)).toBe("error: agent command 'wingfoil-no-such-agent-cli' not found (adapter 'ghostcli')");
  });

  it('--role tech-lead → the human-only refusal, not AGENT_NOT_FOUND; nothing spawned or written', () => {
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'tech-lead']);
    expect(errorLine(run.stderr)).toBe(`error: ${REFUSAL}`);
    expect(run.status).toBe(1);
    expectNothingRan(repo, run, before);
  });
});
