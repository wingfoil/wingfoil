/**
 * DirectiveFrontmatter schema (task-004-decoupled-pillars, REQ-SYS-02) — the Directives pillar's
 * per-file YAML frontmatter shape, validated independently of the other three pillars (`memory.yaml`,
 * `dna.yaml`, `workflows.yaml`).
 *
 * The shape is specified by `spec-013-directive-frontmatter-schema` (`approved`), which `task-004`'s
 * fast-follow wrote to close the traceability gap this schema was first shipped with: its field table
 * is the authority for every key below, and this file is its reference implementation. The files are
 * `.md` with YAML frontmatter, not `.yaml` (spec-013 Context corrects REQ-SYS-02's
 * "directives/*.yaml" wording).
 *
 * `name` is REQUIRED as a `[SPEC]` field: `p3-directives/P3.5-project-directives.feature`'s "Error - a
 * directive file missing required header fields" scenario reports a file lacking `name` as invalid.
 * The other required keys are `[AUTHORING]` (spec-013 Consequences).
 *
 * `scope` and `version` are declared optional keys since `task-144` (spec-013 Revision 2026-10-01;
 * bug-113, bug-148): a directive carrying either one no longer prints spec-009's unknown-field warning.
 * `scope` does not decide anything — `roles.yaml`'s `global:` list is the authority on which directives
 * bind every role, and `directives list` reports a disagreement between the two (`src/core/directive-scope.ts`).
 *
 * `.passthrough()` per spec-009-validation-strategy §2, matching every other pillar schema.
 */
import { z } from 'zod';

import { DIRECTIVE_FORMAT, formatField, ROLES_YAML_FORMAT } from '../validation/format';

/**
 * The YAML frontmatter of a `.wingfoil/directives/**\/*.md` file, per `spec-013`'s field table. `name`
 * is required per P3.5's BDD contract. `scope` is any string: `global` is the one value spec-013
 * defines, and `directives list` reports any other rather than failing the pillar (forward
 * compatibility, approver ruling R2 2026-10-02). `version` is a string or a number, like
 * `memory.yaml`'s and `roles.yaml`'s (R1); `./version` warns when a number loses what was written.
 * `format` is the frontmatter's format, distinct from `version` (`dl-149`, task-251: absent = 1).
 * `.passthrough()` per spec-009 §2.
 */
export const DirectiveFrontmatter = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.literal('directive'),
    kind: z.string(),
    title: z.string(),
    tags: z.array(z.string()).optional(),
    ref: z.array(z.string()).optional(),
    scope: z.string().optional(),
    version: z.union([z.string(), z.number()]).optional(),
    format: formatField(DIRECTIVE_FORMAT),
  })
  .passthrough();
/** Parsed shape of the {@link DirectiveFrontmatter} schema. */
export type DirectiveFrontmatter = z.infer<typeof DirectiveFrontmatter>;

/**
 * `.wingfoil/roles.yaml` schema (task-037-role-task-scoped-context, REQ-STATE-05's
 * `directive-loader`, P3.2/P3.7) — the role → directive binding config
 * `resolveRoleDirectives`/`assembleExecutionContext` (`src/core/context.ts`) resolve against. An
 * [AUTHORING]-level shape: `spec-013` specifies the directive files only, and
 * spec-012-context-loader-relevance-filtering §5 describes the `directive-loader`'s *behavior* — "look
 * up the request role in `roles.yaml`" — but not roles.yaml's own schema, so this is grounded directly
 * in the fields the real, live
 * `.wingfoil/roles.yaml` file carries: `version`, `assignments` (role name -> directive id
 * array), and `global` (directive ids applied to every role). `assignments` keys are role names
 * (validated against `dna.yaml`'s `team.roles` catalogue elsewhere, by REQ-SYS-08/task-034 — NOT here,
 * to keep this pillar's schema independent per REQ-SYS-02); `assignments` values and `global` entries
 * are directive **ids** (`DirectiveFrontmatter.id`), not `name`s. `format` is the file's format
 * (`dl-149`, task-251: absent = 1). `.passthrough()` per spec-009 §2.
 */
export const RolesYaml = z
  .object({
    version: z.number().optional(),
    format: formatField(ROLES_YAML_FORMAT),
    assignments: z.record(z.string(), z.array(z.string())),
    global: z.array(z.string()).default([]),
  })
  .passthrough();
/** Parsed shape of the {@link RolesYaml} schema. */
export type RolesYaml = z.infer<typeof RolesYaml>;
