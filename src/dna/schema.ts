/**
 * DnaYaml schema (spec-002-dna-yaml-schema) — the Project DNA structural map (P2.4). This is one of
 * the three independent per-pillar schemas task-004-decoupled-pillars keeps decoupled (REQ-SYS-02):
 * it has no dependency on `memory.yaml`'s or `workflows.yaml`'s schema, and its own validation never
 * inspects any other file.
 *
 * Every object node is `.passthrough()` per spec-009-validation-strategy §2. The TypeScript type is
 * derived exclusively via `z.infer` (spec-002: "no hand-written duplicate interface").
 */
import { z } from 'zod';

import { DNA_YAML_FORMAT, formatField } from '../validation/format';
import { ID_CHAR_CLASS, isIdPiece } from '../validation/id';
import { attributionEmailIssue, isBlankIdentityName, type AttributionEmailIssue } from '../validation/identity';

/**
 * An array of named entries in which **no two entries share a `name`**.
 *
 * `dl-081-dna-mutation-surface-shape` ratified that entries are addressed by `name`
 * (`dna update team.members.roberto.roles …`) rather than by index, because an index shifts the moment an
 * entry is removed and a path written today would address a different entry tomorrow. Uniqueness is
 * therefore not a nicety but the **prerequisite** that addressing rests on, and the ratification left
 * the mechanism open: "a uniqueness refinement per collection, or the verbs must refuse on more than
 * one match".
 *
 * This is the refinement, and it is the stronger of the two: it makes the ambiguity *unreachable*
 * rather than *handled*, so no verb needs a two-match branch that nothing could exercise, and it
 * protects the readers that are not verbs either — `resolveRoleHolders` (`./roles.ts`), the directive
 * role bindings, and every future lookup by name. It follows the precedent `spec-002` already sets
 * with `Team`'s referential `superRefine`: a same-document integrity rule that makes a violating file
 * fail to load, rather than a rule each consumer re-checks.
 *
 * Non-breaking where it matters, measured rather than assumed (task-093 AC4): WingFoil's own
 * `dna.yaml` carries 38 object entries across these six collections with zero duplicates, and every
 * `wingfoil init` template scaffolds distinct names (`test/dna/schema-uniqueness.test.ts` pins both).
 * The same name in DIFFERENT collections stays legal — a module and a role may share one.
 */
function uniquelyNamed<T extends z.ZodType>(entry: T): z.ZodArray<T> {
  return z.array(entry).superRefine((value, ctx) => {
    const firstSeen = new Map<string, number>();
    value.forEach((item, index) => {
      const name = (item as { name?: unknown } | null)?.name;
      if (typeof name !== 'string') return;
      const earlier = firstSeen.get(name);
      if (earlier === undefined) {
        firstSeen.set(name, index);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        message: `duplicate entry name "${name}" (already used at index ${earlier}); entries of a collection are addressed by name, so names must be unique`,
        path: [index, 'name'],
      });
    });
  });
}

/** `project:` — free-form project-identity block (name, description, license, north-star, ...); every field optional. */
export const Project = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    repository: z.string().optional(),
    methodology: z.string().optional(),
    north_star: z.string().optional(),
  })
  .passthrough();
/** Parsed shape of the {@link Project} schema. */
export type Project = z.infer<typeof Project>;

/** One `modules[]` entry — a source module (`name`, optional `description`/`path`). */
export const Module = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    path: z.string().optional(),
  })
  .passthrough();
/** Parsed shape of the {@link Module} schema. */
export type Module = z.infer<typeof Module>;

