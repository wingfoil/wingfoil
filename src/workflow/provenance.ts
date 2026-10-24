/**
 * Element provenance in the workflow deduction (task-293; P4.21, `cp-002`, REQ-STATE-11, `dl-187`; `spec-017` §2,
 * §4.3, §4.8).
 *
 * Two records join the history walk, both empty commits outside the `wf()` grammar, in the `workflow finalize`
 * family:
 * - an **adoption** — subject `workflow: adopt <instance-id> <step key> <type>:<id>`, final trailer paragraph
 *   `WingFoil-Instance`, `WingFoil-Step`, `WingFoil-Adopted: <type>:<id>` — makes the element created by that step,
 *   for `created` evidence only (never `record`, never `state`);
 * - a **rekey** — subject `workflow: rekey <instance-id> <from> <to>`, trailers `WingFoil-Instance`,
 *   `WingFoil-Rekey-From`, `WingFoil-Rekey-To` — reads every linkage, record and adoption of its instance that it
 *   descends from and that names `<from>` as naming `<to>`, keeping the `@<scope>` suffix.
 *
 * A commit is such a record only when it has the subject prefix **and** the trailers (design D1 (a), approver
 * ruling 2026-10-24); the values are the trailers'. The snapshot reader (`src/core/workflow-deduction.ts`) parses
 * them from the walk's one `git log` with {@link readAdoption} / {@link readRekey}; `task-294` (`workflow adopt`) and
 * `task-295` (`workflow rekey`) write them with the constants below, and read ownership and orphans through
 * {@link resolveProvenance}.
 *
 * {@link resolveProvenance} applies §4.8's rules, in order: rekeys (oldest first, each applied to what it descends
 * from), orphans (a `<workflow>.<phase>` the registry does not declare, after rekeys: evidence of nothing, owner of
 * nothing), one owner per element (the claim — linkage or adoption — every other claim of the element is an
 * ancestor of; with two or more claims none descends from, none counts: a conflict, design D2 (a)). Pure: no git,
 * no filesystem, every collection in a declared order.
 */
import type { InstanceHistory, PhaseRecord, StepLink, WalkPosition } from './deduce';
import type { Workflow } from './schema';

/** The subject prefix of an adoption record (`spec-017` §4.8, §7.11). */
export const ADOPT_SUBJECT_PREFIX = 'workflow: adopt ';
/** The subject prefix of a rekey record (`spec-017` §4.8, §7.12). */
export const REKEY_SUBJECT_PREFIX = 'workflow: rekey ';
/** The trailer naming the adopted element, `<type>:<id>`. */
export const ADOPTED_TRAILER = 'WingFoil-Adopted';
/** The trailer naming the step key a rekey maps from, `<workflow>.<phase>`. */
export const REKEY_FROM_TRAILER = 'WingFoil-Rekey-From';
/** The trailer naming the step key a rekey maps to, `<workflow>.<phase>`. */
export const REKEY_TO_TRAILER = 'WingFoil-Rekey-To';
/** The instance trailer every provenance record carries (shared with linkage and phase records). */
export const INSTANCE_TRAILER = 'WingFoil-Instance';
/** The step trailer an adoption carries (shared with linkage). */
export const STEP_TRAILER = 'WingFoil-Step';

/** `W_PROVENANCE_ORPHAN` (`spec-017` §2): a linkage, record or adoption names a step key the registry does not declare. */
export const W_PROVENANCE_ORPHAN = 'W_PROVENANCE_ORPHAN';
/** `W_PROVENANCE_CONFLICT` (`spec-017` §2): claims on one element on unrelated branches; it counts as created by neither. */
export const W_PROVENANCE_CONFLICT = 'W_PROVENANCE_CONFLICT';

/** One adoption record of the walk (`spec-017` §4.8): the element `<type>:<id>` counts as created by `step`. */
export interface AdoptionRecord extends WalkPosition {
  readonly instance: string;
  /** The step key, `<workflow>.<phase>[@<scope>]`, as `WingFoil-Step` gives it. */
  readonly step: string;
  readonly type: string;
  readonly id: string;
}

