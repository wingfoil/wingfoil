/**
 * task-256 — `team.agents[]` carries the identity `git-conventions` §7 writes as a `Co-Authored-By:`
 * trailer (`bug-240`, `dl-117` Q2 (c), `spec-002-dna-yaml-schema`).
 *
 * A trailer is `Name <email>`. Before this task `AgentEntry` declared no `email`, so the declared agent
 * could not be written as one: `.passthrough()` tolerated any value on read, and the write verbs
 * refused `--entry-email` as an unknown field (`spec-002` "Unknown keys: accepted on read, refused on
 * write"). The agent's `name` is the other half of the trailer, so a name that would break it (`<`,
 * `>` or a line break) is refused too.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES, loadDnaYaml } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { DnaYaml } from '../../src/dna/schema';
import { isValidAttribution } from '../../src/memory';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

function withAgent(agent: Record<string, unknown>): unknown {
  return {
    version: 1.1,
    modules: [{ name: 'core', path: 'src/core' }],
    stacks: { technologies: [{ name: 'TypeScript', category: 'language' }] },
    team: {
      members: [{ name: 'X', roles: ['approver'] }],
      agents: [{ name: 'claude', executes_as: ['developer'], ...agent }],
      roles: [{ name: 'developer' }, { name: 'approver' }],
    },
    paths: { sources: ['src/'] },
  };
}

function issuePaths(input: unknown): string[] {
  const result = DnaYaml.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('task-256 — AgentEntry.email and a trailer-safe name (schema)', () => {
  it('stays optional: an agent without `email` loads', () => {
    expect(DnaYaml.safeParse(withAgent({})).success).toBe(true);
  });

  it('accepts an email and exposes it on the parsed entry', () => {
    const result = DnaYaml.safeParse(withAgent({ email: 'agent@example.org' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.team.agents?.[0]?.email).toBe('agent@example.org');
  });

  it.each<[string, unknown]>([
    ['a number', 42],
    ['no @', 'agent.example.org'],
    ['no dotted domain', 'agent@localhost'],
    ['a space', 'the agent@example.org'],
    ['angle brackets', '<agent@example.org>'],
    ['two @', 'a@b@example.org'],
    ['empty', ''],
  ])('refuses an email that cannot sit in `Name <email>` (%s), naming team.agents.0.email', (_case, email) => {
    expect(issuePaths(withAgent({ email }))).toContain('team.agents.0.email');
  });

  // Approver ruling F1 (2026-10-06): a GitHub noreply address is accepted only in its id-qualified form,
  // `<id>+<login>@users.noreply.github.com`; the bare `<login>@…` form names a login anyone can claim.
  it.each(['12345678+wingfoil-agent@users.noreply.github.com', 'noreply@anthropic.com'])('accepts %j', (email) => {
    expect(DnaYaml.safeParse(withAgent({ email })).success).toBe(true);
  });

  it.each(['wingfoil-agent@users.noreply.github.com', 'Wingfoil-Agent@Users.NoReply.GitHub.com', 'abc+wingfoil-agent@users.noreply.github.com'])(
    'refuses a GitHub noreply address without the numeric `<id>+` prefix (%j), naming team.agents.0.email',
    (email) => {
      const result = DnaYaml.safeParse(withAgent({ email }));
      expect(result.success).toBe(false);
      if (result.success) return;
      const issue = result.error.issues.find((i) => i.path.join('.') === 'team.agents.0.email');
      expect(issue?.message).toContain('<id>+<login>@users.noreply.github.com');
    },
  );

  it.each(['AI <agent>', 'agent>', 'two\nlines', 'cr\rhere'])('refuses an agent name that would break the trailer (%j)', (name) => {
    expect(issuePaths(withAgent({ name }))).toContain('team.agents.0.name');
  });

  it('keeps accepting an ordinary name with spaces, dots and parentheses', () => {
    expect(DnaYaml.safeParse(withAgent({ name: 'AI agent (Claude/Cursor/etc.)' })).success).toBe(true);
  });
});

const DNA_FIXTURE = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: roberto
      roles: [ approver ]
  agents:
    - name: claude
      executes_as: [ developer ]
      approval_authority: false
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

function dnaUpdate(): CoreFn<unknown, unknown> {
  const found = CORE_MODULES.find((module) => module.name === 'dna')?.operations.dnaUpdate;
  if (!found) throw new Error('fixture bug: dna.dnaUpdate is not registered');
  return found.fn;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

describe('task-256 — `dna update team.agents.<name> --entry-email` (write path)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  it('writes the declared field in place and commits', async () => {
    const result = await dnaUpdate()({ root: repo, positionals: ['team.agents.claude'], options: { 'entry-email': 'agent@example.org' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.commit?.sha).toBe(head(repo));
    expect(loadDnaYaml(repo).team.agents?.[0]?.email).toBe('agent@example.org');
  });

  it('refuses a malformed email at exit 1, leaving the file and HEAD untouched', async () => {
    const before = head(repo);
    const text = readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8');
    const result = await dnaUpdate()({ root: repo, positionals: ['team.agents.claude'], options: { 'entry-email': 'not an email' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('team.agents.0.email');
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8')).toBe(text);
  });
});

describe("task-256 — this repository's dna.yaml declares a usable agent identity (bug-240)", () => {
  const live = DnaYaml.parse(load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'dna.yaml'), 'utf-8')));
  const agents = live.team.agents ?? [];

  it('declares at least one agent', () => {
    expect(agents.length).toBeGreaterThan(0);
  });

  it("declares Claude with the vendor's published co-authorship address (approver ruling F1)", () => {
    expect(agents.map((agent) => [agent.name, agent.email])).toContainEqual(['Claude', 'noreply@anthropic.com']);
  });

  it.each(agents.map((agent) => [agent.name, agent] as const))('%s has a plain name and an email that form a valid `Co-Authored-By:` identity', (_name, agent) => {
    expect(agent.name).not.toMatch(/[()/<>]/);
    expect(agent.email).toBeDefined();
    expect(isValidAttribution(agent.name, agent.email ?? '')).toBe(true);
  });
});
