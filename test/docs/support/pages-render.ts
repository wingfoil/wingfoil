/**
 * The documentation site's render guard (task-289): GitHub Pages renders the pages `docs/site.yaml` lists
 * with Jekyll's kramdown, which ends a paragraph at a line that begins with `<` and a letter and reads an
 * HTML block from there. An inline code span broken across a line before `<name>` or `<type>:<id>` therefore
 * turns the rest of the page into raw Markdown (found on the published site on 2026-10-17).
 *
 * {@link htmlBlockStarts} scans one page line by line:
 *
 * - **Fenced code** — a line opening with three or more backticks or tildes (any indentation, so a fence inside
 *   a list item counts) opens a fence; a line of the same character, at least as long, with only whitespace
 *   after, closes it. Lines inside are skipped.
 * - **Indented code** — a line indented by four spaces or a tab that follows a blank line opens an indented
 *   block; the following lines indented the same way are skipped.
 * - **HTML block opened on purpose** — a line beginning (after optional whitespace) with `<` and a letter that
 *   is the first line of the page or follows a blank line opens a block (the README's centred logo and badge
 *   lines); its lines are skipped up to the next blank line.
 * - **Finding** — any other line beginning (after optional whitespace) with `<` and a letter: a line that
 *   continues a paragraph or a list item. `<!--`, `</…` and `<<` lines are not findings.
 *
 * Accepted gap: an indented paragraph continuation inside a list item that follows a blank line is read as
 * indented code and skipped (a possible false negative, never a false positive).
 *
 * Pure and deterministic: findings in line order.
 */

/** One line kramdown would read as the start of an HTML block in the middle of a paragraph. */
export interface HtmlBlockStart {
  /** 1-based line number. */
  readonly line: number;
  /** The whole line, as written. */
  readonly text: string;
}

const FENCE = /^\s*(`{3,}|~{3,})/;
const INDENTED = /^( {4}|\t)/;
const TAG_START = /^\s*<[A-Za-z]/;

/**
 * The lines of `text` that begin with `<` and a letter inside a paragraph, outside code and outside the HTML
 * blocks the page opens on purpose.
 *
 * @param text the Markdown page
 * @returns the offending lines, in order
 */
export function htmlBlockStarts(text: string): HtmlBlockStart[] {
  const findings: HtmlBlockStart[] = [];
  let fence: string | null = null;
  let inHtml = false;
  let inIndentedCode = false;
  let previousBlank = true;
  text.split(/\r?\n/).forEach((line, index) => {
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      const closes =
        fenceMatch !== null &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        /^\s*[`~]+\s*$/.test(line);
      if (closes) fence = null;
      previousBlank = false;
      return;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      inHtml = false;
      inIndentedCode = false;
      previousBlank = false;
      return;
    }
    if (line.trim() === '') {
      inHtml = false;
      previousBlank = true;
      return;
    }
    if (inIndentedCode && INDENTED.test(line)) {
      previousBlank = false;
      return;
    }
    inIndentedCode = false;
    if (previousBlank && INDENTED.test(line)) {
      inIndentedCode = true;
      previousBlank = false;
      return;
    }
    if (!inHtml && TAG_START.test(line)) {
      if (previousBlank) inHtml = true;
      else findings.push({ line: index + 1, text: line });
    }
    previousBlank = false;
  });
  return findings;
}
