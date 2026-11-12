/**
 * task-339 AC 1 (red-first; `spec-016` §2.2 `launch.interactive.permissions` / `launch.headless.permissions` and §2.3,
 * as amended at the design gate; `dl-223` (b); approver ruling D1 (a)) — the optional permission posture of each
 * launch kind:
 *
 * - accepted as an argv fragment (a list of strings, possibly empty), or as a map from a role name to a fragment
 *   that declares a `default` entry; absent by default; the keys are not checked against `team.roles`;
 * - any other shape (a scalar, `null`, a list holding a non-string, a map value that is not a list of strings) is a
 *   Pass-1 validation issue at `launch.<kind>.permissions` or below it;
 * - a map without `default` is `E_ADAPTER_MANIFEST` at `launch.<kind>.permissions`;
 * - it holds no placeholder: a §2.3 name, or an unknown one, is `E_ADAPTER_PLACEHOLDER` at its element.
 *
 * Today the strict schema refuses the key itself at `launch.<kind>` (an unknown key): every case below fails on that.
 * Every case starts from the fake adapter fixture (`test/fixtures/agents/custom/fake.yaml`, unchanged, D10), as
 * `test/agent/manifest-conflict-args.test.ts` does; the field is read through a record so the suite type-checks
 * before the schema gains it. The fragments avoid every argv word the fake agent acts on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { E_ADAPTER_MANIFEST, E_ADAPTER_PLACEHOLDER, parseAdapterManifest } from '../../src/agent';
import { ValidationError, type ValidationIssue } from '../../src/validation';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');

/** The design's fragments: a reading posture, the default, and a writing one. */
const R = ['--allow', 'read'];
const D = ['--allow', 'none'];
const W = ['--allow', 'write', '--deny', 'push'];

/** `spec-016` §2.2's refusal of a role map without `default` (the design's message). */
const NO_DEFAULT = 'a role map must declare a default entry, the fragment of every role it does not name (spec-016 §2.2)';

type Manifest = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = 'interactive' | 'headless';
const KINDS: readonly Kind[] = ['interactive', 'headless'];

function fake(): Manifest {
  return load(readFileSync(FIXTURE, 'utf-8')) as Manifest;
}

/** The fake with `launch.<kind>.permissions` set to `permissions`. */
function withPermissions(kind: Kind, permissions: unknown): Manifest {
  const manifest = fake();
  manifest.launch[kind].permissions = permissions;
  return manifest;
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

/** `launch.<kind>.permissions` of a parsed manifest, read through a record. */
function permissionsOf(manifest: Manifest, kind: Kind): unknown {
  const launch = parse(manifest).launch as Record<string, Record<string, unknown> | undefined>;
  return launch[kind]?.['permissions'];
}

/** The issues as `{ code, path }`, the message left to the per-case matcher. */
const located = (issues: readonly ValidationIssue[]): { code: string; path: string }[] => issues.map((issue) => ({ code: issue.code, path: issue.path }));

describe.each(KINDS)('task-339 AC 1 — launch.%s.permissions (spec-016 §2.2, dl-223 (b))', (kind) => {
  const field = `launch.${kind}.permissions`;

  describe('(a) accepted and parsed as declared', () => {
    it.each<[string, unknown]>([
      ['a fragment', W],
      ['an empty fragment', []],
      ['a fragment holding an empty string', ['--allow', '']],
      ['a role map with default (keys not checked against team.roles)', { default: D, reviewer: R, 'tech-lead': [] }],
    ])('%s', (_label, permissions) => {
      const manifest = withPermissions(kind, permissions);
      expect(issuesOf(manifest)).toEqual([]);
      expect(permissionsOf(manifest, kind)).toEqual(permissions);
    });

    it('absent: the manifest still validates and declares none (it is optional)', () => {
      expect(issuesOf(fake())).toEqual([]);
      expect(permissionsOf(fake(), kind)).toBeUndefined();
    });
  });

  describe(`(b) any other shape is refused at ${field} or below it`, () => {
    it.each<[string, unknown]>([
      ['a string', '--allow read'],
      ['a number', 1],
      ['null', null],
      ['a list holding a non-string', ['--allow', 1]],
      ['a map whose value is a string', { default: '--allow' }],
      ['a map whose value holds a non-string', { default: ['--allow', 1] }],
    ])('%s', (_label, permissions) => {
      const issues = issuesOf(withPermissions(kind, permissions));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.map((issue) => issue.path).every((path) => path === field || path.startsWith(`${field}.`))).toBe(true);
    });
  });

  it(`(c) a role map without default → exactly E_ADAPTER_MANIFEST at ${field}`, () => {
    const issues = issuesOf(withPermissions(kind, { reviewer: R }));
    expect(located(issues)).toEqual([{ code: E_ADAPTER_MANIFEST, path: field }]);
    expect(issues[0]?.message).toBe(NO_DEFAULT);
  });

  describe('(d) it holds no placeholder (§2.3)', () => {
    it(`a §2.3 placeholder in a fragment → E_ADAPTER_PLACEHOLDER at ${field}.1, not legal there`, () => {
      const issues = issuesOf(withPermissions(kind, ['--allow', '{bootstrap}']));
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: `${field}.1` }]);
      expect(issues[0]?.message).toMatch(/placeholder \{bootstrap\} is not legal here/);
    });

    it(`a §2.3 placeholder in a map entry → E_ADAPTER_PLACEHOLDER at ${field}.developer.0`, () => {
      const issues = issuesOf(withPermissions(kind, { default: D, developer: ['{session_id}'] }));
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: `${field}.developer.0` }]);
      expect(issues[0]?.message).toMatch(/placeholder \{session_id\} is not legal here/);
    });

    it(`an unknown placeholder → E_ADAPTER_PLACEHOLDER at ${field}.0, unknown`, () => {
      const issues = issuesOf(withPermissions(kind, ['{role}']));
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: `${field}.0` }]);
      expect(issues[0]?.message).toMatch(/unknown placeholder \{role\}/);
    });
  });
});
