/**
 * task-057-builtin-directive-templates (P3.8, US-0A-09) — the shipped built-in directive template
 * CONTENT, checked file by file through the real validators every consumer uses.
 *
 * BDD: `docs/02_requirements/02_bdd/features/p3-directives/P3.8-builtin-directive-templates.feature`.
 * The init-level scenarios (installed during init, methodology-independent, corrupted source aborts)
 * are asserted end to end in `test/core/builtin-directive-templates.test.ts`; this suite pins the
 * data itself:
 *
 *  - the set is exactly the six P3.8 ids, in the feature's listing order;
 *  - each rendered file satisfies `DirectiveFrontmatter` (spec-013) with `kind: built-in`, `id` equal to
 *    the future filename stem, and NO key outside the schema's declared shape — a passthrough key would
 *    print `unknown field(s) ignored` on stderr during every `init` (task-044's hand-off);
 *  - each passes the REQ-SEC-10 guard (`verifyBuiltinTemplates`) — `bug-006` was re-graded high because
 *    a schema-invalid built-in aborts `init` for every user;
 *  - the text trips ZERO spec-007 secret-scan findings of any severity (REQ-SEC-08 / dl-036) — stronger
 *    than the `blocking === 0` gate, because a security directive that the scanner flags would be a
 *    permanent false positive in every initialized project;
 *  - the content is deterministic (no dates/versions — REQ-SYS-07).
 */
import { verifyBuiltinTemplates } from '../../src/core/builtin-integrity';
import { DirectiveFrontmatter } from '../../src/directives/schema';
import { extractFrontmatter } from '../../src/storage';
import {
  BUILTIN_DIRECTIVE_IDS,
  BUILTIN_DIRECTIVE_TEMPLATES,
  builtinDirectiveMd,
} from '../../src/storage/builtin-directives';
import { parseYaml, scanText } from '../../src/validation';
import { FAKE_PEM_RSA_HEADER } from '../validation/helpers/secret-fixtures';

/** The P3.8 feature's set, in the order its Scenario 1 lists it. */
const P38_IDS = ['code-quality', 'testing', 'code-review', 'architecture', 'security', 'documentation'];

/**
 * The keys `DirectiveFrontmatter` declares (spec-013; `scope` and `version` since task-144, spec-013
 * Revision 2026-10-01); anything else rides `.passthrough()` and warns.
 */
const DECLARED_KEYS = ['id', 'name', 'type', 'kind', 'title', 'tags', 'ref', 'scope', 'version', 'format'];

const rendered = (): Array<readonly [string, string]> =>
  BUILTIN_DIRECTIVE_TEMPLATES.map((t) => [t.id, builtinDirectiveMd(t)] as const);

function frontmatterOf(content: string): Record<string, unknown> {
  const text = extractFrontmatter(content);
  if (text === null) throw new Error('no frontmatter block');
  return parseYaml(text, 'fixture') as Record<string, unknown>;
}

describe('built-in directive template set (P3.8 Scenario 1)', () => {
  it('is exactly the six P3.8 ids, in the feature order', () => {
    expect(BUILTIN_DIRECTIVE_IDS).toEqual(P38_IDS);
    expect(BUILTIN_DIRECTIVE_TEMPLATES.map((t) => t.id)).toEqual(P38_IDS);
  });

  it('declares every id once', () => {
    expect(new Set(BUILTIN_DIRECTIVE_IDS).size).toBe(BUILTIN_DIRECTIVE_IDS.length);
  });
});

describe.each(rendered())('built-in directive template %s', (id, content) => {
  it('satisfies the real DirectiveFrontmatter schema (spec-013)', () => {
    expect(DirectiveFrontmatter.safeParse(frontmatterOf(content)).success).toBe(true);
  });

  it('carries id = stem, type directive, kind built-in, ref [P3.8], and a non-empty name/title', () => {
    const fm = frontmatterOf(content);
    expect(fm).toMatchObject({ id, type: 'directive', kind: 'built-in', ref: ['P3.8'] });
    expect(typeof fm.name).toBe('string');
    expect((fm.name as string).length).toBeGreaterThan(0);
    expect(fm.title).toBe(fm.name);
  });

  it('uses only keys the schema declares (no passthrough stderr warning at init)', () => {
    for (const key of Object.keys(frontmatterOf(content))) expect(DECLARED_KEYS).toContain(key);
  });

  // Approver ruling R3 (2026-10-02): a shipped template must not encode one project's binding —
  // whether a directive is global is `roles.yaml`'s to say.
  it('declares no `scope`', () => {
    expect(frontmatterOf(content)).not.toHaveProperty('scope');
  });

  it('passes the REQ-SEC-10 built-in integrity guard', () => {
    expect(verifyBuiltinTemplates([{ name: id, kind: 'directive', content }])).toBeNull();
  });

  it('has a body with at least one normative rule after the frontmatter', () => {
    const body = content.slice(content.indexOf('\n---\n', 3) + 5);
    expect(body).toMatch(/^- \S/m);
  });

  it('trips zero spec-007 secret-scan findings of any severity (REQ-SEC-08)', () => {
    const result = scanText(content, `.wingfoil/directives/built-in/${id}.md`);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.info).toEqual([]);
  });

  it('contains no date or version stamp (REQ-SYS-07)', () => {
    expect(content).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(content).not.toMatch(/^version:/m);
  });
});

describe('secret-scan non-vacuity for the built-in directive path', () => {
  it('the same scan DOES flag a planted private-key header under that path (the clean verdict is real)', () => {
    const security = BUILTIN_DIRECTIVE_TEMPLATES.find((t) => t.id === 'security');
    if (security === undefined) throw new Error('security template missing');
    const planted = `${builtinDirectiveMd(security)}${FAKE_PEM_RSA_HEADER}\n`;
    expect(scanText(planted, '.wingfoil/directives/built-in/security.md').blocking.length).toBeGreaterThan(0);
  });
});

describe('builtinDirectiveMd determinism (REQ-SYS-07)', () => {
  it('renders byte-identical output on repeated calls', () => {
    expect(rendered()).toEqual(rendered());
  });
});
