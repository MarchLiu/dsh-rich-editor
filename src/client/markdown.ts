/**
 * Pure Markdown list-editing logic for the notebook editor. Every function
 * maps (document text, caret) to an explicit edit so the CodeMirror glue
 * stays a thin adapter and the behavior is fully unit-testable without a DOM.
 */

/** One computed edit: replace [from, to) with insert, then place the caret. */
export interface ListEdit {
  /** Start offset of the replaced range, in document character coordinates. */
  readonly from: number
  /** End offset of the replaced range, in document character coordinates. */
  readonly to: number
  /** Replacement text. */
  readonly insert: string
  /** Caret position after the edit, in the NEW document's coordinates. */
  readonly cursor: number
}

/**
 * One list-item line, decomposed. Ordered markers keep their delimiter
 * (`1.` vs `1)`); checkbox items carry their box so a continuation resets it
 * to unchecked.
 */
interface ListLine {
  /** Leading whitespace reproduced on the continuation line. */
  readonly indent: string
  /** The marker to open the next item with (ordered markers already incremented). */
  readonly nextMarker: string
  /** `'[ ] '` when the line is a checkbox item, else ''. */
  readonly checkbox: string
  /** Item text after the marker and optional checkbox (never leading whitespace). */
  readonly content: string
}

// Capture groups: 1 indent, 2 bullet (unordered alternative), 3 number and
// 4 delimiter (ordered alternative), 5 checkbox box, 6 content. Required
// groups always match on a successful exec, so their reads take the same
// `as string` narrowing the decorations scan uses for typed same-value reads.
const LIST_LINE = /^(\s*)(?:([-*+])|(\d{1,9})([.)]))[ \t]+(?:(\[[ xX]\])[ \t]+)?(.*)$/

/**
 * Parse one line as a Markdown list item.
 * @param line - the full line text (no trailing newline).
 * @returns the decomposed item, or null when the line is not a list item.
 */
function parseListLine(line: string): ListLine | null {
  const match = LIST_LINE.exec(line)
  if (match === null) return null
  const indent = match[1] as string
  const content = match[6] as string
  const checkbox = match[5] !== undefined ? '[ ] ' : ''
  const bullet = match[2]
  if (bullet !== undefined) {
    return { indent, nextMarker: bullet, checkbox, content }
  }
  // Ordered alternative: groups 3/4 are defined whenever group 2 is not.
  // `999999999.` keeps its width class on increment.
  return { indent, nextMarker: `${String(Number(match[3]) + 1)}${match[4]}`, checkbox, content }
}

/** Line bounds containing `offset`: [start, end) with no newline characters. */
function lineBounds(text: string, offset: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', offset - 1) + 1
  const next = text.indexOf('\n', offset)
  return { start, end: next === -1 ? text.length : next }
}

/**
 * Compute the Enter edit at the caret, Codex-style:
 * - a non-empty list item continues the list on the next line (ordered
 *   markers increment, checkbox items reopen unchecked), splitting the item
 *   at the caret when it sits mid-line;
 * - an empty list item (marker only) drops its marker, returning the line to
 *   plain-text editing;
 * - anything else declines (null) so the caller applies a plain newline.
 * @param text - the whole document.
 * @param cursor - the caret offset (selections are collapsed by the caller).
 * @returns the edit to apply, or null when the caret line is not a list item.
 */
export function listEnterEdit(text: string, cursor: number): ListEdit | null {
  const { start, end } = lineBounds(text, cursor)
  const line = text.slice(start, end)
  const item = parseListLine(line)
  if (item === null) return null
  if (item.content === '') {
    // Empty item: erase the marker line entirely — the next keystroke lands
    // in plain-text state regardless of the indentation that held the list.
    return { from: start, to: end, insert: '', cursor: start }
  }
  const insert = `\n${item.indent}${item.nextMarker} ${item.checkbox}`
  return { from: cursor, to: cursor, insert, cursor: cursor + insert.length }
}
