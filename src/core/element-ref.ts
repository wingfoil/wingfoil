/**
 * The element-ref, `<type>:<id>` (`spec-008` §7): how a surface names one Memory element by type —
 * the `{role}-session` Prompt's `element` argument (task-195, `spec-004` §3.1) and `agent execute
 * --element` (`spec-016`, task-218). One parser, so both surfaces accept and refuse the same strings.
 *
 * The grammar (`spec-008` §7, as tightened by task-195): exactly one `:`; a non-empty `<type>` before it
 * and a non-empty `<id>` after it; no whitespace, no control character, and no `-->` anywhere — the
 * `spec-012` §7 payload header and its `<!-- begin:<type>:<id> -->` markers could not carry one. Nothing
 * else is checked here: whether `<type>` is a `memory.yaml` type and whether `<id>` names an element are
 * questions for whoever resolves the ref.
 */
import type { ExecutionContextElement } from './context';
import { coreErr, coreOk, type CoreResult } from './types';

// eslint-disable-next-line no-control-regex
const ELEMENT_REF = /^([^:\s\u0000-\u001f\u007f]+):([^:\s\u0000-\u001f\u007f]+)$/;

/** The refusal text of a malformed element-ref: the ref as a JSON string, so no byte of it is lost or interpreted. */
export function malformedElementRefMessage(ref: string): string {
  return `malformed element-ref ${JSON.stringify(ref)}: expected <type>:<id>`;
}

/**
 * Parse `ref` as an element-ref.
 *
 * @returns The `{type, id}` it names, or `VALIDATION` with {@link malformedElementRefMessage} when it
 *   does not follow the grammar in this module's doc.
 */
export function parseElementRef(ref: string): CoreResult<ExecutionContextElement> {
  const match = ELEMENT_REF.exec(ref);
  if (match === null || ref.includes('-->')) return coreErr({ code: 'VALIDATION', message: malformedElementRefMessage(ref) });
  return coreOk({ type: match[1]!, id: match[2]! });
}
