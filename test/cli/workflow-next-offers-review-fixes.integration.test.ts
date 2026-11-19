/**
 * task-376, red after review — two defects of the offered commands, on the compiled `dist/cli.js` (`spec-017` §6.1).
 *
 * - R1: the console of `workflow next` never quotes a `--set` placeholder, whatever characters the token name holds.
 * - R3: `workflow next` offers no `memory deprecate` for a created element already `deprecated`: the element is listed
 *   in the action's `notOffered`, with the reason §6.1 declares, and the verb itself refuses it.
 *
 * The project is what `wingfoil init --template Scrum --no-interactive` writes, with the workflows below. Children run
 * without the agent markers (`test/agent-markers.cjs`). `dist/` is built once by jest's `globalSetup` (`bug-003`).
 * Deterministic: fixed fixture, fixed identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;

const PLACEHOLDERS = `name: placeholders
startable: true
phases:
  - name: capture
    actions:
      - 'memory.add(type: task, title: "Under")'
      - 'memory.add(type: bug, title: "Hyphen")'
      - 'memory.add(type: adr, title: "Plain")'
`;

/** One phase: the step stays open on the path its first element has not committed. */
const SAME_PHASE = `name: same-phase
startable: true
phases:
  - name: make
    actions:
      - 'memory.add(type: tech-spec, title: "Anchor")'
      - 'memory.add(type: decision-log, title: "Second")'
      - memory.deprecate
    produces:
      - { type: tech-spec, path: "docs/notes/{id}.md" }
`;

/** Two phases: the second creates and deprecates, and stays open on the path of its element. */
const LATER_PHASE = `name: later-phase
startable: true
phases:
  - name: first
    actions:
      - 'memory.add(type: tech-spec, title: "Anchor")'
  - name: second
    actions:
      - 'memory.add(type: decision-log, title: "Second")'
      - memory.deprecate
    produces:
      - { type: decision-log, path: "docs/notes/{id}.md" }
`;

const WORKFLOWS: Record<string, string> = { placeholders: PLACEHOLDERS, 'same-phase': SAME_PHASE, 'later-phase': LATER_PHASE };

const ANCHOR = 'spec-001-anchor';
const SECOND = 'dl-001-second';
const THIRD = 'dl-002-third';

interface ElementRef {
  type: string;
  id: string;
  status: string;
}
interface OfferedAction {
  token: string;
  binding: { argv?: string[]; commands?: string[][] };
  notOffered?: { element: ElementRef; reason: string }[];
}
interface NextPayload {
  instance: { id: string };
  next: { key: string; actions: OfferedAction[] };
}

function wingfoil(cwd: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...withoutAgentMarkers(process.env) } as NodeJS.ProcessEnv });
}

