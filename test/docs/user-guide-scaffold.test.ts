/**
 * task-296 (bug-400, patch-v0.3.1) AC 4 — `docs/user-guide.md` §7's table of the workflows `init` gives you
 * names the phases the scaffold declares (characterization: it matches the scaffold today, and the task's
 * scaffold change must carry the guide with it). The scaffold is read from `templateScaffold`, for both
 * templates; the table's rows are `sw-life-cycle`, the `<slug>-delivery` pair and the three ingest mains.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { load as loadYaml } from 'js-yaml';

import { TEMPLATES, templateScaffold, type TemplateDefinition } from '../../src/storage/templates';

const GUIDE = readFileSync(join(__dirname, '..', '..', 'docs', 'user-guide.md'), 'utf-8');

/** The rows of the first table under `## 7. Workflows`: first cell (backticked names) → last cell. */
function workflowTableRows(): Array<{ names: string[]; phases: string }> {
  const lines = GUIDE.split('\n');
  const start = lines.findIndex((l) => /^## 7\. Workflows\b/.test(l));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const section = lines.slice(start + 1, end === -1 ? undefined : end);
  const first = section.findIndex((l) => l.startsWith('|'));
  expect(first).toBeGreaterThanOrEqual(0);
  const table: string[] = [];
  for (const line of section.slice(first)) {
    if (!line.startsWith('|')) break;
    table.push(line);
  }
  // Header, separator, then the body rows.
  return table.slice(2).map((row) => {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    const names = [...cells[0]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    return { names, phases: cells[cells.length - 1]! };
  });
}

/** `a → b → c`: the phase names of the scaffold's workflow `name`, in order. */
function scaffoldPhases(def: TemplateDefinition, name: string): string {
  const file = templateScaffold(def).find(
    (f) => f.path.startsWith('.wingfoil/workflows/custom/') && (loadYaml(f.content) as { name?: string }).name === name,
  );
  expect([name, file === undefined]).toEqual([name, false]);
  const doc = loadYaml(file!.content) as { phases: Array<{ name: string }> };
  return doc.phases.map((p) => p.name).join(' → ');
}

describe('task-296 AC 4 — user-guide §7 names the phases the scaffold declares', () => {
  const rows = workflowTableRows();

  function rowNaming(name: string): { names: string[]; phases: string } {
    const row = rows.find((r) => r.names.includes(name));
    expect([name, row === undefined]).toEqual([name, false]);
    return row!;
  }

  for (const def of TEMPLATES) {
    for (const name of ['sw-life-cycle', `${def.slug}-delivery`, 'bug-ingest', 'decision-log-ingest', 'adr-ingest']) {
      it(`${def.name}: the row naming ${name} lists its phases as the scaffold declares them`, () => {
        expect(rowNaming(name).phases).toBe(scaffoldPhases(def, name));
      });
    }
  }
});
