/**
 * State-machine transition-legality engine (spec-001-memory-yaml-schema, REQ-SYS-04,
 * task-005-per-type-state-machines). Exercises `resolveStateMachine` + `resolveTransitionTarget`
 * against every type registered in `.wingfoil/memory.yaml` (per the task's Acceptance
 * Criteria) plus illegal-transition rejection. The registered-type list is DERIVED from the parsed
 * config (`REGISTERED_TYPE_NAMES`) rather than hard-coded — the previous hard-coded list of 7 had gone
 * stale when `dl-019-plans-as-memory-element` registered `plan` as an 8th type.
 *
 * The final `describe` block below (REQ-STATE-08) is task-010-default-state-machine-fallback's
 * scope: a throwaway fixture `MemoryYaml` document (parsed in-test, never written to the real
 * `.wingfoil/memory.yaml` per that task's Implementation Notes) whose one declared type has
 * NO `states:` key at all, proving `resolveStateMachine` falls back to `defaults.states` end-to-end
 * (Pass-1 structural parse → Pass-2 semantic transition legality, spec-009-validation-strategy §1) and
 * covering the two branches task-005 left genuinely unexercised in `resolveStateMachine` (see that
 * function's own doc comment in `src/memory/state-machine.ts`): the `?? defaults.states` fallback
 * itself, and the "neither the type nor `defaults` declares a machine" throw.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { MemoryYaml } from '../../src/memory/schema';
import type { StateMachine } from '../../src/memory/schema';
import {
  ARCHIVED_STATUSES,
  DEFAULT_STATE_MACHINE,
  DEPRECATED_STATE,
  E_INVALID_STATE,
  E_INVALID_TRANSITION,
  isArchivedStatus,
  isMachineEdge,
  resolveStateMachine,
  resolveTransitionTarget,
  resolveTypeTransition,
  SUPERSEDED_STATE,
  validateFrontmatterState,
} from '../../src/memory/state-machine';
import { ValidationError } from '../../src/validation';

const raw = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8');
const memoryYaml = MemoryYaml.parse(load(raw));

/**
 * Every type actually registered in `.wingfoil/memory.yaml`, **derived** from the parsed
 * config rather than hard-coded. The hard-coded list these loops previously used named 7 types and had
 * silently gone stale: `dl-019-plans-as-memory-element` registered an 8th (`plan`), which was therefore
 * never exercised here. Deriving the list keeps the suite honest as types are added or removed, and
 * `.sort()` keeps iteration deterministic (REQ-SYS-07) independently of YAML key order.
 */
const REGISTERED_TYPE_NAMES = Object.keys(memoryYaml.types).sort();

describe('resolveStateMachine — REQ-STATE-08 resolution', () => {
  it('covers every type registered in `memory.yaml`, derived from the config (not a stale hard-coded list)', () => {
    // Guard on the derivation itself: if this ever resolves to an empty or trivially small set, the
    // `for` loops below would pass vacuously.
    expect(REGISTERED_TYPE_NAMES.length).toBeGreaterThanOrEqual(8);
    expect(REGISTERED_TYPE_NAMES).toContain('plan');
  });

  it('resolves each registered type to its own declared `states` block', () => {
    for (const typeName of REGISTERED_TYPE_NAMES) {
      const machine = resolveStateMachine(memoryYaml, typeName);
      expect(machine).toBe(memoryYaml.types[typeName]!.states);
    }
  });

  it('throws for a type name not registered in `memory.yaml`', () => {
    expect(() => resolveStateMachine(memoryYaml, 'nonexistent-type')).toThrow(/no type "nonexistent-type"/);
  });
});