/** `category` is a free string, not a fixed enum (spec-002) — keeps the schema project-shape-agnostic. */
export const TechEntry = z
  .object({
    name: z.string(),
    category: z.string(),
    version: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();
export type TechEntry = z.infer<typeof TechEntry>;

/** One `stacks.methodologies[]` entry — a development methodology (`name`, optional `phase`/`notes`). */
export const MethodologyEntry = z
  .object({
    name: z.string(),
    phase: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();
/** Parsed shape of the {@link MethodologyEntry} schema. */
export type MethodologyEntry = z.infer<typeof MethodologyEntry>;

/** Replaces the old fixed-key `tech_stack` object with two flat, generically-shaped lists. */
export const Stacks = z
  .object({
    technologies: uniquelyNamed(TechEntry).optional(),
    methodologies: uniquelyNamed(MethodologyEntry).optional(),
  })
  .passthrough();
export type Stacks = z.infer<typeof Stacks>;

/** One `team.members[]` entry — a human contributor and the `roles` they hold (validated against `team.roles`). */
export const TeamMember = z
  .object({
    name: z.string(),
    email: z.string().optional(),
    roles: z.array(z.string()),
  })
  .passthrough();
/** Parsed shape of the {@link TeamMember} schema. */
export type TeamMember = z.infer<typeof TeamMember>;

/**
 * The address shape a `team.agents[].email` must have to sit inside a `Co-Authored-By:` trailer's
 * `<…>`: exactly one `@`, a dotted domain, and no whitespace or angle brackets (task-256).
 */
export const AGENT_EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Whether `email` is acceptable as a GitHub noreply address — trivially true for any other domain. A
 * `@users.noreply.github.com` address must carry GitHub's numeric account id, `<id>+<login>@…`: the bare
 * `<login>@…` form names a login, and an unregistered login can be claimed by anyone, who would then be
 * credited with every commit the trailer names (approver ruling F1, task-256).
 */
export function isIdQualifiedGitHubNoreply(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (email.slice(at + 1).toLowerCase() !== 'users.noreply.github.com') return true;
  return /^[0-9]+\+[^+]+$/.test(email.slice(0, at));
}

/**
 * The refusal for each reason the attribution audit would reject an agent's email (task-260, `bug-261`):
 * the schema applies the audit's own rule (`attributionEmailIssue`, `src/validation/identity.ts`).
 */
const ATTRIBUTION_EMAIL_MESSAGES: Readonly<Record<AttributionEmailIssue, string>> = {
  'guessed-domain':
    'an agent email may not carry git\'s guessed-domain marker ".(none)" (the attribution audit rejects it, bug-261)',
  malformed:
    'an agent email may not have a parenthesis in its top-level domain (the attribution audit rejects it, bug-261)',
  'reserved-domain':
    'an agent email may not be on a reserved top-level domain (.test, .example, .invalid, .localhost: RFC 2606 names no mailbox there, and the attribution audit rejects it, bug-261)',
};

/** Whether `name` can be the name part of a trailer: no `<`, `>`, CR or LF (task-256). */
function isTrailerSafeName(name: string): boolean {
  return !/[<>\r\n]/.test(name);
}

/**
 * One `team.agents[]` entry — an AI agent, the roles it `executes_as`, whether it may hold
 * `approval_authority` (REQ-SEC-03), and the `adapter` that says *how* it is launched.
 *
 * `adapter` is the link from DNA to an adapter manifest (`spec-016-agent-execution` §2.1, task-138):
 * the manifest's file basename under `.wingfoil/agents/{built-in,custom}/`, so it is held to the shared
 * id character class (`spec-009-validation-strategy` §1, `src/validation/id.ts`). It is optional — an
 * agent without one can be named in DNA but not launched (`spec-016` §3.7, `NO_ADAPTER`).
 *
 * `name` and `email` together are the agent's commit identity: `git-conventions` §7 writes them as the
 * `Co-Authored-By: <name> <<email>>` trailer (`dl-117` Q2 (c), task-256, `bug-240`). So a `name` may
 * not hold `<`, `>` or a line break, and `email` — optional; by default the address the agent's vendor
 * publishes for co-authorship, or a project-owned machine account — must be one mailbox
 * ({@link AGENT_EMAIL_RE}) and, on GitHub's noreply domain, id-qualified ({@link isIdQualifiedGitHubNoreply}).
 *
 * The identity must also be one the attribution audit accepts (task-260, `bug-261`): a blank `name` and an
 * `email` the audit rejects (git's `.(none)` marker, a parenthesis in the top-level domain, an RFC 2606
 * reserved top-level domain) are refused through the rule `isValidAttribution` applies
 * (`src/validation/identity.ts`), shared rather than restated. And an entry
 * that declares an `adapter` — one `agent execute` can launch, so one whose commits carry its trailer —
 * must declare an `email` (`dl-158` Rule 2 (ii)); without an `adapter` the `email` stays optional, since
 * the entry signs nothing yet (approver ruling F1, task-256).
 */
export const AgentEntry = z
  .object({
    name: z
      .string()
      .refine(isTrailerSafeName, {
        message: 'an agent name may not contain "<", ">" or a line break (it is written into a Co-Authored-By: trailer)',
      })
      .refine((value) => !isBlankIdentityName(value), {
        message: 'an agent name may not be empty or blank (the attribution audit rejects a blank name, bug-261)',
      }),
    email: z
      .string()
      .refine((value) => AGENT_EMAIL_RE.test(value), {
        message: 'an agent email must be one address, local@domain.tld, with no whitespace or angle brackets',
      })
      .refine(isIdQualifiedGitHubNoreply, {
        message: 'a GitHub noreply agent email must be id-qualified, <id>+<login>@users.noreply.github.com (a bare login can be claimed by anyone)',
      })
      .superRefine((value, ctx) => {
        // An address outside AGENT_EMAIL_RE is already reported above: one issue per refused email.
        if (!AGENT_EMAIL_RE.test(value)) return;
        const issue = attributionEmailIssue(value);
        if (issue !== null) ctx.addIssue({ code: 'custom', message: ATTRIBUTION_EMAIL_MESSAGES[issue] });
      })
      .optional(),
    executes_as: z.array(z.string()),
    approval_authority: z.boolean().optional(),
    adapter: z
      .string()
      .refine(isIdPiece, { message: `an adapter name must be non-empty and use only [${ID_CHAR_CLASS}] (spec-009 id class)` })
      .optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.adapter !== undefined && value.email === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `an agent with an adapter must declare an email: agent execute can launch it, and its commits carry a Co-Authored-By: <name> <<email>> trailer (dl-158 Rule 2 (ii))`,
        path: ['email'],
      });
    }
  });
/** Parsed shape of the {@link AgentEntry} schema. */
export type AgentEntry = z.infer<typeof AgentEntry>;

/** One `team.roles[]` entry — a role in the canonical role catalogue (REQ-SYS-08). */
export const RoleEntry = z
  .object({
    name: z.string(),
    description: z.string().optional(),
  })
  .passthrough();
/** Parsed shape of the {@link RoleEntry} schema. */
export type RoleEntry = z.infer<typeof RoleEntry>;

/**
 * `team.roles` is the canonical role catalogue (REQ-SYS-08); every role name referenced by
 * `members[].roles` and `agents[].executes_as` is semantically validated against it (spec-002 "Role
 * binding (REQ-SYS-08)"). This is a same-document cross-field rule, so — per spec-009 §1's guidance
 * that such rules "cannot be expressed as a per-field Zod .regex()/.min()" — it runs as a
 * `.superRefine()` here, still inside the Zod schema.
 */
export const Team = z
  .object({
    members: uniquelyNamed(TeamMember),
    agents: uniquelyNamed(AgentEntry).optional(),
    roles: uniquelyNamed(RoleEntry),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const knownRoles = new Set(value.roles.map((role) => role.name));

    value.members.forEach((member, memberIndex) => {
      member.roles.forEach((roleName, roleIndex) => {
        if (!knownRoles.has(roleName)) {
          ctx.addIssue({
            code: 'custom',
            message: `team.members[${memberIndex}].roles references undefined role "${roleName}" (not in team.roles)`,
            path: ['members', memberIndex, 'roles', roleIndex],
          });
        }
      });
    });

    (value.agents ?? []).forEach((agent, agentIndex) => {
      agent.executes_as.forEach((roleName, roleIndex) => {
        if (!knownRoles.has(roleName)) {
          ctx.addIssue({
            code: 'custom',
            message: `team.agents[${agentIndex}].executes_as references undefined role "${roleName}" (not in team.roles)`,
            path: ['agents', agentIndex, 'executes_as', roleIndex],
          });
        }
      });
    });
  });
export type Team = z.infer<typeof Team>;

/**
 * Category names are fixed per P2.5, but `.passthrough()` tolerates a future extra category.
 *
 * `runs` is the sixth category (`spec-016-agent-execution` §4.1, task-138): the run log's directory.
 * Unlike the other five it holds **exactly one** entry, because `agent execute` writes each record to
 * `<runs>/<element-id>.jsonl` and two directories would make where a run is recorded ambiguous.
 *
 * `health` is the seventh (`dl-089-release-health-analyses-before-retrospective` §1 (A), task-222): the
 * directory of the release-health catalogue (`metrics.yaml`) and of the reports the release-health
 * workflow writes. It too holds exactly one entry, for the same reason.
 */
export const Paths = z
  .object({
    sources: z.array(z.string()).optional(),
    tests: z.array(z.string()).optional(),
    docs: z.array(z.string()).optional(),
    config: z.array(z.string()).optional(),
    governance: z.array(z.string()).optional(),
    runs: z
      .array(z.string())
      .length(1, { message: 'paths.runs holds exactly one directory, the run log (spec-016 §4.1)' })
      .optional(),
    health: z
      .array(z.string())
      .length(1, { message: 'paths.health holds exactly one directory, the release-health catalogue and reports (dl-089 §1)' })
      .optional(),
  })
  .passthrough();
export type Paths = z.infer<typeof Paths>;

/**
 * The whole `.wingfoil/dna.yaml` document (P2.4, spec-002) — the Project DNA structural map's root schema.
 * `version` is the content revision; `format` the file's format (`dl-149`, task-251: absent = 1).
 */
export const DnaYaml = z
  .object({
    version: z.number().positive(),
    format: formatField(DNA_YAML_FORMAT),
    project: Project.optional(),
    modules: uniquelyNamed(Module),
    stacks: Stacks,
    team: Team,
    paths: Paths,
  })
  .passthrough();
/** Parsed shape of the {@link DnaYaml} schema — the type every DNA reader (`loadDnaYaml`, `dna show`) returns. */
export type DnaYaml = z.infer<typeof DnaYaml>;
