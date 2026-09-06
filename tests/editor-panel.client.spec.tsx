// @vitest-environment jsdom
/** EditorPanel behavior: closed renders nothing; open mounts the CodeMirror
 * editor with the store draft; typing writes the store; submit sends through
 * the injected verb, then clears and closes on success or keeps the draft on
 * failure; close drops the panel without submitting. The composer bridge
 * cases cover the open/close handoff and the live two-way mirror. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { makeTranslate } from './make-translate.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { EditorView } from '@codemirror/view'
import { EditorPanel, type EditorPanelProps } from '../src/client/EditorPanel.tsx'
import type { RichEditorComposerBridge } from '../src/client/slots.ts'
import { createRichEditorStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh) as EditorPanelProps['t']

afterEach(cleanup)

/** Fake native-composer bridge backed by a real snapshot store. */
function makeComposer(initial = ''): { bridge: RichEditorComposerBridge; setNative(text: string): void; getNative(): string } {
  const store = createSnapshotStore({ draft: initial })
  return {
    bridge: {
      getDraft: () => store.getSnapshot().draft,
      setDraft: (text: string) => { store.set({ draft: text }) },
      subscribe: (fn: () => void) => store.subscribe(fn),
    },
    setNative: (text: string) => { store.set({ draft: text }) },
    getNative: () => store.getSnapshot().draft,
  }
}

function mount(over: { open?: boolean; text?: string; submit?: EditorPanelProps['submit']; native?: string } = {}) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createRichEditorStore().create()
  if (over.text !== undefined) store.actions.setText(over.text)
  store.actions.setOpen(over.open ?? true)
  const submit = over.submit ?? vi.fn<EditorPanelProps['submit']>(() => Promise.resolve(true))
  const composer = makeComposer(over.native ?? '')
  const props = {
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    submit,
    composer: composer.bridge,
    t,
  } as EditorPanelProps
  render(<EditorPanel {...props} />)
  return { store, submit, composer }
}

/** Replace the editor document through the mounted CodeMirror view. */
function type(text: string) {
  const content = screen.getByLabelText('Markdown 笔记本编辑器')
  const host = content.closest('.cm-editor')
  if (!(host instanceof HTMLElement)) throw new Error('editor host not found')
  const view = EditorView.findFromDOM(host)
  if (view === null) throw new Error('editor view not found')
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  })
}

