/**
 * task-217 AC 5 — this repository's `plan` type declares the optional `parent` field `spec-017` §3.1 adds: the
 * template carries it (empty: an instance), and `memory.yaml`'s `plan` entry says what it means. A plan whose
 * `parent` is set (`<workflow>.<phase>`) is a phase plan, never an instance (§3.2, `src/workflow/deduce.ts`).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { load } from 'js-yaml';

const ROOT = join(__dirname, '..', '..');

describe('the plan type declares the optional parent field (task-217, spec-017 §3.1)', () => {
  it('the plan template carries `parent: ""`, not among the required fields', () => {
    const template = readFileSync(join(ROOT, '.wingfoil/memory/templates/plan.md'), 'utf-8');
    expect(template).toMatch(/^parent: ""/m);
    const memoryYaml = load(readFileSync(join(ROOT, '.wingfoil/memory.yaml'), 'utf-8')) as {
      types: { plan: { template: { frontmatter: { required: string[] } } } };
    };
    expect(memoryYaml.types.plan.template.frontmatter.required).not.toContain('parent');
  });

  it("memory.yaml's plan entry documents the field", () => {
    const text = readFileSync(join(ROOT, '.wingfoil/memory.yaml'), 'utf-8');
    const plan = text.slice(text.indexOf('\n  plan:\n'), text.indexOf('\n  service:\n'));
    expect(plan).toMatch(/parent/);
  });
});
