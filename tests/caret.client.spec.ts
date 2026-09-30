// @vitest-environment jsdom
/** caret.ts: the DOM-selection offset read/write that backs the surface
 * switch caret tracking — text-offset round trip over mixed nodes, element
 * anchors, out-of-element selections, and clamping past the end. */
import { describe, expect, it } from 'vitest'
import { caretOffsetIn, setCaretAt } from '../src/client/caret.ts'

/** A contenteditable with text spread over several nodes. */
function editor(...pieces: string[]): { el: HTMLElement; texts: Text[] } {
  const el = document.createElement('div')
  el.setAttribute('contenteditable', 'true')
  const texts = pieces.map((piece) => {
    const span = document.createElement('span')
    const text = document.createTextNode(piece)
    span.appendChild(text)
    el.appendChild(span)
    return text
  })
  document.body.appendChild(el)
  return { el, texts }
}

function collapseTo(node: Node, offset: number): void {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = window.getSelection()
  selection!.removeAllRanges()
  selection!.addRange(range)
}

describe('caretOffsetIn', () => {
  it('measures the caret as an offset over concatenated text across nodes', () => {
    const { el, texts } = editor('abc', 'de', 'fgh')
    collapseTo(texts[1], 1) // after "abcd" → offset 4
    expect(caretOffsetIn(el)).toBe(4)
  })

  it('accepts an element-node anchor (Lexical can anchor on a block)', () => {
    const { el } = editor('abc', 'de')
    const second = el.children[1]!
    collapseTo(second, 0) // before "de" → offset 3
    expect(caretOffsetIn(el)).toBe(3)
  })

  it('returns -1 when the selection sits outside the element', () => {
    const { el } = editor('abc')
    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)
    collapseTo(elsewhere, 0)
    expect(caretOffsetIn(el)).toBe(-1)
  })
})

describe('setCaretAt', () => {
  it('places a caret that reads back at the same offset', () => {
    const { el, texts } = editor('abc', 'de', 'fgh')
    setCaretAt(el, 5)
    expect(caretOffsetIn(el)).toBe(5)
    expect(texts[1]!.data).toBe('de') // sanity: nodes untouched
  })

  it('clamps an offset past the end to the last text node end', () => {
    const { el } = editor('abc', 'de')
    setCaretAt(el, 999)
    expect(caretOffsetIn(el)).toBe(5)
  })

  it('collapses into an empty element without throwing', () => {
    const { el } = editor()
    setCaretAt(el, 0)
    expect(caretOffsetIn(el)).toBe(0)
  })
})
