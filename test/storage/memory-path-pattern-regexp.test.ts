/**
 * task-314 (`bug-283`): `pathPatternRegExp`, moved unchanged from `src/workflow/deduce.ts` to
 * `src/storage/memory-path.ts` so the type-scoped Memory reads share the workflow deduction's rule
 * (`spec-017` §1.4): a token in the file name is one name, a token in a directory one or more
 * directories. The patterns are this repository's own (`.wingfoil/memory.yaml`).
 */
import { pathPatternRegExp } from '../../src/storage/memory-path';

describe('pathPatternRegExp (spec-017 §1.4 token rule)', () => {
  it('a file-name token stands for one name, never a directory', () => {
    const bug = pathPatternRegExp('docs/04_memory/bugs/{id}.md');
    expect(bug.test('docs/04_memory/bugs/bug-002-broken.md')).toBe(true);
    expect(bug.test('docs/04_memory/bugs/nested/bug-002-broken.md')).toBe(false);
    expect(bug.test('docs/04_memory/design/adrs/adr-001-broken.md')).toBe(false);
  });

  it('a directory token stands for one or more directories', () => {
    const plan = pathPatternRegExp('docs/05_plans/{scope}/{id}.md');
    expect(plan.test('docs/05_plans/rl-v1/plan-a.md')).toBe(true);
    expect(plan.test('docs/05_plans/rl-v1/rel-v0.3/plan-a.md')).toBe(true);
    expect(plan.test('docs/05_plans/plan-a.md')).toBe(false);
  });

  it('a token inside a segment keeps the segment literal around it, so release and release-line are told apart', () => {
    const release = pathPatternRegExp('docs/04_memory/planning/rl-{release-line}/{id}.md');
    const releaseLine = pathPatternRegExp('docs/04_memory/planning/{id}.md');
    expect(release.test('docs/04_memory/planning/rl-v1/minor-v0.3.md')).toBe(true);
    expect(release.test('docs/04_memory/planning/rl-v9-broken.md')).toBe(false);
    expect(releaseLine.test('docs/04_memory/planning/rl-v9-broken.md')).toBe(true);
    expect(releaseLine.test('docs/04_memory/planning/rl-v1/minor-v0.3.md')).toBe(false);
  });

  it("task's pattern produces every path under docs/04_memory/, the undecidable case bug-283's Notes accept", () => {
    const task = pathPatternRegExp('docs/04_memory/{release}/{id}.md');
    expect(task.test('docs/04_memory/bugs/bug-002-broken.md')).toBe(true);
    expect(task.test('docs/04_memory/design/adrs/adr-001-broken.md')).toBe(true);
    expect(task.test('docs/04_memory/task-001.md')).toBe(false);
  });

  it('escapes the regular-expression characters of the literal parts', () => {
    const dotted = pathPatternRegExp('docs/a.b/{id}.md');
    expect(dotted.test('docs/a.b/x.md')).toBe(true);
    expect(dotted.test('docs/aXb/x.md')).toBe(false);
    expect(dotted.test('docs/a.b/xXmd')).toBe(false);
  });
});
