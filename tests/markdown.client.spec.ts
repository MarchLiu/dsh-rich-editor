/** listEnterEdit behavior: continuation, ordered increment, checkbox reset,
 * mid-line split, empty-item exit, and non-list declines. */
import { describe, expect, it } from 'vitest'
import { listEnterEdit } from '../src/client/markdown.ts'

/** Apply the edit like the editor would, returning [text, cursor]. */
function apply(text: string, cursor: number): [string, number] | null {
  const edit = listEnterEdit(text, cursor)
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
