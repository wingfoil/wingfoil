/**
 * task-356 AC 1 (a) (red-first, `bug-372`; `spec-016` §2.2 `mcp.conflict_args` and §2.3, as amended at the design
 * gate; approver ruling D1 (a)) — the optional manifest argv `mcp.conflict_args`, which `agent execute` runs before
 * the launch to ask the agent CLI whether its own configuration declares an MCP server named `wingfoil`:
 *
 * - accepted as a non-empty list of strings, and absent by default;
 * - an empty list is refused at `mcp.conflict_args`;
 * - it holds no placeholder: a §2.3 name, or an unknown one, is `E_ADAPTER_PLACEHOLDER` at its element.
 *
 * Today the strict schema refuses the key itself at `mcp` (an unknown key): every case below fails on that.
 * Every case starts from the fake adapter fixture (`test/fixtures/agents/custom/fake.yaml`), as
 * `test/agent/manifest.test.ts` does; the field is read through a record so the suite type-checks before the
 * schema gains it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { E_ADAPTER_PLACEHOLDER, parseAdapterManifest } from '../../src/agent';
import { ValidationError, type ValidationIssue } from '../../src/validation';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');
const PROBE = ['test/fixtures/agents/fake-agent.cjs', '--mcp-get', 'wingfoil'];

type Manifest = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fake(): Manifest {
  return load(readFileSync(FIXTURE, 'utf-8')) as Manifest;
}

function parse(manifest: Manifest): ReturnType<typeof parseAdapterManifest> {
  return parseAdapterManifest(dump(manifest), { name: 'fake', kind: 'custom', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' });
}

function issuesOf(manifest: Manifest): readonly ValidationIssue[] {
  try {
    parse(manifest);
    return [];
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return error.issues;
  }
}

/** The issues as `{ code, path }`, the message left to the per-case matcher. */
const located = (issues: readonly ValidationIssue[]): { code: string; path: string }[] => issues.map((issue) => ({ code: issue.code, path: issue.path }));

describe('task-356 AC 1 (a) — mcp.conflict_args (spec-016 §2.2, bug-372)', () => {
  it('a non-empty argv is accepted and parsed as declared', () => {
    const manifest = fake();
    manifest.mcp.conflict_args = PROBE;
    expect(issuesOf(manifest)).toEqual([]);
    expect((parse(manifest).mcp as Record<string, unknown>)['conflict_args']).toEqual(PROBE);
  });

  it('absent, the manifest still validates and declares none (it is optional)', () => {
    expect(issuesOf(fake())).toEqual([]);
    expect((parse(fake()).mcp as Record<string, unknown>)['conflict_args']).toBeUndefined();
  });

  it('an empty list is refused at mcp.conflict_args', () => {
    const manifest = fake();
    manifest.mcp.conflict_args = [];
    const issues = issuesOf(manifest);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.path === 'mcp.conflict_args')).toBe(true);
  });

  it.each([['{bootstrap}'], ['{mcp_config_file}'], ['{session_id}'], ['{mcp_command}']])(
    'a §2.3 placeholder (%s) in it is refused: E_ADAPTER_PLACEHOLDER at its element, not legal there',
    (placeholder) => {
      const manifest = fake();
      manifest.mcp.conflict_args = ['mcp', 'get', placeholder];
      const issues = issuesOf(manifest);
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: 'mcp.conflict_args.2' }]);
      expect(issues[0]?.message).toMatch(new RegExp(`placeholder \\${placeholder.slice(0, -1)}\\} is not legal here`));
    },
  );

  it('an unknown placeholder in it is refused as unknown', () => {
    const manifest = fake();
    manifest.mcp.conflict_args = ['mcp', 'get', '{server}'];
    const issues = issuesOf(manifest);
    expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: 'mcp.conflict_args.2' }]);
    expect(issues[0]?.message).toMatch(/unknown placeholder \{server\}/);
  });
});
