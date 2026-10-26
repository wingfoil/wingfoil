/**
 * task-302-prepare-minor-v0.3-for-the-engine-with-its-waves-its-tasks-waves-and-the-hand-started-instances-closed
 * (`dl-175` (a), `dl-186` S3-b and E3, `dl-100` §1 (a)) — `minor-v0.3` declares the waves v0.3 ran in and
 * each of its tasks the wave it ran in, so `release-cycle`'s `implementation` can iterate them
 * (`iterate_over: element:waves`, then the tasks whose `wave` matches).
 *
 * Reads **this repository's own Memory at `HEAD`** (`git show HEAD:<path>` through `readPathAtRev`, the
 * paths through `listMemoryDocumentPathsAtRev`), never the working tree: an uncommitted edit cannot make
 * it pass, only the approver's committed `memory amend`s can. Real files only, no fixture.
 *
 * - **AC 1 (characterization).** The mapping's single source: every `docs/04_memory/v0.3/task-*.md`
 *   holds exactly one `**wave:** N` line in its Implementation Notes, `N` in `0`–`3` or `none`;
 *   4 / 42 / 34 / 82 / 2 tasks; `none` is exactly `task-252` and `task-289` (both run in `user-docs`).
 *   Passes on first run.
 * - **AC 1 + AC 2 (red-first, design gate D1–D3 (a)).** At `HEAD`, `minor-v0.3` has
 *   `waves: [w0, w1, w2, w3]`; each task whose notes say `N` has frontmatter `wave: "wN"` (`task-223`,
 *   `deprecated`, included — D2); `task-252` and `task-289` have no `wave` or `""` (D1); every
 *   non-archived task with `release: "v0.3"` and a non-empty `wave` names a key of `minor-v0.3`'s
 *   `waves`. Fails until the approver's amend batches are committed on the task branch: the developer's
 *   script alone changes no data (ruled at the design gate). The deduction's behaviour on that data is
 *   recorded by command in the task's notes, not tested here (D3 (a)).
 *
 * Determinism (REQ-SYS-07): paths are listed sorted by the helper and iterated in that order; fixed
 * expectations.
 */
import { join } from 'node:path';

import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { listMemoryDocumentPathsAtRev } from '../../src/memory';
import { readPathAtRev, splitFrontmatter } from '../../src/storage';
import { parseYaml } from '../../src/validation/yaml';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');
const REV = 'HEAD';
const V03_TASK_PREFIX = 'docs/04_memory/v0.3/task-';
const RELEASE_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.3.md';
const WAVE_KEYS = ['w0', 'w1', 'w2', 'w3'];
const NO_WAVE_TASKS = ['task-252', 'task-289'];

