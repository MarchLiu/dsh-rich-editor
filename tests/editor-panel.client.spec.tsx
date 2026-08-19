// @vitest-environment jsdom
/** EditorPanel behavior: closed renders nothing; open mounts the CodeMirror
 * editor with the store draft; typing writes the store; submit sends through
 * the injected verb, then clears and closes on success or keeps the draft on
 * failure; close drops the panel without submitting. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { EditorView } from '@codemirror/view'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { EditorPanel, type EditorPanelProps } from '../src/client/EditorPanel.tsx'
import { createRichEditorStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh) as EditorPanelProps['t']

afterEach(cleanup)

function mount(over: { open?: boolean; text?: string; submit?: EditorPanelProps['submit'] } = {}) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createRichEditorStore().create()
  if (over.text !== undefined) store.actions.setText(over.text)
  store.actions.setOpen(over.open ?? true)
  const submit = over.submit ?? vi.fn<EditorPanelProps['submit']>(() => Promise.resolve(true))
  const props = {
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    submit,
    t,
  } as EditorPanelProps
  render(<EditorPanel {...props} />)
  return { store, submit }
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