describe('EditorPanel', () => {
  it('renders nothing while the store is closed', () => {
    const store = createRichEditorStore().create()
    const { container } = render(<EditorPanel {...{
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      submit: vi.fn(),
      t,
    } as EditorPanelProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('open mounts the editor with the store draft restored', () => {
    mount({ text: '- 草稿内容' })
    expect(screen.getByLabelText('Markdown 笔记本编辑器').textContent).toContain('草稿内容')
  })

  it('submit sends the draft, then clears the store and closes the panel', async () => {
    const { store, submit } = mount({ text: '# 标题\n\n- 要点' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送笔记本内容' }))
    })
    expect(submit).toHaveBeenCalledWith('# 标题\n\n- 要点')
    expect(store.getSnapshot()).toEqual({ open: false, text: '' })
  })

  it('a failed submit keeps the panel open with the draft intact', async () => {
    const { store } = mount({ text: '- 保留我', submit: () => Promise.resolve(false) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送笔记本内容' }))
    })
    expect(store.getSnapshot()).toEqual({ open: true, text: '- 保留我' })
    expect(screen.getByLabelText('Markdown 笔记本编辑器')).toBeTruthy()
  })

  it('an empty draft submits nothing', async () => {
    const { submit } = mount({ text: '   ' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送笔记本内容' }))
    })
    expect(submit).not.toHaveBeenCalled()
  })

  it('close drops the panel and keeps the draft for the next open', async () => {
    const { store } = mount({ text: '- 待续' })
    fireEvent.click(screen.getByRole('button', { name: '关闭笔记本' }))
    expect(store.getSnapshot()).toEqual({ open: false, text: '- 待续' })
    expect(screen.queryByLabelText('Markdown 笔记本编辑器')).toBeNull()
  })

  it('typed edits flow into the store draft', () => {
    const { store } = mount()
    type('- 新内容')
    expect(store.getSnapshot().text).toContain('新内容')
  })

  it('split mode keeps the editor mounted and mirrors the draft live in the preview pane', () => {
    mount({ text: '# 标题\n' })
    fireEvent.click(screen.getByRole('tab', { name: '并列' }))
    const preview = screen.getByLabelText('预览渲染结果')
    expect(preview.innerHTML).toContain('<h1>标题</h1>')
    // The editor stays mounted (not hidden) beside the preview.
    const editor = screen.getByLabelText('Markdown 笔记本编辑器')
    expect(editor.closest('[hidden]')).toBeNull()
    // Typing keeps flowing to the store and the preview re-renders.
    type('## 追加\n')
    expect(preview.innerHTML).toContain('<h2>追加</h2>')
  })

  it('preview tab hides the editor host while keeping it mounted', () => {
    mount({ text: '- 仅预览\n' })
    fireEvent.click(screen.getByRole('tab', { name: '预览' }))
    const preview = screen.getByLabelText('预览渲染结果')
    expect(preview.innerHTML).toContain('仅预览')
    const editor = screen.getByLabelText('Markdown 笔记本编辑器')
    expect(editor.closest('[hidden]')).not.toBeNull()
  })

  it('Ctrl+Enter inside the editor submits the draft', async () => {
    const { store, submit } = mount({ text: '- 键盘提交' })
    const content = screen.getByLabelText('Markdown 笔记本编辑器')
    // jsdom reports a non-Mac platform, so CM's Mod modifier is Ctrl here.
    fireEvent.keyDown(content, { key: 'Enter', ctrlKey: true })
    await act(async () => {})
    expect(submit).toHaveBeenCalledWith('- 键盘提交')
    expect(store.getSnapshot()).toEqual({ open: false, text: '' })
  })
})

describe('EditorPanel composer bridge', () => {
  it('opening adopts a non-empty native draft into the notebook', () => {
    const { store, composer } = mount({ text: '- 旧草稿', native: '- 原生草稿' })
    expect(screen.getByLabelText('Markdown 笔记本编辑器').textContent).toContain('原生草稿')
    expect(store.getSnapshot().text).toBe('- 原生草稿')
    // The native draft itself is untouched by the adoption.
    expect(composer.getNative()).toBe('- 原生草稿')
  })

  it('opening with an empty composer pushes the kept notebook draft down', () => {
    const { composer } = mount({ text: '- 保留草稿', native: '' })
    expect(composer.getNative()).toBe('- 保留草稿')
    expect(screen.getByLabelText('Markdown 笔记本编辑器').textContent).toContain('保留草稿')
  })

  it('notebook edits mirror live into the native composer', () => {
    const { composer } = mount()
    type('- 镜像内容')
    expect(composer.getNative()).toBe('- 镜像内容')
  })

  it('native edits mirror live into the notebook', () => {
    const { store, composer } = mount({ text: '- 起点' })
    act(() => composer.setNative('- 起点\n- 原生新增'))
    expect(screen.getByLabelText('Markdown 笔记本编辑器').textContent).toContain('原生新增')
    expect(store.getSnapshot().text).toBe('- 起点\n- 原生新增')
    // The mirror is one-way per event: echoing back does not loop.
    expect(composer.getNative()).toBe('- 起点\n- 原生新增')
  })

  it('close leaves the final notebook text in the native composer', () => {
    const { composer } = mount()
    type('- 关闭前编辑')
    fireEvent.click(screen.getByRole('button', { name: '关闭笔记本' }))
    expect(screen.queryByLabelText('Markdown 笔记本编辑器')).toBeNull()
    expect(composer.getNative()).toBe('- 关闭前编辑')
  })

  it('a successful submit clears the native composer draft too', async () => {
    const { composer } = mount({ text: '- 发送' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送笔记本内容' }))
    })
    expect(composer.getNative()).toBe('')
  })

  it('a mirrored edit restores notebook focus when the composer steals it', () => {
    // Simulate the native composer's Lexical selectEnd: every draft write
    // yanks keyboard focus out of the notebook (what an Enter or IME commit
    // used to trigger, leaving the next Enter to send from the composer).
    const inner = makeComposer('')
    const bridge: RichEditorComposerBridge = {
      getDraft: inner.bridge.getDraft,
      setDraft: (text) => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        inner.bridge.setDraft(text)
      },
      subscribe: inner.bridge.subscribe,
    }
    const store = createRichEditorStore().create()
    store.actions.setOpen(true)
    render(<EditorPanel {...{
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      submit: vi.fn(() => Promise.resolve(true)),
      composer: bridge,
      t,
    } as EditorPanelProps} />)
    const content = screen.getByLabelText('Markdown 笔记本编辑器')
    act(() => { content.focus() })
    type('- 焦点保持')
    expect(inner.bridge.getDraft()).toBe('- 焦点保持')
    expect(content.contains(document.activeElement)).toBe(true)
  })
})

describe('EditorPanel mixed Chinese/English and IME compatibility', () => {
  /** The live CodeMirror view behind the mounted notebook editor. */
  function notebookView(): EditorView {
    const content = screen.getByLabelText('Markdown 笔记本编辑器')
    const host = content.closest('.cm-editor')
    if (!(host instanceof HTMLElement)) throw new Error('editor host not found')
    const view = EditorView.findFromDOM(host)
    if (view === null) throw new Error('editor view not found')
    return view
  }

  /** Dispatch a real Enter keydown at the notebook caret. */
  function pressNotebookEnter() {
    screen.getByLabelText('Markdown 笔记本编辑器').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  }

  it('a mixed Chinese/English draft mirrors both ways and stays in sync', () => {
    const { composer } = mount()
    type('输入 input，混排 mixed 中文 english')
    expect(composer.getNative()).toBe('输入 input，混排 mixed 中文 english')
    act(() => composer.setNative('输入 input，混排 mixed 中文 english 追加 appended'))
    expect(screen.getByLabelText('Markdown 笔记本编辑器').textContent).toContain('追加 appended')
    // Both surfaces agree after the round-trip.
    expect(composer.getNative()).toBe('输入 input，混排 mixed 中文 english 追加 appended')
  })

  it('Enter in the notebook continues a mixed list without touching the send path', () => {
    const { store, composer, submit } = mount({ text: '- 输入english' })
    const view = notebookView()
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.length } }) })
    pressNotebookEnter()
    expect(store.getSnapshot().text).toBe('- 输入english\n- ')
    expect(composer.getNative()).toBe('- 输入english\n- ')
    expect(submit).not.toHaveBeenCalled()
  })

  it('an open IME composition leaves the native draft untouched; commit mirrors once', async () => {
    const { composer } = mount({ text: '- 输入english' })
    const content = screen.getByLabelText('Markdown 笔记本编辑器')
    const view = notebookView()
    act(() => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      ;(view as unknown as { inputState: { composing: number } }).inputState.composing = 1
      view.dispatch({ changes: { from: view.state.doc.length, insert: 'shuru' } })
    })
    // Pinyin fragments never reach the native composer mid-composition.
    expect(composer.getNative()).toBe('- 输入english')

    const doc = view.state.doc.toString()
    act(() => {
      view.dispatch({ changes: { from: doc.length - 5, to: doc.length, insert: '输入' } })
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '输入' }))
    })
    // The flush defers one frame; the native composer receives the final
    // document exactly once.
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    expect(composer.getNative()).toBe('- 输入english输入')
  })

  it('focus stays in the notebook across Enter on a mixed draft', () => {
    const inner = makeComposer('')
    const bridge: RichEditorComposerBridge = {
      getDraft: inner.bridge.getDraft,
      setDraft: (text) => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        inner.bridge.setDraft(text)
      },
      subscribe: inner.bridge.subscribe,
    }
    const store = createRichEditorStore().create()
    store.actions.setOpen(true)
    render(<EditorPanel {...{
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      submit: vi.fn(() => Promise.resolve(true)),
      composer: bridge,
      t,
    } as EditorPanelProps} />)
    const content = screen.getByLabelText('Markdown 笔记本编辑器')
    act(() => { content.focus() })
    type('- 混排 mixed')
    // The whole-doc replace leaves the caret where the empty doc had it (0);
    // park it at the end like a real typist's caret before pressing Enter.
    const view = notebookView()
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.length } }) })
    pressNotebookEnter()
    expect(content.contains(document.activeElement)).toBe(true)
    expect(inner.bridge.getDraft()).toBe('- 混排 mixed\n- ')
  })
})