interface TaskAtHead {
  /** Root-relative path at `HEAD`. */
  readonly path: string;
  /** `task-<n>`, the id's numeric prefix. */
  readonly short: string;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

function readAtHead(path: string): string {
  const raw = readPathAtRev(REPO_ROOT, REV, path);
  if (raw === null) throw new Error(`${REV} holds no ${path}`);
  return raw;
}

function parseDocument(path: string, raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsed = parseYaml(frontmatter ?? '', path);
  return { frontmatter: (parsed as Record<string, unknown> | null) ?? {}, body };
}

/** Every Memory document of `HEAD`, read once. */
function memoryDocumentsAtHead(): { path: string; frontmatter: Record<string, unknown>; body: string }[] {
  const memoryYaml = loadMemoryYamlAtHead(REPO_ROOT);
  if (memoryYaml === null) throw new Error(`${REV} holds no .wingfoil/memory.yaml`);
  return listMemoryDocumentPathsAtRev(REPO_ROOT, REV, memoryYaml).map((path) => ({ path, ...parseDocument(path, readAtHead(path)) }));
}

const DOCUMENTS = memoryDocumentsAtHead();

const V03_TASKS: TaskAtHead[] = DOCUMENTS.filter((doc) => doc.path.startsWith(V03_TASK_PREFIX) && doc.path.endsWith('.md')).map(
  (doc) => {
    const match = /\/(task-\d+)-/.exec(doc.path);
    if (match === null) throw new Error(`unexpected task file name ${doc.path}`);
    return { path: doc.path, short: match[1] as string, frontmatter: doc.frontmatter, body: doc.body };
  },
);

/** The body of the `## Implementation Notes` section, up to the next `## ` heading. */
function implementationNotes(body: string): string | null {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^## Implementation Notes\s*$/.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** Every `**wave:** <value>` the Implementation Notes write: the word after the label (`0`, `3`, `none`), without the separator that may follow it (`2,`, `3 ·`, `none —`). */
function notesWaves(task: TaskAtHead): string[] {
  const notes = implementationNotes(task.body) ?? '';
  return [...notes.matchAll(/\*\*wave:\*\*\s*([A-Za-z0-9]+)/gi)].map((m) => m[1] as string);
}

/** `"wN"` for notes value `N`, `null` for `none`. */
function expectedWave(notesValue: string): string | null {
  return notesValue === 'none' ? null : `w${notesValue}`;
}

describe('task-302 — minor-v0.3 prepared for the engine: waves declared, tasks placed (read at HEAD)', () => {
  it('reads the v0.3 task files at HEAD', () => {
    expect(V03_TASKS.length).toBe(164);
  });

  describe('AC 1 (characterization) — each v0.3 task names its wave once in its Implementation Notes', () => {
    it('AC 1: every v0.3 task has exactly one **wave:** line in its Implementation Notes, valued 0–3 or none', () => {
      const offenders = V03_TASKS.map((task) => ({ task: task.short, waves: notesWaves(task) })).filter(
        ({ waves }) => waves.length !== 1 || !/^([0-3]|none)$/.test(waves[0] as string),
      );
      expect(offenders).toEqual([]);
    });

    it('AC 1: the notes place 4 / 42 / 34 / 82 tasks in waves 0–3 and 2 in none', () => {
      const counts: Record<string, number> = {};
      for (const task of V03_TASKS) {
        const value = notesWaves(task)[0] as string;
        counts[value] = (counts[value] ?? 0) + 1;
      }
      expect(counts).toEqual({ '0': 4, '1': 42, '2': 34, '3': 82, none: 2 });
    });

    it('AC 1: the tasks with no wave are exactly task-252 and task-289 (run in user-docs, D1)', () => {
      const none = V03_TASKS.filter((task) => notesWaves(task)[0] === 'none').map((task) => task.short);
      expect(none).toEqual(NO_WAVE_TASKS);
    });
  });

  describe('AC 1 + AC 2 (red-first, D3 (a)) — the data the deduction reads, committed at HEAD', () => {
    it('AC 1/2: minor-v0.3 declares waves [w0, w1, w2, w3]', () => {
      const { frontmatter } = parseDocument(RELEASE_PATH, readAtHead(RELEASE_PATH));
      expect(frontmatter['id']).toBe('minor-v0.3');
      expect(frontmatter['waves']).toEqual(WAVE_KEYS);
    });

    it('AC 1/2: every v0.3 task whose notes say wave N carries frontmatter wave "wN" (task-223 included, D2)', () => {
      const mismatches = V03_TASKS.flatMap((task) => {
        const expected = expectedWave(notesWaves(task)[0] as string);
        if (expected === null) return [];
        const actual = task.frontmatter['wave'];
        return actual === expected ? [] : [{ task: task.short, expected, actual: actual ?? '(absent)' }];
      });
      expect(mismatches).toEqual([]);
    });

    it('AC 1/2: task-223 (deprecated) carries wave "w3" (D2)', () => {
      const task223 = V03_TASKS.find((task) => task.short === 'task-223');
      expect(task223?.frontmatter['status']).toBe('deprecated');
      expect(task223?.frontmatter['wave']).toBe('w3');
    });

    it('AC 1/2: task-252 and task-289 carry no wave (absent or "", D1)', () => {
      for (const short of NO_WAVE_TASKS) {
        const task = V03_TASKS.find((t) => t.short === short);
        expect(task).toBeDefined();
        const wave = task?.frontmatter['wave'];
        expect([undefined, null, '']).toContainEqual(wave);
      }
    });

    it('AC 1/2: every non-archived task with release "v0.3" and a non-empty wave names a key of minor-v0.3 waves', () => {
      const { frontmatter } = parseDocument(RELEASE_PATH, readAtHead(RELEASE_PATH));
      const keys = Array.isArray(frontmatter['waves']) ? (frontmatter['waves'] as unknown[]) : [];
      const releaseTasks = DOCUMENTS.filter(
        (doc) =>
          doc.frontmatter['type'] === 'task' &&
          doc.frontmatter['release'] === 'v0.3' &&
          doc.frontmatter['status'] !== 'deprecated',
      );
      const waved = releaseTasks.filter((doc) => typeof doc.frontmatter['wave'] === 'string' && doc.frontmatter['wave'] !== '');
      // 164 v0.3 tasks less task-223 (deprecated, archived) and task-252 / task-289 (no wave, D1).
      expect(waved.length).toBe(161);
      const unknown = waved.filter((doc) => !keys.includes(doc.frontmatter['wave'])).map((doc) => `${doc.path}: ${String(doc.frontmatter['wave'])}`);
      expect(unknown).toEqual([]);
    });
  });
});
