/**
 * bug-202 (task-218) — the unknown-field warning of `spec-009` §2 rides the CLI's one warning renderer
 * (`src/cli/warning.ts`, task-169) instead of being written to stderr from inside the loaders: under
 * `--format json` every stderr line is one JSON document (`{"warning"}` then `{"error"}`), under `yaml`
 * every document parses, and under `console` it is a `warning:` line like every other warning. Driven
 * through the compiled CLI on a project whose committed `memory.yaml` carries a key no schema declares.
 */
import { loadAll } from 'js-yaml';

import { commitAll, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const UNKNOWN = /memory\.yaml: unknown field\(s\) ignored: mystery_key$/;

describe('bug-202 — the unknown-field warning goes through the warning renderer', () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    const init = runCliEntry(repo, ['init', '--template', 'Kanban']);
    if (init.status !== 0) throw new Error(`fixture: init exited ${init.status}: ${init.stderr}`);
    appendFileSync(join(repo, '.wingfoil', 'memory.yaml'), '\nmystery_key: 1\n');
    commitAll(repo, 'an unknown key in memory.yaml');
  });
  afterAll(() => removeTempDir(repo));

  it('json, refused: every stderr line is a JSON document — the warning, then the error', () => {
    const run = runCliEntry(repo, ['memory', 'submit', 'task-999-nope', '--format', 'json']);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    const documents = run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, string>);
    expect(documents.length).toBeGreaterThanOrEqual(2);
    expect(documents[0]!.warning).toMatch(UNKNOWN);
    expect(Object.keys(documents[documents.length - 1]!)).toContain('error');
    expect(documents.slice(0, -1).every((document) => Object.keys(document).join() === 'warning')).toBe(true);
  });

  it('yaml, refused: the stream parses, warning documents first', () => {
    const run = runCliEntry(repo, ['memory', 'submit', 'task-999-nope', '--format', 'yaml']);
    expect(run.status).toBe(1);
    const documents = loadAll(run.stderr) as Record<string, string>[];
    expect(documents[0]!.warning).toMatch(UNKNOWN);
    expect(Object.keys(documents[documents.length - 1]!)).toContain('error');
  });

  it('console: a `warning:` line, and no line starts with the old `Warning:`', () => {
    const run = runCliEntry(repo, ['memory', 'submit', 'task-999-nope']);
    expect(run.status).toBe(1);
    const lines = run.stderr.split('\n');
    expect(lines.some((line) => line.startsWith('warning: ') && UNKNOWN.test(line))).toBe(true);
    expect(lines.some((line) => line.startsWith('Warning: '))).toBe(false);
  });

  it('json, succeeded: stdout is the payload alone, the warning is a JSON document on stderr', () => {
    const run = runCliEntry(repo, ['memory', 'search', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(() => JSON.parse(run.stdout) as unknown).not.toThrow();
    const documents = run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, string>);
    expect(documents.some((document) => UNKNOWN.test(document.warning ?? ''))).toBe(true);
  });
});
