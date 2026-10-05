/**
 * P1.13 (US-0A-04) — Memory Element Schema (`memory.yaml`) acceptance fit-criteria
 * (task-024-implement-memory-element-schema).
 *
 * These tests drive the three P1.13 acceptance scenarios
 * (docs/02_requirements/02_bdd/features/p1-memory/P1.13-memory-element-schema.feature) through the
 * REAL Zod schema (`src/memory/schema.ts`, spec-001-memory-yaml-schema) and the REAL state-machine
 * resolver (`src/memory/state-machine.ts`, REQ-STATE-08) — no mocks, no hand-built machines except
 * the deliberately-malformed fixture in scenario 3.
 *
 * Provenance / honest TDD note (see this task's Execution Notes):
 * - Scenario 1 (well-formed `release` validates, initial state `draft`) and scenario 2 (a type with
 *   no `states` block falls back to `defaults`) were ALREADY satisfied by task-004's schema and
 *   task-005/010's resolver; the assertions below are verification-only and were green on first run.
 * - Scenario 3 (undeclared transition target) is the genuine red→green of this task: task-004's
 *   `StateMachine.superRefine` already *rejects* a `gates` key / `waiting` entry not in `sequence`,
 *   but with a `StateMachine`-local message that cannot name the owning type. P1.13's AC requires the
 *   exact, type-contextualized wording, so this task adds a `MemoryYaml`-level `.superRefine` (the
 *   only layer that knows the type name) — see `src/memory/schema.ts`.
 *
 * Spec basis: spec-001-memory-yaml-schema (authoritative — `sequence`/`gates`/`waiting`,
 * `sequence[0]` is the initial state, `defaults.states` fallback, "Semantic validation (post-parse):
 * every key in `gates` and every entry in `waiting` MUST be a member of `sequence`"),
 * spec-010-memory-frontmatter-schema (`status` is the sole state carrier, REQ-STATE-01/REQ-SYS-03),
 * REQ-STATE-08 (per-type machine ?? defaults), REQ-SYS-04 (per-type state machines).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { CONFIGURATION_SCOPES } from '../../src/memory/audit';
import { MemoryYaml } from '../../src/memory/schema';
import { resolveStateMachine, resolveTransitionTarget } from '../../src/memory/state-machine';

/** The real, live type registry — the authoritative well-formed source for scenario 1. */
const realMemoryYaml = MemoryYaml.parse(
  load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8')),
);

describe('P1.13 scenario 1 — a well-formed `release` type validates and exposes initial state `draft`', () => {
  it('the real memory.yaml (which defines `release` with states and transitions) parses with no errors', () => {
    const result = MemoryYaml.safeParse(
      load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8')),
    );
    expect(result.success).toBe(true);
  });

  it('the `release` type is registered and resolves to its own declared machine', () => {
    const machine = resolveStateMachine(realMemoryYaml, 'release');
    expect(machine).toBe(realMemoryYaml.types['release']!.states);
  });

  it('exposes initial state `draft` (= `sequence[0]`, spec-001 "`initial:` is retired")', () => {
    const machine = resolveStateMachine(realMemoryYaml, 'release');
    expect(machine.sequence[0]).toBe('draft');
  });

  it('`memory.add` would assign `draft`, and `memory.submit` moves `draft → planning`', () => {
    const machine = resolveStateMachine(realMemoryYaml, 'release');
    expect(resolveTransitionTarget(machine, 'draft', 'submit')).toBe('planning');
  });
});

describe('P1.13 scenario 2 — a type with no `states` block uses the `defaults` machine (REQ-STATE-08)', () => {
  // A `note`-like type declared with NO `states:` key at all (the BDD's scenario 2). Parsed through
  // the real `MemoryYaml` schema so this is a genuine end-to-end fallback exercise.
  const yamlWithNoteType = {
    version: 1.1,
    defaults: {
      states: { sequence: ['draft', 'pending', 'approved'], gates: { pending: { reject: 'draft' } } },
    },
    types: {
      note: {
        path: 'docs/04_memory/notes/{id}.md',
        id_pattern: 'note-{n}-{slug}',
        // No `states:` key — falls back to `defaults.states`.
      },
    },
  };

  const parsed = MemoryYaml.parse(yamlWithNoteType);

  it('the `note` type declares no `states` block (structurally valid — `states` is optional)', () => {
    expect(parsed.types['note']!.states).toBeUndefined();
  });

  it('resolves `note` to `defaults.states`', () => {
    const machine = resolveStateMachine(parsed, 'note');
    expect(machine).toBe(parsed.defaults!.states);
  });

  it('uses the default machine draft → pending → approved (/reject → draft) → deprecated', () => {
    const machine = resolveStateMachine(parsed, 'note');
    expect(machine.sequence).toEqual(['draft', 'pending', 'approved']);
    expect(resolveTransitionTarget(machine, 'draft', 'submit')).toBe('pending'); // draft → pending
    expect(resolveTransitionTarget(machine, 'pending', 'approve')).toBe('approved'); // pending → approved
    expect(resolveTransitionTarget(machine, 'pending', 'reject')).toBe('draft'); // reject → draft
    expect(resolveTransitionTarget(machine, 'approved', 'deprecate')).toBe('deprecated'); // → deprecated
  });
});

