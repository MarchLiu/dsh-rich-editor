// @vitest-environment jsdom
/** CodeMirror mount smoke: the notebook editor attaches, reports edits, and
 * tears down cleanly in the jsdom lane. */
import { describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createMarkdownEditor } from '../src/client/editor.ts'

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
})
