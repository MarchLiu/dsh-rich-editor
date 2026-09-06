// @vitest-environment jsdom
/** CodeMirror mount smoke: the notebook editor attaches, reports edits, and
 * tears down cleanly in the jsdom lane. */
import { describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { createMarkdownEditor, markdownHighlightStyle } from '../src/client/editor.ts'

/** The mounted view behind a host (EditorView.findFromDOM is CM's public lookup). */
function viewOf(host: HTMLElement): EditorView {
  const dom = host.querySelector('.cm-editor')
  if (!(dom instanceof HTMLElement)) throw new Error('editor dom not found')
  const view = EditorView.findFromDOM(dom)
  if (view === null) throw new Error('editor view not found')
  return view
}

/** Move the caret to the document end. */
function caretToEnd(view: EditorView): void {
  view.dispatch({ selection: { anchor: view.state.doc.length } })
}

function makeOptions(over: Partial<Parameters<typeof createMarkdownEditor>[1]> = {}) {
  return {
    initial: '',
    placeholder: '写点什么',
    ariaLabel: '笔记本编辑器',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    ...over,
  }
}

/** Dispatch a real Enter keydown at the current caret. */
function pressEnter(content: HTMLElement) {
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

describe('createMarkdownEditor', () => {
  it('mounts with the initial document and reports typed changes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = makeOptions({ initial: '- 第一项' })
    const editor = createMarkdownEditor(host, options)
    expect(host.textContent).toContain('第一项')
    expect(host.querySelector('[aria-label="笔记本编辑器"]')).not.toBeNull()

    editor.setText('- 第一项\n- 第二项')
    expect(options.onChange).toHaveBeenCalledWith('- 第一项\n- 第二项')
    expect(host.textContent).toContain('第二项')

    editor.destroy()
    expect(host.childElementCount).toBe(0)
    host.remove()
  })

  it('Enter on a list item continues the list; on an empty item exits it', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = makeOptions({ initial: '- 第一项' })
    const editor = createMarkdownEditor(host, options)
    const content = host.querySelector<HTMLElement>('.cm-content')
    if (content === null) throw new Error('no content surface')

    caretToEnd(viewOf(host))
    pressEnter(content)
    expect(options.onChange).toHaveBeenLastCalledWith('- 第一项\n- ')

    // Caret sits on the fresh empty item: a second Enter exits list editing.
    pressEnter(content)
    expect(options.onChange).toHaveBeenLastCalledWith('- 第一项\n')

    editor.destroy()
    host.remove()
  })

  it('Enter on a plain line inserts a plain newline', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = makeOptions({ initial: '普通文本' })
    const editor = createMarkdownEditor(host, options)
    const content = host.querySelector<HTMLElement>('.cm-content')
    if (content === null) throw new Error('no content surface')

    caretToEnd(viewOf(host))
    pressEnter(content)
    expect(options.onChange).toHaveBeenLastCalledWith('普通文本\n')

    editor.destroy()
    host.remove()
  })

  it('Enter with a non-empty selection declines, leaving the default replace', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = makeOptions({ initial: '- abc' })
    const editor = createMarkdownEditor(host, options)
    const content = host.querySelector<HTMLElement>('.cm-content')
    if (content === null) throw new Error('no content surface')

    const view = viewOf(host)
    // Select the whole document: the list keymap must decline and the default
    // Enter replaces the selection with a plain newline.
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
    pressEnter(content)
    expect(options.onChange).toHaveBeenLastCalledWith('\n')

    editor.destroy()
    host.remove()
  })

  it('Mod-Enter submits through the submit sink', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = makeOptions({ initial: '- 要点' })
    const editor = createMarkdownEditor(host, options)
    const content = host.querySelector<HTMLElement>('.cm-content')
    if (content === null) throw new Error('no content surface')

    // jsdom reports a non-Mac platform, so CM's Mod modifier is Ctrl here.
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(options.onSubmit).toHaveBeenCalledTimes(1)

    editor.destroy()
    host.remove()
  })

  it('IME composition stays silent until compositionend, then flushes once', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = makeOptions({ initial: '' })
    const editor = createMarkdownEditor(host, options)
    const content = host.querySelector<HTMLElement>('.cm-content')
    if (content === null) throw new Error('no content surface')
    const view = viewOf(host)

    // Open an IME session and type pinyin: CM applies composition updates as
    // doc changes, but the panel must not mirror them (a mirrored write
    // steals focus back and kills the IME mid-composition). A real browser
    // bumps inputState.composing past 0 through its DOM-sync path, which
    // programmatic dispatches skip — set the state the composition would hold.
    content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    expect(view.compositionStarted).toBe(true)
    ;(view as unknown as { inputState: { composing: number } }).inputState.composing = 1
    expect(view.composing).toBe(true)
    view.dispatch({ changes: { from: 0, insert: 'shu' } })
    expect(options.onChange).not.toHaveBeenCalled()

    // Commit the IME: the browser replaces the composition text with the
    // committed characters, then the flush reports the final document.
    view.dispatch({ changes: { from: 0, to: 3, insert: '输' } })
    content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '输' }))
    expect(options.onChange).not.toHaveBeenCalled()
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(options.onChange).toHaveBeenCalledWith('输')

    // Ordinary edits after the session still report immediately.
    editor.setText('输入')
    expect(options.onChange).toHaveBeenCalledWith('输入')

    editor.destroy()
    host.remove()
  })

  it('parses GFM tables and strikethrough (markdownLanguage base, not CommonMark)', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createMarkdownEditor(host, makeOptions({
      initial: '| h1 | h2 |\n|----|----|\n| a | b |\n\n~~gone~~',
    }))
    const names = new Set<string>()
    syntaxTree(viewOf(host).state).iterate({ enter: (node) => { names.add(node.name) } })
    expect(names.has('Table')).toBe(true)
    expect(names.has('TableHeader')).toBe(true)
    expect(names.has('TableDelimiter')).toBe(true)
    expect(names.has('Strikethrough')).toBe(true)
    editor.destroy()
    host.remove()
  })

  it('highlights with the theme-token style: marks, headings and table headers carry its classes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createMarkdownEditor(host, makeOptions({ initial: '# 标题\n\n| h1 |\n|----|\n| a |' }))
    const classOf = (text: string): string => {
      const span = [...host.querySelectorAll('.cm-line span')].find(el => el.textContent === text)
      if (!(span instanceof HTMLElement)) throw new Error(`no highlighted span for ${JSON.stringify(text)}`)
      return span.className
    }
    const mark = markdownHighlightStyle.style([tags.processingInstruction]) ?? ''
    const heading = markdownHighlightStyle.style([tags.heading]) ?? ''
    expect(mark).not.toBe('')
    expect(classOf('#')).toContain(mark)
    expect(classOf(' 标题')).toContain(heading)
    // GFM table: pipes are marks, header cells read as headings.
    expect(classOf('|----|')).toContain(mark)
    expect(classOf(' h1 ')).toContain(heading)
    // The style rules resolve through app tokens, never a fixed palette.
    const rules = markdownHighlightStyle.module?.getRules() ?? ''
    expect(rules).toContain('var(--shiki-token-punctuation')
    expect(rules).toContain('var(--shiki-token-constant')
    editor.destroy()
    host.remove()
  })
})
