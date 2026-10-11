/** One service the approver verifies. */
export interface SweptService {
  /** The element id. */
  readonly id: string;
  /** `pending` or `active`. */
  readonly status: string;
  /** The dna.yaml role that manages it. */
  readonly owner_role: string;
  /** The read-only command or URL that establishes its state; `''` when missing (a problem). */
  readonly verify: string;
  /** The repository-relative path of the element. */
  readonly path: string;
}

/** Outcome of {@link serviceSweep}. */
export interface ServiceSweep {
  /** The `pending` and `active` services, in path order. */
  readonly listed: readonly SweptService[];
  /** How many `draft` and `deprecated` services were left out. */
  readonly skipped: Readonly<Record<string, number>>;
  /** One line per unparsable file or listed service without a `verify:`. */
  readonly problems: readonly string[];
}

/** task-229 (`dl-130` step 4): sort service documents into the listed, the skipped and the problems. */
export function serviceSweep(documents: ReadonlyArray<{ readonly path: string; readonly text: string }>): ServiceSweep;

/** task-229: the Markdown checklist the approver works through, naming the commit the services were read at. */
export function renderSweep(result: ServiceSweep, source: { readonly commit: string }): string;
