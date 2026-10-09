/**
 * task-270 — the `wingfoil-cli` directive (`dl-163` S3e): which WingFoil build runs which command in this
 * repository, bound to every role.
 *
 * - AC 1 (characterization, documentation): the directive says the code build runs the Memory operations, the
 *   pinned build the read commands and MCP; the verb where the build has one, else the hand procedure and
 *   `dl-095` Q3; it points to the `pinned-build` tag without listing a bug; `advance-pinned-build` re-checks it;
 *   no inbox here, defects go to `bug-ingest`.
 * - AC 2 (red-first): `roles.yaml` binds `wingfoil-cli` globally, so `directives list --role <r>` lists it,
 *   as a global binding, for every role `dna.yaml` declares under `team.roles`.
 * - AC 3 (characterization): `release-planning.yaml`'s `advance-pinned-build` names the re-check, in its
 *   description and as a post check.
 *
 * Reads this repository's working tree, as the other live-configuration suites do
 * (`test/core/directives-list.test.ts`, `test/directives/schema.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreOperation } from '../../src/core/registry';

const ROOT = join(__dirname, '..', '..');
const ID = 'wingfoil-cli';

interface ListedDirective {
  readonly path: string;
  readonly frontmatter: { readonly id: string };
  readonly global: boolean;
}

function directivesList(): CoreOperation {
  const operation = CORE_MODULES.find((entry) => entry.name === 'directives')?.operations['directivesList'];
  if (!operation) throw new Error('no `directivesList` operation registered in the `directives` module');
  return operation;
}

/** The entries `directives list --role <role>` prints, through the registered core operation (spec-006 §2). */
async function listForRole(role: string): Promise<readonly ListedDirective[]> {
  const result = await directivesList().fn({ root: ROOT, options: { role } });
  if (!result.ok) throw new Error(`directives list --role ${role}: ${result.error.code}: ${result.error.message}`);
  return (result.value as { entries: readonly ListedDirective[] }).entries;
}

/** The role names `dna.yaml` declares (`team.roles[].name`), in file order. */
function dnaRoles(): string[] {
  const dna = load(readFileSync(join(ROOT, '.wingfoil', 'dna.yaml'), 'utf-8')) as { team: { roles: { name: string }[] } };
  return dna.team.roles.map((role) => role.name);
}

describe('AC 2 — wingfoil-cli is bound globally (task-270, dl-163 S3e)', () => {
  it('roles.yaml lists wingfoil-cli under global:', () => {
    const roles = load(readFileSync(join(ROOT, '.wingfoil', 'roles.yaml'), 'utf-8')) as { global: string[] };
    expect(roles.global).toContain(ID);
  });

  it('dna.yaml declares the eight roles this suite walks', () => {
    expect(dnaRoles()).toEqual(['developer', 'reviewer', 'qa', 'architect', 'product-owner', 'tech-lead', 'facilitator', 'approver']);
  });

  it.each(dnaRoles())('directives list --role %s lists wingfoil-cli as a global binding', async (role) => {
    const entries = (await listForRole(role)).filter((entry) => entry.frontmatter.id === ID);
    expect(entries.map((entry) => [entry.path, entry.global])).toEqual([[`directives/custom/${ID}.md`, true]]);
  });
});

const TEXT = readFileSync(join(ROOT, '.wingfoil', 'directives', 'custom', `${ID}.md`), 'utf-8');

function section(number: number): string {
  const start = TEXT.search(new RegExp(`\\n## ${number}\\. `));
  if (start < 0) throw new Error(`wingfoil-cli has no section "## ${number}."`);
  const end = TEXT.indexOf('\n## ', start + 1);
  return TEXT.slice(start, end < 0 ? undefined : end);
}

describe('AC 1 — what the directive says (task-270, dl-163 S3e)', () => {
  it('declares itself global and cites dl-163 S3e and dl-095', () => {
    const header = TEXT.slice(0, TEXT.indexOf('\n---', 4));
    expect(header).toMatch(/^id: wingfoil-cli$/m);
    expect(header).toMatch(/^scope: global$/m);
    expect(TEXT).toContain('`dl-163-consumer-projects-feedback-sources-and-the-feedback-loop` S3e');
    expect(TEXT).toContain('`dl-095-which-wingfoil-build-develops-wingfoil`');
  });

  it('§1: the code build for Memory operations, the pinned build for the read commands and MCP', () => {
    const s1 = section(1);
    expect(s1).toMatch(/\*\*Memory operations\*\*[^\n]*the \*\*code build\*\*[^\n]*`npm run build`, then `node dist\/cli\.js <command>`/);
    expect(s1).toMatch(/\*\*Read commands\*\*[^\n]*\*\*MCP\*\*[^\n]*the \*\*pinned build\*\*[^\n]*`wingfoil-released`[^\n]*`npm run -s wingfoil -- <command>`/);
    expect(s1).toMatch(/the only one that can run WingFoil\s+from its own source/);
  });

  it('§2: the verb where the build has one, otherwise the hand procedure and dl-095 Q3', () => {
    const s2 = section(2);
    expect(s2).toContain('Where the build in use has the verb, the verb is used.');
    expect(s2).toContain('the declared hand procedure is followed:** the `wf()` commit');
    expect(s2).toContain('follows `dl-095` Q3');
  });

  it('§3: points to the pinned-build tag and lists no bug', () => {
    const s3 = section(3);
    expect(s3).toContain('This directive points to the tag; it does not list the surprises.');
    expect(s3).toContain('npm run -s wingfoil -- memory search --type bug --tag pinned-build');
    expect(TEXT).not.toMatch(/\bbug-\d+/);
  });

  it('§4: advance-pinned-build re-checks it; §5: no inbox, defects go to bug-ingest', () => {
    expect(section(4)).toContain("`release-planning`'s `advance-pinned-build` phase re-checks this directive");
    expect(section(5)).toContain('This repository\n' + 'keeps none: a WingFoil defect found here goes straight to `bug-ingest`');
  });
});

describe('AC 3 — release-planning advance-pinned-build names the re-check (task-270)', () => {
  interface Phase {
    name: string;
    description: string;
    checks: { post: string[] };
  }
  const workflow = load(readFileSync(join(ROOT, '.wingfoil', 'workflows', 'custom', 'release-planning.yaml'), 'utf-8')) as {
    version: number;
    phases: Phase[];
  };
  const phase = workflow.phases.find((p) => p.name === 'advance-pinned-build')!;

  it('is version 1.8', () => {
    expect(workflow.version).toBe(1.8);
  });

  it('describes the re-check and gates it as a post check', () => {
    expect(phase.description).toContain('re-checks the `wingfoil-cli` directive (dl-163 S3e)');
    expect(phase.checks.post).toContain(
      'the wingfoil-cli directive re-checked against the new pin (its pinned-build bugs read, its build table confirmed)',
    );
  });
});