describe('resolveTransitionTarget — legal transitions for the real 7 types (spec-001 worked examples)', () => {
  it('task: submit draft→pending, approve pending→backlog, reject pending→draft', () => {
    const m = resolveStateMachine(memoryYaml, 'task');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('pending');
    expect(resolveTransitionTarget(m, 'pending', 'approve')).toBe('backlog');
    expect(resolveTransitionTarget(m, 'pending', 'reject')).toBe('draft');
  });

  it('task: submit in-progress→in-review, approve in-review→approved, reject in-review→in-progress', () => {
    const m = resolveStateMachine(memoryYaml, 'task');
    expect(resolveTransitionTarget(m, 'in-progress', 'submit')).toBe('in-review');
    expect(resolveTransitionTarget(m, 'in-review', 'approve')).toBe('approved');
    expect(resolveTransitionTarget(m, 'in-review', 'reject')).toBe('in-progress');
  });

  it('task: `deprecate` is always legal, from any state, targeting the reserved "deprecated" state', () => {
    const m = resolveStateMachine(memoryYaml, 'task');
    for (const state of ['draft', 'pending', 'backlog', 'in-progress', 'in-review', 'approved', 'done']) {
      expect(resolveTransitionTarget(m, state, 'deprecate')).toBe(DEPRECATED_STATE);
    }
  });

  it('adr: submit draft→pending, approve pending→accepted, reject pending→draft', () => {
    const m = resolveStateMachine(memoryYaml, 'adr');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('pending');
    expect(resolveTransitionTarget(m, 'pending', 'approve')).toBe('accepted');
    expect(resolveTransitionTarget(m, 'pending', 'reject')).toBe('draft');
  });

  it('decision-log: submit draft→in-discussion, approve in-discussion→ready, reject in-discussion→draft', () => {
    const m = resolveStateMachine(memoryYaml, 'decision-log');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('in-discussion');
    expect(resolveTransitionTarget(m, 'in-discussion', 'approve')).toBe('ready');
    expect(resolveTransitionTarget(m, 'in-discussion', 'reject')).toBe('draft');
  });

  it('tech-spec: submit draft→pending, approve pending→approved, reject pending→draft', () => {
    const m = resolveStateMachine(memoryYaml, 'tech-spec');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('pending');
    expect(resolveTransitionTarget(m, 'pending', 'approve')).toBe('approved');
    expect(resolveTransitionTarget(m, 'pending', 'reject')).toBe('draft');
  });

  it('release-line: submit draft→planning, approve planning→active, reject planning→draft', () => {
    const m = resolveStateMachine(memoryYaml, 'release-line');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('planning');
    expect(resolveTransitionTarget(m, 'planning', 'approve')).toBe('active');
    expect(resolveTransitionTarget(m, 'planning', 'reject')).toBe('draft');
  });

  it('release: submit draft→planning (no `gates` at all — every other edge is `waiting`)', () => {
    const m = resolveStateMachine(memoryYaml, 'release');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('planning');
  });

  it('bug: submit draft→open, approve open→triaged, reject open→closed (off-chain target)', () => {
    const m = resolveStateMachine(memoryYaml, 'bug');
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('open');
    expect(resolveTransitionTarget(m, 'open', 'approve')).toBe('triaged');
    expect(resolveTransitionTarget(m, 'open', 'reject')).toBe('closed');
  });

  it('bug: approve in-review→resolved, reject in-review→in-progress, approve resolved→closed, reject resolved→in-progress', () => {
    const m = resolveStateMachine(memoryYaml, 'bug');
    expect(resolveTransitionTarget(m, 'in-review', 'approve')).toBe('resolved');
    expect(resolveTransitionTarget(m, 'in-review', 'reject')).toBe('in-progress');
    expect(resolveTransitionTarget(m, 'resolved', 'approve')).toBe('closed');
    expect(resolveTransitionTarget(m, 'resolved', 'reject')).toBe('in-progress');
  });

  it('defaults machine: submit draft→pending, approve pending→approved, reject pending→draft', () => {
    const m = memoryYaml.defaults!.states;
    expect(resolveTransitionTarget(m, 'draft', 'submit')).toBe('pending');
    expect(resolveTransitionTarget(m, 'pending', 'approve')).toBe('approved');
    expect(resolveTransitionTarget(m, 'pending', 'reject')).toBe('draft');
  });
});

