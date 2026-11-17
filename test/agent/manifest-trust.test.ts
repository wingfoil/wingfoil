/**
 * task-353 AC 2 (red-first, the schema half; `spec-016` §2.2 `launch.interactive.trust` / `launch.headless.trust` and
 * §2.3, as amended at the design gate `c0ac033df`; `bug-500`; approver ruling D3 (a)) — how an adapter declares the
 * folder trust of each launch kind:
 *
 * - `implied` (that launch never stops to ask), `prompt` (the CLI may stop at its start-up to ask) or an argv fragment
 *   (a list of strings: the CLI's own option that trusts the launch directory) — each accepted and returned as
 *   declared; absent by default (the field is optional);
 * - any other shape (another string, a number, a map, `null`, a list holding a non-string) is a validation issue at
 *   `launch.<kind>.trust` or below it;
 * - a fragment holds no placeholder: a §2.3 name, or an unknown one, is `E_ADAPTER_PLACEHOLDER` at its element.
 *
 * Today the strict schema refuses the key itself at `launch.<kind>` (`Unrecognized key: "trust"`): every case that
 * declares it fails on that. Every case starts from the fake adapter fixture (`test/fixtures/agents/custom/fake.yaml`,
 * unchanged), as `test/agent/manifest-permissions.test.ts` does; the field is read through a record so the suite
 * type-checks before the schema gains it. The fragments avoid every argv word the fake agent acts on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { E_ADAPTER_PLACEHOLDER, parseAdapterManifest } from '../../src/agent';
import { ValidationError, type ValidationIssue } from '../../src/validation';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');

/** A trust fragment: an option the agent CLI would read as "trust the launch directory". */
const F = ['--trust-dir', 'yes'];

type Manifest = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = 'interactive' | 'headless';
const KINDS: readonly Kind[] = ['interactive', 'headless'];

function fake(): Manifest {
  return load(readFileSync(FIXTURE, 'utf-8')) as Manifest;
}

/** The fake with `launch.<kind>.trust` set to `trust`. */
function withTrust(kind: Kind, trust: unknown): Manifest {
  const manifest = fake();
  manifest.launch[kind].trust = trust;
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

/** `launch.<kind>.trust` of a parsed manifest, read through a record. */
function trustOf(manifest: Manifest, kind: Kind): unknown {
  const launch = parse(manifest).launch as Record<string, Record<string, unknown> | undefined>;
  return launch[kind]?.['trust'];
}

const located = (issues: readonly ValidationIssue[]): { code: string; path: string }[] => issues.map((issue) => ({ code: issue.code, path: issue.path }));

describe.each(KINDS)('task-353 AC 2 — launch.%s.trust (spec-016 §2.2, bug-500)', (kind) => {
  const field = `launch.${kind}.trust`;

  describe('(a) accepted and parsed as declared', () => {
    it.each<[string, unknown]>([
      ['implied', 'implied'],
      ['prompt', 'prompt'],
      ['an argv fragment', F],
    ])('%s', (_label, trust) => {
      const manifest = withTrust(kind, trust);
      expect(issuesOf(manifest)).toEqual([]);
      expect(trustOf(manifest, kind)).toEqual(trust);
    });

    it('both kinds declared at once, each returned for its own kind', () => {
      const manifest = fake();
      manifest.launch.interactive.trust = 'prompt';
      manifest.launch.headless.trust = 'implied';
      expect(issuesOf(manifest)).toEqual([]);
      expect(trustOf(manifest, 'interactive')).toBe('prompt');
      expect(trustOf(manifest, 'headless')).toBe('implied');
    });

    it('absent: the manifest still validates and declares none (it is optional)', () => {
      expect(issuesOf(fake())).toEqual([]);
      expect(trustOf(fake(), kind)).toBeUndefined();
    });
  });

  describe(`(b) any other shape is refused at ${field} or below it`, () => {
    it.each<[string, unknown]>([
      ['another string', 'yes'],
      ['a number', 1],
      ['a map', { default: F }],
      ['null', null],
      ['a list holding a non-string', [1]],
    ])('%s', (_label, trust) => {
      const issues = issuesOf(withTrust(kind, trust));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.map((issue) => issue.path).every((path) => path === field || path.startsWith(`${field}.`))).toBe(true);
    });
  });

  describe('(c) a fragment holds no placeholder (§2.3)', () => {
    it(`a §2.3 placeholder → E_ADAPTER_PLACEHOLDER at ${field}.0, not legal there`, () => {
      const issues = issuesOf(withTrust(kind, ['{bootstrap}']));
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: `${field}.0` }]);
      expect(issues[0]?.message).toMatch(/placeholder \{bootstrap\} is not legal here/);
    });

    it(`a §2.3 placeholder later in the fragment → E_ADAPTER_PLACEHOLDER at ${field}.1`, () => {
      const issues = issuesOf(withTrust(kind, ['--trust-dir', '{session_id}']));
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: `${field}.1` }]);
      expect(issues[0]?.message).toMatch(/placeholder \{session_id\} is not legal here/);
    });

    it(`an unknown placeholder → E_ADAPTER_PLACEHOLDER at ${field}.0, unknown`, () => {
      const issues = issuesOf(withTrust(kind, ['{worktree}']));
      expect(located(issues)).toEqual([{ code: E_ADAPTER_PLACEHOLDER, path: `${field}.0` }]);
      expect(issues[0]?.message).toMatch(/unknown placeholder \{worktree\}/);
    });
  });
});