describe('P1.13 scenario 3 — a transition references an undeclared state → validation fails with the exact message', () => {
  /**
   * A `release` type whose `gates` names a state `shipped` that is NOT present in its declared states
   * (`sequence`). Per spec-001, "every key in `gates` ... MUST be a member of `sequence`", so this is
   * a malformed schema and MUST be rejected at load time, before any `release` document can be created
   * or transitioned (REQ-STATE-01).
   */
  const releaseWithUndeclaredTarget = {
    version: 1.1,
    types: {
      release: {
        path: 'docs/04_memory/planning/{release-line}/{id}.md',
        id_pattern: 'minor-{version}',
        states: {
          sequence: ['draft', 'planning', 'in-development', 'releasing', 'released'],
          gates: { shipped: { reject: 'draft' } }, // `shipped` ∉ sequence — undeclared
        },
      },
    },
  };

  it('validation fails', () => {
    const result = MemoryYaml.safeParse(releaseWithUndeclaredTarget);
    expect(result.success).toBe(false);
  });

  it("the error message is \"transition target 'shipped' not in declared states for type 'release'\"", () => {
    const result = MemoryYaml.safeParse(releaseWithUndeclaredTarget);
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages).toContain("transition target 'shipped' not in declared states for type 'release'");
  });

  it('a `waiting` entry naming an undeclared state fails with the same type-contextualized message', () => {
    const result = MemoryYaml.safeParse({
      version: 1.1,
      types: {
        release: {
          path: 'docs/04_memory/planning/{release-line}/{id}.md',
          states: {
            sequence: ['draft', 'planning', 'released'],
            waiting: ['shipped'], // `shipped` ∉ sequence — undeclared
          },
        },
      },
    });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages).toContain("transition target 'shipped' not in declared states for type 'release'");
  });

  it('does NOT reject an off-chain `gates.<state>.reject` target (spec-001 permits it)', () => {
    // spec-001: "A gates.<state>.reject target need NOT be a member of sequence ... e.g. bug's
    // open: { reject: closed }." So `shipped` as a reject target of a DECLARED gate state is legal.
    const result = MemoryYaml.safeParse({
      version: 1.1,
      types: {
        release: {
          path: 'docs/04_memory/planning/{release-line}/{id}.md',
          states: {
            sequence: ['draft', 'planning', 'released'],
            gates: { planning: { reject: 'shipped' } }, // planning ∈ sequence; reject target off-chain — OK
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

/**
 * P1.13 scenario 4 (task-153, bug-177) — a type named after a configuration commit scope is refused.
 * `wf(dna)`, `wf(directive)` and `wf(workflow)` commits record configuration (`spec-008` §2), so the
 * audit reader drops them (`CONFIGURATION_SCOPES`, `src/memory/audit.ts`). A Memory type taking one of
 * those names would have every one of its own commits read as configuration (`operation: null`), so
 * `spec-001` reserves the names and the schema refuses them at load time, as it refuses a declared
 * `deprecated` state.
 */
describe('P1.13 scenario 4 — a type named after a configuration commit scope fails validation', () => {
  const withType = (name: string) => ({
    version: 1.1,
    types: { [name]: { path: `docs/memory/${name}/{id}.md` } },
  });

  it('the configuration scopes are the three spec-008 §2 names', () => {
    expect([...CONFIGURATION_SCOPES]).toEqual(['directive', 'dna', 'workflow']);
  });

  // Driven by the audit reader's own list, so a scope added there is reserved here too.
  for (const name of CONFIGURATION_SCOPES) {
    it(`refuses a type named '${name}' with the exact message`, () => {
      const result = MemoryYaml.safeParse(withType(name));
      expect(result.success).toBe(false);
      const issues = result.success ? [] : result.error.issues.map((i) => [i.message, i.path]);
      expect(issues).toContainEqual([
        `type name '${name}' is reserved: wf(${name}) commits record configuration, not Memory`,
        ['types', name],
      ]);
    });
  }

  it('accepts a name that only contains a reserved one (`workflow-run`)', () => {
    expect(MemoryYaml.safeParse(withType('workflow-run')).success).toBe(true);
  });
});
