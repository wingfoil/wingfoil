/**
 * task-270 — the `wingfoil-cli` directive (`dl-163` S3e): which WingFoil build runs which command in this
 * repository, bound to every role.
 *
 * - AC 2 (red-first): `roles.yaml` binds `wingfoil-cli` globally, so `directives list --role <r>` lists it,
 *   as a global binding, for every role `dna.yaml` declares under `team.roles`.
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
