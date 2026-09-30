/**
 * Caret-position tracking across the two editing surfaces. The native
 * composer is a contenteditable whose caret is a DOM selection (a flat text
 * offset over its concatenated text content); the notebook is CodeMirror
 * (a document offset over the same draft text). Both offsets are directly
 * comparable while the two drafts agree, which is exactly the moment the
 * panel switches surfaces — so a plain offset is the whole tracking state.
 * A missing/unreadable caret reports -1 and callers fall back to the
 * surface's default placement.
 */

/**
 * Read the caret of `el` as a text offset over its concatenated text
 * content. Returns -1 when there is no live selection or the selection
 * anchor sits outside `el` (the element never had the caret, or the
 * browser dropped the range when focus moved).
 */
export function caretOffsetIn(el: HTMLElement): number {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return -1
  const caret = selection.getRangeAt(0)
  if (!el.contains(caret.startContainer)) return -1
  // Measuring a start-of-element → caret range as text keeps every anchor
  // shape (text node or element) on one code path, unlike a manual walk.
  const before = document.createRange()
  before.selectNodeContents(el)
  try {
    before.setEnd(caret.startContainer, caret.startOffset)
  } catch {
    return -1
  }
  return before.toString().length
}

/** Collapse the selection into `el` at text offset `offset` (clamped). */
export function setCaretAt(el: HTMLElement, offset: number): void {
  const selection = window.getSelection()
  if (selection === null) return
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let node = walker.nextNode() as Text | null
  let last: Text | null = null
  while (node !== null) {
    if (remaining <= node.data.length) return place(selection, node, remaining)
    remaining -= node.data.length
    last = node
    node = walker.nextNode() as Text | null
  }
  // Past the last text node: clamp to its end; an empty element gets the
  // selection collapsed over its (empty) contents.
  if (last !== null) return place(selection, last, last.data.length)
  const whole = document.createRange()
  whole.selectNodeContents(el)
  whole.collapse(true)
  selection.removeAllRanges()
  selection.addRange(whole)
}

function place(selection: Selection, node: Text, offset: number): void {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}
