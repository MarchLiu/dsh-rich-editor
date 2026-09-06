// @vitest-environment jsdom
/** macOS build of the notebook editor: Cmd-Enter submits (Ctrl does not),
 *  the IME's own Enter neither continues the list nor submits, and mixed
 *  Chinese/English list continuation treats CJK like any other content.
 *
 *  The platform stub MUST precede the first @codemirror/view load —
 *  CodeMirror reads navigator.platform once at module load, and external
 *  modules stay cached for the whole file, hence the top-level ordering. */
Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
const { EditorView } = await import('@codemirror/view')
const editorModule = await import('../src/client/editor.ts')
const { mountEditor, pressEnter, startComposition, nextFrame } = await import('./platform-utils.client.ts')

import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('macOS: Mod-Enter resolution', () => {
  it('Cmd-Enter submits', async () => {
    const { content, options, editor, host } = await mountEditor(editorModule, EditorView, '- 中文要点')
    pressEnter(content, { metaKey: true })
    expect(options.onSubmit).toHaveBeenCalledTimes(1)
    editor.destroy()
    host.remove()
  })

  it('plain Ctrl-Enter does not submit', async () => {
    const { content, options, editor, host } = await mountEditor(editorModule, EditorView, '- 中文要点')
    pressEnter(content, { ctrlKey: true })
    expect(options.onSubmit).not.toHaveBeenCalled()
    editor.destroy()
    host.remove()
  })
})

describe('macOS: Enter inside an open IME composition', () => {
  it('the IME Enter (keyCode 229, isComposing) neither continues the list nor submits', async () => {
    const { content, view, options, editor, host } = await startComposition(editorModule, EditorView, '- 输入english')
    pressEnter(content, { keyCode: 229, isComposing: true })
    expect(view.state.doc.toString()).toBe('- 输入english')
    expect(options.onSubmit).not.toHaveBeenCalled()
    expect(options.onChange).not.toHaveBeenCalled()
    editor.destroy()
    host.remove()
  })

  it('composition text stays unreported until commit; Enter works again after', async () => {
    const { content, view, options, editor, host } = await startComposition(editorModule, EditorView, '- 输入english')
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'shuru' } })
    expect(options.onChange).not.toHaveBeenCalled()

    const doc = view.state.doc.toString()
    view.dispatch({ changes: { from: doc.length - 5, to: doc.length, insert: '输入' } })
    // The browser parks the caret after the committed text; mirror that.
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '输入' }))
    await nextFrame()
    expect(options.onChange).toHaveBeenCalledWith('- 输入english输入')

    // CM swallows the first keystroke inside its post-composition cleanup
    // window (the slot reserved for the IME's own closing Enter); keep
    // pressing until the user's first real Enter is honored.
    const committed = view.state.doc.toString()
    for (let tries = 0; tries < 40 && view.state.doc.toString() === committed; tries += 1) {
      await new Promise(resolve => setTimeout(resolve, 20))
      pressEnter(content)
    }
    expect(view.state.doc.toString()).toBe('- 输入english输入\n- ')
    editor.destroy()
    host.remove()
  })
})

describe('macOS: mixed Chinese/English list continuation', () => {
  it.each([
    ['- 输入english mixed 中文', '- 输入english mixed 中文\n- '],
    ['1. 中文第1条 and english', '1. 中文第1条 and english\n2. '],
    ['2) 全角，混排 punctuation!', '2) 全角，混排 punctuation!\n3) '],
    ['- [x] 完成 done 完成', '- [x] 完成 done 完成\n- [ ] '],
    ['  - 缩进 indented 中文', '  - 缩进 indented 中文\n  - '],
    ['中文 plain line no marker', '中文 plain line no marker\n'],
  ])('%s → Enter → %s', async (initial, expected) => {
    const { content, view, editor, host } = await mountEditor(editorModule, EditorView, initial)
    pressEnter(content)
    expect(view.state.doc.toString()).toBe(expected)
    editor.destroy()
    host.remove()
  })
})
