/**
 * task-296 (bug-400, patch-v0.3.1) AC 4 — `docs/user-guide.md` §7's table of the workflows `init` gives you
 * names the phases the scaffold declares (characterization: it matches the scaffold today, and the task's
 * scaffold change must carry the guide with it). The scaffold is read from `templateScaffold`, for both
 * templates; the table's rows are `sw-life-cycle`, the `<slug>-delivery` pair and the three ingest mains.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { load as loadYaml } from 'js-yaml';

import { loadWorkflowsYaml } from '../../src/core/loaders';
import { formatDiagnostic, ValidationError, type Diagnostic } from '../../src/validation';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import {
  TEMPLATES,
  initProjectCommitMessage,
  resolveTemplate,
  templateScaffold,
  type TemplateDefinition,
} from '../../src/storage/templates';

const GUIDE = readFileSync(join(__dirname, '..', '..', 'docs', 'user-guide.md'), 'utf-8');
const CLI_REFERENCE = readFileSync(join(__dirname, '..', '..', 'docs', 'cli-reference.md'), 'utf-8');

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

/**
 * task-321 AC 2 (`bug-409`) — the user guide and the CLI reference quote the `init` commit subject as
 * `initProjectCommitMessage` writes it, with no internal feature id.
 */
describe('task-321 AC 2 — the docs quote the init commit subject without an internal feature id (bug-409)', () => {
  const SUBJECT = 'chore(wingfoil): initialize .wingfoil/ with the Scrum template';

  it('the user guide quotes the Scrum subject init writes', () => {
    expect(initProjectCommitMessage(resolveTemplate('Scrum') as TemplateDefinition)).toBe(SUBJECT);
    expect(GUIDE).toContain(`The commit is \`${SUBJECT}\``);
  });

  it('the CLI reference quotes the subject with its <Template> placeholder', () => {
    expect(CLI_REFERENCE).toContain('**Commit:** `chore(wingfoil): initialize .wingfoil/ with the <Template> template`');
  });

  it('neither document puts (P5.1.1) next to initialize .wingfoil/', () => {
    for (const [name, text] of [['docs/user-guide.md', GUIDE], ['docs/cli-reference.md', CLI_REFERENCE]] as const) {
      const quoted = text.split('\n').filter((line) => line.includes('initialize .wingfoil/') && line.includes('(P5.1.1)'));
      expect([name, quoted]).toEqual([name, []]);
    }
  });
});

/**
 * task-325 AC (`bug-394`) — the user guide's §12 quotes the line the program prints for the 0.2.x include path.
 * The quoted line is built from the code (the real Scrum scaffold with its include rewritten to the 0.2.x path),
 * so the guide and the diagnostic cannot drift.
 */
describe('task-325 — user-guide §12 quotes the E_WORKFLOW_INCLUDE_UNRESOLVED line the code produces (bug-394)', () => {
  function producedLine(): string {
    const repo = makeTempGitRepo();
    try {
      for (const file of templateScaffold(resolveTemplate('Scrum') as TemplateDefinition)) {
        const content = file.path.endsWith('workflows/custom/sw-life-cycle.yaml')
          ? file.content.replace('include: scrum-delivery\n', 'include: workflows/custom/scrum-delivery.yaml\n')
          : file.content;
        writeFixtureFile(repo, file.path, content);
      }
      try {
        loadWorkflowsYaml(repo);
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const diagnostics = (err as unknown as { diagnostics: Diagnostic[] }).diagnostics;
        return formatDiagnostic(diagnostics[0] as Diagnostic);
      }
      throw new Error('expected loadWorkflowsYaml to throw');
    } finally {
      removeTempDir(repo);
    }
  }

  it('characterization — the guide has its numbered "Upgrading from 0.2.x" heading, the section the message names', () => {
    expect(GUIDE).toMatch(/^## \d+\. Upgrading from 0\.2\.x$/m);
  });

  it('AC — the guide quotes the diagnostic line exactly as formatDiagnostic renders it', () => {
    const line = producedLine();
    expect(line).toContain("write 'include: scrum-delivery'");
    expect(GUIDE.replace(/\s+/g, ' ')).toContain(line);
  });
});