/** One rekey record of the walk (`spec-017` §4.8): the instance's records naming `from` read as naming `to`. */
export interface RekeyRecord extends WalkPosition {
  readonly instance: string;
  /** `<workflow>.<phase>`, unscoped. */
  readonly from: string;
  /** `<workflow>.<phase>`, unscoped. */
  readonly to: string;
}

/** An element named by a provenance record: its type and id (the record carries no status). */
export interface ProvenanceRef {
  readonly type: string;
  readonly id: string;
}

/** A claim of ownership on an element (`spec-017` §4.8 "One owner"): a linkage or an adoption, its key after rekeys. */
export interface ProvenanceClaim extends WalkPosition {
  readonly kind: 'linkage' | 'adoption';
  readonly instance: string;
  /** The step key after rekeys, `<workflow>.<phase>[@<scope>]`. */
  readonly step: string;
  readonly type: string;
  readonly id: string;
}

/** A linkage, record or adoption naming, after rekeys, a `<workflow>.<phase>` the registry does not declare. */
export interface ProvenanceOrphan extends WalkPosition {
  readonly kind: 'linkage' | 'record' | 'adoption';
  readonly instance: string;
  /** The step key after rekeys, with its scope: a record's `WingFoil-Element` / `WingFoil-Item` as `@<scope>`. */
  readonly key: string;
  /** The element a linkage or an adoption names; `null` for a record. */
  readonly element: ProvenanceRef | null;
}

/** Two or more claims on one element, none descending from another: the element counts as created by none of them. */
export interface ProvenanceConflict {
  readonly element: ProvenanceRef;
  /** The maximal claims, in instance-id then step-key order. */
  readonly claims: readonly ProvenanceClaim[];
}

/** What {@link resolveProvenance} yields. */
export interface ResolvedProvenance {
  /**
   * Each instance history of the snapshot, by start commit, as deduction reads it: records remapped, orphans left
   * out; `links` the winning claims of that walk (linkages and adoptions, in `StepLink` shape, newest first);
   * re-entries unchanged.
   */
  readonly history: ReadonlyMap<string, InstanceHistory>;
  /** The owning claim of each element, by `<type>:<id>`; an element with no claim, or in conflict, has none. */
  readonly owners: ReadonlyMap<string, ProvenanceClaim>;
  /** The orphans of the given instances: per instance in the order given, then by walk position (newest first). */
  readonly orphans: readonly ProvenanceOrphan[];
  /** The conflicts, ascending `(type, id)`. */
  readonly conflicts: readonly ProvenanceConflict[];
}

const ELEMENT_REF_RE = /^([a-z][a-z0-9-]*):(\S+)$/;

/** The value of each `key: value` line of a trailer block, by key (the last one wins), or `null`. */
function trailer(block: string, key: string): string | null {
  let found: string | null = null;
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1 && line.slice(0, colon).trim() === key) found = line.slice(colon + 1).trim();
  }
  return found === '' ? null : found;
}

/**
 * The adoption a walk commit records, or `null` (design D1 (a)): the subject starts with
 * {@link ADOPT_SUBJECT_PREFIX} and the final trailer paragraph (`trailers`, as `%(trailers:only,unfold)` gives it)
 * carries non-blank `WingFoil-Instance`, `WingFoil-Step` and `WingFoil-Adopted: <type>:<id>`.
 */
export function readAdoption(position: WalkPosition, subject: string, trailers: string): AdoptionRecord | null {
  if (!subject.startsWith(ADOPT_SUBJECT_PREFIX)) return null;
  const instance = trailer(trailers, INSTANCE_TRAILER);
  const step = trailer(trailers, STEP_TRAILER);
  const adopted = ELEMENT_REF_RE.exec(trailer(trailers, ADOPTED_TRAILER) ?? '');
  if (instance === null || step === null || adopted === null) return null;
  return { commit: position.commit, position: position.position, instance, step, type: adopted[1]!, id: adopted[2]! };
}

/**
 * The rekey a walk commit records, or `null` (design D1 (a)): the subject starts with {@link REKEY_SUBJECT_PREFIX}
 * and the final trailer paragraph carries non-blank `WingFoil-Instance`, `WingFoil-Rekey-From` and
 * `WingFoil-Rekey-To`, neither key scoped (no `@`).
 */
