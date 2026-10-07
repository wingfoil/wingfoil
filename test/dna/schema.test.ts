/**
 * DnaYaml schema (spec-002-dna-yaml-schema) — independent per-pillar schema, no dependency on
 * memory.yaml or workflows.yaml's schemas (REQ-SYS-02, task-004-decoupled-pillars).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { DnaYaml } from '../../src/dna/schema';

// Copied from spec-002's own "Minimal valid instance".
const MINIMAL_VALID = {
  version: 1.1,
  modules: [{ name: 'core', path: 'src/core' }],
  stacks: {
    technologies: [
      { name: 'TypeScript', category: 'language' },
      { name: 'Node.js', category: 'runtime', version: '18+' },
    ],
  },
  team: {
    members: [{ name: 'Roberto Pompermaier', email: 'robypomper@gmail.com', roles: ['developer', 'approver'] }],
    roles: [{ name: 'developer' }, { name: 'approver' }],
  },
  paths: {
    sources: ['src/'],
    tests: ['test/'],
    docs: ['docs/'],
    config: ['package.json'],
    governance: ['.wingfoil/'],
  },
};

describe('DnaYaml — structural shape (spec-002)', () => {
  it('accepts the spec-002 minimal valid instance', () => {
    const result = DnaYaml.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive version', () => {
    const result = DnaYaml.safeParse({ ...MINIMAL_VALID, version: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a document missing `modules`', () => {
    const rest: Record<string, unknown> = { ...MINIMAL_VALID };
    delete rest.modules;
    const result = DnaYaml.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('preserves unknown fields (`.passthrough()`)', () => {
    const result = DnaYaml.safeParse({ ...MINIMAL_VALID, mysteryField: 'x' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).mysteryField).toBe('x');
    }
  });
});

describe('DnaYaml — role-binding semantic check (spec-002 "Role binding (REQ-SYS-08)")', () => {
  it('rejects a `team.members[].roles` entry not present in `team.roles`', () => {
    const result = DnaYaml.safeParse({
      ...MINIMAL_VALID,
      team: {
        members: [{ name: 'X', roles: ['not-a-real-role'] }],
        roles: [{ name: 'developer' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a `team.agents[].executes_as` entry not present in `team.roles`', () => {
    const result = DnaYaml.safeParse({
      ...MINIMAL_VALID,
      team: {
        members: [{ name: 'X', roles: ['developer'] }],
        agents: [{ name: 'AI agent', executes_as: ['not-a-real-role'], approval_authority: false }],
        roles: [{ name: 'developer' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts role names that are all registered in `team.roles`', () => {
    const result = DnaYaml.safeParse({
      ...MINIMAL_VALID,
      team: {
        members: [{ name: 'X', roles: ['developer', 'approver'] }],
        agents: [{ name: 'AI agent', executes_as: ['developer'], approval_authority: false }],
        roles: [{ name: 'developer' }, { name: 'approver' }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('DnaYaml — validates the real, live .wingfoil/dna.yaml', () => {
  it('parses with zero structural or semantic errors', () => {
    const raw = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'dna.yaml'), 'utf-8');
    const data = load(raw);
    const result = DnaYaml.safeParse(data);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error(result.error.issues);
    }
  });
});

/**
 * task-138 — the two DNA declarations `spec-016` needs (§2.1 the agent → adapter link, §4.1 the run
 * log). Before this task both were merely tolerated by `.passthrough()`: any `adapter` value loaded,
 * and `paths.runs` could carry any number of entries.
 */
describe('DnaYaml — team.agents[].adapter (task-138, spec-016 §2.1)', () => {
  function withAgent(agent: Record<string, unknown>): unknown {
    return {
      ...MINIMAL_VALID,
      team: {
        members: [{ name: 'X', roles: ['developer'] }],
        // An agent with an adapter must declare an email (dl-158 Rule 2 (ii), task-260).
        agents: [{ name: 'claude', email: 'noreply@anthropic.com', executes_as: ['developer'], ...agent }],
        roles: [{ name: 'developer' }, { name: 'approver' }],
      },
    };
  }

  it('stays optional: an agent without `adapter` loads (it can be named, not launched — spec-016 §3.7)', () => {
    expect(DnaYaml.safeParse(withAgent({})).success).toBe(true);
  });

  it('accepts an adapter name in the shared id class (spec-009 §1: [a-z0-9-.])', () => {
    const result = DnaYaml.safeParse(withAgent({ adapter: 'claude-code' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.team.agents?.[0]?.adapter).toBe('claude-code');
  });

  it.each<[string, unknown]>([
    ['a number', 42],
    ['a boolean', true],
    ['a list', ['claude-code']],
  ])('refuses a non-string adapter (%s), naming team.agents.0.adapter', (_case, adapter) => {
    const result = DnaYaml.safeParse(withAgent({ adapter }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('team.agents.0.adapter');
    }
  });

  it.each(['Claude Code', 'claude_code', 'CLAUDE', ''])('refuses an adapter name outside the id class (%j)', (adapter) => {
    const result = DnaYaml.safeParse(withAgent({ adapter }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'team.agents.0.adapter');
      expect(issue?.message).toContain('a-z0-9-.');
    }
  });
});

describe('DnaYaml — paths.runs, the run log (task-138, spec-016 §4.1)', () => {
  function withRuns(runs: unknown): unknown {
    return { ...MINIMAL_VALID, paths: { ...MINIMAL_VALID.paths, runs } };
  }

  it('stays optional: a document without paths.runs loads', () => {
    expect(DnaYaml.safeParse(MINIMAL_VALID).success).toBe(true);
  });

  it('accepts exactly one directory', () => {
    const result = DnaYaml.safeParse(withRuns(['docs/runs/']));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paths.runs).toEqual(['docs/runs/']);
  });

  it.each<[string, unknown]>([
    ['two entries', ['docs/runs/', 'var/runs/']],
    ['no entry', []],
  ])('refuses %s with an issue at, and a message naming, paths.runs', (_case, runs) => {
    const result = DnaYaml.safeParse(withRuns(runs));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'paths.runs');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('paths.runs');
    }
  });
});
