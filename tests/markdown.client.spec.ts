/** listEnterEdit behavior: continuation, ordered increment, checkbox reset,
 * mid-line split, empty-item exit, and non-list declines. */
import { describe, expect, it } from 'vitest'
import { listEnterEdit, listTabEdit, listUnindentEdit } from '../src/client/markdown.ts'

/** Apply the edit like the editor would, returning [text, cursor]. */
function apply(text: string, cursor: number): [string, number] | null {
  const edit = listEnterEdit(text, cursor)
  if (edit === null) return null
  return [text.slice(0, edit.from) + edit.insert + text.slice(edit.to), edit.cursor]
}

/** Apply an arbitrary list edit like the editor would. */
function applyWith(
  fn: (text: string, cursor: number) => { from: number; to: number; insert: string; cursor: number } | null,
  text: string,
  cursor: number,
): [string, number] | null {
  const edit = fn(text, cursor)
  if (edit === null) return null
  return [text.slice(0, edit.from) + edit.insert + text.slice(edit.to), edit.cursor]
}

describe('listEnterEdit', () => {
  it('continues an unordered item, preserving the bullet', () => {
    expect(apply('- 第一项', '- 第一项'.length)).toEqual(['- 第一项\n- ', 8])
    expect(apply('* star', 6)).toEqual(['* star\n* ', 9])
    expect(apply('+ plus', 6)).toEqual(['+ plus\n+ ', 9])
  })

  it('increments ordered markers and keeps the delimiter style', () => {
    expect(apply('1. 第一步', '1. 第一步'.length)).toEqual(['1. 第一步\n2. ', '1. 第一步\n2. '.length])
    expect(apply('3) third', 8)).toEqual(['3) third\n4) ', '3) third\n4) '.length])
    expect(apply('9. nine', 7)).toEqual(['9. nine\n10. ', '9. nine\n10. '.length])
  })

  it('continues a mid-document item whose line ends with a newline', () => {
    // Caret line is followed by more lines: bounds must cut at the newline.
    const text = '- 第一项\n- 第二项\n普通行'
    const cursor = '- 第一项\n- 第二项'.length
    expect(apply(text, cursor)).toEqual(['- 第一项\n- 第二项\n- \n普通行', cursor + 3])
  })

  it('preserves indentation of nested items', () => {
    expect(apply('  - 嵌套', '  - 嵌套'.length)).toEqual(['  - 嵌套\n  - ', '  - 嵌套\n  - '.length])
  })

  it('reopens checkbox items unchecked', () => {
    expect(apply('- [x] 完成的事', '- [x] 完成的事'.length)).toEqual(['- [x] 完成的事\n- [ ] ', '- [x] 完成的事\n- [ ] '.length])
  })

  it('splits a mid-line item: text after the caret joins the new item', () => {
    // Caret between 前 and 后: the tail moves under the continued marker.
    const text = '- 前后'
    const cursor = '- 前'.length
    expect(apply(text, cursor)).toEqual(['- 前\n- 后', cursor + 3])
  })

  it('empty item exits the list: the marker line becomes a plain empty line', () => {
    expect(apply('- 第一项\n- ', '- 第一项\n- '.length)).toEqual(['- 第一项\n', '- 第一项\n'.length])
    // An ordered empty item exits the same way.
    expect(apply('1. a\n2. ', '1. a\n2. '.length)).toEqual(['1. a\n', 5])
    // A checkbox-only line is still an empty item.
    expect(apply('- [ ] ', 6)).toEqual(['', 0])
  })

  it('declines non-list lines so the caller falls back to a plain newline', () => {
    expect(listEnterEdit('普通文本', 4)).toBeNull()
    expect(listEnterEdit('', 0)).toBeNull()
    // A heading is not a list item.
    expect(listEnterEdit('# 标题', 4)).toBeNull()
    // No space after the marker: plain text.
    expect(listEnterEdit('-nospace', 8)).toBeNull()
  })

  it('reads the caret line, not a neighboring list line', () => {
    const text = '- 列表\n普通行'
    expect(listEnterEdit(text, text.length)).toBeNull()
  })
})

describe('listTabEdit', () => {
  it('indents a top-level item one level regardless of the caret column', () => {
    // Caret at the line end: two spaces land before the marker.
    expect(applyWith(listTabEdit, '- 第一项', 7)).toEqual(['  - 第一项', 9])
    // Caret inside the content: it rides right with the inserted unit.
    expect(applyWith(listTabEdit, '- 第|一项'.replace('|', ''), 3)).toEqual(['  - 第一项', 5])
  })

  it('indents nested and ordered items, preserving mid-document lines', () => {
    expect(applyWith(listTabEdit, '  - 嵌套', 7)).toEqual(['    - 嵌套', 9])
    const text = '1. 第一步\n普通行'
    expect(applyWith(listTabEdit, text, '1. 第一步'.length)).toEqual(['  1. 第一步\n普通行', '  1. 第一步'.length])
  })

  it('declines non-list lines so the caller falls back to the default indent', () => {
    expect(listTabEdit('普通文本', 4)).toBeNull()
    expect(listTabEdit('', 0)).toBeNull()
    expect(listTabEdit('-nospace', 8)).toBeNull()
  })
})

describe('listUnindentEdit', () => {
  it('outdents a nested item one level', () => {
    expect(applyWith(listUnindentEdit, '  - 嵌套', 7)).toEqual(['- 嵌套', 5])
    // Two levels deep: only one unit goes per press.
    expect(applyWith(listUnindentEdit, '    - 深层', 9)).toEqual(['  - 深层', 7])
  })

  it('clamps the caret when it sat inside the removed whitespace', () => {
    // Caret at offset 1, inside the stripped indent: it lands at the line start.
    expect(applyWith(listUnindentEdit, '  - 嵌套', 1)).toEqual(['- 嵌套', 0])
  })

  it('outdents odd indents by at most one unit', () => {
    expect(applyWith(listUnindentEdit, '   - 三个空格', '   - 三个空格'.length))
      .toEqual([' - 三个空格', ' - 三个空格'.length])
  })

  it('exits the list from a top-level item: marker and checkbox drop, text stays', () => {
    expect(applyWith(listUnindentEdit, '- 第一项', 7)).toEqual(['第一项', 0])
    expect(applyWith(listUnindentEdit, '1. 第一步', 9)).toEqual(['第一步', 0])
    expect(applyWith(listUnindentEdit, '- [x] 完成的事', '- [x] 完成的事'.length)).toEqual(['完成的事', 0])
    // An empty top-level item becomes an empty plain line.
    expect(applyWith(listUnindentEdit, '- ', 2)).toEqual(['', 0])
  })

  it('leaves neighboring lines untouched mid-document', () => {
    const text = '- 上\n  - 下\n普通行'
    expect(applyWith(listUnindentEdit, text, '- 上\n  - 下'.length))
      .toEqual(['- 上\n- 下\n普通行', '- 上\n- 下'.length])
  })

  it('declines non-list lines', () => {
    expect(listUnindentEdit('普通文本', 4)).toBeNull()
    expect(listUnindentEdit('', 0)).toBeNull()
  })
})