describe('resolveTransitionTarget — illegal transitions are rejected, target never returned', () => {
  const taskMachine = () => resolveStateMachine(memoryYaml, 'task');

  it('rejects `submit` from a `gates` state (must use `approve`, not `submit`)', () => {
    expect(() => resolveTransitionTarget(taskMachine(), 'pending', 'submit')).toThrow(ValidationError);
  });

  it('rejects `submit` from a `waiting` state (fires only via a Workflow action)', () => {
    expect(() => resolveTransitionTarget(taskMachine(), 'backlog', 'submit')).toThrow(ValidationError);
    expect(() => resolveTransitionTarget(taskMachine(), 'approved', 'submit')).toThrow(ValidationError);
  });

  it('rejects `approve` from a plain (non-gate) state', () => {
    expect(() => resolveTransitionTarget(taskMachine(), 'draft', 'approve')).toThrow(ValidationError);
    expect(() => resolveTransitionTarget(taskMachine(), 'backlog', 'approve')).toThrow(ValidationError);
  });

  it('rejects `reject` from a plain (non-gate) state', () => {
    expect(() => resolveTransitionTarget(taskMachine(), 'draft', 'reject')).toThrow(ValidationError);
  });

  it('rejects `submit` from the terminal state of `sequence` (no forward edge)', () => {
    expect(() => resolveTransitionTarget(taskMachine(), 'done', 'submit')).toThrow(ValidationError);
  });

  it('rejects any op (except `deprecate`) from a state not a member of `sequence` at all', () => {
    expect(() => resolveTransitionTarget(taskMachine(), 'bogus-state', 'submit')).toThrow(ValidationError);
    expect(() => resolveTransitionTarget(taskMachine(), 'bogus-state', 'approve')).toThrow(ValidationError);
    expect(() => resolveTransitionTarget(taskMachine(), 'bogus-state', 'reject')).toThrow(ValidationError);
    expect(resolveTransitionTarget(taskMachine(), 'bogus-state', 'deprecate')).toBe(DEPRECATED_STATE);
  });

  it('thrown error is a Pass-2 `ValidationError` carrying `E_INVALID_TRANSITION` and exits 1 (spec-009 §3 as rewritten under dl-032)', () => {
    try {
      resolveTransitionTarget(taskMachine(), 'pending', 'submit', 'docs/04_memory/v0.1/task-x.md');
      throw new Error('expected resolveTransitionTarget to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      // dl-032: an illegal transition is understood input a rule refused — `1`, not the `2` reserved
      // for parse/integrity failures (spec-009 §3; REQ-INT-04; `EXIT_CODE_BY_ERROR.INVALID_TRANSITION`).
      expect(validationError.exitCode).toBe(1);
      expect(validationError.issues).toHaveLength(1);
      expect(validationError.issues[0]!.code).toBe(E_INVALID_TRANSITION);
      expect(validationError.issues[0]!.file).toBe('docs/04_memory/v0.1/task-x.md');
    }
  });

  it('REQ-STATE-01: an illegal transition throws before any target is returned, so the document `status` is left unchanged', () => {
    const doc = { status: 'pending' };
    expect(() => {
      // A caller would only assign the new status once resolveTransitionTarget returns normally —
      // the illegal `submit` throws first, so this assignment is provably never reached.
      const target = resolveTransitionTarget(taskMachine(), doc.status, 'submit');
      doc.status = target;
    }).toThrow(ValidationError);
    expect(doc.status).toBe('pending');
  });
});

describe('resolveTransitionTarget — a state both `gates` and `waiting` (spec-001\'s explicit dual case)', () => {
  // Synthetic machine — none of the 7 real types currently exercise this combination, but spec-001
  // gives it explicit semantics ("its forward edge is verb-less ... while it still exposes a manual
  // `reject`/decline path"), so the engine must honor it. Mirrors the structural-validity fixture
  // already covered in test/memory/schema.test.ts ("allows a state to be both in `waiting` and a
  // `gates` key").
  const dualMachine = {
    sequence: ['draft', 'ready', 'done'],
    gates: { ready: { reject: 'draft' } },
    waiting: ['ready'],
  };

  it('`approve` is illegal — the forward edge is verb-less, picked up automatically by a Workflow action', () => {
    expect(() => resolveTransitionTarget(dualMachine, 'ready', 'approve')).toThrow(ValidationError);
  });

  it('`reject` is still legal — the manual decline path remains available', () => {
    expect(resolveTransitionTarget(dualMachine, 'ready', 'reject')).toBe('draft');
  });

  it('`submit` is illegal (it is a `waiting` state)', () => {
    expect(() => resolveTransitionTarget(dualMachine, 'ready', 'submit')).toThrow(ValidationError);
  });
});

describe('resolveTransitionTarget — defensive edge case: a `gates` state with no next `sequence` entry', () => {
  // None of the 7 real types construct a machine this way (every `gates` key has a following
  // `sequence` entry) — this is a defensive guard against a malformed machine, not a case spec-001
  // itself anticipates, but `approve` must still fail closed (never return `undefined` as a target)
  // rather than writing an invalid state.
  const terminalGateMachine = { sequence: ['draft', 'pending'], gates: { pending: { reject: 'draft' } } };

  it('`approve` is illegal when the gate state is the last entry in `sequence`', () => {
    expect(() => resolveTransitionTarget(terminalGateMachine, 'pending', 'approve')).toThrow(ValidationError);
  });

  it('`reject` remains legal regardless (its target is `gates.<state>.reject`, not `sequence`-derived)', () => {
    expect(resolveTransitionTarget(terminalGateMachine, 'pending', 'reject')).toBe('draft');
  });
});

describe('REQ-STATE-08 — a type with no `states` block falls back to `defaults.states` (task-010)', () => {
  // Throwaway fixture — deliberately NOT added to the real `.wingfoil/memory.yaml`
  // (task-010's Implementation Notes are explicit: today all 7 real types declare their own
  // `states:`, so this path has no live consumer and must be exercised by a dedicated fixture type
  // here instead). Parsed through the real `MemoryYaml` schema (Pass 1, spec-009 §1) so this is a
  // genuine end-to-end exercise of the fallback, not just a call into `resolveStateMachine` with a
  // hand-built object.
  const FALLBACK_FIXTURE_YAML = {
    version: 1.1,
    defaults: {
      states: { sequence: ['draft', 'pending', 'approved'], gates: { pending: { reject: 'draft' } } },
    },
    types: {
      'fixture-no-states': {
        path: 'docs/04_memory/fixtures/{id}.md',
        id_pattern: 'fixture-no-states-{n}',
        // No `states:` key at all — this is exactly the REQ-STATE-08 condition under test.
      },
    },
  };

  const fixtureMemoryYaml = MemoryYaml.parse(FALLBACK_FIXTURE_YAML);

  it('Pass 1: a type entry with no `states:` key is structurally valid (`states` is `.optional()`, spec-001)', () => {
    expect(MemoryYaml.safeParse(FALLBACK_FIXTURE_YAML).success).toBe(true);
    expect(fixtureMemoryYaml.types['fixture-no-states']!.states).toBeUndefined();
  });

  it('resolves to `defaults.states` itself (the previously-uncovered `?? defaults.states` branch)', () => {
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(machine).toBe(fixtureMemoryYaml.defaults!.states);
  });

  it('a declared `defaults.states` takes precedence over the built-in default machine (bug-030)', () => {
    // The fixture's `defaults` machine is value-equal to the built-in, so precedence is asserted by
    // IDENTITY: what comes back must be the object the file declared, not the engine's constant.
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(machine).toBe(fixtureMemoryYaml.defaults!.states);
    expect(machine).not.toBe(DEFAULT_STATE_MACHINE);
  });

  it('`memory.add` chain head is `draft` (`sequence[0]`)', () => {
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(machine.sequence[0]).toBe('draft');
  });

  it('`memory.submit` moves draft → pending', () => {
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(resolveTransitionTarget(machine, 'draft', 'submit')).toBe('pending');
  });

  it('`memory.approve` moves pending → approved', () => {
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(resolveTransitionTarget(machine, 'pending', 'approve')).toBe('approved');
  });

  it('`memory.reject` moves pending → draft — no separate `rejected` status is ever written', () => {
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(resolveTransitionTarget(machine, 'pending', 'reject')).toBe('draft');
    // The default machine's `sequence` never contains a `rejected` state at all (spec-001's
    // reconciliation note, CLAUDE.md §5): confirms no such status could ever be written.
    expect(machine.sequence).not.toContain('rejected');
  });

  it('any other transition (e.g. draft → approved directly) is rejected and leaves `status` unchanged', () => {
    const machine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    const doc = { status: 'draft' };
    expect(() => {
      const target = resolveTransitionTarget(machine, doc.status, 'approve');
      doc.status = target;
    }).toThrow(ValidationError);
    expect(doc.status).toBe('draft');
  });

  it('REQ-SYS-04: removing a type\'s own `states:` block and reloading falls back to `defaults` with no code change', () => {
    // Same fixture type, but this time WITH its own (different) `states:` block declared — proves
    // `resolveStateMachine` picks the type's own machine when present, and reverts to `defaults` the
    // moment that block is absent (as in `FALLBACK_FIXTURE_YAML` above), purely from config, with no
    // change to `resolveStateMachine` itself.
    const withOwnStatesYaml = MemoryYaml.parse({
      ...FALLBACK_FIXTURE_YAML,
      types: {
        'fixture-no-states': {
          ...FALLBACK_FIXTURE_YAML.types['fixture-no-states'],
          states: { sequence: ['draft', 'live'] },
        },
      },
    });

    const ownMachine = resolveStateMachine(withOwnStatesYaml, 'fixture-no-states');
    expect(ownMachine).toBe(withOwnStatesYaml.types['fixture-no-states']!.states);
    expect(ownMachine.sequence).toEqual(['draft', 'live']);

    // Remove the `states:` block (as `FALLBACK_FIXTURE_YAML` already does) — reload falls back.
    const fallbackMachine = resolveStateMachine(fixtureMemoryYaml, 'fixture-no-states');
    expect(fallbackMachine).toBe(fixtureMemoryYaml.defaults!.states);
    expect(fallbackMachine.sequence).toEqual(['draft', 'pending', 'approved']);
  });
});

/**
 * bug-030-init-memory-yaml-has-no-state-machine (task-071) — the case neither task-005 nor task-010
 * ever exercised: a `memory.yaml` with a type that declares no `states` **and no `defaults` block at
 * all**. That file is legal under `spec-001-memory-yaml-schema` (`defaults: # optional`,
 * `z.object({ states: StateMachine }).optional()`), and REQ-STATE-08 says its types still have a
 * machine — *"A Memory type that does not declare its own `states` uses the default machine"*, a rule
 * stated over the type, with no mention of a declared block, whose Rationale is *"reduce config
 * friction"*. So the engine itself owns the default; a declared `defaults.states` is a per-project
 * override of it (asserted by identity in the task-010 block above), not the mechanism that creates it.
 *
 * BDD `p1-memory/P1.13-memory-element-schema.feature` scenario 2 is read the same way: its title says
 * "uses the defaults block" but its `Given` only puts a type in the file *without* a `states` block and
 * its `Then` names the machine **by value**, which is what is asserted here.
 *
 * The machine's value is `spec-001`'s own worked `defaults` example, NOT REQ-STATE-08's literal
 * `draft → pending → approved/rejected → deprecated`: `spec-001` §Consequences deliberately removed the
 * `rejected` status ("no document ever records `status: rejected` again") and makes `deprecated` the
 * reserved implicit wildcard that is never declared in a `sequence`. The four verbs below are exactly
 * REQ-STATE-08's fit criterion — *"accepts exactly the default transitions and rejects any transition
 * outside them"* — under that encoding.
 */
describe('REQ-STATE-08 — no `states` AND no `defaults` block resolves the built-in default machine (bug-030)', () => {
  // The fresh-`wingfoil init` shape before this fix: types, no machine anywhere in the file.
  const NO_MACHINE_ANYWHERE = {
    version: 1.1,
    types: {
      note: { path: 'docs/memory/note/{id}.md', id_pattern: 'note-{n}-{slug}' },
    },
  };
  const parsed = MemoryYaml.parse(NO_MACHINE_ANYWHERE);

  it('Pass 1: a file with no `defaults` key is structurally valid (`defaults` is optional, spec-001)', () => {
    expect(MemoryYaml.safeParse(NO_MACHINE_ANYWHERE).success).toBe(true);
    expect(parsed.defaults).toBeUndefined();
  });

  it('resolves the built-in default machine instead of throwing', () => {
    expect(resolveStateMachine(parsed, 'note')).toBe(DEFAULT_STATE_MACHINE);
  });

  it('the built-in is spec-001\'s worked `defaults` machine — no `rejected`, no declared `deprecated`', () => {
    expect(DEFAULT_STATE_MACHINE.sequence).toEqual(['draft', 'pending', 'approved']);
    expect(DEFAULT_STATE_MACHINE.gates).toEqual({ pending: { reject: 'draft' } });
    expect(DEFAULT_STATE_MACHINE.sequence).not.toContain('rejected');
    expect(DEFAULT_STATE_MACHINE.sequence).not.toContain(DEPRECATED_STATE);
  });

  it('accepts exactly the default transitions (REQ-STATE-08 fit criterion), through `resolveTypeTransition`', () => {
    expect(resolveTypeTransition(parsed, 'note', 'draft', 'submit')).toBe('pending');
    expect(resolveTypeTransition(parsed, 'note', 'pending', 'approve')).toBe('approved');
    expect(resolveTypeTransition(parsed, 'note', 'pending', 'reject')).toBe('draft');
    expect(resolveTypeTransition(parsed, 'note', 'approved', 'deprecate')).toBe(DEPRECATED_STATE);
  });

  it('rejects any transition outside them (REQ-STATE-08 fit criterion, second half)', () => {
    expect(() => resolveTypeTransition(parsed, 'note', 'draft', 'approve')).toThrow(ValidationError);
    expect(() => resolveTypeTransition(parsed, 'note', 'draft', 'reject')).toThrow(ValidationError);
    expect(() => resolveTypeTransition(parsed, 'note', 'approved', 'submit')).toThrow(ValidationError);
    expect(() => resolveTypeTransition(parsed, 'note', 'shipped', 'submit')).toThrow(ValidationError);
  });

  it('`validateFrontmatterState` agrees with it — every state the verbs write is a legal state', () => {
    const machine = resolveStateMachine(parsed, 'note');
    for (const status of ['draft', 'pending', 'approved', DEPRECATED_STATE]) {
      expect(() => validateFrontmatterState(machine, 'note', status)).not.toThrow();
    }
    expect(() => validateFrontmatterState(machine, 'note', 'shipped')).toThrow(ValidationError);
  });

  it('an unregistered type is still a programming-error throw, not a silent default (AC5)', () => {
    // The ONE plain-`Error` path left in `resolveStateMachine`. No CLI/MCP call reaches it:
    // `prepareMemoryTransition` returns NOT_FOUND for an unregistered type before resolving.
    expect(() => resolveStateMachine(parsed, 'unicorn')).toThrow(/has no type "unicorn" registered/);
  });

  it('the built-in constant is frozen — no consumer can mutate the machine every project falls back to', () => {
    expect(Object.isFrozen(DEFAULT_STATE_MACHINE)).toBe(true);
  });
});

describe('validateFrontmatterState — REQ-STATE-01 per-type frontmatter `status` membership (task-036, BDD P4.11/P4.13)', () => {
  it('passes silently (returns undefined, does not throw) for every state in a real type\'s declared `sequence`', () => {
    for (const typeName of REGISTERED_TYPE_NAMES) {
      const machine = resolveStateMachine(memoryYaml, typeName);
      for (const state of machine.sequence) {
        expect(validateFrontmatterState(machine, typeName, state)).toBeUndefined();
      }
    }
  });

  it('passes silently for the implicit "deprecated" state on every real type, even though it is never declared in `sequence`', () => {
    for (const typeName of REGISTERED_TYPE_NAMES) {
      const machine = resolveStateMachine(memoryYaml, typeName);
      expect(machine.sequence).not.toContain(DEPRECATED_STATE);
      expect(() => validateFrontmatterState(machine, typeName, DEPRECATED_STATE)).not.toThrow();
    }
  });

  it('passes silently for every `gates.<state>.reject` target of every real type — the status its own `reject` verb writes', () => {
    // The real config's reject targets all happen to be `sequence` members today, so this asserts the
    // *invariant* rather than the off-chain branch (which the synthetic fixture below covers): whatever
    // `resolveTransitionTarget` returns for `reject` must validate, or `memory reject` would leave the
    // document in a state the tool refuses to read back (REQ-SYS-04).
    for (const typeName of REGISTERED_TYPE_NAMES) {
      const machine = resolveStateMachine(memoryYaml, typeName);
      for (const gateState of Object.keys(machine.gates ?? {}).sort()) {
        const target = resolveTransitionTarget(machine, gateState, 'reject');
        expect(validateFrontmatterState(machine, typeName, target)).toBeUndefined();
      }
    }
  });

  it('BDD P4.11 scenario 3: "shipped" is not a valid task state — throws with the exact message "invalid state \'shipped\' for type \'task\'"', () => {
    const machine = resolveStateMachine(memoryYaml, 'task');
    expect(() => validateFrontmatterState(machine, 'task', 'shipped')).toThrow(ValidationError);
    try {
      validateFrontmatterState(machine, 'task', 'shipped');
      throw new Error('expected validateFrontmatterState to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validationError = err as ValidationError;
      expect(validationError.issues).toHaveLength(1);
      expect(validationError.issues[0]?.code).toBe(E_INVALID_STATE);
      expect(validationError.issues[0]?.path).toBe('status');
      expect(validationError.issues[0]?.message).toBe("invalid state 'shipped' for type 'task'");
    }
  });

  it('BDD P4.13 scenario 3: "releasing" (a valid `release` state) is NOT a valid `task` state — rejected per-type, and `file` is threaded through when supplied', () => {
    const releaseMachine = resolveStateMachine(memoryYaml, 'release');
    expect(() => validateFrontmatterState(releaseMachine, 'release', 'releasing')).not.toThrow();

    const taskMachine = resolveStateMachine(memoryYaml, 'task');
    expect(() => validateFrontmatterState(taskMachine, 'task', 'releasing', 'docs/04_memory/v0.2/task-101.md')).toThrow(
      /invalid state 'releasing' for type 'task'/,
    );
    try {
      validateFrontmatterState(taskMachine, 'task', 'releasing', 'docs/04_memory/v0.2/task-101.md');
      throw new Error('expected validateFrontmatterState to throw');
    } catch (err) {
      const validationError = err as ValidationError;
      expect(validationError.issues[0]?.file).toBe('docs/04_memory/v0.2/task-101.md');
    }
  });

  it('exits `1` (EXIT_VALIDATION) — a business-rule failure, not a parse/system-integrity one (spec-009 §3 as rewritten by dl-032)', () => {
    // spec-009 §3 now keys the exit code on the NATURE of the failure, not on the pass that detects
    // it: `2` is reserved for parse and system-integrity failures ("the input could not be understood,
    // or the installation is inconsistent"); `1` covers "every other validation failure: any mapped
    // `E_INVALID_*` ... including business-rule failures detected in Pass 2". An unrecognised
    // frontmatter `status` is understood input that a rule refused — `1`. No BDD scenario pins an exit
    // code for this message (`P4.11` sc.3 / `P4.13` sc.3 pin the text only), so the spec rule governs.
    const machine = resolveStateMachine(memoryYaml, 'task');
    try {
      validateFrontmatterState(machine, 'task', 'nonexistent-state');
      throw new Error('expected validateFrontmatterState to throw');
    } catch (err) {
      expect((err as ValidationError).exitCode).toBe(1);
    }
  });
});

describe('validateFrontmatterState — an off-chain `gates.<state>.reject` target is a legal state (spec-001)', () => {
  // Synthetic fixture — none of the real registered types in `.wingfoil/memory.yaml` trigger
  // this case: all three of its reject targets (`draft`, `closed`, `in-progress`) happen to be
  // `sequence` members, which is precisely why the suite stayed green over this defect. spec-001's
  // "Semantic validation (post-parse)" is explicit that a reject target "need **not** be a member of
  // `sequence`: it may revert into the chain ... or name an off-chain decline state reached by no
  // forward edge", and `resolveTransitionTarget` already returns `gates[<state>].reject` verbatim.
  // So the `reject` verb can legitimately write a `status` that is outside `sequence`, and
  // `validateFrontmatterState` must accept it — otherwise the tool rejects as invalid a status it
  // wrote itself and the document becomes unmovable (REQ-SYS-04).
  //
  // Parsed through the real `MemoryYaml` schema (Pass 1, spec-009 §1), same throwaway-fixture idiom as
  // the REQ-STATE-08 fallback block above, so this is an end-to-end exercise and not a hand-built
  // object smuggled past the structural rules.
  const OFF_CHAIN_FIXTURE_YAML = {
    version: 1.1,
    defaults: {
      states: { sequence: ['draft', 'pending', 'approved'], gates: { pending: { reject: 'draft' } } },
    },
    types: {
      'fixture-off-chain-reject': {
        path: 'docs/04_memory/fixtures/{id}.md',
        id_pattern: 'fixture-off-chain-reject-{n}',
        states: {
          sequence: ['draft', 'pending', 'approved'],
          // `cancelled` is reached ONLY by `reject` — it appears in no `sequence`, no `waiting`.
          gates: { pending: { reject: 'cancelled' } },
        },
      },
    },
  };

  const offChainYaml = MemoryYaml.parse(OFF_CHAIN_FIXTURE_YAML);
  const machine = resolveStateMachine(offChainYaml, 'fixture-off-chain-reject');

  it('Pass 1: an off-chain reject target is structurally valid — only `gates` KEYS and `waiting` entries must be in `sequence`', () => {
    expect(machine.sequence).not.toContain('cancelled');
    expect(machine.gates?.['pending']?.reject).toBe('cancelled');
  });

  it('the `reject` verb writes the off-chain target verbatim (pre-existing `resolveTransitionTarget` behaviour)', () => {
    expect(resolveTransitionTarget(machine, 'pending', 'reject')).toBe('cancelled');
  });

  it('the status the `reject` verb just wrote validates as a legal state for the type', () => {
    expect(validateFrontmatterState(machine, 'fixture-off-chain-reject', 'cancelled')).toBeUndefined();
  });

  it('round-trip: every reachable target of every declared `gates` entry is itself a legal frontmatter state', () => {
    for (const gateState of Object.keys(machine.gates ?? {}).sort()) {
      const target = resolveTransitionTarget(machine, gateState, 'reject');
      expect(validateFrontmatterState(machine, 'fixture-off-chain-reject', target)).toBeUndefined();
    }
  });

  it('is not over-permissive: a state that is neither in `sequence`, nor a reject target, nor `deprecated` is still rejected', () => {
    expect(() => validateFrontmatterState(machine, 'fixture-off-chain-reject', 'shipped')).toThrow(
      /invalid state 'shipped' for type 'fixture-off-chain-reject'/,
    );
  });
});

describe('isArchivedStatus — the shared archived-status predicate (dl-028, REQ-STATE-06)', () => {
  // `dl-028-archived-states-excluded-from-context` (`ready`) settles the archived set at
  // `{deprecated, superseded}` and mandates ONE shared predicate consumed by both the search path
  // (`searchMemoryDocuments`) and the context path (`src/core/relevance.ts`), superseding
  // `task-038`'s `isDeprecatedStatus`. It lives here, next to `DEPRECATED_STATE`, because this module
  // is already the single source of truth for status literals.

  it('names the two archived statuses as declared constants', () => {
    expect(DEPRECATED_STATE).toBe('deprecated');
    expect(SUPERSEDED_STATE).toBe('superseded');
  });

  it('exposes the canonical archived set in a fixed, deterministic order', () => {
    expect([...ARCHIVED_STATUSES]).toEqual(['deprecated', 'superseded']);
  });

  it('is true for `deprecated` — any type reaches it via `memory deprecate` (P1.9)', () => {
    expect(isArchivedStatus(DEPRECATED_STATE)).toBe(true);
  });

  it('is true for `superseded` — the terminal state of `adr`/`tech-spec` (dl-028)', () => {
    expect(isArchivedStatus(SUPERSEDED_STATE)).toBe(true);
  });

  it('is false for every live status, including `draft`', () => {
    for (const live of ['draft', 'pending', 'backlog', 'in-progress', 'in-review', 'approved', 'accepted', 'done', 'ready']) {
      expect(isArchivedStatus(live)).toBe(false);
    }
  });

  it('is false for `rejected` — spec-001 removed that status; dl-028 drops it from the set', () => {
    expect(isArchivedStatus('rejected')).toBe(false);
  });

  it('is false when the document declares no status at all', () => {
    expect(isArchivedStatus(undefined)).toBe(false);
  });

  it('every archived status in the set is reported archived (set and predicate cannot drift)', () => {
    for (const status of ARCHIVED_STATUSES) expect(isArchivedStatus(status)).toBe(true);
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('resolveTypeTransition — the dl-032 illegal-transition contract (P1.6 sc.2, P5.2.3 sc.2)', () => {
  function expectContract(fn: () => unknown, message: string, detail: RegExp): void {
    try {
      fn();
      throw new Error('expected resolveTypeTransition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.exitCode).toBe(1);
      expect(validationError.issues).toHaveLength(1);
      const issue = validationError.issues[0]!;
      expect(issue.code).toBe(E_INVALID_TRANSITION);
      expect(issue.path).toBe('status');
      expect(issue.message).toBe(message);
      // The shipped explanatory text survives as the detail (dl-032 option (c)).
      expect(issue.detail).toMatch(detail);
    }
  }

  it('returns the same legal target the engine does', () => {
    expect(resolveTypeTransition(memoryYaml, 'task', 'draft', 'submit')).toBe('pending');
    expect(resolveTypeTransition(memoryYaml, 'task', 'in-progress', 'submit')).toBe('in-review');
    expect(resolveTypeTransition(memoryYaml, 'release', 'draft', 'submit')).toBe('planning');
  });

  it('BDD P1.6 sc.2 against the REAL `task` machine: submit from `approved` → the pinned string, exit 1', () => {
    expectContract(
      () => resolveTypeTransition(memoryYaml, 'task', 'approved', 'submit', 'docs/04_memory/v0.2/task-200.md'),
      "illegal transition approved -> (none) for type 'task'",
      /`waiting` state/,
    );
  });

  // task-181 (bug-165, bug-127): `<to>` is what the verb the user typed reaches FROM `<from>`. A call is
  // refused exactly when the verb has no edge from there, so `<to>` is always `(none)` — never the
  // verb's canonical edge elsewhere in the machine (dl-053 option 1, replaced by dl-154 option A), which printed
  // backward moves (`planned -> triaged`) and skips (`triaged -> resolved`). The engine's explanation
  // rides as the detail (dl-032 option (c)) and says why, in the verb's terms.
  describe('task-181: `<to>` is `(none)`, never a move the verb cannot make from `<from>`', () => {
    // The shape `wingfoil init` scaffolds: a type with no `states`, so REQ-STATE-08's built-in default
    // machine (`draft -> pending -> approved`, gate `pending`) — bug-127's reproduction.
    const scaffold = MemoryYaml.parse(load(`version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
`));
    // bug-127's custom machine: a gate followed by a plain state, then a last state.
    const custom = MemoryYaml.parse(load(`version: 1
types:
  item:
    path: "docs/memory/item/{id}.md"
    states:
      sequence: [draft, ready, in-progress, done]
      gates:
        ready: { reject: draft }
`));

    it('AC1 (bug-165): `approve` on a `planned` bug — a gate+waiting state — prints `(none)`, not the backward `triaged`', () => {
      expectContract(
        () => resolveTypeTransition(memoryYaml, 'bug', 'planned', 'approve'),
        "illegal transition planned -> (none) for type 'bug'",
        /^illegal `approve` from "planned": both a `gates` and `waiting` state — its forward edge is verb-less/,
      );
    });

    it('AC1 (bug-165): `approve` on a `triaged` bug prints `(none)`, not `resolved` three states ahead', () => {
      expectContract(
        () => resolveTypeTransition(memoryYaml, 'bug', 'triaged', 'approve'),
        "illegal transition triaged -> (none) for type 'bug'",
        /^illegal `approve` from "triaged": both a `gates` and `waiting` state/,
      );
    });

    it('AC2 (bug-127, end of the chain): `submit` on the last state prints `(none)`, not `pending` behind it', () => {
      expectContract(
        () => resolveTypeTransition(scaffold, 'task', 'approved', 'submit'),
        "illegal transition approved -> (none) for type 'task'",
        /^illegal `submit` from "approved": the last state in `sequence` — there is no forward edge$/,
      );
    });

    it('AC2 (bug-127, end of the chain): `reject` on the last state prints `(none)`, not `draft` behind it', () => {
      expectContract(
        () => resolveTypeTransition(scaffold, 'task', 'approved', 'reject'),
        "illegal transition approved -> (none) for type 'task'",
        /^illegal `reject` from "approved": not a `gates` state — `reject` is only legal from a gate$/,
      );
    });

    it('AC2 (bug-127, a gate): `submit` on `pending` prints `(none)` and the detail names `approve`', () => {
      expectContract(
        () => resolveTypeTransition(scaffold, 'task', 'pending', 'submit'),
        "illegal transition pending -> (none) for type 'task'",
        /^illegal `submit` from "pending": a `gates` state — its forward edge requires `approve`, not `submit`$/,
      );
    });

    it('AC2 (bug-127, custom machine): `submit` on the gate `ready` prints `(none)`, not `done` past `in-progress`', () => {
      expectContract(
        () => resolveTypeTransition(custom, 'item', 'ready', 'submit'),
        "illegal transition ready -> (none) for type 'item'",
        /^illegal `submit` from "ready": a `gates` state — its forward edge requires `approve`, not `submit`$/,
      );
    });

    it('AC2 (bug-127, custom machine): `submit` on the last state `done` prints `(none)`, not `ready` behind it', () => {
      expectContract(
        () => resolveTypeTransition(custom, 'item', 'done', 'submit'),
        "illegal transition done -> (none) for type 'item'",
        /^illegal `submit` from "done": the last state in `sequence` — there is no forward edge$/,
      );
    });

    it('the engine\'s approve-from-a-non-gate reason (spec-004 §4.3\'s example) rides as the exact detail — task `draft`', () => {
      expectContract(
        () => resolveTypeTransition(memoryYaml, 'task', 'draft', 'approve'),
        "illegal transition draft -> (none) for type 'task'",
        /^illegal `approve` from "draft": not a `gates` state — `approve` is only legal from a gate$/,
      );
    });

    /**
     * The reason the engine gives for refusing `op` from `state`, by category of the state — derived
     * from the machine here, independently of the engine, so the sweep pins each category's text.
     */
    function expectedReason(machine: StateMachine, state: string, op: 'submit' | 'approve' | 'reject'): string {
      const gate = (machine.gates ?? {})[state] !== undefined;
      const waiting = (machine.waiting ?? []).includes(state);
      const last = machine.sequence.indexOf(state) === machine.sequence.length - 1;
      if (op === 'reject') return 'not a `gates` state — `reject` is only legal from a gate';
      if (op === 'approve') {
        if (!gate) return 'not a `gates` state — `approve` is only legal from a gate';
        if (waiting) return 'both a `gates` and `waiting` state — its forward edge is verb-less (fires only via a Workflow action), not `approve`';
        return 'a `gates` state with no next `sequence` entry to approve into';
      }
      if (gate) return 'a `gates` state — its forward edge requires `approve`, not `submit`';
      if (waiting) return 'a `waiting` state — its forward edge fires only via a Workflow action, not `submit`';
      expect(last).toBe(true); // the only other refusal of `submit` from a `sequence` member
      return 'the last state in `sequence` — there is no forward edge';
    }

    // The rule is not a property of the cases above: on every type of this repository's own
    // `memory.yaml`, of the `init`-shaped scaffold (REQ-STATE-08's default machine) and of bug-127's
    // custom machine, for every state and every refusable verb, a refusal prints `<from> -> (none)`
    // with its category's reason as the exact detail, and a legal call returns the engine's target.
    it.each([
      ['this repository', memoryYaml],
      ['the init scaffold (REQ-STATE-08 default)', scaffold],
      ['bug-127\'s custom machine', custom],
    ])('every call on every type of %s: a refusal prints `<from> -> (none)`, a legal call returns its target', (_label, file) => {
      let refusals = 0;
      let legal = 0;
      for (const typeName of Object.keys(file.types).sort()) {
        const machine = resolveStateMachine(file, typeName);
        for (const state of machine.sequence) {
          for (const op of ['submit', 'approve', 'reject'] as const) {
            let target: string | undefined;
            try {
              target = resolveTransitionTarget(machine, state, op);
            } catch {
              target = undefined;
            }
            if (target !== undefined) {
              legal += 1;
              expect(resolveTypeTransition(file, typeName, state, op)).toBe(target);
              continue;
            }
            refusals += 1;
            expectContract(
              () => resolveTypeTransition(file, typeName, state, op),
              `illegal transition ${state} -> (none) for type '${typeName}'`,
              new RegExp(`^${escapeRegExp(`illegal \`${op}\` from "${state}": ${expectedReason(machine, state, op)}`)}$`),
            );
          }
        }
      }
      // Vacuity guards: the sweep really exercised both outcomes on this file.
      expect(refusals).toBeGreaterThan(0);
      expect(legal).toBeGreaterThan(0);
    });
  });

  it('carries the file path onto the issue', () => {
    try {
      resolveTypeTransition(memoryYaml, 'task', 'approved', 'submit', 'docs/x.md');
    } catch (error) {
      expect((error as ValidationError).issues[0]!.file).toBe('docs/x.md');
    }
    expect.assertions(1);
  });
});

// task-126 (bug-155): the edge predicate a hop of a chained `[a → b → c]` bracket is judged by, over
// the real `bug` machine of `.wingfoil/memory.yaml` (gated, waiting and plain states alike).
describe('isMachineEdge — every edge of the machine, whichever verb or action drives it (task-126)', () => {
  const bug = resolveStateMachine(memoryYaml, 'bug');

  it.each([
    ['draft', 'open', 'a plain forward edge (submit)'],
    ['in-review', 'resolved', 'the forward edge out of a gate (approve)'],
    ['triaged', 'planned', 'the forward edge out of a waiting state (a workflow action)'],
    ['resolved', 'in-progress', 'a gates reject edge'],
    ['open', 'closed', 'a gates reject edge to the last state'],
    ['in-progress', 'deprecated', 'the implicit deprecated edge'],
  ])('%s → %s is an edge: %s', (from, to) => {
    expect(isMachineEdge(bug, from, to)).toBe(true);
  });

  it.each([
    ['in-review', 'draft', 'a backward move no gate declares'],
    ['draft', 'closed', 'a forward skip'],
    ['closed', 'draft', 'out of the last state'],
    ['in-review', 'in-review', 'a self-loop'],
    ['shipped', 'closed', 'out of an undeclared state'],
  ])('%s → %s is not an edge: %s', (from, to) => {
    expect(isMachineEdge(bug, from, to)).toBe(false);
  });
  it('a machine that declares no `gates` has only its forward and `deprecated` edges', () => {
    const plain = { sequence: ['draft', 'active', 'done'] };

    expect(isMachineEdge(plain, 'draft', 'active')).toBe(true);
    expect(isMachineEdge(plain, 'active', 'deprecated')).toBe(true);
    expect(isMachineEdge(plain, 'active', 'draft')).toBe(false);
  });
});
