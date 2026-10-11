/**
 * task-229 (`dl-130` step 4, Q3 (a); `dl-088`) — the `service` verify sweep before a publish.
 *
 * `release-publishing.yaml`'s `publish` phase declares `services.verify-sweep` among its `checks.pre`, bound in
 * `bindings.yaml` at `severity: warn` (it reports, and blocks nothing in its first release, as `dl-023`'s gate
 * was staged). The bound command, `scripts/service-verify-sweep.cjs`, LISTS every `pending` and `active`
 * service element's `verify:` command, read at `HEAD` (command-baseline), for the approver to run and record:
 * the script runs none of them (the agent never acts inside a third-party account). What the check asserts
 * (testing T1) is that the list is complete — every listed service names a `verify:` and every service file
 * parses — not that any service is healthy.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { renderSweep, serviceSweep } from '../../scripts/service-verify-sweep.cjs';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'service-verify-sweep.cjs');

function service(id: string, status: string, verify: string, owner = 'approver'): string {
  return [
    '---',
    `id: "${id}"`,
    'type: service',
    `title: "${id}"`,
    `status: ${status}   # inline comment`,
    'provider: "GitHub"',
    'kind: "setting"',
    `owner_role: "${owner}"`,
    `verify: ${JSON.stringify(verify)}`,
    '---',
    '',
    '## Purpose',
    '',
  ].join('\n');
}

const MEMORY_YAML = ['version: 1', 'types:', '  service:', '    path: "ops/services/{id}.md"', ''].join('\n');

describe('serviceSweep (task-229) — what the approver runs', () => {
  const docs = [
    { path: 'ops/services/svc-001-a.md', text: service('svc-001-a', 'active', "gh api repos/o/r --jq '.name'") },
    { path: 'ops/services/svc-002-b.md', text: service('svc-002-b', 'deprecated', 'npm view x') },
    { path: 'ops/services/svc-003-c.md', text: service('svc-003-c', 'pending', 'https://example.invalid/c', 'tech-lead') },
    { path: 'ops/services/svc-004-d.md', text: service('svc-004-d', 'draft', '') },
  ];

  it('lists the pending and active services in path order, counts draft and deprecated, and finds no problem', () => {
    const result = serviceSweep(docs);
    expect(result.listed).toEqual([
      { id: 'svc-001-a', status: 'active', owner_role: 'approver', verify: "gh api repos/o/r --jq '.name'", path: 'ops/services/svc-001-a.md' },
      { id: 'svc-003-c', status: 'pending', owner_role: 'tech-lead', verify: 'https://example.invalid/c', path: 'ops/services/svc-003-c.md' },
    ]);
    expect(result.skipped).toEqual({ draft: 1, deprecated: 1 });
    expect(result.problems).toEqual([]);
  });

  it('is independent of the input order (sorted by path)', () => {
    expect(serviceSweep([...docs].reverse())).toEqual(serviceSweep(docs));
  });

  it('reports a listed service with a blank `verify:` and a file whose frontmatter does not parse', () => {
    const result = serviceSweep([
      { path: 's/svc-009-x.md', text: service('svc-009-x', 'active', '   ') },
      { path: 's/svc-010-y.md', text: '---\nid: [unclosed\n---\n' },
      { path: 's/svc-011-z.md', text: 'no frontmatter at all\n' },
    ]);
    expect(result.listed.map((s) => s.id)).toEqual(['svc-009-x']);
    expect(result.problems).toEqual([
      's/svc-009-x.md: service svc-009-x has no verify command',
      expect.stringMatching(/^s\/svc-010-y\.md: unreadable frontmatter/),
      's/svc-011-z.md: unreadable frontmatter (no leading --- block)',
    ]);
  });

  it('renders a checklist naming each service, its status, its owner role and its command, and the commit read', () => {
    const text = renderSweep(serviceSweep(docs), { commit: 'abc1234' });
    expect(text).toContain('# Service verify sweep — 2 services at abc1234');
    expect(text).toMatch(/runs none of them/);
    expect(text).toContain("- [ ] svc-001-a — active, owner_role approver\n      verify: gh api repos/o/r --jq '.name'");
    expect(text).toContain('- [ ] svc-003-c — pending, owner_role tech-lead\n      verify: https://example.invalid/c');
    expect(text).toContain('Not listed: 1 draft, 1 deprecated.');
    expect(text).not.toContain('svc-002-b');
  });
});

describe('service-verify-sweep command line (task-229) — reads HEAD', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, 'ops/services/svc-001-a.md', service('svc-001-a', 'active', 'gh api repos/o/r'));
    commitAll(repo, 'fixture');
  });
  afterEach(() => removeTempDir(repo));

  const run = (...args: string[]): ReturnType<typeof spawnSync> =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

  it('prints the checklist at HEAD and exits 0; an uncommitted service is not read', () => {
    writeFixtureFile(repo, 'ops/services/svc-002-b.md', service('svc-002-b', 'active', ''));
    const head = git(repo, ['rev-parse', '--short', 'HEAD']).trim();
    const result = run('--root', repo);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`# Service verify sweep — 1 services at ${head}`);
    expect(result.stdout).toContain('- [ ] svc-001-a — active');
    expect(result.stdout).not.toContain('svc-002-b');
  });

  it('exits 1 and names the problem on stderr when a committed service has no verify command, still listing the rest', () => {
    writeFixtureFile(repo, 'ops/services/svc-002-b.md', service('svc-002-b', 'pending', ''));
    commitAll(repo, 'blank verify');
    const result = run('--root', repo);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('svc-001-a');
    expect(result.stderr).toContain('error: ops/services/svc-002-b.md: service svc-002-b has no verify command');
  });

  it('exits 2 when memory.yaml at HEAD declares no service type, or the root is not a repository, or an option is unknown', () => {
    writeFixtureFile(repo, '.wingfoil/memory.yaml', 'version: 1\ntypes: {}\n');
    commitAll(repo, 'no service type');
    expect(run('--root', repo).status).toBe(2);
    expect(run('--root', join(repo, 'ops', 'services', 'svc-001-a.md')).status).toBe(2);
    expect(run('--bogus').status).toBe(2);
    expect(run('--root').status).toBe(2);
  });
});

describe('this repository (task-229) — the sweep lists every pending and active service at HEAD', () => {
  it('exits 0 and lists exactly the services HEAD records as pending or active', () => {
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
    expect(result.status).toBe(0);
    const files = git(REPO_ROOT, ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'docs/04_memory/services/'])
      .split('\n')
      .filter((f) => f.endsWith('.md'));
    const expected = files
      .map((f) => ({ f, text: git(REPO_ROOT, ['show', `HEAD:${f}`]) }))
      .filter(({ text }) => /^status:\s*(pending|active)\b/m.test(text))
      .map(({ f }) => f.slice('docs/04_memory/services/'.length, -'.md'.length));
    expect(expected.length).toBeGreaterThan(0);
    const listed = [...result.stdout.matchAll(/^- \[ \] (\S+) — /gm)].map((m) => m[1]);
    expect(listed).toEqual(expected);
  });
});

describe('the declaration (task-229) — release-publishing publish.checks.pre and its binding', () => {
  interface Phase {
    readonly name: string;
    readonly checks?: { readonly pre?: readonly string[] };
  }
  const workflow = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil/workflows/custom/release-publishing.yaml'), 'utf-8')) as { phases: Phase[] };
  const bindings = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil/workflows/bindings.yaml'), 'utf-8')) as {
    checks: Record<string, { run: string[]; severity?: string }>;
  };

  it('the publish phase declares the sweep before publishing, after tests.passing', () => {
    const publish = workflow.phases.find((p) => p.name === 'publish');
    expect(publish?.checks?.pre).toEqual(['tests.passing', 'services.verify-sweep']);
  });

  it('binds services.verify-sweep to the listing script at severity warn', () => {
    expect(bindings.checks['services.verify-sweep']).toEqual({ run: ['node', 'scripts/service-verify-sweep.cjs'], severity: 'warn' });
  });
});