function must(cwd: string, args: readonly string[]): SpawnedRun {
  const run = wingfoil(cwd, args);
  if (run.status !== 0) throw new Error(`wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return run;
}

function setIdentity(repo: string): void {
  git(repo, ['config', 'user.name', 'Demo Dev']);
  git(repo, ['config', 'user.email', 'demo@example.invalid']);
}

function patch(repo: string, path: string, from: string, to: string): void {
  const text = readFileSync(join(repo, path), 'utf-8');
  if (!text.includes(from)) throw new Error(`${path} does not hold: ${from}`);
  writeFixtureFile(repo, path, text.replace(from, to));
}

function buildBase(): string {
  const repo = makeTempGitRepo();
  setIdentity(repo);
  must(repo, ['init', '--template', 'Scrum', '--no-interactive']);
  patch(repo, '.wingfoil/memory.yaml', 'path: docs/memory/task/{id}.md', 'path: docs/memory/{rel_line}/{id}.md');
  patch(repo, '.wingfoil/memory.yaml', 'path: docs/memory/bug/{id}.md', 'path: docs/memory/{rel-line}/{id}.md');
  patch(repo, '.wingfoil/memory.yaml', 'path: docs/memory/adr/{id}.md', 'path: docs/memory/{release}/{id}.md');
  patch(repo, '.wingfoil/dna.yaml', '  members: []\n', '  members:\n    - name: Demo Dev\n      email: demo@example.invalid\n      roles: [ approver, developer ]\n');
  writeFixtureFile(
    repo,
    '.wingfoil/workflows.yaml',
    `version: 1\nformat: 1\n\ninclude:\n${Object.keys(WORKFLOWS).map((name) => `  - workflows/custom/${name}.yaml\n`).join('')}`,
  );
  for (const [name, content] of Object.entries(WORKFLOWS)) writeFixtureFile(repo, `.wingfoil/workflows/custom/${name}.yaml`, content);
  commitAll(repo, 'the fixture workflows');
  return repo;
}

function nextJson(repo: string, ref: string): NextPayload {
  return JSON.parse(must(repo, ['workflow', 'next', ref, '--format', 'json']).stdout) as NextPayload;
}

function deprecateOf(payload: NextPayload): OfferedAction {
  const found = payload.next.actions.find((entry) => entry.token === 'memory.deprecate');
  if (found === undefined) throw new Error(`no memory.deprecate in ${payload.next.key}`);
  return found;
}

const deprecated = (id: string): { element: ElementRef; reason: string } => ({
  element: { type: 'decision-log', id, status: 'deprecated' },
  reason: "no deprecate edge from 'deprecated'",
});

describe('task-376 red after review (spec-017 §6.1)', () => {
  const repos: string[] = [];
  let base: string;

  function project(): string {
    const repo = cloneTempRepo(base);
    repos.push(repo);
    setIdentity(repo);
    return repo;
  }

  beforeAll(() => {
    base = buildBase();
  }, TIMEOUT_MS);
  afterAll(() => {
    for (const repo of [...repos, base]) removeTempDir(repo);
  });

  describe('R1 — the console never quotes a placeholder, whatever its name', () => {
    it.each<[string, string]>([
      ['an underscore', 'rel_line'],
      ['a hyphen', 'rel-line'],
      ['neither', 'release'],
    ])('a token name holding %s: --set %s=<...> is printed with no quotes', (_kind, name) => {
      const repo = project();
      must(repo, ['workflow', 'start', 'placeholders']);
      const text = must(repo, ['workflow', 'next', 'placeholders']).stdout;
      expect(text).toContain(` --set ${name}=<${name}> --workflow `);
      expect(text).not.toContain(`'${name}=<${name}>'`);
    }, TIMEOUT_MS);
  });

  describe('R3 — no command for an element already deprecated', () => {
    /** `same-phase` with its two elements created and the second one deprecated. */
    function samePhase(): string {
      const repo = project();
      must(repo, ['workflow', 'start', 'same-phase']);
      must(repo, ['memory', 'add', '--type', 'tech-spec', '--title', 'Anchor', '--workflow', 'same-phase', '--step', 'same-phase.make']);
      must(repo, ['memory', 'add', '--type', 'decision-log', '--title', 'Second', '--workflow', 'same-phase', '--step', `same-phase.make@tech-spec:${ANCHOR}`]);
      must(repo, ['memory', 'deprecate', SECOND]);
      return repo;
    }

    /** `later-phase` at its second phase, with `titles` created there. */
    function laterPhase(titles: readonly string[]): string {
      const repo = project();
      must(repo, ['workflow', 'start', 'later-phase']);
      must(repo, ['memory', 'add', '--type', 'tech-spec', '--title', 'Anchor', '--workflow', 'later-phase', '--step', 'later-phase.first']);
      for (const title of titles) {
        must(repo, ['memory', 'add', '--type', 'decision-log', '--title', title, '--workflow', 'later-phase', '--step', `later-phase.second@tech-spec:${ANCHOR}`]);
      }
      return repo;
    }

    it('control: the verb refuses the element, exit 1', () => {
      const run = wingfoil(samePhase(), ['memory', 'deprecate', SECOND]);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`document already deprecated: ${SECOND}`);
    }, TIMEOUT_MS);

    it('created in the same phase: no command, and the element is reported apart with the reason', () => {
      const action = deprecateOf(nextJson(samePhase(), 'same-phase'));
      expect(action.binding.argv).toBeUndefined();
      expect(action.binding.commands).toBeUndefined();
      expect(action.notOffered).toEqual([deprecated(SECOND)]);
    }, TIMEOUT_MS);

    it('created in a later phase: no command, and the element is reported apart with the reason', () => {
      const repo = laterPhase(['Second']);
      must(repo, ['memory', 'deprecate', SECOND]);
      const action = deprecateOf(nextJson(repo, 'later-phase'));
      expect(action.binding.argv).toBeUndefined();
      expect(action.binding.commands).toBeUndefined();
      expect(action.notOffered).toEqual([deprecated(SECOND)]);
    }, TIMEOUT_MS);

    it('the console prints no memory deprecate command and names the reason', () => {
      const text = must(samePhase(), ['workflow', 'next', 'same-phase']).stdout;
      expect(text).not.toContain(`wingfoil memory deprecate ${SECOND}`);
      expect(text).toContain("no deprecate edge from 'deprecated'");
    }, TIMEOUT_MS);

    it('beside an element still live: the command names only the live one', () => {
      const repo = laterPhase(['Second', 'Third']);
      must(repo, ['memory', 'deprecate', SECOND]);
      const action = deprecateOf(nextJson(repo, 'later-phase'));
      expect(action.binding.argv).toEqual(['wingfoil', 'memory', 'deprecate', THIRD]);
      expect(action.binding.commands).toBeUndefined();
      expect(action.notOffered).toEqual([deprecated(SECOND)]);
    }, TIMEOUT_MS);

    it('characterization: an element not deprecated keeps its command', () => {
      const action = deprecateOf(nextJson(laterPhase(['Second']), 'later-phase'));
      expect(action.binding.argv).toEqual(['wingfoil', 'memory', 'deprecate', SECOND]);
      expect(action.notOffered).toBeUndefined();
    }, TIMEOUT_MS);
  });
});
