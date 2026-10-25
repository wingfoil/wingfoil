/**
 * task-294 (red-first) — every new runtime export of `workflow adopt` is re-exported, unchanged, by the
 * `src/core` barrel (the task-293 retrospective: an export the barrel misses is found only by the next caller),
 * and the registered operation renders through the module's own renderer.
 *
 * - `src/core/workflow-adopt.ts`: `workflowAdoptAtHead`, `renderAdoptConsole`, `BULK_ADOPT_UNAUTHORIZED`
 *   (`spec-017` §10's text);
 * - `src/core/provenance-record.ts`: `provenanceMessage`, `writeProvenanceRecord`, `adoptionSubject`,
 *   `adoptionTrailers`;
 * - `src/core/approval-authority.ts`: `requireApproverAuthority`;
 * - `src/workflow/adopt.ts`: `planAdoptions`.
 */
import * as barrel from '../../src/core';
import * as authority from '../../src/core/approval-authority';
import * as record from '../../src/core/provenance-record';
import * as operation from '../../src/core/workflow-adopt';
import * as walk from '../../src/workflow/adopt';
import { workflowOperation } from './helpers/adopt-fixture';

describe('task-294 — the src/core barrel re-exports every new runtime export unchanged', () => {
  it.each([
    ['workflowAdoptAtHead', operation],
    ['renderAdoptConsole', operation],
    ['BULK_ADOPT_UNAUTHORIZED', operation],
    ['provenanceMessage', record],
    ['writeProvenanceRecord', record],
    ['adoptionSubject', record],
    ['adoptionTrailers', record],
    ['requireApproverAuthority', authority],
    ['planAdoptions', walk],
  ] as const)('%s', (name, module) => {
    const own = (module as Record<string, unknown>)[name];
    expect(own).toBeDefined();
    expect((barrel as Record<string, unknown>)[name]).toBe(own);
  });

  it("BULK_ADOPT_UNAUTHORIZED is spec-017 §10's text", () => {
    expect(operation.BULK_ADOPT_UNAUTHORIZED).toBe('user not authorized to apply adoptions in bulk');
  });

  it("the registered workflowAdopt renders with renderAdoptConsole and is declared mutating, with the spec-008 §12 options", () => {
    const registered = workflowOperation('workflowAdopt');
    expect(registered.renderConsole).toBe(operation.renderAdoptConsole);
    expect(registered.mutates).toBe(true);
    expect(registered.positional).toMatchObject({ name: 'ref', required: true });
    expect((registered.options ?? []).map((option) => option.name).sort()).toEqual(['element', 'reason', 'step']);
    expect((registered.flags ?? []).map((flag) => flag.name).sort()).toEqual(['apply', 'plan']);
  });
});
