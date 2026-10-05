/**
 * task-175 — the built-in binding table and the token resolver (spec-003-workflows-yaml-schema
 * § "Action expressions" built-in table, Layer 3; `dl-090` Q1 (a), Q2 (c), Q6). The resolver returns
 * `{ kind, argv?, expectedCommit? }` for any token, with no `bindings.yaml` for the built-ins; task-216
 * consumes it.
 */
import { BindingsYaml, isBuiltinToken, resolveToken, tokenName } from '../../src/workflow/bindings';

describe('tokenName — the name a binding key matches', () => {
  it.each([
    ['memory.add(type: tech-spec)', 'memory.add'],
    ['tests.coverage(min: 80)', 'tests.coverage'],
    ['frontmatter.required: [title, scope]', 'frontmatter.required'],
    ['  tests.bdd.run  ', 'tests.bdd.run'],
    ['bug.sync_state(for_each: task.bug)', 'bug.sync_state'],
  ])('%s → %s', (token, name) => {
    expect(tokenName(token)).toBe(name);
  });
});

describe('the built-in bindings resolve without a bindings.yaml (spec-003 built-in table)', () => {
  it('memory.* → wingfoil, with the command as argv and the Memory verb', () => {
    expect(resolveToken('memory.add(type: tech-spec)', 'action', null)).toEqual({
      kind: 'wingfoil',
      source: 'built-in',
      argv: ['wingfoil', 'memory', 'add', '--type', 'tech-spec'],
      expectedCommit: { type: 'tech-spec', verbs: ['add'] },
    });
    for (const verb of ['submit', 'approve', 'reject', 'deprecate'] as const) {
      expect(resolveToken(`memory.${verb}`, 'action', null)).toEqual({
        kind: 'wingfoil',
        source: 'built-in',
        argv: ['wingfoil', 'memory', verb],
        expectedCommit: { type: null, verbs: [verb] },
      });
    }
  });

  it('element.set_state / <type>.set_state → manual, verb approve | finalize | start by spec-003 rule', () => {
    expect(resolveToken('element.set_state(active)', 'action', null)).toEqual({
      kind: 'manual',
      source: 'built-in',
      expectedCommit: { type: null, verbs: ['approve', 'finalize', 'start'] },
    });
    expect(resolveToken('release.set_state(in-development)', 'action', null)).toEqual({
      kind: 'manual',
      source: 'built-in',
      expectedCommit: { type: 'release', verbs: ['approve', 'finalize', 'start'] },
    });
  });

  it('<type>.sync_state → manual sync; element.set_release → manual assign', () => {
    expect(resolveToken('bug.sync_state(for_each: task.bug)', 'action', null)).toEqual({
      kind: 'manual',
      source: 'built-in',
      expectedCommit: { type: 'bug', verbs: ['sync'] },
    });
    expect(resolveToken('element.set_release("{release.version}")', 'action', null)).toEqual({
      kind: 'manual',
      source: 'built-in',
      expectedCommit: { type: null, verbs: ['assign'] },
    });
  });

  it('config.init → wingfoil init; agent.* → agent (wingfoil agent execute), no Memory verb', () => {
    expect(resolveToken('config.init', 'action', null)).toEqual({ kind: 'wingfoil', source: 'built-in', argv: ['wingfoil', 'init'] });
    expect(resolveToken('agent.verify_specs', 'action', null)).toEqual({
      kind: 'agent',
      source: 'built-in',
      argv: ['wingfoil', 'agent', 'execute'],
    });
  });

  it('isBuiltinToken names exactly the table', () => {
    for (const name of ['memory.add', 'memory.deprecate', 'element.set_state', 'task.set_state', 'bug.sync_state', 'element.set_release', 'config.init', 'agent.execute']) {
      expect(isBuiltinToken(name)).toBe(true);
    }
    for (const name of ['memory.history', 'git.merge', 'tests.bdd.run', 'approver.execute', 'config.show']) {
      expect(isBuiltinToken(name)).toBe(false);
    }
  });
});

describe('project bindings and unbound tokens', () => {
  const bindings = BindingsYaml.parse({
    checks: { 'tests.coverage': { run: ['npm', 'run', 'coverage', '{min}'], severity: 'warn' }, 'lint.clean': { run: ['npm', 'run', 'lint'] } },
    actions: { 'tests.bdd.run': { run: ['npm', 'run', 'test:bdd'] }, 'approver.execute': { manual: true } },
  });

  it('an action resolves through bindings.actions: run or manual', () => {
    expect(resolveToken('tests.bdd.run', 'action', bindings)).toEqual({ kind: 'run', source: 'project', argv: ['npm', 'run', 'test:bdd'] });
    expect(resolveToken('approver.execute', 'action', bindings)).toEqual({ kind: 'manual', source: 'project' });
  });

  it('a check resolves through bindings.checks only, with its severity (default reject)', () => {
    expect(resolveToken('tests.coverage(min: 80)', 'check', bindings)).toEqual({
      kind: 'run',
      source: 'project',
      argv: ['npm', 'run', 'coverage', '{min}'],
      severity: 'warn',
    });
    expect(resolveToken('lint.clean', 'check', bindings)).toMatchObject({ kind: 'run', severity: 'reject' });
    expect(resolveToken('tests.bdd.run', 'check', bindings)).toEqual({ kind: 'unbound', source: 'none' });
  });

  it('a token neither built in nor bound is unbound', () => {
    expect(resolveToken('git.merge(to: main)', 'action', null)).toEqual({ kind: 'unbound', source: 'none' });
    expect(resolveToken('all releases are status: released', 'check', bindings)).toEqual({ kind: 'unbound', source: 'none' });
  });
});