export function readRekey(position: WalkPosition, subject: string, trailers: string): RekeyRecord | null {
  if (!subject.startsWith(REKEY_SUBJECT_PREFIX)) return null;
  const instance = trailer(trailers, INSTANCE_TRAILER);
  const from = trailer(trailers, REKEY_FROM_TRAILER);
  const to = trailer(trailers, REKEY_TO_TRAILER);
  if (instance === null || from === null || to === null || from.includes('@') || to.includes('@')) return null;
  return { commit: position.commit, position: position.position, instance, from, to };
}

/** Byte-wise order of two strings (`spec-017` §1.3). */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `<type>:<id>` of a reference, `''` for none. */
function refText(ref: ProvenanceRef | null): string {
  return ref === null ? '' : `${ref.type}:${ref.id}`;
}

/** A step key split into its `<workflow>.<phase>` and its `@<scope>` suffix (`''` when unscoped). */
function splitKey(key: string): { base: string; suffix: string } {
  const at = key.indexOf('@');
  return at === -1 ? { base: key, suffix: '' } : { base: key.slice(0, at), suffix: key.slice(at) };
}

/** The descends-from relation of the walk (§4.8 "newer means descends from"), through its parent links. */
class Ancestry {
  private readonly children = new Map<string, string[]>();
  private readonly known = new Map<string, ReadonlySet<string>>();

  constructor(parents: ReadonlyMap<string, readonly string[]>) {
    for (const [child, of] of parents) {
      for (const parent of of) this.children.set(parent, [...(this.children.get(parent) ?? []), child]);
    }
  }

  /** Whether `commit` strictly descends from `ancestor`. */
  descends(commit: string, ancestor: string): boolean {
    let found = this.known.get(ancestor);
    if (found === undefined) {
      const set = new Set<string>();
      const pending = [...(this.children.get(ancestor) ?? [])];
      while (pending.length > 0) {
        const next = pending.pop()!;
        if (set.has(next)) continue;
        set.add(next);
        pending.push(...(this.children.get(next) ?? []));
      }
      this.known.set(ancestor, set);
      found = set;
    }
    return found.has(commit);
  }
}

/** Whether `owner` is the claim `entry` makes (same kind, same commit). */
function owns(owner: ProvenanceClaim | undefined, entry: ProvenanceClaim): boolean {
  return owner !== undefined && owner.kind === entry.kind && owner.commit === entry.commit;
}

/** A linkage or adoption with its key remapped, before ownership is decided. */
interface Candidate extends ProvenanceClaim {
  readonly orphan: boolean;
}

/**
 * Resolve the provenance records of every instance history in the snapshot (`spec-017` §4.8): rekeys, orphans, one
 * owner per element. `instances` are the open instances, in deduction order, whose orphans are listed; ownership is
 * decided over every claim the histories hold, each commit counted once.
 */
