/**
 * task-295 (design "Per-AC classification"; task-293 retrospective: a design that adds barrel re-exports names the
 * test that reads them) — the `src/core` barrel re-exports the values `workflow rekey` adds, unchanged:
 * `workflowRekeyAtHead`, `renderRekeyConsole` and `REKEY_UNAUTHORIZED` from `src/core/workflow-rekey.ts`,
 * `rekeySubject` and `rekeyTrailers` from `src/core/provenance-record.ts`.
 *
 * Red until green: TS2305 for the barrel names, TS2307 for the two modules (the second is task-294's, not on this
 * branch yet); "Cannot find module" under jest.
 */
import {
  REKEY_UNAUTHORIZED,
  rekeySubject,
  rekeyTrailers,
  renderRekeyConsole,
  workflowRekeyAtHead,
} from '../../src/core';
import { rekeySubject as recordRekeySubject, rekeyTrailers as recordRekeyTrailers } from '../../src/core/provenance-record';
import {
  REKEY_UNAUTHORIZED as MODULE_REKEY_UNAUTHORIZED,
  renderRekeyConsole as moduleRenderRekeyConsole,
  workflowRekeyAtHead as moduleWorkflowRekeyAtHead,
} from '../../src/core/workflow-rekey';

describe('task-295 — the src/core barrel re-exports the rekey values unchanged', () => {
  it('workflowRekeyAtHead, renderRekeyConsole and REKEY_UNAUTHORIZED are the workflow-rekey module exports', () => {
    expect(typeof workflowRekeyAtHead).toBe('function');
    expect(workflowRekeyAtHead).toBe(moduleWorkflowRekeyAtHead);
    expect(renderRekeyConsole).toBe(moduleRenderRekeyConsole);
    expect(REKEY_UNAUTHORIZED).toBe(MODULE_REKEY_UNAUTHORIZED);
  });

  it('rekeySubject and rekeyTrailers are the provenance-record module exports', () => {
    expect(typeof rekeySubject).toBe('function');
    expect(rekeySubject).toBe(recordRekeySubject);
    expect(rekeyTrailers).toBe(recordRekeyTrailers);
  });
});