export function resolveProvenance(
  snapshot: { readonly workflows: readonly Workflow[]; readonly history: ReadonlyMap<string, InstanceHistory>; readonly parents: ReadonlyMap<string, readonly string[]> },
  instances: readonly { readonly id: string; readonly startCommit: string }[],
): ResolvedProvenance {
  const declared = new Set<string>();
  for (const workflow of snapshot.workflows) for (const phase of workflow.phases) declared.add(`${workflow.name}.${phase.name}`);
  const ancestry = new Ancestry(snapshot.parents);

  // Every rekey once, oldest first: descending walk position (one position per commit of the union walk).
  const rekeyByCommit = new Map<string, RekeyRecord>();
  for (const history of snapshot.history.values()) for (const entry of history.rekeys ?? []) rekeyByCommit.set(entry.commit, entry);
  const rekeys = [...rekeyByCommit.values()].sort((a, b) => b.position - a.position);

  /** `<workflow>.<phase>` after the rekeys of `instance` that descend from `commit`, applied oldest first. */
  const remap = (instance: string, commit: string, base: string): string => {
    let key = base;
    for (const entry of rekeys) {
      if (entry.instance === instance && entry.from === key && ancestry.descends(entry.commit, commit)) key = entry.to;
    }
    return key;
  };

  const candidate = (kind: 'linkage' | 'adoption', entry: StepLink | AdoptionRecord): Candidate => {
    const { base, suffix } = splitKey(entry.step);
    const mapped = remap(entry.instance, entry.commit, base);
    return { kind, commit: entry.commit, position: entry.position, instance: entry.instance, step: mapped + suffix, type: entry.type, id: entry.id, orphan: !declared.has(mapped) };
  };
  const claimKey = (claim: ProvenanceClaim): string => `${claim.kind} ${claim.commit} ${claim.type}:${claim.id}`;

  // Per history: remapped records and candidates.
  const perHistory = new Map<string, { records: { record: PhaseRecord; orphan: boolean }[]; candidates: Candidate[] }>();
  const claims = new Map<string, Candidate>();
  for (const [start, history] of snapshot.history) {
    const records = history.records.map((record) => {
      const phase = remap(record.instance, record.commit, record.phase);
      return { record: { ...record, phase }, orphan: !declared.has(phase) };
    });
    const candidates = [...history.links.map((entry) => candidate('linkage', entry)), ...(history.adoptions ?? []).map((entry) => candidate('adoption', entry))].sort(
      (a, b) => a.position - b.position || compareText(`${a.type}:${a.id}`, `${b.type}:${b.id}`),
    );
    for (const entry of candidates) if (!entry.orphan) claims.set(claimKey(entry), entry);
    perHistory.set(start, { records, candidates });
  }

  // One owner per element: the single claim no other claim descends from; several such claims are a conflict.
  const byElement = new Map<string, Candidate[]>();
  for (const claim of claims.values()) {
    const key = `${claim.type}:${claim.id}`;
    byElement.set(key, [...(byElement.get(key) ?? []), claim]);
  }
  const owners = new Map<string, ProvenanceClaim>();
  const conflicts: ProvenanceConflict[] = [];
  for (const key of [...byElement.keys()].sort()) {
    const all = byElement.get(key)!;
    const maximal = all.filter((claim) => !all.some((other) => other !== claim && ancestry.descends(other.commit, claim.commit)));
    const plain = (claim: Candidate): ProvenanceClaim => ({ kind: claim.kind, commit: claim.commit, position: claim.position, instance: claim.instance, step: claim.step, type: claim.type, id: claim.id });
    if (maximal.length === 1) {
      owners.set(key, plain(maximal[0]!));
    } else {
      const ordered = maximal.map(plain).sort((a, b) => compareText(`${a.instance} ${a.step} ${a.commit}`, `${b.instance} ${b.step} ${b.commit}`));
      conflicts.push({ element: { type: ordered[0]!.type, id: ordered[0]!.id }, claims: ordered });
    }
  }

  const history = new Map<string, InstanceHistory>();
  for (const [start, original] of snapshot.history) {
    const { records, candidates } = perHistory.get(start)!;
    const links: StepLink[] = candidates
      .filter((entry) => !entry.orphan && owns(owners.get(`${entry.type}:${entry.id}`), entry))
      .map((entry) => ({ commit: entry.commit, position: entry.position, instance: entry.instance, step: entry.step, type: entry.type, id: entry.id }));
    history.set(start, { records: records.filter((entry) => !entry.orphan).map((entry) => entry.record), links, reentries: original.reentries });
  }

  // The orphans of each given instance: the entries of its walk that carry its id.
  const orphans: ProvenanceOrphan[] = [];
  for (const instance of instances) {
    const own = perHistory.get(instance.startCommit);
    if (own === undefined) continue;
    const found: ProvenanceOrphan[] = [
      ...own.records
        .filter((entry) => entry.orphan && entry.record.instance === instance.id)
        .map(({ record }): ProvenanceOrphan => {
          const scope = record.element ?? record.item;
          return { kind: 'record', commit: record.commit, position: record.position, instance: record.instance, key: scope === null ? record.phase : `${record.phase}@${scope}`, element: null };
        }),
      ...own.candidates
        .filter((entry) => entry.orphan && entry.instance === instance.id)
        .map((entry): ProvenanceOrphan => ({ kind: entry.kind, commit: entry.commit, position: entry.position, instance: entry.instance, key: entry.step, element: { type: entry.type, id: entry.id } })),
    ];
    // One commit is one record, or one linkage per id its subject names: ties are broken by the element.
    found.sort((a, b) => a.position - b.position || compareText(refText(a.element), refText(b.element)));
    orphans.push(...found);
  }

  return { history, owners, orphans, conflicts };
}
